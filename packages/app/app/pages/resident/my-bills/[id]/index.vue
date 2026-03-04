<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const router = useRouter()
const billId = route.params.id as string
const userRole = computed(() => user.value?.role)

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
    createdAt: string
    property: {
        id: number; documentId: string; name: string; city: string
        bankName: string | null; bankAccountName: string | null
        bankAccountNumber: string | null; promptPayId: string | null
        qrCodeImage: { url: string; formats?: any } | null
    } | null
    payments: {
        id: number; documentId: string; refNo: string; amount: number
        currency: string; method: string; date: string; status: string
        paymentSlip: { url: string; formats?: any } | null
    }[]
}

// ─── State ────────────────────────────────────────────────────────────────────
const bill = ref<Bill | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

// Pay modal
const showPayModal = ref(false)
const payStep = ref<'info' | 'upload'>('info')
const slipFile = ref<File | null>(null)
const slipPreview = ref<string | null>(null)
const paymentNotes = ref('')
const isSubmittingPayment = ref(false)

// Copied state
const copiedField = ref('')

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }, 4000)
}
function dismissToast(id: number) { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
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
    monthlyRent: 'ti-home', utilities: 'ti-bolt', maintenance: 'ti-wrench',
    deposit: 'ti-shield-check', lateFee: 'ti-alert-circle', other: 'ti-file',
}

const paymentStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

const canPay = computed(() => {
    if (!bill.value) return false
    return ['pending', 'overdue', 'partiallyPaid'].includes(bill.value.status)
})

const remainingAmount = computed(() => {
    if (!bill.value) return 0
    return bill.value.amount - (bill.value.paidAmount || 0)
})

const qrUrl = computed(() => {
    if (!bill.value?.property?.qrCodeImage) return null
    const img = bill.value.property.qrCodeImage as any
    const url = img?.formats?.medium?.url || img?.formats?.small?.url || img?.url
    return url ? (url.startsWith('http') ? url : `${STRAPI_URL}${url}`) : null
})

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchBill() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'property',
            'populate[1]': 'property.qrCodeImage',
            'populate[2]': 'payments',
            'populate[3]': 'payments.paymentSlip',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?filters[id][$eq]=${billId}&${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        bill.value = data.data?.[0] ?? null
        if (!bill.value) throw new Error('Not found')
    } catch {
        errorMessage.value = t.value.billDetailError || 'Failed to load bill'
    } finally {
        isLoading.value = false
    }
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────
function openPayModal() {
    payStep.value = 'info'
    slipFile.value = null
    slipPreview.value = null
    paymentNotes.value = ''
    showPayModal.value = true
}

function handleSlipSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    slipFile.value = file
    const reader = new FileReader()
    reader.onload = () => { slipPreview.value = reader.result as string }
    reader.readAsDataURL(file)
}

function removeSlip() {
    slipFile.value = null
    slipPreview.value = null
}

async function copyToClipboard(text: string, field: string) {
    try {
        await navigator.clipboard.writeText(text)
        copiedField.value = field
        setTimeout(() => { copiedField.value = '' }, 2000)
    } catch { /* ignore */ }
}

async function submitPayment() {
    if (!bill.value || !slipFile.value) return
    isSubmittingPayment.value = true
    try {
        // Step 1: Upload the payment slip
        const formData = new FormData()
        formData.append('files', slipFile.value)
        const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: formData,
        })
        if (!uploadRes.ok) throw new Error('Upload failed')
        const uploadData = await uploadRes.json()
        const slipId = uploadData[0]?.id
        if (!slipId) throw new Error('No slip ID')

        // Step 2: Generate ref number
        const now = new Date()
        const datePart = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0')
        const rand = Math.floor(1000 + Math.random() * 9000)
        const refNo = `PAY-${datePart}-${rand}`

        // Step 3: Create payment record
        const paymentRes = await fetch(`${STRAPI_URL}/api/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    refNo,
                    amount: remainingAmount.value,
                    currency: bill.value.currency || 'THB',
                    method: 'bankTransfer',
                    date: now.toISOString().split('T')[0],
                    status: 'pending',
                    notes: paymentNotes.value || null,
                    paymentSlip: slipId,
                    billing: bill.value.id,
                    resident: user.value?.id,
                    property: bill.value.property?.id || null,
                },
            }),
        })
        if (!paymentRes.ok) throw new Error('Payment creation failed')

        // Step 4: Update billing status to reviewing
        await fetch(`${STRAPI_URL}/api/billings/${bill.value.documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: { status: 'reviewing' },
            }),
        })

        showPayModal.value = false
        showToast('success', t.value.paymentSubmitted || 'Payment submitted! Waiting for manager approval.')
        await fetchBill()
    } catch (e: any) {
        showToast('error', e?.message || t.value.paymentSubmitError || 'Failed to submit payment')
    } finally {
        isSubmittingPayment.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const mainVisible = ref(false)

onMounted(async () => {
    if (userRole.value === 'manager') {
        router.replace('/manager')
        return
    }

    await fetchBill()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        mainVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 max-w-3xl mx-auto">
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
                        :class="toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'">
                        <i :class="toast.type === 'success' ? 'ti-check-box text-emerald-500' : 'ti-alert-circle text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="ti-close text-xs"></i></button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <i class="ti-alert-circle text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <NuxtLink to="/resident/my-bills" class="mt-4 text-sm text-primary-600 hover:underline">
                {{ t.backToMyBills || 'Back to My Bills' }}
            </NuxtLink>
        </div>

        <template v-else-if="bill">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-center gap-3">
                    <NuxtLink to="/resident/my-bills"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-3">
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ bill.invoiceNo }}</h1>
                            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                                :class="statusColors[bill.status] || statusColors.pending">
                                {{ statusLabels[bill.status as keyof typeof statusLabels] || bill.status }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ bill.description }}</p>
                    </div>
                </div>
                <!-- Pay Now Button -->
                <button v-if="canPay" @click="openPayModal"
                    class="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95">
                    <i class="ti-wallet text-base"></i>
                    {{ t.payNow || 'Pay Now' }}
                </button>
            </div>

            <!-- Content -->
            <div class="space-y-6 transition-all duration-500 delay-100"
                :class="mainVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

                <!-- Amount Card -->
                <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-6 text-white">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-80">{{ t.totalAmount || 'Total Amount' }}</p>
                            <p class="text-3xl font-bold mt-1">{{ formatCurrency(bill.amount, bill.currency) }}</p>
                        </div>
                        <div v-if="bill.paidAmount && bill.paidAmount > 0" class="text-right">
                            <p class="text-sm opacity-80">{{ t.paid || 'Paid' }}</p>
                            <p class="text-xl font-bold mt-1">{{ formatCurrency(bill.paidAmount, bill.currency) }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4 mt-3 pt-3 border-t border-white/20">
                        <div class="flex items-center gap-1.5">
                            <i class="ti-calendar text-sm opacity-70"></i>
                            <span class="text-sm opacity-80">{{ t.dueDate }}: {{ formatDate(bill.dueDate) }}</span>
                        </div>
                        <div v-if="remainingAmount > 0 && bill.paidAmount" class="flex items-center gap-1.5 ml-auto">
                            <span class="text-sm opacity-80">{{ t.remaining || 'Remaining' }}:</span>
                            <span class="text-sm font-bold">{{ formatCurrency(remainingAmount, bill.currency) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Overview -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                        {{ t.invoiceDetails || 'Invoice Details' }}
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.invoiceType || 'Type' }}
                            </p>
                            <div class="flex items-center gap-1.5">
                                <i :class="typeIcons[bill.type] || 'ti-receipt'" class="text-sm text-gray-500"></i>
                                <span class="text-sm font-medium text-gray-900 dark:text-white">
                                    {{ typeLabels[bill.type as keyof typeof typeLabels] || bill.type }}
                                </span>
                            </div>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.dueDate }}</p>
                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(bill.dueDate) }}
                            </p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.date || 'Created' }}</p>
                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(bill.createdAt)
                                }}</p>
                        </div>
                        <div v-if="bill.paidDate">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paidOn || 'Paid on' }}
                            </p>
                            <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                {{ formatDate(bill.paidDate) }}
                            </p>
                        </div>
                    </div>
                    <div v-if="bill.notes" class="pt-2 border-t border-gray-100 dark:border-gray-800">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.notes || 'Notes' }}</p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">{{ bill.notes }}</p>
                    </div>
                </div>

                <!-- Breakdown -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                        {{ t.billBreakdown || 'Breakdown' }}
                    </h3>
                    <!-- Room rent -->
                    <div v-if="bill.unitTypePrice"
                        class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.roomRent || 'Room Rent' }}</span>
                        <span class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ formatCurrency(bill.unitTypePrice, bill.currency) }}
                        </span>
                    </div>
                    <!-- Electric -->
                    <div v-if="bill.electricAmount" class="py-2 border-b border-gray-100 dark:border-gray-800">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                <i class="ti-bolt text-yellow-500 mr-1"></i>{{ t.electricMeter || 'Electric' }}
                            </span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                {{ formatCurrency(bill.electricAmount, bill.currency) }}
                            </span>
                        </div>
                        <p class="text-xs text-gray-400 mt-1">
                            {{ bill.electricMeterStart }} → {{ bill.electricMeterEnd }} = {{ bill.electricUnitsUsed }}
                            units × {{ bill.electricUnitPrice }}/unit
                        </p>
                    </div>
                    <!-- Water -->
                    <div v-if="bill.waterAmount" class="py-2 border-b border-gray-100 dark:border-gray-800">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                <i class="ti-droplet text-blue-500 mr-1"></i>{{ t.waterMeter || 'Water' }}
                            </span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                {{ formatCurrency(bill.waterAmount, bill.currency) }}
                            </span>
                        </div>
                        <p class="text-xs text-gray-400 mt-1">
                            {{ bill.waterMeterStart }} → {{ bill.waterMeterEnd }} = {{ bill.waterUnitsUsed }}
                            units × {{ bill.waterUnitPrice }}/unit
                        </p>
                    </div>
                    <!-- Total -->
                    <div class="flex items-center justify-between pt-3">
                        <span class="text-base font-bold text-gray-900 dark:text-white">{{ t.totalAmount || 'Total'
                            }}</span>
                        <span class="text-xl font-bold text-primary-600 dark:text-primary-400">
                            {{ formatCurrency(bill.amount, bill.currency) }}
                        </span>
                    </div>
                </div>

                <!-- Payment History -->
                <div v-if="bill.payments?.length"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                        {{ t.paymentHistory || 'Payment History' }}
                    </h3>
                    <div v-for="pay in bill.payments" :key="pay.id"
                        class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="ti-receipt text-emerald-600 dark:text-emerald-400 text-sm"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ pay.refNo }}</p>
                                <p class="text-xs text-gray-400">{{ formatDate(pay.date) }} · {{ pay.method }}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="paymentStatusColors[pay.status] || paymentStatusColors.pending">
                                {{ pay.status }}
                            </span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                {{ formatCurrency(pay.amount, pay.currency) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Pay Now Button (bottom) -->
                <div v-if="canPay" class="flex justify-center pb-4">
                    <button @click="openPayModal"
                        class="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95">
                        <i class="ti-wallet text-lg"></i>
                        {{ t.payNow || 'Pay Now' }} — {{ formatCurrency(remainingAmount, bill.currency) }}
                    </button>
                </div>
            </div>
        </template>

        <!-- ── Pay Modal ── -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showPayModal && bill"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    @click.self="showPayModal = false">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-150"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                        <div v-if="showPayModal"
                            class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

                            <!-- Modal Header -->
                            <div
                                class="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        <i class="ti-wallet text-emerald-600 dark:text-emerald-400 text-lg"></i>
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-gray-900 dark:text-white">
                                            {{ payStep === 'info' ? (t.paymentInfo || 'Payment Information') :
                                                (t.uploadSlip ||
                                                    'Upload Payment Slip') }}
                                        </h3>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ bill.invoiceNo }}</p>
                                    </div>
                                </div>
                                <button @click="showPayModal = false"
                                    class="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <i class="ti-close text-base"></i>
                                </button>
                            </div>

                            <!-- Modal Body -->
                            <div class="px-6 py-5 space-y-5">

                                <!-- Step 1: Bank Info / QR -->
                                <template v-if="payStep === 'info'">
                                    <!-- Amount to pay -->
                                    <div
                                        class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
                                        <p class="text-sm text-emerald-700 dark:text-emerald-400">
                                            {{ t.amountToPay || 'Amount to pay' }}
                                        </p>
                                        <p class="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                                            {{ formatCurrency(remainingAmount, bill.currency) }}
                                        </p>
                                    </div>

                                    <!-- QR Code -->
                                    <div v-if="qrUrl" class="text-center space-y-3">
                                        <h4
                                            class="text-sm font-semibold text-gray-900 dark:text-white flex items-center justify-center gap-2">
                                            <i class="ti-scan text-primary-500"></i>
                                            {{ t.scanQrCode || 'Scan QR Code to Pay' }}
                                        </h4>
                                        <div
                                            class="inline-block p-3 bg-white rounded-xl border-2 border-gray-200 dark:border-gray-700">
                                            <img :src="qrUrl" alt="QR Code" class="w-48 h-48 object-contain mx-auto" />
                                        </div>
                                    </div>

                                    <!-- Bank Details -->
                                    <div v-if="bill.property?.bankName || bill.property?.promptPayId" class="space-y-3">
                                        <h4
                                            class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                            <i class="ti-building text-primary-500"></i>
                                            {{ t.bankDetails || 'Bank Details' }}
                                        </h4>
                                        <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                                            <!-- Bank Name -->
                                            <div v-if="bill.property.bankName"
                                                class="flex items-center justify-between">
                                                <div>
                                                    <p class="text-xs text-gray-400 uppercase tracking-wider">
                                                        {{ t.bankName || 'Bank Name' }}
                                                    </p>
                                                    <p class="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                                                        {{ bill.property.bankName }}
                                                    </p>
                                                </div>
                                            </div>
                                            <!-- Account Name -->
                                            <div v-if="bill.property.bankAccountName"
                                                class="flex items-center justify-between">
                                                <div>
                                                    <p class="text-xs text-gray-400 uppercase tracking-wider">
                                                        {{ t.bankAccountName || 'Account Name' }}
                                                    </p>
                                                    <p class="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                                                        {{ bill.property.bankAccountName }}
                                                    </p>
                                                </div>
                                                <button
                                                    @click="copyToClipboard(bill.property.bankAccountName!, 'accName')"
                                                    class="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                    <i :class="copiedField === 'accName' ? 'ti-check text-emerald-500' : 'ti-files'"
                                                        class="text-sm"></i>
                                                </button>
                                            </div>
                                            <!-- Account Number -->
                                            <div v-if="bill.property.bankAccountNumber"
                                                class="flex items-center justify-between">
                                                <div>
                                                    <p class="text-xs text-gray-400 uppercase tracking-wider">
                                                        {{ t.bankAccountNumber || 'Account Number' }}
                                                    </p>
                                                    <p
                                                        class="text-sm font-mono font-medium text-gray-900 dark:text-white mt-0.5">
                                                        {{ bill.property.bankAccountNumber }}
                                                    </p>
                                                </div>
                                                <button
                                                    @click="copyToClipboard(bill.property.bankAccountNumber!, 'accNum')"
                                                    class="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                    <i :class="copiedField === 'accNum' ? 'ti-check text-emerald-500' : 'ti-files'"
                                                        class="text-sm"></i>
                                                </button>
                                            </div>
                                            <!-- PromptPay -->
                                            <div v-if="bill.property.promptPayId"
                                                class="flex items-center justify-between">
                                                <div>
                                                    <p class="text-xs text-gray-400 uppercase tracking-wider">PromptPay
                                                    </p>
                                                    <p
                                                        class="text-sm font-mono font-medium text-gray-900 dark:text-white mt-0.5">
                                                        {{ bill.property.promptPayId }}
                                                    </p>
                                                </div>
                                                <button
                                                    @click="copyToClipboard(bill.property.promptPayId!, 'promptpay')"
                                                    class="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                    <i :class="copiedField === 'promptpay' ? 'ti-check text-emerald-500' : 'ti-files'"
                                                        class="text-sm"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- No payment info -->
                                    <div v-if="!qrUrl && !bill.property?.bankName && !bill.property?.promptPayId"
                                        class="text-center py-4">
                                        <div
                                            class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                                            <i class="ti-info-circle text-xl text-gray-400"></i>
                                        </div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {{ t.noPaymentInfoSet
                                                || 'No payment info set for this property. Please contact your manager.' }}
                                        </p>
                                    </div>
                                </template>

                                <!-- Step 2: Upload Slip -->
                                <template v-if="payStep === 'upload'">
                                    <!-- Amount reminder -->
                                    <div
                                        class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                        <span class="text-sm text-gray-600 dark:text-gray-400">
                                            {{ t.amountToPay || 'Amount to pay' }}
                                        </span>
                                        <span class="text-sm font-bold text-gray-900 dark:text-white">
                                            {{ formatCurrency(remainingAmount, bill.currency) }}
                                        </span>
                                    </div>

                                    <!-- Upload area -->
                                    <div class="space-y-3">
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {{ t.uploadSlip || 'Upload Payment Slip' }} <span
                                                class="text-red-500">*</span>
                                        </label>

                                        <!-- Preview -->
                                        <div v-if="slipPreview" class="relative">
                                            <img :src="slipPreview" alt="Payment slip preview"
                                                class="w-full max-h-64 object-contain rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
                                            <button @click="removeSlip"
                                                class="absolute top-2 right-2 p-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors">
                                                <i class="ti-close text-xs"></i>
                                            </button>
                                        </div>

                                        <!-- Upload button -->
                                        <label v-else
                                            class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
                                            <div
                                                class="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                                <i
                                                    class="ti-cloud-upload text-2xl text-primary-600 dark:text-primary-400"></i>
                                            </div>
                                            <div class="text-center">
                                                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {{ t.clickToUpload || 'Click to upload' }}
                                                </p>
                                                <p class="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB</p>
                                            </div>
                                            <input type="file" accept="image/*" class="hidden"
                                                @change="handleSlipSelect" />
                                        </label>
                                    </div>

                                    <!-- Notes -->
                                    <div>
                                        <label
                                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            {{ t.paymentNotes || 'Notes' }} <span class="text-xs text-gray-400">({{
                                                t.optional || 'optional' }})</span>
                                        </label>
                                        <textarea v-model="paymentNotes" rows="2"
                                            :placeholder="t.paymentNotesPlaceholder || 'Add any notes about this payment...'"
                                            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none">
                                        </textarea>
                                    </div>
                                </template>
                            </div>

                            <!-- Modal Footer -->
                            <div
                                class="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex gap-3">
                                <template v-if="payStep === 'info'">
                                    <button @click="showPayModal = false"
                                        class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                        {{ t.cancel || 'Cancel' }}
                                    </button>
                                    <button @click="payStep = 'upload'"
                                        class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                                        {{ t.continueToUpload || 'Continue — Upload Slip' }}
                                        <i class="ti-arrow-right ml-1"></i>
                                    </button>
                                </template>
                                <template v-else>
                                    <button @click="payStep = 'info'"
                                        class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                        <i class="ti-arrow-left mr-1"></i> {{ t.back || 'Back' }}
                                    </button>
                                    <button @click="submitPayment" :disabled="!slipFile || isSubmittingPayment"
                                        class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                                        <template v-if="isSubmittingPayment">
                                            <div
                                                class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2">
                                            </div>
                                            {{ t.submitting || 'Submitting...' }}
                                        </template>
                                        <template v-else>
                                            <i class="ti-check mr-1"></i> {{ t.submitPayment || 'Submit Payment' }}
                                        </template>
                                    </button>
                                </template>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
