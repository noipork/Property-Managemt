<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const router = useRouter()
const route = useRoute()
const residentId = computed(() => route.params.id as string)
const residentNumericId = ref<number | null>(null)
const originalRoomNumber = ref('')
const originalPropertyId = ref('')

// ─── Form State ───────────────────────────────────────────────────────────────
const form = ref({
    username: '',
    email: '',
    phone: '',
    propertyId: '',
    unitTypeId: '',
    roomNumber: '',
    registrationDate: '',
    residencyStatus: 'reserved',
    nextBillDate: '',
    // Lease fields
    leaseNo: '',
    leaseStartDate: '',
    leaseEndDate: '',
    monthlyRent: '',
    depositAmount: '',
    currency: 'THB',
    terms: '',
    notes: '',
})
const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)
const isLoading = ref(true)
const propertyRelationMode = ref<'single' | 'array'>('single')
const unitTypeRelationMode = ref<'single' | 'array'>('single')

function getPrimaryRelation<T>(relation: T | T[] | null | undefined): T | null {
    if (!relation) return null
    return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

// ─── Lease ────────────────────────────────────────────────────────────────────
const leaseDocumentId = ref<string | null>(null)
const termsExpanded = ref(false)
const termsEditor = ref<HTMLElement | null>(null)

function handleTermsPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const fragment = document.createDocumentFragment()
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
        if (i > 0) fragment.appendChild(document.createElement('br'))
        if (line) fragment.appendChild(document.createTextNode(line))
    })
    range.insertNode(fragment)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    form.value.terms = (termsEditor.value as HTMLElement).innerHTML
}

async function fetchLease() {
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': String(residentNumericId.value),
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '1',
        })
        const res = await fetch(`${STRAPI_URL}/api/leases?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const item = data.data?.[0]
        if (!item) return
        leaseDocumentId.value = item.documentId
        form.value.leaseNo = item.leaseNo ?? ''
        form.value.leaseStartDate = item.startDate ?? ''
        form.value.leaseEndDate = item.endDate ?? ''
        form.value.monthlyRent = item.monthlyRent != null ? String(item.monthlyRent) : ''
        form.value.depositAmount = item.depositAmount != null ? String(item.depositAmount) : ''
        form.value.currency = item.currency || 'THB'
        form.value.notes = item.notes ?? ''
        // terms is HTML — set after next tick so the contenteditable is mounted
        if (item.terms && termsEditor.value) {
            termsEditor.value.innerHTML = item.terms
        }
        form.value.terms = item.terms ?? ''
    } catch {
        // silently ignore — lease section becomes empty
    }
}

// ─── Modals ───────────────────────────────────────────────────────────────────
const showRoomTakenModal = ref(false)
const showErrorModal = ref(false)
const modalErrorMessage = ref('')

// ─── Toast ───────────────────────────────────────────────────────────────────
interface Toast {
    id: number
    type: 'success' | 'error'
    message: string
}
const toasts = ref<Toast[]>([])
let toastCounter = 0

function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => dismissToast(id), 4000)
}

function dismissToast(id: number) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
}

// ─── Data ─────────────────────────────────────────────────────────────────────
interface Property {
    id: number
    documentId: string
    name: string
    city: string
}
interface UnitType {
    id: number
    documentId: string
    name: string
    unitType: string
    quantity: number
    price: number | null
    currency: string
    occupiedCount?: number
}

interface RoomData {
    id: number
    documentId: string
    roomNumber: string
    status: 'active' | 'inactive' | 'maintenance'
    resident: { id: number; username: string } | null
}
interface FloorData {
    id: number
    documentId: string
    floorNumber: number
    floorType: string
    rooms: RoomData[]
}
interface BuildingData {
    id: number
    documentId: string
    name: string
    totalFloors: number
    roomsPerFloor: number
    floors: FloorData[]
}

const properties = ref<Property[]>([])
const unitTypes = ref<UnitType[]>([])
const buildings = ref<BuildingData[]>([])
const isLoadingProperties = ref(false)
const isLoadingUnitTypes = ref(false)
const isLoadingBuildings = ref(false)
const selectedBuildingId = ref<string>('')
const selectedFloorId = ref<string>('')
const selectedRoomDocId = ref<string>('')
const initialUnitTypeId = ref('')
const roomSectionRef = ref<HTMLElement | null>(null)
const roomPrefillHighlight = ref(false)

const statuses = ['reserved', 'active', 'nearlyExpired', 'expired', 'inactive']
const statusLabels = computed(() => ({
    reserved: t.value.statusReserved,
    active: t.value.statusActive,
    nearlyExpired: t.value.statusNearlyExpired,
    expired: t.value.statusExpired,
    inactive: t.value.statusInactive,
}))

const selectedUnitType = computed(() =>
    unitTypes.value.find(ut => String(ut.id) === form.value.unitTypeId) ?? null
)

const availableSlots = computed(() => {
    if (!selectedUnitType.value) return null
    const extra = form.value.unitTypeId === initialUnitTypeId.value ? 1 : 0
    return selectedUnitType.value.quantity - (selectedUnitType.value.occupiedCount ?? 0) + extra
})

const isUnitFull = computed(() => availableSlots.value !== null && availableSlots.value <= 0)

function unitTypeOptionLabel(ut: { name: string; quantity: number; occupiedCount?: number }) {
    const occupied = ut.occupiedCount ?? 0
    const isCurrent = String((ut as any).id) === initialUnitTypeId.value
    const suffix = isCurrent ? '(current)' : (occupied >= ut.quantity ? '(FULL)' : '')
    return ut.name + ' — ' + occupied + '/' + ut.quantity + ' occupied' + (suffix ? ' ' + suffix : '')
}

// ─── Room Availability Check ─────────────────────────────────────────────────
async function isRoomTaken(propertyId: string, roomNumber: string, excludeUserId: string | number): Promise<boolean> {
    const params = new URLSearchParams({
        'filters[role][id][$eq]': '4',
        'filters[property][id]': propertyId,
        'filters[roomNumber][$eqi]': roomNumber.trim(),
        'filters[id][$ne]': String(excludeUserId),
        'pagination[pageSize]': '1',
    })
    const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
        headers: { Authorization: `Bearer ${token.value}` },
    })
    const data = await res.json()
    return Array.isArray(data) ? data.length > 0 : false
}

// ─── Fetch Resident ───────────────────────────────────────────────────────────
async function fetchResident() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'filters[documentId][$eq]': residentId.value,
            'populate[0]': 'property',
            'populate[1]': 'unitType',
            'pagination[pageSize]': '1',
        })
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const json = await res.json()
        const data = Array.isArray(json) ? json[0] : (json.data?.[0] ?? json)
        if (!data) throw new Error('Not found')
        residentNumericId.value = data.id
        form.value.username = data.username ?? ''
        form.value.email = data.email ?? ''
        form.value.phone = data.phone ?? ''
        form.value.roomNumber = data.roomNumber ?? ''
        originalRoomNumber.value = data.roomNumber ?? ''
        form.value.registrationDate = data.registrationDate ?? ''
        form.value.residencyStatus = data.residencyStatus ?? 'reserved'
        form.value.nextBillDate = data.nextBillDate ?? ''
        propertyRelationMode.value = Array.isArray(data.property) ? 'array' : 'single'
        unitTypeRelationMode.value = Array.isArray(data.unitType) ? 'array' : 'single'

        const propertyData = getPrimaryRelation(data.property)
        if (propertyData) {
            form.value.propertyId = String((propertyData as any).id)
            originalPropertyId.value = String((propertyData as any).id)
        }

        const unitTypeData = getPrimaryRelation(data.unitType)
        if (unitTypeData) {
            initialUnitTypeId.value = String((unitTypeData as any).id)
            form.value.unitTypeId = String((unitTypeData as any).id)
        }
    } catch {
        modalErrorMessage.value = 'Failed to load resident'
        showErrorModal.value = true
    } finally {
        isLoading.value = false
    }
}

// ─── Fetch Properties ─────────────────────────────────────────────────────────
async function fetchProperties() {
    isLoadingProperties.value = true
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
        properties.value = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            name: p.name,
            city: p.city,
        }))
    } catch {
        // ignore
    } finally {
        isLoadingProperties.value = false
    }
}

// ─── Fetch Unit Types ─────────────────────────────────────────────────────────
async function fetchUnitTypes(propertyDocumentId: string, keepUnitTypeId = false) {
    isLoadingUnitTypes.value = true
    if (!keepUnitTypeId) {
        unitTypes.value = []
        form.value.unitTypeId = ''
    }
    try {
        const params = new URLSearchParams({
            'filters[property][documentId][$eq]': propertyDocumentId,
            'pagination[pageSize]': '100',
        })
        const res = await fetch(`${STRAPI_URL}/api/unit-types?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        const uts: UnitType[] = (data.data ?? []).map((ut: any) => ({
            id: ut.id,
            documentId: ut.documentId,
            name: ut.name,
            unitType: ut.unitType,
            quantity: ut.quantity ?? 1,
            price: ut.price ?? null,
            currency: ut.currency ?? 'THB',
            occupiedCount: 0,
        }))

        await Promise.all(
            uts.map(async (ut) => {
                const countParams = new URLSearchParams({
                    'filters[role][id][$eq]': '4',
                    'filters[unitType][id]': String(ut.id),
                    'pagination[pageSize]': '1',
                    'pagination[page]': '1',
                })
                const countRes = await fetch(`${STRAPI_URL}/api/users?${countParams}`, {
                    headers: { Authorization: `Bearer ${token.value}` },
                })
                const countData = await countRes.json()
                ut.occupiedCount = Array.isArray(countData) ? countData.length : 0
            })
        )
        unitTypes.value = uts
    } catch {
        // ignore
    } finally {
        isLoadingUnitTypes.value = false
    }
}

// ─── Fetch Buildings when property changes ────────────────────────────────────
async function fetchBuildings(propertyDocumentId: string, keepSelection = false) {
    isLoadingBuildings.value = true
    buildings.value = []
    if (!keepSelection) {
        selectedBuildingId.value = ''
        selectedFloorId.value = ''
        selectedRoomDocId.value = ''
    }
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/buildings?filters[property][documentId][$eq]=${propertyDocumentId}&populate[floors][populate][rooms][populate]=resident&sort=createdAt:asc`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        buildings.value = (data.data ?? []).map((b: any) => ({
            id: b.id,
            documentId: b.documentId,
            name: b.name,
            totalFloors: b.totalFloors,
            roomsPerFloor: b.roomsPerFloor,
            floors: (b.floors ?? []).map((f: any) => ({
                id: f.id,
                documentId: f.documentId,
                floorNumber: f.floorNumber,
                floorType: f.floorType ?? 'residential',
                rooms: (f.rooms ?? []).map((r: any) => ({
                    id: r.id,
                    documentId: r.documentId,
                    roomNumber: r.roomNumber,
                    status: r.status ?? 'inactive',
                    resident: r.resident ? { id: r.resident.id, username: r.resident.username } : null,
                })),
            })).sort((a: FloorData, b: FloorData) => a.floorNumber - b.floorNumber),
        }))
    } catch {
        // silently ignore
    } finally {
        isLoadingBuildings.value = false
    }
}

// Computed: selected building/floor/rooms
const selectedBuilding = computed(() =>
    buildings.value.find(b => String(b.id) === selectedBuildingId.value) ?? null
)
const buildingFloors = computed(() => selectedBuilding.value?.floors ?? [])
const selectedFloor = computed(() =>
    buildingFloors.value.find(f => String(f.id) === selectedFloorId.value) ?? null
)
const floorRooms = computed(() => selectedFloor.value?.rooms ?? [])

function buildingRoomStats(b: BuildingData) {
    let total = 0, free = 0, occupied = 0, maint = 0
    for (const f of b.floors) {
        for (const r of f.rooms) {
            total++
            if (r.status === 'maintenance') maint++
            else if (r.resident) occupied++
            else free++
        }
    }
    return { total, free, occupied, maintenance: maint }
}

function roomStatusColor(room: RoomData) {
    if (room.status === 'maintenance') return 'maintenance'
    if (room.resident) return 'occupied'
    return 'free'
}

function selectRoom(room: RoomData) {
    // Allow clicking the currently selected room (keep it)
    if (room.documentId === selectedRoomDocId.value) return
    // Block maintenance rooms or rooms occupied by another resident
    if (room.status === 'maintenance') return
    if (room.resident && room.resident.id !== residentNumericId.value) return
    selectedRoomDocId.value = room.documentId
    form.value.roomNumber = room.roomNumber
}

// Watch property changes (after initial load)
let initialLoad = true
watch(
    () => form.value.propertyId,
    (newId) => {
        if (initialLoad) return
        if (!newId) {
            unitTypes.value = []
            buildings.value = []
            form.value.unitTypeId = ''
            selectedBuildingId.value = ''
            selectedFloorId.value = ''
            selectedRoomDocId.value = ''
            form.value.roomNumber = ''
            return
        }
        const prop = properties.value.find(p => String(p.id) === newId)
        if (prop) {
            fetchUnitTypes(prop.documentId)
            fetchBuildings(prop.documentId)
        }
    }
)

// Reset floor/room when building changes
watch(selectedBuildingId, () => {
    if (initialLoad) return
    selectedFloorId.value = ''
    selectedRoomDocId.value = ''
    form.value.roomNumber = ''
})
// Reset room when floor changes
watch(selectedFloorId, () => {
    if (initialLoad) return
    selectedRoomDocId.value = ''
    form.value.roomNumber = ''
})

// ─── Validation ───────────────────────────────────────────────────────────────
function validate() {
    errors.value = {}
    if (!form.value.username.trim()) errors.value.username = 'Full name is required'
    if (!form.value.email.trim()) errors.value.email = 'Email is required'
    if (!form.value.propertyId) errors.value.propertyId = 'Please select a property'
    if (!form.value.unitTypeId) errors.value.unitTypeId = 'Please select a unit type'
    if (!form.value.roomNumber.trim()) errors.value.roomNumber = 'Room number is required'
    if (!form.value.registrationDate) errors.value.registrationDate = 'Registration date is required'
    if (isUnitFull.value) errors.value.unitTypeId = t.value.unitFull
    // Lease validation
    if (!form.value.leaseNo.trim()) errors.value.leaseNo = t.value.leaseValidationNo
    if (!form.value.leaseStartDate) errors.value.leaseStartDate = t.value.leaseValidationStart
    if (!form.value.leaseEndDate) errors.value.leaseEndDate = t.value.leaseValidationEnd
    if (form.value.leaseStartDate && form.value.leaseEndDate && form.value.leaseEndDate <= form.value.leaseStartDate)
        errors.value.leaseEndDate = t.value.leaseValidationEndAfterStart
    if (!form.value.monthlyRent || Number(form.value.monthlyRent) <= 0) errors.value.monthlyRent = t.value.leaseValidationRent
    return Object.keys(errors.value).length === 0
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        // ── Step 1: Check if room number is already taken by another resident ──
        const taken = await isRoomTaken(form.value.propertyId, form.value.roomNumber, residentNumericId.value ?? 0)
        if (taken) {
            showRoomTakenModal.value = true
            return
        }

        // ── Step 2: Update resident ──
        const res = await fetch(`${STRAPI_URL}/api/users/${residentNumericId.value}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                username: form.value.username,
                email: form.value.email,
                phone: form.value.phone || null,
                property: propertyRelationMode.value === 'array'
                    ? [Number(form.value.propertyId)]
                    : Number(form.value.propertyId),
                unitType: unitTypeRelationMode.value === 'array'
                    ? [Number(form.value.unitTypeId)]
                    : Number(form.value.unitTypeId),
                roomNumber: form.value.roomNumber,
                registrationDate: form.value.registrationDate,
                residencyStatus: form.value.residencyStatus,
                nextBillDate: form.value.nextBillDate || null,
            }),
        })
        if (!res.ok) {
            const d = await res.json()
            modalErrorMessage.value = d?.error?.message || 'Update failed'
            showErrorModal.value = true
            return
        }

        // ── Step 3: Update room assignment in building if room or property changed ──
        const roomChanged = form.value.roomNumber.trim().toLowerCase() !== originalRoomNumber.value.trim().toLowerCase()
        const propertyChanged = form.value.propertyId !== originalPropertyId.value
        if (roomChanged || propertyChanged) {
            try {
                // Unassign resident from old room first
                await fetch(`${STRAPI_URL}/api/rooms/unassign-resident`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token.value}`,
                    },
                    body: JSON.stringify({
                        residentDocumentId: residentId.value,
                    }),
                })
            } catch {
                // Non-blocking — old room may not exist in building setup
            }
            try {
                // Assign resident to new room
                await fetch(`${STRAPI_URL}/api/rooms/assign-resident`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token.value}`,
                    },
                    body: JSON.stringify({
                        propertyId: Number(form.value.propertyId),
                        roomNumber: form.value.roomNumber,
                        residentDocumentId: residentId.value,
                    }),
                })
            } catch {
                // Non-blocking — new room may not exist in building setup
            }
            // Update tracked originals so subsequent saves don't re-trigger
            originalRoomNumber.value = form.value.roomNumber
            originalPropertyId.value = form.value.propertyId
        }

        // ── Step 4: Update lease if one exists ──
        if (leaseDocumentId.value) {
            await fetch(`${STRAPI_URL}/api/leases/${leaseDocumentId.value}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({
                    data: {
                        leaseNo: form.value.leaseNo,
                        startDate: form.value.leaseStartDate,
                        endDate: form.value.leaseEndDate,
                        monthlyRent: Number(form.value.monthlyRent),
                        depositAmount: form.value.depositAmount ? Number(form.value.depositAmount) : null,
                        currency: form.value.currency || 'THB',
                        terms: form.value.terms || null,
                        notes: form.value.notes || null,
                    },
                }),
            })
        }

        // ── Step 5: Success ──
        showToast('success', t.value.residentUpdated)
        setTimeout(() => router.push('/manager/residents'), 1800)
    } catch (e: any) {
        modalErrorMessage.value = (e as any)?.message || t.value.residentUpdateError
        showErrorModal.value = true
    } finally {
        isSubmitting.value = false
    }
}

onMounted(async () => {
    await Promise.all([fetchResident(), fetchProperties()])
    // After resident and properties are loaded, fetch unit types + buildings
    if (form.value.propertyId) {
        const prop = properties.value.find(p => String(p.id) === form.value.propertyId)
        if (prop) {
            await Promise.all([
                fetchUnitTypes(prop.documentId, true),
                fetchBuildings(prop.documentId, true),
            ])
        }
        // Restore unit type selection
        if (initialUnitTypeId.value) form.value.unitTypeId = initialUnitTypeId.value
        // Restore building/floor/room selection — prefer query params, fallback to roomNumber scan
        const qBuildingId = route.query.buildingId as string | undefined
        const qFloorId = route.query.floorId as string | undefined
        const qRoomNumber = (route.query.roomNumber as string | undefined) || form.value.roomNumber
        if (qBuildingId) {
            const b = buildings.value.find(x => String(x.id) === qBuildingId)
            if (b) {
                selectedBuildingId.value = String(b.id)
                if (qFloorId) {
                    const f = b.floors.find(x => String(x.id) === qFloorId)
                    if (f) {
                        selectedFloorId.value = String(f.id)
                        const match = qRoomNumber
                            ? f.rooms.find(r => r.roomNumber.toLowerCase() === qRoomNumber.toLowerCase())
                            : null
                        if (match) {
                            selectedRoomDocId.value = match.documentId
                        }
                    }
                }
            }
        }
        // Fallback: scan all buildings if query params didn't resolve
        if (!selectedRoomDocId.value && qRoomNumber) {
            for (const b of buildings.value) {
                for (const f of b.floors) {
                    const match = f.rooms.find(r => r.roomNumber.toLowerCase() === qRoomNumber.toLowerCase())
                    if (match) {
                        selectedBuildingId.value = String(b.id)
                        selectedFloorId.value = String(f.id)
                        selectedRoomDocId.value = match.documentId
                        break
                    }
                }
                if (selectedRoomDocId.value) break
            }
        }
        // Scroll to room section & pulse highlight when auto-selected
        if (selectedRoomDocId.value) {
            await nextTick()
            roomPrefillHighlight.value = true
            setTimeout(() => {
                roomSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 600)
            setTimeout(() => { roomPrefillHighlight.value = false }, 3000)
        }
    }
    initialLoad = false
    await fetchLease()
    // Restore terms HTML into contenteditable after mount
    await nextTick()
    if (form.value.terms && termsEditor.value) {
        termsEditor.value.innerHTML = form.value.terms
    }
})
</script>

<template>
    <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <Transition appear enter-active-class="transition-all duration-500" enter-from-class="opacity-0 -translate-y-3"
            enter-to-class="opacity-100 translate-y-0">
            <div class="flex items-center gap-3">
                <button @click="$router.back()"
                    class="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <i class="fa-solid fa-arrow-left text-lg"></i>
                </button>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.editResident }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.editResidentSubtitle }}</p>
                </div>
            </div>
        </Transition>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <template v-else>
            <form @submit.prevent="submit" class="space-y-6">
                <!-- ── Resident Information ── -->
                <Transition appear enter-active-class="transition-all duration-500"
                    enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-user text-primary-600 dark:text-primary-400"></i>
                            {{ t.residentInfo }}
                        </h2>

                        <!-- Username -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.residentName }} <span class="text-red-500">*</span>
                            </label>
                            <input v-model="form.username" type="text"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                :class="errors.username ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            <p v-if="errors.username" class="mt-1 text-xs text-red-500">{{ errors.username }}</p>
                        </div>

                        <!-- Email -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.residentEmail }} <span class="text-red-500">*</span>
                            </label>
                            <input v-model="form.email" type="email"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                :class="errors.email ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            <p v-if="errors.email" class="mt-1 text-xs text-red-500">{{ errors.email }}</p>
                        </div>

                        <!-- Phone -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.residentPhone }}
                            </label>
                            <input v-model="form.phone" type="tel" :placeholder="t.residentPhonePlaceholder"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors" />
                        </div>
                    </div>
                </Transition>

                <!-- ── Unit Information ── -->
                <Transition appear enter-active-class="transition-all duration-500 delay-100"
                    enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-house text-primary-600 dark:text-primary-400"></i>
                            {{ t.unitInfo }}
                        </h2>

                        <!-- Property -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.property }} <span class="text-red-500">*</span>
                            </label>
                            <div class="relative">
                                <select v-model="form.propertyId"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors"
                                    :class="errors.propertyId ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'">
                                    <option value="">{{ t.selectProperty }}</option>
                                    <option v-for="p in properties" :key="p.id" :value="String(p.id)">
                                        {{ p.name }}{{ p.city ? ' · ' + p.city : '' }}
                                    </option>
                                </select>
                                <i
                                    class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                            <p v-if="errors.propertyId" class="mt-1 text-xs text-red-500">{{ errors.propertyId }}</p>
                        </div>

                        <!-- Unit Type -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.unitTypeLabel }} <span class="text-red-500">*</span>
                            </label>
                            <div class="relative">
                                <select v-model="form.unitTypeId" :disabled="!form.propertyId || isLoadingUnitTypes"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none disabled:opacity-50 transition-colors"
                                    :class="errors.unitTypeId ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'">
                                    <option value="">{{ isLoadingUnitTypes ? 'Loading...' : t.selectUnitType }}</option>
                                    <option v-for="ut in unitTypes" :key="ut.id" :value="String(ut.id)"
                                        :disabled="(ut.occupiedCount ?? 0) >= ut.quantity && String(ut.id) !== initialUnitTypeId">
                                        {{ unitTypeOptionLabel(ut) }}
                                    </option>
                                </select>
                                <i
                                    class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                            <p v-if="errors.unitTypeId" class="mt-1 text-xs text-red-500">{{ errors.unitTypeId }}</p>

                            <div v-if="selectedUnitType"
                                class="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs space-y-1">
                                <div class="flex items-center justify-between">
                                    <span class="text-gray-500 dark:text-gray-400">{{ t.availableSlots }}</span>
                                    <span
                                        :class="isUnitFull ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'">
                                        {{ availableSlots }} / {{ selectedUnitType.quantity }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Room Selection: Building → Floor → Room -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.roomNumber }} <span class="text-red-500">*</span>
                            </label>

                            <!-- No buildings -->
                            <div v-if="form.propertyId && !isLoadingBuildings && buildings.length === 0"
                                class="flex flex-col items-center gap-2 p-4 bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                                <i
                                    class="fa-solid fa-building-circle-xmark text-2xl text-gray-300 dark:text-gray-600"></i>
                                <p class="text-xs text-gray-500 dark:text-gray-400 text-center">{{ t.noBuildingsSetup }}
                                </p>
                                <input v-model="form.roomNumber" type="text" :placeholder="t.roomNumberPlaceholder"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors" />
                            </div>

                            <!-- Loading -->
                            <div v-else-if="isLoadingBuildings"
                                class="flex items-center gap-2 py-3 text-sm text-gray-400">
                                <div
                                    class="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin">
                                </div>
                                {{ t.loadingBuildings }}
                            </div>

                            <!-- Building picker -->
                            <div v-else-if="buildings.length > 0" ref="roomSectionRef" class="space-y-3">
                                <!-- Step 1: Select Building -->
                                <div>
                                    <p
                                        class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                        <span
                                            class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-bold">1</span>
                                        {{ t.selectBuilding }}
                                    </p>
                                    <div class="grid gap-2"
                                        :class="buildings.length > 2 ? 'grid-cols-3' : buildings.length === 2 ? 'grid-cols-2' : 'grid-cols-1'">
                                        <button v-for="b in buildings" :key="b.id" type="button"
                                            @click="selectedBuildingId = String(b.id)"
                                            class="relative p-3 rounded-lg border-2 text-left transition-all duration-200"
                                            :class="selectedBuildingId === String(b.id)
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm'
                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'">
                                            <div class="flex items-center gap-2 mb-1.5">
                                                <i class="fa-solid fa-building text-sm"
                                                    :class="selectedBuildingId === String(b.id) ? 'text-primary-500' : 'text-gray-400'"></i>
                                                <span
                                                    class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{
                                                        b.name }}</span>
                                            </div>
                                            <div class="flex items-center gap-2 text-[10px]">
                                                <span
                                                    class="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                                    <i class="fa-solid fa-circle text-[5px]"></i>
                                                    {{ buildingRoomStats(b).free }}
                                                </span>
                                                <span
                                                    class="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400">
                                                    <i class="fa-solid fa-circle text-[5px]"></i>
                                                    {{ buildingRoomStats(b).occupied }}
                                                </span>
                                                <span v-if="buildingRoomStats(b).maintenance"
                                                    class="inline-flex items-center gap-0.5 text-amber-500 dark:text-amber-400">
                                                    <i class="fa-solid fa-circle text-[5px]"></i>
                                                    {{ buildingRoomStats(b).maintenance }}
                                                </span>
                                                <span class="text-gray-400 dark:text-gray-500 ml-auto">{{
                                                    buildingRoomStats(b).total }} {{ t.totalRooms }}</span>
                                            </div>
                                            <div v-if="selectedBuildingId === String(b.id)"
                                                class="absolute top-1.5 right-1.5">
                                                <i class="fa-solid fa-circle-check text-primary-500 text-xs"></i>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <!-- Step 2: Select Floor -->
                                <div v-if="selectedBuilding && buildingFloors.length > 0">
                                    <p
                                        class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                        <span
                                            class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-bold">2</span>
                                        {{ t.selectFloor }}
                                    </p>
                                    <div class="flex flex-wrap gap-1.5">
                                        <button v-for="f in buildingFloors" :key="f.id" type="button"
                                            @click="selectedFloorId = String(f.id)"
                                            class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200"
                                            :class="selectedFloorId === String(f.id)
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'">
                                            <i class="fa-solid fa-layer-group mr-1 text-[10px]"></i>
                                            {{ t.floorLabel }} {{ f.floorNumber }}
                                            <span class="ml-1 text-[10px] opacity-60">({{f.rooms.filter(r => r.status
                                                !== 'active' && r.status !== 'maintenance' && !r.resident).length}} {{
                                                    t.freeLabel }})</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- Step 3: Select Room -->
                                <div v-if="selectedFloor && floorRooms.length > 0">
                                    <p
                                        class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                        <span
                                            class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-bold">3</span>
                                        {{ t.selectRoom }}
                                    </p>
                                    <!-- Legend -->
                                    <div
                                        class="flex items-center gap-3 mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                                        <span class="inline-flex items-center gap-1"><span
                                                class="w-2.5 h-2.5 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700"></span>{{
                                                    t.roomFree }}</span>
                                        <span class="inline-flex items-center gap-1"><span
                                                class="w-2.5 h-2.5 rounded bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700"></span>{{
                                                    t.roomOccupied }}</span>
                                        <span class="inline-flex items-center gap-1"><span
                                                class="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700"></span>{{
                                                    t.roomMaintenance }}</span>
                                    </div>
                                    <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
                                        <button v-for="room in floorRooms" :key="room.id" type="button"
                                            @click="selectRoom(room)"
                                            :disabled="roomStatusColor(room) !== 'free' && room.documentId !== selectedRoomDocId"
                                            :title="roomStatusColor(room) === 'occupied' && room.documentId !== selectedRoomDocId
                                                ? (room.resident?.username ?? 'Occupied')
                                                : roomStatusColor(room) === 'maintenance'
                                                    ? 'Maintenance'
                                                    : room.roomNumber"
                                            class="relative flex flex-col items-center justify-center py-2 px-1 rounded-lg border-2 text-xs font-semibold transition-all duration-200"
                                            :class="[
                                                selectedRoomDocId === room.documentId
                                                    ? 'border-primary-500 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-2 ring-primary-300 dark:ring-primary-700 shadow-sm' + (roomPrefillHighlight ? ' animate-pulse' : '')
                                                    : roomStatusColor(room) === 'free'
                                                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer'
                                                        : roomStatusColor(room) === 'occupied'
                                                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-500 cursor-not-allowed opacity-70'
                                                            : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-500 dark:text-amber-400 cursor-not-allowed opacity-70',
                                            ]">
                                            <i class="text-[10px] mb-0.5" :class="[
                                                roomStatusColor(room) === 'free' ? 'fa-solid fa-door-open' :
                                                    roomStatusColor(room) === 'occupied' ? 'fa-solid fa-door-closed' :
                                                        'fa-solid fa-wrench'
                                            ]"></i>
                                            <span>{{ room.roomNumber }}</span>
                                            <span
                                                v-if="roomStatusColor(room) === 'occupied' && room.resident && room.documentId !== selectedRoomDocId"
                                                class="text-[8px] font-normal truncate max-w-full px-0.5 opacity-70">
                                                {{ room.resident.username }}
                                            </span>
                                            <div v-if="selectedRoomDocId === room.documentId"
                                                class="absolute -top-1 -right-1">
                                                <i
                                                    class="fa-solid fa-circle-check text-primary-500 text-xs bg-white dark:bg-gray-900 rounded-full"></i>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <!-- Selected room summary -->
                                <div v-if="form.roomNumber && selectedRoomDocId"
                                    class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs transition-all duration-300"
                                    :class="roomPrefillHighlight
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                                        : 'bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-primary-700 dark:text-primary-300'">
                                    <i
                                        :class="roomPrefillHighlight ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-check-circle'"></i>
                                    <span class="flex-1">{{ t.selectedRoom }}: <strong>{{ selectedBuilding?.name }} → {{
                                        t.floorLabel
                                            }} {{ selectedFloor?.floorNumber }} → {{ form.roomNumber }}</strong></span>
                                    <span v-if="roomPrefillHighlight"
                                        class="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-800/40 text-emerald-600 dark:text-emerald-400">
                                        <i class="fa-solid fa-link text-[8px]"></i>
                                        {{ t.autoSelected || 'Auto-selected' }}
                                    </span>
                                </div>
                            </div>

                            <!-- No property selected -->
                            <div v-else-if="!form.propertyId"
                                class="text-xs text-gray-400 dark:text-gray-500 italic py-1">
                                {{ t.selectPropertyFirst }}
                            </div>

                            <p v-if="errors.roomNumber" class="mt-1 text-xs text-red-500">{{ errors.roomNumber }}</p>
                        </div>

                        <!-- Registration Date -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.registrationDate }} <span class="text-red-500">*</span>
                            </label>
                            <input v-model="form.registrationDate" type="date"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                :class="errors.registrationDate ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'"
                                @click="($event.target as HTMLInputElement).showPicker?.()" />
                            <p v-if="errors.registrationDate" class="mt-1 text-xs text-red-500">{{
                                errors.registrationDate
                                }}</p>
                        </div>

                        <!-- Residency Status -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.residencyStatus }} <span class="text-red-500">*</span>
                            </label>
                            <div class="relative">
                                <select v-model="form.residencyStatus"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors">
                                    <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                                </select>
                                <i
                                    class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                        </div>

                        <!-- Next Bill Date -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.nextBillDate }}
                            </label>
                            <input v-model="form.nextBillDate" type="date"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                @click="($event.target as HTMLInputElement).showPicker?.()" />
                            <p class="mt-1 text-xs text-gray-400">{{ t.nextBillDateHint }}</p>
                        </div>
                    </div>
                </Transition>

                <!-- ── Lease Details ── -->
                <Transition appear enter-active-class="transition-all duration-500 delay-150"
                    enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-receipt text-primary-600 dark:text-primary-400"></i>
                            {{ t.leaseDetails }}
                        </h2>

                        <!-- Lease No + Currency (row) -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseNo }} <span class="text-red-500">*</span>
                                </label>
                                <div class="relative">
                                    <input v-model="form.leaseNo" type="text" :placeholder="t.leaseNoPlaceholder"
                                        class="w-full pl-3 pr-10 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors font-mono"
                                        :class="errors.leaseNo ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                                    <button type="button" @click="() => {
                                        const now = new Date()
                                        const d = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0')
                                        form.leaseNo = `LSE-${d}-${Math.floor(1000 + Math.random() * 9000)}`
                                    }" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                        :title="t.leaseRegenerate">
                                        <i class="fa-solid fa-rotate text-sm"></i>
                                    </button>
                                </div>
                                <p v-if="errors.leaseNo" class="mt-1 text-xs text-red-500">{{ errors.leaseNo }}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseCurrency }}
                                </label>
                                <div class="relative">
                                    <select v-model="form.currency"
                                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors appearance-none">
                                        <option value="THB">THB</option>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="SGD">SGD</option>
                                    </select>
                                    <i
                                        class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                                </div>
                            </div>
                        </div>

                        <!-- Start Date + End Date (row) -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseStartDate }} <span class="text-red-500">*</span>
                                </label>
                                <input v-model="form.leaseStartDate" type="date"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                    :class="errors.leaseStartDate ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'"
                                    @click="($event.target as HTMLInputElement).showPicker?.()" />
                                <p v-if="errors.leaseStartDate" class="mt-1 text-xs text-red-500">{{
                                    errors.leaseStartDate }}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseEndDate }} <span class="text-red-500">*</span>
                                </label>
                                <input v-model="form.leaseEndDate" type="date"
                                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                    :class="errors.leaseEndDate ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'"
                                    @click="($event.target as HTMLInputElement).showPicker?.()" />
                                <p v-if="errors.leaseEndDate" class="mt-1 text-xs text-red-500">{{ errors.leaseEndDate
                                    }}</p>
                            </div>
                        </div>

                        <!-- Monthly Rent + Deposit (row) -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseMonthlyRent }} <span class="text-red-500">*</span>
                                </label>
                                <div class="relative">
                                    <span
                                        class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">{{
                                            form.currency }}</span>
                                    <input v-model="form.monthlyRent" type="number" min="0" step="0.01"
                                        placeholder="0.00"
                                        class="w-full pl-12 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                        :class="errors.monthlyRent ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                                </div>
                                <p v-if="errors.monthlyRent" class="mt-1 text-xs text-red-500">{{ errors.monthlyRent }}
                                </p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {{ t.leaseDepositAmount }}
                                </label>
                                <div class="relative">
                                    <span
                                        class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">{{
                                            form.currency }}</span>
                                    <input v-model="form.depositAmount" type="number" min="0" step="0.01"
                                        placeholder="0.00"
                                        class="w-full pl-12 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors" />
                                </div>
                            </div>
                        </div>

                        <!-- Duration summary -->
                        <div v-if="form.leaseStartDate && form.leaseEndDate && form.leaseEndDate > form.leaseStartDate"
                            class="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg text-xs text-primary-700 dark:text-primary-300">
                            <i class="fa-solid fa-calendar shrink-0"></i>
                            <span>{{ t.leaseDuration }}:
                                <strong>{{(() => {
                                    const s = new Date(form.leaseStartDate)
                                    const e = new Date(form.leaseEndDate)
                                    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() -
                                        s.getMonth())
                                    return months > 0
                                        ? months + ' ' + (months !== 1 ? t.leaseDurationMonthsPlural :
                                            t.leaseDurationMonths)
                                        : Math.round((e.getTime() - s.getTime()) / 86400000) + ' ' + t.leaseDurationDays
                                })()}}</strong>
                            </span>
                        </div>

                        <!-- Terms & Conditions WYSIWYG -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {{ t.leaseTerms }}
                                </label>
                                <button type="button" @click="termsExpanded = !termsExpanded"
                                    class="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none">
                                    <i :class="termsExpanded ? 'fa-solid fa-compress' : 'fa-solid fa-expand'"
                                        class="text-xs"></i>
                                    {{ termsExpanded ? t.leaseTermsCollapse : t.leaseTermsExpand }}
                                </button>
                            </div>
                            <!-- Toolbar -->
                            <div
                                class="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 rounded-t-lg">
                                <button type="button" @mousedown.prevent="document.execCommand('bold')" title="Bold"
                                    class="font-bold text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">B</button>
                                <button type="button" @mousedown.prevent="document.execCommand('italic')" title="Italic"
                                    class="italic text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">I</button>
                                <button type="button" @mousedown.prevent="document.execCommand('underline')"
                                    title="Underline"
                                    class="underline text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">U</button>
                                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button type="button" @mousedown.prevent="document.execCommand('insertUnorderedList')"
                                    title="Bullet list"
                                    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                    <i class="fa-solid fa-list text-xs"></i>
                                </button>
                                <button type="button" @mousedown.prevent="document.execCommand('insertOrderedList')"
                                    title="Numbered list"
                                    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor"
                                        stroke-width="1.8">
                                        <line x1="6" y1="4" x2="14" y2="4" />
                                        <line x1="6" y1="8" x2="14" y2="8" />
                                        <line x1="6" y1="12" x2="14" y2="12" />
                                        <text x="1" y="5" font-size="4" fill="currentColor" stroke="none">1.</text>
                                        <text x="1" y="9" font-size="4" fill="currentColor" stroke="none">2.</text>
                                        <text x="1" y="13" font-size="4" fill="currentColor" stroke="none">3.</text>
                                    </svg>
                                </button>
                                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button type="button"
                                    @mousedown.prevent="document.execCommand('formatBlock', false, 'h3')"
                                    title="Heading"
                                    class="text-xs font-bold w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">H3</button>
                                <button type="button"
                                    @mousedown.prevent="document.execCommand('formatBlock', false, 'p')"
                                    title="Paragraph"
                                    class="text-xs w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">¶</button>
                                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button type="button"
                                    @mousedown.prevent="() => { if (termsEditor.value) { termsEditor.value.innerHTML = ''; form.terms = '' } }"
                                    :title="t.leaseTermsClear"
                                    class="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-gray-400 hover:text-red-500">
                                    <i class="fa-solid fa-trash text-xs"></i>
                                </button>
                                <span class="ml-auto text-xs text-gray-400 dark:text-gray-500 select-none pr-1">
                                    {{ form.terms ? form.terms.replace(/<[^>]*>/g, '').length : 0 }} chars
                                </span>
                            </div>
                            <!-- Editable area -->
                            <div ref="termsEditor" contenteditable="true"
                                @input="form.terms = ($event.target as HTMLElement).innerHTML" @paste="handleTermsPaste"
                                :data-placeholder="t.leaseTermsPlaceholder" :class="[
                                    'overflow-y-auto w-full px-3 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-300',
                                    '[&_h3]:font-bold [&_h3]:text-base [&_h3]:mt-2 [&_h3]:mb-1',
                                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
                                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
                                    '[&_p]:my-1',
                                    'empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none empty:before:block',
                                    termsExpanded ? 'min-h-[32rem]' : 'min-h-48 max-h-96',
                                ]"></div>
                            <p class="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <i class="fa-solid fa-circle-info"></i>
                                {{ t.leaseTermsHint }}
                            </p>
                        </div>

                        <!-- Notes -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.leaseNotes }}
                            </label>
                            <textarea v-model="form.notes" rows="3" :placeholder="t.leaseNotesPlaceholder"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none"></textarea>
                        </div>

                        <!-- No lease notice -->
                        <div v-if="!leaseDocumentId"
                            class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <i class="fa-solid fa-circle-info mt-0.5 shrink-0 text-amber-500"></i>
                            No existing lease found. Lease fields will be saved when you submit.
                        </div>
                    </div>
                </Transition>

                <!-- Submit -->
                <Transition appear enter-active-class="transition-all duration-500 delay-200"
                    enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                    <div class="flex items-center justify-end gap-3">
                        <button type="button" @click="$router.back()"
                            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            {{ t.cancel }}
                        </button>
                        <button type="submit" :disabled="isSubmitting || isUnitFull"
                            class="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                            <div v-if="isSubmitting"
                                class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin">
                            </div>
                            <i v-else class="fa-solid fa-check text-base"></i>
                            {{ isSubmitting ? t.updatingProperty : t.save }}
                        </button>
                    </div>
                </Transition>
            </form>

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

            <!-- Room Already Taken Modal -->
            <Teleport to="body">
                <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                    enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                    leave-from-class="opacity-100" leave-to-class="opacity-0">
                    <div v-if="showRoomTakenModal"
                        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <Transition enter-active-class="transition-all duration-200"
                            enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100">
                            <div v-if="showRoomTakenModal"
                                class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                                <div class="flex flex-col items-center text-center gap-3">
                                    <div
                                        class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                                        <i class="fa-solid fa-house text-2xl text-amber-600 dark:text-amber-400"></i>
                                    </div>
                                    <div>
                                        <h3 class="text-base font-semibold text-gray-900 dark:text-white">Room Already
                                            Registered</h3>
                                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                            Room <span class="font-semibold text-gray-800 dark:text-gray-200">{{
                                                form.roomNumber }}</span> is already assigned to another resident in
                                            this property.
                                        </p>
                                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Please use a different
                                            room number.</p>
                                    </div>
                                </div>
                                <button @click="showRoomTakenModal = false"
                                    class="w-full px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors">
                                    OK, Change Room Number
                                </button>
                            </div>
                        </Transition>
                    </div>
                </Transition>
            </Teleport>

            <!-- Error Modal -->
            <Teleport to="body">
                <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                    enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                    leave-from-class="opacity-100" leave-to-class="opacity-0">
                    <div v-if="showErrorModal"
                        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <Transition enter-active-class="transition-all duration-200"
                            enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100">
                            <div v-if="showErrorModal"
                                class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                                <div class="flex flex-col items-center text-center gap-3">
                                    <div
                                        class="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                                        <i
                                            class="fa-solid fa-circle-exclamation text-2xl text-red-600 dark:text-red-400"></i>
                                    </div>
                                    <div>
                                        <h3 class="text-base font-semibold text-gray-900 dark:text-white">Update Failed
                                        </h3>
                                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ modalErrorMessage }}
                                        </p>
                                    </div>
                                </div>
                                <button @click="showErrorModal = false"
                                    class="w-full px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                                    Close
                                </button>
                            </div>
                        </Transition>
                    </div>
                </Transition>
            </Teleport>
        </template>
    </div>
</template>
