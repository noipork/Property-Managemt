/**
 * meter-reading controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::meter-reading.meter-reading', ({ strapi }) => ({
  /**
   * Bulk create/update meter readings for multiple rooms at once.
   * Body: { propertyDocumentId, readingDate, readings: [{ roomDocumentId, electricMeterValue, waterMeterValue }] }
   */
  async bulkCreate(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { propertyDocumentId, readingDate, readings } = ctx.request.body as {
      propertyDocumentId: string
      readingDate: string
      readings: {
        roomDocumentId: string
        electricMeterValue: number
        waterMeterValue: number
      }[]
    }

    if (!propertyDocumentId || !readingDate || !readings?.length) {
      return ctx.badRequest('Missing required fields: propertyDocumentId, readingDate, readings')
    }

    try {
      const results = []

      for (const reading of readings) {
        // Get previous reading for this room (most recent before this date)
        const prevReadings = await strapi.documents('api::meter-reading.meter-reading').findMany({
          filters: {
            room: { documentId: reading.roomDocumentId },
          } as any,
          sort: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
          limit: 1,
        })

        const prev = prevReadings?.[0]
        const electricPrev = prev?.electricMeterValue ?? 0
        const waterPrev = prev?.waterMeterValue ?? 0

        const electricUsed = Math.max(0, (reading.electricMeterValue || 0) - electricPrev)
        const waterUsed = Math.max(0, (reading.waterMeterValue || 0) - waterPrev)

        // Check if a reading already exists for this room on this date
        const existing = await strapi.documents('api::meter-reading.meter-reading').findMany({
          filters: {
            room: { documentId: reading.roomDocumentId },
            readingDate: { $eq: readingDate },
          } as any,
          limit: 1,
        })

        let result
        if (existing?.length) {
          // Update existing
          result = await strapi.documents('api::meter-reading.meter-reading').update({
            documentId: existing[0].documentId,
            data: {
              electricMeterValue: reading.electricMeterValue || 0,
              waterMeterValue: reading.waterMeterValue || 0,
              electricMeterPrev: electricPrev,
              waterMeterPrev: waterPrev,
              electricUnitsUsed: electricUsed,
              waterUnitsUsed: waterUsed,
              recordedBy: user.id,
            } as any,
          })
        } else {
          // Create new
          result = await strapi.documents('api::meter-reading.meter-reading').create({
            data: {
              room: { documentId: reading.roomDocumentId },
              property: { documentId: propertyDocumentId },
              readingDate,
              electricMeterValue: reading.electricMeterValue || 0,
              waterMeterValue: reading.waterMeterValue || 0,
              electricMeterPrev: electricPrev,
              waterMeterPrev: waterPrev,
              electricUnitsUsed: electricUsed,
              waterUnitsUsed: waterUsed,
              recordedBy: user.id,
            } as any,
          })
        }

        // Update room's current meter values
        await strapi.documents('api::room.room').update({
          documentId: reading.roomDocumentId,
          data: {
            electricMeter: reading.electricMeterValue || 0,
            waterMeter: reading.waterMeterValue || 0,
          } as any,
        })

        results.push(result)
      }

      ctx.body = { data: results, count: results.length }
    } catch (err: any) {
      strapi.log.error('Bulk meter reading error:', err)
      ctx.badRequest('Failed to save meter readings', { error: err.message })
    }
  },
}))
