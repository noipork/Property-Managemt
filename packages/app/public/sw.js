/**
 * Service Worker for Web Push Notifications
 *
 * This runs in the browser background and handles incoming push events,
 * displaying native OS notifications even when the app tab is closed.
 */

/* eslint-disable no-restricted-globals */

// Listen for push events from the push service
self.addEventListener('push', (event) => {
    if (!event.data) return

    let payload
    try {
        payload = event.data.json()
    } catch {
        payload = {
            title: 'New Notification',
            body: event.data.text(),
        }
    }

    const title = payload.title || 'Property Management'
    const options = {
        body: payload.body || '',
        icon: payload.icon || '/favicon.ico',
        badge: payload.badge || '/favicon.ico',
        tag: payload.tag || 'default',
        renotify: true,
        requireInteraction: payload.data?.type === 'maintenance' || payload.data?.type === 'billing',
        data: payload.data || {},
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    )
})

// Handle notification click — navigate to the relevant page
self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const data = event.notification.data || {}
    let url = data.actionUrl || data.url || '/'

    // Ensure the URL is absolute
    if (url.startsWith('/')) {
        url = self.location.origin + url
    }

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If a window with our app is already open, focus it and navigate
            for (const client of windowClients) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    client.focus()
                    client.navigate(url)
                    return
                }
            }
            // Otherwise open a new window
            if (self.clients.openWindow) {
                return self.clients.openWindow(url)
            }
        })
    )
})

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    // Could send analytics here if needed
})

// Service worker install — skip waiting to activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting())
})

// Service worker activation — claim clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})
