<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface MaintenanceRequest {
    id: number
    documentId: string
    requestNumber: string
    title: string
    description: string
    category: string
    priority: string
    status: string
    roomNumber: string | null
    scheduledDate: string | null
    completedDate: string | null
    assignedTo: string | null
    estimatedCost: number | null
    actualCost: number | null
    createdAt: string
    images: { id: number; url: string }[] | null
    property: { id: number; documentId: string; name: string } | null
}

// ─── State ────────────────────────────────────────────────────────────────────
const allRequests = ref<MaintenanceRequest[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterStatus = ref('')
const filterCategory = ref('')

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)

const filteredRequests = computed(() => {
    let result = allRequests.value
    const q = searchQuery.value.trim().toLowerCase()
    if (q) {
        result = result.filter(r =>
            r.requestNumber.toLowerCase().includes(q) ||
            r.title.toLowerCase().includes(q)
        )
    }
    if (filterStatus.value) {
        result = result.filter(r => r.status === filterStatus.value)
    }
    if (filterCategory.value) {
        result = result.filter(r => r.category === filterCategory.value)
    }
    return result
})

const totalCount = computed(() => filteredRequests.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const requests = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredRequests.value.slice(start, start + pageSize.value)
})

// ─── Cancel modal ─────────────────────────────────────────────────────────────
const showCancelModal = ref(false)
const cancelTarget = ref<MaintenanceRequest | null>(null)
const isCancelling = ref(false)

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 4000)
}

// ─── Status / Category helpers ────────────────────────────────────────────────
const statuses = ['pending', 'in_progress', 'on_hold', 'resolved', 'cancelled']
const categories = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'pest_control', 'other']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    on_hold: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    resolved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

const statusDotColors: Record<string, string> = {
    pending: 'bg-amber-500',
    in_progress: 'bg-blue-500',
    on_hold: 'bg-gray-400',
    resolved: 'bg-emerald-500',
    cancelled: 'bg-red-500',
}

const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    medium: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    urgent: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

const categoryIcons: Record<string, string> = {
    plumbing: 'fa-solid fa-droplet',
    electrical: 'fa-solid fa-bolt',
    hvac: 'fa-solid fa-fan',
    appliance: 'fa-solid fa-tv',
    structural: 'fa-solid fa-building',
    cleaning: 'fa-solid fa-broom',
    pest_control: 'fa-solid fa-bug',
    other: 'fa-solid fa-wrench',
}

const statusLabels = computed(() => ({
    pending: t.value.pending || 'Pending',
    in_progress: t.value.in_progress || 'In Progress',
    on_hold: t.value.on_hold || 'On Hold',
    resolved: t.value.resolved || 'Resolved',
    cancelled: t.value.cancelled || 'Cancelled',
}))

const categoryLabels = computed(() => ({
    plumbing: t.value.plumbing || 'Plumbing',
    electrical: t.value.electrical || 'Electrical',
    hvac: t.value.hvac || 'HVAC',
    appliance: t.value.appliance || 'Appliance',
    structural: t.value.structural || 'Structural',
    cleaning: t.value.cleaning || 'Cleaning',
    pest_control: t.value.pest_control || 'Pest Control',
    other: t.value.other || 'Other',
}))

const priorityLabels = computed(() => ({
    low: t.value.low || 'Low',
    medium: t.value.medium || 'Medium',
    high: t.value.high || 'High',
    urgent: t.value.urgent || 'Urgent',
}))

// ─── UI labels (formatter-safe) ───────────────────────────────────────────────
const ui = computed(() => ({
    searchMaintenance: t.value.searchMaintenance || 'Search by request # or title...',
    allStatuses: t.value.allStatuses || 'All Statuses',
    allCategories: t.value.allCategories || 'All Categories',
    newRequest: t.value.newMaintenanceRequest || 'New Request',
    createRequest: t.value.createMaintenance || 'Create Request',
    cancelRequest: t.value.cancel || 'Cancel',
    cancelRequestTitle: t.value.cancelled || 'Cancel Request',
    cancelConfirm: 'Are you sure you want to cancel this request?',
    page: t.value.page || 'Page',
    of: t.value.of || 'of',
    requestsFound: t.value.maintenanceFoundPlural || 'requests',
    requestFound: t.value.maintenanceFound || 'request',
}))

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = computed(() => {
    const all = allRequests.value
    return {
        total: all.length,
        pending: all.filter(r => r.status === 'pending').length,
        inProgress: all.filter(r => r.status === 'in_progress').length,
        resolved: all.filter(r => r.status === 'resolved').length,
    }
})

const activeFilterCount = computed(() =>
    [filterStatus.value, filterCategory.value, searchQuery.value.trim()].filter(Boolean).length
)

// ─── Fetch Maintenance Requests ───────────────────────────────────────────────
async function fetchRequests() {
    if (!user.value?.documentId) return
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'filters[resident][documentId][$eq]': user.value.documentId,
            'populate[0]': 'property',
            'populate[1]': 'images',
            'pagination[pageSize]': '500',
            'sort[0]': 'createdAt:desc',
        })

        const res = await fetch(`${STRAPI_URL}/api/maintenances?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        allRequests.value = (data.data ?? []).map((m: any) => ({
            ...m,
            images: m.images ?? [],
            property: m.property ?? null,
        }))
    } catch {
        showToast('error', t.value.maintenanceLoadError || 'Failed to load requests')
    } finally {
        isLoading.value = false
    }
}

// ─── Cancel Request ───────────────────────────────────────────────────────────
function confirmCancel(req: MaintenanceRequest) {
    cancelTarget.value = req
    showCancelModal.value = true
}

async function cancelRequest() {
    if (!cancelTarget.value) return
    isCancelling.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/maintenances/${cancelTarget.value.documentId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: { status: 'cancelled' } }),
        })
        if (!res.ok) throw new Error('Cancel failed')
        showToast('success', t.value.maintenanceUpdated || 'Request cancelled')
        showCancelModal.value = false
        cancelTarget.value = null
        await fetchRequests()
    } catch {
        showToast('error', t.value.maintenanceUpdateError || 'Failed to cancel request')
    } finally {
        isCancelling.value = false
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToRequest(documentId: string) {
    router.push(`/resident/maintenance/${documentId}`)
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Watch ────────────────────────────────────────────────────────────────────
watch([searchQuery, filterStatus, filterCategory], () => { currentPage.value = 1 })

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const statsVisible = ref(false)
const filtersVisible = ref(false)
const listVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchRequests()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        statsVisible.value = true
        filtersVisible.value = true
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 pb-20 sm:pb-6">
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
                        <button @click="toasts = toasts.filter(t => t.id !== toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.maintenanceTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.myMaintenanceSubtitle }}</p>
            </div>
            <NuxtLink to="/resident/maintenance/new"
                class="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                <i class="fa-solid fa-plus text-xs"></i>
                {{ ui.createRequest }}
            </NuxtLink>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 transition-all duration-500 delay-100"
            :class="statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
            <!-- Total -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div class="flex items-center gap-2 mb-2">
                    <div
                        class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-wrench text-primary-500 text-sm"></i>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                        t.total }}</span>
                </div>
                <p class="text-lg font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
            </div>

            <!-- Pending -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div class="flex items-center gap-2 mb-2">
                    <div
                        class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-clock text-amber-500 text-sm"></i>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                        t.pending }}</span>
                </div>
                <p class="text-lg font-bold text-gray-900 dark:text-white">{{ stats.pending }}</p>
            </div>

            <!-- In Progress -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-gear text-blue-500 text-sm"></i>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                        statusLabels['in_progress'] }}</span>
                </div>
                <p class="text-lg font-bold text-gray-900 dark:text-white">{{ stats.inProgress }}</p>
            </div>

            <!-- Resolved -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div class="flex items-center gap-2 mb-2">
                    <div
                        class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{{
                        t.resolved }}</span>
                </div>
                <p class="text-lg font-bold text-gray-900 dark:text-white">{{ stats.resolved }}</p>
            </div>
        </div>

        <!-- Search + Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-200"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <div class="relative">
                <i
                    class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="ui.searchMaintenance"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div class="flex flex-wrap gap-2 items-center">
                <!-- Status -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ ui.allStatuses }}</option>
                        <option v-for="s in statuses" :key="s" :value="s">
                            {{ statusLabels[s as keyof typeof statusLabels] || s }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                </div>
                <!-- Category -->
                <div class="relative">
                    <select v-model="filterCategory"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ ui.allCategories }}</option>
                        <option v-for="c in categories" :key="c" :value="c">
                            {{ categoryLabels[c as keyof typeof categoryLabels] || c }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                </div>
                <!-- Clear -->
                <button v-if="activeFilterCount > 0" @click="filterStatus = ''; filterCategory = ''; searchQuery = ''"
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
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingMaintenance }}</p>
            </div>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredRequests.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <i class="fa-solid fa-wrench text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">
                {{ allRequests.length === 0 ? t.noMaintenanceResident : t.noMaintenance }}
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {{ allRequests.length === 0 ? t.noMaintenanceResidentDesc : t.tryAdjustingFilters }}
            </p>
            <NuxtLink v-if="allRequests.length === 0" to="/resident/maintenance/new"
                class="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors">
                <i class="fa-solid fa-plus text-xs"></i>
                {{ ui.createRequest }}
            </NuxtLink>
        </div>

        <!-- Request Cards -->
        <div v-if="!isLoading && filteredRequests.length > 0" class="space-y-3">
            <div v-for="(req, index) in requests" :key="req.id"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }"
                @click="goToRequest(req.documentId)">
                <div class="flex items-center gap-4">
                    <!-- Category Icon -->
                    <div
                        class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <i :class="categoryIcons[req.category] || categoryIcons.other"
                            class="text-xl text-gray-600 dark:text-gray-400"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate text-sm">
                                {{ req.title }}
                            </h3>
                            <span :class="statusColors[req.status]"
                                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold">
                                <span :class="statusDotColors[req.status]" class="w-1.5 h-1.5 rounded-full"></span>
                                {{ statusLabels[req.status as keyof typeof statusLabels] || req.status }}
                            </span>
                            <span :class="priorityColors[req.priority]"
                                class="px-2 py-0.5 rounded-full text-xs font-medium">
                                {{ priorityLabels[req.priority as keyof typeof priorityLabels] || req.priority }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{{ req.description }}</p>
                        <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span class="text-xs text-gray-400 font-mono">{{ req.requestNumber }}</span>
                            <span v-if="req.property" class="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i class="fa-solid fa-building text-[10px]"></i>
                                {{ req.property.name }}
                            </span>
                            <span v-if="req.roomNumber" class="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i class="fa-solid fa-door-open text-[10px]"></i>
                                {{ req.roomNumber }}
                            </span>
                            <span class="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i class="fa-solid fa-calendar text-[10px]"></i>
                                {{ formatDate(req.createdAt) }}
                            </span>
                            <span v-if="req.images && req.images.length > 0"
                                class="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i class="fa-solid fa-image text-[10px]"></i>
                                {{ req.images.length }}
                            </span>
                        </div>
                    </div>

                    <!-- Cancel button (only for pending) -->
                    <div class="hidden sm:flex items-center gap-2 shrink-0" @click.stop>
                        <button v-if="req.status === 'pending'" @click.stop="confirmCancel(req)"
                            class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            :title="ui.cancelRequest">
                            <i class="fa-solid fa-ban text-sm"></i>
                        </button>
                    </div>

                    <!-- Arrow -->
                    <i class="fa-solid fa-chevron-right text-xs text-gray-300 dark:text-gray-600 shrink-0"></i>
                </div>

                <!-- Mobile meta row -->
                <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                    <span class="text-xs text-gray-400 font-mono">{{ req.requestNumber }}</span>
                    <span v-if="req.property" class="inline-flex items-center gap-1 text-xs text-gray-400">
                        <i class="fa-solid fa-building text-[10px]"></i>
                        {{ req.property.name }}
                    </span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDate(req.createdAt) }}</span>
                    <button v-if="req.status === 'pending'" @click.stop="confirmCancel(req)"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <i class="fa-solid fa-ban text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Pagination -->
            <div v-if="totalPages > 1"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? ui.requestsFound : ui.requestFound }}</span>
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

        <!-- Cancel Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showCancelModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    @click.self="showCancelModal = false">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6">
                        <div class="flex items-start gap-4">
                            <div
                                class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ ui.cancelRequestTitle }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ ui.cancelConfirm }}
                                    <strong class="text-gray-900 dark:text-white block mt-1">{{ cancelTarget?.title
                                        }}</strong>
                                    <span class="text-xs font-mono text-gray-400">{{ cancelTarget?.requestNumber
                                        }}</span>
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showCancelModal = false; cancelTarget = null" :disabled="isCancelling"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.close }}
                            </button>
                            <button @click="cancelRequest" :disabled="isCancelling"
                                class="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isCancelling" class="fa-solid fa-spinner fa-spin text-xs"></i>
                                <i v-else class="fa-solid fa-ban text-xs"></i>
                                {{ ui.cancelRequestTitle }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
