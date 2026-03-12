/**
 * notification service
 */

import { factories } from '@strapi/strapi'
import { webPush } from '../../../utils/webpush'

export default factories.createCoreService('api::notification.notification', ({ strapi }) => ({
  /**
   * Create a notification and emit it via WebSocket + Push Notification
   */
  async createAndNotify(data: {
    title: string
    message: string
    type: string
    priority?: string
    relatedDocumentId?: string
    actionUrl?: string
    metadata?: Record<string, any>
    recipientId: string
    senderId?: string
    propertyId?: string
  }) {
    const notificationData = {
      title: data.title,
      message: data.message,
      type: data.type as 'announcement' | 'billing' | 'payment' | 'lease' | 'maintenance' | 'message' | 'conversation' | 'property' | 'system' | 'asset',
      priority: (data.priority || 'normal') as 'low' | 'normal' | 'high' | 'urgent',
      isRead: false,
      relatedDocumentId: data.relatedDocumentId,
      actionUrl: data.actionUrl,
      metadata: data.metadata,
      recipients: [{ documentId: data.recipientId }],
      ...(data.senderId ? { sender: { documentId: data.senderId } } : {}),
      ...(data.propertyId ? { property: { documentId: data.propertyId } } : {}),
    }

    const notification = await strapi.documents('api::notification.notification').create({
      data: notificationData,
      populate: {
        recipients: { fields: ['documentId', 'username', 'email'] },
        sender: { fields: ['documentId', 'username'] },
        property: { fields: ['documentId', 'name'] },
      },
    })

    // Emit via WebSocket if available
    const io = (strapi as any).io
    if (io && data.recipientId) {
      io.to(`user:${data.recipientId}`).emit('notification', {
        id: notification.documentId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        relatedDocumentId: notification.relatedDocumentId,
        actionUrl: notification.actionUrl,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      })
    }

    // Send Web Push notification
    webPush.sendToUser(strapi, data.recipientId, {
      title: data.title,
      body: data.message,
      icon: '/logo.png',
      badge: '/logo.png',
      url: data.actionUrl || '/',
      tag: `${data.type}-${notification.documentId}`,
      data: {
        type: data.type,
        documentId: notification.documentId,
        relatedDocumentId: data.relatedDocumentId,
        actionUrl: data.actionUrl,
      },
    }).catch((err) => {
      strapi.log.warn(`[WebPush] Error sending push to ${data.recipientId}: ${err.message}`)
    })

    return notification
  },

  /**
   * Create a single notification for multiple recipients and emit via WebSocket + Push
   */
  async createAndNotifyMany(data: {
    title: string
    message: string
    type: string
    priority?: string
    relatedDocumentId?: string
    actionUrl?: string
    metadata?: Record<string, any>
    recipientIds: string[]
    senderId?: string
    propertyId?: string
  }) {
    if (data.recipientIds.length === 0) return null

    const notificationData = {
      title: data.title,
      message: data.message,
      type: data.type as 'announcement' | 'billing' | 'payment' | 'lease' | 'maintenance' | 'message' | 'conversation' | 'property' | 'system' | 'asset',
      priority: (data.priority || 'normal') as 'low' | 'normal' | 'high' | 'urgent',
      isRead: false,
      relatedDocumentId: data.relatedDocumentId,
      actionUrl: data.actionUrl,
      metadata: data.metadata,
      recipients: data.recipientIds.map(id => ({ documentId: id })),
      ...(data.senderId ? { sender: { documentId: data.senderId } } : {}),
      ...(data.propertyId ? { property: { documentId: data.propertyId } } : {}),
    }

    const notification = await strapi.documents('api::notification.notification').create({
      data: notificationData,
      populate: {
        recipients: { fields: ['documentId', 'username', 'email'] },
        sender: { fields: ['documentId', 'username'] },
        property: { fields: ['documentId', 'name'] },
      },
    })

    // Emit via WebSocket to all recipients
    const io = (strapi as any).io
    if (io) {
      const payload = {
        id: notification.documentId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        relatedDocumentId: notification.relatedDocumentId,
        actionUrl: notification.actionUrl,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      }

      data.recipientIds.forEach(recipientId => {
        io.to(`user:${recipientId}`).emit('notification', payload)
      })
    }

    // Send Web Push notification to all recipients
    webPush.sendToUsers(strapi, data.recipientIds, {
      title: data.title,
      body: data.message,
      icon: '/logo.png',
      badge: '/logo.png',
      url: data.actionUrl || '/',
      tag: `${data.type}-${notification.documentId}`,
      data: {
        type: data.type,
        documentId: notification.documentId,
        relatedDocumentId: data.relatedDocumentId,
        actionUrl: data.actionUrl,
      },
    }).catch((err) => {
      strapi.log.warn(`[WebPush] Error sending push to multiple users: ${err.message}`)
    })

    return notification
  },

  /**
   * Send notifications to multiple recipients
   */
  async notifyMany(data: {
    title: string
    message: string
    type: string
    priority?: string
    relatedDocumentId?: string
    actionUrl?: string
    metadata?: Record<string, any>
    recipientIds: string[]
    senderId?: string
    propertyId?: string
  }) {
    const promises = data.recipientIds.map((recipientId) =>
      this.createAndNotify({
        title: data.title,
        message: data.message,
        type: data.type,
        priority: data.priority,
        relatedDocumentId: data.relatedDocumentId,
        actionUrl: data.actionUrl,
        metadata: data.metadata,
        recipientId,
        senderId: data.senderId,
        propertyId: data.propertyId,
      })
    )

    return Promise.all(promises)
  },

  /**
   * Notify all residents of a property
   */
  async notifyPropertyResidents(data: {
    title: string
    message: string
    type: string
    priority?: string
    relatedDocumentId?: string
    actionUrl?: string
    metadata?: Record<string, any>
    propertyId: string
    senderId?: string
    excludeUserId?: string
  }) {
    // Find all residents for this property
    const residents = await strapi.documents('plugin::users-permissions.user').findMany({
      filters: {
        property: { documentId: { $eq: data.propertyId } },
        ...(data.excludeUserId ? { documentId: { $ne: data.excludeUserId } } : {}),
      },
      fields: ['documentId'],
    })

    const recipientIds = residents.map((r) => r.documentId)

    if (recipientIds.length === 0) return []

    return this.notifyMany({
      title: data.title,
      message: data.message,
      type: data.type,
      priority: data.priority,
      relatedDocumentId: data.relatedDocumentId,
      actionUrl: data.actionUrl,
      metadata: data.metadata,
      recipientIds,
      senderId: data.senderId,
      propertyId: data.propertyId,
    })
  },
}))
