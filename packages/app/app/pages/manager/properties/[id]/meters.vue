<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const { t, lang } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const router = useRouter()
const propertyId = route.params.id as string

// ─── Property ─────────────────────────────────────────────────────────────────
interface Property {
    id: number
    documentId: string
    name: string
    electricPricePerUnit: number | null
    waterPricePerUnit: number | null
    currency: string
}

const property = ref<Property | null>(null)

// ─── Buildings / Floors / Rooms ───────────────────────────────────────────────
interface Room {
    id: number
    documentId: string
    roomNumber: string
    status: string
    electricMeter: number
    waterMeter: number
    resident: { documentId: string; username: string } | null
}

interface Floor {
    id: number
    documentId: string
    floorNumber: number
    floorType: string
    floorLabel: string | null
    rooms: Room[]
}

interface Building {
    id: number
    documentId: string
    name: string
    floors: Floor[]
}

const buildings = ref<Building[]>([])
const isLoading = ref(true)

// ─── Meter form state ─────────────────────────────────────────────────────────
interface MeterEntry {
    roomDocumentId: string
    roomNumber: string
    residentName: string | null
    electricPrev: number
    waterPrev: number
    electricMeterValue: number
    waterMeterValue: number
    electricUsed: number
    waterUsed: number
    dirty: boolean
}

const readingDate = ref(new Date().toISOString().split('T')[0])
const meterEntries = ref<Map<string, MeterEntry>>(new Map())
const isSaving = ref(false)
const saveSuccess = ref(false)
const expandedBuildings = ref<Set<string>>(new Set())
const searchQuery = ref('')

// ─── History modal ────────────────────────────────────────────────────────────
interface MeterReadingHistory {
    id: number
    documentId: string
    readingDate: string
    electricMeterValue: number
    waterMeterValue: number
    electricMeterPrev: number
    waterMeterPrev: number
    electricUnitsUsed: number
    waterUnitsUsed: number
}

const showHistoryModal = ref(false)
const historyRoomNumber = ref('')
const historyRoomDocId = ref('')
const historyData = ref<MeterReadingHistory[]>([])
const isLoadingHistory = ref(false)
const historyChartCanvas = ref<HTMLCanvasElement | null>(null)
const historyChartType = ref<'units' | 'meter'>('units')
let historyChartInstance: Chart | null = null

function renderHistoryChart() {
    if (!historyChartCanvas.value || !historyData.value.length) return
    if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null }

    const isDark = document.documentElement.classList.contains('dark')
    const textColor = isDark ? '#9ca3af' : '#6b7280'
    const gridColor = isDark ? '#374151' : '#e5e7eb'

    // Data is desc — reverse for chronological chart
    const rows = [...historyData.value].reverse()
    const labels = rows.map(r => formatDate(r.readingDate))

    const datasets = historyChartType.value === 'units'
        ? [
            {
                label: `⚡ ${t.value.used}`,
                data: rows.map(r => r.electricUnitsUsed),
                borderColor: 'rgb(234, 179, 8)',
                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 6,
            },
            {
                label: `💧 ${t.value.used}`,
                data: rows.map(r => r.waterUnitsUsed),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 6,
            },
        ]
        : [
            {
                label: `⚡ ${t.value.electricNow}`,
                data: rows.map(r => r.electricMeterValue),
                borderColor: 'rgb(234, 179, 8)',
                backgroundColor: 'rgba(234, 179, 8, 0.08)',
                tension: 0.3, fill: false, pointRadius: 4, pointHoverRadius: 6,
            },
            {
                label: `💧 ${t.value.waterNow}`,
                data: rows.map(r => r.waterMeterValue),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                tension: 0.3, fill: false, pointRadius: 4, pointHoverRadius: 6,
            },
        ]

    historyChartInstance = new Chart(historyChartCanvas.value, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { color: textColor, usePointStyle: true, padding: 12, boxWidth: 8 },
                },
                tooltip: {
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#f9fafb' : '#111827',
                    bodyColor: isDark ? '#d1d5db' : '#374151',
                    borderColor: isDark ? '#374151' : '#e5e7eb',
                    borderWidth: 1, padding: 10,
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, maxRotation: 30, font: { size: 10 } },
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 10 } },
                    beginAtZero: true,
                },
            },
        },
    })
}

watch(historyChartType, () => { nextTick(() => renderHistoryChart()) })

// ─── Computed ─────────────────────────────────────────────────────────────────
const filteredEntries = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    const entries: { building: Building; floor: Floor; room: Room; entry: MeterEntry }[] = []

    for (const building of buildings.value) {
        for (const floor of building.floors) {
            if (floor.floorType !== 'residential' && floor.rooms.length === 0) continue
            for (const room of floor.rooms) {
                const entry = meterEntries.value.get(room.documentId)
                if (!entry) continue
                if (query && !room.roomNumber.toLowerCase().includes(query) && !(room.resident?.username.toLowerCase().includes(query))) continue
                entries.push({ building, floor, room, entry })
            }
        }
    }
    return entries
})

function buildingStats(building: Building) {
    let electricUsed = 0
    let waterUsed = 0
    let dirtyCount = 0
    let roomCount = 0
    for (const floor of building.floors) {
        for (const room of floor.rooms) {
            roomCount++
            const entry = meterEntries.value.get(room.documentId)
            if (!entry) continue
            electricUsed += entry.electricUsed
            waterUsed += entry.waterUsed
            if (entry.dirty) dirtyCount++
        }
    }
    return { electricUsed, waterUsed, dirtyCount, roomCount }
}

function toggleBuilding(docId: string) {
    if (expandedBuildings.value.has(docId)) {
        expandedBuildings.value.delete(docId)
    } else {
        expandedBuildings.value.add(docId)
    }
}

function toggleAllBuildings() {
    if (expandedBuildings.value.size === buildings.value.length) {
        expandedBuildings.value.clear()
    } else {
        for (const b of buildings.value) expandedBuildings.value.add(b.documentId)
    }
}

function filteredFloors(building: Building) {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return building.floors.filter(f => f.rooms.length > 0)
    return building.floors.filter(f => {
        if (f.rooms.length === 0) return false
        return f.rooms.some(r => {
            const entry = meterEntries.value.get(r.documentId)
            if (!entry) return false
            return r.roomNumber.toLowerCase().includes(query) || (r.resident?.username.toLowerCase().includes(query))
        })
    })
}

function filteredRooms(floor: Floor) {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return floor.rooms
    return floor.rooms.filter(r => {
        return r.roomNumber.toLowerCase().includes(query) || (r.resident?.username.toLowerCase().includes(query))
    })
}

const dirtyCount = computed(() => {
    let count = 0
    for (const entry of meterEntries.value.values()) {
        if (entry.dirty) count++
    }
    return count
})

const totalElectricUsed = computed(() => {
    let sum = 0
    for (const { entry } of filteredEntries.value) {
        sum += entry.electricUsed
    }
    return sum
})

const totalWaterUsed = computed(() => {
    let sum = 0
    for (const { entry } of filteredEntries.value) {
        sum += entry.waterUsed
    }
    return sum
})

// ─── Functions ────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

async function fetchData() {
    isLoading.value = true
    try {
        // Fetch property
        const propRes = await fetch(`${STRAPI_URL}/api/properties/${propertyId}?fields[0]=name&fields[1]=electricPricePerUnit&fields[2]=waterPricePerUnit&fields[3]=currency`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (propRes.ok) {
            const propData = await propRes.json()
            property.value = propData.data
        }

        // Fetch buildings with floors and rooms
        const buildRes = await fetch(
            `${STRAPI_URL}/api/buildings?filters[property][documentId][$eq]=${propertyId}&populate[floors][populate][rooms][populate]=resident&sort=createdAt:asc`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        if (!buildRes.ok) throw new Error('Failed to fetch buildings')
        const buildData = await buildRes.json()

        buildings.value = (buildData.data ?? []).map((b: any) => ({
            ...b,
            floors: (b.floors ?? [])
                .sort((a: any, b: any) => a.floorNumber - b.floorNumber)
                .map((f: any) => ({
                    ...f,
                    rooms: (f.rooms ?? [])
                        .sort((a: any, b: any) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
                        .map((r: any) => ({
                            ...r,
                            electricMeter: r.electricMeter ?? 0,
                            waterMeter: r.waterMeter ?? 0,
                            resident: r.resident ? { documentId: r.resident.documentId, username: r.resident.username } : null,
                        })),
                })),
        }))

        // Initialize meter entries from room current values
        buildMeterEntries()

        // Auto-expand all buildings
        for (const b of buildings.value) {
            expandedBuildings.value.add(b.documentId)
        }
    } catch (err) {
        console.error('Error loading meters:', err)
    } finally {
        isLoading.value = false
    }
}

function buildMeterEntries() {
    const map = new Map<string, MeterEntry>()
    for (const building of buildings.value) {
        for (const floor of building.floors) {
            for (const room of floor.rooms) {
                map.set(room.documentId, {
                    roomDocumentId: room.documentId,
                    roomNumber: room.roomNumber,
                    residentName: room.resident?.username ?? null,
                    electricPrev: room.electricMeter || 0,
                    waterPrev: room.waterMeter || 0,
                    electricMeterValue: room.electricMeter || 0,
                    waterMeterValue: room.waterMeter || 0,
                    electricUsed: 0,
                    waterUsed: 0,
                    dirty: false,
                })
            }
        }
    }
    meterEntries.value = map
}

function updateElectric(roomDocId: string, value: number) {
    const entry = meterEntries.value.get(roomDocId)
    if (!entry) return
    entry.electricMeterValue = value
    entry.electricUsed = Math.max(0, value - entry.electricPrev)
    entry.dirty = value !== entry.electricPrev || entry.waterMeterValue !== entry.waterPrev
}

function updateWater(roomDocId: string, value: number) {
    const entry = meterEntries.value.get(roomDocId)
    if (!entry) return
    entry.waterMeterValue = value
    entry.waterUsed = Math.max(0, value - entry.waterPrev)
    entry.dirty = entry.electricMeterValue !== entry.electricPrev || value !== entry.waterPrev
}

async function bulkSave() {
    const dirtyEntries = [...meterEntries.value.values()].filter(e => e.dirty)
    if (!dirtyEntries.length) return

    isSaving.value = true
    saveSuccess.value = false
    try {
        const res = await fetch(`${STRAPI_URL}/api/meter-readings/bulk`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                propertyDocumentId: propertyId,
                readingDate: readingDate.value,
                readings: dirtyEntries.map(e => ({
                    roomDocumentId: e.roomDocumentId,
                    electricMeterValue: e.electricMeterValue,
                    waterMeterValue: e.waterMeterValue,
                })),
            }),
        })
        if (!res.ok) throw new Error('Bulk save failed')

        // Update prev values and clear dirty flags
        for (const entry of dirtyEntries) {
            entry.electricPrev = entry.electricMeterValue
            entry.waterPrev = entry.waterMeterValue
            entry.electricUsed = 0
            entry.waterUsed = 0
            entry.dirty = false
        }

        saveSuccess.value = true
        setTimeout(() => { saveSuccess.value = false }, 3000)
    } catch (err) {
        console.error('Bulk save error:', err)
    } finally {
        isSaving.value = false
    }
}

async function viewHistory(room: Room) {
    historyRoomNumber.value = room.roomNumber
    historyRoomDocId.value = room.documentId
    historyChartType.value = 'units'
    if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null }
    showHistoryModal.value = true
    isLoadingHistory.value = true
    historyData.value = []

    try {
        const params = new URLSearchParams({
            'filters[room][documentId][$eq]': room.documentId,
            'sort[0]': 'readingDate:desc',
            'pagination[pageSize]': '24',
        })
        const res = await fetch(`${STRAPI_URL}/api/meter-readings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch history')
        const data = await res.json()
        historyData.value = (data.data ?? []).map((r: any) => ({
            id: r.id,
            documentId: r.documentId,
            readingDate: r.readingDate,
            electricMeterValue: r.electricMeterValue ?? 0,
            waterMeterValue: r.waterMeterValue ?? 0,
            electricMeterPrev: r.electricMeterPrev ?? 0,
            waterMeterPrev: r.waterMeterPrev ?? 0,
            electricUnitsUsed: r.electricUnitsUsed ?? 0,
            waterUnitsUsed: r.waterUnitsUsed ?? 0,
        }))
    } catch (err) {
        console.error('Error loading history:', err)
    } finally {
        isLoadingHistory.value = false
        if (historyData.value.length) nextTick(() => renderHistoryChart())
    }
}

function closeHistory() {
    showHistoryModal.value = false
    historyData.value = []
    if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null }
}

onMounted(() => {
    fetchData()
})
</script>

<template>
    <div class="max-w-5xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3">
                <button @click="router.back()"
                    class="w-9 h-9 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <i class="fa-solid fa-arrow-left text-gray-600 dark:text-gray-300"></i>
                </button>
                <div>
                    <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{{ t.meterReadings }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ property?.name }}</p>
                </div>
            </div>

            <!-- Bulk Save -->
            <div class="flex items-center gap-3">
                <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200"
                    leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                    <span v-if="saveSuccess"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                        <i class="fa-solid fa-check"></i>
                        {{ t.saved }}
                    </span>
                </Transition>
                <button @click="bulkSave" :disabled="isSaving || dirtyCount === 0"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="dirtyCount > 0 ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-400'">
                    <span v-if="isSaving"
                        class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <i v-else class="fa-solid fa-floppy-disk text-sm"></i>
                    {{ t.bulkSave }}
                    <span v-if="dirtyCount > 0" class="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">{{
                        dirtyCount }}</span>
                </button>
            </div>
        </div>

        <!-- Toolbar -->
        <div
            class="flex items-center gap-3 flex-wrap bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <!-- Reading Date -->
            <div class="flex items-center gap-2">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t.readingDate }}</label>
                <input type="date" v-model="readingDate"
                    class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent [color-scheme:light] dark:[color-scheme:dark]"
                    @click="($event.target as HTMLInputElement).showPicker?.()" />
            </div>

            <!-- Expand/Collapse All -->
            <button v-if="buildings.length > 1" @click="toggleAllBuildings"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <i class="fa-solid text-[10px]"
                    :class="expandedBuildings.size === buildings.length ? 'fa-compress' : 'fa-expand'"></i>
                {{ expandedBuildings.size === buildings.length ? t.collapseAll : t.expandAll }}
            </button>

            <!-- Search -->
            <div class="flex-1 min-w-[180px]">
                <div class="relative">
                    <i
                        class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input type="text" v-model="searchQuery" :placeholder="t.searchRooms"
                        class="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
            </div>

            <!-- Summary badges -->
            <div class="flex items-center gap-2 ml-auto">
                <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg">
                    <i class="fa-solid fa-bolt text-[10px]"></i>
                    {{ totalElectricUsed.toLocaleString() }} {{ t.units }}
                </span>
                <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg">
                    <i class="fa-solid fa-droplet text-[10px]"></i>
                    {{ totalWaterUsed.toLocaleString() }} {{ t.units }}
                </span>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <!-- No buildings -->
        <div v-else-if="!buildings.length"
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div
                class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fa-solid fa-gauge text-gray-400 text-2xl"></i>
            </div>
            <p class="text-gray-500 dark:text-gray-400">{{ t.noBuildings }}</p>
        </div>

        <!-- Meter Table by Building/Floor -->
        <template v-else>
            <div v-for="building in buildings" :key="building.documentId" class="space-y-4">
                <!-- Building card -->
                <div
                    class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- Building header (clickable to expand/collapse) -->
                    <div class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                        @click="toggleBuilding(building.documentId)">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-building text-primary-600 dark:text-primary-400 text-sm"></i>
                            </div>
                            <div>
                                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ building.name }}</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    {{ building.floors.length }} {{ t.floor }}{{ lang !== 'TH' && building.floors.length
                                    !== 1 ? 's' : '' }}
                                    · {{ buildingStats(building).roomCount }} {{ t.rooms }}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <!-- Building-level stats badges -->
                            <div class="hidden sm:flex items-center gap-2">
                                <span v-if="buildingStats(building).electricUsed > 0"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-full">
                                    <i class="fa-solid fa-bolt text-[8px]"></i>
                                    {{ buildingStats(building).electricUsed.toLocaleString() }}
                                </span>
                                <span v-if="buildingStats(building).waterUsed > 0"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full">
                                    <i class="fa-solid fa-droplet text-[8px]"></i>
                                    {{ buildingStats(building).waterUsed.toLocaleString() }}
                                </span>
                                <span v-if="buildingStats(building).dirtyCount > 0"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-full">
                                    {{ buildingStats(building).dirtyCount }} {{ t.changed }}
                                </span>
                            </div>
                            <i class="fa-solid fa-chevron-down text-gray-400 text-xs transition-transform duration-200"
                                :class="{ 'rotate-180': expandedBuildings.has(building.documentId) }"></i>
                        </div>
                    </div>

                    <!-- Expanded floors content -->
                    <Transition name="expand">
                        <div v-if="expandedBuildings.has(building.documentId)"
                            class="border-t border-gray-200 dark:border-gray-700">
                            <div v-for="floor in filteredFloors(building)" :key="floor.documentId">
                                <!-- Floor header -->
                                <div
                                    class="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                    <i class="fa-solid fa-layer-group text-gray-400 text-xs"></i>
                                    <span
                                        class="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                        {{ t.floor }} {{ floor.floorNumber }}
                                    </span>
                                    <span v-if="floor.floorLabel"
                                        class="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                        — {{ floor.floorLabel }}
                                    </span>
                                    <span class="text-[10px] text-gray-400 ml-auto">
                                        {{ floor.rooms.length }} {{ t.rooms }}
                                    </span>
                                </div>

                                <!-- Table -->
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead>
                                            <tr class="border-b border-gray-100 dark:border-gray-700">
                                                <th
                                                    class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                                                    {{ t.room }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    {{ t.resident }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                                                    <i class="fa-solid fa-bolt mr-1 text-[10px]"></i>{{ t.electricPrev
                                                    }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                                                    <i class="fa-solid fa-bolt mr-1 text-[10px]"></i>{{ t.electricNow }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                                                    {{ t.used }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                                    <i class="fa-solid fa-droplet mr-1 text-[10px]"></i>{{ t.waterPrev
                                                    }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                                    <i class="fa-solid fa-droplet mr-1 text-[10px]"></i>{{ t.waterNow }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                                    {{ t.used }}
                                                </th>
                                                <th
                                                    class="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="room in filteredRooms(floor)" :key="room.documentId"
                                                class="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors"
                                                :class="{ 'bg-primary-50/30 dark:bg-primary-900/10': meterEntries.get(room.documentId)?.dirty }">
                                                <!-- Room -->
                                                <td class="px-4 py-2">
                                                    <span class="text-sm font-bold text-gray-800 dark:text-gray-200">{{
                                                        room.roomNumber }}</span>
                                                </td>
                                                <!-- Resident -->
                                                <td class="px-4 py-2">
                                                    <span v-if="room.resident"
                                                        class="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[120px] block">
                                                        <i class="fa-solid fa-user text-[9px] mr-1 text-gray-400"></i>
                                                        {{ room.resident.username }}
                                                    </span>
                                                    <span v-else
                                                        class="text-xs text-gray-300 dark:text-gray-600">—</span>
                                                </td>
                                                <!-- Electric Prev -->
                                                <td class="px-4 py-2 text-center">
                                                    <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                                        {{
                                                            meterEntries.get(room.documentId)?.electricPrev?.toLocaleString()
                                                            ?? 0 }}
                                                    </span>
                                                </td>
                                                <!-- Electric Now -->
                                                <td class="px-2 py-2 text-center">
                                                    <input type="number" min="0" step="1"
                                                        :value="meterEntries.get(room.documentId)?.electricMeterValue ?? 0"
                                                        @input="updateElectric(room.documentId, Number(($event.target as HTMLInputElement).value))"
                                                        class="w-24 px-2 py-1 text-sm text-center font-mono border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent" />
                                                </td>
                                                <!-- Electric Used -->
                                                <td class="px-4 py-2 text-center">
                                                    <span class="text-xs font-semibold font-mono"
                                                        :class="(meterEntries.get(room.documentId)?.electricUsed ?? 0) > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-300 dark:text-gray-600'">
                                                        {{
                                                            meterEntries.get(room.documentId)?.electricUsed?.toLocaleString()
                                                            ?? 0 }}
                                                    </span>
                                                </td>
                                                <!-- Water Prev -->
                                                <td class="px-4 py-2 text-center">
                                                    <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                                        {{
                                                            meterEntries.get(room.documentId)?.waterPrev?.toLocaleString()
                                                            ?? 0 }}
                                                    </span>
                                                </td>
                                                <!-- Water Now -->
                                                <td class="px-2 py-2 text-center">
                                                    <input type="number" min="0" step="1"
                                                        :value="meterEntries.get(room.documentId)?.waterMeterValue ?? 0"
                                                        @input="updateWater(room.documentId, Number(($event.target as HTMLInputElement).value))"
                                                        class="w-24 px-2 py-1 text-sm text-center font-mono border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                                </td>
                                                <!-- Water Used -->
                                                <td class="px-4 py-2 text-center">
                                                    <span class="text-xs font-semibold font-mono"
                                                        :class="(meterEntries.get(room.documentId)?.waterUsed ?? 0) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600'">
                                                        {{
                                                            meterEntries.get(room.documentId)?.waterUsed?.toLocaleString()
                                                            ?? 0 }}
                                                    </span>
                                                </td>
                                                <!-- History -->
                                                <td class="px-4 py-2 text-center">
                                                    <button @click="viewHistory(room)"
                                                        class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                                                        :title="t.viewHistory">
                                                        <i class="fa-solid fa-clock-rotate-left text-xs"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Empty state when search filters out all floors -->
                            <div v-if="filteredFloors(building).length === 0"
                                class="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                                <i class="fa-solid fa-magnifying-glass mr-1"></i>
                                {{ t.noResults }}
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>
        </template>

        <!-- History Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showHistoryModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50" @click="closeHistory"></div>

                    <Transition enter-active-class="transition-all duration-200 delay-75"
                        enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                        leave-active-class="transition-all duration-150" leave-from-class="opacity-100 scale-100"
                        leave-to-class="opacity-0 scale-95">
                        <div v-if="showHistoryModal"
                            class="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
                            <!-- Header -->
                            <div
                                class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                                <div>
                                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ t.meterHistory }}
                                    </h2>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.room }} {{
                                        historyRoomNumber }}</p>
                                </div>
                                <button @click="closeHistory"
                                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    <i class="fa-solid fa-xmark text-lg"></i>
                                </button>
                            </div>

                            <!-- Body -->
                            <div class="flex-1 overflow-y-auto p-6 space-y-5">
                                <div v-if="isLoadingHistory" class="flex items-center justify-center py-12">
                                    <div
                                        class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                                    </div>
                                </div>

                                <div v-else-if="!historyData.length" class="text-center py-12">
                                    <div
                                        class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <i class="fa-solid fa-clock-rotate-left text-gray-400 text-xl"></i>
                                    </div>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noMeterHistory }}</p>
                                </div>

                                <template v-else>
                                    <!-- Chart type switcher -->
                                    <div class="flex items-center justify-between">
                                        <div class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                            <button @click="historyChartType = 'units'"
                                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                                                :class="historyChartType === 'units' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'">
                                                <i class="fa-solid fa-chart-line mr-1 text-[10px]"></i>{{ t.used }}
                                            </button>
                                            <button @click="historyChartType = 'meter'"
                                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                                                :class="historyChartType === 'meter' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'">
                                                <i class="fa-solid fa-gauge mr-1 text-[10px]"></i>{{ t.meterReadings }}
                                            </button>
                                        </div>
                                        <span class="text-xs text-gray-400 dark:text-gray-500">{{ historyData.length }}
                                            records</span>
                                    </div>

                                    <!-- Chart -->
                                    <div class="relative rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3"
                                        style="height: 220px;">
                                        <canvas ref="historyChartCanvas"></canvas>
                                    </div>

                                    <!-- Divider -->
                                    <div class="border-t border-gray-100 dark:border-gray-800"></div>

                                    <!-- Table -->
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="border-b border-gray-200 dark:border-gray-700">
                                                    <th
                                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                        {{ t.date }}</th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase">
                                                        <i class="fa-solid fa-bolt mr-1 text-[10px]"></i>{{
                                                            t.electricPrev
                                                        }}
                                                    </th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase">
                                                        {{ t.meterEnd }}</th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase">
                                                        {{ t.used }}</th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                                                        <i class="fa-solid fa-droplet mr-1 text-[10px]"></i>{{
                                                            t.waterPrev
                                                        }}
                                                    </th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                                                        {{ t.meterEnd }}</th>
                                                    <th
                                                        class="px-3 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                                                        {{ t.used }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="row in historyData" :key="row.id"
                                                    class="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-900/20">
                                                    <td class="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{{
                                                        formatDate(row.readingDate) }}</td>
                                                    <td class="px-3 py-2 text-center text-xs font-mono text-gray-400">{{
                                                        row.electricMeterPrev.toLocaleString() }}</td>
                                                    <td
                                                        class="px-3 py-2 text-center text-xs font-mono text-gray-800 dark:text-gray-200">
                                                        {{ row.electricMeterValue.toLocaleString() }}</td>
                                                    <td
                                                        class="px-3 py-2 text-center text-xs font-mono font-semibold text-yellow-600 dark:text-yellow-400">
                                                        {{ row.electricUnitsUsed.toLocaleString() }}</td>
                                                    <td class="px-3 py-2 text-center text-xs font-mono text-gray-400">{{
                                                        row.waterMeterPrev.toLocaleString() }}</td>
                                                    <td
                                                        class="px-3 py-2 text-center text-xs font-mono text-gray-800 dark:text-gray-200">
                                                        {{ row.waterMeterValue.toLocaleString() }}</td>
                                                    <td
                                                        class="px-3 py-2 text-center text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                                                        {{ row.waterUnitsUsed.toLocaleString() }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
    transition: all 0.3s ease;
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
    opacity: 1;
    max-height: 5000px;
}
</style>