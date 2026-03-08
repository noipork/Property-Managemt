/**
 * maintenance controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::maintenance.maintenance', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    // Create the maintenance request
    const response = await super.create(ctx)

    if (response?.data) {
      const maintenance = response.data

      // Fetch full record with property/resident for notifications
      const records = await strapi.documents('api::maintenance.maintenance').findMany({
        filters: { documentId: { $eq: maintenance.documentId } },
        populate: {
          property: { fields: ['documentId', 'name'] },
          resident: { fields: ['documentId', 'username'] },
        },
      })
      const record = records?.[0]
      const propertyId = record?.property?.documentId

      if (propertyId) {
        // Find managers assigned to this property (role id 3)
        const managers = await strapi.documents('plugin::users-permissions.user').findMany({
          filters: {
            role: { id: { $eq: 3 } },
            property: { documentId: { $eq: propertyId } },
          },
          fields: ['documentId', 'username', 'email'],
        })

        const recipientIds = managers
          .map((m) => m.documentId)
          .filter((id): id is string => Boolean(id))

        if (recipientIds.length > 0) {
          try {
            await strapi.service('api::notification.notification').notifyMany({
              title: record.requestNumber
                ? `New maintenance request ${record.requestNumber}`
                : 'New maintenance request',
              message: record.title || 'A new maintenance request was created',
              type: 'maintenance',
              priority: 'normal',
              relatedDocumentId: record.documentId,
              actionUrl: `/manager/maintenance/${record.documentId}`,
              metadata: {
                status: record.status,
                priority: record.priority,
                propertyName: record.property?.name,
              },
              recipientIds,
              senderId: user.documentId,
              propertyId,
            })
          } catch (err) {
            strapi.log.error('[Notification] Failed to notify managers for maintenance create:', err)
          }
        }
      }
    }

    return response
  },

  async update(ctx) {
    const user = ctx.state.user;
    const { id: documentId } = ctx.params;
    const updateData = ctx.request.body?.data ?? {};

    // Fetch the current record to compare status
    const beforeRecords = await strapi.documents('api::maintenance.maintenance').findMany({
      filters: { documentId: { $eq: documentId } },
      populate: {
        resident: { fields: ['documentId', 'username'] },
        property: { fields: ['documentId', 'name'] },
      },
    });
    const beforeRecord = beforeRecords?.[0];
    const oldStatus = beforeRecord?.status;

    // Delegate to the default core update
    const response = await super.update(ctx);

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io;
    if (io && response?.data) {
      const maintenance = response.data;

      // Fetch full maintenance with resident to notify them
      const records = await strapi.documents('api::maintenance.maintenance').findMany({
        filters: { documentId: { $eq: documentId } },
        populate: {
          resident: { fields: ['documentId', 'username'] },
          property: { fields: ['documentId', 'name'] },
        },
      });
      const record = records?.[0];

      // Emit to the maintenance room (anyone viewing the detail page)
      io.to(`maintenance:${documentId}`).emit('maintenance-updated', {
        maintenanceDocumentId: documentId,
        status: maintenance.status,
        updatedFields: updateData,
      });

      // Also notify the resident's personal room (for list page updates)
      if (record?.resident?.documentId) {
        io.to(`user:${record.resident.documentId}`).emit('maintenance-updated', {
          maintenanceDocumentId: documentId,
          status: maintenance.status,
          updatedFields: updateData,
        });
      }

      // ─── Create notification if status changed ────────────────────────
      const newStatus = updateData.status;
      if (newStatus && oldStatus !== newStatus && record?.resident?.documentId) {
        // Check if resident is viewing the maintenance detail page
        const maintenanceRoom = io.sockets.adapter.rooms.get(`maintenance:${documentId}`);
        const residentInRoom = maintenanceRoom && (() => {
          const userSockets = io.sockets.adapter.rooms.get(`user:${record.resident.documentId}`);
          if (!userSockets) return false;
          for (const socketId of userSockets) {
            if (maintenanceRoom.has(socketId)) return true;
          }
          return false;
        })();

        // Only create notification if resident is NOT viewing the detail page
        if (!residentInRoom) {
          const statusLabels: Record<string, string> = {
            pending: 'Pending',
            in_progress: 'In Progress',
            on_hold: 'On Hold',
            resolved: 'Resolved',
            cancelled: 'Cancelled',
          };

          try {
            await strapi.service('api::notification.notification').createAndNotify({
              title: `Maintenance ${record.requestNumber || 'request'} status updated`,
              message: `Status changed to: ${statusLabels[newStatus] || newStatus}`,
              type: 'maintenance',
              priority: newStatus === 'resolved' ? 'high' : 'normal',
              relatedDocumentId: documentId,
              actionUrl: `/resident/maintenance/${documentId}`,
              metadata: {
                maintenanceDocumentId: documentId,
                requestNumber: record.requestNumber,
                oldStatus,
                newStatus,
                propertyName: record.property?.name,
              },
              recipientId: record.resident.documentId,
              senderId: user?.documentId,
              propertyId: record.property?.documentId,
            });
          } catch (err) {
            strapi.log.error('[Notification] Failed to notify resident for status update:', err);
          }
        }
      }
    }

    return response;
  },
}))
