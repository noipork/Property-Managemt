import type { Core } from '@strapi/strapi';
import { runAutoBilling } from '../src/utils/auto-billing-cron';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_URL', 'http://localhost:1337'),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: {
      // Run auto-billing every day at 8:00 AM (use '* * * * *' to test every minute)
      'auto-billing': {
        options: {
          rule: '0 8 * * *', // ⚠️ TESTING — change back to '0 8 * * *'
        },
        async task({ strapi }: { strapi: Core.Strapi }) {
          await runAutoBilling({ strapi });
        },
      },
    },
  },
} as any);

export default config;
