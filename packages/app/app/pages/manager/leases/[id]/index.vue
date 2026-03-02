<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const leaseDocumentId = route.params.id as string

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
    notes: string | null
    terms: string | null
    acceptedAt: string | null
    identityVerified: boolean
    identityDocumentType: string | null
    identityDocumentNumber: string | null
    residentFullName: string | null
    residentPhone: string | null
    residentAddress: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
    createdAt: string
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string; city: string } | null
    unitType: { id: number; name: string; unitType: string } | null
}

const lease = ref<Lease | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

// Delete
const showDeleteModal = ref(false)
const isDeleting = ref(false)

// Renew
const showRenewModal = ref(false)
const isRenewing = ref(false)
const renewStartDate = ref('')
const renewEndDate = ref('')

function openRenewModal() {
    renewStartDate.value = ''
    renewEndDate.value = ''
    showRenewModal.value = true
}

function applyDurationPreset(months: number) {
    if (!renewStartDate.value) {
        const today = new Date()
        renewStartDate.value = today.toISOString().slice(0, 10)
    }
    const start = new Date(renewStartDate.value)
    start.setMonth(start.getMonth() + months)
    renewEndDate.value = start.toISOString().slice(0, 10)
}

const renewDurationLabel = computed(() => {
    if (!renewStartDate.value || !renewEndDate.value) return ''
    const s = new Date(renewStartDate.value)
    const e = new Date(renewEndDate.value)
    if (e <= s) return ''
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months >= 1) return `${months} ${months === 1 ? t.value.leaseDurationMonths : t.value.leaseDurationMonthsPlural}`
    const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} ${t.value.leaseDurationDays}`
})

function generateLeaseNo() {
    const now = new Date()
    const datePart = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0')
    const rand = Math.floor(1000 + Math.random() * 9000)
    return `LSE-${datePart}-${rand}`
}

async function renewLease() {
    if (!lease.value || !renewStartDate.value || !renewEndDate.value) return
    if (renewEndDate.value <= renewStartDate.value) {
        showToast('error', t.value.leaseValidationEndAfterStart)
        return
    }
    isRenewing.value = true
    try {
        const body = {
            data: {
                leaseNo: generateLeaseNo(),
                status: 'pending',
                startDate: renewStartDate.value,
                endDate: renewEndDate.value,
                monthlyRent: lease.value.monthlyRent,
                depositAmount: lease.value.depositAmount,
                currency: lease.value.currency,
                terms: lease.value.terms || null,
                notes: lease.value.notes || null,
                resident: lease.value.resident?.id ?? null,
                property: lease.value.property?.documentId ?? null,
                unitType: lease.value.unitType ? (lease.value.unitType as any).documentId ?? null : null,
            },
        }
        const res = await fetch(`${STRAPI_URL}/api/leases`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const errData = await res.json().catch(() => null)
            throw new Error(errData?.error?.message || 'Failed to renew lease')
        }
        const data = await res.json()
        showToast('success', t.value.leaseRenewed)
        showRenewModal.value = false
        setTimeout(() => router.push(`/manager/leases/${data.data.documentId}`), 800)
    } catch (err: any) {
        showToast('error', err.message || t.value.leaseRenewError)
    } finally {
        isRenewing.value = false
    }
}

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    terminated: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending,
    active: t.value.active,
    expired: t.value.statusExpired,
    terminated: t.value.leaseTerminated,
    cancelled: t.value.cancelled,
}))

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

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function leaseDuration(start: string, end: string) {
    const s = new Date(start)
    const e = new Date(end)
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months >= 1) return `${months} ${months === 1 ? t.value.leaseDurationMonths : t.value.leaseDurationMonthsPlural}`
    const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} ${t.value.leaseDurationDays}`
}

async function fetchLease() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'unitType',
        })
        const res = await fetch(`${STRAPI_URL}/api/leases/${leaseDocumentId}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        lease.value = data.data ?? null
        if (!lease.value) throw new Error('Not found')
    } catch {
        errorMessage.value = t.value.leaseLoadError
    } finally {
        isLoading.value = false
    }
}

async function deleteLease() {
    if (!lease.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/leases/${lease.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.leaseDeleted)
        setTimeout(() => router.push('/manager/leases'), 800)
    } catch {
        showToast('error', t.value.leaseDeleteError)
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
    await fetchLease()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        mainVisible.value = true
        sidebarVisible.value = true
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
                        :class="toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'">
                        <i :class="toast.type === 'success' ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="fa-solid fa-xmark text-xs"></i></button>
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
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <NuxtLink to="/manager/leases" class="mt-4 text-sm text-primary-600 hover:underline">{{ t.backToLeases }}
            </NuxtLink>
        </div>

        <template v-else-if="lease">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-center gap-3">
                    <NuxtLink to="/manager/leases"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-3">
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ lease.leaseNo }}</h1>
                            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                                :class="statusColors[lease.status] || statusColors.pending">
                                {{ statusLabels[lease.status as keyof typeof statusLabels] || lease.status }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.leaseDetails }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button @click="openRenewModal"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-rotate text-sm"></i>
                        {{ t.renewLease }}
                    </button>
                    <NuxtLink v-if="lease.status === 'pending'" :to="`/manager/leases/${lease.documentId}/edit`"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-pen text-sm"></i>
                        {{ t.edit }}
                    </NuxtLink>
                    <button @click="showDeleteModal = true"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-trash text-sm"></i>
                        {{ t.delete }}
                    </button>
                </div>
            </div>

            <!-- Main Content -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left: Main info -->
                <div class="lg:col-span-2 space-y-6 transition-all duration-500 delay-100"
                    :class="mainVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

                    <!-- Lease Overview -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseOverview }}</h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseNo }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ lease.leaseNo
                                    }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.status }}</p>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[lease.status] || statusColors.pending">
                                    {{ statusLabels[lease.status as keyof typeof statusLabels] || lease.status }}
                                </span>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseCurrency }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.currency }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseStartDate }}
                                </p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(lease.startDate) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseEndDate }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(lease.endDate) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDuration }}</p>
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded text-xs font-semibold">
                                    <i class="fa-solid fa-calendar text-xs"></i>
                                    {{ leaseDuration(lease.startDate, lease.endDate) }}
                                </span>
                            </div>
                            <div v-if="lease.acceptedAt">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseAcceptedAt }}
                                </p>
                                <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                    formatDate(lease.acceptedAt) }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Financial -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseFinancial }}</h3>
                        <div
                            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.leaseMonthlyRent }}</span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                formatCurrency(lease.monthlyRent, lease.currency) }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.leaseDepositAmount }}</span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                formatCurrency(lease.depositAmount, lease.currency) }}</span>
                        </div>
                        <div class="flex items-center justify-between pt-2">
                            <span class="text-base font-bold text-gray-900 dark:text-white">{{ t.leaseMonthlyRent
                                }}</span>
                            <span class="text-xl font-bold text-primary-600 dark:text-primary-400">{{
                                formatCurrency(lease.monthlyRent, lease.currency) }}</span>
                        </div>
                    </div>

                    <!-- Identity Verification -->
                    <div v-if="lease.identityVerified || lease.residentFullName"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                                t.leaseIdentityInfo }}</h3>
                            <span v-if="lease.identityVerified"
                                class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold">
                                <i class="fa-solid fa-check text-xs"></i> {{ t.leaseVerified }}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div v-if="lease.residentFullName">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.fullName }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.residentFullName
                                    }}</p>
                            </div>
                            <div v-if="lease.residentPhone">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leasePhone }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.residentPhone }}
                                </p>
                            </div>
                            <div v-if="lease.identityDocumentType">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDocType }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    lease.identityDocumentType }}</p>
                            </div>
                            <div v-if="lease.identityDocumentNumber">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDocNumber }}
                                </p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{
                                    lease.identityDocumentNumber }}</p>
                            </div>
                            <div v-if="lease.residentAddress" class="col-span-2">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseAddress }}</p>
                                <p class="text-sm text-gray-700 dark:text-gray-300">{{ lease.residentAddress }}</p>
                            </div>
                        </div>
                        <!-- Emergency Contact -->
                        <div v-if="lease.emergencyContactName || lease.emergencyContactPhone"
                            class="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">{{ t.leaseEmergencyContact }}
                            </p>
                            <div class="grid grid-cols-2 gap-4">
                                <div v-if="lease.emergencyContactName">
                                    <p class="text-xs text-gray-400 mb-0.5">{{ t.fullName }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        lease.emergencyContactName }}</p>
                                </div>
                                <div v-if="lease.emergencyContactPhone">
                                    <p class="text-xs text-gray-400 mb-0.5">{{ t.leasePhone }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        lease.emergencyContactPhone }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Terms -->
                    <div v-if="lease.terms"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseTerms }}</h3>
                        <div class="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300
                            [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2
                            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1" v-html="lease.terms">
                        </div>
                    </div>

                    <!-- Notes -->
                    <div v-if="lease.notes"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseNotes }}</h3>
                        <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{{ lease.notes }}</p>
                    </div>
                </div>

                <!-- Right: Sidebar -->
                <div class="space-y-6 transition-all duration-500 delay-150"
                    :class="sidebarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

                    <!-- Rent summary card -->
                    <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-6 text-white">
                        <p class="text-sm opacity-80">{{ t.leaseMonthlyRent }}</p>
                        <p class="text-3xl font-bold mt-1">{{ formatCurrency(lease.monthlyRent, lease.currency) }}</p>
                        <p v-if="lease.depositAmount" class="text-sm opacity-80 mt-2">{{ t.leaseDepositAmount }}: {{
                            formatCurrency(lease.depositAmount, lease.currency) }}</p>
                        <div class="mt-3 pt-3 border-t border-white/20">
                            <p class="text-sm opacity-80">{{ t.leaseDuration }}</p>
                            <p class="text-lg font-semibold mt-0.5">{{ leaseDuration(lease.startDate, lease.endDate) }}
                            </p>
                        </div>
                    </div>

                    <!-- Resident -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.residentInfo }}</h3>
                        <div v-if="lease.resident" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-user text-primary-600 dark:text-primary-400"></i>
                            </div>
                            <div>
                                <NuxtLink :to="`/manager/residents/${lease.resident.id}`"
                                    class="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                    {{ lease.resident.username }}
                                </NuxtLink>
                                <p class="text-xs text-gray-400">{{ lease.resident.email }}</p>
                                <p v-if="lease.resident.roomNumber" class="text-xs text-gray-500 dark:text-gray-400">
                                    <i class="fa-solid fa-key text-xs mr-1"></i>{{ lease.resident.roomNumber }}
                                </p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Property -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.property }}</h3>
                        <div v-if="lease.property" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-house text-emerald-600 dark:text-emerald-400"></i>
                            </div>
                            <div>
                                <NuxtLink :to="`/manager/properties/${lease.property.documentId}`"
                                    class="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                    {{ lease.property.name }}
                                </NuxtLink>
                                <p v-if="lease.property.city" class="text-xs text-gray-400">{{ lease.property.city }}
                                </p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Unit Type -->
                    <div v-if="lease.unitType"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.unitTypeLabel }}</h3>
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-table-cells text-violet-600 dark:text-violet-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.unitType.name }}
                                </p>
                                <p class="text-xs text-gray-400">{{ lease.unitType.unitType }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Dates timeline -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseTimeline }}</h3>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-calendar text-emerald-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseStartDate }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.startDate) }}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-calendar text-red-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseEndDate }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.endDate) }}</p>
                                </div>
                            </div>
                            <div v-if="lease.acceptedAt" class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-check text-blue-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseAcceptedAt }}</p>
                                    <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                        formatDate(lease.acceptedAt) }}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-clock text-gray-400 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseCreatedAt }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.createdAt) }}</p>
                                </div>
                            </div>
                        </div>
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
                            <i class="fa-solid fa-trash text-red-600 dark:text-red-400 text-lg"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteLease }}</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.removeResidentCannotUndo }}</p>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ t.deleteLeaseConfirm }} <strong class="text-gray-900 dark:text-white">{{ lease?.leaseNo
                            }}</strong>{{
                                t.deleteLeaseConfirm2 }}
                    </p>
                    <div class="flex gap-3 pt-2">
                        <button @click="showDeleteModal = false"
                            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">{{
                                t.cancel }}</button>
                        <button @click="deleteLease" :disabled="isDeleting"
                            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">{{
                                isDeleting ? t.removing : t.delete }}</button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Renew Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showRenewModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <!-- Header -->
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-rotate text-emerald-600 dark:text-emerald-400 text-lg"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.renewLease }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.renewLeaseDesc }}</p>
                            </div>
                        </div>

                        <!-- Current lease info -->
                        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1">
                            <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.renewFromLease }}</p>
                            <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ lease?.leaseNo }}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                {{ formatDate(lease?.startDate ?? null) }} — {{ formatDate(lease?.endDate ?? null) }}
                            </p>
                        </div>

                        <!-- Duration presets -->
                        <div>
                            <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{{ t.renewQuickSelect
                            }}</p>
                            <div class="flex gap-2">
                                <button @click="applyDurationPreset(3)"
                                    class="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-colors">
                                    {{ t.renew3Months }}
                                </button>
                                <button @click="applyDurationPreset(6)"
                                    class="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-colors">
                                    {{ t.renew6Months }}
                                </button>
                                <button @click="applyDurationPreset(12)"
                                    class="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-colors">
                                    {{ t.renew1Year }}
                                </button>
                            </div>
                        </div>

                        <!-- Date inputs -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{
                                    t.leaseStartDate }}</label>
                                <input v-model="renewStartDate" type="date"
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{
                                    t.leaseEndDate
                                }}</label>
                                <input v-model="renewEndDate" type="date"
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" />
                            </div>
                        </div>

                        <!-- Duration preview -->
                        <div v-if="renewDurationLabel"
                            class="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                            <i class="fa-solid fa-calendar text-emerald-500 text-sm"></i>
                            <span class="text-sm font-medium text-emerald-700 dark:text-emerald-400">{{
                                t.renewNewDuration }}:
                                {{ renewDurationLabel }}</span>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-3 pt-1">
                            <button @click="showRenewModal = false"
                                class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="renewLease" :disabled="isRenewing || !renewStartDate || !renewEndDate"
                                class="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                                <span v-if="isRenewing" class="flex items-center justify-center gap-2">
                                    <div
                                        class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin">
                                    </div>
                                    {{ t.renewingLease }}
                                </span>
                                <span v-else>{{ t.renewLeaseConfirm }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
