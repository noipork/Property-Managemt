interface PlanLimits {
    maxProperties: number
    maxUnitsPerProperty: number
    planName: string
}

export const usePlanLimit = () => {
    const { token, user } = useAuth()
    const { subscription, fetchSubscription, isExpired } = useSubscription()
    const config = useRuntimeConfig()
    const STRAPI_URL = config.public.strapiUrl

    async function fetchPlanLimits(): Promise<PlanLimits | null> {
        if (!token.value) return null
        
        // Try to get limits from active subscription first
        const sub = await fetchSubscription()
        if (sub?.plan) {
            return {
                maxProperties: sub.plan.maxProperties ?? 999,
                maxUnitsPerProperty: sub.plan.maxUnitsPerProperty ?? 999,
                planName: sub.plan.name ?? '',
            }
        }

        // Fallback to user's plan if no subscription
        try {
            const res = await fetch(`${STRAPI_URL}/api/users/me?populate=*`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
            if (!res.ok) return null
            const userData = await res.json()
            const plan = userData.plan
            if (!plan) return null
            return {
                maxProperties: plan.maxProperties ?? 999,
                maxUnitsPerProperty: plan.maxUnitsPerProperty ?? 999,
                planName: plan.name ?? '',
            }
        } catch {
            return null
        }
    }

    async function fetchPropertyCount(): Promise<number> {
        if (!token.value) return 0
        try {
            const params = new URLSearchParams({ 'pagination[pageSize]': '1' })
            if (user.value?.documentId) {
                params.set('filters[owner][documentId][$eq]', user.value.documentId)
            }
            const res = await fetch(`${STRAPI_URL}/api/properties?${params}`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
            if (!res.ok) return 0
            const json = await res.json()
            return json.meta?.pagination?.total ?? 0
        } catch {
            return 0
        }
    }

    /**
     * Check if the user can create a new property.
     * Returns { allowed: true } or { allowed: false, reason, current, limit, planName }
     */
    async function canCreateProperty() {
        // First check if subscription is expired
        if (isExpired.value) {
            return {
                allowed: false,
                reason: 'subscriptionExpired' as const,
                message: 'Your subscription has expired. Please renew to continue.',
            }
        }

        const [limits, count] = await Promise.all([fetchPlanLimits(), fetchPropertyCount()])
        if (!limits) return { allowed: true }
        if (count >= limits.maxProperties) {
            return {
                allowed: false,
                reason: 'propertyLimit' as const,
                current: count,
                limit: limits.maxProperties,
                planName: limits.planName,
            }
        }
        return { allowed: true, limits }
    }

    /**
     * Check if a given totalUnits value exceeds the plan's maxUnitsPerProperty.
     */
    async function canSetUnits(totalUnits: number) {
        // First check if subscription is expired
        if (isExpired.value) {
            return {
                allowed: false,
                reason: 'subscriptionExpired' as const,
                message: 'Your subscription has expired. Please renew to continue.',
            }
        }

        const limits = await fetchPlanLimits()
        if (!limits) return { allowed: true }
        if (totalUnits > limits.maxUnitsPerProperty) {
            return {
                allowed: false,
                reason: 'unitLimit' as const,
                limit: limits.maxUnitsPerProperty,
                planName: limits.planName,
            }
        }
        return { allowed: true, limits }
    }

    return { fetchPlanLimits, fetchPropertyCount, canCreateProperty, canSetUnits, isExpired }
}
