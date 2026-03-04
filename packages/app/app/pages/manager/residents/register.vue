<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const router = useRouter()

// ─── Form State ───────────────────────────────────────────────────────────────
const form = ref({
    username: '',
    email: '',
    password: '',
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

// Set date client-side only to avoid hydration mismatch
onMounted(() => {
    if (!form.value.registrationDate) {
        form.value.registrationDate = new Date().toISOString().split('T')[0]
    }
    // Auto-generate lease number: LSE-YYYYMMDD-XXXX
    const now = new Date()
    const datePart = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0')
    const rand = Math.floor(1000 + Math.random() * 9000)
    form.value.leaseNo = `LSE-${datePart}-${rand}`
})

const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)

// Auto-default nextBillDate from leaseStartDate
watch(() => form.value.leaseStartDate, (val) => {
    if (val && !form.value.nextBillDate) {
        form.value.nextBillDate = val
    }
})

// ─── Modals ───────────────────────────────────────────────────────────────────
const showRoomTakenModal = ref(false)
const showErrorModal = ref(false)
const modalErrorMessage = ref('')

// ─── Toast ───────────────────────────────────────────────────────────────────
interface Toast {
    id: number
    type: 'success' | 'error'
    message: string
    visible: boolean
}
const toasts = ref<Toast[]>([])
let toastCounter = 0

function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message, visible: false })
    // trigger enter transition on next tick
    nextTick(() => {
        const t = toasts.value.find(t => t.id === id)
        if (t) t.visible = true
    })
    setTimeout(() => dismissToast(id), 4000)
}

function dismissToast(id: number) {
    const t = toasts.value.find(t => t.id === id)
    if (t) {
        t.visible = false
        setTimeout(() => {
            toasts.value = toasts.value.filter(t => t.id !== id)
        }, 300)
    }
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
    // resolved client-side
    occupiedCount?: number
}

const properties = ref<Property[]>([])
const unitTypes = ref<UnitType[]>([])
const isLoadingProperties = ref(false)
const isLoadingUnitTypes = ref(false)

const statuses = ['reserved', 'active', 'nearlyExpired', 'expired', 'inactive']
const statusLabels = computed(() => ({
    reserved: t.value.statusReserved,
    active: t.value.statusActive,
    nearlyExpired: t.value.statusNearlyExpired,
    expired: t.value.statusExpired,
    inactive: t.value.statusInactive,
}))

// ─── Computed ─────────────────────────────────────────────────────────────────
const selectedUnitType = computed(() =>
    unitTypes.value.find(ut => String(ut.id) === form.value.unitTypeId) ?? null
)

const availableSlots = computed(() => {
    if (!selectedUnitType.value) return null
    return selectedUnitType.value.quantity - (selectedUnitType.value.occupiedCount ?? 0)
})

const isUnitFull = computed(() => availableSlots.value !== null && availableSlots.value <= 0)

const unitTypePlaceholder = computed(() => {
    if (isLoadingUnitTypes.value) return 'Loading...'
    if (unitTypes.value.length === 0 && form.value.propertyId) return 'No unit types found'
    return t.value.selectUnitType
})

function unitTypeOptionLabel(ut: { name: string; quantity: number; occupiedCount?: number }) {
    const occupied = ut.occupiedCount ?? 0
    const slots = ut.quantity - occupied
    const slotText = occupied >= ut.quantity ? '(FULL)' : slots + ' slot' + (slots !== 1 ? 's' : '') + ' left'
    return ut.name + ' — ' + occupied + '/' + ut.quantity + ' occupied · ' + slotText
}

const showPassword = ref(false)
const copiedField = ref<string | null>(null)
const termsExpanded = ref(false)
const termsEditor = ref<HTMLElement | null>(null)

function execCmd(command: string, value?: string) {
    document.execCommand(command, false, value)
}
function clearTerms() {
    if (termsEditor.value) {
        termsEditor.value.innerHTML = ''
        form.value.terms = ''
    }
}

function generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
    form.value.password = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    showPassword.value = true
}

async function copyToClipboard(text: string, field: string) {
    try {
        await navigator.clipboard.writeText(text)
        copiedField.value = field
        setTimeout(() => (copiedField.value = null), 2000)
    } catch {
        // fallback for older browsers
        const el = document.createElement('textarea')
        el.value = text
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        copiedField.value = field
        setTimeout(() => (copiedField.value = null), 2000)
    }
}

// ─── Room Availability Check ─────────────────────────────────────────────────
// Returns true (taken) only if an active/non-inactive resident already holds the room.
// If the existing resident's status is 'inactive', the room is considered free.
async function isRoomTaken(propertyId: string, roomNumber: string): Promise<boolean> {
    const params = new URLSearchParams({
        'filters[role][id][$eq]': '4',
        'filters[property][id][$eq]': propertyId,
        'filters[roomNumber][$eqi]': roomNumber.trim(),
        'pagination[pageSize]': '10',
    })
    const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
        headers: { Authorization: `Bearer ${token.value}` },
    })
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return false
    // Room is only "taken" if at least one resident with that room is NOT inactive
    return data.some((r: any) => r.residencyStatus !== 'inactive')
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
        // silently ignore
    } finally {
        isLoadingProperties.value = false
    }
}

// ─── Fetch Unit Types when property changes ───────────────────────────────────
async function fetchUnitTypes(propertyDocumentId: string) {
    isLoadingUnitTypes.value = true
    unitTypes.value = []
    form.value.unitTypeId = ''
    try {
        // Fetch unit types for this property
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

        // For each unit type, count how many residents are assigned to it
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
                // /api/users returns an array directly, so count by length
                ut.occupiedCount = Array.isArray(countData) ? countData.length : 0
            })
        )
        unitTypes.value = uts
    } catch {
        // silently ignore
    } finally {
        isLoadingUnitTypes.value = false
    }
}

// Watch property selection
watch(
    () => form.value.propertyId,
    (newId) => {
        if (!newId) {
            unitTypes.value = []
            form.value.unitTypeId = ''
            return
        }
        const prop = properties.value.find(p => String(p.id) === newId)
        if (prop) fetchUnitTypes(prop.documentId)
    }
)

// ─── Validation ───────────────────────────────────────────────────────────────
function validate() {
    errors.value = {}
    if (!form.value.username.trim()) errors.value.username = t.value.validationNameRequired
    if (!form.value.email.trim()) errors.value.email = t.value.validationEmailRequired
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) errors.value.email = t.value.validationEmailInvalid
    if (!form.value.password) errors.value.password = t.value.validationPasswordRequired
    else if (form.value.password.length < 6) errors.value.password = t.value.validationPasswordShort
    if (!form.value.propertyId) errors.value.propertyId = t.value.validationPropertyRequired
    if (!form.value.unitTypeId) errors.value.unitTypeId = t.value.validationUnitTypeRequired
    if (!form.value.roomNumber.trim()) errors.value.roomNumber = t.value.validationRoomRequired
    if (!form.value.registrationDate) errors.value.registrationDate = t.value.validationDateRequired
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
        // ── Step 1: Check if room number is already taken in this property ──
        const taken = await isRoomTaken(form.value.propertyId, form.value.roomNumber)
        if (taken) {
            showRoomTakenModal.value = true
            return
        }

        // ── Step 2: Register user via /api/auth/local/register ──
        const registerRes = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: form.value.username,
                email: form.value.email,
                password: form.value.password,
            }),
        })
        const registerData = await registerRes.json()
        if (!registerRes.ok) {
            modalErrorMessage.value = registerData?.error?.message || t.value.residentRegisterError
            showErrorModal.value = true
            return
        }

        const newUserId: number = registerData.user?.id
        if (!newUserId) throw new Error('No user id returned')

        // ── Step 3: Update user with role=4 (Resident) and resident fields ──
        const updateRes = await fetch(`${STRAPI_URL}/api/users/${newUserId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                role: 4,
                property: Number(form.value.propertyId),
                unitType: Number(form.value.unitTypeId),
                roomNumber: form.value.roomNumber,
                registrationDate: form.value.registrationDate,
                residencyStatus: form.value.residencyStatus,
                nextBillDate: form.value.nextBillDate || null,
            }),
        })
        if (!updateRes.ok) {
            const updateData = await updateRes.json()
            modalErrorMessage.value = updateData?.error?.message || 'Failed to update resident details'
            showErrorModal.value = true
            return
        }

        // ── Step 4: Create lease record ──
        const leaseRes = await fetch(`${STRAPI_URL}/api/leases`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    leaseNo: form.value.leaseNo,
                    status: 'pending',
                    startDate: form.value.leaseStartDate,
                    endDate: form.value.leaseEndDate,
                    monthlyRent: Number(form.value.monthlyRent),
                    depositAmount: form.value.depositAmount ? Number(form.value.depositAmount) : null,
                    currency: form.value.currency || 'THB',
                    terms: form.value.terms || null,
                    notes: form.value.notes || null,
                    resident: newUserId,
                    property: Number(form.value.propertyId),
                    unitType: Number(form.value.unitTypeId),
                },
            }),
        })
        if (!leaseRes.ok) {
            const leaseData = await leaseRes.json()
            // Resident created — warn but don't block navigation
            showToast('error', t.value.leaseCreatedError + ': ' + (leaseData?.error?.message ?? 'Unknown error'))
        }

        // ── Step 5: Success ──
        showToast('success', t.value.residentRegistered)
        setTimeout(() => router.push('/manager/residents'), 1800)
    } catch (e: any) {
        modalErrorMessage.value = (e as any)?.message || t.value.residentRegisterError
        showErrorModal.value = true
    } finally {
        isSubmitting.value = false
    }
}

// ─── WYSIWYG paste handler ───────────────────────────────────────────────────
function handleTermsPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    // Convert newlines to <br> and insert as HTML nodes
    const fragment = document.createDocumentFragment()
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
        if (i > 0) fragment.appendChild(document.createElement('br'))
        if (line) fragment.appendChild(document.createTextNode(line))
    })
    range.insertNode(fragment)
    // Move cursor to end of inserted content
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    form.value.terms = (termsEditor.value as HTMLElement).innerHTML
}

onMounted(fetchProperties)
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
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.registerResident }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.registerResidentSubtitle }}</p>
                </div>
            </div>
        </Transition>

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
                        <input v-model="form.username" type="text" :placeholder="t.residentNamePlaceholder"
                            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                            :class="errors.username ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                        <p v-if="errors.username" class="mt-1 text-xs text-red-500">{{ errors.username }}</p>
                    </div>

                    <!-- Email -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {{ t.residentEmail }} <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <input v-model="form.email" type="email" :placeholder="t.residentEmailPlaceholder"
                                class="w-full pl-3 pr-10 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                :class="errors.email ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            <button type="button" @click="copyToClipboard(form.email, 'email')" :disabled="!form.email"
                                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                                title="Copy email">
                                <i :class="copiedField === 'email' ? 'ti-check text-emerald-500' : 'ti-files'"
                                    class="text-sm"></i>
                            </button>
                        </div>
                        <p v-if="errors.email" class="mt-1 text-xs text-red-500">{{ errors.email }}</p>
                    </div>

                    <!-- Password -->
                    <div>
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {{ t.residentPassword }} <span class="text-red-500">*</span>
                            </label>
                            <button type="button" @click="generatePassword"
                                class="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                                <i class="ti-reload text-xs"></i>
                                Auto-generate
                            </button>
                        </div>
                        <div class="relative">
                            <input v-model="form.password" :type="showPassword ? 'text' : 'password'"
                                :placeholder="t.residentPasswordPlaceholder"
                                class="w-full pl-3 pr-20 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                :class="errors.password ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button type="button" @click="copyToClipboard(form.password, 'password')"
                                    :disabled="!form.password"
                                    class="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                                    title="Copy password">
                                    <i :class="copiedField === 'password' ? 'ti-check text-emerald-500' : 'ti-files'"
                                        class="text-sm"></i>
                                </button>
                                <button type="button" @click="showPassword = !showPassword"
                                    class="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                    :title="showPassword ? 'Hide password' : 'Show password'">
                                    <i :class="showPassword ? 'ti-lock' : 'ti-eye'" class="text-sm"></i>
                                </button>
                            </div>
                        </div>
                        <p v-if="errors.password" class="mt-1 text-xs text-red-500">{{ errors.password }}</p>
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

                    <!-- Property Select -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {{ t.property }} <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <select v-model="form.propertyId" :disabled="isLoadingProperties"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors appearance-none"
                                :class="errors.propertyId ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'">
                                <option value="">{{ isLoadingProperties ? 'Loading...' : t.selectProperty }}</option>
                                <option v-for="p in properties" :key="p.id" :value="String(p.id)">
                                    {{ p.name }}{{ p.city ? ' · ' + p.city : '' }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                        <p v-if="errors.propertyId" class="mt-1 text-xs text-red-500">{{ errors.propertyId }}</p>
                    </div>

                    <!-- Unit Type Select -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {{ t.unitTypeLabel }} <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <select v-model="form.unitTypeId"
                                :disabled="!form.propertyId || isLoadingUnitTypes || unitTypes.length === 0"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors appearance-none disabled:opacity-50"
                                :class="errors.unitTypeId ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'">
                                <option value="">{{ unitTypePlaceholder }}</option>
                                <option v-for="ut in unitTypes" :key="ut.id" :value="String(ut.id)"
                                    :disabled="(ut.occupiedCount ?? 0) >= ut.quantity">
                                    {{ unitTypeOptionLabel(ut) }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                        <p v-if="errors.unitTypeId" class="mt-1 text-xs text-red-500">{{ errors.unitTypeId }}</p>

                        <!-- Unit type info card -->
                        <div v-if="selectedUnitType"
                            class="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.availableSlots }}</span>
                                <span
                                    :class="isUnitFull ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'">
                                    {{ availableSlots }} / {{ selectedUnitType.quantity }}
                                </span>
                            </div>
                            <div v-if="selectedUnitType.price" class="flex items-center justify-between">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.unitPrice }}</span>
                                <span class="text-gray-700 dark:text-gray-300">
                                    {{ selectedUnitType.currency }} {{ selectedUnitType.price.toLocaleString('en-US') }}
                                </span>
                            </div>
                            <div v-if="isUnitFull"
                                class="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                                <i class="ti-alert-circle"></i>
                                {{ t.unitFull }}
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
                        <p v-if="errors.registrationDate" class="mt-1 text-xs text-red-500">{{ errors.registrationDate
                            }}
                        </p>
                    </div>

                    <!-- Residency Status -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {{ t.residencyStatus }} <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <select v-model="form.residencyStatus"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors appearance-none">
                                <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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
                        <i class="ti-receipt text-primary-600 dark:text-primary-400"></i>
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
                                    <i class="ti-reload text-sm"></i>
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
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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
                            <p v-if="errors.leaseStartDate" class="mt-1 text-xs text-red-500">{{ errors.leaseStartDate
                            }}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.leaseEndDate }} <span class="text-red-500">*</span>
                            </label>
                            <input v-model="form.leaseEndDate" type="date"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                :class="errors.leaseEndDate ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'"
                                @click="($event.target as HTMLInputElement).showPicker?.()" />
                            <p v-if="errors.leaseEndDate" class="mt-1 text-xs text-red-500">{{ errors.leaseEndDate }}
                            </p>
                        </div>
                    </div>

                    <!-- Quick Duration Buttons -->
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">Quick duration:</span>
                        <button type="button" @click="() => {
                            if (!form.leaseStartDate) {
                                form.leaseStartDate = new Date().toISOString().split('T')[0]
                            }
                            const start = new Date(form.leaseStartDate)
                            const end = new Date(start)
                            end.setMonth(end.getMonth() + 3)
                            form.leaseEndDate = end.toISOString().split('T')[0]
                        }"
                            class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-300 dark:hover:border-primary-600 rounded-lg transition-colors">
                            3 Months
                        </button>
                        <button type="button" @click="() => {
                            if (!form.leaseStartDate) {
                                form.leaseStartDate = new Date().toISOString().split('T')[0]
                            }
                            const start = new Date(form.leaseStartDate)
                            const end = new Date(start)
                            end.setMonth(end.getMonth() + 6)
                            form.leaseEndDate = end.toISOString().split('T')[0]
                        }"
                            class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-300 dark:hover:border-primary-600 rounded-lg transition-colors">
                            6 Months
                        </button>
                        <button type="button" @click="() => {
                            if (!form.leaseStartDate) {
                                form.leaseStartDate = new Date().toISOString().split('T')[0]
                            }
                            const start = new Date(form.leaseStartDate)
                            const end = new Date(start)
                            end.setFullYear(end.getFullYear() + 1)
                            form.leaseEndDate = end.toISOString().split('T')[0]
                        }"
                            class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-300 dark:hover:border-primary-600 rounded-lg transition-colors">
                            1 Year
                        </button>
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
                                <input v-model="form.monthlyRent" type="number" min="0" step="0.01" placeholder="0.00"
                                    class="w-full pl-12 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                                    :class="errors.monthlyRent ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            </div>
                            <p v-if="errors.monthlyRent" class="mt-1 text-xs text-red-500">{{ errors.monthlyRent }}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.leaseDepositAmount }}
                            </label>
                            <div class="relative">
                                <span
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">{{
                                        form.currency }}</span>
                                <input v-model="form.depositAmount" type="number" min="0" step="0.01" placeholder="0.00"
                                    class="w-full pl-12 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <!-- Lease duration summary -->
                    <div v-if="form.leaseStartDate && form.leaseEndDate && form.leaseEndDate > form.leaseStartDate"
                        class="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg text-xs text-primary-700 dark:text-primary-300">
                        <i class="ti-calendar shrink-0"></i>
                        <span>{{ t.leaseDuration }}:
                            <strong>{{
                                (() => {
                                    const s = new Date(form.leaseStartDate)
                                    const e = new Date(form.leaseEndDate)
                                    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
                                    return months > 0
                                        ? months + ' ' + (months !== 1 ? t.leaseDurationMonthsPlural : t.leaseDurationMonths)
                                        : Math.round((e.getTime() - s.getTime()) / 86400000) + ' ' + t.leaseDurationDays
                                })()
                            }}</strong>
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
                                <i :class="termsExpanded ? 'ti-arrows-corner' : 'ti-fullscreen'" class="text-xs"></i>
                                {{ termsExpanded ? t.leaseTermsCollapse : t.leaseTermsExpand }}
                            </button>
                        </div>
                        <!-- Toolbar -->
                        <div
                            class="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 rounded-t-lg">
                            <button type="button" @mousedown.prevent="execCmd('bold')" title="Bold"
                                class="font-bold text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">B</button>
                            <button type="button" @mousedown.prevent="execCmd('italic')" title="Italic"
                                class="italic text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">I</button>
                            <button type="button" @mousedown.prevent="execCmd('underline')" title="Underline"
                                class="underline text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">U</button>
                            <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                            <button type="button" @mousedown.prevent="execCmd('insertUnorderedList')"
                                title="Bullet list"
                                class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                <i class="ti-list text-xs"></i>
                            </button>
                            <button type="button" @mousedown.prevent="execCmd('insertOrderedList')"
                                title="Numbered list"
                                class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor"
                                    stroke-width="1.8">
                                    <line x1="6" y1="4" x2="14" y2="4" />
                                    <line x1="6" y1="8" x2="14" y2="8" />
                                    <line x1="6" y1="12" x2="14" y2="12" /><text x="1" y="5" font-size="4"
                                        fill="currentColor" stroke="none">1.</text><text x="1" y="9" font-size="4"
                                        fill="currentColor" stroke="none">2.</text><text x="1" y="13" font-size="4"
                                        fill="currentColor" stroke="none">3.</text>
                                </svg>
                            </button>
                            <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                            <button type="button" @mousedown.prevent="execCmd('formatBlock', 'h3')" title="Heading"
                                class="text-xs font-bold w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">H3</button>
                            <button type="button" @mousedown.prevent="execCmd('formatBlock', 'p')" title="Paragraph"
                                class="text-xs w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">¶</button>
                            <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                            <button type="button" @mousedown.prevent="clearTerms" :title="t.leaseTermsClear"
                                class="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-gray-400 hover:text-red-500">
                                <i class="ti-trash text-xs"></i>
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
                            <i class="ti-info-alt"></i>
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

                    <!-- Status hint -->
                    <div class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <i class="ti-info-alt mt-0.5 shrink-0 text-primary-500"></i>
                        {{ t.leaseStatusHint }} <span class="font-semibold text-amber-600 dark:text-amber-400 mx-1">{{
                            t.leaseStatusPending }}</span> {{ t.leaseStatusHint2 }}
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
                            class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <i v-else class="ti-user-add text-base"></i>
                        {{ isSubmitting ? t.registering : t.registerResident }}
                    </button>
                </div>
            </Transition>
        </form>

        <!-- ── Room Already Taken Modal ── -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showRoomTakenModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100">
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
                                            form.roomNumber }}</span> is already assigned to another resident in this
                                        property.
                                    </p>
                                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Please use a different room
                                        number.</p>
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

        <!-- ── Error Modal ── -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showErrorModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100">
                        <div v-if="showErrorModal"
                            class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                            <div class="flex flex-col items-center text-center gap-3">
                                <div
                                    class="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                                    <i class="ti-alert-circle text-2xl text-red-600 dark:text-red-400"></i>
                                </div>
                                <div>
                                    <h3 class="text-base font-semibold text-gray-900 dark:text-white">Registration
                                        Failed</h3>
                                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ modalErrorMessage }}</p>
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
    </div>
</template>
