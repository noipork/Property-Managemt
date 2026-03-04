import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::lease.lease', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    // Create the lease
    const response = await super.create(ctx);

    if (response?.data) {
      const lease = response.data;

      // Fetch full lease with resident and property for notification
      const records = await strapi.documents('api::lease.lease').findMany({
        filters: { documentId: { $eq: lease.documentId } },
        populate: {
          resident: { fields: ['documentId', 'username'] },
          property: { fields: ['documentId', 'name'] },
        },
      });
      const record = records?.[0];

      if (record?.resident?.documentId) {
        try {
          const statusLabels: Record<string, string> = {
            pending: 'Pending',
            active: 'Active',
            expired: 'Expired',
            terminated: 'Terminated',
            cancelled: 'Cancelled',
          };

          const startDate = record.startDate ? new Date(record.startDate).toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
          }) : '';
          const endDate = record.endDate ? new Date(record.endDate).toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
          }) : '';

          const message = startDate && endDate 
            ? `Lease period: ${startDate} - ${endDate}` 
            : 'A new lease has been created for you';

          await strapi.service('api::notification.notification').createAndNotify({
            title: `New lease created: ${record.leaseNo || 'Lease Agreement'}`,
            message,
            type: 'lease',
            priority: 'high',
            relatedDocumentId: record.documentId,
            actionUrl: `/resident/my-lease`,
            metadata: {
              leaseNo: record.leaseNo,
              status: record.status,
              startDate: record.startDate,
              endDate: record.endDate,
              monthlyRent: record.monthlyRent,
              currency: record.currency,
              propertyName: record.property?.name,
            },
            recipientId: record.resident.documentId,
            senderId: user.documentId,
            propertyId: record.property?.documentId,
          });
        } catch (err) {
          strapi.log.error('[Notification] Failed to notify resident for lease creation:', err);
        }
      }
    }

    return response;
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const { id: documentId } = ctx.params;

    // Fetch old lease data to compare status
    const oldRecords = await strapi.documents('api::lease.lease').findMany({
      filters: { documentId: { $eq: documentId } },
      populate: {
        resident: { fields: ['documentId', 'username'] },
        property: { fields: ['documentId', 'name'] },
      },
    });
    const oldLease = oldRecords?.[0];

    // Update the lease
    const response = await super.update(ctx);

    if (response?.data && oldLease) {
      const newLease = response.data;

      // Check if status changed
      if (oldLease.status !== newLease.status && oldLease.resident?.documentId) {
        try {
          const statusLabels: Record<string, string> = {
            pending: 'Pending',
            reviewing: 'Under Review',
            active: 'Active',
            expired: 'Expired',
            terminated: 'Terminated',
            cancelled: 'Cancelled',
          };

          const statusMessages: Record<string, string> = {
            pending: 'Your lease has been returned to pending status',
            reviewing: 'Your lease is now under review by the manager',
            active: 'Your lease has been approved and is now active',
            expired: 'Your lease has expired',
            terminated: 'Your lease has been terminated',
            cancelled: 'Your lease has been cancelled',
          };

          const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
            pending: 'normal',
            reviewing: 'normal',
            active: 'high',
            expired: 'high',
            terminated: 'high',
            cancelled: 'normal',
          };

          const title = `Lease status updated: ${statusLabels[newLease.status] || newLease.status}`;
          const message = statusMessages[newLease.status] || `Lease status changed from ${statusLabels[oldLease.status] || oldLease.status} to ${statusLabels[newLease.status] || newLease.status}`;

          await strapi.service('api::notification.notification').createAndNotify({
            title,
            message,
            type: 'lease',
            priority: priorityMap[newLease.status] || 'normal',
            relatedDocumentId: newLease.documentId,
            actionUrl: `/resident/my-lease`,
            metadata: {
              leaseNo: newLease.leaseNo || oldLease.leaseNo,
              oldStatus: oldLease.status,
              newStatus: newLease.status,
              startDate: newLease.startDate || oldLease.startDate,
              endDate: newLease.endDate || oldLease.endDate,
              propertyName: oldLease.property?.name,
            },
            recipientId: oldLease.resident.documentId,
            senderId: user.documentId,
            propertyId: oldLease.property?.documentId,
          });
        } catch (err) {
          strapi.log.error('[Notification] Failed to notify resident for lease status update:', err);
        }
      }
    }

    return response;
  },
}));
