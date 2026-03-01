<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const router = useRouter()
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
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string; city: string } | null
    billing: { id: number; invoiceNo: string; amount: number } | null
}

interface Property {
    id: number
    documentId: string
    name: string
    city: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const allPayments = ref<Payment[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterPropertyId = ref('')
const filterMethod = ref('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = computed(() => allPayments.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const payments = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return allPayments.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50, 100]

// ─── Properties list ──────────────────────────────────────────────────────────
const propertiesList = ref<Property[]>([])

async function fetchProperties() {
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name&fields[1]=city`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id, documentId: p.documentId, name: p.name, city: p.city,
        }))
    } catch { /* ignore */ }
}

// ─── Status / Method helpers ──────────────────────────────────────────────────
const paymentStatuses = ['pending', 'reviewing', 'completed', 'failed', 'refunded']
const paymentMethods = ['creditCard', 'bankTransfer', 'cash', 'promptPay', 'other']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending,
    reviewing: t.value.reviewing,
    completed: t.value.completed,
    failed: t.value.failed,
    refunded: t.value.refunded,
}))

const methodLabels = computed(() => ({
    creditCard: t.value.creditCard,
    bankTransfer: t.value.bankTransfer,
    cash: t.value.cash,
    promptPay: t.value.promptPay,
    other: t.value.other,
}))

const methodIcons: Record<string, string> = {
    creditCard: 'ti-credit-card',
    bankTransfer: 'ti-exchange-vertical',
    cash: 'ti-money',
    promptPay: 'ti-mobile',
    other: 'ti-wallet',
}

const activeFilterCount = computed(() =>
    [filterMethod.value, filterStatus.value, filterDateFrom.value, filterDateTo.value].filter(Boolean).length
)

// ─── Fetch Payments ───────────────────────────────────────────────────────────
async function fetchPayments() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'billing',
            'pagination[pageSize]': '1000',
            'pagination[page]': '1',
            'sort[0]': 'date:desc',
        })
        if (filterPropertyId.value) {
            const prop = propertiesList.value.find(p => String(p.id) === filterPropertyId.value)
            if (prop) params.set('filters[property][documentId][$eq]', prop.documentId)
        }
        if (filterMethod.value)
            params.set('filters[method][$eq]', filterMethod.value)
        if (filterStatus.value)
            params.set('filters[status][$eq]', filterStatus.value)
        if (filterDateFrom.value)
            params.set('filters[date][$gte]', filterDateFrom.value)
        if (filterDateTo.value)
            params.set('filters[date][$lte]', filterDateTo.value)
        if (searchQuery.value.trim()) {
            params.set('filters[$or][0][refNo][$containsi]', searchQuery.value.trim())
        }
        const res = await fetch(`${STRAPI_URL}/api/payments?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch payments')
        const data = await res.json()
        allPayments.value = (data.data ?? []).map((item: any) => ({
            ...item,
            resident: item.resident ?? null,
            property: item.property ?? null,
            billing: item.billing ?? null,
        }))
        currentPage.value = 1
    } catch { /* ignore */ } finally {
        isLoading.value = false
    }
}

function resetAndFetch() {
    currentPage.value = 1
    fetchPayments()
}

let initializing = true

watch(searchQuery, resetAndFetch)
watch(filterPropertyId, () => { if (!initializing) resetAndFetch() })
watch([filterMethod, filterStatus, filterDateFrom, filterDateTo], resetAndFetch)
watch(pageSize, () => { currentPage.value = 1 })

function goToPayment(id: number) {
    router.push(`/payments/${id}`)
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const filtersVisible = ref(false)
const listVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        filtersVisible.value = true
    }))
    await fetchProperties()
    if (propertiesList.value.length > 0) {
        filterPropertyId.value = String(propertiesList.value[0].id)
    }
    initializing = false
    await fetchPayments()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.paymentsTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.paymentsSubtitle }}</p>
            </div>
        </div>

        <!-- Property Dropdown -->
        <div class="relative w-full sm:w-72 transition-all duration-500 delay-100"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <i class="ti-home absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
            <select v-model="filterPropertyId"
                class="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors">
                <option value="">{{ t.allProperties }}</option>
                <option v-for="prop in propertiesList" :key="prop.id" :value="String(prop.id)">
                    {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                </option>
            </select>
            <i
                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
        </div>

        <!-- Search + Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-150"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <div class="relative">
                <i class="ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchPayments"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div class="flex flex-wrap gap-2 items-center">
                <!-- Method -->
                <div class="relative">
                    <select v-model="filterMethod"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allPaymentMethods }}</option>
                        <option v-for="m in paymentMethods" :key="m" :value="m">{{ methodLabels[m as keyof typeof
                            methodLabels] || m }}</option>
                    </select>
                    <i
                        class="ti-angle-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <!-- Status -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allPaymentStatuses }}</option>
                        <option v-for="s in paymentStatuses" :key="s" :value="s">{{ statusLabels[s as keyof typeof
                            statusLabels] || s }}</option>
                    </select>
                    <i
                        class="ti-angle-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <!-- Date Range -->
                <div class="flex items-center gap-1.5">
                    <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ t.filterPaymentDate
                    }}</span>
                    <input v-model="filterDateFrom" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                    <span class="text-xs text-gray-400">–</span>
                    <input v-model="filterDateTo" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                </div>
                <!-- Clear -->
                <button v-if="activeFilterCount > 0"
                    @click="filterMethod = ''; filterStatus = ''; filterDateFrom = ''; filterDateTo = ''"
                    class="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors">
                    <i class="ti-close text-xs"></i>
                    Clear ({{ activeFilterCount }})
                </button>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingPayments }}</p>
            </div>
        </div>

        <!-- Empty -->
        <div v-else-if="payments.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <i class="ti-wallet text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noPayments }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noPaymentsDesc }}</p>
        </div>

        <!-- Payment Card List -->
        <div v-if="!isLoading && payments.length > 0" class="space-y-3">
            <div v-for="(pay, index) in payments" :key="pay.id"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }" @click="goToPayment(pay.id)">
                <div class="flex items-center gap-4">
                    <!-- Icon -->
                    <div
                        class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <i :class="methodIcons[pay.method] || 'ti-wallet'"
                            class="text-xl text-emerald-600 dark:text-emerald-400"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ pay.refNo }}</h3>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="statusColors[pay.status] || statusColors.pending">
                                {{ statusLabels[pay.status as keyof typeof statusLabels] || pay.status }}
                            </span>
                        </div>
                        <p v-if="pay.resident" class="text-sm text-gray-500 dark:text-gray-400 truncate">
                            <i class="ti-user text-xs mr-1"></i>{{ pay.resident.username }}
                            <span v-if="pay.resident.roomNumber"> · {{ pay.resident.roomNumber }}</span>
                        </p>
                        <p v-if="pay.billing" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            <i class="ti-receipt text-xs mr-1"></i>{{ pay.billing.invoiceNo }}
                        </p>
                    </div>

                    <!-- Method Badge -->
                    <div class="hidden sm:block text-center min-w-[100px]">
                        <span
                            class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                            <i :class="methodIcons[pay.method] || 'ti-wallet'" class="text-xs"></i>
                            {{ methodLabels[pay.method as keyof typeof methodLabels] || pay.method }}
                        </span>
                    </div>

                    <!-- Amount -->
                    <div class="hidden sm:block text-right min-w-[100px]">
                        <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(pay.amount,
                            pay.currency) }}</p>
                        <p class="text-xs text-gray-400">{{ pay.currency }}</p>
                    </div>

                    <!-- Date -->
                    <div class="hidden md:block text-center min-w-[90px]">
                        <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.date }}</p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">{{ formatDate(pay.date) }}</p>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1 shrink-0">
                        <NuxtLink :to="`/payments/${pay.id}`" @click.stop
                            class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.view">
                            <i class="ti-eye text-base"></i>
                        </NuxtLink>
                    </div>
                </div>

                <!-- Mobile extra row -->
                <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                    <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                        <i :class="methodIcons[pay.method] || 'ti-wallet'" class="text-xs"></i>
                        {{ methodLabels[pay.method as keyof typeof methodLabels] || pay.method }}
                    </span>
                    <span class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(pay.amount,
                        pay.currency) }}</span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDate(pay.date) }}</span>
                </div>
            </div>

            <!-- Pagination -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? t.paymentsFoundPlural : t.paymentsFound }}</span>
                    <div class="flex items-center gap-1.5">
                        <span>{{ t.perPage }}</span>
                        <div class="relative">
                            <select v-model="pageSize"
                                class="pl-2 pr-6 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button @click="currentPage = 1" :disabled="currentPage === 1"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="ti-angle-double-left text-xs"></i>
                    </button>
                    <button @click="currentPage--" :disabled="currentPage === 1"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="ti-angle-left text-xs"></i>
                    </button>
                    <span class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                        {{ t.page }} {{ currentPage }} {{ t.of }} {{ totalPages || 1 }}
                    </span>
                    <button @click="currentPage++" :disabled="currentPage >= totalPages"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="ti-angle-right text-xs"></i>
                    </button>
                    <button @click="currentPage = totalPages" :disabled="currentPage >= totalPages"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="ti-angle-double-right text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
