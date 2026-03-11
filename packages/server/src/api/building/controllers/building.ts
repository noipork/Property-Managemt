/**
 * building controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::building.building', ({ strapi }) => ({
  async generate(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { propertyDocumentId, name, totalFloors, roomsPerFloor, startFloor } = ctx.request.body as {
      propertyDocumentId: string
      name: string
      totalFloors: number
      roomsPerFloor: number
      startFloor?: number
    }

    if (!propertyDocumentId || !name || !totalFloors || !roomsPerFloor) {
      return ctx.badRequest('Missing required fields: propertyDocumentId, name, totalFloors, roomsPerFloor')
    }

    const floorStart = startFloor && startFloor >= 1 ? Math.floor(startFloor) : 1

    try {
      // 1. Create the building
      const building = await strapi.documents('api::building.building').create({
        data: {
          name,
          totalFloors,
          roomsPerFloor,
          property: { documentId: propertyDocumentId },
        } as any,
      })

      // 2. Fetch residents for this property to match room numbers
      const residents = await strapi.documents('plugin::users-permissions.user').findMany({
        filters: {
          property: { documentId: { $eq: propertyDocumentId } },
          role: { id: { $eq: 4 } },
        },
        fields: ['documentId', 'username', 'email', 'roomNumber'],
      })

      // Build a lookup map: roomNumber -> resident
      const residentMap = new Map<string, any>()
      for (const r of residents) {
        if (r.roomNumber) {
          residentMap.set(String(r.roomNumber).trim(), r)
        }
      }

      // 3. Create floors and rooms
      const createdFloors: any[] = []

      for (let f = floorStart; f < floorStart + totalFloors; f++) {
        const floor = await strapi.documents('api::floor.floor').create({
          data: {
            floorNumber: f,
            building: { documentId: building.documentId },
          } as any,
        })

        const createdRooms: any[] = []

        for (let r = 1; r <= roomsPerFloor; r++) {
          const roomNumber = `${f}${String(r).padStart(2, '0')}`

          // Check if a resident has this room number
          const matchedResident = residentMap.get(roomNumber)

          const roomData: any = {
            roomNumber,
            status: matchedResident ? 'active' : 'inactive',
            floor: { documentId: floor.documentId },
          }

          if (matchedResident) {
            roomData.resident = { documentId: matchedResident.documentId }
          }

          const room = await strapi.documents('api::room.room').create({
            data: roomData,
          })

          createdRooms.push({
            ...room,
            resident: matchedResident
              ? { documentId: matchedResident.documentId, username: matchedResident.username, email: matchedResident.email }
              : null,
          })
        }

        createdFloors.push({
          ...floor,
          rooms: createdRooms,
        })
      }

      ctx.body = {
        data: {
          ...building,
          floors: createdFloors,
        },
      }
    } catch (err) {
      strapi.log.error('[Building Generate] Error:', err)
      return ctx.internalServerError('Failed to generate building')
    }
  },
}))
