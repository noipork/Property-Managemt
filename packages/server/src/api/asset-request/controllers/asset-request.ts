/**
 * asset-request controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::asset-request.asset-request', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const response = await super.create(ctx)

    if (response?.data) {
      const request = response.data

      // Fetch full record with relations
      const records = await strapi.documents('api::asset-request.asset-request').findMany({
        filters: { documentId: { $eq: request.documentId } },
        populate: {
          asset: { fields: ['documentId', 'name', 'price'] },
          resident: { fields: ['documentId', 'username'] },
          property: { fields: ['documentId', 'name'] },
        },
      })
      const record = records?.[0]
      const propertyId = record?.property?.documentId

      if (propertyId) {
        // Notify all managers of this property
        const managers = await strapi.documents('plugin::users-permissions.user').findMany({
          filters: {
            role: { id: { $eq: 3 } },
            property: { documentId: { $eq: propertyId } },
          },
          fields: ['documentId'],
        })

        const recipientIds = managers
          .map((m) => m.documentId)
          .filter((id): id is string => Boolean(id))

        if (recipientIds.length > 0) {
          try {
            await strapi.service('api::notification.notification').notifyMany({
              title: 'New asset request',
              message: `${record.resident?.username || 'A resident'} requested asset: ${record.asset?.name || 'Unknown'}`,
              type: 'asset',
              priority: 'normal',
              relatedDocumentId: record.documentId,
              actionUrl: `/manager/asset-requests/${record.documentId}`,
              metadata: {
                assetName: record.asset?.name,
                assetPrice: record.asset?.price,
                propertyName: record.property?.name,
              },
              recipientIds,
              senderId: user.documentId,
              propertyId,
            })
          } catch (err) {
            strapi.log.error('[Notification] Failed to notify managers for asset request create:', err)
          }
        }
      }
    }

    return response
  },

  async update(ctx) {
    const user = ctx.state.user
    const { id: documentId } = ctx.params
    const updateData = ctx.request.body?.data ?? {}

    // Fetch current record before update
    const beforeRecords = await strapi.documents('api::asset-request.asset-request').findMany({
      filters: { documentId: { $eq: documentId } },
      populate: {
        asset: { fields: ['documentId', 'name', 'price', 'currency'] },
        resident: { fields: ['documentId', 'username', 'id'] },
        property: { fields: ['documentId', 'name'] },
      },
    })
    const beforeRecord = beforeRecords?.[0]
    const oldStatus = beforeRecord?.status

    const response = await super.update(ctx)

    const newStatus = updateData.status
    if (newStatus && oldStatus !== newStatus && beforeRecord?.resident?.documentId) {
      if ((newStatus === 'approved' || newStatus === 'rejected') && user?.documentId) {
        try {
          const managerNotifications = await strapi.documents('api::notification.notification').findMany({
            filters: {
              type: { $eq: 'asset' },
              relatedDocumentId: { $eq: documentId },
              recipients: { documentId: { $eq: user.documentId } },
              isRead: false,
            },
            fields: ['documentId'],
            limit: -1,
          })

          if (managerNotifications.length > 0) {
            const readAt = new Date().toISOString()
            await Promise.all(
              managerNotifications.map((notification) =>
                strapi.documents('api::notification.notification').update({
                  documentId: notification.documentId,
                  data: {
                    isRead: true,
                    readAt,
                  },
                })
              )
            )
          }
        } catch (err) {
          strapi.log.error('[Notification] Failed to mark manager asset-request notifications as read:', err)
        }
      }

      const residentDocId = beforeRecord.resident.documentId

      if (newStatus === 'approved') {
        // Notify the resident
        try {
          await strapi.service('api::notification.notification').createAndNotify({
            title: 'Asset request approved',
            message: `Your request for "${beforeRecord.asset?.name || 'asset'}" has been approved. It will be added to your next bill.`,
            type: 'asset',
            priority: 'high',
            relatedDocumentId: documentId,
            actionUrl: `/resident/assets`,
            metadata: {
              assetName: beforeRecord.asset?.name,
              assetPrice: beforeRecord.asset?.price,
              requestDocumentId: documentId,
            },
            recipientId: residentDocId,
            senderId: user?.documentId,
            propertyId: beforeRecord.property?.documentId,
          })
        } catch (err) {
          strapi.log.error('[Notification] Failed to notify resident for asset request approval:', err)
        }
      } else if (newStatus === 'rejected') {
        // Notify the resident
        try {
          await strapi.service('api::notification.notification').createAndNotify({
            title: 'Asset request rejected',
            message: `Your request for "${beforeRecord.asset?.name || 'asset'}" was rejected.${updateData.rejectionReason ? ` Reason: ${updateData.rejectionReason}` : ''}`,
            type: 'asset',
            priority: 'normal',
            relatedDocumentId: documentId,
            actionUrl: `/resident/assets`,
            metadata: {
              assetName: beforeRecord.asset?.name,
              rejectionReason: updateData.rejectionReason,
              requestDocumentId: documentId,
            },
            recipientId: residentDocId,
            senderId: user?.documentId,
            propertyId: beforeRecord.property?.documentId,
          })
        } catch (err) {
          strapi.log.error('[Notification] Failed to notify resident for asset request rejection:', err)
        }
      }
    }

    return response
  },
}))
