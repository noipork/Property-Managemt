import type { Core } from '@strapi/strapi';
import { Server as SocketIOServer } from 'socket.io';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // ─── Socket.IO Setup ────────────────────────────────────────────────
    const httpServer = strapi.server.httpServer;

    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://propertyapi.upstify-official.com',
          'http://propertyapi.upstify-official.com',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Authenticate socket connections using JWT
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT using Strapi's built-in service
        const jwtService = strapi.plugin('users-permissions').service('jwt');
        const payload = await jwtService.verify(token);

        // Fetch user
        const user = await strapi
          .plugin('users-permissions')
          .service('user')
          .fetch(payload.id, { populate: ['role'] });

        if (!user) {
          return next(new Error('User not found'));
        }

        // Attach user to socket
        (socket as any).user = {
          id: user.id,
          documentId: user.documentId,
          username: user.username,
          email: user.email,
          role: user.role,
        };

        next();
      } catch (err) {
        next(new Error('Invalid token'));
      }
    });

    io.on('connection', (socket) => {
      const user = (socket as any).user;
      strapi.log.info(`[Socket.IO] User connected: ${user.username} (${user.documentId})`);

      // Join a personal room so we can target messages to specific users
      socket.join(`user:${user.documentId}`);

      // Join conversation rooms
      socket.on('join-conversation', (conversationDocumentId: string) => {
        socket.join(`conversation:${conversationDocumentId}`);
        strapi.log.debug(`[Socket.IO] ${user.username} joined conversation:${conversationDocumentId}`);
      });

      socket.on('leave-conversation', (conversationDocumentId: string) => {
        socket.leave(`conversation:${conversationDocumentId}`);
        strapi.log.debug(`[Socket.IO] ${user.username} left conversation:${conversationDocumentId}`);
      });

      // Join / leave maintenance request rooms
      socket.on('join-maintenance', (maintenanceDocumentId: string) => {
        socket.join(`maintenance:${maintenanceDocumentId}`);
        strapi.log.debug(`[Socket.IO] ${user.username} joined maintenance:${maintenanceDocumentId}`);
      });

      socket.on('leave-maintenance', (maintenanceDocumentId: string) => {
        socket.leave(`maintenance:${maintenanceDocumentId}`);
        strapi.log.debug(`[Socket.IO] ${user.username} left maintenance:${maintenanceDocumentId}`);
      });

      // Typing indicators
      socket.on('typing', (data: { conversationDocumentId: string }) => {
        socket.to(`conversation:${data.conversationDocumentId}`).emit('user-typing', {
          conversationDocumentId: data.conversationDocumentId,
          user: { documentId: user.documentId, username: user.username },
        });
      });

      socket.on('stop-typing', (data: { conversationDocumentId: string }) => {
        socket.to(`conversation:${data.conversationDocumentId}`).emit('user-stop-typing', {
          conversationDocumentId: data.conversationDocumentId,
          user: { documentId: user.documentId, username: user.username },
        });
      });

      socket.on('disconnect', () => {
        strapi.log.info(`[Socket.IO] User disconnected: ${user.username}`);
      });
    });

    // Store io instance on strapi so we can emit events from controllers/services
    (strapi as any).io = io;

    strapi.log.info('[Socket.IO] WebSocket server initialized');
  },
};
