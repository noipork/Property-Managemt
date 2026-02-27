<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const router = useRouter()
const route = useRoute()
const residentId = computed(() => route.params.id as string)

// ─── Form State ───────────────────────────────────────────────────────────────
const form = ref({
    username: '',
    email: '',
    propertyId: '',
    unitTypeId: '',
    roomNumber: '',
    registrationDate: '',
    residencyStatus: 'reserved',
})
const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)
const isLoading = ref(true)

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

const properties = ref<Property[]>([])
const unitTypes = ref<UnitType[]>([])
const isLoadingProperties = ref(false)
const isLoadingUnitTypes = ref(false)
const initialUnitTypeId = ref('')

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
async function isRoomTaken(propertyId: string, roomNumber: string, excludeUserId: string): Promise<boolean> {
    const params = new URLSearchParams({
        'filters[role][id][$eq]': '4',
        'filters[property][id][$eq]': propertyId,
        'filters[roomNumber][$eqi]': roomNumber.trim(),
        'filters[id][$ne]': excludeUserId,
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
            'populate[0]': 'property',
            'populate[1]': 'unitType',
        })
        const res = await fetch(`${STRAPI_URL}/api/users/${residentId.value}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        form.value.username = data.username ?? ''
        form.value.email = data.email ?? ''
        form.value.roomNumber = data.roomNumber ?? ''
        form.value.registrationDate = data.registrationDate ?? ''
        form.value.residencyStatus = data.residencyStatus ?? 'reserved'
        if (data.property) {
            form.value.propertyId = String(data.property.id)
        }
        if (data.unitType) {
            initialUnitTypeId.value = String(data.unitType.id)
            form.value.unitTypeId = String(data.unitType.id)
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
        const res = await fetch(
            `${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name&fields[1]=city`,
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
                    'filters[unitType][id][$eq]': String(ut.id),
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

// Watch property changes (after initial load)
let initialLoad = true
watch(
    () => form.value.propertyId,
    (newId) => {
        if (initialLoad) return
        if (!newId) { unitTypes.value = []; form.value.unitTypeId = ''; return }
        const prop = properties.value.find(p => String(p.id) === newId)
        if (prop) fetchUnitTypes(prop.documentId)
    }
)

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
    return Object.keys(errors.value).length === 0
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        // ── Step 1: Check if room number is already taken by another resident ──
        const taken = await isRoomTaken(form.value.propertyId, form.value.roomNumber, residentId.value)
        if (taken) {
            showRoomTakenModal.value = true
            return
        }

        // ── Step 2: Update resident ──
        const res = await fetch(`${STRAPI_URL}/api/users/${residentId.value}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                username: form.value.username,
                email: form.value.email,
                property: Number(form.value.propertyId),
                unitType: Number(form.value.unitTypeId),
                roomNumber: form.value.roomNumber,
                registrationDate: form.value.registrationDate,
                residencyStatus: form.value.residencyStatus,
            }),
        })
        if (!res.ok) {
            const d = await res.json()
            modalErrorMessage.value = d?.error?.message || 'Update failed'
            showErrorModal.value = true
            return
        }

        // ── Step 3: Success ──
        showToast('success', 'Resident updated successfully')
        setTimeout(() => router.push('/residents'), 1800)
    } catch (e: any) {
        modalErrorMessage.value = (e as any)?.message || 'Update failed'
        showErrorModal.value = true
    } finally {
        isSubmitting.value = false
    }
}

onMounted(async () => {
    await Promise.all([fetchResident(), fetchProperties()])
    // After resident and properties are loaded, fetch unit types for the selected property
    if (form.value.propertyId) {
        const prop = properties.value.find(p => String(p.id) === form.value.propertyId)
        if (prop) await fetchUnitTypes(prop.documentId, true)
        // Restore the unit type selection
        if (initialUnitTypeId.value) form.value.unitTypeId = initialUnitTypeId.value
    }
    initialLoad = false
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
                    <i class="ti-arrow-left text-lg"></i>
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
                            <i class="ti-user text-primary-600 dark:text-primary-400"></i>
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
                    </div>
                </Transition>

                <!-- ── Unit Information ── -->
                <Transition appear enter-active-class="transition-all duration-500 delay-100"
                    enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                        <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="ti-home text-primary-600 dark:text-primary-400"></i>
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
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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

                        <!-- Room Number -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.roomNumber }} <span class="text-red-500">*</span>
                            </label>
                            <input v-model="form.roomNumber" type="text" :placeholder="t.roomNumberPlaceholder"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                :class="errors.roomNumber ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
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
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
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
                            <i v-else class="ti-check text-base"></i>
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
                            <i :class="toast.type === 'success' ? 'ti-check-box text-emerald-500' : 'ti-alert-circle text-red-500'"
                                class="text-base mt-0.5 shrink-0"></i>
                            <span class="flex-1 leading-snug">{{ toast.message }}</span>
                            <button @click="dismissToast(toast.id)"
                                class="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                                <i class="ti-close text-xs"></i>
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
                                        <i class="ti-home text-2xl text-amber-600 dark:text-amber-400"></i>
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
                                        <i class="ti-alert-circle text-2xl text-red-600 dark:text-red-400"></i>
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
