/**
 * maintenance controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::maintenance.maintenance', ({ strapi }) => ({
  async update(ctx) {
    // Delegate to the default core update
    const response = await super.update(ctx);

    // ─── Emit WebSocket event ───────────────────────────────────────────
    const io = (strapi as any).io;
    if (io && response?.data) {
      const maintenance = response.data;
      const { id: documentId } = ctx.params;

      // Fetch full maintenance with resident to notify them
      const records = await strapi.documents('api::maintenance.maintenance').findMany({
        filters: { documentId: { $eq: documentId } },
        populate: {
          resident: { fields: ['documentId', 'username'] },
        },
      });
      const record = records?.[0];

      // Emit to the maintenance room (anyone viewing the detail page)
      io.to(`maintenance:${documentId}`).emit('maintenance-updated', {
        maintenanceDocumentId: documentId,
        status: maintenance.status,
        updatedFields: ctx.request.body?.data ?? {},
      });

      // Also notify the resident's personal room (for list page updates)
      if (record?.resident?.documentId) {
        io.to(`user:${record.resident.documentId}`).emit('maintenance-updated', {
          maintenanceDocumentId: documentId,
          status: maintenance.status,
          updatedFields: ctx.request.body?.data ?? {},
        });
      }
    }

    return response;
  },
}))
