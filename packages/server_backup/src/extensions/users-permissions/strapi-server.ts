import type { Core } from '@strapi/strapi'

const MANAGER_ROLE_ID = 3

export default (plugin: any) => {
    const originalRegister = plugin.controllers.auth.register

    plugin.controllers.auth.register = async (ctx: any) => {
        const s: Core.Strapi = (globalThis as any).strapi

        // Get plan from custom header (avoids Strapi body validation issues)
        const planDocumentId: string | undefined = ctx.request.headers['x-selected-plan']

        // Call the original register — handles validation, user creation, JWT
        await originalRegister.call(plugin.controllers.auth, ctx)

        // If registration succeeded, assign manager role + plan
        if (ctx.response.status !== 400) {
            try {
                const responseBody = ctx.body as { user?: { id?: number } }
                const userId = responseBody?.user?.id

                if (userId) {
                    const updateData: Record<string, any> = {
                        role: MANAGER_ROLE_ID,
                    }

                    // Resolve plan by documentId if provided
                    if (planDocumentId) {
                        const plan = await s.db.query('api::plan.plan').findOne({
                            where: { documentId: planDocumentId, isActive: true },
                        })
                        if (plan) {
                            updateData.plan = plan.id
                        }
                    }

                    await s.db.query('plugin::users-permissions.user').update({
                        where: { id: userId },
                        data: updateData,
                    })

                    s.log.info(`[register] User ${userId} assigned role=Manager, plan=${planDocumentId ?? 'none'}`)
                }
            } catch (err) {
                s.log.error('[register] Failed to assign role/plan to user:', err)
                // Non-fatal — user is still created
            }
        }
    }

    return plugin
}
