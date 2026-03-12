/**
 * push-subscription controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::push-subscription.push-subscription', ({ strapi }) => ({
  /**
   * Subscribe: save or update a push subscription for the current user
   */
  async subscribe(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { subscription, userAgent } = ctx.request.body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
      userAgent?: string
    }

    if (!subscription?.endpoint || !subscription?.keys) {
      return ctx.badRequest('Invalid subscription object')
    }

    // Check if this endpoint already exists for this user
    const existing = await strapi.documents('api::push-subscription.push-subscription').findMany({
      filters: {
        endpoint: { $eq: subscription.endpoint },
        user: { documentId: { $eq: user.documentId } },
      },
    })

    if (existing.length > 0) {
      // Update the existing subscription
      const updated = await strapi.documents('api::push-subscription.push-subscription').update({
        documentId: existing[0].documentId,
        data: {
          keys: subscription.keys,
          userAgent: userAgent || null,
          isActive: true,
        },
      })
      return { data: { documentId: updated.documentId, message: 'Subscription updated' } }
    }

    // Create new subscription
    const created = await strapi.documents('api::push-subscription.push-subscription').create({
      data: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        user: { documentId: user.documentId },
        userAgent: userAgent || null,
        isActive: true,
      },
    })

    return { data: { documentId: created.documentId, message: 'Subscription created' } }
  },

  /**
   * Unsubscribe: remove a push subscription
   */
  async unsubscribe(ctx) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You must be logged in')

    const { endpoint } = ctx.request.body as { endpoint: string }
    if (!endpoint) return ctx.badRequest('Endpoint is required')

    const existing = await strapi.documents('api::push-subscription.push-subscription').findMany({
      filters: {
        endpoint: { $eq: endpoint },
        user: { documentId: { $eq: user.documentId } },
      },
    })

    if (existing.length > 0) {
      await strapi.documents('api::push-subscription.push-subscription').delete({
        documentId: existing[0].documentId,
      })
    }

    return { data: { message: 'Subscription removed' } }
  },

  /**
   * Get the VAPID public key so the client can subscribe
   */
  async vapidPublicKey(ctx) {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    if (!publicKey) {
      return ctx.internalServerError('VAPID public key not configured')
    }
    return { data: { publicKey } }
  },
}))
