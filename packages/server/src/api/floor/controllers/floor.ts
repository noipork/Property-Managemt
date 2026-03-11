/**
 * floor controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::floor.floor', ({ strapi }) => ({
  // Insert a floor at a specific position, shifting all floors >= insertAt up by 1
  async insertFloor(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { buildingDocumentId, insertAt, floorType, floorLabel, roomsPerFloor } = ctx.request.body as {
      buildingDocumentId: string
      insertAt: number
      floorType?: string
      floorLabel?: string
      roomsPerFloor?: number
    }

    if (!buildingDocumentId || insertAt == null) {
      return ctx.badRequest('Missing required fields: buildingDocumentId, insertAt')
    }

    try {
      // Fetch all floors in this building
      const existingFloors = await strapi.documents('api::floor.floor').findMany({
        filters: { building: { documentId: { $eq: buildingDocumentId } } } as any,
        fields: ['documentId', 'floorNumber'],
        sort: ['floorNumber:asc'],
      })

      // Shift all floors with floorNumber >= insertAt up by 1
      const floorsToShift = existingFloors.filter((f: any) => f.floorNumber >= insertAt)
      for (const f of floorsToShift) {
        await strapi.documents('api::floor.floor').update({
          documentId: f.documentId,
          data: { floorNumber: f.floorNumber + 1 } as any,
        })
      }

      // Create the new floor at insertAt
      const floor = await strapi.documents('api::floor.floor').create({
        data: {
          floorNumber: insertAt,
          floorType: floorType || 'residential',
          floorLabel: floorLabel || null,
          building: { documentId: buildingDocumentId },
        } as any,
      })

      // If residential, create rooms
      const createdRooms: any[] = []
      const numRooms = (floorType === 'residential' || !floorType) ? (roomsPerFloor || 0) : 0
      for (let r = 1; r <= numRooms; r++) {
        const roomNumber = `${insertAt}${String(r).padStart(2, '0')}`
        const room = await strapi.documents('api::room.room').create({
          data: {
            roomNumber,
            status: 'inactive',
            floor: { documentId: floor.documentId },
          } as any,
        })
        createdRooms.push(room)
      }

      ctx.body = {
        data: {
          ...floor,
          rooms: createdRooms,
        },
      }
    } catch (err: any) {
      ctx.badRequest('Failed to insert floor', { error: err.message })
    }
  },

  // Add a single floor to an existing building
  async addToBuilding(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { buildingDocumentId, floorNumber, floorType, floorLabel, roomsPerFloor } = ctx.request.body as {
      buildingDocumentId: string
      floorNumber: number
      floorType?: string
      floorLabel?: string
      roomsPerFloor?: number
    }

    if (!buildingDocumentId || floorNumber == null) {
      return ctx.badRequest('Missing required fields: buildingDocumentId, floorNumber')
    }

    try {
      // Create the floor
      const floor = await strapi.documents('api::floor.floor').create({
        data: {
          floorNumber,
          floorType: floorType || 'residential',
          floorLabel: floorLabel || null,
          building: { documentId: buildingDocumentId },
        } as any,
      })

      // If floor type is residential and roomsPerFloor > 0, create rooms
      const createdRooms: any[] = []
      const numRooms = (floorType === 'residential' || !floorType) ? (roomsPerFloor || 0) : 0

      for (let r = 1; r <= numRooms; r++) {
        const roomNumber = `${floorNumber}${String(r).padStart(2, '0')}`
        const room = await strapi.documents('api::room.room').create({
          data: {
            roomNumber,
            status: 'inactive',
            floor: { documentId: floor.documentId },
          } as any,
        })
        createdRooms.push(room)
      }

      ctx.body = {
        data: {
          ...floor,
          rooms: createdRooms,
        },
      }
    } catch (err: any) {
      ctx.badRequest('Failed to add floor', { error: err.message })
    }
  },
}))
