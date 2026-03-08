/**
 * billing controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::billing.billing', ({ strapi }) => ({
	async create(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const response = await super.create(ctx)

		if (response?.data) {
			try {
				const records = await strapi.documents('api::billing.billing').findMany({
					filters: { documentId: { $eq: response.data.documentId } },
					populate: {
						resident: { fields: ['documentId', 'username', 'email'] },
						property: { fields: ['documentId', 'name'] },
					},
				})

				const record = records?.[0]
				const residentId = record?.resident?.documentId

				if (record && residentId) {
					// ── Update resident's nextBillDate to one month after this invoice's dueDate ──
					if (record.dueDate) {
						try {
							const due = new Date(record.dueDate)
							const nextBillDate = new Date(due.getFullYear(), due.getMonth() + 1, due.getDate())
							const residentRecord = await strapi.documents('plugin::users-permissions.user').findMany({
								filters: { documentId: { $eq: residentId } },
								fields: ['id'],
							})
							if (residentRecord?.[0]?.id) {
								await strapi.db.query('plugin::users-permissions.user').update({
									where: { id: residentRecord[0].id },
									data: { nextBillDate: nextBillDate.toISOString().split('T')[0] },
								})
							}
						} catch (err) {
							strapi.log.error('[Billing] Failed to update resident nextBillDate:', err)
						}
					}

					const dueDate = record.dueDate
						? new Date(record.dueDate).toLocaleDateString('en-GB', {
								day: '2-digit',
								month: 'short',
								year: 'numeric',
							})
						: ''

					const title = record.invoiceNo ? `New invoice ${record.invoiceNo}` : 'New invoice'
					const message = dueDate ? `Due on ${dueDate}` : 'A new invoice has been issued'

					await strapi.service('api::notification.notification').createAndNotify({
						title,
						message,
						type: 'billing',
						priority: 'high',
						relatedDocumentId: record.documentId,
						actionUrl: '/resident/my-bills',
						metadata: {
							invoiceNo: record.invoiceNo,
							amount: record.amount,
							currency: record.currency,
							dueDate: record.dueDate,
							status: record.status,
							propertyName: record.property?.name,
						},
						recipientId: residentId,
						senderId: user.documentId,
						propertyId: record.property?.documentId,
					})
				}
			} catch (err) {
				strapi.log.error('[Notification] Failed to notify resident for billing creation:', err)
			}
		}

		return response
	},

	async update(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const { id: documentId } = ctx.params

		// Get old record to compare status
		const oldRecords = await strapi.documents('api::billing.billing').findMany({
			filters: { documentId: { $eq: documentId } },
			populate: {
				resident: { fields: ['documentId', 'username', 'email'] },
				property: { fields: ['documentId', 'name'] },
			},
		})
		const oldRecord = oldRecords?.[0]

		const response = await super.update(ctx)

		if (response?.data && oldRecord?.resident?.documentId) {
			const newRecord = response.data
			if (oldRecord.status !== newRecord.status) {
				try {
					const statusLabels: Record<string, string> = {
						pending: 'Pending',
						paid: 'Paid',
						overdue: 'Overdue',
						partiallyPaid: 'Partially Paid',
						cancelled: 'Cancelled',
					}

					const statusMessages: Record<string, string> = {
						pending: 'Your invoice is pending.',
						paid: 'Your invoice has been marked as paid.',
						overdue: 'Your invoice is overdue.',
						partiallyPaid: 'Your invoice is partially paid.',
						cancelled: 'Your invoice has been cancelled.',
					}

					const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
						pending: 'normal',
						paid: 'high',
						overdue: 'high',
						partiallyPaid: 'normal',
						cancelled: 'normal',
					}

					const title = newRecord.invoiceNo
						? `Invoice ${newRecord.invoiceNo} status: ${statusLabels[newRecord.status] || newRecord.status}`
						: `Invoice status: ${statusLabels[newRecord.status] || newRecord.status}`
					const message =
						statusMessages[newRecord.status] ||
						`Status changed from ${statusLabels[oldRecord.status] || oldRecord.status} to ${
							statusLabels[newRecord.status] || newRecord.status
						}`

					await strapi.service('api::notification.notification').createAndNotify({
						title,
						message,
						type: 'billing',
						priority: priorityMap[newRecord.status] || 'normal',
						relatedDocumentId: newRecord.documentId,
						actionUrl: '/resident/my-bills',
						metadata: {
							invoiceNo: newRecord.invoiceNo || oldRecord.invoiceNo,
							amount: newRecord.amount ?? oldRecord.amount,
							currency: newRecord.currency || oldRecord.currency,
							dueDate: newRecord.dueDate || oldRecord.dueDate,
							oldStatus: oldRecord.status,
							newStatus: newRecord.status,
							propertyName: oldRecord.property?.name,
						},
						recipientId: oldRecord.resident.documentId,
						senderId: user.documentId,
						propertyId: oldRecord.property?.documentId,
					})
				} catch (err) {
					strapi.log.error('[Notification] Failed to notify resident for billing status update:', err)
				}
			}
		}

		return response
	},
}))
