<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface Payment {
    id: number
    documentId: string
    refNo: string
    amount: number
    currency: string
    method: string
    date: string
    status: string
    transactionId: string | null
    notes: string | null
    paymentSlip: { id: number; url: string; name: string } | null
    billing: { id: number; invoiceNo: string; amount: number; type: string } | null
    property: { id: number; name: string; city: string } | null
}

// ─── State ────────────────────────────────────────────────────────────────────
const allPayments = ref<Payment[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const searchQuery = ref('')
const filterMethod = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

// ─── Computed ─────────────────────────────────────────────────────────────────
const filteredPayments = computed(() => {
    let result = allPayments.value
    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
        result = result.filter(p =>
            p.refNo.toLowerCase().includes(query) ||
            p.billing?.invoiceNo.toLowerCase().includes(query) ||
            p.transactionId?.toLowerCase().includes(query)
        )
    }
    if (filterMethod.value) {
        result = result.filter(p => p.method === filterMethod.value)
    }
    if (filterStatus.value) {
        result = result.filter(p => p.status === filterStatus.value)
    }
    return result
})

const totalCount = computed(() => filteredPayments.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const payments = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredPayments.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50]

const stats = computed(() => {
    const all = allPayments.value
    const completed = all.filter(p => p.status === 'completed')
    const pending = all.filter(p => p.status === 'pending' || p.status === 'reviewing')
    const totalPaid = completed.reduce((sum, p) => sum + p.amount, 0)
    const currency = all[0]?.currency || 'THB'
    return {
        totalPaid,
        completedCount: completed.length,
        pendingCount: pending.length,
        currency,
    }
})

const emptyTitle = computed(() =>
    allPayments.value.length === 0
        ? (t.value.noPaymentHistory || 'No payment history')
        : (t.value.noPayments || 'No matching payments')
)

const emptyDesc = computed(() =>
    allPayments.value.length === 0
        ? (t.value.noPaymentHistoryDesc || 'Your payment records will appear here.')
        : 'Try adjusting your search or filters.'
)

const ui = computed(() => ({
    retry: t.value.retry || 'Retry',
    searchPayments: t.value.searchPayments || 'Search by ref no. or invoice...',
    allMethods: t.value.allPaymentMethods || 'All Methods',
    allStatuses: t.value.allPaymentStatuses || 'All Statuses',
    perPage: t.value.perPage || 'per page',
    page: t.value.page || 'Page',
    of: t.value.of || 'of',
    paymentsFound: t.value.paymentsFound || 'payment',
    paymentsFoundPlural: t.value.paymentsFoundPlural || 'payments',
}))

// ─── Payment Types/Status ─────────────────────────────────────────────────────
const paymentMethods = ['creditCard', 'bankTransfer', 'cash', 'promptPay', 'other']
const paymentStatuses = ['pending', 'reviewing', 'completed', 'failed', 'refunded']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusDotColors: Record<string, string> = {
    pending: 'bg-amber-500',
    reviewing: 'bg-blue-500',
    completed: 'bg-emerald-500',
    failed: 'bg-red-500',
    refunded: 'bg-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending || 'Pending',
    reviewing: t.value.reviewing || 'Reviewing',
    completed: t.value.completed || 'Completed',
    failed: t.value.failed || 'Failed',
    refunded: t.value.refunded || 'Refunded',
}))

const methodLabels = computed(() => ({
    creditCard: t.value.creditCard || 'Credit Card',
    bankTransfer: t.value.bankTransfer || 'Bank Transfer',
    cash: t.value.cash || 'Cash',
    promptPay: t.value.promptPay || 'PromptPay',
    other: t.value.other || 'Other',
}))

const methodIcons: Record<string, string> = {
    creditCard: 'fa-solid fa-credit-card',
    bankTransfer: 'fa-solid fa-building-columns',
    cash: 'fa-solid fa-money-bill',
    promptPay: 'fa-solid fa-mobile-screen-button',
    other: 'fa-solid fa-wallet',
}

const methodIconColors: Record<string, string> = {
    creditCard: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30',
    bankTransfer: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    cash: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
    promptPay: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
    other: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
}

const activeFilterCount = computed(() =>
    [filterMethod.value, filterStatus.value, searchQuery.value.trim()].filter(Boolean).length
)



// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// ─── Fetch Payments ───────────────────────────────────────────────────────────
async function fetchPayments() {
    if (!user.value?.documentId) return
    isLoading.value = true
    errorMessage.value = ''
    try {
        const params = new URLSearchParams({
            'filters[resident][documentId][$eq]': user.value.documentId,
            'populate[0]': 'billing',
            'populate[1]': 'property',
            'populate[2]': 'paymentSlip',
            'pagination[pageSize]': '1000',
            'sort[0]': 'id:desc',
        })
        const res = await fetch(`${STRAPI_URL}/api/payments?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch payments')
        const data = await res.json()
        allPayments.value = (data.data ?? []).map((item: any) => ({
            ...item,
            billing: item.billing ?? null,
            property: item.property ?? null,
            paymentSlip: item.paymentSlip ?? null,
        }))
    } catch (err) {
        errorMessage.value = t.value.noPaymentHistory || 'Could not load payments'
    } finally {
        isLoading.value = false
    }
}

// ─── Watch & Lifecycle ────────────────────────────────────────────────────────
watch(searchQuery, () => { currentPage.value = 1 })
watch([filterMethod, filterStatus], () => { currentPage.value = 1 })
watch(pageSize, () => { currentPage.value = 1 })

// ─── Entry Animations ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const statsVisible = ref(false)
const filtersVisible = ref(false)
const listVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchPayments()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        statsVisible.value = true
        filtersVisible.value = true
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 pb-20 sm:pb-6">
        <!-- Page Header -->
        <div class="transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.paymentHistory }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.paymentHistorySubtitle }}</p>
        </div>

        <!-- Error State -->
        <div v-if="!isLoading && errorMessage" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <button @click="fetchPayments" class="mt-4 text-sm text-primary-600 hover:underline">{{ ui.retry }}</button>
        </div>

        <!-- Main Content -->
        <template v-else>
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 transition-all duration-500 delay-100"
                :class="statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
                <!-- Total Paid -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.completed }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                        {{ formatCurrency(stats.totalPaid, stats.currency) }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ stats.completedCount }} {{ t.completed?.toLowerCase() }}
                    </p>
                </div>

                <!-- Pending -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-clock text-amber-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.pending }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ stats.pendingCount }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t.pending?.toLowerCase() }}</p>
                </div>

                <!-- Total Payments -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 col-span-2 sm:col-span-1">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-wallet text-primary-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.total }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ allPayments.length }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t.paymentHistory?.toLowerCase() }}</p>
                </div>
            </div>

            <!-- Search + Filters -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-200"
                :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
                <div class="relative">
                    <i
                        class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input v-model="searchQuery" type="text" :placeholder="ui.searchPayments"
                        class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div class="flex flex-wrap gap-2 items-center">
                    <!-- Method -->
                    <div class="relative">
                        <select v-model="filterMethod"
                            class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                            <option value="">{{ ui.allMethods }}</option>
                            <option v-for="m in paymentMethods" :key="m" :value="m">
                                {{ methodLabels[m as keyof typeof methodLabels] || m }}
                            </option>
                        </select>
                        <i
                            class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                    </div>
                    <!-- Status -->
                    <div class="relative">
                        <select v-model="filterStatus"
                            class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                            <option value="">{{ ui.allStatuses }}</option>
                            <option v-for="s in paymentStatuses" :key="s" :value="s">
                                {{ statusLabels[s as keyof typeof statusLabels] || s }}
                            </option>
                        </select>
                        <i
                            class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                    </div>
                    <!-- Clear -->
                    <button v-if="activeFilterCount > 0" @click="filterMethod = ''; filterStatus = ''; searchQuery = ''"
                        class="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors">
                        <i class="fa-solid fa-xmark text-xs"></i>
                        Clear ({{ activeFilterCount }})
                    </button>
                </div>
            </div>

            <!-- Loading -->
            <div v-if="isLoading" class="flex items-center justify-center py-20">
                <div class="flex flex-col items-center gap-3">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingPayments }}</p>
                </div>
            </div>

            <!-- Empty -->
            <div v-if="!isLoading && filteredPayments.length === 0"
                class="flex flex-col items-center justify-center py-20 text-center">
                <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <i class="fa-solid fa-wallet text-2xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ emptyTitle }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ emptyDesc }}</p>
            </div>

            <!-- Payment Card List -->
            <div v-if="!isLoading && payments.length > 0" class="space-y-3">
                <NuxtLink v-for="(payment, index) in payments" :key="payment.id"
                    :to="`/resident/payment-history/${payment.id}`"
                    class="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                    :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                    :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }">
                    <div class="flex items-center gap-4">
                        <!-- Method Icon -->
                        <div class="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            :class="methodIconColors[payment.method] || methodIconColors.other">
                            <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xl"></i>
                        </div>

                        <!-- Main Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate text-sm">
                                    {{ payment.refNo }}
                                </h3>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[payment.status] || statusColors.pending">
                                    {{ statusLabels[payment.status as keyof typeof statusLabels] || payment.status }}
                                </span>
                            </div>
                            <p v-if="payment.billing" class="text-sm text-gray-500 dark:text-gray-400 truncate">
                                <i class="fa-solid fa-receipt text-xs mr-1"></i>{{ payment.billing.invoiceNo }}
                            </p>
                            <div class="flex items-center gap-3 mt-1">
                                <span class="inline-flex items-center gap-1 text-xs text-gray-400">
                                    <i class="fa-solid fa-calendar text-[10px]"></i>
                                    {{ formatDate(payment.date) }}
                                </span>
                            </div>
                        </div>

                        <!-- Method Badge (desktop) -->
                        <div class="hidden sm:block text-center min-w-[100px]">
                            <span
                                class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                                <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xs"></i>
                                {{ methodLabels[payment.method as keyof typeof methodLabels] || payment.method }}
                            </span>
                        </div>

                        <!-- Amount -->
                        <div class="hidden sm:block text-right min-w-[110px]">
                            <p class="text-sm font-bold text-gray-900 dark:text-white">
                                {{ formatCurrency(payment.amount, payment.currency) }}
                            </p>
                        </div>

                        <!-- Arrow -->
                        <i class="fa-solid fa-chevron-right text-xs text-gray-300 dark:text-gray-600 shrink-0"></i>
                    </div>

                    <!-- Mobile extra row -->
                    <div
                        class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                        <span
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                            <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xs"></i>
                            {{ methodLabels[payment.method as keyof typeof methodLabels] || payment.method }}
                        </span>
                        <span class="text-sm font-bold text-gray-900 dark:text-white">
                            {{ formatCurrency(payment.amount, payment.currency) }}
                        </span>
                        <span class="text-xs text-gray-400 ml-auto">{{ formatDate(payment.date) }}</span>
                    </div>
                </NuxtLink>

                <!-- Pagination -->
                <div v-if="totalPages > 1"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{{ totalCount }} {{ totalCount !== 1 ? ui.paymentsFoundPlural : ui.paymentsFound }}</span>
                        <div class="flex items-center gap-1.5">
                            <span>{{ ui.perPage }}</span>
                            <div class="relative">
                                <select v-model="pageSize"
                                    class="pl-2 pr-6 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                    <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                                </select>
                                <i
                                    class="fa-solid fa-chevron-down absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
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
                            <i class="fa-solid fa-angle-left text-xs"></i>
                        </button>
                        <span class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                            {{ ui.page }} {{ currentPage }} {{ ui.of }} {{ totalPages }}
                        </span>
                        <button @click="currentPage++" :disabled="currentPage >= totalPages"
                            class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                            <i class="fa-solid fa-angle-right text-xs"></i>
                        </button>
                        <button @click="currentPage = totalPages" :disabled="currentPage >= totalPages"
                            class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                            <i class="fa-solid fa-angles-right text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </template>


    </div>
</template>
