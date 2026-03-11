/**
 * room controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::room.room', ({ strapi }) => ({
  // Add a single room to an existing floor
  async addToFloor(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { floorDocumentId, roomNumber } = ctx.request.body as {
      floorDocumentId: string
      roomNumber: string
    }

    if (!floorDocumentId || !roomNumber) {
      return ctx.badRequest('Missing required fields: floorDocumentId, roomNumber')
    }

    try {
      const room = await strapi.documents('api::room.room').create({
        data: {
          roomNumber,
          status: 'inactive',
          floor: { documentId: floorDocumentId },
        } as any,
      })

      ctx.body = { data: room }
    } catch (err: any) {
      ctx.badRequest('Failed to add room', { error: err.message })
    }
  },

  /**
   * Assign a resident to the room matching roomNumber within a property.
   * Sets room.resident = residentDocumentId and room.status = 'active'.
   * Body: { propertyId: number, roomNumber: string, residentDocumentId: string }
   */
  async assignResident(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { propertyId, roomNumber, residentDocumentId } = ctx.request.body as {
      propertyId: number
      roomNumber: string
      residentDocumentId: string
    }

    if (!propertyId || !roomNumber || !residentDocumentId) {
      return ctx.badRequest('Missing required fields: propertyId, roomNumber, residentDocumentId')
    }

    const knex = strapi.db.connection

    try {
      // Find the room by roomNumber within this property via buildings → floors → rooms
      const room = await knex('rooms as r')
        .join('rooms_floor_lnk as rfl', 'rfl.room_id', 'r.id')
        .join('floors_building_lnk as fbl', 'fbl.floor_id', 'rfl.floor_id')
        .join('buildings_property_lnk as bpl', 'bpl.building_id', 'fbl.building_id')
        .where('bpl.property_id', propertyId)
        .whereRaw('LOWER(r.room_number) = LOWER(?)', [roomNumber.trim()])
        .select('r.id', 'r.document_id as documentId')
        .first()

      if (!room) {
        // No room found — not an error, room may not exist in the building setup
        ctx.body = { data: null, message: 'No matching room found in property buildings' }
        return
      }

      // Resolve resident's numeric id from documentId
      const resident = await knex('up_users')
        .where('document_id', residentDocumentId)
        .select('id')
        .first()

      if (!resident) {
        return ctx.badRequest('Resident not found')
      }

      // Update room: set status = active and link resident
      await strapi.documents('api::room.room').update({
        documentId: room.documentId,
        data: {
          status: 'active',
          resident: residentDocumentId,
        } as any,
      })

      strapi.log.info(`[Room] Assigned resident ${residentDocumentId} to room ${room.documentId} (${roomNumber})`)
      ctx.body = { data: { roomDocumentId: room.documentId, roomNumber, status: 'active' } }
    } catch (err: any) {
      strapi.log.error('[Room] assignResident error:', err)
      return ctx.internalServerError('Failed to assign resident to room')
    }
  },

  /**
   * Unassign a resident from their room (set room.resident = null, status = inactive).
   * Body: { residentDocumentId: string }
   */
  async unassignResident(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { residentDocumentId } = ctx.request.body as { residentDocumentId: string }
    if (!residentDocumentId) {
      return ctx.badRequest('Missing required field: residentDocumentId')
    }

    const knex = strapi.db.connection

    try {
      // Find the resident's numeric id
      const resident = await knex('up_users')
        .where('document_id', residentDocumentId)
        .select('id')
        .first()

      if (!resident) return ctx.badRequest('Resident not found')

      // Find rooms linked to this resident
      const linked = await knex('rooms_resident_lnk')
        .where('user_id', resident.id)
        .select('room_id')

      for (const { room_id } of linked) {
        const rm = await knex('rooms').where('id', room_id).select('document_id').first()
        if (!rm) continue
        await strapi.documents('api::room.room').update({
          documentId: rm.document_id,
          data: { status: 'inactive', resident: null } as any,
        })
      }

      ctx.body = { data: { unassigned: linked.length } }
    } catch (err: any) {
      strapi.log.error('[Room] unassignResident error:', err)
      return ctx.internalServerError('Failed to unassign resident from room')
    }
  },
}))
