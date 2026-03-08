import type { Core } from '@strapi/strapi'
import { Server as SocketIOServer } from 'socket.io'

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const httpServer = (strapi as any).server.httpServer

    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://property.upstify-official.com',
          'http://property.upstify-official.com',
          'https://propertyapi.upstify-official.com',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    })

    // Attach io to strapi so services can access it
    ;(strapi as any).io = io

    // Authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '')

        if (!token) {
          return next(new Error('Authentication error: No token provided'))
        }

        // Verify JWT token
        const jwtService = strapi.service('plugin::users-permissions.jwt')
        const payload = await (jwtService as any).verify(token)

        if (!payload?.id) {
          return next(new Error('Authentication error: Invalid token'))
        }

        // Find user
        const user = await strapi.documents('plugin::users-permissions.user').findFirst({
          filters: { id: { $eq: payload.id } },
          fields: ['id', 'documentId', 'username', 'email'],
          populate: {
            role: { fields: ['id', 'name', 'type'] },
          },
        })

        if (!user) {
          return next(new Error('Authentication error: User not found'))
        }

        // Attach user to socket
        ;(socket as any).user = user
        next()
      } catch (err: any) {
        strapi.log.error(`[Socket.IO] Auth error: ${err.message}`)
        next(new Error('Authentication error'))
      }
    })

    io.on('connection', (socket) => {
      const user = (socket as any).user

      if (user?.documentId) {
        // Auto-join user's own room for notifications
        socket.join(`user:${user.documentId}`)
        strapi.log.info(`[Socket.IO] User ${user.username} (${user.documentId}) connected`)
      }

      // Join a conversation room
      socket.on('join-conversation', (conversationId: string) => {
        socket.join(`conversation:${conversationId}`)
        strapi.log.debug(`[Socket.IO] ${user?.username} joined conversation:${conversationId}`)
      })

      // Leave a conversation room
      socket.on('leave-conversation', (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`)
        strapi.log.debug(`[Socket.IO] ${user?.username} left conversation:${conversationId}`)
      })

      // Join a maintenance room
      socket.on('join-maintenance', (maintenanceId: string) => {
        socket.join(`maintenance:${maintenanceId}`)
        strapi.log.debug(`[Socket.IO] ${user?.username} joined maintenance:${maintenanceId}`)
      })

      // Leave a maintenance room
      socket.on('leave-maintenance', (maintenanceId: string) => {
        socket.leave(`maintenance:${maintenanceId}`)
        strapi.log.debug(`[Socket.IO] ${user?.username} left maintenance:${maintenanceId}`)
      })

      // Typing indicators
      socket.on('typing', (data: { conversationId?: string; maintenanceId?: string }) => {
        if (data.conversationId) {
          socket.to(`conversation:${data.conversationId}`).emit('typing', {
            userId: user?.documentId,
            username: user?.username,
            conversationId: data.conversationId,
          })
        }
        if (data.maintenanceId) {
          socket.to(`maintenance:${data.maintenanceId}`).emit('typing', {
            userId: user?.documentId,
            username: user?.username,
            maintenanceId: data.maintenanceId,
          })
        }
      })

      socket.on('stop-typing', (data: { conversationId?: string; maintenanceId?: string }) => {
        if (data.conversationId) {
          socket.to(`conversation:${data.conversationId}`).emit('stop-typing', {
            userId: user?.documentId,
            username: user?.username,
            conversationId: data.conversationId,
          })
        }
        if (data.maintenanceId) {
          socket.to(`maintenance:${data.maintenanceId}`).emit('stop-typing', {
            userId: user?.documentId,
            username: user?.username,
            maintenanceId: data.maintenanceId,
          })
        }
      })

      socket.on('disconnect', () => {
        strapi.log.info(`[Socket.IO] User ${user?.username} disconnected`)
      })
    })

    strapi.log.info('[Socket.IO] Server initialized')
  },
};
