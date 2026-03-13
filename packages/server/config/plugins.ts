import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp-relay.brevo.com'),
        port: env.int('SMTP_PORT', 587),
        auth: {
          user: env('SMTP_USERNAME', ''),
          pass: env('SMTP_PASSWORD', ''),
        },
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'noreply@propmanager.com'),
        defaultReplyTo: env('SMTP_REPLY_TO', 'noreply@propmanager.com'),
      },
    },
  },

  'users-permissions': {
    config: {
      // URL Strapi will use when building the reset link — must point to your frontend /reset-password page
      resetPasswordUrl: `${env('FRONTEND_URL', 'http://localhost:3000')}/reset-password`,

      emailTemplates: {
        reset_password: {
          subject: 'Reset your PropManager password',
          text: `Reset your password\n\nHi,\n\nWe received a request to reset your PropManager password.\n\nClick the link below to set a new password. This link expires in 1 hour.\n\n<%= URL %>?code=<%= TOKEN %>\n\nIf you did not request a password reset, you can safely ignore this email.\n\n— The PropManager Team`,
          html: `<!DOCTYPE html>
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
  },
});

export default config;
