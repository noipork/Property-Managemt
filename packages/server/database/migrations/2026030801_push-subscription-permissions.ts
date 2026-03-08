/**
 * Migration: Push Subscription Permissions
 * Grants authenticated users permission to subscribe/unsubscribe/vapidPublicKey
 */

interface MigrationContext {
  knex: any
  strapi: any
}

async function up({ knex }: MigrationContext) {
  // Find the 'authenticated' role
  const authenticatedRole = await knex('up_roles').where({ type: 'authenticated' }).first()
  if (!authenticatedRole) {
    console.warn('[Migration] Authenticated role not found, skipping push-subscription permissions')
    return
  }

  const actions = [
    'api::push-subscription.push-subscription.subscribe',
    'api::push-subscription.push-subscription.unsubscribe',
    'api::push-subscription.push-subscription.vapidPublicKey',
  ]

  for (const action of actions) {
    // Check if permission already exists
    const existing = await knex('up_permissions')
      .where({ action, role: authenticatedRole.id })
      .first()

    if (!existing) {
      // Create the permission
      const [permissionId] = await knex('up_permissions')
        .insert({ action, created_at: new Date(), updated_at: new Date() })
        .returning('id')

      const id = typeof permissionId === 'object' ? permissionId.id : permissionId

      // Link permission to role
      await knex('up_permissions_role_lnk').insert({
        permission_id: id,
        role_id: authenticatedRole.id,
      })

      console.log(`[Migration] Added permission: ${action}`)
    } else {
      console.log(`[Migration] Permission already exists: ${action}`)
    }
  }
}

async function down({ knex }: MigrationContext) {
  const authenticatedRole = await knex('up_roles').where({ type: 'authenticated' }).first()
  if (!authenticatedRole) return

  const actions = [
    'api::push-subscription.push-subscription.subscribe',
    'api::push-subscription.push-subscription.unsubscribe',
    'api::push-subscription.push-subscription.vapidPublicKey',
  ]

  for (const action of actions) {
    const permission = await knex('up_permissions')
      .where({ action })
      .first()

    if (permission) {
      await knex('up_permissions_role_lnk')
        .where({ permission_id: permission.id, role_id: authenticatedRole.id })
        .del()

      await knex('up_permissions').where({ id: permission.id }).del()
    }
  }
}

export { up, down }
