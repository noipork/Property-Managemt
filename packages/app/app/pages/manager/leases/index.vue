<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

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
    acceptedAt: string | null
    createdAt: string
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string; city: string } | null
    unitType: { id: number; name: string } | null
}

interface Property {
    id: number
    documentId: string
    name: string
    city: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const allLeases = ref<Lease[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterPropertyId = ref('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')


// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = computed(() => allLeases.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const leases = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return allLeases.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50, 100]

// ─── Delete Modal ─────────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleteTarget = ref<Lease | null>(null)
const isDeleting = ref(false)

// ─── Properties list ──────────────────────────────────────────────────────────
const propertiesList = ref<Property[]>([])

async function fetchProperties() {
    try {
        const params = new URLSearchParams({
            'pagination[pageSize]': '200',
            'fields[0]': 'name',
            'fields[1]': 'city',
        })
        if (user.value?.documentId) {
            params.set('filters[owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(
            `${STRAPI_URL}/api/properties?${params}`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id, documentId: p.documentId, name: p.name, city: p.city,
        }))
    } catch { /* ignore */ }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }, 4000)
}
function dismissToast(id: number) {
    const i = toasts.value.findIndex(t => t.id === id)
    if (i !== -1) toasts.value.splice(i, 1)
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const leaseStatuses = ['pending', 'active', 'expired', 'terminated', 'cancelled']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    terminated: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.pending,
    reviewing: t.value.leaseStatusReviewing || 'Under Review',
    active: t.value.active,
    expired: t.value.statusExpired,
    terminated: t.value.leaseTerminated,
    cancelled: t.value.cancelled,
}))

const activeFilterCount = computed(() =>
    [filterStatus.value, filterDateFrom.value, filterDateTo.value].filter(Boolean).length
)

// ─── Fetch Leases ─────────────────────────────────────────────────────────────
async function fetchLeases() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'unitType',
            'pagination[pageSize]': '1000',
            'pagination[page]': '1',
            'sort[0]': 'id:desc',
        })
        if (filterPropertyId.value) {
            const prop = propertiesList.value.find(p => String(p.id) === filterPropertyId.value)
            if (prop) params.set('filters[property][documentId][$eq]', prop.documentId)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        if (filterStatus.value)
            params.set('filters[status][$eq]', filterStatus.value)
        if (filterDateFrom.value)
            params.set('filters[startDate][$gte]', filterDateFrom.value)
        if (filterDateTo.value)
            params.set('filters[endDate][$lte]', filterDateTo.value)
        if (searchQuery.value.trim()) {
            params.set('filters[$or][0][leaseNo][$containsi]', searchQuery.value.trim())
            params.set('filters[$or][1][resident][username][$containsi]', searchQuery.value.trim())
        }

        const res = await fetch(`${STRAPI_URL}/api/leases?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch leases')
        const data = await res.json()
        allLeases.value = (data.data ?? []).map((item: any) => ({
            ...item,
            resident: item.resident ?? null,
            property: item.property ?? null,
            unitType: item.unitType ?? null,
        }))
        currentPage.value = 1
    } catch {
        showToast('error', t.value.leaseLoadError)
    } finally {
        isLoading.value = false
    }
}

function resetAndFetch() {
    currentPage.value = 1
    fetchLeases()
}

let initializing = true

watch(searchQuery, resetAndFetch)
watch(filterPropertyId, () => { if (!initializing) resetAndFetch() })
watch([filterStatus, filterDateFrom, filterDateTo], resetAndFetch)
watch(pageSize, () => { currentPage.value = 1 })

// ─── Delete ───────────────────────────────────────────────────────────────────
function confirmDelete(lease: Lease) {
    deleteTarget.value = lease
    showDeleteModal.value = true
}

function goToLease(documentId: string) {
    router.push(`/manager/leases/${documentId}`)
}

async function deleteLease() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/leases/${deleteTarget.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.leaseDeleted)
        await fetchLeases()
    } catch {
        showToast('error', t.value.leaseDeleteError)
    } finally {
        isDeleting.value = false
        showDeleteModal.value = false
        deleteTarget.value = null
    }
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

function leaseDuration(start: string, end: string) {
    const s = new Date(start)
    const e = new Date(end)
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months >= 1) return `${months} ${months === 1 ? t.value.leaseDurationMonths : t.value.leaseDurationMonthsPlural}`
    const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} ${t.value.leaseDurationDays}`
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
        filterPropertyId.value = String(propertiesList.value[0]?.id ?? '')
    }
    initializing = false
    await fetchLeases()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6">
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
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.leasesTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.leasesSubtitle }}</p>
            </div>
            <NuxtLink to="/manager/leases/create"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="fa-solid fa-plus text-base"></i>
                {{ t.createLease }}
            </NuxtLink>
        </div>

        <!-- Property Dropdown -->
        <div class="relative w-full sm:w-72 transition-all duration-500 delay-100"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <i
                class="fa-solid fa-house absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
            <select v-model="filterPropertyId"
                class="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors">
                <option value="">{{ t.allProperties }}</option>
                <option v-for="prop in propertiesList" :key="prop.id" :value="String(prop.id)">
                    {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                </option>
            </select>
            <i
                class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
        </div>

        <!-- Search + Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-150"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <div class="relative">
                <i
                    class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchLeases"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div class="flex flex-wrap gap-2 items-center">
                <!-- Status -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allStatuses }}</option>
                        <option v-for="s in leaseStatuses" :key="s" :value="s">{{ statusLabels[s as keyof typeof
                            statusLabels] || s }}</option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <!-- Date Range -->
                <div class="flex items-center gap-1.5">
                    <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ t.leasePeriod }}</span>
                    <input v-model="filterDateFrom" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                    <span class="text-xs text-gray-400">–</span>
                    <input v-model="filterDateTo" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                </div>
                <!-- Clear -->
                <button v-if="activeFilterCount > 0" @click="filterStatus = ''; filterDateFrom = ''; filterDateTo = ''"
                    class="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors">
                    <i class="fa-solid fa-xmark text-xs"></i>
                    Clear ({{ activeFilterCount }})
                </button>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingLeases }}</p>
            </div>
        </div>

        <!-- Empty -->
        <div v-else-if="leases.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <i class="fa-solid fa-file-contract text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noLeases }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.noLeasesDesc }}</p>
            <NuxtLink to="/manager/leases/create"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="fa-solid fa-plus text-base"></i>
                {{ t.createLease }}
            </NuxtLink>
        </div>

        <!-- Lease Card List -->
        <div v-if="!isLoading && leases.length > 0" class="space-y-3">
            <div v-for="(lease, index) in leases" :key="lease.id"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }"
                @click="goToLease(lease.documentId)">
                <div class="flex items-center gap-4">
                    <!-- Icon -->
                    <div
                        class="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-file-contract text-xl text-primary-600 dark:text-primary-400"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ lease.leaseNo }}</h3>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="statusColors[lease.status] || statusColors.pending">
                                {{ statusLabels[lease.status as keyof typeof statusLabels] || lease.status }}
                            </span>
                        </div>
                        <p v-if="lease.resident" class="text-sm text-gray-500 dark:text-gray-400 truncate">
                            <i class="fa-solid fa-user text-xs mr-1"></i>{{ lease.resident.username }}
                            <span v-if="lease.resident.roomNumber"> · Room {{ lease.resident.roomNumber }}</span>
                        </p>
                        <p v-if="lease.property" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            <i class="fa-solid fa-house text-xs mr-1"></i>{{ lease.property.name }}
                        </p>
                    </div>

                    <!-- Rent Amount -->
                    <div class="hidden sm:block text-right min-w-[100px]">
                        <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(lease.monthlyRent,
                            lease.currency) }}</p>
                        <p class="text-xs text-gray-400">{{ t.leaseMonthlyRent }}</p>
                    </div>

                    <!-- Duration Badge -->
                    <div class="hidden sm:block text-center min-w-[80px]">
                        <span
                            class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                            <i class="fa-solid fa-calendar text-xs"></i>
                            {{ leaseDuration(lease.startDate, lease.endDate) }}
                        </span>
                    </div>

                    <!-- Period -->
                    <div class="hidden md:block text-center min-w-[140px]">
                        <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.leasePeriod }}</p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">{{ formatDate(lease.startDate) }} – {{
                            formatDate(lease.endDate) }}</p>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1 shrink-0">
                        <NuxtLink :to="`/manager/leases/${lease.documentId}`" @click.stop
                            class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.view">
                            <i class="fa-solid fa-eye text-base"></i>
                        </NuxtLink>
                        <NuxtLink v-if="lease.status === 'pending'" :to="`/manager/leases/${lease.documentId}/edit`"
                            @click.stop
                            class="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.edit">
                            <i class="fa-solid fa-pen text-base"></i>
                        </NuxtLink>
                        <button @click.stop="confirmDelete(lease)"
                            class="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.delete">
                            <i class="fa-solid fa-trash text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- Mobile extra row -->
                <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(lease.monthlyRent,
                        lease.currency) }}</span>
                    <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                        <i class="fa-solid fa-calendar text-xs"></i>
                        {{ leaseDuration(lease.startDate, lease.endDate) }}
                    </span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDate(lease.startDate) }}</span>
                </div>
            </div>

            <!-- Pagination -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? t.leasesFoundPlural : t.leasesFound }}</span>
                    <div class="flex items-center gap-1.5">
                        <span>{{ t.perPage }}</span>
                        <div class="relative">
                            <select v-model="pageSize"
                                class="pl-2 pr-6 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                            </select>
                            <i
                                class="fa-solid fa-angle-down absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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
                        {{ t.page }} {{ currentPage }} {{ t.of }} {{ totalPages || 1 }}
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
                        {{ t.deleteLeaseConfirm }} <strong class="text-gray-900 dark:text-white">{{
                            deleteTarget?.leaseNo }}</strong>{{ t.deleteLeaseConfirm2 }}
                    </p>
                    <div class="flex gap-3 pt-2">
                        <button @click="showDeleteModal = false"
                            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            {{ t.cancel }}
                        </button>
                        <button @click="deleteLease" :disabled="isDeleting"
                            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">
                            {{ isDeleting ? t.removing : t.delete }}
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
