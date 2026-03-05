import { ref, computed } from 'vue'

// ─── Notification item shape ──────────────────────────────────────────────────
export interface AppNotification {
    id: string
    title: string
    message: string
    type: string
    priority: string
    relatedDocumentId: string | null
    actionUrl: string | null
    metadata: Record<string, any> | null
    createdAt: string
    isRead: boolean
}

// ─── Module-scope singleton so all components share state ─────────────────────
const notifications = ref<AppNotification[]>([])
const isFetching = ref(false)
const hasFetched = ref(false)

export const useNotificationBadge = () => {
    const unreadTotal = computed(() => notifications.value.filter(n => !n.isRead).length)

    // ─── Unread counts grouped by notification type ───────────────────────────
    const unreadByType = computed(() => {
        const map: Record<string, number> = {}
        for (const n of notifications.value) {
            if (!n.isRead) {
                map[n.type] = (map[n.type] || 0) + 1
            }
        }
        return map
    })

    // ─── Fetch from API ───────────────────────────────────────────────────────
    async function fetchNotifications() {
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        if (isFetching.value) return
        isFetching.value = true
        try {
            const params = new URLSearchParams({
                'sort[0]': 'createdAt:desc',
                'pagination[pageSize]': '30',
            })
            const res = await fetch(`${STRAPI_URL}/api/notifications?${params}`, {
                headers: { Authorization: `Bearer ${token.value}` },
            })
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            notifications.value = (data.data ?? []).map((n: any): AppNotification => ({
                id: n.documentId,
                title: n.title,
                message: n.message,
                type: n.type,
                priority: n.priority,
                relatedDocumentId: n.relatedDocumentId ?? null,
                actionUrl: n.actionUrl ?? null,
                metadata: n.metadata ?? null,
                createdAt: n.createdAt,
                isRead: n.isRead ?? false,
            }))
            hasFetched.value = true
        } catch {
            // silent
        } finally {
            isFetching.value = false
        }
    }

    // ─── Mark single as read ──────────────────────────────────────────────────
    async function markAsRead(id: string) {
        const n = notifications.value.find(n => n.id === id)
        if (!n || n.isRead) return
        n.isRead = true
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        try {
            await fetch(`${STRAPI_URL}/api/notifications/${id}/read`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token.value}` },
            })
        } catch { /* silent */ }
    }

    // ─── Mark all as read ─────────────────────────────────────────────────────
    async function markAllAsRead() {
        notifications.value.forEach(n => n.isRead = true)
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        try {
            await fetch(`${STRAPI_URL}/api/notifications/read-all`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token.value}` },
            })
        } catch { /* silent */ }
    }

    // ─── Clear read notifications ─────────────────────────────────────────────
    async function clearRead() {
        notifications.value = notifications.value.filter(n => !n.isRead)
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        try {
            await fetch(`${STRAPI_URL}/api/notifications/clear-read`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token.value}` },
            })
        } catch { /* silent */ }
    }

    // ─── Push a new notification from socket ─────────────────────────────────
    function pushNotification(n: Omit<AppNotification, 'isRead'>) {
        const exists = notifications.value.some(x => x.id === n.id)
        if (!exists) {
            notifications.value.unshift({ ...n, isRead: false })
        }
    }

    // ─── Mark matching unread notifications as read by type + relatedDocumentId ─
    //     e.g. entering /manager/maintenance/:id marks all maintenance notifs
    //     whose relatedDocumentId matches that id
    async function markReadByRelated(types: string[], relatedDocId: string) {
        const matching = notifications.value.filter(
            n => !n.isRead && types.includes(n.type) && n.relatedDocumentId === relatedDocId
        )
        if (matching.length === 0) return
        // Optimistic local update
        matching.forEach(n => n.isRead = true)
        // Fire API calls in parallel
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        await Promise.all(
            matching.map(n =>
                fetch(`${STRAPI_URL}/api/notifications/${n.id}/read`, {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token.value}` },
                }).catch(() => { /* silent */ })
            )
        )
    }

    // ─── Mark all unread of given types as read (for list pages like messages) ─
    async function markReadByTypes(types: string[]) {
        const matching = notifications.value.filter(
            n => !n.isRead && types.includes(n.type)
        )
        if (matching.length === 0) return
        matching.forEach(n => n.isRead = true)
        const { token } = useAuth()
        const config = useRuntimeConfig()
        const STRAPI_URL = config.public.strapiUrl
        await Promise.all(
            matching.map(n =>
                fetch(`${STRAPI_URL}/api/notifications/${n.id}/read`, {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token.value}` },
                }).catch(() => { /* silent */ })
            )
        )
    }

    return {
        notifications,
        unreadTotal,
        unreadByType,
        isFetching,
        hasFetched,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        clearRead,
        pushNotification,
        markReadByRelated,
        markReadByTypes,
    }
}
