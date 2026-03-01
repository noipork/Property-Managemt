<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

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

// ─── Lease ────────────────────────────────────────────────────────────────────
interface Lease {
    id: number
    documentId: string
    leaseNo: string
    status: string
    startDate: string
    endDate: string
    monthlyRent: number
    depositAmount: number | null
    currency: string
    acceptedAt: string | null
    notes: string | null
}

const lease = ref<Lease | null>(null)
const isLoadingLease = ref(false)

const leaseStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    terminated: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

async function fetchLease() {
    isLoadingLease.value = true
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': residentId,
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '1',
        })
        const res = await fetch(`${STRAPI_URL}/api/leases?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const item = data.data?.[0]
        if (!item) return
        lease.value = {
            id: item.id,
            documentId: item.documentId,
            leaseNo: item.leaseNo,
            status: item.status,
            startDate: item.startDate,
            endDate: item.endDate,
            monthlyRent: item.monthlyRent,
            depositAmount: item.depositAmount ?? null,
            currency: item.currency || 'THB',
            acceptedAt: item.acceptedAt ?? null,
            notes: item.notes ?? null,
        }
    } catch {
        // silently ignore
    } finally {
        isLoadingLease.value = false
    }
}

onMounted(async () => {
    await fetchResident()
    fetchLease()
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

// ─── Chart.js Chart ──────────────────────────────────────────────────────────
const chartType = ref<'billing' | 'electric' | 'water'>('billing')
const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

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
    paidAmount?: number | null
    unitTypePrice?: number
    electricMeterStart?: number
    electricMeterEnd?: number
    electricUnitPrice?: number
    electricUnitsUsed?: number
    electricAmount?: number
    waterMeterStart?: number
    waterMeterEnd?: number
    waterUnitPrice?: number
    waterUnitsUsed?: number
    waterAmount?: number
    notes?: string | null
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

// Chart data processing
const chartData = computed(() => {
    if (!billingHistory.value.length) return { labels: [], datasets: [] }

    // Get last 6 months of data
    const last6Months = billingHistory.value.slice(0, 6).reverse()
    const labels = last6Months.map(bill => {
        const date = new Date(bill.dueDate)
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    })

    if (chartType.value === 'billing') {
        return {
            labels,
            datasets: [{
                label: 'Total Amount',
                data: last6Months.map(bill => bill.amount),
                borderColor: 'rgb(99, 102, 241)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true,
            }]
        }
    } else if (chartType.value === 'electric') {
        return {
            labels,
            datasets: [
                {
                    label: 'Units Used',
                    data: last6Months.map(bill => bill.electricUnitsUsed || 0),
                    borderColor: 'rgb(234, 179, 8)',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y',
                },
                {
                    label: 'Amount',
                    data: last6Months.map(bill => bill.electricAmount || 0),
                    borderColor: 'rgb(251, 146, 60)',
                    backgroundColor: 'rgba(251, 146, 60, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1',
                }
            ]
        }
    } else {
        return {
            labels,
            datasets: [
                {
                    label: 'Units Used',
                    data: last6Months.map(bill => bill.waterUnitsUsed || 0),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y',
                },
                {
                    label: 'Amount',
                    data: last6Months.map(bill => bill.waterAmount || 0),
                    borderColor: 'rgb(14, 165, 233)',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1',
                }
            ]
        }
    }
})

function renderChart() {
    if (!chartCanvas.value) return

    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy()
    }

    const isDark = document.documentElement.classList.contains('dark')
    const textColor = isDark ? '#9ca3af' : '#6b7280'
    const gridColor = isDark ? '#374151' : '#e5e7eb'

    const config: any = {
        type: 'line',
        data: chartData.value,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        padding: 15,
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#f9fafb' : '#111827',
                    bodyColor: isDark ? '#d1d5db' : '#374151',
                    borderColor: isDark ? '#374151' : '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                }
            },
            scales: {
                x: {
                    grid: {
                        color: gridColor,
                        display: false,
                    },
                    ticks: {
                        color: textColor,
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: gridColor,
                    },
                    ticks: {
                        color: textColor,
                    },
                    beginAtZero: true,
                },
            }
        }
    }

    // Add second Y axis for meter charts
    if (chartType.value === 'electric' || chartType.value === 'water') {
        config.options.scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            grid: {
                drawOnChartArea: false,
            },
            ticks: {
                color: textColor,
            },
            beginAtZero: true,
        }
    }

    chartInstance = new Chart(chartCanvas.value, config)
}

// Watch for chart type changes
watch(chartType, () => {
    nextTick(() => renderChart())
})

// Watch for billing history changes
watch(() => billingHistory.value.length, () => {
    nextTick(() => renderChart())
})

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
            unitTypePrice: b.unitTypePrice,
            electricMeterStart: b.electricMeterStart,
            electricMeterEnd: b.electricMeterEnd,
            electricUnitPrice: b.electricUnitPrice,
            electricUnitsUsed: b.electricUnitsUsed,
            electricAmount: b.electricAmount,
            waterMeterStart: b.waterMeterStart,
            waterMeterEnd: b.waterMeterEnd,
            waterUnitPrice: b.waterUnitPrice,
            waterUnitsUsed: b.waterUnitsUsed,
            waterAmount: b.waterAmount,
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

// ─── View Invoice Modal ───────────────────────────────────────────────────────
const showViewInvoiceModal = ref(false)
const selectedInvoice = ref<BillingItem | null>(null)
const isLoadingInvoice = ref(false)
const isEditMode = ref(false)
const isUpdatingInvoice = ref(false)
const editInvoiceForm = ref<BillingItem | null>(null)

async function viewInvoice(bill: BillingItem) {
    isLoadingInvoice.value = true
    showViewInvoiceModal.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/billings/${bill.documentId}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch invoice details')
        const data = await res.json()
        selectedInvoice.value = {
            id: data.data.id,
            documentId: data.data.documentId,
            invoiceNo: data.data.invoiceNo,
            type: data.data.type,
            description: data.data.description,
            amount: data.data.amount,
            currency: data.data.currency || 'THB',
            dueDate: data.data.dueDate,
            status: data.data.status,
            paidDate: data.data.paidDate,
            paidAmount: data.data.paidAmount,
            unitTypePrice: data.data.unitTypePrice,
            electricMeterStart: data.data.electricMeterStart,
            electricMeterEnd: data.data.electricMeterEnd,
            electricUnitPrice: data.data.electricUnitPrice,
            electricUnitsUsed: data.data.electricUnitsUsed,
            electricAmount: data.data.electricAmount,
            waterMeterStart: data.data.waterMeterStart,
            waterMeterEnd: data.data.waterMeterEnd,
            waterUnitPrice: data.data.waterUnitPrice,
            waterUnitsUsed: data.data.waterUnitsUsed,
            waterAmount: data.data.waterAmount,
            notes: data.data.notes,
        }
    } catch (err) {
        console.error('Error fetching invoice:', err)
        selectedInvoice.value = bill
    } finally {
        isLoadingInvoice.value = false
    }
}

function closeViewInvoiceModal() {
    showViewInvoiceModal.value = false
    selectedInvoice.value = null
    isEditMode.value = false
    editInvoiceForm.value = null
}

function enableEditMode() {
    if (!selectedInvoice.value) return
    isEditMode.value = true
    editInvoiceForm.value = { ...selectedInvoice.value }
}

function cancelEditMode() {
    isEditMode.value = false
    editInvoiceForm.value = null
}

const editElectricUnitsUsed = computed(() => {
    if (!editInvoiceForm.value) return 0
    const used = (editInvoiceForm.value.electricMeterEnd || 0) - (editInvoiceForm.value.electricMeterStart || 0)
    return used > 0 ? used : 0
})

const editElectricAmount = computed(() => {
    if (!editInvoiceForm.value) return 0
    return editElectricUnitsUsed.value * (editInvoiceForm.value.electricUnitPrice || 0)
})

const editWaterUnitsUsed = computed(() => {
    if (!editInvoiceForm.value) return 0
    const used = (editInvoiceForm.value.waterMeterEnd || 0) - (editInvoiceForm.value.waterMeterStart || 0)
    return used > 0 ? used : 0
})

const editWaterAmount = computed(() => {
    if (!editInvoiceForm.value) return 0
    return editWaterUnitsUsed.value * (editInvoiceForm.value.waterUnitPrice || 0)
})

const editTotalAmount = computed(() => {
    if (!editInvoiceForm.value) return 0
    return (editInvoiceForm.value.unitTypePrice || 0) + editElectricAmount.value + editWaterAmount.value
})

async function updateInvoice() {
    if (!editInvoiceForm.value || !selectedInvoice.value) return

    isUpdatingInvoice.value = true
    try {
        const payload = {
            data: {
                type: editInvoiceForm.value.type,
                description: editInvoiceForm.value.description,
                amount: editTotalAmount.value,
                dueDate: editInvoiceForm.value.dueDate,
                unitTypePrice: editInvoiceForm.value.unitTypePrice,
                electricMeterEnd: editInvoiceForm.value.electricMeterEnd,
                electricUnitPrice: editInvoiceForm.value.electricUnitPrice,
                electricUnitsUsed: editElectricUnitsUsed.value,
                electricAmount: editElectricAmount.value,
                waterMeterEnd: editInvoiceForm.value.waterMeterEnd,
                waterUnitPrice: editInvoiceForm.value.waterUnitPrice,
                waterUnitsUsed: editWaterUnitsUsed.value,
                waterAmount: editWaterAmount.value,
                notes: editInvoiceForm.value.notes || null,
            }
        }

        const res = await fetch(`${STRAPI_URL}/api/billings/${selectedInvoice.value.documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error('Failed to update invoice')

        // Update the selected invoice with new data
        const data = await res.json()
        selectedInvoice.value = {
            ...editInvoiceForm.value,
            amount: editTotalAmount.value,
            electricUnitsUsed: editElectricUnitsUsed.value,
            electricAmount: editElectricAmount.value,
            waterUnitsUsed: editWaterUnitsUsed.value,
            waterAmount: editWaterAmount.value,
        }

        isEditMode.value = false
        editInvoiceForm.value = null

        // Refresh billing history
        fetchBillingHistory()
    } catch (err) {
        console.error('Error updating invoice:', err)
    } finally {
        isUpdatingInvoice.value = false
    }
}

function getTranslatedStatus(status: string) {
    return (t.value as any)[status] || status
}

function getTranslatedType(type: string) {
    return (t.value as any)[type] || type
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

async function openInvoiceModal() {
    // Reset form first
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

    // Fetch latest billing to auto-fill meter start readings
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': residentId,
            'sort[0]': 'dueDate:desc',
            'pagination[page]': '1',
            'pagination[pageSize]': '1',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (res.ok) {
            const data = await res.json()
            if (data.data && data.data.length > 0) {
                const latestBilling = data.data[0]
                // Auto-fill electric meter start from previous end
                if (latestBilling.electricMeterEnd !== undefined && latestBilling.electricMeterEnd !== null) {
                    invoiceForm.value.electricMeterStart = latestBilling.electricMeterEnd
                }
                // Auto-fill water meter start from previous end
                if (latestBilling.waterMeterEnd !== undefined && latestBilling.waterMeterEnd !== null) {
                    invoiceForm.value.waterMeterStart = latestBilling.waterMeterEnd
                }
            }
        }
    } catch (err) {
        console.error('Error fetching latest billing:', err)
    }

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

            <!-- Lease Info Card -->
            <Transition appear enter-active-class="transition-all duration-500 delay-75"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <div class="flex items-center justify-between">
                        <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="ti-receipt text-primary-600 dark:text-primary-400"></i>
                            {{ t.leaseDetails }}
                        </h3>
                        <NuxtLink v-if="lease" :to="`/residents/${residentId}/edit#lease`"
                            class="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                            <i class="ti-pencil text-xs"></i> {{ t.edit }}
                        </NuxtLink>
                    </div>

                    <!-- Loading -->
                    <div v-if="isLoadingLease" class="flex items-center gap-2 py-2">
                        <div class="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                        </div>
                        <span class="text-sm text-gray-400">Loading...</span>
                    </div>

                    <!-- No lease -->
                    <div v-else-if="!lease" class="flex items-center gap-2 py-2 text-sm text-gray-400">
                        <i class="ti-info-alt text-gray-300"></i>
                        No lease record found.
                    </div>

                    <!-- Lease data -->
                    <template v-else>
                        <!-- Status + Lease No row -->
                        <div class="flex items-center gap-3 flex-wrap">
                            <span
                                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                :class="leaseStatusColors[lease.status] || leaseStatusColors.pending">
                                <i class="ti-check-box text-xs"></i>
                                {{ lease.status.charAt(0).toUpperCase() + lease.status.slice(1) }}
                            </span>
                            <span
                                class="font-mono text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                                {{ lease.leaseNo }}
                            </span>
                            <span v-if="lease.acceptedAt"
                                class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <i class="ti-check"></i> Accepted {{ formatDate(lease.acceptedAt) }}
                            </span>
                        </div>

                        <!-- Grid: dates + financials -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div class="space-y-0.5">
                                <p
                                    class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {{ t.leaseStartDate }}</p>
                                <p class="text-sm text-gray-800 dark:text-gray-200">{{ formatDate(lease.startDate) }}
                                </p>
                            </div>
                            <div class="space-y-0.5">
                                <p
                                    class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {{ t.leaseEndDate }}</p>
                                <p class="text-sm text-gray-800 dark:text-gray-200">{{ formatDate(lease.endDate) }}</p>
                            </div>
                            <div class="space-y-0.5">
                                <p
                                    class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {{ t.leaseMonthlyRent }}</p>
                                <p class="text-sm font-semibold text-gray-900 dark:text-white">
                                    {{ lease.currency }} {{ lease.monthlyRent.toLocaleString('en-US') }}
                                </p>
                            </div>
                            <div class="space-y-0.5">
                                <p
                                    class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {{ t.leaseDepositAmount }}</p>
                                <p class="text-sm text-gray-800 dark:text-gray-200">
                                    {{ lease.depositAmount ? lease.currency + ' ' +
                                        lease.depositAmount.toLocaleString('en-US') : '—' }}
                                </p>
                            </div>
                        </div>

                        <!-- Duration badge -->
                        <div
                            class="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg text-xs text-primary-700 dark:text-primary-300">
                            <i class="ti-calendar shrink-0"></i>
                            <span>{{ t.leaseDuration }}:
                                <strong>{{(() => {
                                    const s = new Date(lease.startDate)
                                    const e = new Date(lease.endDate)
                                    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() -
                                        s.getMonth())
                                    return months > 0
                                        ? months + ' ' + (months !== 1 ? t.leaseDurationMonthsPlural :
                                            t.leaseDurationMonths)
                                        : Math.round((e.getTime() - s.getTime()) / 86400000) + ' ' + t.leaseDurationDays
                                    })() }}</strong>
                            </span>
                        </div>

                        <!-- Notes -->
                        <div v-if="lease.notes"
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                            <i class="ti-comment-alt mr-1"></i>{{ lease.notes }}
                        </div>
                    </template>
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
                                        {{ resident.unitType.currency }} {{
                                            resident.unitType.price.toLocaleString('en-US')
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

            <!-- Billing Analytics Chart -->
            <Transition appear enter-active-class="transition-all duration-500 delay-200"
                enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <i class="ti-chart-line text-primary-600 dark:text-primary-400"></i>
                                {{ t.billingAnalytics }}
                            </h3>
                            <p class="text-xs text-gray-400 mt-0.5">{{ t.billingAnalyticsSubtitle }}</p>
                        </div>
                        <!-- Chart Type Switcher -->
                        <div class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <button @click="chartType = 'billing'"
                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all" :class="chartType === 'billing'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                <i class="ti-receipt mr-1"></i>
                                {{ t.billRate }}
                            </button>
                            <button @click="chartType = 'electric'"
                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all" :class="chartType === 'electric'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                <i class="ti-bolt mr-1"></i>
                                {{ t.electricMeter }}
                            </button>
                            <button @click="chartType = 'water'"
                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all" :class="chartType === 'water'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                <i class="ti-droplet mr-1"></i>
                                {{ t.waterMeter }}
                            </button>
                        </div>
                    </div>

                    <!-- Chart.js Canvas -->
                    <div class="relative" style="height: 300px;">
                        <canvas ref="chartCanvas"></canvas>
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
                        <div v-else v-for="bill in billingHistory" :key="bill.id" @click="viewInvoice(bill)"
                            class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer">
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
                                            {{ getTranslatedStatus(bill.status) }}
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
                                        {{ bill.currency }} {{ bill.amount.toLocaleString('en-US') }}
                                    </p>
                                    <p class="text-xs text-gray-400">{{ getTranslatedType(bill.type) }}
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
                                            {{ payment.status === 'completed' ? t.paid :
                                                getTranslatedStatus(payment.status) }}
                                        </span>
                                    </div>
                                    <p class="font-medium text-gray-900 dark:text-white mt-1">
                                        {{ getTranslatedType(payment.method) }}
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
                                        {{ payment.currency }} {{ payment.amount.toLocaleString('en-US') }}
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

        <!-- View Invoice Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showViewInvoiceModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <!-- Backdrop -->
                    <div class="absolute inset-0 bg-black/50" @click="closeViewInvoiceModal"></div>

                    <!-- Modal -->
                    <Transition enter-active-class="transition-all duration-200 delay-75"
                        enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                        leave-active-class="transition-all duration-150" leave-from-class="opacity-100 scale-100"
                        leave-to-class="opacity-0 scale-95">
                        <div v-if="showViewInvoiceModal"
                            class="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                            <!-- Header -->
                            <div
                                class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                                <div>
                                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ t.invoice }}</h2>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ selectedInvoice?.invoiceNo }}
                                    </p>
                                </div>
                                <button @click="closeViewInvoiceModal"
                                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    <i class="ti-close text-lg"></i>
                                </button>
                            </div>

                            <!-- Body -->
                            <div v-if="isLoadingInvoice" class="flex-1 flex items-center justify-center py-12">
                                <div
                                    class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                                </div>
                            </div>
                            <div v-else-if="selectedInvoice" class="flex-1 overflow-y-auto p-6 space-y-6">
                                <!-- Status & Dates -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label
                                            class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                                t.status }}</label>
                                        <span class="inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold"
                                            :class="billingStatusColors[selectedInvoice.status]">
                                            {{ getTranslatedStatus(selectedInvoice.status) }}
                                        </span>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label
                                            class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                                t.invoiceType }}</label>
                                        <select v-if="isEditMode && editInvoiceForm" v-model="editInvoiceForm.type"
                                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                                            <option value="monthlyRent">{{ t.monthlyRent }}</option>
                                            <option value="utilities">{{ t.utilities }}</option>
                                            <option value="maintenance">{{ t.maintenance }}</option>
                                            <option value="deposit">{{ t.deposit }}</option>
                                            <option value="lateFee">{{ t.lateFee }}</option>
                                            <option value="other">{{ t.other }}</option>
                                        </select>
                                        <p v-else class="text-sm font-medium text-gray-900 dark:text-white">{{
                                            getTranslatedType(selectedInvoice.type) }}</p>
                                    </div>
                                </div>

                                <!-- Description -->
                                <div class="space-y-1.5">
                                    <label
                                        class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                            t.description }}</label>
                                    <input v-if="isEditMode && editInvoiceForm" type="text"
                                        v-model="editInvoiceForm.description"
                                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                    <p v-else class="text-sm text-gray-900 dark:text-white">{{
                                        selectedInvoice.description }}
                                    </p>
                                </div>

                                <!-- Dates -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label
                                            class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                                t.dueDate }}</label>
                                        <input v-if="isEditMode && editInvoiceForm" type="date"
                                            v-model="editInvoiceForm.dueDate"
                                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent [color-scheme:light] dark:[color-scheme:dark]"
                                            @click="($event.target as HTMLInputElement).showPicker?.()" />
                                        <p v-else
                                            class="text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                                            <i class="ti-calendar text-gray-400 text-xs"></i>
                                            {{ formatDate(selectedInvoice.dueDate) }}
                                        </p>
                                    </div>
                                    <div v-if="selectedInvoice.paidDate" class="space-y-1.5">
                                        <label
                                            class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                                t.paidOn }}</label>
                                        <p class="text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                                            <i class="ti-check text-emerald-500 text-xs"></i>
                                            {{ formatDate(selectedInvoice.paidDate) }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Room Rent -->
                                <div v-if="selectedInvoice.unitTypePrice || (isEditMode && editInvoiceForm)"
                                    class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-home text-primary-500"></i>
                                        {{ t.roomRent }}
                                    </h4>
                                    <div v-if="isEditMode && editInvoiceForm" class="flex items-center gap-3">
                                        <div class="flex-1 space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitTypePrice
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.unitTypePrice" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="text-right pt-6">
                                            <span class="text-lg font-bold text-gray-900 dark:text-white">{{
                                                editInvoiceForm.currency }} {{ (editInvoiceForm.unitTypePrice ||
                                                    0).toLocaleString('en-US') }}</span>
                                        </div>
                                    </div>
                                    <div v-else class="flex items-center justify-between">
                                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.unitTypePrice
                                        }}</span>
                                        <span class="text-lg font-bold text-gray-900 dark:text-white">{{
                                            selectedInvoice.currency }} {{
                                                selectedInvoice.unitTypePrice?.toLocaleString('en-US')
                                            }}</span>
                                    </div>
                                </div>

                                <!-- Electric Meter -->
                                <div v-if="selectedInvoice.electricMeterStart !== undefined || selectedInvoice.electricMeterEnd !== undefined || (isEditMode && editInvoiceForm)"
                                    class="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800/30">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-bolt text-yellow-500"></i>
                                        {{ t.electricMeter }}
                                    </h4>
                                    <div v-if="isEditMode && editInvoiceForm"
                                        class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.electricMeterStart"
                                                disabled
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.electricMeterEnd"
                                                min="0" step="0.01"
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.electricUnitPrice"
                                                min="0" step="0.01"
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.total
                                            }}</label>
                                            <div
                                                class="px-3 py-2 text-sm bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg">
                                                <span class="font-semibold text-yellow-700 dark:text-yellow-400">{{
                                                    editElectricAmount.toLocaleString('en-US') }} {{
                                                        editInvoiceForm.currency
                                                    }}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.electricMeterStart || 0 }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.electricMeterEnd || 0 }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.currency }} {{ (selectedInvoice.electricUnitPrice ||
                                                    0).toLocaleString('en-US') }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.units }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.electricUnitsUsed || 0 }} {{ t.units }}</p>
                                        </div>
                                    </div>
                                    <div
                                        class="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800/30 flex items-center justify-between">
                                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.total
                                        }}</span>
                                        <span class="text-lg font-bold text-yellow-700 dark:text-yellow-400">
                                            {{ isEditMode && editInvoiceForm ? editInvoiceForm.currency :
                                                selectedInvoice.currency }}
                                            {{ isEditMode && editInvoiceForm ?
                                                editElectricAmount.toLocaleString('en-US') :
                                                (selectedInvoice.electricAmount || 0).toLocaleString('en-US') }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Water Meter -->
                                <div v-if="selectedInvoice.waterMeterStart !== undefined || selectedInvoice.waterMeterEnd !== undefined || (isEditMode && editInvoiceForm)"
                                    class="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800/30">
                                    <h4
                                        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                                        <i class="ti-droplet text-blue-500"></i>
                                        {{ t.waterMeter }}
                                    </h4>
                                    <div v-if="isEditMode && editInvoiceForm"
                                        class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.waterMeterStart"
                                                disabled
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.waterMeterEnd" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice
                                            }}</label>
                                            <input type="number" v-model.number="editInvoiceForm.waterUnitPrice" min="0"
                                                step="0.01"
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-xs text-gray-500 dark:text-gray-400">{{ t.total
                                            }}</label>
                                            <div
                                                class="px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg">
                                                <span class="font-semibold text-blue-700 dark:text-blue-400">{{
                                                    editWaterAmount.toLocaleString('en-US') }} {{
                                                        editInvoiceForm.currency
                                                    }}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterStart }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.waterMeterStart || 0 }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.meterEnd }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.waterMeterEnd || 0 }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.unitPrice }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.currency }} {{ (selectedInvoice.waterUnitPrice ||
                                                    0).toLocaleString('en-US') }}</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.units }}</p>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                                selectedInvoice.waterUnitsUsed || 0 }} {{ t.units }}</p>
                                        </div>
                                    </div>
                                    <div
                                        class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800/30 flex items-center justify-between">
                                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.total
                                        }}</span>
                                        <span class="text-lg font-bold text-blue-700 dark:text-blue-400">
                                            {{ isEditMode && editInvoiceForm ? editInvoiceForm.currency :
                                                selectedInvoice.currency }}
                                            {{ isEditMode && editInvoiceForm ? editWaterAmount.toLocaleString('en-US') :
                                                (selectedInvoice.waterAmount || 0).toLocaleString('en-US') }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Notes -->
                                <div v-if="selectedInvoice.notes || (isEditMode && editInvoiceForm)"
                                    class="space-y-1.5">
                                    <label
                                        class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                                            t.notes }}</label>
                                    <textarea v-if="isEditMode && editInvoiceForm" v-model="editInvoiceForm.notes"
                                        rows="2"
                                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                        :placeholder="t.invoiceNotesPlaceholder"></textarea>
                                    <p v-else
                                        class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                        {{ selectedInvoice.notes }}</p>
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
                                        {{ isEditMode && editInvoiceForm ? editInvoiceForm.currency :
                                            selectedInvoice?.currency
                                        }}
                                        {{ isEditMode && editInvoiceForm ? editTotalAmount.toLocaleString('en-US') :
                                            selectedInvoice?.amount.toLocaleString('en-US') }}
                                    </p>
                                </div>

                                <!-- Actions -->
                                <div class="flex items-center gap-3">
                                    <template v-if="isEditMode">
                                        <button @click="cancelEditMode"
                                            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                            {{ t.cancel }}
                                        </button>
                                        <button @click="updateInvoice" :disabled="isUpdatingInvoice"
                                            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                            <span v-if="isUpdatingInvoice"
                                                class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            <i v-else class="ti-check text-sm"></i>
                                            {{ t.update }}
                                        </button>
                                    </template>
                                    <template v-else>
                                        <button v-if="selectedInvoice?.status === 'pending'" @click="enableEditMode"
                                            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                                            <i class="ti-pencil text-sm"></i>
                                            {{ t.edit }}
                                        </button>
                                        <button @click="closeViewInvoiceModal"
                                            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                            {{ t.close }}
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>

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
                                                invoiceForm.currency }} {{
                                                    invoiceForm.unitTypePrice.toLocaleString('en-US')
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
                                                step="0.01" disabled
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed" />
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
                                                    {{ electricAmount.toLocaleString('en-US') }} {{ invoiceForm.currency
                                                    }}

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
                                                step="0.01" disabled
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed" />
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
                                                    {{ waterAmount.toLocaleString('en-US') }} {{ invoiceForm.currency }}

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
                                        {{ invoiceForm.currency }} {{ totalAmount.toLocaleString('en-US') }}
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
