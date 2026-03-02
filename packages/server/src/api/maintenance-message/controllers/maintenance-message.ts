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
}))
