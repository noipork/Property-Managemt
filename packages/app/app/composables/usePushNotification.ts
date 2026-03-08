/**
 * Composable for managing Web Push Notification subscriptions.
 *
 * Handles:
 * - Registering the service worker
 * - Requesting notification permission
 * - Subscribing / unsubscribing with the server
 * - Exposing reactive state for UI (permission status, loading, etc.)
 */

import { ref, computed } from 'vue'

// ─── Module-scope singleton state ─────────────────────────────────────────────
const permission = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'default'
)
const isSubscribed = ref(false)
const isLoading = ref(false)
const swRegistration = ref<ServiceWorkerRegistration | null>(null)
const error = ref<string | null>(null)

export const usePushNotification = () => {
  const { token } = useAuth()
  const config = useRuntimeConfig()
  const STRAPI_URL = config.public.strapiUrl
  const VAPID_PUBLIC_KEY = config.public.vapidPublicKey

  const isSupported = computed(() => {
    if (typeof window === 'undefined') return false
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  })

  const isPermissionGranted = computed(() => permission.value === 'granted')
  const isPermissionDenied = computed(() => permission.value === 'denied')

  /**
   * Convert a VAPID URL-safe base64 string to a Uint8Array
   */
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  /**
   * Register the service worker and check existing subscription
   */
  async function init() {
    if (!isSupported.value) return

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

      // Wait for the service worker to be ready (active)
      await navigator.serviceWorker.ready
      swRegistration.value = registration

      // Update permission state
      permission.value = Notification.permission

      // Check if already subscribed
      const existingSub = await registration.pushManager.getSubscription()
      isSubscribed.value = !!existingSub

      console.log('[PushNotification] Initialized. SW state:', registration.active?.state, 'Subscribed:', isSubscribed.value)
    } catch (err: any) {
      console.warn('[PushNotification] Init failed:', err.message)
      error.value = err.message
    }
  }

  /**
   * Request permission and subscribe to push notifications
   */
  async function subscribe() {
    if (!isSupported.value || !swRegistration.value) {
      error.value = 'Push notifications not supported'
      return false
    }

    isLoading.value = true
    error.value = null

    try {
      // Request permission
      const result = await Notification.requestPermission()
      permission.value = result

      if (result !== 'granted') {
        error.value = 'Notification permission denied'
        return false
      }

      // Get the VAPID public key
      let vapidKey = VAPID_PUBLIC_KEY
      if (!vapidKey) {
        // Fallback: fetch from server
        const res = await fetch(`${STRAPI_URL}/api/push-subscriptions/vapid-public-key`, {
          headers: { Authorization: `Bearer ${token.value}` },
        })
        if (res.ok) {
          const data = await res.json()
          vapidKey = data.data?.publicKey
        }
      }

      if (!vapidKey) {
        error.value = 'VAPID public key not available'
        return false
      }

      // Subscribe to push
      const subscription = await swRegistration.value.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })

      // Send subscription to server
      const res = await fetch(`${STRAPI_URL}/api/push-subscriptions/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save subscription on server')
      }

      isSubscribed.value = true
      console.log('[PushNotification] Subscribed successfully')
      return true
    } catch (err: any) {
      console.error('[PushNotification] Subscribe failed:', err)
      error.value = err.message
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async function unsubscribe() {
    if (!swRegistration.value) return false

    isLoading.value = true
    error.value = null

    try {
      const subscription = await swRegistration.value.pushManager.getSubscription()
      if (subscription) {
        // Remove from server
        await fetch(`${STRAPI_URL}/api/push-subscriptions/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token.value}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => { /* silent */ })

        // Unsubscribe locally
        await subscription.unsubscribe()
      }

      isSubscribed.value = false
      console.log('[PushNotification] Unsubscribed successfully')
      return true
    } catch (err: any) {
      console.error('[PushNotification] Unsubscribe failed:', err)
      error.value = err.message
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Toggle subscription on/off
   */
  async function toggle() {
    if (isSubscribed.value) {
      return unsubscribe()
    } else {
      return subscribe()
    }
  }

  return {
    // State
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    isPermissionGranted,
    isPermissionDenied,
    error,

    // Actions
    init,
    subscribe,
    unsubscribe,
    toggle,
  }
}
