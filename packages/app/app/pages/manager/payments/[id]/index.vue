<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const { t, lang } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const paymentId = route.params.id as string

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
    createdAt: string
    paymentSlip: { url: string; formats?: any } | null
    resident: { id: number; documentId: string; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string; city: string } | null
    billing: { id: number; documentId: string; invoiceNo: string; amount: number; currency: string; status: string; dueDate: string; type: string } | null
}

const payment = ref<Payment | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending, reviewing: t.value.reviewing, completed: t.value.completed,
    failed: t.value.failed, refunded: t.value.refunded,
}))

const methodLabels = computed(() => ({
    creditCard: t.value.creditCard, bankTransfer: t.value.bankTransfer,
    cash: t.value.cash, promptPay: t.value.promptPay, other: t.value.other,
}))

const methodIcons: Record<string, string> = {
    creditCard: 'fa-solid fa-credit-card', bankTransfer: 'fa-solid fa-right-left',
    cash: 'fa-solid fa-money-bill', promptPay: 'fa-solid fa-mobile-screen', other: 'fa-solid fa-wallet',
}

const invoiceStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

async function fetchPayment() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'billing',
            'populate[3]': 'paymentSlip',
        })
        const res = await fetch(`${STRAPI_URL}/api/payments?filters[documentId][$eq]=${paymentId}&${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        payment.value = data.data?.[0] ?? null
        if (!payment.value) throw new Error('Not found')
    } catch {
        errorMessage.value = 'Failed to load payment'
    } finally {
        isLoading.value = false
    }
}

const slipUrl = computed(() => {
    if (!payment.value?.paymentSlip) return null
    const slip = payment.value.paymentSlip as any
    const url = slip?.formats?.medium?.url || slip?.formats?.small?.url || slip?.url
    return url ? (url.startsWith('http') ? url : `${STRAPI_URL}${url}`) : null
})

onMounted(async () => {
    await fetchPayment()

    // Mark related notifications as read
    if (payment.value?.documentId) {
        const { markReadByRelated } = useNotificationBadge()
        markReadByRelated(['payment'], payment.value.documentId)
    }
})
</script>

<template>
    <div class="space-y-6 max-w-4xl mx-auto">
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
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <NuxtLink to="/manager/payments" class="mt-4 text-sm text-primary-600 hover:underline">{{ t.backToPayments
                }}
            </NuxtLink>
        </div>

        <template v-else-if="payment">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div class="flex items-center gap-3">
                    <NuxtLink to="/manager/payments"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-3">
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ payment.refNo }}</h1>
                            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                                :class="statusColors[payment.status] || statusColors.pending">
                                {{ statusLabels[payment.status as keyof typeof statusLabels] || payment.status }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.paymentDetails }}</p>
                    </div>
                </div>
            </div>

            <!-- Payment Details -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left: Main info -->
                <div class="lg:col-span-2 space-y-6">
                    <!-- Overview -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentDetails }}</h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentRefNo }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payment.refNo }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentMethod }}</p>
                                <div class="flex items-center gap-1.5">
                                    <i :class="methodIcons[payment.method] || 'fa-solid fa-wallet'"
                                        class="text-sm text-gray-500"></i>
                                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        methodLabels[payment.method as keyof typeof methodLabels] || payment.method
                                    }}</span>
                                </div>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentDate }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(payment.date)
                                }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentAmount }}</p>
                                <p class="text-sm font-bold text-gray-900 dark:text-white">{{
                                    formatCurrency(payment.amount, payment.currency) }}</p>
                            </div>
                            <div v-if="payment.transactionId">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentTransactionId
                                }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{
                                    payment.transactionId }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.date }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(payment.createdAt) }}</p>
                            </div>
                        </div>
                        <div v-if="payment.notes" class="pt-2 border-t border-gray-100 dark:border-gray-800">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.paymentNotes }}</p>
                            <p class="text-sm text-gray-700 dark:text-gray-300">{{ payment.notes }}</p>
                        </div>
                    </div>

                    <!-- Payment Slip -->
                    <div v-if="slipUrl"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentSlip }}</h3>
                        <div class="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img :src="slipUrl" alt="Payment Slip"
                                class="w-full max-h-96 object-contain bg-gray-50 dark:bg-gray-800" />
                        </div>
                    </div>

                    <!-- Related Invoice -->
                    <div v-if="payment.billing"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentBilling }}</h3>
                        <NuxtLink :to="`/manager/invoices/${payment.billing.documentId}`"
                            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    payment.billing.invoiceNo }}</p>
                                <p class="text-xs text-gray-400">{{ t.dueDate }}: {{ formatDate(payment.billing.dueDate)
                                }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="invoiceStatusColors[payment.billing.status] || invoiceStatusColors.pending">
                                    {{ payment.billing.status }}
                                </span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                    formatCurrency(payment.billing.amount, payment.billing.currency) }}</span>
                                <i class="fa-solid fa-chevron-right text-gray-400 text-xs"></i>
                            </div>
                        </NuxtLink>
                    </div>
                </div>

                <!-- Right: Sidebar -->
                <div class="space-y-6">
                    <!-- Resident -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentResident }}</h3>
                        <div v-if="payment.resident" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-user text-primary-600 dark:text-primary-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    payment.resident.username }}</p>
                                <p class="text-xs text-gray-400">{{ payment.resident.email }}</p>
                                <p v-if="payment.resident.roomNumber" class="text-xs text-gray-500 dark:text-gray-400">
                                    <i class="fa-solid fa-key text-xs mr-1"></i>{{ payment.resident.roomNumber }}
                                </p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Property -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.paymentProperty }}</h3>
                        <div v-if="payment.property" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-house text-emerald-600 dark:text-emerald-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payment.property.name }}
                                </p>
                                <p v-if="payment.property.city" class="text-xs text-gray-400">{{ payment.property.city
                                }}</p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Amount card -->
                    <div class="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-6 text-white">
                        <p class="text-sm opacity-80">{{ t.paymentAmount }}</p>
                        <p class="text-3xl font-bold mt-1">{{ formatCurrency(payment.amount, payment.currency) }}</p>
                        <div class="flex items-center gap-2 mt-2">
                            <i :class="methodIcons[payment.method] || 'fa-solid fa-wallet'"
                                class="text-sm opacity-80"></i>
                            <p class="text-sm opacity-80">{{ methodLabels[payment.method as keyof typeof methodLabels]
                                || payment.method }}</p>
                        </div>
                        <p class="text-sm opacity-80 mt-1">{{ formatDate(payment.date) }}</p>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
