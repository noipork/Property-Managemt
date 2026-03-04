/**
 * message controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::message.message', ({ strapi }) => ({
  /**
   * Override find to auto-mark messages as read when fetched by the recipient.
   * When a user fetches messages for a specific conversation, any unread messages
   * from other users are automatically marked as read.
   */
  async find(ctx) {
    const user = ctx.state.user

    // Call the default find first
    const response = await super.find(ctx)

    // Auto-mark as read: if filtering by a specific conversation, mark unread messages from others as read
    if (user && ctx.query?.filters) {
      const filters = ctx.query.filters as any
      const conversationDocumentId =
        filters?.conversation?.documentId?.['$eq'] || null

      if (conversationDocumentId) {
        // Find unread messages in this conversation NOT sent by the current user
        const unreadMessages = await strapi.documents('api::message.message').findMany({
          filters: {
            conversation: { documentId: { $eq: conversationDocumentId } },
            sender: { documentId: { $ne: user.documentId } },
            isRead: { $eq: false },
          },
        })

        if (unreadMessages && unreadMessages.length > 0) {
          const now = new Date().toISOString()
          for (const msg of unreadMessages) {
            await strapi.documents('api::message.message').update({
              documentId: msg.documentId,
              data: { isRead: true, readAt: now } as any,
            })
          }

          // Update the response data to reflect the read state
          if (response?.data) {
            for (const item of response.data as any[]) {
              if (item.sender?.documentId !== user.documentId) {
                item.isRead = true
                item.readAt = now
              }
            }
          }

          // Emit WebSocket event to notify participants
          const io = (strapi as any).io
          if (io) {
            const conversations = await strapi.documents('api::conversation.conversation').findMany({
              filters: { documentId: { $eq: conversationDocumentId } },
              populate: { participants: { fields: ['documentId'] } },
            })
            const conversation = conversations?.[0]
            if (conversation?.participants) {
              for (const participant of conversation.participants) {
                io.to(`user:${participant.documentId}`).emit('messages-read', {
                  conversationDocumentId,
                  readByDocumentId: user.documentId,
                  count: unreadMessages.length,
                })
              }
            }
          }
        }
      }
    }

    return response
  },

  /**
   * Mark all unread messages in a conversation as read for the current user.
   * POST /api/messages/mark-read
   * Body: { conversationDocumentId: string }
   */
  async markRead(ctx) {
    const user = ctx.state.user
    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const { conversationDocumentId } = ctx.request.body as { conversationDocumentId?: string }
    if (!conversationDocumentId) {
      return ctx.badRequest('conversationDocumentId is required')
    }

    // Find all unread messages in this conversation NOT sent by the current user
    const unreadMessages = await strapi.documents('api::message.message').findMany({
      filters: {
        conversation: { documentId: { $eq: conversationDocumentId } },
        sender: { documentId: { $ne: user.documentId } },
        isRead: { $eq: false },
      },
    })

    if (!unreadMessages || unreadMessages.length === 0) {
      return { data: { updatedCount: 0 } }
    }

    // Mark each as read
    const now = new Date().toISOString()
    for (const msg of unreadMessages) {
      await strapi.documents('api::message.message').update({
        documentId: msg.documentId,
        data: { isRead: true, readAt: now } as any,
      })
    }

    // Emit WebSocket event to notify the other participant(s)
    const io = (strapi as any).io
    if (io) {
      // Fetch conversation to get participants
      const conversations = await strapi.documents('api::conversation.conversation').findMany({
        filters: { documentId: { $eq: conversationDocumentId } },
        populate: { participants: { fields: ['documentId'] } },
      })
      const conversation = conversations?.[0]

      if (conversation?.participants) {
        for (const participant of conversation.participants) {
          io.to(`user:${participant.documentId}`).emit('messages-read', {
            conversationDocumentId,
            readByDocumentId: user.documentId,
            count: unreadMessages.length,
          })
        }
      }
    }

    return { data: { updatedCount: unreadMessages.length } }
  },

  async create(ctx) {
    const user = ctx.state.user
    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    // Inject sender from authenticated user so the client doesn't need to pass it
    if (ctx.request.body?.data) {
      ctx.request.body.data.sender = user.documentId
    }

    // Delegate to the default core create
    const response = await super.create(ctx)

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io
    if (io && response?.data) {
      const message = response.data
      const conversationDocumentId = ctx.request.body?.data?.conversation

      if (conversationDocumentId) {
        // Fetch the conversation to get participants and property
        const conversations = await strapi.documents('api::conversation.conversation').findMany({
          filters: { documentId: { $eq: conversationDocumentId } },
          populate: {
            participants: { fields: ['documentId', 'username', 'email'] },
            property: { fields: ['documentId', 'name'] },
          },
        })
        const conversation = conversations?.[0]

        // Emit to the conversation room
        io.to(`conversation:${conversationDocumentId}`).emit('new-message', {
          message: {
            id: message.id,
            documentId: message.documentId,
            content: message.content,
            createdAt: message.createdAt,
            isRead: message.isRead,
            isEdited: message.isEdited,
            sender: {
              id: user.id,
              documentId: user.documentId,
              username: user.username,
              email: user.email,
            },
            images: message.images ?? null,
          },
          conversationDocumentId,
        })

        // Also notify each participant's personal room (for conversation list updates)
        if (conversation?.participants) {
          // Get the set of socket IDs currently in the conversation room
          const conversationRoom = io.sockets.adapter.rooms.get(`conversation:${conversationDocumentId}`)

          for (const participant of conversation.participants) {
            io.to(`user:${participant.documentId}`).emit('conversation-updated', {
              conversationDocumentId,
              lastMessage: message.content,
              lastMessageAt: message.createdAt,
              senderDocumentId: user.documentId,
              senderUsername: user.username,
            })

            // Skip the sender — they don't need a notification for their own message
            if (participant.documentId === user.documentId) continue

            // Check if this participant has any socket in the conversation room
            let isInConversationRoom = false
            if (conversationRoom) {
              const participantSockets = io.sockets.adapter.rooms.get(`user:${participant.documentId}`)
              if (participantSockets) {
                for (const socketId of participantSockets) {
                  if (conversationRoom.has(socketId)) {
                    isInConversationRoom = true
                    break
                  }
                }
              }
            }

            // Only create a notification if the participant is NOT viewing the conversation
            if (!isInConversationRoom) {
              try {
                await strapi.service('api::notification.notification').createAndNotify({
                  title: `New message from ${user.username}`,
                  message: message.content.length > 100
                    ? message.content.substring(0, 100) + '...'
                    : message.content,
                  type: 'message',
                  priority: 'normal',
                  relatedDocumentId: conversationDocumentId,
                  actionUrl: `/messages`,
                  metadata: {
                    conversationDocumentId,
                    senderUsername: user.username,
                    senderDocumentId: user.documentId,
                  },
                  recipientId: participant.documentId,
                  senderId: user.documentId,
                  propertyId: conversation.property?.documentId,
                })
              } catch (err) {
                strapi.log.error(`[Notification] Failed to create message notification for ${participant.documentId}:`, err)
              }
            }
          }
        }
      }
    }

    return response
  },
}))
