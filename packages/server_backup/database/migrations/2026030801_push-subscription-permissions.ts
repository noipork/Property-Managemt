import type { Core } from '@strapi/strapi'

/**
 * Grant push-subscription API permissions to the Authenticated role.
 *
 * This allows logged-in users (both managers and residents) to:
 * - Subscribe to push notifications
 * - Unsubscribe from push notifications
 * - Retrieve the VAPID public key
 */
export async function up({ strapi }: { strapi: Core.Strapi }) {
  // Find the "Authenticated" role
  const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  })

  if (!authenticatedRole) {
    strapi.log.warn('[Migration] Authenticated role not found — skipping push-subscription permissions')
    return
  }

  const actions = [
    'api::push-subscription.push-subscription.subscribe',
    'api::push-subscription.push-subscription.unsubscribe',
    'api::push-subscription.push-subscription.vapidPublicKey',
  ]

  for (const action of actions) {
    // Check if permission already exists
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: {
        action,
        role: authenticatedRole.id,
      },
    })

    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action,
          role: authenticatedRole.id,
          enabled: true,
        },
      })
      strapi.log.info(`[Migration] Granted permission: ${action}`)
    }
  }
}

export async function down({ strapi }: { strapi: Core.Strapi }) {
  const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  })

  if (!authenticatedRole) return

  const actions = [
    'api::push-subscription.push-subscription.subscribe',
    'api::push-subscription.push-subscription.unsubscribe',
    'api::push-subscription.push-subscription.vapidPublicKey',
  ]

  for (const action of actions) {
    await strapi.db.query('plugin::users-permissions.permission').delete({
      where: {
        action,
        role: authenticatedRole.id,
      },
    })
  }
}
