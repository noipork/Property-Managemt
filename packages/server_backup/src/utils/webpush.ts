/**
 * Web Push notification utility
 *
 * Sends browser push notifications to subscribed users via the web-push protocol.
 * Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL environment variables.
 */

import webpush from 'web-push'

let isConfigured = false

/**
 * Initialize web-push with VAPID credentials.
 * Safe to call multiple times — will only configure once.
 */
function ensureConfigured() {
  if (isConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:admin@property-management.com'

  if (!publicKey || !privateKey) {
    return false
  }

  webpush.setVapidDetails(email, publicKey, privateKey)
  isConfigured = true
  return true
}

/**
 * Send a push notification to a single subscription
 */
async function sendToSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string; data?: Record<string, any> }
) {
  if (!ensureConfigured()) {
    console.warn('[WebPush] VAPID keys not configured — skipping push notification')
    return null
  }

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    )
    return result
  } catch (error: any) {
    // 410 Gone or 404 = subscription expired / unsubscribed
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { expired: true, endpoint: subscription.endpoint }
    }
    console.error('[WebPush] Failed to send:', error.message)
    return null
  }
}

/**
 * Send push notifications to all active subscriptions of a user.
 * Automatically cleans up expired subscriptions.
 */
async function sendToUser(
  strapi: any,
  userDocumentId: string,
  payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string; data?: Record<string, any> }
) {
  if (!ensureConfigured()) return

  // Find all active push subscriptions for this user
  const subscriptions = await strapi.documents('api::push-subscription.push-subscription').findMany({
    filters: {
      user: { documentId: { $eq: userDocumentId } },
      isActive: true,
    },
  })

  if (!subscriptions || subscriptions.length === 0) {
    strapi.log.debug(`[WebPush] No active subscriptions for user ${userDocumentId}`)
    return
  }

  strapi.log.info(`[WebPush] Sending push to ${subscriptions.length} subscription(s) for user ${userDocumentId}: "${payload.title}"`)

  const results = await Promise.allSettled(
    subscriptions.map((sub: any) =>
      sendToSubscription(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      )
    )
  )

  // Log results
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value && !(r.value as any).expired).length
  const expired = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.expired).length
  const failed = results.filter(r => r.status === 'rejected').length
  strapi.log.info(`[WebPush] Results: ${succeeded} sent, ${expired} expired, ${failed} failed`)

  // Clean up expired subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value?.expired) {
      try {
        await strapi.documents('api::push-subscription.push-subscription').update({
          documentId: subscriptions[i].documentId,
          data: { isActive: false },
        })
        strapi.log.debug(`[WebPush] Deactivated expired subscription: ${subscriptions[i].endpoint}`)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

/**
 * Send push notifications to multiple users at once.
 */
async function sendToUsers(
  strapi: any,
  userDocumentIds: string[],
  payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string; data?: Record<string, any> }
) {
  if (!ensureConfigured()) return

  await Promise.allSettled(
    userDocumentIds.map((uid) => sendToUser(strapi, uid, payload))
  )
}

export const webPush = {
  ensureConfigured,
  sendToSubscription,
  sendToUser,
  sendToUsers,
}
