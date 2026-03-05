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
    property: { id: number; name: string; city: string } | null
    billing: { id: number; documentId: string; invoiceNo: string; amount: number; currency: string; status: string; dueDate: string; type: string } | null
}

const payment = ref<Payment | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const showImageModal = ref(false)

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

const slipUrl = computed(() => {
    if (!payment.value?.paymentSlip) return null
    const slip = payment.value.paymentSlip as any
    const url = slip?.formats?.medium?.url || slip?.formats?.small?.url || slip?.url
    return url ? (url.startsWith('http') ? url : `${STRAPI_URL}${url}`) : null
})

async function fetchPayment() {
    isLoading.value = true
    errorMessage.value = ''
    try {
        const params = new URLSearchParams({
            'populate[0]': 'property',
            'populate[1]': 'billing',
            'populate[2]': 'paymentSlip',
        })
        const res = await fetch(`${STRAPI_URL}/api/payments?filters[id][$eq]=${paymentId}&${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        payment.value = data.data?.[0] ?? null
        if (!payment.value) throw new Error('Not found')
    } catch {
        errorMessage.value = t.value.failedToLoad || 'Failed to load payment'
    } finally {
        isLoading.value = false
    }
}

onMounted(async () => {
    await fetchPayment()

    // Mark related payment notifications as read
    if (payment.value?.documentId) {
        const { markReadByRelated } = useNotificationBadge()
        markReadByRelated(['payment'], payment.value.documentId)
    }
})
</script>

<template>
    <div class="space-y-6 max-w-3xl mx-auto pb-20 sm:pb-6">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading || 'Loading…' }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <NuxtLink to="/resident/payment-history" class="mt-4 text-sm text-primary-600 hover:underline">
                {{ t.backToPayments || 'Back to Payment History' }}
            </NuxtLink>
        </div>

        <template v-else-if="payment">
            <!-- Header -->
            <div class="flex items-center gap-3">
                <NuxtLink to="/resident/payment-history"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                </NuxtLink>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 flex-wrap">
                        <h1 class="text-xl font-bold text-gray-900 dark:text-white truncate">{{ payment.refNo }}</h1>
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            :class="statusColors[payment.status] || statusColors.pending">
                            <span class="w-1.5 h-1.5 rounded-full"
                                :class="statusDotColors[payment.status] || 'bg-gray-400'"></span>
                            {{ statusLabels[payment.status as keyof typeof statusLabels] || payment.status }}
                        </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {{ t.paymentDetails || 'Payment Details' }}
                    </p>
                </div>
            </div>

            <!-- Amount Card -->
            <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm opacity-75">{{ t.paymentAmount || 'Amount' }}</p>
                        <p class="text-3xl font-bold mt-1">{{ formatCurrency(payment.amount, payment.currency) }}</p>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                        <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xl"></i>
                    </div>
                </div>
                <div class="flex items-center gap-4 mt-4 text-sm opacity-80">
                    <span class="flex items-center gap-1.5">
                        <i class="fa-solid fa-calendar text-xs"></i>
                        {{ formatDate(payment.date) }}
                    </span>
                    <span class="flex items-center gap-1.5">
                        <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xs"></i>
                        {{ methodLabels[payment.method as keyof typeof methodLabels] || payment.method }}
                    </span>
                </div>
            </div>

            <!-- Details Card -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                <!-- Ref No -->
                <div class="flex items-center justify-between px-5 py-3.5">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.paymentRefNo || 'Reference No.'
                        }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ payment.refNo }}</span>
                </div>
                <!-- Method -->
                <div class="flex items-center justify-between px-5 py-3.5">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.paymentMethod || 'Method' }}</span>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                        :class="methodIconColors[payment.method] || methodIconColors.other">
                        <i :class="methodIcons[payment.method] || methodIcons.other" class="text-xs"></i>
                        {{ methodLabels[payment.method as keyof typeof methodLabels] || payment.method }}
                    </span>
                </div>
                <!-- Date -->
                <div class="flex items-center justify-between px-5 py-3.5">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.paymentDate || 'Payment Date' }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(payment.date)
                        }}</span>
                </div>
                <!-- Transaction ID -->
                <div v-if="payment.transactionId" class="flex items-center justify-between px-5 py-3.5">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.paymentTransactionId || 'Transaction ID'
                        }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ payment.transactionId
                        }}</span>
                </div>
                <!-- Submitted -->
                <div class="flex items-center justify-between px-5 py-3.5">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.date || 'Submitted' }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(payment.createdAt)
                        }}</span>
                </div>
                <!-- Notes -->
                <div v-if="payment.notes" class="px-5 py-3.5">
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{{ t.paymentNotes || 'Notes' }}</p>
                    <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{{ payment.notes }}</p>
                </div>
            </div>

            <!-- Related Invoice -->
            <div v-if="payment.billing"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ t.paymentBilling || 'Related Invoice' }}
                </h3>
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div class="flex items-center gap-3">
                        <div
                            class="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <i class="fa-solid fa-receipt text-primary-500 text-sm"></i>
                        </div>
                        <div>
                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payment.billing.invoiceNo }}
                            </p>
                            <p class="text-xs text-gray-400">{{ t.dueDate || 'Due' }}: {{
                                formatDate(payment.billing.dueDate) }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                            :class="invoiceStatusColors[payment.billing.status] || invoiceStatusColors.pending">
                            {{ payment.billing.status }}
                        </span>
                        <span class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ formatCurrency(payment.billing.amount, payment.billing.currency) }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Property -->
            <div v-if="payment.property"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ t.paymentProperty || 'Property' }}
                </h3>
                <div class="flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-building text-emerald-500"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payment.property.name }}</p>
                        <p v-if="payment.property.city" class="text-xs text-gray-400">{{ payment.property.city }}</p>
                    </div>
                </div>
            </div>

            <!-- Payment Slip -->
            <div v-if="slipUrl"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ t.paymentSlip || 'Payment Slip' }}
                </h3>
                <div class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer group"
                    @click="showImageModal = true">
                    <img :src="slipUrl" alt="Payment Slip"
                        class="w-full max-h-72 object-contain bg-gray-50 dark:bg-gray-800 group-hover:scale-105 transition-transform duration-300" />
                    <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                        <i
                            class="fa-solid fa-magnifying-glass-plus text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                </div>
            </div>
        </template>

        <!-- Image Lightbox -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showImageModal && slipUrl"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    @click="showImageModal = false">
                    <button @click="showImageModal = false"
                        class="absolute top-4 right-4 p-2 rounded-lg text-white hover:bg-white/10 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                    <img :src="slipUrl" alt="Payment Slip" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
                        @click.stop />
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
