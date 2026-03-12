const MANAGER_ROLE_ID = 3

/** Strip plainPassword from a user object (or array of users). */
function stripPlainPassword(data: any): any {
  if (Array.isArray(data)) return data.map(stripPlainPassword)
  if (data && typeof data === 'object') {
    const { plainPassword, ...rest } = data
    return rest
  }
  return data
}

/** Re-attach plainPassword for each user in the response, fetched directly via knex. */
async function injectPlainPasswords(strapi: any, users: any[]): Promise<any[]> {
  if (!users.length) return users
  const knex = strapi.db.connection
  const ids = users.map((u: any) => u.id).filter(Boolean)
  const rows: { id: number; plain_password: string | null }[] = await knex('up_users')
    .whereIn('id', ids)
    .select('id', 'plain_password')
  const map = new Map(rows.map(r => [r.id, r.plain_password]))
  return users.map((u: any) => ({ ...u, plainPassword: map.get(u.id) ?? null }))
}

export default (plugin: any) => {
  // Store the original register controller
  const originalRegister = plugin.controllers.auth.register

  // ─── Guard plainPassword on /api/users (find) ───────────────────────────
  const originalFind = plugin.controllers.user.find
  plugin.controllers.user.find = async (ctx: any) => {
    await originalFind.call(plugin.controllers.user, ctx)
    const requestingUser = ctx.state.user
    const isManager = requestingUser?.role?.id === MANAGER_ROLE_ID ||
      requestingUser?.role?.type === 'manager'
    if (!isManager) {
      ctx.body = stripPlainPassword(ctx.body)
    } else {
      // Re-inject from DB since private fields are stripped from Strapi output
      const strapiInstance = (globalThis as any).strapi
      const users = Array.isArray(ctx.body) ? ctx.body : (ctx.body?.data ?? [])
      const withPasswords = await injectPlainPasswords(strapiInstance, users)
      ctx.body = Array.isArray(ctx.body) ? withPasswords : { ...ctx.body, data: withPasswords }
    }
  }

  // ─── Guard plainPassword on /api/users/:id (findOne) ───────────────────
  const originalFindOne = plugin.controllers.user.findOne
  plugin.controllers.user.findOne = async (ctx: any) => {
    await originalFindOne.call(plugin.controllers.user, ctx)
    const requestingUser = ctx.state.user
    const isManager = requestingUser?.role?.id === MANAGER_ROLE_ID ||
      requestingUser?.role?.type === 'manager'
    if (!isManager) {
      ctx.body = stripPlainPassword(ctx.body)
    } else {
      const strapiInstance = (globalThis as any).strapi
      const userData = ctx.body
      if (userData?.id) {
        const [withPassword] = await injectPlainPasswords(strapiInstance, [userData])
        ctx.body = withPassword
      }
    }
  }

  // Override the register controller
  plugin.controllers.auth.register = async (ctx: any) => {
    const strapiInstance = (globalThis as any).strapi

    // Read x-selected-plan header before registration
    const selectedPlanSlug = ctx.request.headers['x-selected-plan']
    let plan: any = null

    if (selectedPlanSlug) {
      try {
        const plans = await strapiInstance.documents('api::plan.plan').findMany({
          filters: { slug: { $eq: selectedPlanSlug }, isActive: { $eq: true } },
          limit: 1,
        })
        if (plans.length > 0) {
          plan = plans[0]
        }
      } catch (err: any) {
        strapiInstance.log.warn(`[Register] Failed to find plan: ${err.message}`)
      }
    }

    // Call the original register
    await originalRegister.call(plugin.controllers.auth, ctx)

    // After successful registration, update the user
    const output = ctx.body

    if (output?.user?.id) {
      try {
        const updateData: Record<string, any> = {}

        if (plan) {
          // User selected a plan → make them a manager
          updateData.role = MANAGER_ROLE_ID
          updateData.plan = { documentId: plan.documentId }
        }

        if (Object.keys(updateData).length > 0) {
          // Find user by numeric id to get documentId
          const users = await strapiInstance.documents('plugin::users-permissions.user').findMany({
            filters: { id: { $eq: output.user.id } },
            fields: ['documentId'],
          })

          if (users.length > 0) {
            await strapiInstance.documents('plugin::users-permissions.user').update({
              documentId: users[0].documentId,
              data: updateData,
            })

            // Re-fetch updated user to return in response
            const updatedUsers = await strapiInstance.documents('plugin::users-permissions.user').findMany({
              filters: { id: { $eq: output.user.id } },
              populate: {
                role: { fields: ['id', 'name', 'type'] },
                plan: { fields: ['documentId', 'name', 'slug', 'maxProperties', 'maxUnitsPerProperty', 'maxUnitTypesPerProperty', 'maxBuildingsPerProperty'] },
                property: { fields: ['documentId', 'name'] },
              },
            })

            if (updatedUsers.length > 0) {
              ctx.body = {
                ...output,
                user: {
                  ...output.user,
                  ...updatedUsers[0],
                },
              }
            }
          }
        }
      } catch (err: any) {
        strapiInstance.log.error(`[Register] Failed to update user after registration: ${err.message}`)
        // Don't throw — registration succeeded, just the post-processing failed
      }
    }
  }

  return plugin
}
