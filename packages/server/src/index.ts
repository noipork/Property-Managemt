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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    const resetPasswordUrl = `${frontendUrl}/reset-password`
    const smtpFrom = process.env.SMTP_FROM || 'noreply@propmanager.com'
    const smtpReplyTo = process.env.SMTP_REPLY_TO || smtpFrom

    const applyUsersPermissionsResetTemplate = async () => {
      const asObject = (value: unknown): Record<string, unknown> =>
        value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

      const pluginStore = strapi.store({
        type: 'plugin',
        name: 'users-permissions',
      })

      const advancedSettings = asObject(await pluginStore.get({ key: 'advanced' }))
      const emailSettings = asObject(await pluginStore.get({ key: 'email' }))
      const resetPasswordSettings = asObject(emailSettings.reset_password)
      const resetPasswordOptions = asObject(resetPasswordSettings.options)

      await pluginStore.set({
        key: 'advanced',
        value: {
          ...advancedSettings,
          email_reset_password: resetPasswordUrl,
        },
      })

      await pluginStore.set({
        key: 'email',
        value: {
          ...emailSettings,
          reset_password: {
            ...resetPasswordSettings,
            options: {
              ...resetPasswordOptions,
              from: {
                name: 'PropManager',
                email: smtpFrom,
              },
              response_email: smtpReplyTo,
              object: 'Reset your PropManager password',
              message: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:20px;font-weight:700;color:#1e293b;letter-spacing:-0.3px;">PropManager</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06),0 4px 12px rgba(0,0,0,0.04);">

              <!-- Purple accent bar -->
              <tr>
                <td style="height:4px;background:linear-gradient(90deg,#8f87f1,#a97cf6,#c68efd);"></td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding:40px 36px 36px;">

                  <!-- Icon -->
                  <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                    <tr>
                      <td align="center" style="width:56px;height:56px;background-color:#f3f0ff;border-radius:14px;text-align:center;vertical-align:middle;">
                        <span style="font-size:26px;">&#128272;</span>
                      </td>
                    </tr>
                  </table>

                  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;letter-spacing:-0.3px;">Reset your password</h1>
                  <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;text-align:center;">
                    We received a request to reset the password for your account. Tap the button below to choose a new one.
                  </p>

                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
                    <tr>
                      <td align="center">
                        <a href="<%= URL %>?code=<%= TOKEN %>"
                           style="display:inline-block;padding:14px 40px;font-size:14px;font-weight:600;color:#ffffff;background-color:#a97cf6;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-align:center;">Or copy this link into your browser:</p>
                  <p style="margin:0 0 28px;font-size:11px;color:#a97cf6;word-break:break-all;text-align:center;">
                    <a href="<%= URL %>?code=<%= TOKEN %>" style="color:#a97cf6;text-decoration:none;"><%= URL %>?code=<%= TOKEN %></a>
                  </p>

                  <table cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-top:1px solid #f1f5f9;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

                  <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
                    This link expires in <strong style="color:#64748b;">1 hour</strong>. If you didn&rsquo;t request this, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 0 0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">&copy; 2026 PropManager &middot; All rights reserved</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            },
          },
        },
      })

      strapi.log.info(`[Users Permissions] Reset password template and URL synced (${resetPasswordUrl})`)
    }

    applyUsersPermissionsResetTemplate().catch((err: any) => {
      strapi.log.error(`[Users Permissions] Failed to sync reset password template: ${err.message}`)
    })

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
