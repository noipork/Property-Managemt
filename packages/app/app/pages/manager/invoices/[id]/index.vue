<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const invoiceId = route.params.id as string

interface Invoice {
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
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string; city: string } | null
    payments: any[]
}

const invoice = ref<Invoice | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

// Delete
const showDeleteModal = ref(false)
const isDeleting = ref(false)

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending, paid: t.value.paid, overdue: t.value.overdue,
    partiallyPaid: t.value.partiallyPaid, cancelled: t.value.cancelled,
}))

const typeLabels = computed(() => ({
    monthlyRent: t.value.monthlyRent, utilities: t.value.utilities, maintenance: t.value.maintenance,
    deposit: t.value.deposit, lateFee: t.value.lateFee, other: t.value.other,
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

// Toast
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }, 4000)
}
function dismissToast(id: number) { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }

async function fetchInvoice() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'payments',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?filters[id][$eq]=${invoiceId}&${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        invoice.value = data.data?.[0] ?? null
        if (!invoice.value) throw new Error('Not found')
    } catch {
        errorMessage.value = 'Failed to load invoice'
    } finally {
        isLoading.value = false
    }
}

async function deleteInvoice() {
    if (!invoice.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/billings/${invoice.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.invoiceDeleted)
        setTimeout(() => router.push('/manager/invoices'), 800)
    } catch {
        showToast('error', t.value.invoiceDeleteError)
    } finally {
        isDeleting.value = false
        showDeleteModal.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const mainVisible = ref(false)
const sidebarVisible = ref(false)

onMounted(async () => {
    await fetchInvoice()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        mainVisible.value = true
        sidebarVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 max-w-4xl mx-auto">
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
            <NuxtLink to="/manager/invoices" class="mt-4 text-sm text-primary-600 hover:underline">{{ t.backToInvoices }}
            </NuxtLink>
        </div>

        <template v-else-if="invoice">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-center gap-3">
                    <NuxtLink to="/manager/invoices"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-3">
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ invoice.invoiceNo }}</h1>
                            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                                :class="statusColors[invoice.status] || statusColors.pending">
                                {{ statusLabels[invoice.status as keyof typeof statusLabels] || invoice.status }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ invoice.description }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <NuxtLink :to="`/manager/invoices/${invoice.id}/edit`"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="ti-pencil text-sm"></i>
                        {{ t.edit }}
                    </NuxtLink>
                    <button @click="showDeleteModal = true"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="ti-trash text-sm"></i>
                        {{ t.delete }}
                    </button>
                </div>
            </div>

            <!-- Invoice Details -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left: Main info -->
                <div class="lg:col-span-2 space-y-6 transition-all duration-500 delay-100"
                    :class="mainVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <!-- Overview -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.invoiceDetails }}</h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.invoiceType }}</p>
                                <div class="flex items-center gap-1.5">
                                    <i :class="typeIcons[invoice.type] || 'ti-receipt'"
                                        class="text-sm text-gray-500"></i>
                                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        typeLabels[invoice.type as keyof typeof typeLabels] || invoice.type }}</span>
                                </div>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.dueDate }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(invoice.dueDate) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.date }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(invoice.createdAt) }}</p>
                            </div>
                            <div v-if="invoice.paidDate">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paidOn }}</p>
                                <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                    formatDate(invoice.paidDate) }}</p>
                            </div>
                            <div v-if="invoice.paidAmount">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.invoicePaidAmount }}
                                </p>
                                <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                    formatCurrency(invoice.paidAmount, invoice.currency) }}</p>
                            </div>
                        </div>
                        <div v-if="invoice.notes" class="pt-2 border-t border-gray-100 dark:border-gray-800">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.notes }}</p>
                            <p class="text-sm text-gray-700 dark:text-gray-300">{{ invoice.notes }}</p>
                        </div>
                    </div>

                    <!-- Breakdown -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.totalAmount }}</h3>
                        <!-- Room rent -->
                        <div
                            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.roomRent }}</span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                formatCurrency(invoice.unitTypePrice, invoice.currency) }}</span>
                        </div>
                        <!-- Electric -->
                        <div v-if="invoice.electricAmount" class="py-2 border-b border-gray-100 dark:border-gray-800">
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.electricMeter }}</span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                    formatCurrency(invoice.electricAmount, invoice.currency) }}</span>
                            </div>
                            <p class="text-xs text-gray-400 mt-1">
                                {{ invoice.electricMeterStart }} → {{ invoice.electricMeterEnd }} = {{
                                    invoice.electricUnitsUsed }} units × {{ invoice.electricUnitPrice }}/unit
                            </p>
                        </div>
                        <!-- Water -->
                        <div v-if="invoice.waterAmount" class="py-2 border-b border-gray-100 dark:border-gray-800">
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.waterMeter }}</span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                    formatCurrency(invoice.waterAmount, invoice.currency) }}</span>
                            </div>
                            <p class="text-xs text-gray-400 mt-1">
                                {{ invoice.waterMeterStart }} → {{ invoice.waterMeterEnd }} = {{ invoice.waterUnitsUsed
                                }} units × {{ invoice.waterUnitPrice }}/unit
                            </p>
                        </div>
                        <!-- Grand Total -->
                        <div class="flex items-center justify-between pt-3">
                            <span class="text-base font-bold text-gray-900 dark:text-white">{{ t.totalAmount }}</span>
                            <span class="text-xl font-bold text-primary-600 dark:text-primary-400">{{
                                formatCurrency(invoice.amount, invoice.currency) }}</span>
                        </div>
                    </div>

                    <!-- Related Payments -->
                    <div v-if="invoice.payments?.length"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentHistory }}</h3>
                        <div v-for="pay in invoice.payments" :key="pay.id"
                            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ pay.refNo }}</p>
                                <p class="text-xs text-gray-400">{{ formatDate(pay.date) }} · {{ pay.method }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="paymentStatusColors[pay.status] || paymentStatusColors.pending">
                                    {{ pay.status }}
                                </span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                    formatCurrency(pay.amount, pay.currency) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right: Sidebar -->
                <div class="space-y-6 transition-all duration-500 delay-150"
                    :class="sidebarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <!-- Resident -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.invoiceResident }}</h3>
                        <div v-if="invoice.resident" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                <i class="ti-user text-primary-600 dark:text-primary-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    invoice.resident.username }}</p>
                                <p class="text-xs text-gray-400">{{ invoice.resident.email }}</p>
                                <p v-if="invoice.resident.roomNumber" class="text-xs text-gray-500 dark:text-gray-400">
                                    <i class="ti-key text-xs mr-1"></i>{{ invoice.resident.roomNumber }}
                                </p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Property -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.invoiceProperty }}</h3>
                        <div v-if="invoice.property" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="ti-home text-emerald-600 dark:text-emerald-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ invoice.property.name }}
                                </p>
                                <p v-if="invoice.property.city" class="text-xs text-gray-400">{{ invoice.property.city
                                }}</p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Amount summary card -->
                    <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-6 text-white">
                        <p class="text-sm opacity-80">{{ t.totalAmount }}</p>
                        <p class="text-3xl font-bold mt-1">{{ formatCurrency(invoice.amount, invoice.currency) }}</p>
                        <p class="text-sm opacity-80 mt-2">{{ t.dueDate }}: {{ formatDate(invoice.dueDate) }}</p>
                    </div>
                </div>
            </div>
        </template>

        <!-- Delete Modal -->
        <Teleport to="body">
            <div v-if="showDeleteModal"
                class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                    <div class="flex items-center gap-3">
                        <div
                            class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <i class="ti-trash text-red-600 dark:text-red-400 text-lg"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteInvoice }}</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.removeResidentCannotUndo }}</p>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ t.deleteInvoiceConfirm }} <strong class="text-gray-900 dark:text-white">{{ invoice?.invoiceNo
                        }}</strong>{{ t.deleteInvoiceConfirm2 }}
                    </p>
                    <div class="flex gap-3 pt-2">
                        <button @click="showDeleteModal = false"
                            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">{{
                                t.cancel }}</button>
                        <button @click="deleteInvoice" :disabled="isDeleting"
                            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">{{
                                isDeleting ? t.removing : t.delete }}</button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
