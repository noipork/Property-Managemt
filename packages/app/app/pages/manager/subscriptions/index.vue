<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const { subscription, fetchSubscription, daysRemaining, isExpired, isPending, hasScheduledDowngrade, scheduledDowngradePlan } = useSubscription()
const { cancelScheduledDowngrade } = useStripe()
const isCancellingDowngrade = ref(false)

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubscriptionRecord {
    id: number
    documentId: string
    status: 'pending' | 'active' | 'expired' | 'cancelled' | 'trial'
    startDate: string
    endDate: string
    amount: number
    currency: string
    paymentMethod: string | null
    paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
    paidAt: string | null
    transactionId: string | null
    stripeSessionId: string | null
    invoiceNo: string | null
    notes: string | null
    createdAt: string
    plan?: {
        id: number
        documentId: string
        name: string
        slug: string
        price: number
        maxProperties: number
        maxUnitsPerProperty: number
        maxUnitTypesPerProperty: number
        maxBuildingsPerProperty: number
    }
}

// ─── Current Subscription ─────────────────────────────────────────────────────
const isLoadingCurrent = ref(true)

async function loadCurrentSubscription() {
    isLoadingCurrent.value = true
    try {
        await fetchSubscription(true)
    } finally {
        isLoadingCurrent.value = false
    }
}

// ─── History State ────────────────────────────────────────────────────────────
const allHistory = ref<SubscriptionRecord[]>([])
const isLoadingHistory = ref(true)
const filterStatus = ref('')

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [5, 10, 20, 50]

const filteredHistory = computed(() => {
    if (!filterStatus.value) return allHistory.value
    return allHistory.value.filter(s => s.status === filterStatus.value)
})

const totalCount = computed(() => filteredHistory.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const paginatedHistory = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredHistory.value.slice(start, start + pageSize.value)
})

watch(filterStatus, () => { currentPage.value = 1 })
watch(pageSize, () => { currentPage.value = 1 })

// ─── Fetch History ────────────────────────────────────────────────────────────
async function fetchHistory() {
    if (!token.value || !user.value) return
    isLoadingHistory.value = true
    try {
        const params = new URLSearchParams({
            'filters[user][id][$eq]': String(user.value.id),
            'populate[0]': 'plan',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '500',
        })

        const res = await fetch(`${STRAPI_URL}/api/subscriptions?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch subscription history')
        const data = await res.json()

        allHistory.value = (data.data ?? []).map((s: any) => ({
            id: s.id,
            documentId: s.documentId,
            status: s.status,
            startDate: s.startDate,
            endDate: s.endDate,
            amount: s.amount,
            currency: s.currency || 'THB',
            paymentMethod: s.paymentMethod,
            paymentStatus: s.paymentStatus,
            paidAt: s.paidAt,
            transactionId: s.transactionId,
            stripeSessionId: s.stripeSessionId,
            invoiceNo: s.invoiceNo,
            notes: s.notes,
            createdAt: s.createdAt,
            plan: s.plan ? {
                id: s.plan.id,
                documentId: s.plan.documentId,
                name: s.plan.name,
                slug: s.plan.slug,
                price: s.plan.price,
                maxProperties: s.plan.maxProperties,
                maxUnitsPerProperty: s.plan.maxUnitsPerProperty,
                maxUnitTypesPerProperty: s.plan.maxUnitTypesPerProperty,
                maxBuildingsPerProperty: s.plan.maxBuildingsPerProperty,
            } : undefined,
        }))
    } catch (err) {
        console.error('Error fetching history:', err)
    } finally {
        isLoadingHistory.value = false
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    trial: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const paymentStatusColors: Record<string, string> = {
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    active: t.value.active,
    trial: t.value.trial,
    pending: t.value.pending,
    expired: t.value.expired,
    cancelled: t.value.cancelled,
}))

const paymentStatusLabels = computed(() => ({
    paid: t.value.paid,
    pending: t.value.pending,
    failed: t.value.failed,
    refunded: t.value.refunded,
}))

const methodLabels = computed(() => ({
    creditCard: t.value.creditCard,
    bankTransfer: t.value.bankTransfer,
    promptPay: t.value.promptPay,
    cash: t.value.cash,
    free: t.value.free,
    other: t.value.other,
}))

const methodIcons: Record<string, string> = {
    creditCard: 'fa-solid fa-credit-card',
    bankTransfer: 'fa-solid fa-right-left',
    promptPay: 'fa-solid fa-mobile-screen',
    cash: 'fa-solid fa-money-bill',
    free: 'fa-solid fa-gift',
    other: 'fa-solid fa-wallet',
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

function formatDateTime(dateStr: string | null | undefined) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function formatCurrency(amount: number | null | undefined, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat(lang.value === 'TH' ? 'th-TH' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

const currentDaysRemaining = computed(() => {
    if (!subscription.value) return 0
    return daysRemaining.value
})

const daysRemainingColor = computed(() => {
    const d = currentDaysRemaining.value
    if (d <= 7) return 'text-red-600 dark:text-red-400'
    if (d <= 14) return 'text-amber-600 dark:text-amber-400'
    return 'text-emerald-600 dark:text-emerald-400'
})

const progressPercent = computed(() => {
    if (!subscription.value?.startDate || !subscription.value?.endDate) return 0
    const start = new Date(subscription.value.startDate).getTime()
    const end = new Date(subscription.value.endDate).getTime()
    const now = Date.now()
    const total = end - start
    if (total <= 0) return 100
    const elapsed = now - start
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
})

const progressColor = computed(() => {
    const p = progressPercent.value
    if (p >= 90) return 'bg-red-500'
    if (p >= 75) return 'bg-amber-500'
    return 'bg-emerald-500'
})

// ─── Expand Row ───────────────────────────────────────────────────────────────
const expandedId = ref<number | null>(null)

function toggleExpand(id: number) {
    expandedId.value = expandedId.value === id ? null : id
}

// ─── Animations ───────────────────────────────────────────────────────────────
const headerVisible = ref(false)
const cardVisible = ref(false)
const historyVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))

    await Promise.all([loadCurrentSubscription(), fetchHistory()])

    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        cardVisible.value = true
        setTimeout(() => { historyVisible.value = true }, 150)
    }))
})
</script>

<template>
    <div class="space-y-6">
        <!-- Header -->
        <div class="transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.subscriptions }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.subscriptionsSubtitle }}</p>
                </div>
                <NuxtLink to="/manager/packages"
                    class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                    <i class="fa-solid fa-crown text-xs"></i>
                    {{ t.managePlans }}
                </NuxtLink>
            </div>
        </div>

        <!-- ═══ Active Subscription Card ═══ -->
        <div class="transition-all duration-500 delay-100"
            :class="cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <!-- Card header -->
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-bookmark text-primary-600 dark:text-primary-400 text-lg"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.currentSubscription }}</h2>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.activeSubDesc }}</p>
                    </div>
                </div>

                <!-- Loading -->
                <div v-if="isLoadingCurrent" class="flex items-center justify-center py-16">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                </div>

                <!-- No subscription -->
                <div v-else-if="!subscription" class="text-center py-16 px-6">
                    <div
                        class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <i class="fa-solid fa-box-open text-3xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400 font-medium mb-2">{{ t.noActiveSubscription }}</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500 mb-6">{{ t.selectPlanBelow }}</p>
                    <NuxtLink to="/manager/packages"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-rocket text-xs"></i>
                        {{ t.getStarted }}
                    </NuxtLink>
                </div>

                <!-- Active subscription content -->
                <div v-else class="p-6">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Plan info -->
                        <div class="lg:col-span-2 space-y-5">
                            <!-- Plan name + status -->
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/20">
                                    <i class="fa-solid fa-crown text-2xl text-white"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                                        {{ subscription.plan?.name || 'Unknown Plan' }}
                                    </h3>
                                    <div class="flex flex-wrap items-center gap-2 mt-1.5">
                                        <span class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                            :class="statusColors[subscription.status]">
                                            {{ statusLabels[subscription.status] || subscription.status }}
                                        </span>
                                        <span
                                            class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                            :class="paymentStatusColors[subscription.paymentStatus]">
                                            <i class="fa-solid fa-circle text-[4px]"></i>
                                            {{ t.payment }}: {{ paymentStatusLabels[subscription.paymentStatus] ||
                                                subscription.paymentStatus }}
                                        </span>
                                    </div>
                                </div>
                                <div class="text-right flex-shrink-0">
                                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                        {{ formatCurrency(subscription.amount, subscription.currency) }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.totalPaid }}</p>
                                </div>
                            </div>

                            <!-- Limits -->
                            <div v-if="subscription.plan" class="grid grid-cols-4 gap-3">
                                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                    <div
                                        class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <i class="fa-solid fa-building text-blue-600 dark:text-blue-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.maxProperties }}</p>
                                        <p class="text-lg font-bold text-gray-900 dark:text-white">{{
                                            subscription.plan.maxProperties }}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                    <div
                                        class="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                        <i
                                            class="fa-solid fa-door-open text-purple-600 dark:text-purple-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.maxUnitsPerProperty }}
                                        </p>
                                        <p class="text-lg font-bold text-gray-900 dark:text-white">{{
                                            subscription.plan.maxUnitsPerProperty }}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                    <div
                                        class="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        <i class="fa-solid fa-grip text-emerald-600 dark:text-emerald-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.maxUnitTypesPerProperty
                                        }}
                                        </p>
                                        <p class="text-lg font-bold text-gray-900 dark:text-white">{{
                                            subscription.plan.maxUnitTypesPerProperty }}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                    <div
                                        class="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <i class="fa-solid fa-building text-amber-600 dark:text-amber-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.maxBuildingsPerProperty
                                            }}</p>
                                        <p class="text-lg font-bold text-gray-900 dark:text-white">{{
                                            subscription.plan.maxBuildingsPerProperty }}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Dates -->
                            <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                <div>
                                    <span class="text-gray-500 dark:text-gray-400">{{ t.startDate }}:</span>
                                    <span class="ml-1.5 font-medium text-gray-900 dark:text-white">{{
                                        formatDate(subscription.startDate) }}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500 dark:text-gray-400">{{ t.endDate }}:</span>
                                    <span class="ml-1.5 font-medium text-gray-900 dark:text-white">{{
                                        formatDate(subscription.endDate) }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Days remaining card -->
                        <div
                            class="flex flex-col items-center justify-center p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                            <p
                                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                {{ t.daysRemaining }}</p>
                            <p class="text-5xl font-black" :class="daysRemainingColor">{{ currentDaysRemaining }}</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">{{ t.daysLeft }}</p>
                            <!-- Progress bar -->
                            <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-500" :class="progressColor"
                                    :style="{ width: progressPercent + '%' }"></div>
                            </div>
                            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                                {{ progressPercent }}% {{ t.elapsed }}
                            </p>
                        </div>
                    </div>

                    <!-- Warning banners -->
                    <div v-if="isExpired"
                        class="flex items-center gap-3 p-4 mt-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <i class="fa-solid fa-triangle-exclamation text-red-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-red-700 dark:text-red-400">{{ t.subscriptionExpired }}</p>
                            <p class="text-sm text-red-600 dark:text-red-500">{{ t.subscriptionExpiredDesc }}</p>
                        </div>
                        <NuxtLink to="/manager/packages"
                            class="ml-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                            {{ t.viewPlans }}
                        </NuxtLink>
                    </div>

                    <div v-else-if="isPending"
                        class="flex items-center gap-3 p-4 mt-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <i class="fa-solid fa-clock text-amber-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-amber-700 dark:text-amber-400">{{ t.paymentPending }}</p>
                            <p class="text-sm text-amber-600 dark:text-amber-500">{{ t.paymentPendingDesc }}</p>
                        </div>
                    </div>

                    <div v-else-if="currentDaysRemaining <= 7 && currentDaysRemaining > 0"
                        class="flex items-center gap-3 p-4 mt-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <i class="fa-solid fa-bell text-amber-500 text-xl"></i>
                        <div>
                            <p class="font-medium text-amber-700 dark:text-amber-400">{{ t.subscriptionExpiringSoon }}
                            </p>
                            <p class="text-sm text-amber-600 dark:text-amber-500">{{ t.subscriptionExpiringSoonDesc }}
                            </p>
                        </div>
                        <NuxtLink to="/manager/packages"
                            class="ml-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                            {{ t.viewPlans }}
                        </NuxtLink>
                    </div>

                    <!-- Scheduled Downgrade Banner -->
                    <div v-if="hasScheduledDowngrade && scheduledDowngradePlan"
                        class="flex items-center gap-4 p-4 mt-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <div class="flex items-center gap-3 min-w-0">
                            <div
                                class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-calendar-check text-blue-600 dark:text-blue-400 text-lg"></i>
                            </div>
                            <div class="min-w-0">
                                <p class="font-medium text-blue-700 dark:text-blue-400">{{ t.scheduledDowngrade }}</p>
                                <p class="text-sm text-blue-600 dark:text-blue-500">
                                    {{ t.scheduledDowngradeDesc.replace('{plan}',
                                        scheduledDowngradePlan.name).replace('{date}', formatDate(subscription?.endDate)) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ Subscription History ═══ -->
        <div class="transition-all duration-500 delay-200"
            :class="historyVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div class="space-y-4">
                <!-- History header + filter -->
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-clock-rotate-left text-gray-400"></i>
                        {{ t.subscriptionHistory }}
                    </h2>
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <select v-model="filterStatus"
                                class="pl-3 pr-8 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option value="">{{ t.allStatuses }}</option>
                                <option value="active">{{ t.active }}</option>
                                <option value="trial">{{ t.trial }}</option>
                                <option value="pending">{{ t.pending }}</option>
                                <option value="expired">{{ t.expired }}</option>
                                <option value="cancelled">{{ t.cancelled }}</option>
                            </select>
                            <i
                                class="fa-solid fa-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                </div>

                <!-- Loading -->
                <div v-if="isLoadingHistory"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 flex items-center justify-center">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                </div>

                <!-- Empty state -->
                <div v-else-if="filteredHistory.length === 0"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                    <div
                        class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <i class="fa-solid fa-receipt text-2xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400 font-medium">{{ t.noSubscriptionHistory }}</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">{{ t.noSubscriptionHistoryDesc }}</p>
                </div>

                <!-- History list -->
                <div v-else class="space-y-2">
                    <div v-for="sub in paginatedHistory" :key="sub.id"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-700">

                        <!-- Row header — clickable to expand -->
                        <button @click="toggleExpand(sub.id)"
                            class="w-full flex items-center gap-4 px-5 py-4 text-left">
                            <!-- Plan icon -->
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="sub.status === 'active'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                : sub.status === 'trial'
                                    ? 'bg-blue-100 dark:bg-blue-900/30'
                                    : 'bg-gray-100 dark:bg-gray-800'">
                                <i :class="sub.status === 'active'
                                    ? 'fa-solid fa-crown text-emerald-600 dark:text-emerald-400'
                                    : sub.status === 'trial'
                                        ? 'fa-solid fa-star text-blue-600 dark:text-blue-400'
                                        : 'fa-solid fa-box text-gray-400'" class="text-lg"></i>
                            </div>

                            <!-- Plan name + dates -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                        {{ sub.plan?.name || 'Unknown' }}
                                    </p>
                                    <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                        :class="statusColors[sub.status]">
                                        {{ statusLabels[sub.status] || sub.status }}
                                    </span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {{ formatDate(sub.startDate) }} — {{ formatDate(sub.endDate) }}
                                </p>
                            </div>

                            <!-- Amount -->
                            <div class="text-right flex-shrink-0 hidden sm:block">
                                <p class="text-sm font-bold text-gray-900 dark:text-white">
                                    {{ formatCurrency(sub.amount, sub.currency) }}
                                </p>
                                <span class="inline-flex items-center gap-1 text-[10px] font-medium mt-0.5"
                                    :class="paymentStatusColors[sub.paymentStatus]?.replace('bg-', 'text-').replace('dark:bg-', 'dark:text-').replace(/\/\d+/g, '')">
                                    {{ paymentStatusLabels[sub.paymentStatus] || sub.paymentStatus }}
                                </span>
                            </div>

                            <!-- Amount for mobile -->
                            <p class="text-sm font-bold text-gray-900 dark:text-white sm:hidden">
                                {{ formatCurrency(sub.amount, sub.currency) }}
                            </p>

                            <!-- Expand icon -->
                            <i class="fa-solid fa-chevron-down text-gray-400 text-xs transition-transform duration-200 flex-shrink-0"
                                :class="{ 'rotate-180': expandedId === sub.id }"></i>
                        </button>

                        <!-- Expanded details -->
                        <Transition enter-active-class="transition-all duration-200 ease-out"
                            enter-from-class="opacity-0 max-h-0" enter-to-class="opacity-100 max-h-96"
                            leave-active-class="transition-all duration-150 ease-in"
                            leave-from-class="opacity-100 max-h-96" leave-to-class="opacity-0 max-h-0">
                            <div v-if="expandedId === sub.id"
                                class="px-5 pb-5 pt-0 border-t border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                                    <!-- Payment Status -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.paymentStatus }}</p>
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                            :class="paymentStatusColors[sub.paymentStatus]">
                                            {{ paymentStatusLabels[sub.paymentStatus] || sub.paymentStatus }}
                                        </span>
                                    </div>

                                    <!-- Payment Method -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.paymentMethod }}</p>
                                        <span v-if="sub.paymentMethod"
                                            class="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                                            <i :class="methodIcons[sub.paymentMethod] || 'fa-solid fa-wallet'"
                                                class="text-xs text-gray-400"></i>
                                            {{ methodLabels[sub.paymentMethod as keyof typeof methodLabels] ||
                                                sub.paymentMethod }}
                                        </span>
                                        <span v-else class="text-sm text-gray-400">—</span>
                                    </div>

                                    <!-- Invoice -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.invoiceNo }}</p>
                                        <p class="text-sm text-gray-700 dark:text-gray-300 font-mono">
                                            {{ sub.invoiceNo || '—' }}
                                        </p>
                                    </div>

                                    <!-- Paid At -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.paidAt }}</p>
                                        <p class="text-sm text-gray-700 dark:text-gray-300">
                                            {{ formatDateTime(sub.paidAt) }}
                                        </p>
                                    </div>

                                    <!-- Transaction ID -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.transactionId }}</p>
                                        <p class="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                                            :title="sub.transactionId || undefined">
                                            {{ sub.transactionId || '—' }}
                                        </p>
                                    </div>

                                    <!-- Created -->
                                    <div>
                                        <p
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                            {{ t.createdAt }}</p>
                                        <p class="text-sm text-gray-700 dark:text-gray-300">
                                            {{ formatDateTime(sub.createdAt) }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Notes -->
                                <div v-if="sub.notes" class="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                    <p
                                        class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                        {{ t.notes }}</p>
                                    <p class="text-sm text-gray-600 dark:text-gray-300">{{ sub.notes }}</p>
                                </div>
                            </div>
                        </Transition>
                    </div>

                    <!-- Pagination -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{{ totalCount }} {{ t.subscriptionsFound }}</span>
                            <div class="flex items-center gap-1.5">
                                <span>{{ t.perPage }}</span>
                                <div class="relative">
                                    <select v-model="pageSize"
                                        class="pl-2 pr-6 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                                    </select>
                                    <i
                                        class="fa-solid fa-chevron-down absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-1">
                            <button @click="currentPage = 1" :disabled="currentPage === 1"
                                class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                                <i class="fa-solid fa-angles-left text-xs"></i>
                            </button>
                            <button @click="currentPage--" :disabled="currentPage === 1"
                                class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                                <i class="fa-solid fa-chevron-left text-xs"></i>
                            </button>
                            <span class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                                {{ t.page }} {{ currentPage }} {{ t.of }} {{ totalPages || 1 }}
                            </span>
                            <button @click="currentPage++" :disabled="currentPage >= totalPages"
                                class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                                <i class="fa-solid fa-chevron-right text-xs"></i>
                            </button>
                            <button @click="currentPage = totalPages" :disabled="currentPage >= totalPages"
                                class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                                <i class="fa-solid fa-angles-right text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
