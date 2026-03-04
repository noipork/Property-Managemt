/**
 * notification controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::notification.notification', ({ strapi }) => ({
  /**
   * Mark a single notification as read
   */
  async markAsRead(ctx) {
    const { id } = ctx.params
    const user = ctx.state.user

    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const records = await strapi.documents('api::notification.notification').findMany({
      filters: {
        documentId: { $eq: id },
        recipients: { documentId: { $eq: user.documentId } },
      },
    })

    const notification = records?.[0]
    if (!notification) {
      return ctx.notFound('Notification not found')
    }

    const updated = await strapi.documents('api::notification.notification').update({
      documentId: id,
      data: {
        isRead: true,
        readAt: new Date().toISOString(),
      },
    })

    return { data: updated }
  },

  /**
   * Mark all notifications as read for the current user
   */
  async markAllAsRead(ctx) {
    const user = ctx.state.user

    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const unreadNotifications = await strapi.documents('api::notification.notification').findMany({
      filters: {
        recipients: { documentId: { $eq: user.documentId } },
        isRead: false,
      },
      limit: -1,
    })

    const now = new Date().toISOString()
    const updatePromises = unreadNotifications.map((n) =>
      strapi.documents('api::notification.notification').update({
        documentId: n.documentId,
        data: {
          isRead: true,
          readAt: now,
        },
      })
    )

    await Promise.all(updatePromises)

    return { data: { message: 'All notifications marked as read', count: unreadNotifications.length } }
  },

  /**
   * Get unread notification count for the current user
   */
  async unreadCount(ctx) {
    const user = ctx.state.user

    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const count = await strapi.documents('api::notification.notification').count({
      filters: {
        recipients: { documentId: { $eq: user.documentId } },
        isRead: false,
      },
    })

    return { data: { count } }
  },

  /**
   * Delete all read notifications for the current user
   */
  async clearRead(ctx) {
    const user = ctx.state.user

    if (!user) {
      return ctx.unauthorized('You must be logged in')
    }

    const readNotifications = await strapi.documents('api::notification.notification').findMany({
      filters: {
        recipients: { documentId: { $eq: user.documentId } },
        isRead: true,
      },
      limit: -1,
    })

    const deletePromises = readNotifications.map((n) =>
      strapi.documents('api::notification.notification').delete({
        documentId: n.documentId,
      })
    )

    await Promise.all(deletePromises)

    return { data: { message: 'Read notifications cleared', count: readNotifications.length } }
  },
}))
