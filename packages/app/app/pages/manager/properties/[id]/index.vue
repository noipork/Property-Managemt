<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const route = useRoute()
const STRAPI_URL = config.public.strapiUrl

const propertyId = route.params.id as string

interface UnitType {
    id: number
    documentId: string
    name: string
    unitType: string
    quantity: number
    area: number | null
    areaUnit: string
    price: number | null
    currency: string
    status: string
    description: string | null
    images: { id: number; url: string }[]
}

interface RoomResident {
    id: number
    documentId: string
    username: string
    email: string
}

type LeaseStatus = 'pending' | 'reviewing' | 'active' | 'expired' | 'terminated' | 'cancelled'

interface Room {
    id: number
    documentId: string
    roomNumber: string
    status: 'active' | 'inactive' | 'maintenance'
    resident: RoomResident | null
    leaseStatus: LeaseStatus | null
}

type FloorType = 'residential' | 'parking' | 'fitness' | 'lobby' | 'commercial' | 'utility' | 'other'

interface Floor {
    id: number
    documentId: string
    floorNumber: number
    floorType: FloorType
    floorLabel: string | null
    rooms: Room[]
}

interface Building {
    id: number
    documentId: string
    name: string
    totalFloors: number
    roomsPerFloor: number
    floors: Floor[]
}

interface StrapiProperty {
    id: number
    documentId: string
    name: string
    description: string | null
    address: string
    city: string
    state: string | null
    zipCode: string | null
    country: string
    propertyType: string
    status: string
    totalUnits: number
    occupiedUnits: number
    monthlyRent: number | null
    currency: string
    area: number | null
    areaUnit: string
    yearBuilt: number | null
    createdAt: string
    updatedAt: string
    image: { id: number; url: string; formats?: any } | null
    images: { id: number; url: string; formats?: any }[]
    unitTypes: UnitType[]
    // Payment & billing config
    bankName: string | null
    bankAccountName: string | null
    bankAccountNumber: string | null
    promptPayId: string | null
    qrCodeImage: { id: number; url: string } | null
    electricPricePerUnit: number | null
    waterPricePerUnit: number | null
    commonAreaFee: number | null
    invoiceDueDays: number | null
}

const property = ref<StrapiProperty | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const showDeleteModal = ref(false)
const isDeleting = ref(false)
const sectionsVisible = ref(false)

// Live lease counts — documentId of unitType → number of active leases
const leaseCountByUnitType = ref<Record<string, number>>({})

// Gallery lightbox
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const lightboxImages = ref<{ id: number; url: string }[]>([])

// Buildings
const buildings = ref<Building[]>([])
const showCreateBuildingModal = ref(false)
const showDeleteBuildingModal = ref(false)
const buildingToDelete = ref<Building | null>(null)
const isGenerating = ref(false)
const isDeletingBuilding = ref(false)
const buildingLimitError = ref('')
const planBuildingLimit = ref<number | undefined>(undefined)
const { canAddBuilding, fetchPlanLimits } = usePlanLimit()
const newBuilding = ref({
    name: '',
    totalFloors: 1,
    roomsPerFloor: 1,
    startFloor: 1,
})
const expandedBuildings = ref<Set<string>>(new Set())

// Inline editing state
const editingFloor = ref<string | null>(null) // floor documentId being edited
const editFloorData = ref({ floorNumber: 0, floorType: 'residential' as FloorType, floorLabel: '' })
const editingRoom = ref<string | null>(null) // room documentId being edited
const editRoomNumber = ref('')
const savingFloor = ref(false)
const savingRoom = ref(false)
const addingFloorTo = ref<string | null>(null) // building documentId
const newFloorData = ref({ floorNumber: 1, floorType: 'residential' as FloorType, floorLabel: '', roomCount: 0 })
const addingRoomTo = ref<string | null>(null) // floor documentId
const newRoomNumber = ref('')
// insertingFloorBetween = `${buildingDocumentId}:${insertAt}` — tracks which gap is open
const insertingFloorBetween = ref<string | null>(null)
const insertFloorData = ref({ floorType: 'residential' as FloorType, floorLabel: '', roomCount: 0 })
const insertingFloor = ref(false)


const floorTypeOptions: { value: FloorType; icon: string }[] = [
    { value: 'residential', icon: 'fa-solid fa-house' },
    { value: 'parking', icon: 'fa-solid fa-car' },
    { value: 'fitness', icon: 'fa-solid fa-dumbbell' },
    { value: 'lobby', icon: 'fa-solid fa-door-open' },
    { value: 'commercial', icon: 'fa-solid fa-store' },
    { value: 'utility', icon: 'fa-solid fa-gear' },
    { value: 'other', icon: 'fa-solid fa-ellipsis' },
]

const floorTypeColors: Record<string, string> = {
    residential: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    parking: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
    fitness: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
    lobby: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
    commercial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    utility: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const floorTypeIcons: Record<string, string> = {
    residential: 'fa-solid fa-house',
    parking: 'fa-solid fa-car',
    fitness: 'fa-solid fa-dumbbell',
    lobby: 'fa-solid fa-door-open',
    commercial: 'fa-solid fa-store',
    utility: 'fa-solid fa-gear',
    other: 'fa-solid fa-ellipsis',
}
function openLightboxSet(images: { id: number; url: string }[], index: number) {
    lightboxImages.value = images
    lightboxIndex.value = index
    lightboxOpen.value = true
}

const allPropertyImages = computed(() => {
    if (!property.value) return []
    const imgs: { id: number; url: string }[] = []
    if (property.value.image) imgs.push(property.value.image)
    if (property.value.images?.length) imgs.push(...property.value.images)
    return imgs
})

const allImages = computed(() => allPropertyImages.value)

function imageUrl(url: string) {
    return url?.startsWith('http') ? url : `${STRAPI_URL}${url}`
}

function openLightbox(index: number) {
    openLightboxSet(allPropertyImages.value, index)
}

function lightboxPrev() {
    lightboxIndex.value = (lightboxIndex.value - 1 + lightboxImages.value.length) % lightboxImages.value.length
}

function lightboxNext() {
    lightboxIndex.value = (lightboxIndex.value + 1) % lightboxImages.value.length
}

function onLightboxKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') lightboxPrev()
    else if (e.key === 'ArrowRight') lightboxNext()
    else if (e.key === 'Escape') lightboxOpen.value = false
}

const typeLabels: Record<string, string> = {
    apartment: 'Apartment',
    condo: 'Condo',
    house: 'House',
    townhouse: 'Townhouse',
    commercial: 'Commercial',
    land: 'Land',
    other: 'Other',
}

const typeIcons: Record<string, string> = {
    apartment: 'fa-solid fa-house',
    condo: 'fa-solid fa-grip',
    house: 'fa-solid fa-house',
    townhouse: 'fa-solid fa-table-columns',
    commercial: 'fa-solid fa-briefcase',
    land: 'fa-solid fa-map',
    other: 'fa-solid fa-tag',
}

const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    maintenance: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    sold: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

// Live occupied count derived from active leases (overrides the stale DB value)
const liveOccupiedUnits = computed(() => {
    const counts = leaseCountByUnitType.value
    if (Object.keys(counts).length === 0) {
        // Fallback to DB value while leases haven't been fetched yet
        return property.value?.occupiedUnits ?? 0
    }
    return Object.values(counts).reduce((sum, n) => sum + n, 0)
})

const occupancyPercent = computed(() => {
    if (!property.value || !property.value.totalUnits) return 0
    return Math.round((liveOccupiedUnits.value / property.value.totalUnits) * 100)
})

const vacantUnits = computed(() => {
    if (!property.value) return 0
    return property.value.totalUnits - liveOccupiedUnits.value
})

async function fetchProperty() {
    try {
        isLoading.value = true
        sectionsVisible.value = false
        const [propRes, leasesRes] = await Promise.all([
            fetch(`${STRAPI_URL}/api/properties/${propertyId}?populate[0]=image&populate[1]=images&populate[2]=unitTypes.images&populate[3]=qrCodeImage`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/leases?populate[0]=unitType&populate[1]=property&filters[property][documentId][$eq]=${propertyId}&pagination[pageSize]=200`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            }),
        ])
        if (!propRes.ok) throw new Error('Failed to fetch property')
        const json = await propRes.json()
        property.value = json.data

        // Build live lease count map
        if (leasesRes.ok) {
            const leasesJson = await leasesRes.json()
            const counts: Record<string, number> = {}
            for (const lease of leasesJson.data ?? []) {
                const utDocId = lease.unitType?.documentId
                if (utDocId) counts[utDocId] = (counts[utDocId] ?? 0) + 1
            }
            leaseCountByUnitType.value = counts
        }
    } catch {
        errorMessage.value = 'Failed to load property'
    } finally {
        isLoading.value = false
        await nextTick()
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            sectionsVisible.value = true
            resolve()
        })))
    }
}

async function handleDelete() {
    if (!property.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/properties/${property.value.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        await navigateTo('/manager/properties')
    } catch {
        errorMessage.value = t.value.propertyDeleteError
    } finally {
        isDeleting.value = false
        showDeleteModal.value = false
    }
}

async function fetchBuildings() {
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/buildings?filters[property][documentId][$eq]=${propertyId}&populate[floors][populate][rooms][populate]=resident&sort=createdAt:asc`,
            { headers: { 'Authorization': `Bearer ${token.value}` } }
        )
        if (!res.ok) return
        const json = await res.json()

        // Collect all resident documentIds from rooms
        const allRooms: any[] = []
        for (const b of json.data ?? []) {
            for (const f of b.floors ?? []) {
                for (const r of f.rooms ?? []) {
                    if (r.resident?.documentId) allRooms.push(r)
                }
            }
        }
        const residentDocIds = [...new Set(allRooms.map((r: any) => r.resident.documentId))]

        // Batch-fetch latest lease for each resident in this property
        const leaseStatusMap = new Map<string, LeaseStatus>()
        if (residentDocIds.length > 0) {
            // Fetch all leases for these residents in this property, sorted newest first
            const leaseParams = new URLSearchParams({
                'filters[property][documentId][$eq]': propertyId,
                'sort[0]': 'createdAt:desc',
                'pagination[pageSize]': '200',
                'fields[0]': 'status',
                'populate[resident][fields][0]': 'documentId',
            })
            residentDocIds.forEach((id, i) => {
                leaseParams.set(`filters[resident][documentId][$in][${i}]`, id)
            })
            const leaseRes = await fetch(`${STRAPI_URL}/api/leases?${leaseParams}`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
            if (leaseRes.ok) {
                const leaseJson = await leaseRes.json()
                // Priority order: active > pending > reviewing > expired > terminated > cancelled
                const priority: Record<string, number> = {
                    active: 6, pending: 5, reviewing: 4, expired: 3, terminated: 2, cancelled: 1,
                }
                for (const lease of leaseJson.data ?? []) {
                    const rDocId = lease.resident?.documentId
                    if (!rDocId) continue
                    const current = leaseStatusMap.get(rDocId)
                    const newPriority = priority[lease.status] ?? 0
                    const curPriority = current ? (priority[current] ?? 0) : -1
                    if (newPriority > curPriority) {
                        leaseStatusMap.set(rDocId, lease.status as LeaseStatus)
                    }
                }
            }
        }

        buildings.value = (json.data ?? []).map((b: any) => ({
            ...b,
            floors: (b.floors ?? [])
                .sort((a: any, b: any) => a.floorNumber - b.floorNumber)
                .map((f: any) => ({
                    ...f,
                    floorType: f.floorType || 'residential',
                    floorLabel: f.floorLabel || null,
                    rooms: (f.rooms ?? [])
                        .sort((a: any, b: any) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
                        .map((r: any) => ({
                            ...r,
                            leaseStatus: r.resident?.documentId
                                ? (leaseStatusMap.get(r.resident.documentId) ?? null)
                                : null,
                        })),
                })),
        }))
        // Auto-expand all buildings
        for (const b of buildings.value) {
            expandedBuildings.value.add(b.documentId)
        }
        // Close any open inline forms since floor/room documentIds may have changed
        addingRoomTo.value = null
        addingFloorTo.value = null
        insertingFloorBetween.value = null
    } catch {
        // silently fail
    }
}

async function handleGenerateBuilding() {
    buildingLimitError.value = ''
    const buildingCheck = await canAddBuilding(buildings.value.length)
    if (!buildingCheck.allowed) {
        buildingLimitError.value = t.value.planLimitBuildingBody
            .replace('{plan}', buildingCheck.planName ?? '')
            .replace('{limit}', String(buildingCheck.limit ?? 0))
        return
    }
    isGenerating.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/buildings/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                propertyDocumentId: propertyId,
                name: newBuilding.value.name,
                totalFloors: newBuilding.value.totalFloors,
                roomsPerFloor: newBuilding.value.roomsPerFloor,
                startFloor: newBuilding.value.startFloor,
            }),
        })
        if (!res.ok) throw new Error('Failed to generate building')
        showCreateBuildingModal.value = false
        newBuilding.value = { name: '', totalFloors: 1, roomsPerFloor: 1, startFloor: 1 }
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to generate building'
    } finally {
        isGenerating.value = false
    }
}

function toggleBuilding(docId: string) {
    if (expandedBuildings.value.has(docId)) {
        expandedBuildings.value.delete(docId)
    } else {
        expandedBuildings.value.add(docId)
    }
}

function confirmDeleteBuilding(building: Building) {
    buildingToDelete.value = building
    showDeleteBuildingModal.value = true
}

async function handleDeleteBuilding() {
    if (!buildingToDelete.value) return
    isDeletingBuilding.value = true
    try {
        // Delete all rooms in all floors first
        for (const floor of buildingToDelete.value.floors) {
            for (const room of floor.rooms) {
                await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token.value}` },
                })
            }
            // Then delete the floor
            await fetch(`${STRAPI_URL}/api/floors/${floor.documentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
        }
        // Finally delete the building
        const res = await fetch(`${STRAPI_URL}/api/buildings/${buildingToDelete.value.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showDeleteBuildingModal.value = false
        buildingToDelete.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to delete building'
    } finally {
        isDeletingBuilding.value = false
    }
}

// ─── Floor inline edit ───
function startEditFloor(floor: Floor) {
    editingFloor.value = floor.documentId
    editFloorData.value = {
        floorNumber: floor.floorNumber,
        floorType: floor.floorType || 'residential',
        floorLabel: floor.floorLabel || '',
    }
}

function cancelEditFloor() {
    editingFloor.value = null
}

async function saveFloor(floor: Floor) {
    savingFloor.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/floors/${floor.documentId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: {
                    floorNumber: editFloorData.value.floorNumber,
                    floorType: editFloorData.value.floorType,
                    floorLabel: editFloorData.value.floorLabel || null,
                },
            }),
        })
        if (!res.ok) throw new Error('Failed to update floor')
        editingFloor.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to update floor'
    } finally {
        savingFloor.value = false
    }
}

async function deleteFloor(floor: Floor) {
    try {
        // Delete all rooms in this floor first
        for (const room of floor.rooms) {
            await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
        }
        const res = await fetch(`${STRAPI_URL}/api/floors/${floor.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to delete floor'
    }
}

// ─── Add floor to building ───
function startAddFloor(building: Building) {
    addingFloorTo.value = building.documentId
    // Suggest next floor number
    const maxFloor = building.floors.reduce((max, f) => Math.max(max, f.floorNumber), 0)
    newFloorData.value = { floorNumber: maxFloor + 1, floorType: 'residential', floorLabel: '', roomCount: building.roomsPerFloor }
}

function cancelAddFloor() {
    addingFloorTo.value = null
}

// ─── Insert floor between existing floors ───
function startInsertFloor(building: Building, insertAt: number) {
    insertingFloorBetween.value = `${building.documentId}:${insertAt}`
    insertFloorData.value = { floorType: 'residential', floorLabel: '', roomCount: building.roomsPerFloor }
}

function cancelInsertFloor() {
    insertingFloorBetween.value = null
}

async function confirmInsertFloor(building: Building, insertAt: number) {
    insertingFloor.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/floors/insert`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                buildingDocumentId: building.documentId,
                insertAt,
                floorType: insertFloorData.value.floorType,
                floorLabel: insertFloorData.value.floorLabel || null,
                roomsPerFloor: insertFloorData.value.floorType === 'residential' ? insertFloorData.value.roomCount : 0,
            }),
        })
        if (!res.ok) throw new Error('Failed to insert floor')
        insertingFloorBetween.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to insert floor'
    } finally {
        insertingFloor.value = false
    }
}

async function confirmAddFloor(building: Building) {
    try {
        const res = await fetch(`${STRAPI_URL}/api/floors/add-to-building`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                buildingDocumentId: building.documentId,
                floorNumber: newFloorData.value.floorNumber,
                floorType: newFloorData.value.floorType,
                floorLabel: newFloorData.value.floorLabel || null,
                roomsPerFloor: newFloorData.value.floorType === 'residential' ? newFloorData.value.roomCount : 0,
            }),
        })
        if (!res.ok) throw new Error('Failed to add floor')
        addingFloorTo.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to add floor'
    }
}

// ─── Room inline edit ───
function startEditRoom(room: Room) {
    editingRoom.value = room.documentId
    editRoomNumber.value = room.roomNumber
}

function cancelEditRoom() {
    editingRoom.value = null
}

async function saveRoom(room: Room) {
    savingRoom.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: {
                    roomNumber: editRoomNumber.value.trim(),
                },
            }),
        })
        if (!res.ok) throw new Error('Failed to update room')
        editingRoom.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to update room'
    } finally {
        savingRoom.value = false
    }
}

async function toggleRoomStatus(room: Room) {
    const statusCycle: Record<string, string> = {
        inactive: 'active',
        active: 'maintenance',
        maintenance: 'inactive',
    }
    const newStatus = statusCycle[room.status] || 'inactive'
    try {
        const res = await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: { status: newStatus } }),
        })
        if (!res.ok) throw new Error('Failed')
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to update room status'
    }
}

async function deleteRoom(room: Room) {
    try {
        const res = await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to delete room'
    }
}

// ─── Add room to floor ───
function startAddRoom(floor: Floor) {
    addingRoomTo.value = floor.documentId
    // Suggest next room number matching the floor pattern (e.g. floor 4 → 401, 402...)
    const floorPrefix = floor.floorNumber * 100
    const existingNums = new Set(floor.rooms.map(r => parseInt(r.roomNumber)).filter(n => !isNaN(n)))
    let next = floorPrefix + 1
    while (existingNums.has(next)) next++
    newRoomNumber.value = String(next)
}

function cancelAddRoom() {
    addingRoomTo.value = null
}

async function confirmAddRoom(floor: Floor) {
    if (!newRoomNumber.value.trim()) return
    try {
        const res = await fetch(`${STRAPI_URL}/api/rooms/add-to-floor`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                floorDocumentId: floor.documentId,
                roomNumber: newRoomNumber.value.trim(),
            }),
        })
        if (!res.ok) throw new Error('Failed to add room')
        addingRoomTo.value = null
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to add room'
    }
}

// Renumber all rooms on a floor to match floor-pattern (e.g. floor 4 -> 401, 402, ...)
const renumberingFloor = ref<string | null>(null)
async function renumberRooms(floor: Floor) {
    renumberingFloor.value = floor.documentId
    try {
        const sorted = [...floor.rooms].sort((a, b) =>
            a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
        )
        let idx = 1
        for (const room of sorted) {
            const newNum = `${floor.floorNumber}${String(idx).padStart(2, '0')}`
            idx++
            if (room.roomNumber === newNum) continue
            await fetch(`${STRAPI_URL}/api/rooms/${room.documentId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token.value}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: { roomNumber: newNum } }),
            })
        }
        await fetchBuildings()
    } catch {
        errorMessage.value = 'Failed to renumber rooms'
    } finally {
        renumberingFloor.value = null
    }
}

// Effective display status for a room: derived from lease status when resident present
function roomDisplayStatus(room: Room): string {
    if (room.status === 'maintenance') return 'maintenance'
    if (!room.resident) return 'vacant'
    return room.leaseStatus ?? 'pending'
}

const roomStatusColors: Record<string, string> = {
    // lease-driven
    active: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700',
    pending: 'bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
    expired: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
    terminated: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
    cancelled: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600',
    // room-level
    vacant: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    maintenance: 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700',
}

const roomStatusDot: Record<string, string> = {
    active: 'bg-emerald-500',
    pending: 'bg-violet-500',
    reviewing: 'bg-blue-500',
    expired: 'bg-orange-500',
    terminated: 'bg-red-500',
    cancelled: 'bg-gray-400',
    vacant: 'bg-gray-300',
    maintenance: 'bg-amber-500',
}

const roomStatusLabel = (status: string): string => {
    const map: Record<string, () => string> = {
        active: () => t.value.activeRoom,
        pending: () => t.value.roomLeasePending,
        reviewing: () => t.value.roomLeaseReviewing,
        expired: () => t.value.roomLeaseExpired,
        terminated: () => t.value.roomLeaseTerminated,
        cancelled: () => t.value.roomLeaseCancelled,
        vacant: () => t.value.inactiveRoom,
        maintenance: () => t.value.maintenanceRoom,
    }
    return map[status]?.() ?? status
}

onMounted(async () => {
    fetchProperty()
    await fetchBuildings()
    const limits = await fetchPlanLimits()
    if (limits) planBuildingLimit.value = limits.maxBuildingsPerProperty
    window.addEventListener('keydown', onLightboxKey)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onLightboxKey)
})
</script>

<template>
    <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between gap-2 mb-6">
            <div class="flex items-center gap-3 min-w-0">
                <button @click="navigateTo('/manager/properties')"
                    class="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <i class="fa-solid fa-arrow-left text-gray-600 dark:text-gray-300"></i>
                </button>
                <div class="min-w-0">
                    <h1 class="text-lg md:text-2xl font-bold text-gray-900 dark:text-white truncate">{{
                        t.propertyDetails }}</h1>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">{{ t.backToProperties }}
                    </p>
                </div>
            </div>
            <div v-if="property" class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <NuxtLink :to="`/manager/properties/${property.documentId}/meters`"
                    class="inline-flex items-center justify-center gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-sm font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
                    :title="t.meterReadings">
                    <i class="fa-solid fa-gauge text-xs"></i>
                    <span class="hidden sm:inline">{{ t.meterReadings }}</span>
                </NuxtLink>
                <NuxtLink :to="`/manager/properties/${property.documentId}/edit`"
                    class="inline-flex items-center justify-center gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                    :title="t.edit">
                    <i class="fa-solid fa-pen text-xs"></i>
                    <span class="hidden sm:inline">{{ t.edit }}</span>
                </NuxtLink>
                <button @click="showDeleteModal = true"
                    class="inline-flex items-center justify-center gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    :title="t.delete">
                    <i class="fa-solid fa-trash text-xs"></i>
                    <span class="hidden sm:inline">{{ t.delete }}</span>
                </button>
            </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage"
            class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <i class="fa-solid fa-circle-exclamation text-red-500 text-sm"></i>
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="space-y-4">
            <div
                class="h-48 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
            </div>
            <div
                class="h-36 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
            </div>
        </div>

        <template v-else-if="property">
            <!-- Property Overview Card -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 overflow-hidden transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'">

                <!-- Cover Image Hero -->
                <div v-if="property.image" class="relative w-full h-56 md:h-72 cursor-pointer group"
                    @click="openLightbox(0)">
                    <img :src="imageUrl(property.image.url)" :alt="property.name" class="w-full h-full object-cover" />
                    <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div
                            class="opacity-0 group-hover:opacity-100 transition-opacity w-10 h-10 bg-white/90 dark:bg-gray-900/90 rounded-full flex items-center justify-center shadow-lg">
                            <i class="fa-solid fa-magnifying-glass-plus text-gray-800 dark:text-gray-200"></i>
                        </div>
                    </div>
                    <!-- Image count badge -->
                    <div v-if="allImages.length > 1"
                        class="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <i class="fa-solid fa-image text-[10px]"></i>
                        {{ allImages.length }}
                    </div>
                </div>

                <!-- Thumbnail strip -->
                <div v-if="property.image && property.images?.length"
                    class="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto scrollbar-hide">
                    <button
                        class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all border-primary-400"
                        @click="openLightbox(0)">
                        <img :src="imageUrl(property.image.url)" :alt="property.name"
                            class="w-full h-full object-cover" />
                    </button>
                    <button v-for="(img, i) in property.images" :key="img.id"
                        class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all border-transparent hover:border-gray-300 dark:hover:border-gray-500"
                        @click="openLightbox(i + 1)">
                        <img :src="imageUrl(img.url)" :alt="property.name" class="w-full h-full object-cover" />
                    </button>
                </div>

                <div class="p-6" :class="property.image ? 'pt-4' : ''">
                    <div class="flex items-start gap-4 mb-6">
                        <div v-if="!property.image"
                            class="w-14 h-14 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                            <i :class="typeIcons[property.propertyType] || 'fa-solid fa-house'"
                                class="text-primary-600 dark:text-primary-400 text-2xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ property.name }}</h2>
                                <span class="text-[10px] font-semibold px-2 py-1 rounded-full uppercase"
                                    :class="statusColors[property.status]">
                                    {{ property.status }}
                                </span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <i class="fa-solid fa-location-dot text-xs"></i>
                                {{ property.address }}, {{ property.city }}
                                <template v-if="property.state">, {{ property.state }}</template>
                                <template v-if="property.zipCode"> {{ property.zipCode }}</template>
                            </p>
                            <p v-if="property.description" class="text-sm text-gray-600 dark:text-gray-400 mt-2">{{
                                property.description }}</p>
                        </div>
                    </div>

                    <!-- Stat Cards Row -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                            <p class="text-xs text-blue-600 dark:text-blue-400 mb-1">{{ t.totalUnitsLabel }}</p>
                            <p class="text-xl font-bold text-blue-700 dark:text-blue-300">{{ property.totalUnits }}</p>
                        </div>
                        <div class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                            <p class="text-xs text-emerald-600 dark:text-emerald-400 mb-1">{{ t.occupied }}</p>
                            <p class="text-xl font-bold text-emerald-700 dark:text-emerald-300">{{ liveOccupiedUnits }}
                            </p>
                        </div>
                        <div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                            <p class="text-xs text-amber-600 dark:text-amber-400 mb-1">{{ t.vacant }}</p>
                            <p class="text-xl font-bold text-amber-700 dark:text-amber-300">{{ vacantUnits }}</p>
                        </div>
                        <div class="p-4 rounded-xl text-center"
                            :class="occupancyPercent >= 80 ? 'bg-emerald-50 dark:bg-emerald-900/20' : occupancyPercent >= 50 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'">
                            <p class="text-xs mb-1"
                                :class="occupancyPercent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : occupancyPercent >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'">
                                {{ t.occupancy }}</p>
                            <p class="text-xl font-bold"
                                :class="occupancyPercent >= 80 ? 'text-emerald-700 dark:text-emerald-300' : occupancyPercent >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'">
                                {{ occupancyPercent }}%</p>
                        </div>
                    </div>

                    <!-- Occupancy Bar -->
                    <div class="mt-4">
                        <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-700"
                                :class="occupancyPercent >= 80 ? 'bg-emerald-500' : occupancyPercent >= 50 ? 'bg-amber-500' : 'bg-red-500'"
                                :style="{ width: occupancyPercent + '%' }">
                            </div>
                        </div>
                    </div>
                </div><!-- end p-6 -->
            </div><!-- end overview card -->

            <!-- Details Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Property Info -->
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                    :style="{ transitionDelay: sectionsVisible ? '100ms' : '0ms' }">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-circle-info text-primary-500"></i>
                        {{ t.propertyInfo }}
                    </h3>
                    <dl class="space-y-3">
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.propertyType }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white capitalize">{{
                                typeLabels[property.propertyType] || property.propertyType }}</dd>
                        </div>
                        <div v-if="property.area" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.areaLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{
                                Number(property.area).toLocaleString('en-US')
                            }} {{ property.areaUnit }}</dd>
                        </div>
                        <div v-if="property.yearBuilt" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.yearBuiltLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.yearBuilt }}</dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.propertyCountry }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.country }}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Financial Info -->
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                    :style="{ transitionDelay: sectionsVisible ? '200ms' : '0ms' }">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-wallet text-primary-500"></i>
                        {{ t.financialInfo }}
                    </h3>
                    <dl class="space-y-3">
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.monthlyRentLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">
                                {{ property.monthlyRent ? Number(property.monthlyRent).toLocaleString('en-US') : '—' }}
                                {{
                                    property.currency }}
                            </dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.totalUnitsLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.totalUnits }}</dd>
                        </div>
                        <div v-if="property.monthlyRent" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">Est. Monthly Revenue</dt>
                            <dd class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {{ (Number(property.monthlyRent) * liveOccupiedUnits).toLocaleString('en-US') }} {{
                                    property.currency
                                }}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <!-- Billing Config Card -->
            <div v-if="property.electricPricePerUnit || property.waterPricePerUnit || property.commonAreaFee || property.bankName || property.promptPayId || property.qrCodeImage"
                class="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '250ms' : '0ms' }">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-sliders text-primary-500"></i>
                    {{ t.billingConfig }}
                </h3>

                <!-- QR Code (mobile: full-width centered; md: side-by-side) -->
                <div class="flex flex-col md:flex-row md:gap-6">
                    <!-- Rates / bank details -->
                    <dl class="flex-1 space-y-3">
                        <div v-if="property.electricPricePerUnit" class="flex items-center justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 shrink-0">
                                <i class="fa-solid fa-bolt text-amber-400 text-xs"></i>
                                {{ t.electricPricePerUnit }}
                            </dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">
                                {{ Number(property.electricPricePerUnit).toLocaleString('en-US') }} {{ property.currency
                                }}/{{
                                    t.unit }}
                            </dd>
                        </div>
                        <div v-if="property.waterPricePerUnit" class="flex items-center justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 shrink-0">
                                <i class="fa-solid fa-droplet text-blue-400 text-xs"></i>
                                {{ t.waterPricePerUnit }}
                            </dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">
                                {{ Number(property.waterPricePerUnit).toLocaleString('en-US') }} {{ property.currency
                                }}/{{ t.unit
                                }}
                            </dd>
                        </div>
                        <div v-if="property.commonAreaFee" class="flex items-center justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 shrink-0">
                                <i class="fa-solid fa-building-columns text-gray-400 text-xs"></i>
                                {{ t.commonAreaFee }}
                            </dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">
                                {{ Number(property.commonAreaFee).toLocaleString('en-US') }} {{ property.currency }}/{{
                                    t.month }}
                            </dd>
                        </div>
                        <div v-if="property.invoiceDueDays" class="flex items-center justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 shrink-0">
                                <i class="fa-solid fa-calendar-days text-gray-400 text-xs"></i>
                                {{ t.invoiceDueDays }}
                            </dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">
                                {{ property.invoiceDueDays }} {{ t.days }}
                            </dd>
                        </div>
                        <div v-if="property.bankName"
                            class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 shrink-0">{{ t.bankName }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">{{
                                property.bankName }}</dd>
                        </div>
                        <div v-if="property.bankAccountName" class="flex items-center justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 shrink-0">{{ t.bankAccountName }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white text-right">{{
                                property.bankAccountName }}
                            </dd>
                        </div>
                        <div v-if="property.bankAccountNumber" class="flex items-start justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 shrink-0">{{ t.bankAccountNumber }}</dt>
                            <dd
                                class="text-sm font-medium text-gray-900 dark:text-white font-mono text-right break-all">
                                {{
                                    property.bankAccountNumber }}</dd>
                        </div>
                        <div v-if="property.promptPayId" class="flex items-start justify-between gap-2">
                            <dt class="text-sm text-gray-500 dark:text-gray-400 shrink-0">{{ t.promptPayId }}</dt>
                            <dd
                                class="text-sm font-medium text-gray-900 dark:text-white font-mono text-right break-all">
                                {{
                                    property.promptPayId }}</dd>
                        </div>
                    </dl>

                    <!-- QR Code -->
                    <div v-if="property.qrCodeImage" class="flex flex-col items-center gap-2 mt-4 md:mt-0 md:shrink-0">
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.qrCodeImage }}</p>
                        <button
                            class="group w-36 h-36 md:w-32 md:h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white flex items-center justify-center relative hover:border-primary-400 transition-colors"
                            @click="openLightboxSet([property.qrCodeImage!], 0)">
                            <img :src="imageUrl(property.qrCodeImage.url)" class="w-full h-full object-contain p-2"
                                :alt="t.qrCodeImage" />
                            <div
                                class="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                                <div
                                    class="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 bg-white/90 dark:bg-gray-900/90 rounded-full flex items-center justify-center shadow">
                                    <i
                                        class="fa-solid fa-magnifying-glass-plus text-gray-700 dark:text-gray-200 text-xs"></i>
                                </div>
                            </div>
                        </button>
                        <p class="text-[10px] text-gray-400 dark:text-gray-500">Tap to view</p>
                    </div>
                </div>
            </div>

            <!-- Unit Types Section -->
            <div v-if="property.unitTypes?.length"
                class="mt-4 mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '300ms' : '0ms' }">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-grip text-primary-500"></i>
                    {{ t.unitTypes }}
                    <span class="ml-auto text-xs font-normal text-gray-400 dark:text-gray-500">
                        {{ liveOccupiedUnits }} / {{ property.totalUnits }} {{ t.occupied?.toLowerCase() }}
                    </span>
                </h3>
                <div class="space-y-3">
                    <div v-for="ut in property.unitTypes" :key="ut.id"
                        class="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                        <!-- Unit type header -->
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/40">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ ut.name
                                        }}</span>
                                    <span
                                        class="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 capitalize">
                                        {{ ut.unitType?.replace(/^br(\d)$/, '$1BR') ?? ut.unitType }}
                                    </span>
                                    <!-- Live status badge driven by active lease count -->
                                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="{
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400': (leaseCountByUnitType[ut.documentId] ?? 0) === 0 && ut.status !== 'maintenance' && ut.status !== 'unavailable',
                                        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400': (leaseCountByUnitType[ut.documentId] ?? 0) > 0,
                                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': ut.status === 'maintenance',
                                        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400': ut.status === 'unavailable',
                                    }">
                                        {{ (leaseCountByUnitType[ut.documentId] ?? 0) > 0
                                            ? (t.unitStatusOccupied ?? 'Occupied')
                                            : ut.status === 'maintenance'
                                                ? (t.unitStatusMaintenance ?? 'Maintenance')
                                                : ut.status === 'unavailable'
                                                    ? (t.unitStatusUnavailable ?? 'Unavailable')
                                                    : (t.unitStatusAvailable ?? 'Available') }}
                                    </span>
                                    <!-- Resident / lease count chip -->
                                    <span v-if="(leaseCountByUnitType[ut.documentId] ?? 0) > 0"
                                        class="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 flex items-center gap-1">
                                        <i class="fa-solid fa-user-check text-[9px]"></i>
                                        {{ leaseCountByUnitType[ut.documentId] }} / {{ ut.quantity }}
                                    </span>
                                </div>
                                <div
                                    class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                                    <span class="flex items-center gap-1">
                                        <i class="fa-solid fa-house"></i>
                                        {{ ut.quantity }} {{ ut.quantity === 1 ? 'unit' : 'units' }}
                                    </span>
                                    <span v-if="ut.area" class="flex items-center gap-1">
                                        <i class="fa-solid fa-ruler"></i>
                                        {{ Number(ut.area).toLocaleString('en-US') }} {{ ut.areaUnit }}
                                    </span>
                                    <span v-if="ut.price"
                                        class="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
                                        <i class="fa-solid fa-tag"></i>
                                        {{ Number(ut.price).toLocaleString('en-US') }} {{ ut.currency }} / mo
                                    </span>
                                </div>
                                <!-- Mini occupancy bar per unit type -->
                                <div v-if="ut.quantity > 0" class="mt-2">
                                    <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500" :class="(leaseCountByUnitType[ut.documentId] ?? 0) === 0
                                            ? 'bg-gray-300 dark:bg-gray-600'
                                            : (leaseCountByUnitType[ut.documentId] ?? 0) >= ut.quantity
                                                ? 'bg-blue-500'
                                                : 'bg-violet-400'"
                                            :style="{ width: Math.min(((leaseCountByUnitType[ut.documentId] ?? 0) / ut.quantity) * 100, 100) + '%' }">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Description + images -->
                        <div v-if="ut.description || ut.images?.length" class="p-3 space-y-2">
                            <p v-if="ut.description" class="text-xs text-gray-500 dark:text-gray-400">{{ ut.description
                                }}</p>
                            <div v-if="ut.images?.length" class="flex gap-2 flex-wrap">
                                <div v-for="(img, imgIdx) in ut.images" :key="img.id"
                                    class="relative w-24 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer group"
                                    @click="openLightboxSet(ut.images.map(i => ({ id: i.id, url: i.url?.startsWith('http') ? i.url : `${STRAPI_URL}${i.url}` })), imgIdx)">
                                    <img :src="img.url?.startsWith('http') ? img.url : `${STRAPI_URL}${img.url}`"
                                        class="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    <div
                                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                        <i
                                            class="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Buildings Section -->
            <div class="mt-4 mb-8 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '400ms' : '0ms' }">

                <!-- Section Header -->
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-building text-primary-500"></i>
                        {{ t.buildings }}
                        <span class="text-xs font-normal" :class="planBuildingLimit && planBuildingLimit < 999 && buildings.length >= planBuildingLimit
                            ? 'text-red-500 font-medium'
                            : 'text-gray-400 dark:text-gray-500'">
                            ({{ buildings.length }}<template v-if="planBuildingLimit && planBuildingLimit < 999"> / {{
                                planBuildingLimit }}</template>)
                        </span>
                    </h3>
                    <div class="flex flex-col items-end gap-1">
                        <div class="flex items-center gap-1.5 sm:gap-2">
                            <NuxtLink :to="`/manager/properties/${propertyId}/meters`"
                                class="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
                                :title="t.meterReadings">
                                <i class="fa-solid fa-gauge text-[10px]"></i>
                                <span class="hidden sm:inline">{{ t.meterReadings }}</span>
                            </NuxtLink>
                            <button @click="showCreateBuildingModal = true"
                                :disabled="!!(planBuildingLimit && planBuildingLimit < 999 && buildings.length >= planBuildingLimit)"
                                class="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-xs font-medium border rounded-lg transition-colors"
                                :class="planBuildingLimit && planBuildingLimit < 999 && buildings.length >= planBuildingLimit
                                    ? 'text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                    : 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/40'">
                                <i v-if="planBuildingLimit && planBuildingLimit < 999 && buildings.length >= planBuildingLimit"
                                    class="fa-solid fa-crown text-amber-500 text-[10px]"></i>
                                <i v-else class="fa-solid fa-plus text-[10px]"></i>
                                <span class="hidden sm:inline">{{ t.createBuilding }}</span>
                            </button>
                        </div>
                        <span
                            v-if="planBuildingLimit && planBuildingLimit < 999 && buildings.length >= planBuildingLimit"
                            class="text-[10px] text-amber-500 flex items-center gap-1">
                            {{ t.planLimitBuildingReached
                                ?.replace('{current}', String(buildings.length))
                                .replace('{limit}', String(planBuildingLimit)) }}
                        </span>
                    </div>
                </div>

                <!-- No buildings -->
                <div v-if="!buildings.length"
                    class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <div
                        class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                        <i class="fa-solid fa-building text-gray-400 dark:text-gray-500 text-xl"></i>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noBuildings }}</p>
                </div>

                <!-- Building limit error -->
                <p v-if="buildingLimitError" class="mt-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                    <i class="fa-solid fa-crown text-amber-500 flex-shrink-0 mt-0.5"></i>
                    {{ buildingLimitError }}
                </p>

                <!-- Building cards -->
                <div v-else class="space-y-4">
                    <div v-for="building in buildings" :key="building.documentId"
                        class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

                        <!-- Building header -->
                        <div class="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                            @click="toggleBuilding(building.documentId)">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                                    <i class="fa-solid fa-building text-primary-600 dark:text-primary-400 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ building.name }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {{ building.floors.length }} {{ t.floor }}{{ building.floors.length !== 1 ? 's'
                                            : '' }}
                                        · {{building.floors.reduce((sum, f) => sum + f.rooms.length, 0)}} {{ t.rooms
                                        }}
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button @click.stop="confirmDeleteBuilding(building)"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                    <i class="fa-solid fa-trash text-xs"></i>
                                </button>
                                <i class="fa-solid fa-chevron-down text-gray-400 text-xs transition-transform duration-200"
                                    :class="{ 'rotate-180': expandedBuildings.has(building.documentId) }"></i>
                            </div>
                        </div>

                        <!-- Floors & Rooms (expandable) -->
                        <Transition name="expand">
                            <div v-if="expandedBuildings.has(building.documentId)"
                                class="border-t border-gray-100 dark:border-gray-700">
                                <template v-for="(floor, floorIdx) in building.floors" :key="floor.documentId">
                                    <!-- Insert-between strip (appears ABOVE each floor except the first) -->
                                    <div v-if="floorIdx > 0" class="group/insert relative flex items-center px-4 h-5">
                                        <!-- Idle: thin dashed divider with hover reveal -->
                                        <template
                                            v-if="insertingFloorBetween !== `${building.documentId}:${floor.floorNumber}`">
                                            <div
                                                class="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-transparent group-hover/insert:border-primary-300 dark:group-hover/insert:border-primary-700 transition-colors pointer-events-none">
                                            </div>
                                            <button
                                                class="relative z-10 mx-auto opacity-0 group-hover/insert:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium text-primary-500 dark:text-primary-400 bg-white dark:bg-gray-800 border border-primary-300 dark:border-primary-700 rounded-full hover:bg-primary-50 dark:hover:bg-primary-900/20 shadow-sm"
                                                @click.stop="startInsertFloor(building, floor.floorNumber)">
                                                <i class="fa-solid fa-plus text-[7px]"></i>
                                                {{ t.insertFloor }}
                                            </button>
                                        </template>
                                        <!-- Active: inline insert form -->
                                        <div v-else class="w-full py-1">
                                            <div
                                                class="flex flex-wrap items-end gap-2 p-3 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-primary-200 dark:border-primary-800">
                                                <span
                                                    class="text-[10px] font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1 mr-1">
                                                    <i class="fa-solid fa-arrow-down text-[8px]"></i>
                                                    {{ t.insertFloor }} {{ t.floor }} {{ floor.floorNumber }}
                                                </span>
                                                <div class="w-32">
                                                    <label
                                                        class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                            t.floorTypeLabel }}</label>
                                                    <select v-model="insertFloorData.floorType"
                                                        class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
                                                        <option v-for="opt in floorTypeOptions" :key="opt.value"
                                                            :value="opt.value">
                                                            {{ t[`floorType_${opt.value}`] || opt.value }}
                                                        </option>
                                                    </select>
                                                </div>
                                                <div class="flex-1 min-w-[100px]">
                                                    <label
                                                        class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                            t.floorLabelField }}</label>
                                                    <input v-model="insertFloorData.floorLabel" type="text"
                                                        :placeholder="t.floorLabelPlaceholder"
                                                        class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                                </div>
                                                <div v-if="insertFloorData.floorType === 'residential'" class="w-20">
                                                    <label
                                                        class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                            t.rooms }}</label>
                                                    <input v-model.number="insertFloorData.roomCount" type="number"
                                                        min="0" max="100"
                                                        class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                                </div>
                                                <div class="flex gap-1">
                                                    <button @click="confirmInsertFloor(building, floor.floorNumber)"
                                                        :disabled="insertingFloor"
                                                        class="px-2 py-1 text-[10px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1">
                                                        <i v-if="insertingFloor"
                                                            class="fa-solid fa-rotate text-[8px] animate-spin"></i>
                                                        <i v-else class="fa-solid fa-check text-[8px]"></i>
                                                        {{ t.add }}
                                                    </button>
                                                    <button @click="cancelInsertFloor()"
                                                        class="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                                        {{ t.cancel }}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="p-4"
                                        :class="{ 'border-t border-gray-100 dark:border-gray-700': floorIdx > 0 && insertingFloorBetween !== `${building.documentId}:${floor.floorNumber}` }">

                                        <!-- Floor header: view mode -->
                                        <div v-if="editingFloor !== floor.documentId"
                                            class="flex items-center justify-between mb-3 group/floor">
                                            <div class="flex items-center gap-2">
                                                <i class="fa-solid fa-layer-group text-gray-400 text-xs"></i>
                                                <span
                                                    class="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                                    {{ t.floor }} {{ floor.floorNumber }}
                                                </span>
                                                <!-- Floor type badge -->
                                                <span v-if="floor.floorType && floor.floorType !== 'residential'"
                                                    class="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                                                    :class="floorTypeColors[floor.floorType]">
                                                    <i :class="floorTypeIcons[floor.floorType]" class="text-[8px]"></i>
                                                    {{ t[`floorType_${floor.floorType}`] || floor.floorType }}
                                                </span>
                                                <!-- Floor label -->
                                                <span v-if="floor.floorLabel"
                                                    class="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                                    — {{ floor.floorLabel }}
                                                </span>
                                                <span class="text-[10px] text-gray-400 dark:text-gray-500">
                                                    ({{ floor.rooms.length }} {{ t.rooms }})
                                                </span>
                                            </div>
                                            <div
                                                class="flex items-center gap-1 opacity-0 group-hover/floor:opacity-100 transition-opacity">
                                                <!-- Renumber rooms button: only for residential floors with rooms -->
                                                <button v-if="floor.rooms.length > 0" @click="renumberRooms(floor)"
                                                    :disabled="renumberingFloor === floor.documentId"
                                                    class="h-6 px-1.5 flex items-center gap-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                                                    :title="t.renumberRooms">
                                                    <i v-if="renumberingFloor === floor.documentId"
                                                        class="fa-solid fa-rotate text-[9px] animate-spin"></i>
                                                    <i v-else class="fa-solid fa-arrow-down-1-9 text-[9px]"></i>
                                                </button>
                                                <button @click="startEditFloor(floor)"
                                                    class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                                                    :title="t.editFloor">
                                                    <i class="fa-solid fa-pen text-[9px]"></i>
                                                </button>
                                                <button @click="deleteFloor(floor)"
                                                    class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    :title="t.deleteFloorLabel">
                                                    <i class="fa-solid fa-trash text-[9px]"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Floor header: edit mode -->
                                        <div v-else
                                            class="flex flex-wrap items-end gap-2 mb-3 p-3 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-primary-200 dark:border-primary-800">
                                            <div class="w-20">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floor }} #</label>
                                                <input v-model.number="editFloorData.floorNumber" type="number" min="0"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                            </div>
                                            <div class="w-32">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floorTypeLabel }}</label>
                                                <select v-model="editFloorData.floorType"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
                                                    <option v-for="opt in floorTypeOptions" :key="opt.value"
                                                        :value="opt.value">
                                                        {{ t[`floorType_${opt.value}`] || opt.value }}
                                                    </option>
                                                </select>
                                            </div>
                                            <div class="flex-1 min-w-[120px]">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floorLabelField }}</label>
                                                <input v-model="editFloorData.floorLabel" type="text"
                                                    :placeholder="t.floorLabelPlaceholder"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                            </div>
                                            <div class="flex gap-1">
                                                <button @click="saveFloor(floor)" :disabled="savingFloor"
                                                    class="px-2 py-1 text-[10px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">
                                                    <i class="fa-solid fa-check text-[8px]"></i>
                                                </button>
                                                <button @click="cancelEditFloor()"
                                                    class="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                                    <i class="fa-solid fa-xmark text-[8px]"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Rooms grid (only for residential or floors with rooms) -->
                                        <div v-if="floor.rooms.length || floor.floorType === 'residential' || !floor.floorType"
                                            class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                            <div v-for="room in floor.rooms" :key="room.documentId"
                                                class="relative p-2.5 rounded-lg border transition-all hover:shadow-sm group/room"
                                                :class="[roomStatusColors[roomDisplayStatus(room)], editingRoom !== room.documentId && (roomDisplayStatus(room) === 'vacant' || room.resident) ? 'cursor-pointer' : '', roomDisplayStatus(room) === 'vacant' && editingRoom !== room.documentId ? 'hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10' : '', room.resident && editingRoom !== room.documentId ? 'hover:opacity-90 hover:shadow-md' : '']"
                                                @click="editingRoom !== room.documentId ? (room.resident ? $router.push(`/manager/residents/${room.resident.documentId}/edit`) : roomDisplayStatus(room) === 'vacant' ? $router.push(`/manager/residents/register?propertyId=${property?.id}&roomNumber=${room.roomNumber}&buildingId=${building.id}&floorId=${floor.id}`) : null) : null">

                                                <!-- Room view mode -->
                                                <template v-if="editingRoom !== room.documentId">
                                                    <div class="flex items-center gap-1.5 mb-1">
                                                        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                            :class="roomStatusDot[roomDisplayStatus(room)]"></span>
                                                        <span
                                                            class="text-xs font-bold text-gray-800 dark:text-gray-200">
                                                            {{ room.roomNumber }}
                                                        </span>
                                                        <!-- Hover actions -->
                                                        <div
                                                            class="ml-auto flex items-center gap-0.5 opacity-0 group-hover/room:opacity-100 transition-opacity">
                                                            <!-- Register resident (vacant rooms only) -->
                                                            <NuxtLink v-if="roomDisplayStatus(room) === 'vacant'"
                                                                :to="`/manager/residents/register?propertyId=${property?.id}&roomNumber=${room.roomNumber}&buildingId=${building.id}&floorId=${floor.id}`"
                                                                class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-emerald-500"
                                                                :title="t.registerResident">
                                                                <i class="fa-solid fa-user-plus text-[7px]"></i>
                                                            </NuxtLink>
                                                            <!-- Edit resident (occupied rooms) -->
                                                            <NuxtLink v-if="room.resident"
                                                                :to="`/manager/residents/${room.resident.documentId}/edit`"
                                                                @click.stop
                                                                class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-primary-500"
                                                                :title="t.editResident">
                                                                <i class="fa-solid fa-pen-to-square text-[7px]"></i>

                                                            </NuxtLink>
                                                            <button @click.stop="startEditRoom(room)"
                                                                class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-primary-500"
                                                                :title="t.editRoom">
                                                                <i class="fa-solid fa-pen text-[7px]"></i>
                                                            </button>
                                                            <button v-if="!room.resident" @click.stop="deleteRoom(room)"
                                                                class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500"
                                                                :title="t.delete">
                                                                <i class="fa-solid fa-trash text-[7px]"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p v-if="room.resident" class="text-[10px] truncate" :class="{
                                                        'text-emerald-700 dark:text-emerald-400': roomDisplayStatus(room) === 'active',
                                                        'text-violet-700 dark:text-violet-400': roomDisplayStatus(room) === 'pending',
                                                        'text-blue-700 dark:text-blue-400': roomDisplayStatus(room) === 'reviewing',
                                                        'text-orange-600 dark:text-orange-400': roomDisplayStatus(room) === 'expired',
                                                        'text-red-600 dark:text-red-400': roomDisplayStatus(room) === 'terminated',
                                                        'text-gray-500 dark:text-gray-400': roomDisplayStatus(room) === 'cancelled',
                                                    }" :title="room.resident.username">
                                                        <i class="fa-solid fa-user text-[8px] mr-0.5"></i>
                                                        {{ room.resident.username }}
                                                    </p>
                                                    <!-- Vacant: show "click to register" hint on hover -->
                                                    <template v-if="roomDisplayStatus(room) === 'vacant'">
                                                        <p
                                                            class="text-[10px] mt-0.5 truncate text-gray-400 dark:text-gray-500 group-hover/room:hidden">
                                                            {{ roomStatusLabel(roomDisplayStatus(room)) }}
                                                        </p>
                                                        <p
                                                            class="text-[10px] mt-0.5 truncate text-emerald-600 dark:text-emerald-400 hidden group-hover/room:block font-medium">
                                                            <i class="fa-solid fa-user-plus text-[8px] mr-0.5"></i>
                                                            {{ t.registerResident }}
                                                        </p>
                                                    </template>
                                                    <!-- Occupied/maintenance: show status normally, swap to "click to edit" hint on hover (if has resident) -->
                                                    <template v-else-if="room.resident">
                                                        <p class="text-[10px] mt-0.5 truncate group-hover/room:hidden"
                                                            :class="{
                                                                'text-emerald-600 dark:text-emerald-500': roomDisplayStatus(room) === 'active',
                                                                'text-violet-600 dark:text-violet-500': roomDisplayStatus(room) === 'pending',
                                                                'text-blue-600 dark:text-blue-500': roomDisplayStatus(room) === 'reviewing',
                                                                'text-orange-500 dark:text-orange-400': roomDisplayStatus(room) === 'expired',
                                                                'text-red-500 dark:text-red-400': roomDisplayStatus(room) === 'terminated',
                                                                'text-gray-400 dark:text-gray-500': roomDisplayStatus(room) === 'cancelled',
                                                            }">
                                                            {{ roomStatusLabel(roomDisplayStatus(room)) }}
                                                        </p>
                                                        <p
                                                            class="text-[10px] mt-0.5 truncate text-primary-600 dark:text-primary-400 hidden group-hover/room:block font-medium">
                                                            <i class="fa-solid fa-pen-to-square text-[8px] mr-0.5"></i>
                                                            {{ t.editResident }}
                                                        </p>
                                                    </template>
                                                    <p v-else class="text-[10px] mt-0.5 truncate" :class="{
                                                        'text-amber-600 dark:text-amber-500': roomDisplayStatus(room) === 'maintenance',
                                                        'text-gray-400 dark:text-gray-500': true,
                                                    }">
                                                        {{ roomStatusLabel(roomDisplayStatus(room)) }}
                                                    </p>
                                                </template>

                                                <!-- Room edit mode -->
                                                <template v-else>
                                                    <input v-model="editRoomNumber" type="text"
                                                        class="w-full px-1.5 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-primary-300 dark:border-primary-600 rounded mb-1.5 focus:ring-1 focus:ring-primary-500"
                                                        @keyup.enter="saveRoom(room)"
                                                        @keyup.escape="cancelEditRoom()" />
                                                    <div class="flex gap-1">
                                                        <button @click="saveRoom(room)" :disabled="savingRoom"
                                                            class="flex-1 px-1 py-0.5 text-[9px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">
                                                            <i class="fa-solid fa-check"></i>
                                                        </button>
                                                        <button @click="cancelEditRoom()"
                                                            class="flex-1 px-1 py-0.5 text-[9px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded">
                                                            <i class="fa-solid fa-xmark"></i>
                                                        </button>
                                                    </div>
                                                </template>
                                            </div>

                                            <!-- Add room button -->
                                            <div v-if="addingRoomTo !== floor.documentId"
                                                class="p-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors"
                                                @click="startAddRoom(floor)">
                                                <i
                                                    class="fa-solid fa-plus text-gray-300 dark:text-gray-600 text-xs"></i>
                                            </div>
                                            <!-- Add room inline form -->
                                            <div v-else
                                                class="p-2 rounded-lg border-2 border-primary-300 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10">
                                                <input v-model="newRoomNumber" type="text" :placeholder="t.roomNumber"
                                                    class="w-full px-1.5 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded mb-1.5"
                                                    @keyup.enter="confirmAddRoom(floor)"
                                                    @keyup.escape="cancelAddRoom()" />
                                                <div class="flex gap-1">
                                                    <button @click="confirmAddRoom(floor)"
                                                        class="flex-1 px-1 py-0.5 text-[9px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700">
                                                        <i class="fa-solid fa-check"></i>
                                                    </button>
                                                    <button @click="cancelAddRoom()"
                                                        class="flex-1 px-1 py-0.5 text-[9px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded">
                                                        <i class="fa-solid fa-xmark"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Non-residential floor without rooms: info panel -->
                                        <div v-else-if="(floor.floorType as string) !== 'residential' && floor.rooms.length === 0"
                                            class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                                            <i :class="floorTypeIcons[floor.floorType]"
                                                class="text-gray-400 text-sm"></i>
                                            <span class="text-xs text-gray-500 dark:text-gray-400">
                                                {{ t[`floorType_${floor.floorType}`] || floor.floorType }}
                                                {{ floor.floorLabel ? `— ${floor.floorLabel}` : '' }}
                                            </span>
                                        </div>
                                    </div>
                                </template>

                                <!-- Add floor row -->
                                <div class="p-4 border-t border-gray-100 dark:border-gray-700">
                                    <!-- Add floor button -->
                                    <div v-if="addingFloorTo !== building.documentId"
                                        class="flex items-center justify-center">
                                        <button @click="startAddFloor(building)"
                                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 hover:text-primary-500 transition-colors">
                                            <i class="fa-solid fa-plus text-[8px]"></i>
                                            {{ t.addFloor }}
                                        </button>
                                    </div>

                                    <!-- Add floor inline form -->
                                    <div v-else
                                        class="p-3 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-primary-200 dark:border-primary-800">
                                        <div class="flex flex-wrap items-end gap-2">
                                            <div class="w-20">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floor }} #</label>
                                                <input v-model.number="newFloorData.floorNumber" type="number" min="0"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                            </div>
                                            <div class="w-32">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floorTypeLabel }}</label>
                                                <select v-model="newFloorData.floorType"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
                                                    <option v-for="opt in floorTypeOptions" :key="opt.value"
                                                        :value="opt.value">
                                                        {{ t[`floorType_${opt.value}`] || opt.value }}
                                                    </option>
                                                </select>
                                            </div>
                                            <div class="flex-1 min-w-[100px]">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.floorLabelField }}</label>
                                                <input v-model="newFloorData.floorLabel" type="text"
                                                    :placeholder="t.floorLabelPlaceholder"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                            </div>
                                            <div v-if="newFloorData.floorType === 'residential'" class="w-20">
                                                <label
                                                    class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{
                                                        t.rooms }}</label>
                                                <input v-model.number="newFloorData.roomCount" type="number" min="0"
                                                    max="100"
                                                    class="w-full px-2 py-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded" />
                                            </div>
                                            <div class="flex gap-1">
                                                <button @click="confirmAddFloor(building)"
                                                    class="px-2 py-1 text-[10px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700">
                                                    <i class="fa-solid fa-check text-[8px] mr-0.5"></i>
                                                    {{ t.add }}
                                                </button>
                                                <button @click="cancelAddFloor()"
                                                    class="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                                    {{ t.cancel }}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Transition>
                    </div>
                </div>
            </div>

        </template>

        <!-- Lightbox -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="lightboxOpen" class="fixed inset-0 z-[110] flex items-center justify-center"
                    @click.self="lightboxOpen = false">
                    <!-- Backdrop -->
                    <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="lightboxOpen = false"></div>

                    <!-- Close -->
                    <button @click="lightboxOpen = false"
                        class="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-xmark"></i>
                    </button>

                    <!-- Counter -->
                    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/70 text-sm font-medium">
                        {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
                    </div>

                    <!-- Prev -->
                    <button v-if="lightboxImages.length > 1" @click.stop="lightboxPrev"
                        class="absolute left-3 md:left-6 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>

                    <!-- Main image -->
                    <div class="relative z-10 max-w-4xl w-full mx-16 flex items-center justify-center">
                        <Transition name="slide-img" mode="out-in">
                            <img :key="lightboxIndex" :src="imageUrl(lightboxImages[lightboxIndex]?.url ?? '')"
                                :alt="property?.name"
                                class="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl select-none" />
                        </Transition>
                    </div>

                    <!-- Next -->
                    <button v-if="lightboxImages.length > 1" @click.stop="lightboxNext"
                        class="absolute right-3 md:right-6 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>

                    <!-- Thumbnail strip -->
                    <div v-if="lightboxImages.length > 1"
                        class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 px-4 py-2 bg-black/40 rounded-xl backdrop-blur-sm max-w-full overflow-x-auto">
                        <button v-for="(img, i) in lightboxImages" :key="img.id"
                            class="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all"
                            :class="i === lightboxIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'"
                            @click.stop="lightboxIndex = i">
                            <img :src="imageUrl(img.url)" class="w-full h-full object-cover" />
                        </button>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Delete Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showDeleteModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showDeleteModal = false"></div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-4">
                            <div
                                class="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <i class="fa-solid fa-circle-exclamation text-red-500 text-lg"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.deleteProperty }}</h3>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">{{ t.deletePropertyConfirm }}</p>
                        <div class="flex gap-3 justify-end">
                            <button @click="showDeleteModal = false"
                                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="handleDelete" :disabled="isDeleting"
                                class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                                <i v-if="isDeleting" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-trash text-xs"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Create Building Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showCreateBuildingModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showCreateBuildingModal = false">
                    </div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-5">
                            <div
                                class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                                <i class="fa-solid fa-building text-primary-600 dark:text-primary-400 text-lg"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.createBuilding }}</h3>
                        </div>

                        <div class="space-y-4">
                            <!-- Building Name -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                    t.buildingName }}</label>
                                <input v-model="newBuilding.name" type="text" :placeholder="t.buildingNamePlaceholder"
                                    class="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors" />
                            </div>

                            <!-- Floors & Rooms per floor -->
                            <div class="grid grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                        t.startFloor }}</label>
                                    <input v-model.number="newBuilding.startFloor" type="number" min="1" max="999"
                                        class="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                        t.totalFloors }}</label>
                                    <input v-model.number="newBuilding.totalFloors" type="number" min="1" max="100"
                                        class="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                        t.roomsPerFloor }}</label>
                                    <input v-model.number="newBuilding.roomsPerFloor" type="number" min="1" max="100"
                                        class="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors" />
                                </div>
                            </div>

                            <!-- Preview -->
                            <div
                                class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400">
                                <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">Preview</p>
                                <p>{{ t.floor }} {{ newBuilding.startFloor }} – {{ newBuilding.startFloor +
                                    newBuilding.totalFloors - 1 }} · {{ newBuilding.totalFloors }} {{
                                        t.floor?.toLowerCase()
                                    }} × {{ newBuilding.roomsPerFloor }} {{
                                        t.rooms
                                    }} = <span class="font-bold text-gray-900 dark:text-white">{{
                                        newBuilding.totalFloors * newBuilding.roomsPerFloor }}</span>
                                    {{ t.totalRooms ?? 'total rooms' }}
                                </p>
                                <p class="mt-1">Room numbers: {{ newBuilding.totalFloors > 0 &&
                                    newBuilding.roomsPerFloor > 0 ?
                                    `${newBuilding.startFloor}${String(1).padStart(2, '0')} — ${newBuilding.startFloor +
                                    newBuilding.totalFloors - 1}${String(newBuilding.roomsPerFloor).padStart(2, '0')}` :
                                    '...' }}
                                </p>
                            </div>
                        </div>

                        <div class="flex gap-3 justify-end mt-6">
                            <button @click="showCreateBuildingModal = false"
                                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="handleGenerateBuilding"
                                :disabled="isGenerating || !newBuilding.name.trim() || newBuilding.totalFloors < 1 || newBuilding.roomsPerFloor < 1 || newBuilding.startFloor < 1"
                                class="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                                <i v-if="isGenerating" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-wand-magic-sparkles text-xs"></i>
                                {{ isGenerating ? t.generatingBuilding : t.generateBuilding }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Delete Building Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showDeleteBuildingModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showDeleteBuildingModal = false">
                    </div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-4">
                            <div
                                class="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <i class="fa-solid fa-circle-exclamation text-red-500 text-lg"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.deleteBuilding }}</h3>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">{{ t.deleteBuildingConfirm }}</p>
                        <div class="flex gap-3 justify-end">
                            <button @click="showDeleteBuildingModal = false"
                                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="handleDeleteBuilding" :disabled="isDeletingBuilding"
                                class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                                <i v-if="isDeletingBuilding" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-trash text-xs"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-img-enter-active,
.slide-img-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-img-enter-from {
    opacity: 0;
    transform: scale(0.96);
}

.slide-img-leave-to {
    opacity: 0;
    transform: scale(1.04);
}

.scrollbar-hide {
    scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
    display: none;
}

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
    max-height: 2000px;
}
</style>
