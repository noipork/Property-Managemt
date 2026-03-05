<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Types ────────────────────────────────────────────────────────────────────
interface Bill {
    id: number
    documentId: string
    invoiceNo: string
    type: string
    description: string
    amount: number
    currency: string
    dueDate: string
    status: string
    paidDate: string | null
    paidAmount: number | null
    notes: string | null
    unitTypePrice: number | null
    electricMeterStart: number | null
    electricMeterEnd: number | null
    electricUnitPrice: number | null
    electricUnitsUsed: number | null
    electricAmount: number | null
    waterMeterStart: number | null
    waterMeterEnd: number | null
    waterUnitPrice: number | null
    waterUnitsUsed: number | null
    waterAmount: number | null
    property: { id: number; documentId: string; name: string; city: string } | null
}

// ─── State ────────────────────────────────────────────────────────────────────
const allBills = ref<Bill[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)

const filteredBills = computed(() => {
    let bills = allBills.value
    if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase()
        bills = bills.filter(b =>
            b.invoiceNo.toLowerCase().includes(q) ||
            b.description.toLowerCase().includes(q)
        )
    }
    if (filterType.value) {
        bills = bills.filter(b => b.type === filterType.value)
    }
    if (filterStatus.value) {
        bills = bills.filter(b => b.status === filterStatus.value)
    }
    return bills
})

const totalCount = computed(() => filteredBills.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const bills = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredBills.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50]

// ─── Toast ────────────────────────────────────────────────────────────────────
const toasts = ref<{ id: number; type: 'success' | 'error'; message: string }[]>([])
let toastId = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastId
    toasts.value.push({ id, type, message })
    setTimeout(() => dismissToast(id), 4000)
}
function dismissToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
}

// ─── Status / Type helpers ────────────────────────────────────────────────────
const billStatuses = ['pending', 'paid', 'overdue', 'partiallyPaid', 'cancelled']
const billTypes = ['monthlyRent', 'utilities', 'maintenance', 'deposit', 'lateFee', 'other']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusDotColors: Record<string, string> = {
    pending: 'bg-amber-500',
    paid: 'bg-emerald-500',
    overdue: 'bg-red-500',
    partiallyPaid: 'bg-blue-500',
    cancelled: 'bg-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending || 'Pending',
    paid: t.value.paid || 'Paid',
    overdue: t.value.overdue || 'Overdue',
    partiallyPaid: t.value.partiallyPaid || 'Partially Paid',
    cancelled: t.value.cancelled || 'Cancelled',
}))

const typeLabels = computed(() => ({
    monthlyRent: t.value.monthlyRent || 'Monthly Rent',
    utilities: t.value.utilities || 'Utilities',
    maintenance: t.value.maintenance || 'Maintenance',
    deposit: t.value.deposit || 'Security Deposit',
    lateFee: t.value.lateFee || 'Late Fee',
    other: t.value.other || 'Other',
}))

const typeIcons: Record<string, string> = {
    monthlyRent: 'fa-solid fa-house',
    utilities: 'fa-solid fa-bolt',
    maintenance: 'fa-solid fa-wrench',
    deposit: 'fa-solid fa-shield-halved',
    lateFee: 'fa-solid fa-circle-exclamation',
    other: 'fa-solid fa-file-lines',
}

const typeIconColors: Record<string, string> = {
    monthlyRent: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30',
    utilities: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
    maintenance: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30',
    deposit: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30',
    lateFee: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    other: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
}

const activeFilterCount = computed(() =>
    [filterType.value, filterStatus.value].filter(Boolean).length
)

// ─── Summary Stats ────────────────────────────────────────────────────────────
const stats = computed(() => {
    const all = allBills.value
    const totalOutstanding = all
        .filter(b => b.status === 'pending' || b.status === 'overdue' || b.status === 'partiallyPaid')
        .reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0)
    const totalPaid = all
        .filter(b => b.status === 'paid')
        .reduce((sum, b) => sum + b.amount, 0)
    const overdueCount = all.filter(b => b.status === 'overdue').length
    const pendingCount = all.filter(b => b.status === 'pending').length
    const currency = all[0]?.currency || 'THB'
    return { totalOutstanding, totalPaid, overdueCount, pendingCount, currency }
})

const emptyTitle = computed(() =>
    allBills.value.length === 0
        ? (t.value.noBillingHistory || 'No bills found')
        : (t.value.noInvoices || 'No matching bills')
)
const emptyDesc = computed(() =>
    allBills.value.length === 0
        ? (t.value.noPaymentHistory || 'Your billing records will appear here.')
        : 'Try adjusting your search or filters.'
)

// ─── UI Labels ────────────────────────────────────────────────────────────────
const ui = computed(() => ({
    retry: t.value.retry || 'Retry',
    total: t.value.total || 'Total',
    invoice: t.value.invoice || 'invoice',
    invoicesPlural: t.value.invoicesFoundPlural || 'invoices',
    invoiceNo: t.value.invoiceNo || 'Invoice No.',
    invoiceType: t.value.invoiceType || 'Type',
    invoiceDetails: t.value.invoiceDetails || 'Invoice Details',
    invoiceCurrency: t.value.invoiceCurrency || 'Currency',
    invoicePaidDate: t.value.invoicePaidDate || 'Paid Date',
    invoicePaidAmount: t.value.invoicePaidAmount || 'Paid Amount',
    invoiceProperty: t.value.invoiceProperty || 'Property',
    breakdown: t.value.invoiceDetails || 'Breakdown',
    roomRent: t.value.roomRent || 'Room Rent',
    electricMeter: t.value.electricMeter || 'Electric',
    waterMeter: t.value.waterMeter || 'Water',
    totalAmount: t.value.totalAmount || 'Total',
    notes: t.value.notes || 'Notes',
    close: t.value.close || 'Close',
    searchInvoices: t.value.searchInvoices || 'Search by invoice no. or description...',
    allTypes: t.value.allInvoiceTypes || 'All Types',
    allStatuses: t.value.allInvoiceStatuses || 'All Statuses',
    perPage: t.value.perPage || 'per page',
    page: t.value.page || 'Page',
    of: t.value.of || 'of',
    billsFound: t.value.invoicesFound || 'bill',
    billsFoundPlural: t.value.invoicesFoundPlural || 'bills',
}))

// ─── Detail Modal ─────────────────────────────────────────────────────────────
const selectedBill = ref<Bill | null>(null)
const showDetailModal = ref(false)

function openDetail(bill: Bill) {
    selectedBill.value = bill
    showDetailModal.value = true
}
function closeDetail() {
    showDetailModal.value = false
    selectedBill.value = null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function isOverdue(bill: Bill) {
    if (bill.status === 'paid' || bill.status === 'cancelled') return false
    return new Date(bill.dueDate) < new Date()
}

function daysUntilDue(bill: Bill) {
    const due = new Date(bill.dueDate)
    const now = new Date()
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Fetch Bills ──────────────────────────────────────────────────────────────
async function fetchBills() {
    isLoading.value = true
    errorMessage.value = ''
    try {
        if (!user.value?.documentId) throw new Error('Missing user documentId')

        const params = new URLSearchParams({
            'filters[resident][documentId][$eq]': user.value.documentId,
            'populate[0]': 'property',
            'populate[1]': 'resident',
            'pagination[pageSize]': '500',
            'sort[0]': 'id:desc',
        })

        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()

        allBills.value = (data.data || []).map((item: any) => ({
            ...item,
            property: item.property ?? null,
        }))
        currentPage.value = 1
    } catch {
        errorMessage.value = t.value.noBillingHistory || 'Could not load bills'
    } finally {
        isLoading.value = false
    }
}

watch([searchQuery, filterType, filterStatus], () => { currentPage.value = 1 })
watch(pageSize, () => { currentPage.value = 1 })

// ─── Entry Animation ──────────────────────────────────────────────────────────
const headerVisible = ref(false)
const statsVisible = ref(false)
const listVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchBills()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        statsVisible.value = true
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 max-w-5xl mx-auto">
        <!-- Toast -->
        <Teleport to="body">
            <div class="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"
                style="min-width:300px;max-width:400px">
                <TransitionGroup enter-active-class="transition-all duration-300"
                    enter-from-class="opacity-0 translate-x-8" enter-to-class="opacity-100 translate-x-0"
                    leave-active-class="transition-all duration-300" leave-from-class="opacity-100 translate-x-0"
                    leave-to-class="opacity-0 translate-x-8">
                    <div v-for="toast in toasts" :key="toast.id"
                        class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium"
                        :class="toast.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                            : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'">
                        <i :class="toast.type === 'success' ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.myBills }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.billingHistory }}</p>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage && allBills.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <button @click="fetchBills" class="mt-4 text-sm text-primary-600 hover:underline">{{ ui.retry }}</button>
        </div>

        <!-- Main Content -->
        <template v-else>
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 transition-all duration-500 delay-100"
                :class="statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
                <!-- Outstanding -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-clock text-amber-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.pending }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                        {{ formatCurrency(stats.totalOutstanding, stats.currency) }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ stats.pendingCount }} {{ t.pending?.toLowerCase() }}</p>
                </div>

                <!-- Paid -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.paid }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                        {{ formatCurrency(stats.totalPaid, stats.currency) }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">{{allBills.filter(b => b.status === 'paid').length}} {{
                        t.paid?.toLowerCase() }}</p>
                </div>

                <!-- Overdue -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-triangle-exclamation text-red-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            t.overdue }}</span>
                    </div>
                    <p class="text-lg font-bold"
                        :class="stats.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                        {{ stats.overdueCount }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ stats.overdueCount > 0 ? t.overdue : '✓' }}</p>
                </div>

                <!-- Total Bills -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div
                            class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-receipt text-primary-500 text-sm"></i>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                            ui.total }}</span>
                    </div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ allBills.length }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t.billingHistory?.toLowerCase() }}</p>
                </div>
            </div>

            <!-- Overdue Alert -->
            <div v-if="stats.overdueCount > 0"
                class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3 transition-all duration-500 delay-150"
                :class="statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
                <div
                    class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold text-red-800 dark:text-red-300">
                        {{ stats.overdueCount }} {{ t.overdue }} {{ stats.overdueCount === 1 ? ui.invoice :
                            ui.invoicesPlural }}
                    </p>
                    <p class="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        {{ t.totalAmount }}: {{formatCurrency(allBills.filter(b => b.status === 'overdue').reduce((s,
                            b) => s + b.amount, 0), stats.currency)}}
                    </p>
                </div>
            </div>

            <!-- Search + Filters -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-200"
                :class="statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
                <div class="relative">
                    <i
                        class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input v-model="searchQuery" type="text" :placeholder="ui.searchInvoices"
                        class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div class="flex flex-wrap gap-2 items-center">
                    <!-- Type -->
                    <div class="relative">
                        <select v-model="filterType"
                            class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                            <option value="">{{ ui.allTypes }}</option>
                            <option v-for="tp in billTypes" :key="tp" :value="tp">
                                {{ typeLabels[tp as keyof typeof typeLabels] || tp }}
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
                            <option v-for="s in billStatuses" :key="s" :value="s">
                                {{ statusLabels[s as keyof typeof statusLabels] || s }}
                            </option>
                        </select>
                        <i
                            class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                    </div>
                    <!-- Clear -->
                    <button v-if="activeFilterCount > 0" @click="filterType = ''; filterStatus = ''; searchQuery = ''"
                        class="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors">
                        <i class="fa-solid fa-xmark text-xs"></i>
                        Clear ({{ activeFilterCount }})
                    </button>
                </div>
            </div>

            <!-- Empty -->
            <div v-if="!isLoading && filteredBills.length === 0"
                class="flex flex-col items-center justify-center py-20 text-center">
                <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <i class="fa-solid fa-receipt text-2xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">
                    {{ emptyTitle }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ emptyDesc }}
                </p>
            </div>

            <!-- Bill Card List -->
            <div v-if="!isLoading && bills.length > 0" class="space-y-3">
                <div v-for="(bill, index) in bills" :key="bill.id"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                    :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                    :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }"
                    @click="$router.push(`/resident/my-bills/${bill.id}`)">
                    <div class="flex items-center gap-4">
                        <!-- Type Icon -->
                        <div class="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            :class="typeIconColors[bill.type] || typeIconColors.other">
                            <i :class="typeIcons[bill.type] || typeIcons.other" class="text-xl"></i>
                        </div>

                        <!-- Main Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate text-sm">
                                    {{ bill.invoiceNo }}
                                </h3>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[bill.status] || statusColors.pending">
                                    {{ statusLabels[bill.status as keyof typeof statusLabels] || bill.status }}
                                </span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ bill.description }}</p>
                            <div class="flex items-center gap-3 mt-1">
                                <span class="inline-flex items-center gap-1 text-xs text-gray-400">
                                    <i class="fa-solid fa-calendar text-[10px]"></i>
                                    {{ t.dueDate }}: {{ formatDate(bill.dueDate) }}
                                </span>
                                <span
                                    v-if="bill.status !== 'paid' && bill.status !== 'cancelled' && daysUntilDue(bill) <= 7 && daysUntilDue(bill) > 0"
                                    class="text-xs font-medium text-orange-500">
                                    {{ daysUntilDue(bill) }}d left
                                </span>
                                <span v-if="isOverdue(bill)" class="text-xs font-medium text-red-500">
                                    <i class="fa-solid fa-triangle-exclamation text-[10px] mr-0.5"></i>
                                    {{ t.overdue }}
                                </span>
                            </div>
                        </div>

                        <!-- Type Badge (desktop) -->
                        <div class="hidden sm:block text-center min-w-[90px]">
                            <span
                                class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                                <i :class="typeIcons[bill.type] || typeIcons.other" class="text-xs"></i>
                                {{ typeLabels[bill.type as keyof typeof typeLabels] || bill.type }}
                            </span>
                        </div>

                        <!-- Amount -->
                        <div class="hidden sm:block text-right min-w-[110px]">
                            <p class="text-sm font-bold text-gray-900 dark:text-white">
                                {{ formatCurrency(bill.amount, bill.currency) }}
                            </p>
                            <p v-if="bill.paidAmount && bill.paidAmount > 0 && bill.status !== 'paid'"
                                class="text-xs text-emerald-500 mt-0.5">
                                {{ t.paid }}: {{ formatCurrency(bill.paidAmount, bill.currency) }}
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
                            <i :class="typeIcons[bill.type] || typeIcons.other" class="text-xs"></i>
                            {{ typeLabels[bill.type as keyof typeof typeLabels] || bill.type }}
                        </span>
                        <span class="text-sm font-bold text-gray-900 dark:text-white">
                            {{ formatCurrency(bill.amount, bill.currency) }}
                        </span>
                        <span class="text-xs text-gray-400 ml-auto">{{ formatDate(bill.dueDate) }}</span>
                    </div>
                </div>

                <!-- Pagination -->
                <div v-if="totalPages > 1"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{{ totalCount }} {{ totalCount !== 1 ? ui.billsFoundPlural : ui.billsFound }}</span>
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

        <!-- Detail Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDetailModal && selectedBill"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    @click.self="closeDetail()">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-150"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                        <div v-if="showDetailModal"
                            class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                            <!-- Modal Header -->
                            <div
                                class="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center"
                                        :class="typeIconColors[selectedBill.type] || typeIconColors.other">
                                        <i :class="typeIcons[selectedBill.type] || typeIcons.other" class="text-lg"></i>
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-gray-900 dark:text-white">{{
                                            selectedBill.invoiceNo }}
                                        </h3>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ ui.invoiceDetails }}</p>
                                    </div>
                                </div>
                                <button @click="closeDetail()"
                                    class="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <i class="fa-solid fa-xmark text-base"></i>
                                </button>
                            </div>

                            <!-- Modal Body -->
                            <div class="px-6 py-5 space-y-5">
                                <!-- Status + Amount -->
                                <div class="flex items-center justify-between">
                                    <span
                                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
                                        :class="statusColors[selectedBill.status] || statusColors.pending">
                                        <span class="w-2 h-2 rounded-full"
                                            :class="statusDotColors[selectedBill.status] || 'bg-gray-400'"></span>
                                        {{ statusLabels[selectedBill.status as keyof typeof statusLabels] ||
                                            selectedBill.status
                                        }}
                                    </span>
                                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                        {{ formatCurrency(selectedBill.amount, selectedBill.currency) }}
                                    </p>
                                </div>

                                <!-- Description -->
                                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                                    <p class="text-sm text-gray-700 dark:text-gray-300">{{ selectedBill.description }}
                                    </p>
                                </div>

                                <!-- Info Grid -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ ui.invoiceNo
                                            }}</p>
                                        <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{
                                            selectedBill.invoiceNo }}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ ui.invoiceType
                                            }}</p>
                                        <span
                                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-semibold">
                                            <i :class="typeIcons[selectedBill.type] || typeIcons.other"
                                                class="text-xs"></i>
                                            {{ typeLabels[selectedBill.type as keyof typeof typeLabels] ||
                                                selectedBill.type }}
                                        </span>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.dueDate }}
                                        </p>
                                        <p class="text-sm font-medium"
                                            :class="isOverdue(selectedBill) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                                            {{ formatDate(selectedBill.dueDate) }}
                                            <span v-if="isOverdue(selectedBill)" class="text-xs ml-1">({{ t.overdue
                                            }})</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{
                                            ui.invoiceCurrency }}
                                        </p>
                                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                            selectedBill.currency }}
                                        </p>
                                    </div>
                                    <div v-if="selectedBill.paidDate">
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{
                                            ui.invoicePaidDate }}
                                        </p>
                                        <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                            formatDate(selectedBill.paidDate) }}</p>
                                    </div>
                                    <div v-if="selectedBill.paidAmount">
                                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{
                                            ui.invoicePaidAmount
                                            }}</p>
                                        <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                            formatCurrency(selectedBill.paidAmount, selectedBill.currency) }}</p>
                                    </div>
                                </div>

                                <!-- Utility Breakdown -->
                                <div v-if="selectedBill.type === 'utilities' || selectedBill.type === 'monthlyRent'"
                                    class="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                                    <h4
                                        class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ ui.breakdown }}</h4>

                                    <!-- Room Rent -->
                                    <div v-if="selectedBill.unitTypePrice"
                                        class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ ui.roomRent }}</span>
                                        <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                            formatCurrency(selectedBill.unitTypePrice, selectedBill.currency) }}</span>
                                    </div>

                                    <!-- Electric -->
                                    <div v-if="selectedBill.electricAmount"
                                        class="py-2 border-b border-gray-100 dark:border-gray-800">
                                        <div class="flex items-center justify-between">
                                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                                <i class="fa-solid fa-bolt text-yellow-500 mr-1.5"></i>{{
                                                    ui.electricMeter }}
                                            </span>
                                            <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                formatCurrency(selectedBill.electricAmount, selectedBill.currency)
                                            }}</span>
                                        </div>
                                        <p v-if="selectedBill.electricMeterStart != null"
                                            class="text-xs text-gray-400 mt-0.5">
                                            {{ selectedBill.electricMeterStart }} → {{ selectedBill.electricMeterEnd }}
                                            ({{ selectedBill.electricUnitsUsed }} units × {{
                                                formatCurrency(selectedBill.electricUnitPrice, selectedBill.currency) }})
                                        </p>
                                    </div>

                                    <!-- Water -->
                                    <div v-if="selectedBill.waterAmount"
                                        class="py-2 border-b border-gray-100 dark:border-gray-800">
                                        <div class="flex items-center justify-between">
                                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                                <i class="fa-solid fa-droplet text-blue-500 mr-1.5"></i>{{ ui.waterMeter
                                                }}
                                            </span>
                                            <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                formatCurrency(selectedBill.waterAmount, selectedBill.currency)
                                            }}</span>
                                        </div>
                                        <p v-if="selectedBill.waterMeterStart != null"
                                            class="text-xs text-gray-400 mt-0.5">
                                            {{ selectedBill.waterMeterStart }} → {{ selectedBill.waterMeterEnd }}
                                            ({{ selectedBill.waterUnitsUsed }} units × {{
                                                formatCurrency(selectedBill.waterUnitPrice, selectedBill.currency) }})
                                        </p>
                                    </div>

                                    <!-- Total -->
                                    <div class="flex items-center justify-between pt-1">
                                        <span class="text-sm font-bold text-gray-900 dark:text-white">{{ ui.totalAmount
                                            }}</span>
                                        <span class="text-lg font-bold text-primary-600 dark:text-primary-400">{{
                                            formatCurrency(selectedBill.amount, selectedBill.currency) }}</span>
                                    </div>
                                </div>

                                <!-- Property -->
                                <div v-if="selectedBill.property"
                                    class="border-t border-gray-100 dark:border-gray-800 pt-4">
                                    <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">{{ ui.invoiceProperty
                                        }}</p>
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                            <i class="fa-solid fa-building text-emerald-500 text-sm"></i>
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedBill.property.name }}</p>
                                            <p v-if="selectedBill.property.city" class="text-xs text-gray-400">{{
                                                selectedBill.property.city }}</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Notes -->
                                <div v-if="selectedBill.notes"
                                    class="border-t border-gray-100 dark:border-gray-800 pt-4">
                                    <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ ui.notes }}</p>
                                    <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{{
                                        selectedBill.notes }}</p>
                                </div>
                            </div>

                            <!-- Modal Footer -->
                            <div
                                class="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-4">
                                <button @click="closeDetail()"
                                    class="w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                    {{ ui.close }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
