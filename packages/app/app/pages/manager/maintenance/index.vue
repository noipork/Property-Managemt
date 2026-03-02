<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const { onNewMaintenanceMessage, onMaintenanceUpdated, joinMaintenance, leaveMaintenance, isConnected } = useSocket()
const STRAPI_URL = config.public.strapiUrl
const LAST_SEEN_KEY = 'pm-maint-last-seen-manager'

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
    updatedAt: string
    createdAt: string
    images: { id: number; url: string }[] | null
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string } | null
    unreadCount?: number
    hasStatusUpdate?: boolean
}

interface Property {
    id: number
    documentId: string
    name: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const allRequests = ref<MaintenanceRequest[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterPropertyId = ref('')
const filterStatus = ref('')
const filterCategory = ref('')
const filterPriority = ref('')
const sortBy = ref('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = computed(() => allRequests.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const requests = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return allRequests.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50, 100]

// ─── Delete Modal ─────────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleteTarget = ref<MaintenanceRequest | null>(null)
const isDeleting = ref(false)

// ─── Properties list ──────────────────────────────────────────────────────────
const propertiesList = ref<Property[]>([])
const joinedMaintenances = new Set<string>()
const cleanupFns: Array<() => void> = []

async function fetchProperties() {
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id, documentId: p.documentId, name: p.name,
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

// ─── Status / Category / Priority helpers ─────────────────────────────────────
const statuses = ['pending', 'in_progress', 'on_hold', 'resolved', 'cancelled']
const categories = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'pest_control', 'other']
const priorities = ['low', 'medium', 'high', 'urgent']

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    on_hold: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    resolved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
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

const statusDotColors: Record<string, string> = {
    pending: 'bg-amber-500',
    in_progress: 'bg-blue-500',
    on_hold: 'bg-gray-400',
    resolved: 'bg-emerald-500',
    cancelled: 'bg-red-500',
}

const statusLabels = computed(() => ({
    pending: t.value.pending,
    in_progress: t.value.in_progress,
    on_hold: t.value.on_hold,
    resolved: t.value.resolved,
    cancelled: t.value.cancelled,
}))

const categoryLabels = computed(() => ({
    plumbing: t.value.plumbing,
    electrical: t.value.electrical,
    hvac: t.value.hvac,
    appliance: t.value.appliance,
    structural: t.value.structural,
    cleaning: t.value.cleaning,
    pest_control: t.value.pest_control,
    other: t.value.other,
}))

const priorityLabels = computed(() => ({
    low: t.value.low,
    medium: t.value.medium,
    high: t.value.high,
    urgent: t.value.urgent,
}))

// ─── Fetch Maintenance Requests ───────────────────────────────────────────────
let initializing = true

async function fetchRequests() {
    if (initializing) return
    isLoading.value = true
    try {
        const lastSeenMap = loadLastSeenMap()
        const params = new URLSearchParams()
        params.set('populate[resident][fields][0]', 'username')
        params.set('populate[resident][fields][1]', 'email')
        params.set('populate[resident][fields][2]', 'roomNumber')
        params.set('populate[property][fields][0]', 'name')
        params.set('populate[images]', 'true')
        if (user.value?.documentId) {
            params.set('populate[messages][fields][0]', 'id')
            params.set('populate[messages][fields][1]', 'isRead')
            params.set('populate[messages][filters][isRead][$eq]', 'false')
            params.set('populate[messages][filters][sender][documentId][$ne]', user.value.documentId)
        }
        params.set('pagination[pageSize]', '500')
        params.set(`sort[0]`, `${sortBy.value}:${sortDir.value}`)

        if (filterPropertyId.value) {
            params.set('filters[property][documentId][$eq]', filterPropertyId.value)
        }
        if (filterStatus.value) {
            params.set('filters[status][$eq]', filterStatus.value)
        }
        if (filterCategory.value) {
            params.set('filters[category][$eq]', filterCategory.value)
        }
        if (filterPriority.value) {
            params.set('filters[priority][$eq]', filterPriority.value)
        }
        if (searchQuery.value.trim()) {
            const q = searchQuery.value.trim()
            params.set('filters[$or][0][requestNumber][$containsi]', q)
            params.set('filters[$or][1][title][$containsi]', q)
        }

        const res = await fetch(`${STRAPI_URL}/api/maintenances?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        allRequests.value = (data.data ?? []).map((m: any) => ({
            ...m,
            images: m.images ?? [],
            resident: m.resident ?? null,
            property: m.property ?? null,
            unreadCount: Array.isArray(m.messages) ? m.messages.length : 0,
            hasStatusUpdate: (m.updatedAt ? new Date(m.updatedAt).getTime() : 0) > (lastSeenMap[m.documentId] ?? 0),
        }))
        if (isConnected.value) joinMaintenanceRooms()
    } catch {
        showToast('error', t.value.maintenanceLoadError)
    } finally {
        isLoading.value = false
    }
}

function joinMaintenanceRooms() {
    allRequests.value.forEach((req) => {
        if (req.documentId && !joinedMaintenances.has(req.documentId)) {
            joinMaintenance(req.documentId)
            joinedMaintenances.add(req.documentId)
        }
    })
}

function leaveMaintenanceRooms() {
    joinedMaintenances.forEach(id => leaveMaintenance(id))
    joinedMaintenances.clear()
}

function loadLastSeenMap(): Record<string, number> {
    if (typeof localStorage === 'undefined') return {}
    try {
        const raw = localStorage.getItem(LAST_SEEN_KEY)
        return raw ? JSON.parse(raw) as Record<string, number> : {}
    } catch {
        return {}
    }
}

watch([filterPropertyId, filterStatus, filterCategory, filterPriority, searchQuery, sortBy, sortDir], () => {
    currentPage.value = 1
    fetchRequests()
}, { debounce: 300 } as any)

watch(currentPage, () => {
    nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
})

watch(isConnected, (connected) => {
    if (connected) joinMaintenanceRooms()
})

// ─── Delete ───────────────────────────────────────────────────────────────────
function confirmDelete(req: MaintenanceRequest) {
    deleteTarget.value = req
    showDeleteModal.value = true
}

async function deleteRequest() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/maintenances/${deleteTarget.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.maintenanceDeleted)
        showDeleteModal.value = false
        deleteTarget.value = null
        await fetchRequests()
    } catch {
        showToast('error', t.value.maintenanceDeleteError)
    } finally {
        isDeleting.value = false
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToRequest(documentId: string) {
    markCardAsSeen(documentId)
    markMaintenanceMessagesRead(documentId)
    router.push(`/manager/maintenance/${documentId}`)
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toggleSortDir() {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}

function markCardAsSeen(documentId: string) {
    const target = allRequests.value.find(r => r.documentId === documentId)
    if (target) {
        target.unreadCount = 0
        target.hasStatusUpdate = false
    }
    persistLastSeen(documentId)
}

async function markMaintenanceMessagesRead(documentId: string) {
    if (!token.value) return
    try {
        await fetch(`${STRAPI_URL}/api/maintenance-messages/mark-read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({ maintenanceDocumentId: documentId }),
        })
    } catch { /* ignore */ }
}

function persistLastSeen(documentId: string) {
    if (typeof localStorage === 'undefined') return
    try {
        const raw = localStorage.getItem(LAST_SEEN_KEY)
        const map = raw ? JSON.parse(raw) as Record<string, number> : {}
        map[documentId] = Date.now()
        localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map))
    } catch { /* ignore */ }
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
        filterPropertyId.value = String(propertiesList.value[0]?.documentId ?? '')
    }
    initializing = false
    await fetchRequests()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))

    cleanupFns.push(
        onNewMaintenanceMessage((data) => {
            const target = allRequests.value.find(r => r.documentId === data.maintenanceDocumentId)
            if (!target) return
            if (data.message?.sender?.documentId === user.value?.documentId) return
            target.unreadCount = (target.unreadCount ?? 0) + 1
        })
    )

    cleanupFns.push(
        onMaintenanceUpdated((data) => {
            const target = allRequests.value.find(r => r.documentId === data.maintenanceDocumentId)
            if (target) target.hasStatusUpdate = true
        })
    )
})

onUnmounted(() => {
    cleanupFns.forEach(fn => fn())
    cleanupFns.length = 0
    leaveMaintenanceRooms()
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
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="fa-solid fa-xmark text-xs"></i></button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Header -->
        <div class="transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.maintenanceTitle }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.maintenanceSubtitle }}</p>
        </div>

        <!-- Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 sm:p-4 transition-all duration-500 delay-100"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <!-- Search - Full width on mobile -->
            <div class="relative w-full mb-3">
                <i
                    class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchMaintenance"
                    class="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            <!-- Filters grid - 2 columns on mobile, flex on desktop -->
            <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                <!-- Property filter -->
                <div class="relative col-span-2 sm:col-span-1">
                    <select v-model="filterPropertyId"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allProperties }}</option>
                        <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                            {{ prop.name }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Status filter -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allStatuses }}</option>
                        <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Category filter -->
                <div class="relative">
                    <select v-model="filterCategory"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allCategories }}</option>
                        <option v-for="c in categories" :key="c" :value="c">{{ categoryLabels[c] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Priority filter -->
                <div class="relative">
                    <select v-model="filterPriority"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allPriorities }}</option>
                        <option v-for="p in priorities" :key="p" :value="p">{{ priorityLabels[p] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Sort -->
                <div class="flex items-center gap-1 col-span-2 sm:col-span-1">
                    <div class="relative flex-1">
                        <select v-model="sortBy"
                            class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                            <option value="createdAt">{{ t.sortByCreated }}</option>
                            <option value="priority">{{ t.sortByPriority }}</option>
                            <option value="status">{{ t.sortByStatus }}</option>
                            <option value="category">{{ t.sortByCategory }}</option>
                        </select>
                        <i
                            class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                    </div>
                    <button @click="toggleSortDir"
                        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                        :title="sortDir === 'asc' ? 'Ascending' : 'Descending'">
                        <i :class="sortDir === 'asc' ? 'fa-solid fa-arrow-up-a-z' : 'fa-solid fa-arrow-down-a-z'"
                            class="text-gray-500 dark:text-gray-400"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingMaintenance }}</p>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="allRequests.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <i class="fa-solid fa-wrench text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noMaintenance }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noMaintenanceDesc }}</p>
        </div>

        <!-- Request Cards -->
        <div v-else class="space-y-3">
            <div v-for="(req, idx) in requests" :key="req.id" @click="goToRequest(req.documentId)"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${idx * 40}ms` : '0ms' }">
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
                            <span v-if="req.unreadCount"
                                class="min-w-[22px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {{ req.unreadCount > 99 ? '99+' : req.unreadCount }}
                            </span>
                            <span v-else-if="req.hasStatusUpdate" class="w-2 h-2 rounded-full bg-amber-500"
                                title="New update"></span>
                            <span :class="statusColors[req.status]"
                                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold">
                                <span :class="statusDotColors[req.status]" class="w-1.5 h-1.5 rounded-full"></span>
                                {{ statusLabels[req.status] }}
                            </span>
                            <span :class="priorityColors[req.priority]"
                                class="px-2 py-0.5 rounded-full text-xs font-medium">
                                {{ priorityLabels[req.priority] }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{{ req.description }}</p>
                        <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span class="text-xs text-gray-400 font-mono">{{ req.requestNumber }}</span>
                            <span v-if="req.resident" class="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i class="fa-solid fa-user text-[10px]"></i>
                                {{ req.resident.username }}
                            </span>
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

                    <!-- Arrow -->
                    <i class="fa-solid fa-chevron-right text-xs text-gray-300 dark:text-gray-600 shrink-0"></i>
                </div>

                <!-- Mobile meta row -->
                <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                    <span class="text-xs text-gray-400 font-mono">{{ req.requestNumber }}</span>
                    <span v-if="req.unreadCount"
                        class="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {{ req.unreadCount > 99 ? '99+' : req.unreadCount }}
                    </span>
                    <span v-else-if="req.hasStatusUpdate" class="w-2 h-2 rounded-full bg-amber-500"
                        title="New update"></span>
                    <span v-if="req.resident" class="inline-flex items-center gap-1 text-xs text-gray-400">
                        <i class="fa-solid fa-user text-[10px]"></i>
                        {{ req.resident.username }}
                    </span>
                    <span v-if="req.property" class="inline-flex items-center gap-1 text-xs text-gray-400">
                        <i class="fa-solid fa-building text-[10px]"></i>
                        {{ req.property.name }}
                    </span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDate(req.createdAt) }}</span>
                </div>
            </div>

            <!-- Pagination -->
            <div v-if="totalPages > 1"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? t.maintenanceFoundPlural : t.maintenanceFound }}</span>
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
                        {{ currentPage }} / {{ totalPages }}
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
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDeleteModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6">
                        <div class="flex items-start gap-4">
                            <div
                                class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteMaintenance }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ t.deleteMaintenanceConfirm }} <strong class="text-gray-900 dark:text-white">{{
                                        deleteTarget?.requestNumber }}</strong>{{ t.deleteMaintenanceConfirm2 }}
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showDeleteModal = false; deleteTarget = null" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="deleteRequest" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isDeleting" class="fa-solid fa-spinner fa-spin text-xs"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
