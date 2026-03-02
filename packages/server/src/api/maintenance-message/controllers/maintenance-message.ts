/**
 * maintenance-message controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::maintenance-message.maintenance-message', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    // Inject sender from authenticated user and ensure isRead is false by default
    if (ctx.request.body?.data) {
      ctx.request.body.data.sender = user.documentId;
      ctx.request.body.data.isRead = false;
      ctx.request.body.data.readAt = null;
    }

    // Delegate to the default core create
    const response = await super.create(ctx);

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io;
    if (io && response?.data) {
      const message = response.data;
      const maintenanceDocumentId = ctx.request.body?.data?.maintenance;

      if (maintenanceDocumentId) {
        // Fetch maintenance to get the resident for personal room notification
        const records = await strapi.documents('api::maintenance.maintenance').findMany({
          filters: { documentId: { $eq: maintenanceDocumentId } },
          populate: {
            resident: { fields: ['documentId', 'username'] },
            property: { fields: ['documentId', 'name'] },
          },
        });
        const maintenance = records?.[0];

        const messagePayload = {
          id: message.id,
          documentId: message.documentId,
          message: message.message,
          createdAt: message.createdAt,
          isInternal: message.isInternal,
          isRead: message.isRead,
          sender: {
            id: user.id,
            documentId: user.documentId,
            username: user.username,
            email: user.email,
          },
          images: message.images ?? null,
        };

        // Emit to the maintenance room (anyone viewing the detail page)
        io.to(`maintenance:${maintenanceDocumentId}`).emit('new-maintenance-message', {
          maintenanceDocumentId,
          message: messagePayload,
        });

        // Also notify the resident's personal room if the sender is not the resident
        if (maintenance?.resident?.documentId && maintenance.resident.documentId !== user.documentId) {
          io.to(`user:${maintenance.resident.documentId}`).emit('new-maintenance-message', {
            maintenanceDocumentId,
            message: messagePayload,
          });
        }
      }
    }

    return response;
  },

  /**
   * Mark all unread maintenance messages as read for the current user.
   * POST /api/maintenance-messages/mark-read
   * Body: { maintenanceDocumentId: string }
   */
  async markRead(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { maintenanceDocumentId } = ctx.request.body as { maintenanceDocumentId?: string };
    if (!maintenanceDocumentId) {
      return ctx.badRequest('maintenanceDocumentId is required');
    }

    // Find unread messages for this maintenance not sent by the current user
    const unreadMessages = await strapi.documents('api::maintenance-message.maintenance-message').findMany({
      filters: {
        maintenance: { documentId: { $eq: maintenanceDocumentId } },
        sender: { documentId: { $ne: user.documentId } },
        isRead: { $eq: false },
      },
    });

    if (!unreadMessages || unreadMessages.length === 0) {
      return { data: { updatedCount: 0 } };
    }

    const now = new Date().toISOString();
    for (const msg of unreadMessages) {
      await strapi.documents('api::maintenance-message.maintenance-message').update({
        documentId: msg.documentId,
        data: { isRead: true, readAt: now } as any,
      });
    }

    // Notify via WebSocket so other viewers can update unread counts
    const io = (strapi as any).io;
    if (io) {
      // Fetch maintenance to identify resident for personal room
      const records = await strapi.documents('api::maintenance.maintenance').findMany({
        filters: { documentId: { $eq: maintenanceDocumentId } },
        populate: { resident: { fields: ['documentId'] } },
      });
      const maintenance = records?.[0];

      const payload = {
        maintenanceDocumentId,
        readByDocumentId: user.documentId,
        count: unreadMessages.length,
      };

      io.to(`maintenance:${maintenanceDocumentId}`).emit('maintenance-messages-read', payload);

      if (maintenance?.resident?.documentId) {
        io.to(`user:${maintenance.resident.documentId}`).emit('maintenance-messages-read', payload);
      }
    }

    return { data: { updatedCount: unreadMessages.length } };
  },
}))
