/**
 * payment controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
	async create(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const response = await super.create(ctx)

		if (response?.data) {
			try {
				const records = await strapi.documents('api::payment.payment').findMany({
					filters: { documentId: { $eq: response.data.documentId } },
					populate: {
						resident: { fields: ['documentId', 'username', 'email'] },
						property: { fields: ['documentId', 'name'] },
						billing: { fields: ['documentId', 'invoiceNo'] },
					},
				})

				const record = records?.[0]
				const propertyDocumentId = record?.property?.documentId

				if (record && propertyDocumentId) {
					const paidDate = record.date
						? new Date(record.date).toLocaleDateString('en-GB', {
								day: '2-digit',
								month: 'short',
								year: 'numeric',
							})
						: ''

					const amount = record.amount ?? 0
					const currency = record.currency || 'THB'
					const formattedAmount = new Intl.NumberFormat('en-US', {
						style: 'currency',
						currency,
					}).format(Number(amount))

					const residentName = record.resident?.username || 'Resident'
					const title = record.refNo ? `Payment submitted: ${record.refNo}` : 'New payment submitted'
					const messageParts = [`${residentName} submitted ${formattedAmount}`]
					if (paidDate) messageParts.push(`on ${paidDate}`)
					if (record.billing?.invoiceNo) messageParts.push(`for invoice ${record.billing.invoiceNo}`)
					const message = messageParts.join(' ')

					// Notify managers of this property (role id 3)
					const managers = await strapi.documents('plugin::users-permissions.user').findMany({
						filters: {
							role: { id: { $eq: 3 } },
							property: { documentId: { $eq: propertyDocumentId } },
						},
						fields: ['documentId'],
					})

					const recipientIds = managers
						.map((m) => m.documentId)
						.filter((id): id is string => Boolean(id))

					if (recipientIds.length > 0) {
						await strapi.service('api::notification.notification').notifyMany({
							title,
							message,
							type: 'payment',
							priority: 'high',
							relatedDocumentId: record.documentId,
							actionUrl: `/manager/payments/${record.documentId}`,
							metadata: {
								refNo: record.refNo,
								amount: record.amount,
								currency: record.currency,
								date: record.date,
								status: record.status,
								billingInvoiceNo: record.billing?.invoiceNo,
								propertyName: record.property?.name,
								residentUsername: record.resident?.username,
							},
							recipientIds,
							senderId: user.documentId,
							propertyId: propertyDocumentId,
						})
					}
				}
			} catch (err) {
				strapi.log.error('[Notification] Failed to notify resident for payment creation:', err)
			}
		}

		return response
	},

	async update(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const { id: documentId } = ctx.params

		// Fetch old payment to compare status
		const oldRecords = await strapi.documents('api::payment.payment').findMany({
			filters: { documentId: { $eq: documentId } },
			populate: {
				resident: { fields: ['documentId', 'username', 'email'] },
				property: { fields: ['documentId', 'name'] },
				billing: { fields: ['documentId', 'invoiceNo'] },
			},
		})
		const oldPayment = oldRecords?.[0]

		const response = await super.update(ctx)

		if (response?.data && oldPayment?.resident?.documentId) {
			const newPayment = response.data
			if (oldPayment.status !== newPayment.status) {
				try {
					const statusLabels: Record<string, string> = {
						pending: 'Pending',
						reviewing: 'Reviewing',
						completed: 'Completed',
						failed: 'Failed',
						refunded: 'Refunded',
					}

					const statusMessages: Record<string, string> = {
						pending: 'Your payment is pending.',
						reviewing: 'Your payment is under review.',
						completed: 'Your payment has been completed.',
						failed: 'Your payment has failed.',
						refunded: 'Your payment has been refunded.',
					}

					const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
						pending: 'normal',
						reviewing: 'normal',
						completed: 'high',
						failed: 'high',
						refunded: 'high',
					}

					const title = newPayment.refNo
						? `Payment ${newPayment.refNo} status: ${statusLabels[newPayment.status] || newPayment.status}`
						: `Payment status: ${statusLabels[newPayment.status] || newPayment.status}`
					const message =
						statusMessages[newPayment.status] ||
						`Status changed from ${statusLabels[oldPayment.status] || oldPayment.status} to ${
							statusLabels[newPayment.status] || newPayment.status
						}`

					await strapi.service('api::notification.notification').createAndNotify({
						title,
						message,
						type: 'payment',
						priority: priorityMap[newPayment.status] || 'normal',
						relatedDocumentId: newPayment.documentId,
						actionUrl: '/resident/payment-history',
						metadata: {
							refNo: newPayment.refNo || oldPayment.refNo,
							amount: newPayment.amount ?? oldPayment.amount,
							currency: newPayment.currency || oldPayment.currency,
							date: newPayment.date || oldPayment.date,
							oldStatus: oldPayment.status,
							newStatus: newPayment.status,
							billingInvoiceNo: newPayment.billing?.invoiceNo || oldPayment.billing?.invoiceNo,
							propertyName: oldPayment.property?.name,
						},
						recipientId: oldPayment.resident.documentId,
						senderId: user.documentId,
						propertyId: oldPayment.property?.documentId,
					})
				} catch (err) {
					strapi.log.error('[Notification] Failed to notify resident for payment status update:', err)
				}
			}
		}

		return response
	},
}))
