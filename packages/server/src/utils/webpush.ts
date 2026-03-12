import webPushLib from 'web-push'

let isConfigured = false

function ensureConfigured() {
  if (isConfigured) return

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    console.warn('[WebPush] VAPID keys not configured. Push notifications will not work.')
    return
  }

  webPushLib.setVapidDetails(email, publicKey, privateKey)
  isConfigured = true
}

async function sendToSubscription(
  strapi: any,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, any>,
  subscriptionDocumentId?: string
): Promise<boolean> {
  ensureConfigured()
  if (!isConfigured) return false

  try {
    await webPushLib.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    )
    return true
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or not found — deactivate or delete
      if (subscriptionDocumentId) {
        try {
          await strapi.documents('api::push-subscription.push-subscription').update({
            documentId: subscriptionDocumentId,
            data: { isActive: false },
          })
        } catch (deleteErr: any) {
          strapi.log.warn(`[WebPush] Failed to deactivate expired subscription: ${deleteErr.message}`)
        }
      }
      return false
    }
    strapi.log.warn(`[WebPush] sendToSubscription error: ${err.message}`)
    return false
  }
}

async function sendToUser(
  strapi: any,
  userDocumentId: string,
  payload: Record<string, any>
): Promise<void> {
  ensureConfigured()
  if (!isConfigured) return

  const subscriptions = await strapi.documents('api::push-subscription.push-subscription').findMany({
    filters: {
      user: { documentId: { $eq: userDocumentId } },
      isActive: { $eq: true },
    },
    fields: ['documentId', 'endpoint', 'keys'],
  })

  if (!subscriptions || subscriptions.length === 0) return

  const promises = subscriptions.map((sub: any) =>
    sendToSubscription(
      strapi,
      { endpoint: sub.endpoint, keys: sub.keys },
      payload,
      sub.documentId
    )
  )

  await Promise.allSettled(promises)
}

async function sendToUsers(
  strapi: any,
  userDocumentIds: string[],
  payload: Record<string, any>
): Promise<void> {
  ensureConfigured()
  if (!isConfigured) return

  const promises = userDocumentIds.map((id) => sendToUser(strapi, id, payload))
  await Promise.allSettled(promises)
}

export const webPush = {
  ensureConfigured,
  sendToSubscription,
  sendToUser,
  sendToUsers,
}
