/**
 * billing controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::billing.billing', ({ strapi }) => ({

	/* ────────────────────────────────────────────────────────────
	 * GET /billings/pending-auto
	 * Returns residents whose nextBillDate <= today, with meter-read status.
	 * Query: ?propertyDocumentId=xxx  (optional filter)
	 * ──────────────────────────────────────────────────────────── */
	async pendingAuto(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const { propertyDocumentId } = ctx.query as { propertyDocumentId?: string }
		const today = new Date().toISOString().split('T')[0]

		try {
			// Build query to find residents (role 4) whose nextBillDate is due
			const knex = strapi.db.connection
			let query = knex('up_users as u')
				.join('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
				.where('rl.role_id', 4)
				.whereNotNull('u.next_bill_date')
				.where('u.next_bill_date', '<=', today)
				.where(function () {
					this.where('u.residency_status', 'active')
						.orWhere('u.residency_status', 'reserved')
				})
				.select(
					'u.id',
					'u.document_id as documentId',
					'u.username',
					'u.email',
					'u.room_number as roomNumber',
					'u.next_bill_date as nextBillDate',
					'u.residency_status as residencyStatus',
				)

			// Join to property link
			query = query
				.leftJoin('up_users_property_lnk as pl', 'pl.user_id', 'u.id')
				.leftJoin('properties as p', 'p.id', 'pl.property_id')
				.select(
					'p.id as propertyId',
					'p.document_id as propertyDocumentId',
					'p.name as propertyName',
					'p.electric_price_per_unit as electricPricePerUnit',
					'p.water_price_per_unit as waterPricePerUnit',
					'p.common_area_fee as commonAreaFee',
					'p.invoice_due_days as invoiceDueDays',
					'p.currency as propertyCurrency',
				)

			// Join to unit type link
			query = query
				.leftJoin('up_users_unit_type_lnk as utl', 'utl.user_id', 'u.id')
				.leftJoin('unit_types as ut', 'ut.id', 'utl.unit_type_id')
				.select(
					'ut.id as unitTypeId',
					'ut.name as unitTypeName',
					'ut.price as unitTypePrice',
					'ut.currency as unitTypeCurrency',
				)

			if (propertyDocumentId) {
				query = query.where('p.document_id', propertyDocumentId)
			} else if (user.documentId) {
				// Filter to properties owned by this manager
				query = query
					.leftJoin('up_users_property_lnk as upl2', 'upl2.property_id', 'p.id')
					.leftJoin('up_users as owner', 'owner.id', 'upl2.user_id')
					.leftJoin('up_users_role_lnk as orl', 'orl.user_id', 'owner.id')
					.where('orl.role_id', 3)
					.where('owner.document_id', user.documentId)
			}

			const residents: any[] = await query

			// For each resident, check if meter reading exists for the billing month
			const results = await Promise.all(
				residents.map(async (r) => {
					const billDate = r.nextBillDate // e.g. "2026-03-01"
					const billYear = parseInt(billDate.substring(0, 4), 10)
					const billMonth = parseInt(billDate.substring(5, 7), 10)

					// Find room for this resident to look up meter readings
					const rooms = await knex('rooms as rm')
						.leftJoin('rooms_resident_lnk as rrl', 'rrl.room_id', 'rm.id')
						.where('rrl.user_id', r.id)
						.select(
							'rm.id as roomId',
							'rm.document_id as roomDocumentId',
							'rm.room_number as roomNumber',
							'rm.electric_meter as electricMeter',
							'rm.water_meter as waterMeter',
						)
						.first()

					let meterStatus: 'ready' | 'missing' | 'outdated' | 'no_room' = 'no_room'
					let latestMeterReading: any = null

					if (rooms) {
						// Find meter reading for the billing month
						const monthStart = `${billYear}-${String(billMonth).padStart(2, '0')}-01`
						const nextMonth = billMonth === 12 ? `${billYear + 1}-01-01` : `${billYear}-${String(billMonth + 1).padStart(2, '0')}-01`

						const meterReading = await knex('meter_readings as mr')
							.leftJoin('meter_readings_room_lnk as mrl', 'mrl.meter_reading_id', 'mr.id')
							.where('mrl.room_id', rooms.roomId)
							.where('mr.reading_date', '>=', monthStart)
							.where('mr.reading_date', '<', nextMonth)
							.select(
								'mr.reading_date as readingDate',
								'mr.electric_meter_value as electricMeterValue',
								'mr.water_meter_value as waterMeterValue',
								'mr.electric_meter_prev as electricMeterPrev',
								'mr.water_meter_prev as waterMeterPrev',
								'mr.electric_units_used as electricUnitsUsed',
								'mr.water_units_used as waterUnitsUsed',
							)
							.orderBy('mr.reading_date', 'desc')
							.first()

						if (meterReading) {
							meterStatus = 'ready'
							latestMeterReading = meterReading
						} else {
							// Check if there's any meter reading at all (from a previous month)
							const anyReading = await knex('meter_readings as mr')
								.leftJoin('meter_readings_room_lnk as mrl', 'mrl.meter_reading_id', 'mr.id')
								.where('mrl.room_id', rooms.roomId)
								.select('mr.reading_date as readingDate')
								.orderBy('mr.reading_date', 'desc')
								.first()

							meterStatus = anyReading ? 'outdated' : 'missing'
						}
					}

					return {
						id: r.id,
						documentId: r.documentId,
						username: r.username,
						email: r.email,
						roomNumber: r.roomNumber || rooms?.roomNumber || null,
						nextBillDate: r.nextBillDate,
						residencyStatus: r.residencyStatus,
						propertyId: r.propertyId,
						propertyDocumentId: r.propertyDocumentId,
						propertyName: r.propertyName,
						electricPricePerUnit: r.electricPricePerUnit || 0,
						waterPricePerUnit: r.waterPricePerUnit || 0,
						commonAreaFee: r.commonAreaFee || 0,
						invoiceDueDays: r.invoiceDueDays || 0,
						propertyCurrency: r.propertyCurrency || 'THB',
						unitTypeId: r.unitTypeId,
						unitTypeName: r.unitTypeName,
						unitTypePrice: r.unitTypePrice || 0,
						unitTypeCurrency: r.unitTypeCurrency || 'THB',
						roomDocumentId: rooms?.roomDocumentId || null,
						meterStatus,
						latestMeterReading,
					}
				})
			)

			ctx.body = { data: results, meta: { total: results.length, today } }
		} catch (err: any) {
			strapi.log.error('[Billing] pendingAuto error:', err)
			ctx.badRequest('Failed to fetch pending bills', { error: err.message })
		}
	},

	/* ────────────────────────────────────────────────────────────
	 * POST /billings/auto-generate
	 * Body: { residents: [{ id, documentId }] }
	 * Creates billing records for each resident using their property config
	 * and latest meter readings.
	 * ──────────────────────────────────────────────────────────── */
	async autoGenerate(ctx) {
		const user = ctx.state.user
		if (!user) return ctx.unauthorized('You must be logged in')

		const { residents } = ctx.request.body as {
			residents: { id: number; documentId: string }[]
		}
		if (!residents?.length) {
			return ctx.badRequest('No residents provided')
		}

		const knex = strapi.db.connection
		const results: any[] = []
		const errors: any[] = []

		for (const resident of residents) {
			try {
				// Fetch resident details with property and unit type
				const r = await knex('up_users as u')
					.leftJoin('up_users_property_lnk as pl', 'pl.user_id', 'u.id')
					.leftJoin('properties as p', 'p.id', 'pl.property_id')
					.leftJoin('up_users_unit_type_lnk as utl', 'utl.user_id', 'u.id')
					.leftJoin('unit_types as ut', 'ut.id', 'utl.unit_type_id')
					.where('u.id', resident.id)
					.select(
						'u.id', 'u.document_id as documentId', 'u.username',
						'u.next_bill_date as nextBillDate', 'u.room_number as roomNumber',
						'p.id as propertyId', 'p.document_id as propertyDocumentId',
						'p.name as propertyName',
						'p.electric_price_per_unit as electricPricePerUnit',
						'p.water_price_per_unit as waterPricePerUnit',
						'p.common_area_fee as commonAreaFee',
						'p.invoice_due_days as invoiceDueDays',
						'p.currency as propertyCurrency',
						'ut.id as unitTypeId', 'ut.price as unitTypePrice',
						'ut.currency as unitTypeCurrency',
					)
					.first()

				if (!r) {
					errors.push({ residentId: resident.id, error: 'Resident not found' })
					continue
				}

				const billDate = r.nextBillDate
				if (!billDate) {
					errors.push({ residentId: resident.id, error: 'No nextBillDate set' })
					continue
				}

				const billYear = parseInt(billDate.substring(0, 4), 10)
				const billMonth = parseInt(billDate.substring(5, 7), 10)

				// Find room
				const room = await knex('rooms as rm')
					.leftJoin('rooms_resident_lnk as rrl', 'rrl.room_id', 'rm.id')
					.where('rrl.user_id', r.id)
					.select(
						'rm.id as roomId',
						'rm.electric_meter as electricMeter',
						'rm.water_meter as waterMeter',
					)
					.first()

				// Find meter reading for the billing month
				let electricMeterStart = 0
				let electricMeterEnd = 0
				let waterMeterStart = 0
				let waterMeterEnd = 0

				if (room) {
					const monthStart = `${billYear}-${String(billMonth).padStart(2, '0')}-01`
					const nextMonth = billMonth === 12 ? `${billYear + 1}-01-01` : `${billYear}-${String(billMonth + 1).padStart(2, '0')}-01`

					const meterReading = await knex('meter_readings as mr')
						.leftJoin('meter_readings_room_lnk as mrl', 'mrl.meter_reading_id', 'mr.id')
						.where('mrl.room_id', room.roomId)
						.where('mr.reading_date', '>=', monthStart)
						.where('mr.reading_date', '<', nextMonth)
						.orderBy('mr.reading_date', 'desc')
						.select(
							'mr.electric_meter_value as electricMeterValue',
							'mr.water_meter_value as waterMeterValue',
							'mr.electric_meter_prev as electricMeterPrev',
							'mr.water_meter_prev as waterMeterPrev',
						)
						.first()

					if (meterReading) {
						electricMeterStart = meterReading.electricMeterPrev || 0
						electricMeterEnd = meterReading.electricMeterValue || 0
						waterMeterStart = meterReading.waterMeterPrev || 0
						waterMeterEnd = meterReading.waterMeterValue || 0
					}
				}

				// Calculate amounts
				const electricPricePerUnit = r.electricPricePerUnit || 0
				const waterPricePerUnit = r.waterPricePerUnit || 0
				const electricUnitsUsed = Math.max(0, electricMeterEnd - electricMeterStart)
				const waterUnitsUsed = Math.max(0, waterMeterEnd - waterMeterStart)
				const electricAmount = electricUnitsUsed * electricPricePerUnit
				const waterAmount = waterUnitsUsed * waterPricePerUnit
				const unitTypePrice = r.unitTypePrice || 0
				const commonAreaFee = r.commonAreaFee || 0
				const totalAmount = unitTypePrice + electricAmount + waterAmount + commonAreaFee

				// Calculate due date
				const dueDays = r.invoiceDueDays || 30
				const dueDate = new Date(billDate)
				dueDate.setDate(dueDate.getDate() + dueDays)
				const dueDateStr = dueDate.toISOString().split('T')[0]

				// Generate invoice number
				const now = new Date()
				const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
				const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
				const invoiceNo = `${prefix}-${rand}`

				// Month label for description
				const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
				const description = `Monthly rent & utilities — ${monthNames[billMonth - 1]} ${billYear}`

				// Create billing via Strapi documents API (triggers the create hook for notifications)
				const billing = await strapi.documents('api::billing.billing').create({
					data: {
						invoiceNo,
						type: 'monthlyRent',
						description,
						amount: totalAmount,
						currency: r.propertyCurrency || 'THB',
						dueDate: dueDateStr,
						status: 'pending',
						unitTypePrice,
						electricMeterStart,
						electricMeterEnd,
						electricUnitPrice: electricPricePerUnit,
						electricUnitsUsed,
						electricAmount,
						waterMeterStart,
						waterMeterEnd,
						waterUnitPrice: waterPricePerUnit,
						waterUnitsUsed,
						waterAmount,
						commonAreaFee,
						resident: resident.id,
						property: r.propertyDocumentId,
					} as any,
				})

				// Advance nextBillDate by 1 month
				const nextBill = new Date(billYear, billMonth, parseInt(billDate.substring(8, 10), 10))
				await knex('up_users').where('id', r.id).update({
					next_bill_date: nextBill.toISOString().split('T')[0],
				})

				// Send notification to resident
				try {
					const formattedDue = dueDate.toLocaleDateString('en-GB', {
						day: '2-digit', month: 'short', year: 'numeric',
					})
					await strapi.service('api::notification.notification').createAndNotify({
						title: `New invoice ${invoiceNo}`,
						message: `Due on ${formattedDue}`,
						type: 'billing',
						priority: 'high',
						relatedDocumentId: billing.documentId,
						actionUrl: '/resident/my-bills',
						metadata: {
							invoiceNo,
							amount: totalAmount,
							currency: r.propertyCurrency || 'THB',
							dueDate: dueDateStr,
							status: 'pending',
							propertyName: r.propertyName,
						},
						recipientId: resident.documentId,
						senderId: user.documentId,
						propertyId: r.propertyDocumentId,
					})
				} catch (notifErr) {
					strapi.log.error('[Billing] autoGenerate notification error:', notifErr)
				}

				results.push({
					residentId: resident.id,
					invoiceNo,
					amount: totalAmount,
					dueDate: dueDateStr,
					documentId: billing.documentId,
				})
			} catch (err: any) {
				strapi.log.error(`[Billing] autoGenerate error for resident ${resident.id}:`, err)
				errors.push({ residentId: resident.id, error: err.message })
			}
		}

		ctx.body = {
			data: results,
			errors,
			meta: { generated: results.length, failed: errors.length },
		}
	},

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
