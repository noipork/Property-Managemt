/**
 * conversation controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::conversation.conversation', ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user

    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    // Get all conversations
    const { results, pagination } = await strapi.service('api::conversation.conversation').find({
      ...ctx.query,
      populate: {
        participants: {
          fields: ['username', 'email', 'roomNumber'],
        },
        property: {
          fields: ['name'],
        },
      },
    })

    // Filter conversations where the current user is a participant
    const userConversations = results.filter((conversation: any) => {
      const participants = conversation.participants || []
      return participants.some((p: any) => p.documentId === user.documentId)
    })

    // Count unread messages per conversation for the current user
    for (const conv of userConversations) {
      const unreadMessages = await strapi.documents('api::message.message').findMany({
        filters: {
          conversation: { documentId: { $eq: conv.documentId } },
          sender: { documentId: { $ne: user.documentId } },
          isRead: { $eq: false },
        },
      })
      ;(conv as any).unreadCount = unreadMessages?.length ?? 0
    }

    return {
      data: userConversations,
      meta: {
        pagination,
      },
    }
  },

  async create(ctx) {
    const user = ctx.state.user
    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    // Delegate to the default core create
    const response = await super.create(ctx)

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io
    if (io && response?.data) {
      const conversation = response.data
      const participantDocIds = ctx.request.body?.data?.participants as string[] | undefined

      if (participantDocIds && participantDocIds.length > 0) {
        // Notify each participant about the new conversation
        for (const docId of participantDocIds) {
          io.to(`user:${docId}`).emit('conversation-created', {
            conversationDocumentId: conversation.documentId,
            createdBy: {
              documentId: user.documentId,
              username: user.username,
            },
          })
        }
      }
    }

    return response
  },

  async delete(ctx) {
    const user = ctx.state.user
    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const { id: documentId } = ctx.params

    // Fetch conversation participants before deleting
    const conversations = await strapi.documents('api::conversation.conversation').findMany({
      filters: { documentId: { $eq: documentId } },
      populate: { participants: { fields: ['documentId', 'username'] } },
    })
    const conversation = conversations?.[0]
    const participants = conversation?.participants ?? []

    // Delegate to the default core delete
    const response = await super.delete(ctx)

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io
    if (io && participants.length > 0) {
      for (const participant of participants) {
        io.to(`user:${participant.documentId}`).emit('conversation-deleted', {
          conversationDocumentId: documentId,
          deletedBy: {
            documentId: user.documentId,
            username: user.username,
          },
        })
      }
    }

    return response
  },
}))
