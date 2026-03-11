<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface Resident {
    id: number
    documentId: string
    username: string
    email: string
    roomNumber: string | null
    registrationDate: string | null
    residencyStatus: string | null
    nextBillDate: string | null
    property: { id: number; documentId: string; name: string; city: string } | null
    unitType: { id: number; documentId: string; name: string; unitType: string; quantity: number } | null
}

interface Property {
    id: number
    documentId: string
    name: string
    city: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const allResidents = ref<Resident[]>([])  // full filtered dataset from API
const isLoading = ref(true)
const searchQuery = ref('')
const filterPropertyId = ref('')
const filterUnitTypeId = ref('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// ─── Pagination (client-side slice of allResidents) ───────────────────────────
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = computed(() => allResidents.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const residents = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return allResidents.value.slice(start, start + pageSize.value)
})
const pageSizeOptions = [10, 20, 50, 100]

// ─── Delete Modal ─────────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleteTarget = ref<Resident | null>(null)
const isDeleting = ref(false)

// ─── Properties list (fetched once for filter dropdown) ───────────────────────
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
            id: p.id,
            documentId: p.documentId,
            name: p.name,
            city: p.city,
        }))
    } catch { /* ignore */ }
}

// ─── Unit types list (fetched when property changes) ─────────────────────────
const unitTypesList = ref<{ id: number; name: string }[]>([])

async function fetchUnitTypes() {
    unitTypesList.value = []
    if (!filterPropertyId.value) return
    try {
        const prop = propertiesList.value.find(p => String(p.id) === filterPropertyId.value)
        if (!prop) return
        const params = new URLSearchParams({
            'filters[property][documentId][$eq]': prop.documentId,
            'pagination[pageSize]': '100',
            'fields[0]': 'name',
        })
        const res = await fetch(`${STRAPI_URL}/api/unit-types?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        unitTypesList.value = (data.data ?? []).map((ut: any) => ({ id: ut.id, name: ut.name }))
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

const statuses = ['reserved', 'active', 'nearlyExpired', 'expired', 'inactive']

const activeFilterCount = computed(() =>
    [filterUnitTypeId.value, filterStatus.value, filterDateFrom.value, filterDateTo.value].filter(Boolean).length
)

// ─── Fetch Residents (single API call, all matching records, paginate client-side) ──
async function fetchResidents() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'filters[role][id][$eq]': '4',
            'populate[0]': 'property',
            'populate[1]': 'unitType',
            'pagination[pageSize]': '1000',
            'pagination[page]': '1',
        })
        if (filterPropertyId.value) {
            params.set('filters[property][id][$eq]', filterPropertyId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        if (filterUnitTypeId.value)
            params.set('filters[unitType][id][$eq]', filterUnitTypeId.value)
        if (filterStatus.value)
            params.set('filters[residencyStatus][$eq]', filterStatus.value)
        if (filterDateFrom.value)
            params.set('filters[registrationDate][$gte]', filterDateFrom.value)
        if (filterDateTo.value)
            params.set('filters[registrationDate][$lte]', filterDateTo.value)
        if (searchQuery.value.trim()) {
            params.set('filters[$or][0][username][$containsi]', searchQuery.value.trim())
            params.set('filters[$or][1][roomNumber][$containsi]', searchQuery.value.trim())
        }
        params.set('sort[0]', 'id:desc')
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch residents')
        const data = await res.json()
        allResidents.value = Array.isArray(data) ? data : (data.data ?? [])
        currentPage.value = 1
    } catch {
        showToast('error', t.value.residentRemoveError)
    } finally {
        isLoading.value = false
    }
}

// Reset to page 1 and refetch when filters change
function resetAndFetch() {
    currentPage.value = 1
    fetchResidents()
}

let initializing = true

watch(searchQuery, resetAndFetch)
watch(filterPropertyId, () => { filterUnitTypeId.value = ''; fetchUnitTypes(); if (!initializing) resetAndFetch() })
watch([filterUnitTypeId, filterStatus, filterDateFrom, filterDateTo], resetAndFetch)
watch(pageSize, () => { currentPage.value = 1 })

function confirmDelete(resident: Resident) {
    deleteTarget.value = resident
    showDeleteModal.value = true
}

function goToResident(residentId: number | string) {
    router.push(`/manager/residents/${residentId}`)
}

async function deleteResident() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/users/${deleteTarget.value.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.residentRemoved)
        await fetchResidents()
    } catch {
        showToast('error', t.value.residentRemoveError)
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
        filterPropertyId.value = String(propertiesList.value[0].id)
        await fetchUnitTypes()
    }
    initializing = false
    await fetchResidents()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6">
        <!-- Toast portal -->
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
                        <i :class="toast.type === 'success' ? 'fa-solid fa-square-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
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
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.residentsTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.residentsSubtitle }}</p>
            </div>
            <NuxtLink to="/manager/residents/register"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="fa-solid fa-user-plus text-base"></i>
                {{ t.registerResident }}
            </NuxtLink>
        </div>

        <!-- Property Dropdown -->
        <div class="relative w-full sm:w-72 transition-all duration-500 delay-100"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <i class="fa-solid fa-house absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
            <select v-model="filterPropertyId" @change="filterUnitTypeId = ''"
                class="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors">
                <option value="">{{ t.allProperties }}</option>
                <option v-for="prop in propertiesList" :key="prop.id" :value="String(prop.id)">
                    {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                </option>
            </select>
            <i
                class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
        </div>

        <!-- Search + Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 transition-all duration-500 delay-150"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">
            <!-- Row 1: Search -->
            <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchResidents"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <!-- Row 2: Unit Type · Status · Date range -->
            <div class="flex flex-wrap gap-2 items-center">
                <!-- Unit Type -->
                <div class="relative">
                    <select v-model="filterUnitTypeId" :disabled="unitTypesList.length === 0"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none disabled:opacity-40">
                        <option value="">{{ t.allUnitTypes }}</option>
                        <option v-for="ut in unitTypesList" :key="ut.id" :value="String(ut.id)">{{ ut.name }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <!-- Status -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="pl-3 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allStatuses }}</option>
                        <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <!-- Date From -->
                <div class="flex items-center gap-1.5">
                    <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ t.filterRegistDate
                    }}</span>
                    <input v-model="filterDateFrom" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                    <span class="text-xs text-gray-400">–</span>
                    <input v-model="filterDateTo" type="date"
                        class="px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                        @click="($event.target as HTMLInputElement).showPicker?.()" />
                </div>
                <!-- Clear filters -->
                <button v-if="activeFilterCount > 0"
                    @click="filterUnitTypeId = ''; filterStatus = ''; filterDateFrom = ''; filterDateTo = ''"
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
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingResidents }}</p>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="residents.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <i class="fa-solid fa-user text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noResidents }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.noResidentsDesc }}</p>
            <NuxtLink to="/manager/residents/register"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="fa-solid fa-user-plus text-base"></i>
                {{ t.registerResident }}
            </NuxtLink>
        </div>

        <!-- Residents Card List -->
        <div v-if="!isLoading && residents.length > 0" class="space-y-3">
            <!-- Cards -->
            <div v-for="(resident, index) in residents" :key="resident.id"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500 cursor-pointer"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${index * 40}ms` : '0ms' }"
                @click="goToResident(resident.id)">
                <div class="flex items-center gap-4">
                    <!-- Avatar -->
                    <div
                        class="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-user text-xl text-primary-600 dark:text-primary-400"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ resident.username }}
                            </h3>
                            <span v-if="resident.residencyStatus"
                                class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="statusColors[resident.residencyStatus] || statusColors.inactive">
                                {{ statusLabels[resident.residencyStatus as keyof typeof statusLabels] ||
                                    resident.residencyStatus }}
                            </span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ resident.email }}</p>
                    </div>

                    <!-- Room + Unit Type -->
                    <div class="hidden sm:flex items-center gap-4 text-sm">
                        <!-- Room -->
                        <div class="text-center min-w-[60px]">
                            <span v-if="resident.roomNumber"
                                class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                                <i class="fa-solid fa-key text-xs"></i>
                                {{ resident.roomNumber }}
                            </span>
                            <span v-else class="text-gray-400 text-xs">—</span>
                        </div>
                        <!-- Unit Type -->
                        <div class="text-center min-w-[80px]">
                            <span v-if="resident.unitType" class="text-xs text-gray-600 dark:text-gray-400">{{
                                resident.unitType.name }}</span>
                            <span v-else class="text-gray-400 text-xs">—</span>
                        </div>
                    </div>

                    <!-- Registration Date -->
                    <div class="hidden md:block text-center min-w-[90px]">
                        <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.registrationDate }}</p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">{{ formatDate(resident.registrationDate)
                        }}</p>
                    </div>

                    <!-- Next Bill Date -->
                    <div class="hidden md:block text-center min-w-[90px]">
                        <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.nextBillDate }}</p>
                        <p v-if="resident.nextBillDate" class="text-sm font-medium" :class="new Date(resident.nextBillDate) <= new Date()
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'">
                            {{ formatDate(resident.nextBillDate) }}
                        </p>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1 shrink-0">
                        <NuxtLink :to="`/manager/residents/${resident.id}`" @click.stop
                            class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.view">
                            <i class="fa-solid fa-eye text-base"></i>
                        </NuxtLink>
                        <NuxtLink :to="`/manager/residents/${resident.id}/edit`" @click.stop
                            class="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.edit">
                            <i class="fa-solid fa-pen text-base"></i>
                        </NuxtLink>
                        <button @click.stop="confirmDelete(resident)"
                            class="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            :title="t.delete">
                            <i class="fa-solid fa-trash text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- Mobile: Extra info row -->
                <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
                    <span v-if="resident.roomNumber"
                        class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                        <i class="fa-solid fa-key text-xs"></i>
                        {{ resident.roomNumber }}
                    </span>
                    <span v-if="resident.unitType" class="text-xs text-gray-500 dark:text-gray-400">{{
                        resident.unitType.name }}</span>
                    <span v-if="resident.nextBillDate" class="text-xs font-medium"
                        :class="new Date(resident.nextBillDate) <= new Date() ? 'text-red-500' : 'text-amber-500'">
                        <i class="fa-solid fa-bell text-xs"></i> {{ formatDate(resident.nextBillDate) }}
                    </span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDate(resident.registrationDate) }}</span>
                </div>
            </div>

            <!-- Pagination Footer -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <!-- Left: count + page size -->
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? t.residentsFoundPlural : t.residentsFound }}</span>
                    <div class="flex items-center gap-1.5">
                        <span>{{ t.perPage }}</span>
                        <div class="relative">
                            <select v-model="pageSize"
                                class="pl-2 pr-6 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                            </select>
                            <i
                                class="fa-solid fa-chevron-down absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                </div>
                <!-- Right: page nav -->
                <div class="flex items-center gap-1">
                    <button @click="currentPage = 1" :disabled="currentPage === 1"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="fa-solid fa-angles-left text-xs"></i>
                    </button>
                    <button @click="currentPage--" :disabled="currentPage === 1"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="fa-solid fa-chevron-left text-xs"></i>
                    </button>
                    <span class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                        {{ t.page }} {{ currentPage }} {{ t.of }} {{ totalPages || 1 }}
                    </span>
                    <button @click="currentPage++" :disabled="currentPage >= totalPages"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="fa-solid fa-chevron-right text-xs"></i>
                    </button>
                    <button @click="currentPage = totalPages" :disabled="currentPage >= totalPages"
                        class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                        <i class="fa-solid fa-angles-right text-xs"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
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
                            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.removeResident }}</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.removeResidentCannotUndo }}</p>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ t.removeResidentConfirm }} <strong class="text-gray-900 dark:text-white">{{
                            deleteTarget?.username }}</strong> {{ t.removeResidentConfirm2 }}
                    </p>
                    <div class="flex gap-3 pt-2">
                        <button @click="showDeleteModal = false"
                            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            {{ t.cancel }}
                        </button>
                        <button @click="deleteResident" :disabled="isDeleting"
                            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">
                            {{ isDeleting ? t.removing : t.delete }}
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
