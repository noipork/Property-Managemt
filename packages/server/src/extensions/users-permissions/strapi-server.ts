const MANAGER_ROLE_ID = 3

export default (plugin: any) => {
  // Store the original register controller
  const originalRegister = plugin.controllers.auth.register

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
                plan: { fields: ['documentId', 'name', 'slug', 'maxProperties', 'maxUnitsPerProperty'] },
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
