<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const residentId = route.params.id as string

interface Resident {
    id: number
    username: string
    email: string
    roomNumber: string | null
    registrationDate: string | null
    residencyStatus: string | null
    confirmed: boolean
    blocked: boolean
    createdAt: string
    property: { id: number; documentId: string; name: string; city: string; state: string | null; country: string; propertyType: string } | null
    unitType: { id: number; documentId: string; name: string; unitType: string; quantity: number; price: number | null; currency: string; area: number | null; areaUnit: string } | null
}

const resident = ref<Resident | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

const statusColors: Record<string, string> = {
    reserved: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    nearlyExpired: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    reserved: t.value.statusReserved,
    active: t.value.statusActive,
    nearlyExpired: t.value.statusNearlyExpired,
    expired: t.value.statusExpired,
    inactive: t.value.statusInactive,
}))

const propertyTypeLabels: Record<string, string> = {
    apartment: 'Apartment', condo: 'Condo', house: 'House',
    townhouse: 'Townhouse', commercial: 'Commercial', land: 'Land', other: 'Other',
}

const unitTypeLabels: Record<string, string> = {
    studio: 'Studio', br1: '1 Bedroom', br2: '2 Bedrooms', br3: '3 Bedrooms',
    br4: '4 Bedrooms', penthouse: 'Penthouse', shophouse: 'Shophouse',
    office: 'Office', warehouse: 'Warehouse', other: 'Other',
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function fetchResident() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'property',
            'populate[1]': 'unitType',
        })
        const res = await fetch(`${STRAPI_URL}/api/users/${residentId}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        resident.value = await res.json()
    } catch {
        errorMessage.value = 'Failed to load resident'
    } finally {
        isLoading.value = false
    }
}

onMounted(async () => {
    await fetchResident()
    fetchBillingHistory()
    fetchPaymentHistory()
})

// ─── Mock Chart Data ──────────────────────────────────────────────────────────
const chartMonths = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']
const paidData = [4500, 4500, 4500, 0, 4500, 4500]
const unpaidData = [0, 0, 0, 4500, 0, 0]

// SVG line chart helpers
const chartW = 480
const chartH = 140
const chartPadL = 48
const chartPadR = 16
const chartPadT = 16
const chartPadB = 32

const maxVal = computed(() => Math.max(...paidData, ...unpaidData, 1000))

function toX(i: number) {
    const plotW = chartW - chartPadL - chartPadR
    return chartPadL + (i / (chartMonths.length - 1)) * plotW
}
function toY(val: number) {
    const plotH = chartH - chartPadT - chartPadB
    return chartPadT + plotH - (val / maxVal.value) * plotH
}
function makePolyline(data: number[]) {
    return data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
}
function makeAreaPath(data: number[]) {
    const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' L')
    const firstX = toX(0)
    const lastX = toX(data.length - 1)
    const baseY = chartPadT + chartH - chartPadT - chartPadB
    return `M${firstX},${baseY} L${pts} L${lastX},${baseY} Z`
}

const yTicks = computed(() => {
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, i) => {
        const val = Math.round((maxVal.value / steps) * i)
        const y = toY(val)
        return { val, y }
    })
})

// ─── History Tab ─────────────────────────────────────────────────────────────
const historyTab = ref<'billing' | 'payment'>('billing')

// Billing and Payment data from API
interface BillingItem {
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
}

interface PaymentItem {
    id: number
    documentId: string
    refNo: string
    amount: number
    currency: string
    method: string
    date: string
    status: string
    billing?: { invoiceNo: string } | null
}

const billingHistory = ref<BillingItem[]>([])
const paymentHistory = ref<PaymentItem[]>([])
const isLoadingBilling = ref(false)
const isLoadingPayment = ref(false)

// Pagination state
const billingPage = ref(1)
const billingHasMore = ref(false)
const paymentPage = ref(1)
const paymentHasMore = ref(false)
const isLoadingMoreBilling = ref(false)
const isLoadingMorePayment = ref(false)

async function fetchBillingHistory(loadMore = false) {
    if (loadMore) {
        isLoadingMoreBilling.value = true
    } else {
        isLoadingBilling.value = true
        billingPage.value = 1
    }
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': residentId,
            'sort[0]': 'dueDate:desc',
            'pagination[page]': String(billingPage.value),
            'pagination[pageSize]': '20',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch billing history')
        const data = await res.json()
        const items = (data.data ?? []).map((b: any) => ({
            id: b.id,
            documentId: b.documentId,
            invoiceNo: b.invoiceNo,
            type: b.type,
            description: b.description,
            amount: b.amount,
            currency: b.currency || 'THB',
            dueDate: b.dueDate,
            status: b.status,
            paidDate: b.paidDate,
        }))
        if (loadMore) {
            billingHistory.value = [...billingHistory.value, ...items]
        } else {
            billingHistory.value = items
        }
        // Check if there are more pages
        const pagination = data.meta?.pagination
        billingHasMore.value = pagination ? billingPage.value < pagination.pageCount : false
    } catch (err) {
        console.error('Error fetching billing:', err)
    } finally {
        isLoadingBilling.value = false
        isLoadingMoreBilling.value = false
    }
}

function loadMoreBilling() {
    billingPage.value++
    fetchBillingHistory(true)
}

async function fetchPaymentHistory(loadMore = false) {
    if (loadMore) {
        isLoadingMorePayment.value = true
    } else {
        isLoadingPayment.value = true
        paymentPage.value = 1
    }
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': residentId,
            'populate[0]': 'billing',
            'sort[0]': 'date:desc',
            'pagination[page]': String(paymentPage.value),
            'pagination[pageSize]': '20',
        })
        const res = await fetch(`${STRAPI_URL}/api/payments?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch payment history')
        const data = await res.json()
        const items = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            refNo: p.refNo,
            amount: p.amount,
            currency: p.currency || 'THB',
            method: p.method,
            date: p.date,
            status: p.status,
            billing: p.billing ? { invoiceNo: p.billing.invoiceNo } : null,
        }))
        if (loadMore) {
            paymentHistory.value = [...paymentHistory.value, ...items]
        } else {
            paymentHistory.value = items
        }
        // Check if there are more pages
        const pagination = data.meta?.pagination
        paymentHasMore.value = pagination ? paymentPage.value < pagination.pageCount : false
    } catch (err) {
        console.error('Error fetching payments:', err)
    } finally {
        isLoadingPayment.value = false
        isLoadingMorePayment.value = false
    }
}

function loadMorePayment() {
    paymentPage.value++
    fetchPaymentHistory(true)
}

const billingStatusColors: Record<string, string> = {
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
}

const paymentStatusColors: Record<string, string> = {
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const billingTypeIcons: Record<string, string> = {
    monthlyRent: 'ti-file',
    utilities: 'ti-file',
    maintenance: 'ti-file',
    deposit: 'ti-file',
    lateFee: 'ti-file',
}

const paymentMethodIcons: Record<string, string> = {
    creditCard: 'ti-wallet',
    bankTransfer: 'ti-wallet',
    cash: 'ti-wallet',
    promptPay: 'ti-wallet',
}

// ─── Create Invoice Modal ─────────────────────────────────────────────────────
const showInvoiceModal = ref(false)
const isCreatingInvoice = ref(false)

interface InvoiceForm {
    type: string
    description: string
    dueDate: string
    currency: string
    unitTypePrice: number
    electricMeterStart: number
    electricMeterEnd: number
    electricUnitPrice: number
    waterMeterStart: number
    waterMeterEnd: number
    waterUnitPrice: number
    notes: string
}

const invoiceForm = ref<InvoiceForm>({
    type: 'monthlyRent',
    description: '',
    dueDate: '',
    currency: 'THB',
    unitTypePrice: 0,
    electricMeterStart: 0,
    electricMeterEnd: 0,
    electricUnitPrice: 8,
    waterMeterStart: 0,
    waterMeterEnd: 0,
    waterUnitPrice: 18,
    notes: '',
})

// Computed calculations
const electricUnitsUsed = computed(() => {
    const used = invoiceForm.value.electricMeterEnd - invoiceForm.value.electricMeterStart
    return used > 0 ? used : 0
})

const electricAmount = computed(() => {
    return electricUnitsUsed.value * invoiceForm.value.electricUnitPrice
})

const waterUnitsUsed = computed(() => {
    const used = invoiceForm.value.waterMeterEnd - invoiceForm.value.waterMeterStart
    return used > 0 ? used : 0
})

const waterAmount = computed(() => {
    return waterUnitsUsed.value * invoiceForm.value.waterUnitPrice
})

const totalAmount = computed(() => {
    return invoiceForm.value.unitTypePrice + electricAmount.value + waterAmount.value
})

function openInvoiceModal() {
    // Pre-fill with resident's unit type price if available
    if (resident.value?.unitType?.price) {
        invoiceForm.value.unitTypePrice = resident.value.unitType.price
    }
    // Set default due date to end of current month
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    invoiceForm.value.dueDate = endOfMonth.toISOString().split('T')[0]
    // Set default description
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    invoiceForm.value.description = `Monthly Rent - ${monthName}`
    showInvoiceModal.value = true
}

function closeInvoiceModal() {
    showInvoiceModal.value = false
    // Reset form
    invoiceForm.value = {
        type: 'monthlyRent',
        description: '',
        dueDate: '',
        currency: 'THB',
        unitTypePrice: 0,
        electricMeterStart: 0,
        electricMeterEnd: 0,
        electricUnitPrice: 8,
        waterMeterStart: 0,
        waterMeterEnd: 0,
        waterUnitPrice: 18,
        notes: '',
    }
}

function generateInvoiceNo() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `INV-${year}${month}-${random}`
}

async function createInvoice() {
    if (!invoiceForm.value.description || !invoiceForm.value.dueDate) {
        return
    }

    isCreatingInvoice.value = true
    try {
        const payload = {
            data: {
                invoiceNo: generateInvoiceNo(),
                type: invoiceForm.value.type,
                description: invoiceForm.value.description,
                amount: totalAmount.value,
                currency: invoiceForm.value.currency,
                dueDate: invoiceForm.value.dueDate,
                status: 'pending',
                unitTypePrice: invoiceForm.value.unitTypePrice,
                electricMeterStart: invoiceForm.value.electricMeterStart,
                electricMeterEnd: invoiceForm.value.electricMeterEnd,
                electricUnitPrice: invoiceForm.value.electricUnitPrice,
                electricUnitsUsed: electricUnitsUsed.value,
                electricAmount: electricAmount.value,
                waterMeterStart: invoiceForm.value.waterMeterStart,
                waterMeterEnd: invoiceForm.value.waterMeterEnd,
                waterUnitPrice: invoiceForm.value.waterUnitPrice,
                waterUnitsUsed: waterUnitsUsed.value,
                waterAmount: waterAmount.value,
                notes: invoiceForm.value.notes || null,
                resident: resident.value?.id,
                property: resident.value?.property?.id || null,
            }
        }

        const res = await fetch(`${STRAPI_URL}/api/billings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error('Failed to create invoice')

        closeInvoiceModal()
        // Refresh billing history
        fetchBillingHistory()
    } catch (err) {
        console.error('Error creating invoice:', err)
    } finally {
        isCreatingInvoice.value = false
    }
}
</script>

<template>
    <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <Transition appear enter-active-class="transition-all duration-500" enter-from-class="opacity-0 -translate-y-3"
            enter-to-class="opacity-100 translate-y-0">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <button @click="$router.back()"
                        class="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <i class="ti-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.residentInfo }}</h1>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.residentInfoSubtitle }}</p>
                    </div>
                </div>
                <NuxtLink v-if="resident" :to="`/residents/${residentId}/edit`"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                    <i class="ti-pencil text-sm"></i>
                    {{ t.edit }}
                </NuxtLink>
            </div>
        </Transition>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage"
            class="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            <i class="ti-alert-circle text-base"></i>
            {{ errorMessage }}
        </div>

        <template v-else-if="resident">
            <!-- Resident Profile Card -->
            <Transition appear enter-active-class="transition-all duration-500"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <div class="flex items-start gap-4">
                        <!-- Avatar -->
                        <div
                            class="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <i class="ti-user text-3xl text-primary-600 dark:text-primary-400"></i>
                        </div>
                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3 flex-wrap">
                                <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ resident.username }}</h2>
                                <span v-if="resident.residencyStatus"
                                    class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[resident.residencyStatus] || statusColors.inactive">
                                    {{ statusLabels[resident.residencyStatus as keyof typeof statusLabels] ||
                                        resident.residencyStatus }}
                                </span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ resident.email }}</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {{ t.residentRegisteredOn }} {{ formatDate(resident.createdAt) }}
                            </p>
                            <!-- Account badges -->
                            <div class="flex flex-wrap gap-2 mt-3">
                                <span
                                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                                    :class="resident.confirmed
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'">
                                    <i :class="resident.confirmed ? 'ti-check' : 'ti-time'"></i>
                                    {{ resident.confirmed ? t.residentConfirmed : t.residentUnconfirmed }}
                                </span>
                                <span v-if="resident.blocked"
                                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                    <i class="ti-na"></i>
                                    {{ t.residentBlocked }}
                                </span>
                                <span
                                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                    <i class="ti-id-badge"></i>
                                    {{ t.residentRole }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>

            <!-- Unit Details -->
            <Transition appear enter-active-class="transition-all duration-500 delay-100"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="ti-home text-primary-600 dark:text-primary-400"></i>
                        {{ t.unitInfo }}
                    </h3>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <!-- Room Number -->
                        <div class="space-y-1">
                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                t.roomNumber }}</p>
                            <div v-if="resident.roomNumber"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-semibold text-gray-800 dark:text-gray-200">
                                <i class="ti-key text-gray-500 dark:text-gray-400"></i>
                                {{ resident.roomNumber }}
                            </div>
                            <p v-else class="text-sm text-gray-400">—</p>
                        </div>

                        <!-- Registration Date -->
                        <div class="space-y-1">
                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                t.registrationDate }}</p>
                            <p class="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                <i class="ti-calendar text-gray-400 text-xs"></i>
                                {{ formatDate(resident.registrationDate) }}
                            </p>
                        </div>

                        <!-- Property -->
                        <div class="space-y-1">
                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                t.property }}</p>
                            <div v-if="resident.property">
                                <NuxtLink :to="`/properties/${resident.property.documentId}`"
                                    class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                    {{ resident.property.name }}
                                </NuxtLink>
                                <p class="text-xs text-gray-400">
                                    {{ [resident.property.city, resident.property.state,
                                    resident.property.country].filter(Boolean).join(', ') }}
                                </p>
                                <span class="text-xs text-gray-400">
                                    {{ propertyTypeLabels[resident.property.propertyType] ||
                                        resident.property.propertyType
                                    }}
                                </span>
                            </div>
                            <p v-else class="text-sm text-gray-400">—</p>
                        </div>

                        <!-- Unit Type -->
                        <div class="space-y-1">
                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                t.unitTypeLabel }}</p>
                            <div v-if="resident.unitType">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{
                                    resident.unitType.name }}
                                </p>
                                <p class="text-xs text-gray-400">{{ unitTypeLabels[resident.unitType.unitType] ||
                                    resident.unitType.unitType }}</p>
                                <div class="flex items-center gap-3 mt-1">
                                    <span v-if="resident.unitType.price"
                                        class="text-xs text-gray-500 dark:text-gray-400">
                                        {{ resident.unitType.currency }} {{ resident.unitType.price.toLocaleString()
                                        }}/mo
                                    </span>
                                    <span v-if="resident.unitType.area"
                                        class="text-xs text-gray-500 dark:text-gray-400">
                                        {{ resident.unitType.area }} {{ resident.unitType.areaUnit }}
                                    </span>
                                </div>
                            </div>
                            <p v-else class="text-sm text-gray-400">—</p>
                        </div>
                    </div>
                </div>
            </Transition>

            <!-- Payment Activity Chart -->
            <Transition appear enter-active-class="transition-all duration-500 delay-200"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <i class="ti-bar-chart text-primary-600 dark:text-primary-400"></i>
                                {{ t.paymentActivity }}
                            </h3>
                            <p class="text-xs text-gray-400 mt-0.5">{{ t.paymentActivitySubtitle }}</p>
                        </div>
                        <!-- Legend -->
                        <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                            <span class="flex items-center gap-1.5">
                                <span class="w-3 h-1 rounded-full bg-emerald-500 inline-block"></span>
                                {{ t.paid }}
                            </span>
                            <span class="flex items-center gap-1.5">
                                <span class="w-3 h-1 rounded-full bg-red-400 inline-block"></span>
                                {{ t.unpaid }}
                            </span>
                        </div>
                    </div>

                    <!-- SVG Line Chart -->
                    <div class="overflow-x-auto">
                        <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="w-full" style="min-width:300px;height:160px"
                            aria-hidden="true">
                            <!-- Grid lines -->
                            <g v-for="tick in yTicks" :key="tick.val">
                                <line :x1="chartPadL" :x2="chartW - chartPadR" :y1="tick.y" :y2="tick.y"
                                    stroke="currentColor" stroke-width="0.5" class="text-gray-200 dark:text-gray-700" />
                                <text :x="chartPadL - 6" :y="tick.y + 4" text-anchor="end"
                                    class="fill-gray-400 dark:fill-gray-500" style="font-size:9px">
                                    {{ tick.val >= 1000 ? (tick.val / 1000) + 'k' : tick.val }}
                                </text>
                            </g>

                            <!-- Paid area fill -->
                            <path :d="makeAreaPath(paidData)" class="fill-emerald-500/10 dark:fill-emerald-500/15" />

                            <!-- Unpaid area fill -->
                            <path :d="makeAreaPath(unpaidData)" class="fill-red-400/10 dark:fill-red-400/15" />

                            <!-- Paid line -->
                            <polyline :points="makePolyline(paidData)" fill="none" stroke="#10b981" stroke-width="2"
                                stroke-linejoin="round" stroke-linecap="round" />

                            <!-- Unpaid line -->
                            <polyline :points="makePolyline(unpaidData)" fill="none" stroke="#f87171" stroke-width="2"
                                stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 3" />

                            <!-- Paid dots -->
                            <circle v-for="(v, i) in paidData" :key="'p' + i" :cx="toX(i)" :cy="toY(v)" r="3.5"
                                fill="#10b981" stroke="white" stroke-width="1.5" />

                            <!-- Unpaid dots (only where > 0) -->
                            <template v-for="(v, i) in unpaidData" :key="'u' + i">
                                <circle v-if="v > 0" :cx="toX(i)" :cy="toY(v)" r="3.5" fill="#f87171" stroke="white"
                                    stroke-width="1.5" />
                            </template>

                            <!-- X-axis month labels -->
                            <text v-for="(m, i) in chartMonths" :key="m" :x="toX(i)" :y="chartH - 6"
                                text-anchor="middle" class="fill-gray-400 dark:fill-gray-500" style="font-size:9px">
                                {{ m }}
                            </text>
                        </svg>
                    </div>

                    <!-- Monthly summary bars -->
                    <div class="grid grid-cols-6 gap-1 pt-1">
                        <div v-for="(m, i) in chartMonths" :key="m" class="text-center">
                            <div class="flex flex-col items-center gap-0.5">
                                <span class="text-xs font-semibold"
                                    :class="unpaidData[i] > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'">
                                    {{ unpaidData[i] > 0 ? '✕' : '✓' }}
                                </span>
                                <span class="text-xs text-gray-400">{{ m }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>

            <!-- Billing / Payment History Tabs -->
            <Transition appear enter-active-class="transition-all duration-500 delay-300"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div class="space-y-4">
                    <!-- Tab Switcher + Create Invoice Button -->
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                            <button @click="historyTab = 'billing'"
                                class="px-4 py-2 text-sm font-medium rounded-md transition-all" :class="historyTab === 'billing'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                <i class="ti-file mr-1.5"></i>
                                {{ t.billingHistory }}
                            </button>
                            <button @click="historyTab = 'payment'"
                                class="px-4 py-2 text-sm font-medium rounded-md transition-all" :class="historyTab === 'payment'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                <i class="ti-wallet mr-1.5"></i>
                                {{ t.paymentHistory }}
                            </button>
                        </div>
                        <button v-if="historyTab === 'billing'" @click="openInvoiceModal"
                            class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                            <i class="ti-plus text-sm"></i>
                            {{ t.createInvoice }}
                        </button>
                    </div>

                    <!-- Billing History Cards -->
                    <div v-if="historyTab === 'billing'" class="space-y-3">
                        <!-- Loading -->
                        <div v-if="isLoadingBilling" class="flex items-center justify-center py-8">
                            <div
                                class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                        </div>
                        <!-- Empty state -->
                        <div v-else-if="billingHistory.length === 0" class="text-center py-8">
                            <div
                                class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                                <i class="ti-file text-xl text-gray-400"></i>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noBillingHistory }}</p>
                        </div>
                        <!-- Cards -->
                        <div v-else v-for="bill in billingHistory" :key="bill.id"
                            class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                            <div class="flex items-start gap-4">
                                <!-- Icon -->
                                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                    :class="bill.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-900/30' : bill.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'">
                                    <i class="ti-file text-lg"
                                        :class="bill.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : bill.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'"></i>
                                </div>

                                <!-- Info -->
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-xs font-mono text-gray-400">{{ bill.invoiceNo }}</span>
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                            :class="billingStatusColors[bill.status]">
                                            {{ t[bill.status as keyof typeof t] || bill.status }}
                                        </span>
                                    </div>
                                    <p class="font-medium text-gray-900 dark:text-white mt-1">{{ bill.description }}</p>
                                    <p class="text-xs text-gray-400 mt-1">
                                        <i class="ti-calendar mr-1"></i>
                                        {{ t.dueDate }}: {{ formatDate(bill.dueDate) }}
                                        <template v-if="bill.paidDate">
                                            <span class="mx-2">•</span>
                                            <i class="ti-check mr-1"></i>
                                            {{ t.paidOn }} {{ formatDate(bill.paidDate) }}
                                        </template>
                                    </p>
                                </div>

                                <!-- Amount -->
                                <div class="text-right shrink-0">
                                    <p class="font-bold text-lg"
                                        :class="bill.status === 'paid' ? 'text-gray-900 dark:text-white' : bill.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'">
                                        {{ bill.currency }} {{ bill.amount.toLocaleString() }}
                                    </p>
                                    <p class="text-xs text-gray-400">{{ t[bill.type as keyof typeof t] || bill.type }}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <!-- Load More Button -->
                        <button v-if="billingHasMore && !isLoadingBilling" @click="loadMoreBilling"
                            :disabled="isLoadingMoreBilling"
                            class="w-full py-3 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50">
                            <span v-if="isLoadingMoreBilling" class="inline-flex items-center gap-2">
                                <span
                                    class="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></span>
                                {{ t.loading }}
                            </span>
                            <span v-else class="inline-flex items-center gap-1">
                                <i class="ti-chevron-down"></i>
                                {{ t.loadMore }}
                            </span>
                        </button>
                    </div>

                    <!-- Payment History Cards -->
                    <div v-else class="space-y-3">
                        <!-- Loading -->
                        <div v-if="isLoadingPayment" class="flex items-center justify-center py-8">
                            <div
                                class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                        </div>
                        <!-- Empty state -->
                        <div v-else-if="paymentHistory.length === 0" class="text-center py-8">
                            <div
                                class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                                <i class="ti-wallet text-xl text-gray-400"></i>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noPaymentHistory }}</p>
                        </div>
                        <!-- Cards -->
                        <div v-else v-for="payment in paymentHistory" :key="payment.id"
                            class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                            <div class="flex items-start gap-4">
                                <!-- Icon -->
                                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                    :class="payment.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30' : payment.status === 'refunded' ? 'bg-gray-100 dark:bg-gray-800' : 'bg-amber-100 dark:bg-amber-900/30'">
                                    <i class="ti-wallet text-lg"
                                        :class="payment.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : payment.status === 'refunded' ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'"></i>
                                </div>

                                <!-- Info -->
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-xs font-mono text-gray-400">{{ payment.refNo }}</span>
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                            :class="paymentStatusColors[payment.status]">
                                            {{ payment.status === 'completed' ? t.paid : t[payment.status as keyof
                                                typeof t] ||
                                                payment.status }}
                                        </span>
                                    </div>
                                    <p class="font-medium text-gray-900 dark:text-white mt-1">
                                        {{ t[payment.method as keyof typeof t] || payment.method }}
                                    </p>
                                    <p class="text-xs text-gray-400 mt-1">
                                        <i class="ti-calendar mr-1"></i>
                                        {{ formatDate(payment.date) }}
                                        <template v-if="payment.billing?.invoiceNo">
                                            <span class="mx-2">•</span>
                                            <i class="ti-file-invoice mr-1"></i>
                                            {{ payment.billing.invoiceNo }}
                                        </template>
                                    </p>
                                </div>

                                <!-- Amount -->
                                <div class="text-right shrink-0">
                                    <p class="font-bold text-lg"
                                        :class="payment.status === 'refunded' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'">
                                        {{ payment.currency }} {{ payment.amount.toLocaleString() }}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <!-- Load More Button -->
                        <button v-if="paymentHasMore && !isLoadingPayment" @click="loadMorePayment"
                            :disabled="isLoadingMorePayment"
                            class="w-full py-3 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50">
                            <span v-if="isLoadingMorePayment" class="inline-flex items-center gap-2">
                                <span
                                    class="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></span>
                                {{ t.loading }}
                            </span>
                            <span v-else class="inline-flex items-center gap-1">
                                <i class="ti-chevron-down"></i>
                                {{ t.loadMore }}
                            </span>
                        </button>
                    </div>
                </div>
            </Transition>

        </template>

        <!-- Create Invoice Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showInvoiceModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <!-- Backdrop -->
                    <div class="absolute inset-0 bg-black/50" @click="closeInvoiceModal"></div>

                    <!-- Modal -->
                    <Transition enter-active-class="transition-all duration-200 delay-75"
                        enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                        leave-active-class="transition-all duration-150" leave-from-class="opacity-100 scale-100"
                        leave-to-class="opacity-0 scale-95">
                        <div v-if="showInvoiceModal"
                            class="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                            <!-- Header -->
                            <div
                                class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                                <div>
                                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ t.createInvoice }}
                                    </h2>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ resident?.username }} -
                                        {{ resident?.roomNumber || 'No Room' }}</p>
                                </div>
                                <button @click="closeInvoiceModal"
                                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    <i class="ti-close text-lg"></i>
                                </button>
                            </div>

                            <!-- Body -->
                            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                                <!-- Invoice Type & Description -->
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                                            t.invoiceType }}</label>
                                        <select v-model="invoiceForm.type"
                                            class="w-full px-3 py-2.5 text-base border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjOTk5OTk5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] bg-no-repeat bg-[right_0.75rem_center] pr-10">
                                            <option value="monthlyRent">{{ t.monthlyRent }}</option>
                                            <option value="utilities">{{ t.utilities }}</option>
                                            <option value="maintenance">{{ t.maintenance }}</option>
                                            <option value="deposit">{{ t.deposit }}</option>
                                            <option value="lateFee">{{ t.lateFee }}</option>
                                            <option value="other">{{ t.other }}</option>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                                            t.dueDate }} *</label>
                                        <div class="relative">
                                            <input type="date" v-model="invoiceForm.dueDate"
                                                class="w-full px-3 py-2.5 text-base border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent [color-scheme:light] dark:[color-scheme:dark]"
                                                @click="($event.target as HTMLInputElement).showPicker?.()" />
                                        </div>
                                    </div>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                                        t.description }} *</label>
                                    <input type="text" v-model="invoiceForm.description"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        :placeholder="t.invoiceDescriptionPlaceholder" />
                                </div>

                                <!-- Unit Type Price -->
                                <div
                                    class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-home text-primary-500"></i>
                                        {{ t.roomRent }}
                                    </h4>
                                    <div class="flex items-center gap-3">
                                        <div class="flex-1 space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitTypePrice
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.unitTypePrice" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="text-right pt-6">
                                            <span class="text-lg font-bold text-gray-900 dark:text-white">{{
                                                invoiceForm.currency }} {{ invoiceForm.unitTypePrice.toLocaleString()
                                                }}</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Electric Meter -->
                                <div
                                    class="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800/30">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-bolt text-yellow-500"></i>
                                        {{ t.electricMeter }}
                                    </h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.electricMeterStart" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.electricMeterEnd" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.electricUnitPrice" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.total
                                                }}</label>
                                            <div
                                                class="px-3 py-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg">
                                                <span class="font-semibold text-yellow-700 dark:text-yellow-400">
                                                    {{ electricAmount.toLocaleString() }} {{ invoiceForm.currency }}

                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Water Meter -->
                                <div
                                    class="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800/30">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-droplet text-blue-500"></i>
                                        {{ t.waterMeter }}
                                    </h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.waterMeterStart" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.waterMeterEnd" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice
                                                }}</label>
                                            <input type="number" v-model.number="invoiceForm.waterUnitPrice" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.total
                                                }}</label>
                                            <div
                                                class="px-3 py-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg">
                                                <span class="font-semibold text-blue-700 dark:text-blue-400">
                                                    {{ waterAmount.toLocaleString() }} {{ invoiceForm.currency }}

                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Notes -->
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.notes
                                        }}</label>
                                    <textarea v-model="invoiceForm.notes" rows="2"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                        :placeholder="t.invoiceNotesPlaceholder"></textarea>
                                </div>
                            </div>

                            <!-- Footer -->
                            <div
                                class="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                <!-- Total Amount -->
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                        t.totalAmount }}</p>
                                    <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                                        {{ invoiceForm.currency }} {{ totalAmount.toLocaleString() }}
                                    </p>
                                </div>

                                <!-- Actions -->
                                <div class="flex items-center gap-3">
                                    <button @click="closeInvoiceModal"
                                        class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                        {{ t.cancel }}
                                    </button>
                                    <button @click="createInvoice"
                                        :disabled="isCreatingInvoice || !invoiceForm.description || !invoiceForm.dueDate"
                                        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        <span v-if="isCreatingInvoice"
                                            class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        <i v-else class="ti-check text-sm"></i>
                                        {{ t.createInvoice }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
