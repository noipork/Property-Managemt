/**
 * announcement controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::announcement.announcement', ({ strapi }) => ({
	async create(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		// Create the announcement
		const response = await super.create(ctx)

		if (response?.data) {
			const announcement = response.data
			const propertyId = ctx.request.body?.data?.property || announcement?.property?.documentId

			if (propertyId) {
				try {
					// Fetch residents of the property (role id: 4)
					const residents = await strapi.documents('plugin::users-permissions.user').findMany({
						filters: {
							property: { documentId: { $eq: propertyId } },
							role: { id: { $eq: 4 } },
						},
						fields: ['documentId'],
					})

					const recipientIds = residents
						.map((r) => r.documentId)
						.filter((id): id is string => Boolean(id))

					if (recipientIds.length > 0) {
						const plainContent = (announcement.content || '')
							.replace(/<[^>]+>/g, ' ')
							.replace(/\s+/g, ' ')
							.trim()
						const preview = announcement.excerpt
							|| (plainContent ? `${plainContent.slice(0, 140)}${plainContent.length > 140 ? '…' : ''}` : 'New announcement')

						// Map announcement priority to notification priority enum
						const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
							normal: 'normal',
							important: 'high',
							urgent: 'urgent',
						}

						await strapi.service('api::notification.notification').createAndNotifyMany({
							title: announcement.title || 'New announcement',
							message: preview,
							type: 'announcement',
							priority: priorityMap[announcement.priority] || 'normal',
							relatedDocumentId: announcement.documentId,
							actionUrl: `/resident/announcements/${announcement.documentId}`,
							metadata: {
								category: announcement.category,
								priority: announcement.priority,
								status: announcement.status,
								propertyId,
							},
							recipientIds,
							senderId: user.documentId,
							propertyId,
						})
					}
				} catch (err) {
					strapi.log.error('[Notification] Failed to notify residents for announcement create:', err)
				}
			}
		}

		return response
	},
}))
