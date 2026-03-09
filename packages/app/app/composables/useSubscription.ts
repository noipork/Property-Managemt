import { ref, computed } from 'vue'

interface Subscription {
    id: number
    documentId: string
    status: 'pending' | 'active' | 'expired' | 'cancelled' | 'trial'
    startDate: string
    endDate: string
    amount: number
    currency: string
    paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
    plan?: {
        id: number
        documentId: string
        name: string
        maxProperties: number
        maxUnitsPerProperty: number
    }
    scheduledDowngradePlan?: {
        id: number
        documentId: string
        name: string
        maxProperties: number
        maxUnitsPerProperty: number
    } | null
}

const _subscription = ref<Subscription | null>(null)
const _isLoading = ref(false)
const _lastFetched = ref<number>(0)

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000

export const useSubscription = () => {
    const { token, user } = useAuth()
    const config = useRuntimeConfig()
    const STRAPI_URL = config.public.strapiUrl

    const subscription = _subscription
    const isLoading = _isLoading

    const isActive = computed(() => {
        if (!subscription.value) return false
        return subscription.value.status === 'active' || subscription.value.status === 'trial'
    })

    const isExpired = computed(() => {
        if (!subscription.value) return true
        if (subscription.value.status === 'expired' || subscription.value.status === 'cancelled') return true
        // Check if end date has passed
        const endDate = new Date(subscription.value.endDate)
        return endDate < new Date()
    })

    const isPending = computed(() => {
        if (!subscription.value) return false
        return subscription.value.status === 'pending' || subscription.value.paymentStatus === 'pending'
    })

    const daysRemaining = computed(() => {
        if (!subscription.value) return 0
        const endDate = new Date(subscription.value.endDate)
        const now = new Date()
        const diffTime = endDate.getTime() - now.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return Math.max(0, diffDays)
    })

    const planLimits = computed(() => {
        if (!subscription.value?.plan) {
            return { maxProperties: 1, maxUnitsPerProperty: 10 } // Default limits
        }
        return {
            maxProperties: subscription.value.plan.maxProperties,
            maxUnitsPerProperty: subscription.value.plan.maxUnitsPerProperty,
        }
    })

    const hasScheduledDowngrade = computed(() => {
        return !!subscription.value?.scheduledDowngradePlan
    })

    const scheduledDowngradePlan = computed(() => {
        return subscription.value?.scheduledDowngradePlan || null
    })

    async function fetchSubscription(force = false): Promise<Subscription | null> {
        if (!token.value || !user.value) return null

        // Use cache if available and not expired
        const now = Date.now()
        if (!force && _subscription.value && (now - _lastFetched.value) < CACHE_DURATION) {
            return _subscription.value
        }

        _isLoading.value = true
        try {
            // Fetch user's active subscription
            const params = new URLSearchParams({
                'filters[user][id][$eq]': String(user.value.id),
                'filters[status][$in][0]': 'active',
                'filters[status][$in][1]': 'trial',
                'filters[status][$in][2]': 'pending',
                'populate[0]': 'plan',
                'populate[1]': 'scheduledDowngradePlan',
                'sort[0]': 'createdAt:desc',
                'pagination[pageSize]': '1',
            })

            const res = await fetch(`${STRAPI_URL}/api/subscriptions?${params}`, {
                headers: { Authorization: `Bearer ${token.value}` },
            })

            if (!res.ok) {
                console.error('Failed to fetch subscription')
                return null
            }

            const data = await res.json()
            const sub = data.data?.[0]

            if (sub) {
                _subscription.value = {
                    id: sub.id,
                    documentId: sub.documentId,
                    status: sub.status,
                    startDate: sub.startDate,
                    endDate: sub.endDate,
                    amount: sub.amount,
                    currency: sub.currency,
                    paymentStatus: sub.paymentStatus,
                    plan: sub.plan ? {
                        id: sub.plan.id,
                        documentId: sub.plan.documentId,
                        name: sub.plan.name,
                        maxProperties: sub.plan.maxProperties,
                        maxUnitsPerProperty: sub.plan.maxUnitsPerProperty,
                    } : undefined,
                    scheduledDowngradePlan: sub.scheduledDowngradePlan ? {
                        id: sub.scheduledDowngradePlan.id,
                        documentId: sub.scheduledDowngradePlan.documentId,
                        name: sub.scheduledDowngradePlan.name,
                        maxProperties: sub.scheduledDowngradePlan.maxProperties,
                        maxUnitsPerProperty: sub.scheduledDowngradePlan.maxUnitsPerProperty,
                    } : null,
                }
                _lastFetched.value = now
            } else {
                _subscription.value = null
            }

            return _subscription.value
        } catch (err) {
            console.error('Error fetching subscription:', err)
            return null
        } finally {
            _isLoading.value = false
        }
    }

    async function checkAndUpdateExpired(): Promise<boolean> {
        const sub = await fetchSubscription()
        if (!sub) return true // No subscription = expired

        // Check if subscription has expired
        const endDate = new Date(sub.endDate)
        if (endDate < new Date() && sub.status !== 'expired') {
            // Update subscription status to expired
            try {
                await fetch(`${STRAPI_URL}/api/subscriptions/${sub.documentId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token.value}`,
                    },
                    body: JSON.stringify({
                        data: { status: 'expired' }
                    }),
                })
                _subscription.value = { ...sub, status: 'expired' }
            } catch (err) {
                console.error('Failed to update expired subscription:', err)
            }
            return true
        }

        return sub.status === 'expired' || sub.status === 'cancelled'
    }

    function clearCache() {
        _subscription.value = null
        _lastFetched.value = 0
    }

    // Check if manager needs subscription (no subscription or expired)
    const requiresSubscription = computed(() => {
        if (!user.value || user.value.role !== 'manager') return false
        if (!_subscription.value) return true
        return isExpired.value
    })

    return {
        subscription,
        isLoading,
        isActive,
        isExpired,
        isPending,
        daysRemaining,
        planLimits,
        hasScheduledDowngrade,
        scheduledDowngradePlan,
        requiresSubscription,
        fetchSubscription,
        checkAndUpdateExpired,
        clearCache,
    }
}
