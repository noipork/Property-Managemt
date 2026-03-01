<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const invoiceId = route.params.id as string

// ─── Form state ───────────────────────────────────────────────────────────────
const form = ref({
    documentId: '',
    invoiceNo: '',
    type: 'monthlyRent',
    description: '',
    amount: 0,
    currency: 'THB',
    dueDate: '',
    status: 'pending',
    notes: '',
    paidDate: '',
    paidAmount: 0,
    unitTypePrice: 0,
    electricMeterStart: 0,
    electricMeterEnd: 0,
    electricUnitPrice: 0,
    waterMeterStart: 0,
    waterMeterEnd: 0,
    waterUnitPrice: 0,
    propertyDocumentId: '',
    residentId: '',
})

const isSubmitting = ref(false)
const isLoading = ref(true)
const errors = ref<Record<string, string>>({})

// ─── Properties & Residents ──────────────────────────────────────────────────
interface Property { id: number; documentId: string; name: string; city: string }
interface Resident { id: number; username: string; email: string; roomNumber: string | null; unitType: { price: number | null } | null }

const propertiesList = ref<Property[]>([])
const residentsList = ref<Resident[]>([])

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
            'populate[0]': 'unitType',
            'pagination[pageSize]': '500',
        })
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        residentsList.value = (Array.isArray(data) ? data : data.data ?? []).map((r: any) => ({
            id: r.id, username: r.username, email: r.email, roomNumber: r.roomNumber,
            unitType: r.unitType ?? null,
        }))
    } catch { /* ignore */ }
}

watch(() => form.value.propertyDocumentId, (_, old) => {
    if (old) form.value.residentId = ''
    fetchResidents()
})

// ─── Computed amounts ─────────────────────────────────────────────────────────
const electricUnitsUsed = computed(() => Math.max(0, form.value.electricMeterEnd - form.value.electricMeterStart))
const electricAmount = computed(() => electricUnitsUsed.value * form.value.electricUnitPrice)
const waterUnitsUsed = computed(() => Math.max(0, form.value.waterMeterEnd - form.value.waterMeterStart))
const waterAmount = computed(() => waterUnitsUsed.value * form.value.waterUnitPrice)
const totalAmount = computed(() => (form.value.unitTypePrice || 0) + electricAmount.value + waterAmount.value)
watch(totalAmount, (val) => { form.value.amount = val })

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }, 4000)
}
function dismissToast(id: number) { const i = toasts.value.findIndex(t => t.id === id); if (i !== -1) toasts.value.splice(i, 1) }

// ─── Load existing invoice ────────────────────────────────────────────────────
async function fetchInvoice() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?filters[id][$eq]=${invoiceId}&${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        const inv = data.data?.[0]
        if (!inv) throw new Error('Not found')

        form.value.documentId = inv.documentId
        form.value.invoiceNo = inv.invoiceNo
        form.value.type = inv.type
        form.value.description = inv.description
        form.value.amount = inv.amount
        form.value.currency = inv.currency
        form.value.dueDate = inv.dueDate
        form.value.status = inv.status
        form.value.notes = inv.notes || ''
        form.value.paidDate = inv.paidDate || ''
        form.value.paidAmount = inv.paidAmount || 0
        form.value.unitTypePrice = inv.unitTypePrice || 0
        form.value.electricMeterStart = inv.electricMeterStart || 0
        form.value.electricMeterEnd = inv.electricMeterEnd || 0
        form.value.electricUnitPrice = inv.electricUnitPrice || 0
        form.value.waterMeterStart = inv.waterMeterStart || 0
        form.value.waterMeterEnd = inv.waterMeterEnd || 0
        form.value.waterUnitPrice = inv.waterUnitPrice || 0

        if (inv.property) {
            form.value.propertyDocumentId = inv.property.documentId
            await fetchResidents()
        }
        if (inv.resident) {
            form.value.residentId = String(inv.resident.id)
        }
    } catch {
        showToast('error', 'Failed to load invoice')
    } finally {
        isLoading.value = false
    }
}

// ─── Validation & Submit ──────────────────────────────────────────────────────
function validate() {
    errors.value = {}
    if (!form.value.propertyDocumentId) errors.value.property = t.value.validationPropertyRequired
    if (!form.value.residentId) errors.value.resident = t.value.selectResident
    if (!form.value.description.trim()) errors.value.description = 'Description is required'
    if (!form.value.dueDate) errors.value.dueDate = t.value.validationDateRequired
    if (form.value.amount <= 0) errors.value.amount = 'Amount must be greater than 0'
    return Object.keys(errors.value).length === 0
}

async function submitForm() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        const body = {
            data: {
                type: form.value.type,
                description: form.value.description,
                amount: form.value.amount,
                currency: form.value.currency,
                dueDate: form.value.dueDate,
                status: form.value.status,
                notes: form.value.notes || null,
                paidDate: form.value.paidDate || null,
                paidAmount: form.value.paidAmount || null,
                unitTypePrice: form.value.unitTypePrice,
                electricMeterStart: form.value.electricMeterStart,
                electricMeterEnd: form.value.electricMeterEnd,
                electricUnitPrice: form.value.electricUnitPrice,
                electricUnitsUsed: electricUnitsUsed.value,
                electricAmount: electricAmount.value,
                waterMeterStart: form.value.waterMeterStart,
                waterMeterEnd: form.value.waterMeterEnd,
                waterUnitPrice: form.value.waterUnitPrice,
                waterUnitsUsed: waterUnitsUsed.value,
                waterAmount: waterAmount.value,
                resident: Number(form.value.residentId),
                property: form.value.propertyDocumentId,
            }
        }
        const res = await fetch(`${STRAPI_URL}/api/billings/${form.value.documentId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Update failed')
        showToast('success', t.value.invoiceUpdated)
        setTimeout(() => router.push(`/invoices/${invoiceId}`), 800)
    } catch {
        showToast('error', t.value.invoiceUpdateError)
    } finally {
        isSubmitting.value = false
    }
}

const invoiceTypes = ['monthlyRent', 'utilities', 'maintenance', 'deposit', 'lateFee', 'other']
const invoiceStatuses = ['pending', 'paid', 'overdue', 'partiallyPaid', 'cancelled']
const typeLabels = computed(() => ({
    monthlyRent: t.value.monthlyRent, utilities: t.value.utilities, maintenance: t.value.maintenance,
    deposit: t.value.deposit, lateFee: t.value.lateFee, other: t.value.other,
}))
const statusLabels = computed(() => ({
    pending: t.value.pending, paid: t.value.paid, overdue: t.value.overdue,
    partiallyPaid: t.value.partiallyPaid, cancelled: t.value.cancelled,
}))

function formatCurrency(amount: number, currency = 'THB') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const sectionsVisible = ref(false)

onMounted(async () => {
    await fetchProperties()
    await fetchInvoice()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        sectionsVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 max-w-3xl mx-auto">
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
                        :class="toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'">
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
            <!-- Header -->
            <div class="flex items-center gap-3 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <NuxtLink :to="`/invoices/${invoiceId}`"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                </NuxtLink>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.editInvoice }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ form.invoiceNo }}</p>
                </div>
            </div>

            <!-- Form -->
            <form @submit.prevent="submitForm" class="space-y-6">
                <!-- Property & Resident -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                        t.invoiceResident }} & {{ t.invoiceProperty }}</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.selectProperty }} *</label>
                            <select v-model="form.propertyDocumentId"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                :class="errors.property ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'">
                                <option value="" disabled>{{ t.selectProperty }}</option>
                                <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                                    {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                                </option>
                            </select>
                            <p v-if="errors.property" class="text-xs text-red-500 mt-1">{{ errors.property }}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.selectResident }} *</label>
                            <select v-model="form.residentId"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                :class="errors.resident ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'"
                                :disabled="residentsList.length === 0">
                                <option value="" disabled>{{ t.selectResident }}</option>
                                <option v-for="res in residentsList" :key="res.id" :value="String(res.id)">
                                    {{ res.username }}{{ res.roomNumber ? ' · ' + res.roomNumber : '' }}
                                </option>
                            </select>
                            <p v-if="errors.resident" class="text-xs text-red-500 mt-1">{{ errors.resident }}</p>
                        </div>
                    </div>
                </div>

                <!-- Invoice Details -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-75"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                        t.invoiceDetails }}</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.invoiceType }} *</label>
                            <select v-model="form.type"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                                <option v-for="tp in invoiceTypes" :key="tp" :value="tp">{{ typeLabels[tp as keyof
                                    typeof typeLabels] || tp }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.invoiceStatus }} *</label>
                            <select v-model="form.status"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                                <option v-for="s in invoiceStatuses" :key="s" :value="s">{{ statusLabels[s as keyof
                                    typeof statusLabels] || s }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.dueDate
                            }} *</label>
                            <input v-model="form.dueDate" type="date"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark]"
                                :class="errors.dueDate ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                            <p v-if="errors.dueDate" class="text-xs text-red-500 mt-1">{{ errors.dueDate }}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        v-if="form.status === 'paid' || form.status === 'partiallyPaid'">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.invoicePaidDate }}</label>
                            <input v-model="form.paidDate" type="date"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark]" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                                t.invoicePaidAmount }}</label>
                            <input v-model.number="form.paidAmount" type="number" step="0.01"
                                class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.description
                        }} *</label>
                        <input v-model="form.description" type="text" :placeholder="t.invoiceDescriptionPlaceholder"
                            class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            :class="errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                        <p v-if="errors.description" class="text-xs text-red-500 mt-1">{{ errors.description }}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.notes
                        }}</label>
                        <textarea v-model="form.notes" rows="2" :placeholder="t.invoiceNotesPlaceholder"
                            class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"></textarea>
                    </div>
                </div>

                <!-- Pricing -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-150"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                        t.totalAmount }}</h3>

                    <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.roomRent }}</span>
                        <div class="w-32">
                            <input v-model.number="form.unitTypePrice" type="number" step="0.01" min="0"
                                class="w-full px-3 py-1.5 text-sm text-right text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                    </div>

                    <!-- Electric -->
                    <div class="space-y-2 py-2 border-b border-gray-100 dark:border-gray-800">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.electricMeter }}</span>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label class="text-xs text-gray-500">{{ t.meterStart }}</label>
                                <input v-model.number="form.electricMeterStart" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">{{ t.meterEnd }}</label>
                                <input v-model.number="form.electricMeterEnd" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">{{ t.unit }} Price</label>
                                <input v-model.number="form.electricUnitPrice" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div class="flex flex-col justify-end">
                                <label class="text-xs text-gray-500">{{ t.total }}</label>
                                <p class="text-sm font-semibold text-gray-900 dark:text-white py-1.5">{{
                                    formatCurrency(electricAmount) }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Water -->
                    <div class="space-y-2 py-2 border-b border-gray-100 dark:border-gray-800">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.waterMeter }}</span>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label class="text-xs text-gray-500">{{ t.meterStart }}</label>
                                <input v-model.number="form.waterMeterStart" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">{{ t.meterEnd }}</label>
                                <input v-model.number="form.waterMeterEnd" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">{{ t.unit }} Price</label>
                                <input v-model.number="form.waterUnitPrice" type="number" step="0.01"
                                    class="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <div class="flex flex-col justify-end">
                                <label class="text-xs text-gray-500">{{ t.total }}</label>
                                <p class="text-sm font-semibold text-gray-900 dark:text-white py-1.5">{{
                                    formatCurrency(waterAmount) }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Grand Total -->
                    <div class="flex items-center justify-between pt-2">
                        <span class="text-base font-bold text-gray-900 dark:text-white">{{ t.totalAmount }}</span>
                        <span class="text-xl font-bold text-primary-600 dark:text-primary-400">{{
                            formatCurrency(totalAmount) }}</span>
                    </div>
                </div>

                <!-- Submit -->
                <div class="flex gap-3 justify-end transition-all duration-500 delay-200"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <NuxtLink :to="`/invoices/${invoiceId}`"
                        class="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        {{ t.cancel }}
                    </NuxtLink>
                    <button type="submit" :disabled="isSubmitting"
                        class="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors">
                        {{ isSubmitting ? t.updating : t.update }}
                    </button>
                </div>
            </form>
        </template>
    </div>
</template>
