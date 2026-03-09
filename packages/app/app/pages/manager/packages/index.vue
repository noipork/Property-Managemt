<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const { subscription, fetchSubscription, daysRemaining, isExpired, isPending, hasScheduledDowngrade, scheduledDowngradePlan } = useSubscription()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface Plan {
    id: number
    documentId: string
    name: string
    slug: string
    price: number
    currency: string
    maxProperties: number
    maxUnitsPerProperty: number
    features: string[]
    isActive: boolean
    sortOrder: number
}

interface DurationOption {
    months: number
    label: string
    discount: number // percentage discount
}

const plans = ref<Plan[]>([])
const isLoading = ref(true)
const isLoadingSubscription = ref(true)

// Duration options with discounts
const durationOptions: DurationOption[] = [
    { months: 1, label: '1month', discount: 0 },
    { months: 3, label: '3months', discount: 10 },
    { months: 6, label: '6months', discount: 15 },
    { months: 12, label: '1year', discount: 20 },
]

const selectedDuration = ref<number>(1) // Default to 1 month

function getDurationLabel(months: number): string {
    const option = durationOptions.find(d => d.months === months)
    if (!option) return ''

    const labels: Record<string, { en: string; th: string }> = {
        '1month': { en: '1 Month', th: '1 เดือน' },
        '3months': { en: '3 Months', th: '3 เดือน' },
        '6months': { en: '6 Months', th: '6 เดือน' },
        '1year': { en: '1 Year', th: '1 ปี' },
    }

    return lang.value === 'TH' ? labels[option.label].th : labels[option.label].en
}

function getDiscountedPrice(basePrice: number, months: number): number {
    const option = durationOptions.find(d => d.months === months)
    if (!option) return basePrice * months

    const totalPrice = basePrice * months
    const discountAmount = totalPrice * (option.discount / 100)
    return Math.round(totalPrice - discountAmount)
}

function getMonthlyEquivalent(basePrice: number, months: number): number {
    const discountedTotal = getDiscountedPrice(basePrice, months)
    return Math.round(discountedTotal / months)
}

function getDiscount(months: number): number {
    const option = durationOptions.find(d => d.months === months)
    return option?.discount || 0
}

// ─── Proration: calculate credit from current subscription ─────────────────
function getProratedUpgradePrice(plan: Plan, months: number): { finalPrice: number; credit: number } | null {
    if (!subscription.value || !activePlan.value) return null
    if (plan.sortOrder <= activePlan.value.sortOrder) return null // only for upgrades

    const sub = subscription.value
    if (!sub.endDate || !sub.startDate || !sub.amount || sub.amount <= 0) return null

    const now = new Date()
    const subEnd = new Date(sub.endDate)
    const subStart = new Date(sub.startDate)
    const totalDays = Math.max(1, Math.ceil((subEnd.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24)))
    const remainingDays = Math.max(0, Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    const remainingRatio = remainingDays / totalDays
    const credit = Math.round(sub.amount * remainingRatio)

    const newPlanTotal = getDiscountedPrice(plan.price, months)
    const finalPrice = Math.max(0, newPlanTotal - credit)

    return { finalPrice, credit }
}

// Plan tier styles based on sortOrder (1 = cheapest, 2 = mid, 3 = highest)
const planTierStyles: Record<number, { bg: string; border: string; text: string; icon: string; iconClass: string; btnBg: string }> = {
    1: {
        // Basic/Starter tier - Blue
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'text-blue-600 dark:text-blue-400',
        icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
        iconClass: 'fa-solid fa-leaf',
        btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    2: {
        // Professional tier - Purple
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-purple-200 dark:border-purple-800',
        text: 'text-purple-600 dark:text-purple-400',
        icon: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
        iconClass: 'fa-solid fa-rocket',
        btnBg: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
    3: {
        // Premium/Enterprise tier - Gold/Amber
        bg: 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20',
        border: 'border-amber-300 dark:border-amber-700',
        text: 'text-amber-600 dark:text-amber-400',
        icon: 'bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/40 text-amber-600 dark:text-amber-400',
        iconClass: 'fa-solid fa-crown',
        btnBg: 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white',
    },
}

// Default style for sortOrder outside 1-3
const defaultTierStyle = {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
    icon: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    iconClass: 'fa-solid fa-box',
    btnBg: 'bg-gray-600 hover:bg-gray-700 text-white',
}

function getPlanTierStyle(sortOrder: number) {
    return planTierStyles[sortOrder] || defaultTierStyle
}

function formatPrice(price: number, currency: string) {
    return new Intl.NumberFormat(lang.value === 'TH' ? 'th-TH' : 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price)
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

const activePlan = computed(() => {
    if (!subscription.value?.plan) return null
    return plans.value.find(p => p.id === subscription.value?.plan?.id) || null
})

const activePlanTierStyle = computed(() => {
    if (!activePlan.value) return defaultTierStyle
    return getPlanTierStyle(activePlan.value.sortOrder)
})

const subscriptionStatusColor = computed(() => {
    if (!subscription.value) return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    switch (subscription.value.status) {
        case 'active':
            return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        case 'trial':
            return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        case 'pending':
            return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        case 'expired':
            return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        case 'cancelled':
            return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        default:
            return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }
})

const paymentStatusColor = computed(() => {
    if (!subscription.value) return ''
    switch (subscription.value.paymentStatus) {
        case 'paid':
            return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        case 'pending':
            return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        case 'failed':
            return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        case 'refunded':
            return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        default:
            return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }
})

async function fetchPlans() {
    isLoading.value = true
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/plans?sort=sortOrder:asc&filters[isActive][$eq]=true`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        if (!res.ok) throw new Error('Failed to fetch plans')
        const data = await res.json()
        plans.value = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            name: p.name,
            slug: p.slug,
            price: p.price,
            currency: p.currency || 'THB',
            maxProperties: p.maxProperties,
            maxUnitsPerProperty: p.maxUnitsPerProperty,
            features: p.features || [],
            isActive: p.isActive,
            sortOrder: p.sortOrder,
        }))
    } catch (err) {
        console.error('Error fetching plans:', err)
    } finally {
        isLoading.value = false
    }
}

async function loadSubscription() {
    isLoadingSubscription.value = true
    try {
        await fetchSubscription(true)
    } finally {
        isLoadingSubscription.value = false
    }
}

// ─── Stripe Payment Integration ───────────────────────────────────────────────
const { redirectToCheckout, verifyCheckoutSuccess, downgradePlan, cancelScheduledDowngrade, isLoading: isPaymentLoading, error: paymentError } = useStripe()
const route = useRoute()
const router = useRouter()
const processingPlanId = ref<string | null>(null)
const showSuccessModal = ref(false)
const showErrorModal = ref(false)

// ─── Downgrade Confirmation Modal ─────────────────────────────────────────────
const showDowngradeModal = ref(false)
const downgradePlanTarget = ref<Plan | null>(null)
const isDowngrading = ref(false)
const showDowngradeErrorModal = ref(false)
const downgradeError = ref('')
const showDowngradeScheduledModal = ref(false)
const isCancellingDowngrade = ref(false)

async function handleSelectPlan(plan: Plan) {
    if (activePlan.value?.id === plan.id) return

    // Check if this is a downgrade (always 1 month)
    if (activePlan.value && plan.sortOrder < activePlan.value.sortOrder) {
        downgradePlanTarget.value = plan
        showDowngradeModal.value = true
        return
    }

    processingPlanId.value = plan.documentId

    const success = await redirectToCheckout(plan.documentId, selectedDuration.value)

    if (success && plan.price === 0) {
        // Free plan - refresh subscription and show success
        await fetchSubscription(true)
        showSuccessModal.value = true
    }

    processingPlanId.value = null
}

async function checkPaymentStatus() {
    const sessionId = route.query.session_id as string
    const success = route.query.success as string
    const cancelled = route.query.cancelled as string

    if (success && sessionId) {
        // Verify payment with backend
        const result = await verifyCheckoutSuccess(sessionId)

        if (result?.success) {
            // Refresh subscription data
            await fetchSubscription(true)
            showSuccessModal.value = true
        } else {
            showErrorModal.value = true
        }

        // Clean URL
        router.replace({ path: route.path })
    } else if (cancelled) {
        showErrorModal.value = true
        router.replace({ path: route.path })
    }
}

function closeSuccessModal() {
    showSuccessModal.value = false
}

function closeErrorModal() {
    showErrorModal.value = false
}

async function confirmDowngrade() {
    if (!downgradePlanTarget.value) return
    isDowngrading.value = true

    try {
        const result = await downgradePlan(downgradePlanTarget.value.documentId)

        if (result?.success) {
            await fetchSubscription(true)
            showDowngradeModal.value = false
            downgradePlanTarget.value = null
            showDowngradeScheduledModal.value = true
        } else {
            downgradeError.value = paymentError.value || 'Failed to schedule downgrade'
            showDowngradeModal.value = false
            downgradePlanTarget.value = null
            showDowngradeErrorModal.value = true
        }
    } catch (err: any) {
        downgradeError.value = err?.message || 'Failed to schedule downgrade'
        showDowngradeModal.value = false
        downgradePlanTarget.value = null
        showDowngradeErrorModal.value = true
    }

    isDowngrading.value = false
}

function cancelDowngrade() {
    showDowngradeModal.value = false
    downgradePlanTarget.value = null
}

function closeDowngradeErrorModal() {
    showDowngradeErrorModal.value = false
    downgradeError.value = ''
}

function closeDowngradeScheduledModal() {
    showDowngradeScheduledModal.value = false
}

async function handleCancelScheduledDowngrade() {
    isCancellingDowngrade.value = true
    try {
        const result = await cancelScheduledDowngrade()
        if (result?.success) {
            await fetchSubscription(true)
        }
    } catch (err) {
        console.error('Failed to cancel scheduled downgrade:', err)
    }
    isCancellingDowngrade.value = false
}

onMounted(() => {
    fetchPlans()
    loadSubscription()
    checkPaymentStatus()
})
</script>

<template>
    <div class="space-y-6">
        <!-- Header -->
        <Transition appear enter-active-class="transition-all duration-500" enter-from-class="opacity-0 -translate-y-3"
            enter-to-class="opacity-100 translate-y-0">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.packages }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.packagesSubtitle }}</p>
            </div>
        </Transition>

        <!-- Current Subscription Card -->
        <Transition appear enter-active-class="transition-all duration-500 delay-100"
            enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <i class="fa-solid fa-bookmark text-primary-600 dark:text-primary-400"></i>
                    {{ t.currentSubscription }}
                </h2>

                <!-- Loading -->
                <div v-if="isLoadingSubscription" class="flex items-center justify-center py-8">
                    <div class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                </div>

                <!-- No subscription -->
                <div v-else-if="!subscription" class="text-center py-8">
                    <div
                        class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <i class="fa-solid fa-box-open text-2xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">{{ t.noActiveSubscription }}</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500">{{ t.selectPlanBelow }}</p>
                </div>

                <!-- Subscription details -->
                <div v-else class="space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-start gap-4">
                        <!-- Plan info -->
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center"
                                    :class="activePlanTierStyle.icon">
                                    <i :class="activePlanTierStyle.iconClass" class="text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                                        {{ subscription.plan?.name || 'Unknown Plan' }}
                                    </h3>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                            :class="subscriptionStatusColor">
                                            {{ subscription.status.charAt(0).toUpperCase() +
                                                subscription.status.slice(1)
                                            }}
                                        </span>
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                            :class="paymentStatusColor">
                                            {{ t.payment }}: {{ subscription.paymentStatus }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- Plan limits -->
                            <div v-if="activePlan" class="grid grid-cols-2 gap-3 mb-4">
                                <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t.maxProperties }}</p>
                                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                                        {{ activePlan.maxProperties }}
                                    </p>
                                </div>
                                <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t.maxUnitsPerProperty }}
                                    </p>
                                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                                        {{ activePlan.maxUnitsPerProperty }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Subscription dates -->
                        <div
                            class="sm:w-64 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <div class="space-y-3">
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-gray-500 dark:text-gray-400">{{ t.startDate }}</span>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {{ formatDate(subscription.startDate) }}
                                    </span>
                                </div>
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-gray-500 dark:text-gray-400">{{ t.endDate }}</span>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {{ formatDate(subscription.endDate) }}
                                    </span>
                                </div>
                                <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <div class="flex items-center justify-between">
                                        <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.daysRemaining
                                            }}</span>
                                        <span class="text-lg font-bold" :class="daysRemaining <= 7
                                            ? 'text-red-600 dark:text-red-400'
                                            : daysRemaining <= 14
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : 'text-emerald-600 dark:text-emerald-400'">
                                            {{ daysRemaining }} {{ t.days }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Warning banners -->
                    <div v-if="isExpired"
                        class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <i class="fa-solid fa-triangle-exclamation text-red-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-red-700 dark:text-red-400">{{ t.subscriptionExpired }}</p>
                            <p class="text-sm text-red-600 dark:text-red-500">{{ t.subscriptionExpiredDesc }}</p>
                        </div>
                    </div>

                    <div v-else-if="isPending"
                        class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <i class="fa-solid fa-clock text-amber-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-amber-700 dark:text-amber-400">{{ t.paymentPending }}</p>
                            <p class="text-sm text-amber-600 dark:text-amber-500">{{ t.paymentPendingDesc }}</p>
                        </div>
                    </div>

                    <div v-else-if="daysRemaining <= 7"
                        class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <i class="fa-solid fa-bell text-amber-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-amber-700 dark:text-amber-400">{{ t.subscriptionExpiringSoon }}
                            </p>
                            <p class="text-sm text-amber-600 dark:text-amber-500">{{ t.subscriptionExpiringSoonDesc }}
                            </p>
                        </div>
                    </div>

                    <!-- Scheduled Downgrade Banner -->
                    <div v-if="hasScheduledDowngrade && scheduledDowngradePlan"
                        class="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <i class="fa-solid fa-calendar-check text-blue-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-blue-700 dark:text-blue-400">{{ t.scheduledDowngrade }}</p>
                            <p class="text-sm text-blue-600 dark:text-blue-500">
                                {{ t.scheduledDowngradeDesc.replace('{plan}',
                                    scheduledDowngradePlan.name).replace('{date}', formatDate(subscription?.endDate)) }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Available Plans -->
        <Transition appear enter-active-class="transition-all duration-500 delay-200"
            enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
            <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ t.availablePlans }}</h2>

                <!-- Duration Selector -->
                <div class="mb-6 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{{ t.selectDuration }}</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <button v-for="option in durationOptions" :key="option.months"
                            @click="selectedDuration = option.months"
                            class="relative px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium"
                            :class="selectedDuration === option.months
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'">
                            <span>{{ getDurationLabel(option.months) }}</span>
                            <span v-if="option.discount > 0"
                                class="absolute -top-2 -right-2 px-1.5 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded-full">
                                -{{ option.discount }}%
                            </span>
                        </button>
                    </div>
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="flex items-center justify-center py-12">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                </div>

                <!-- Plans grid -->
                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="plan in plans" :key="plan.id"
                        class="relative rounded-xl border-2 p-6 transition-all flex flex-col" :class="[
                            getPlanTierStyle(plan.sortOrder).bg,
                            activePlan?.id === plan.id
                                ? 'border-primary-500 dark:border-primary-400 ring-2 ring-primary-500/20'
                                : getPlanTierStyle(plan.sortOrder).border,
                            plan.sortOrder === 3 ? 'shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30' : '',
                        ]">
                        <!-- Popular badge for highest tier -->
                        <div v-if="plan.sortOrder === 3 && activePlan?.id !== plan.id"
                            class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                            <i class="fa-solid fa-fire mr-1"></i>
                            Popular
                        </div>

                        <!-- Current plan badge -->
                        <div v-if="activePlan?.id === plan.id"
                            class="absolute -top-3 left-4 px-3 py-1 bg-primary-600 text-white text-xs font-semibold rounded-full">
                            {{ t.currentPlan }}
                        </div>

                        <!-- Plan header -->
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center"
                                    :class="getPlanTierStyle(plan.sortOrder).icon">
                                    <i :class="getPlanTierStyle(plan.sortOrder).iconClass" class="text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ plan.name }}</h3>
                                    <p class="text-sm" :class="getPlanTierStyle(plan.sortOrder).text">
                                        {{ plan.slug }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Price -->
                        <div class="mb-4">
                            <div v-if="plan.price === 0" class="flex items-baseline gap-1">
                                <span class="text-3xl font-bold text-gray-900 dark:text-white">{{ t.free }}</span>
                            </div>
                            <div v-else>
                                <!-- Downgrade plans always show 1-month price -->
                                <template v-if="activePlan && plan.sortOrder < activePlan.sortOrder">
                                    <div class="flex items-baseline gap-1">
                                        <span class="text-3xl font-bold text-gray-900 dark:text-white">
                                            {{ formatPrice(plan.price, plan.currency) }}
                                        </span>
                                        <span class="text-sm text-gray-500 dark:text-gray-400">
                                            / {{ getDurationLabel(1) }}
                                        </span>
                                    </div>
                                    <p class="text-xs text-blue-500 dark:text-blue-400 mt-1">
                                        <i class="fa-solid fa-circle-info mr-1"></i>
                                        {{ t.downgradeAlways1Month }}
                                    </p>
                                </template>
                                <!-- Upgrade / new plans show selected duration price -->
                                <template v-else>
                                    <!-- Total price for selected duration -->
                                    <div class="flex items-baseline gap-1">
                                        <span class="text-3xl font-bold text-gray-900 dark:text-white">
                                            {{ formatPrice(getDiscountedPrice(plan.price, selectedDuration),
                                                plan.currency)
                                            }}
                                        </span>
                                        <span class="text-sm text-gray-500 dark:text-gray-400">
                                            / {{ getDurationLabel(selectedDuration) }}
                                        </span>
                                    </div>
                                    <!-- Original price if discounted -->
                                    <div v-if="getDiscount(selectedDuration) > 0" class="flex items-center gap-2 mt-1">
                                        <span class="text-sm text-gray-400 line-through">
                                            {{ formatPrice(plan.price * selectedDuration, plan.currency) }}
                                        </span>
                                        <span
                                            class="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-semibold">
                                            {{ t.savePct }} {{ getDiscount(selectedDuration) }}%
                                        </span>
                                    </div>
                                    <!-- Per month equivalent -->
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        ≈ {{ formatPrice(getMonthlyEquivalent(plan.price, selectedDuration),
                                            plan.currency)
                                        }}/{{ t.month }}
                                    </p>
                                </template>

                                <!-- Prorated upgrade price -->
                                <div v-if="getProratedUpgradePrice(plan, selectedDuration)"
                                    class="mt-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                    <div
                                        class="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                                        <i class="fa-solid fa-tag"></i>
                                        <span class="font-semibold">{{ t.upgradePrice }}:</span>
                                        <span class="font-bold">
                                            {{ formatPrice(getProratedUpgradePrice(plan, selectedDuration)!.finalPrice,
                                                plan.currency) }}
                                        </span>
                                    </div>
                                    <p class="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">
                                        {{ t.upgradeCredit }}: -{{ formatPrice(getProratedUpgradePrice(plan,
                                            selectedDuration)!.credit, plan.currency) }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Limits -->
                        <div class="space-y-2 mb-4">
                            <div class="flex items-center gap-2 text-sm">
                                <i class="fa-solid fa-building w-5" :class="getPlanTierStyle(plan.sortOrder).text"></i>
                                <span class="text-gray-600 dark:text-gray-300">
                                    {{ plan.maxProperties }} {{ t.properties }}
                                </span>
                            </div>
                            <div class="flex items-center gap-2 text-sm">
                                <i class="fa-solid fa-door-open w-5" :class="getPlanTierStyle(plan.sortOrder).text"></i>
                                <span class="text-gray-600 dark:text-gray-300">
                                    {{ plan.maxUnitsPerProperty }} {{ t.unitsPerProperty }}
                                </span>
                            </div>
                        </div>

                        <!-- Features -->
                        <div v-if="plan.features && plan.features.length > 0" class="space-y-2 mb-4 flex-1">
                            <div v-for="(feature, idx) in plan.features" :key="idx"
                                class="flex items-center gap-2 text-sm">
                                <i class="fa-solid fa-check w-5" :class="getPlanTierStyle(plan.sortOrder).text"></i>
                                <span class="text-gray-600 dark:text-gray-300">{{ feature }}</span>
                            </div>
                        </div>
                        <div v-else class="flex-1"></div>

                        <!-- Action button - Always at bottom -->
                        <div class="mt-auto pt-4">
                            <!-- Current active plan -->
                            <div v-if="activePlan?.id === plan.id"
                                class="w-full py-2.5 px-4 rounded-lg font-medium text-sm text-center bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                                <i class="fa-solid fa-check mr-1.5"></i>
                                {{ t.activePlan }}
                            </div>
                            <!-- Scheduled downgrade target plan -->
                            <div v-else-if="scheduledDowngradePlan?.id === plan.id"
                                class="w-full py-2.5 px-4 rounded-lg font-medium text-sm text-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                <i class="fa-solid fa-calendar-check mr-1.5"></i>
                                {{ t.scheduledLabel }}
                            </div>
                            <!-- Other plans: upgrade / downgrade / get started -->
                            <button v-else @click="handleSelectPlan(plan)"
                                :disabled="isPaymentLoading || processingPlanId === plan.documentId"
                                class="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                :class="getPlanTierStyle(plan.sortOrder).btnBg">
                                <span v-if="processingPlanId === plan.documentId"
                                    class="flex items-center justify-center gap-2">
                                    <span
                                        class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    {{ t.processing }}
                                </span>
                                <span v-else class="flex items-center justify-center gap-1.5">
                                    <template v-if="!activePlan">
                                        <i class="fa-solid fa-rocket text-xs"></i>
                                        {{ plan.price === 0 ? t.getStarted : t.selectPlan }}
                                    </template>
                                    <template v-else-if="plan.sortOrder > (activePlan?.sortOrder ?? 0)">
                                        <i class="fa-solid fa-arrow-up text-xs"></i>
                                        {{ t.upgradePlan }}
                                    </template>
                                    <template v-else>
                                        <i class="fa-solid fa-arrow-down text-xs"></i>
                                        {{ t.downgradePlan }}
                                    </template>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Success Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showSuccessModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    @click.self="closeSuccessModal">
                    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                        <!-- Success Header -->
                        <div class="relative bg-gradient-to-br from-emerald-500 to-green-500 px-6 py-8 text-center">
                            <!-- Close button -->
                            <button @click="closeSuccessModal"
                                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-xmark text-white text-sm"></i>
                            </button>
                            <div class="relative">
                                <div
                                    class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                    <i class="fa-solid fa-check text-4xl text-white"></i>
                                </div>
                                <h2 class="text-2xl font-bold text-white">{{ t.paymentSuccess }}</h2>
                            </div>
                        </div>

                        <!-- Success Body -->
                        <div class="px-6 py-6 text-center">
                            <p class="text-gray-600 dark:text-gray-300 mb-6">{{ t.paymentSuccessDesc }}</p>
                            <button @click="closeSuccessModal"
                                class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors">
                                {{ t.continue }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Error Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showErrorModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    @click.self="closeErrorModal">
                    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                        <!-- Error Header -->
                        <div class="relative bg-gradient-to-br from-amber-500 to-orange-500 px-6 py-8 text-center">
                            <!-- Close button -->
                            <button @click="closeErrorModal"
                                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-xmark text-white text-sm"></i>
                            </button>
                            <div class="relative">
                                <div
                                    class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                    <i class="fa-solid fa-triangle-exclamation text-4xl text-white"></i>
                                </div>
                                <h2 class="text-2xl font-bold text-white">{{ t.paymentCancelled }}</h2>
                            </div>
                        </div>

                        <!-- Error Body -->
                        <div class="px-6 py-6 text-center">
                            <p class="text-gray-600 dark:text-gray-300 mb-6">{{ t.paymentCancelledDesc }}</p>
                            <button @click="closeErrorModal"
                                class="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
                                {{ t.tryAgain }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Downgrade Confirmation Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDowngradeModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    @click.self="cancelDowngrade">
                    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                        <!-- Header -->
                        <div class="relative bg-gradient-to-br from-orange-500 to-red-500 px-6 py-8 text-center">
                            <button @click="cancelDowngrade"
                                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-xmark text-white text-sm"></i>
                            </button>
                            <div class="relative">
                                <div
                                    class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                    <i class="fa-solid fa-arrow-down text-4xl text-white"></i>
                                </div>
                                <h2 class="text-2xl font-bold text-white">{{ t.confirmDowngrade }}</h2>
                            </div>
                        </div>

                        <!-- Body -->
                        <div class="px-6 py-6">
                            <p class="text-gray-600 dark:text-gray-300 text-center mb-4">
                                {{ t.downgradeConfirmDesc }}
                            </p>

                            <!-- Plan change summary -->
                            <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4">
                                <div class="flex items-center justify-between gap-3">
                                    <!-- Current -->
                                    <div class="text-center flex-1">
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t.currentPlan }}</p>
                                        <p class="text-sm font-bold text-gray-900 dark:text-white">{{ activePlan?.name
                                            }}</p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {{ activePlan ? formatPrice(activePlan.price, activePlan.currency) : ''
                                            }}/{{
                                                t.month }}
                                        </p>
                                    </div>
                                    <!-- Arrow -->
                                    <div class="flex-shrink-0">
                                        <i class="fa-solid fa-arrow-right text-gray-400"></i>
                                    </div>
                                    <!-- New -->
                                    <div class="text-center flex-1">
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t.newPlan }}</p>
                                        <p class="text-sm font-bold text-gray-900 dark:text-white">{{
                                            downgradePlanTarget?.name
                                            }}</p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {{ downgradePlanTarget ? formatPrice(downgradePlanTarget.price,
                                                downgradePlanTarget.currency) : '' }}/{{ t.month }}
                                        </p>
                                        <p class="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">
                                            ({{ getDurationLabel(1) }})
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Effective date info -->
                            <div
                                class="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                                <i class="fa-solid fa-calendar-check text-blue-500 mt-0.5 flex-shrink-0"></i>
                                <p class="text-xs text-blue-700 dark:text-blue-400">
                                    {{ t.downgradeEffectiveInfo.replace('{date}', formatDate(subscription?.endDate)) }}
                                </p>
                            </div>

                            <!-- Warning -->
                            <div
                                class="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-6">
                                <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 flex-shrink-0"></i>
                                <p class="text-xs text-amber-700 dark:text-amber-400">
                                    {{ t.downgradeWarning }}
                                </p>
                            </div>

                            <!-- Buttons -->
                            <div class="flex gap-3">
                                <button @click="cancelDowngrade"
                                    class="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    {{ t.cancel }}
                                </button>
                                <button @click="confirmDowngrade" :disabled="isDowngrading"
                                    class="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <span v-if="isDowngrading" class="flex items-center justify-center gap-2">
                                        <span
                                            class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        {{ t.processing }}
                                    </span>
                                    <span v-else>{{ t.confirmDowngrade }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Downgrade Scheduled Success Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDowngradeScheduledModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    @click.self="closeDowngradeScheduledModal">
                    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                        <!-- Header -->
                        <div class="relative bg-gradient-to-br from-blue-500 to-indigo-500 px-6 py-8 text-center">
                            <button @click="closeDowngradeScheduledModal"
                                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-xmark text-white text-sm"></i>
                            </button>
                            <div class="relative">
                                <div
                                    class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                    <i class="fa-solid fa-calendar-check text-4xl text-white"></i>
                                </div>
                                <h2 class="text-2xl font-bold text-white">{{ t.downgradeScheduled }}</h2>
                            </div>
                        </div>
                        <!-- Body -->
                        <div class="px-6 py-6 text-center">
                            <p class="text-gray-600 dark:text-gray-300 mb-2">{{ t.downgradeScheduledDesc }}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                {{ t.downgradeEffectiveDate.replace('{date}', formatDate(subscription?.endDate)) }}
                            </p>
                            <button @click="closeDowngradeScheduledModal"
                                class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors">
                                {{ t.understood }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Downgrade Error Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
                <div v-if="showDowngradeErrorModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    @click.self="closeDowngradeErrorModal">
                    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                        <!-- Header -->
                        <div class="relative bg-gradient-to-br from-red-500 to-orange-500 px-6 py-8 text-center">
                            <button @click="closeDowngradeErrorModal"
                                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-xmark text-white text-sm"></i>
                            </button>
                            <div class="relative">
                                <div
                                    class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                    <i class="fa-solid fa-triangle-exclamation text-4xl text-white"></i>
                                </div>
                                <h2 class="text-2xl font-bold text-white">{{ t.downgradeFailed }}</h2>
                            </div>
                        </div>
                        <!-- Body -->
                        <div class="px-6 py-6 text-center">
                            <p class="text-gray-600 dark:text-gray-300 mb-6">
                                {{ downgradeError || t.downgradeFailedDesc }}
                            </p>
                            <button @click="closeDowngradeErrorModal"
                                class="w-full py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors">
                                {{ t.close }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
