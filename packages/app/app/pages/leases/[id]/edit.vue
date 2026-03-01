<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const router = useRouter()
const route = useRoute()
const leaseDocumentId = route.params.id as string

// ─── Form State ───────────────────────────────────────────────────────────────
const form = ref({
    leaseNo: '',
    status: 'pending',
    startDate: '',
    endDate: '',
    monthlyRent: '',
    depositAmount: '',
    currency: 'THB',
    terms: '',
    notes: '',
    propertyDocumentId: '',
    residentId: '',
    unitTypeId: '',
})

const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)
const isLoading = ref(true)

// ─── WYSIWYG ──────────────────────────────────────────────────────────────────
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

// ─── Properties / Residents / Unit Types ──────────────────────────────────────
interface Property { id: number; documentId: string; name: string; city: string }
interface Resident { id: number; username: string; email: string; roomNumber: string | null }
interface UnitType { id: number; documentId: string; name: string }

const propertiesList = ref<Property[]>([])
const residentsList = ref<Resident[]>([])
const unitTypesList = ref<UnitType[]>([])

async function fetchProperties() {
    try {
        const res = await fetch(`${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name&fields[1]=city`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({ id: p.id, documentId: p.documentId, name: p.name, city: p.city }))
    } catch { /* ignore */ }
}

async function fetchResidents() {
    residentsList.value = []
    if (!form.value.propertyDocumentId) return
    try {
        const params = new URLSearchParams({
            'filters[role][id][$eq]': '4',
            'filters[property][documentId][$eq]': form.value.propertyDocumentId,
            'pagination[pageSize]': '500',
        })
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        residentsList.value = (Array.isArray(data) ? data : data.data ?? []).map((r: any) => ({
            id: r.id, username: r.username, email: r.email, roomNumber: r.roomNumber,
        }))
    } catch { /* ignore */ }
}

async function fetchUnitTypes() {
    unitTypesList.value = []
    if (!form.value.propertyDocumentId) return
    try {
        const params = new URLSearchParams({
            'filters[property][documentId][$eq]': form.value.propertyDocumentId,
            'pagination[pageSize]': '100',
            'fields[0]': 'name',
        })
        const res = await fetch(`${STRAPI_URL}/api/unit-types?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        unitTypesList.value = (data.data ?? []).map((ut: any) => ({ id: ut.id, documentId: ut.documentId, name: ut.name }))
    } catch { /* ignore */ }
}

let skipPropertyWatch = true
watch(() => form.value.propertyDocumentId, (_, old) => {
    if (skipPropertyWatch) { skipPropertyWatch = false; return }
    if (old) {
        form.value.residentId = ''
        form.value.unitTypeId = ''
    }
    fetchResidents()
    fetchUnitTypes()
})

// ─── Fetch Lease ──────────────────────────────────────────────────────────────
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
        const lease = data.data
        if (!lease) throw new Error('Not found')

        form.value.leaseNo = lease.leaseNo ?? ''
        form.value.status = lease.status ?? 'pending'
        form.value.startDate = lease.startDate ?? ''
        form.value.endDate = lease.endDate ?? ''
        form.value.monthlyRent = lease.monthlyRent != null ? String(lease.monthlyRent) : ''
        form.value.depositAmount = lease.depositAmount != null ? String(lease.depositAmount) : ''
        form.value.currency = lease.currency || 'THB'
        form.value.terms = lease.terms ?? ''
        form.value.notes = lease.notes ?? ''

        // Set property
        if (lease.property) {
            form.value.propertyDocumentId = lease.property.documentId
            await fetchResidents()
            await fetchUnitTypes()
        }
        // Set resident
        if (lease.resident) form.value.residentId = String(lease.resident.id)
        // Set unitType
        if (lease.unitType) form.value.unitTypeId = String(lease.unitType.id)

    } catch {
        showToast('error', t.value.leaseLoadError)
    } finally {
        isLoading.value = false
        // Restore terms HTML after loading spinner is removed and editor DOM is rendered
        await nextTick()
        if (form.value.terms && termsEditor.value) {
            termsEditor.value.innerHTML = form.value.terms
        }
    }
}

// ─── Lease Duration ───────────────────────────────────────────────────────────
const leaseDurationLabel = computed(() => {
    if (!form.value.startDate || !form.value.endDate) return ''
    const s = new Date(form.value.startDate)
    const e = new Date(form.value.endDate)
    if (e <= s) return ''
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months >= 1) return `${months} ${months === 1 ? t.value.leaseDurationMonths : t.value.leaseDurationMonthsPlural}`
    const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} ${t.value.leaseDurationDays}`
})

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

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(): boolean {
    errors.value = {}
    if (!form.value.leaseNo.trim()) errors.value.leaseNo = t.value.leaseValidationNo
    if (!form.value.propertyDocumentId) errors.value.propertyDocumentId = t.value.validationPropertyRequired
    if (!form.value.residentId) errors.value.residentId = t.value.leaseResidentRequired
    if (!form.value.startDate) errors.value.startDate = t.value.leaseValidationStart
    if (!form.value.endDate) errors.value.endDate = t.value.leaseValidationEnd
    if (form.value.startDate && form.value.endDate && form.value.endDate <= form.value.startDate)
        errors.value.endDate = t.value.leaseValidationEndAfterStart
    if (!form.value.monthlyRent || Number(form.value.monthlyRent) <= 0)
        errors.value.monthlyRent = t.value.leaseValidationRent
    return Object.keys(errors.value).length === 0
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        const body: any = {
            data: {
                leaseNo: form.value.leaseNo.trim(),
                status: form.value.status,
                startDate: form.value.startDate,
                endDate: form.value.endDate,
                monthlyRent: Number(form.value.monthlyRent),
                depositAmount: form.value.depositAmount ? Number(form.value.depositAmount) : null,
                currency: form.value.currency,
                terms: form.value.terms || null,
                notes: form.value.notes.trim() || null,
                resident: Number(form.value.residentId),
                property: form.value.propertyDocumentId || null,
                unitType: form.value.unitTypeId ? unitTypesList.value.find(u => String(u.id) === form.value.unitTypeId)?.documentId ?? null : null,
            },
        }

        const res = await fetch(`${STRAPI_URL}/api/leases/${leaseDocumentId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const errData = await res.json().catch(() => null)
            throw new Error(errData?.error?.message || 'Failed to update lease')
        }
        showToast('success', t.value.leaseUpdated)
        setTimeout(() => router.push(`/leases/${leaseDocumentId}`), 800)
    } catch (err: any) {
        showToast('error', err.message || t.value.leaseUpdateError)
    } finally {
        isSubmitting.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const sectionsVisible = ref(false)

onMounted(async () => {
    await fetchProperties()
    skipPropertyWatch = true
    await fetchLease()
    skipPropertyWatch = false
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sectionsVisible.value = true
    }))
})
</script>

<template>
    <div class="max-w-3xl mx-auto space-y-6">
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
                        <i :class="toast.type === 'success' ? 'ti-check-box text-emerald-500' : 'ti-alert-circle text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="ti-close text-xs"></i></button>
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

        <template v-else>
            <!-- Page Header -->
            <div class="flex items-center gap-3 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <NuxtLink :to="`/leases/${leaseDocumentId}`"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                </NuxtLink>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.editLease }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ form.leaseNo }}</p>
                </div>
            </div>

            <!-- Property & Resident Selection -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-100"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="ti-link text-primary-500"></i> {{ t.leaseAssignment }}
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Property -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.property }}
                            *</label>
                        <div class="relative">
                            <select v-model="form.propertyDocumentId"
                                class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
                                :class="errors.propertyDocumentId ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'">
                                <option value="">{{ t.selectProperty }}</option>
                                <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                                    {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                        <p v-if="errors.propertyDocumentId" class="text-xs text-red-500 mt-1">{{
                            errors.propertyDocumentId }}</p>
                    </div>
                    <!-- Resident -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.residentInfo
                        }} *</label>
                        <div class="relative">
                            <select v-model="form.residentId" :disabled="residentsList.length === 0"
                                class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none disabled:opacity-40"
                                :class="errors.residentId ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'">
                                <option value="">{{ t.selectResident }}</option>
                                <option v-for="res in residentsList" :key="res.id" :value="String(res.id)">
                                    {{ res.username }} {{ res.roomNumber ? '· Room ' + res.roomNumber : '' }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                        <p v-if="errors.residentId" class="text-xs text-red-500 mt-1">{{ errors.residentId }}</p>
                    </div>
                    <!-- Unit Type -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                            t.unitTypeLabel }}</label>
                        <div class="relative">
                            <select v-model="form.unitTypeId" :disabled="unitTypesList.length === 0"
                                class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none disabled:opacity-40">
                                <option value="">{{ t.selectUnitType }}</option>
                                <option v-for="ut in unitTypesList" :key="ut.id" :value="String(ut.id)">{{ ut.name }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                    <!-- Status -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.status
                        }}</label>
                        <div class="relative">
                            <select v-model="form.status"
                                class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option value="pending">{{ t.pending }}</option>
                                <option value="active">{{ t.active }}</option>
                                <option value="expired">{{ t.statusExpired }}</option>
                                <option value="terminated">{{ t.leaseTerminated }}</option>
                                <option value="cancelled">{{ t.cancelled }}</option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Lease Details -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-150"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="ti-file text-primary-500"></i> {{ t.leaseDetails }}
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Lease No -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.leaseNo }}
                            *</label>
                        <input v-model="form.leaseNo" type="text" :placeholder="t.leaseNoPlaceholder"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                            :class="errors.leaseNo ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'" />
                        <p v-if="errors.leaseNo" class="text-xs text-red-500 mt-1">{{ errors.leaseNo }}</p>
                    </div>
                    <!-- Currency -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                            t.leaseCurrency }}</label>
                        <div class="relative">
                            <select v-model="form.currency"
                                class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option value="THB">THB (฿)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>
                    <!-- Start Date -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                            t.leaseStartDate }} *</label>
                        <input v-model="form.startDate" type="date"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                            :class="errors.startDate ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'"
                            @click="($event.target as HTMLInputElement).showPicker?.()" />
                        <p v-if="errors.startDate" class="text-xs text-red-500 mt-1">{{ errors.startDate }}</p>
                    </div>
                    <!-- End Date -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.leaseEndDate
                        }} *</label>
                        <input v-model="form.endDate" type="date"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                            :class="errors.endDate ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'"
                            @click="($event.target as HTMLInputElement).showPicker?.()" />
                        <p v-if="errors.endDate" class="text-xs text-red-500 mt-1">{{ errors.endDate }}</p>
                    </div>
                    <!-- Monthly Rent -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                            t.leaseMonthlyRent }} *</label>
                        <input v-model="form.monthlyRent" type="number" min="0" step="0.01" placeholder="0.00"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            :class="errors.monthlyRent ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'" />
                        <p v-if="errors.monthlyRent" class="text-xs text-red-500 mt-1">{{ errors.monthlyRent }}</p>
                    </div>
                    <!-- Deposit Amount -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                            t.leaseDepositAmount }}</label>
                        <input v-model="form.depositAmount" type="number" min="0" step="0.01" placeholder="0.00"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                </div>
                <!-- Duration badge -->
                <div v-if="leaseDurationLabel" class="flex items-center gap-2">
                    <span
                        class="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg text-xs font-semibold">
                        <i class="ti-calendar text-xs"></i>
                        {{ t.leaseDuration }}: {{ leaseDurationLabel }}
                    </span>
                </div>
            </div>

            <!-- Terms & Notes -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-200"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="ti-receipt text-primary-500"></i> {{ t.leaseTerms }}
                </h3>

                <!-- WYSIWYG Toolbar -->
                <div
                    class="flex flex-wrap items-center gap-1 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button @mousedown.prevent="execCmd('bold')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-bold"
                        title="Bold">B</button>
                    <button @mousedown.prevent="execCmd('italic')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs italic"
                        title="Italic">I</button>
                    <button @mousedown.prevent="execCmd('underline')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs underline"
                        title="Underline">U</button>
                    <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                    <button @mousedown.prevent="execCmd('insertUnorderedList')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Bullet List"><i class="ti-list text-xs"></i></button>
                    <button @mousedown.prevent="execCmd('insertOrderedList')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Numbered List"><i class="ti-list-ol text-xs"></i></button>
                    <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                    <button @mousedown.prevent="execCmd('formatBlock', 'h3')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-bold"
                        title="Heading">H3</button>
                    <button @mousedown.prevent="execCmd('formatBlock', 'p')" type="button"
                        class="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs"
                        title="Paragraph">¶</button>
                    <div class="flex-1"></div>
                    <button @mousedown.prevent="clearTerms" type="button"
                        class="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-xs"
                        :title="t.leaseTermsClear">
                        <i class="ti-trash text-xs"></i>
                    </button>
                    <button @mousedown.prevent="termsExpanded = !termsExpanded" type="button"
                        class="p-1.5 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs">
                        {{ termsExpanded ? t.leaseTermsCollapse : t.leaseTermsExpand }}
                    </button>
                    <span class="text-[10px] text-gray-400 px-1">{{ (form.terms || '').replace(/<[^>]*>/g, '').length
                    }}</span>
                </div>

                <!-- Editor -->
                <div ref="termsEditor" contenteditable="true"
                    @input="form.terms = ($event.target as HTMLElement).innerHTML" @paste="handleTermsPaste"
                    :data-placeholder="t.leaseTermsPlaceholder"
                    class="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 overflow-y-auto transition-all duration-300
                        [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1
                        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
                        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
                        [&_li]:mb-0.5
                        empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none"
                    :class="termsExpanded ? 'min-h-[32rem]' : 'min-h-48 max-h-96'">
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500">{{ t.leaseTermsHint }}</p>

                <!-- Notes -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.leaseNotes
                    }}</label>
                    <textarea v-model="form.notes" :placeholder="t.leaseNotesPlaceholder" rows="3"
                        class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                </div>
            </div>

            <!-- Submit -->
            <div class="flex items-center justify-end gap-3 transition-all duration-500 delay-300"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <NuxtLink :to="`/leases/${leaseDocumentId}`"
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    {{ t.cancel }}
                </NuxtLink>
                <button @click="submit" :disabled="isSubmitting"
                    class="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                    <i v-if="isSubmitting" class="ti-reload text-xs animate-spin"></i>
                    <i v-else class="ti-check text-xs"></i>
                    {{ isSubmitting ? t.updating : t.updateLease }}
                </button>
            </div>
        </template>
    </div>
</template>
