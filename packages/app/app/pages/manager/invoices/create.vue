<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Form state ───────────────────────────────────────────────────────────────
const form = ref({
    type: 'monthlyRent',
    description: '',
    amount: 0,
    currency: 'THB',
    dueDate: '',
    status: 'pending',
    notes: '',
    unitTypePrice: 0,
    electricMeterStart: 0,
    electricMeterEnd: 0,
    electricUnitPrice: 0,
    waterMeterStart: 0,
    waterMeterEnd: 0,
    waterUnitPrice: 0,
    commonAreaFee: 0,
    propertyDocumentId: '',
    residentId: '',
})

const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})

// ─── Properties & Residents ──────────────────────────────────────────────────
interface Property { id: number; documentId: string; name: string; city: string }
interface Resident { id: number; username: string; email: string; roomNumber: string | null; unitType: { price: number | null } | null }
interface PropertyBillingConfig {
    id: number
    documentId: string
    name: string
    electricPricePerUnit: number | null
    waterPricePerUnit: number | null
    commonAreaFee: number | null
    invoiceDueDays: number | null
}

const propertiesList = ref<Property[]>([])
const residentsList = ref<Resident[]>([])
const propertyConfig = ref<PropertyBillingConfig | null>(null)

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
        const res = await fetch(`${STRAPI_URL}/api/properties?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({ id: p.id, documentId: p.documentId, name: p.name, city: p.city }))
    } catch { /* ignore */ }
}

async function fetchPropertyConfig(documentId: string) {
    try {
        const res = await fetch(`${STRAPI_URL}/api/properties/${documentId}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        propertyConfig.value = data.data ?? null
        const cfg = propertyConfig.value
        if (cfg) {
            if (cfg.electricPricePerUnit) form.value.electricUnitPrice = cfg.electricPricePerUnit
            if (cfg.waterPricePerUnit) form.value.waterUnitPrice = cfg.waterPricePerUnit
            form.value.commonAreaFee = cfg.commonAreaFee ?? 0
            if (cfg.invoiceDueDays && cfg.invoiceDueDays > 0) {
                const d = new Date()
                d.setDate(d.getDate() + cfg.invoiceDueDays)
                form.value.dueDate = d.toISOString().split('T')[0]
            } else if (!form.value.dueDate) {
                const now = new Date()
                const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                form.value.dueDate = eom.toISOString().split('T')[0]
            }
        }
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

// Auto-fill unit price when resident changes
watch(() => form.value.residentId, (newVal) => {
    if (newVal) {
        const res = residentsList.value.find(r => String(r.id) === newVal)
        if (res?.unitType?.price) {
            form.value.unitTypePrice = res.unitType.price
        }
    }
})

// Fetch last meter readings
const lastBilling = ref<any>(null)
watch(() => form.value.residentId, async (newVal) => {
    if (!newVal) return
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': newVal,
            'sort[0]': 'dueDate:desc',
            'pagination[pageSize]': '1',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        const last = data.data?.[0]
        if (last) {
            lastBilling.value = last
            form.value.electricMeterStart = last.electricMeterEnd || 0
            form.value.waterMeterStart = last.waterMeterEnd || 0
            form.value.electricUnitPrice = last.electricUnitPrice || 0
            form.value.waterUnitPrice = last.waterUnitPrice || 0
        }
    } catch { /* ignore */ }
})

watch(() => form.value.propertyDocumentId, (newVal) => {
    form.value.residentId = ''
    propertyConfig.value = null
    fetchResidents()
    if (newVal) fetchPropertyConfig(newVal)
})

// ─── Computed amounts ─────────────────────────────────────────────────────────
const electricUnitsUsed = computed(() => Math.max(0, form.value.electricMeterEnd - form.value.electricMeterStart))
const electricAmount = computed(() => electricUnitsUsed.value * form.value.electricUnitPrice)
const waterUnitsUsed = computed(() => Math.max(0, form.value.waterMeterEnd - form.value.waterMeterStart))
const waterAmount = computed(() => waterUnitsUsed.value * form.value.waterUnitPrice)
const commonAreaFeeAmount = computed(() => form.value.commonAreaFee || 0)
const totalAmount = computed(() => (form.value.unitTypePrice || 0) + electricAmount.value + waterAmount.value + commonAreaFeeAmount.value)

// Sync total into form.amount
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

async function generateInvoiceNo() {
    const now = new Date()
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `${prefix}-${rand}`
}

async function submitForm() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        const invoiceNo = await generateInvoiceNo()
        const prop = propertiesList.value.find(p => p.documentId === form.value.propertyDocumentId)

        const body = {
            data: {
                invoiceNo,
                type: form.value.type,
                description: form.value.description,
                amount: form.value.amount,
                currency: form.value.currency,
                dueDate: form.value.dueDate,
                status: form.value.status,
                notes: form.value.notes || null,
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
                commonAreaFee: form.value.commonAreaFee || null,
                resident: Number(form.value.residentId),
                property: prop ? prop.documentId : null,
            }
        }
        const res = await fetch(`${STRAPI_URL}/api/billings`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Create failed')
        showToast('success', t.value.invoiceCreated)
        setTimeout(() => router.push('/manager/invoices'), 800)
    } catch {
        showToast('error', t.value.invoiceCreateError)
    } finally {
        isSubmitting.value = false
    }
}

const invoiceTypes = ['monthlyRent', 'utilities', 'maintenance', 'deposit', 'lateFee', 'other']
const typeLabels = computed(() => ({
    monthlyRent: t.value.monthlyRent,
    utilities: t.value.utilities,
    maintenance: t.value.maintenance,
    deposit: t.value.deposit,
    lateFee: t.value.lateFee,
    other: t.value.other,
}))

function formatCurrency(amount: number, currency = 'THB') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const sectionsVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchProperties()
    if (propertiesList.value.length > 0) {
        form.value.propertyDocumentId = propertiesList.value[0].documentId
        await fetchPropertyConfig(propertiesList.value[0].documentId)
    }
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
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
                        <i :class="toast.type === 'success' ? 'fa-solid fa-square-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
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
        <div class="flex items-center gap-3 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <NuxtLink to="/manager/invoices"
                class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
            </NuxtLink>
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.createInvoice }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.invoicesSubtitle }}</p>
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
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.invoiceType
                        }} *</label>
                        <select v-model="form.type"
                            class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                            <option v-for="tp in invoiceTypes" :key="tp" :value="tp">{{ typeLabels[tp as keyof typeof
                                typeLabels] || tp }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.dueDate }}
                            *</label>
                        <input v-model="form.dueDate" type="date"
                            class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 [color-scheme:light] dark:[color-scheme:dark]"
                            :class="errors.dueDate ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                        <p v-if="errors.dueDate" class="text-xs text-red-500 mt-1">{{ errors.dueDate }}</p>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.description }}
                        *</label>
                    <input v-model="form.description" type="text" :placeholder="t.invoiceDescriptionPlaceholder"
                        class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        :class="errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'" />
                    <p v-if="errors.description" class="text-xs text-red-500 mt-1">{{ errors.description }}</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t.notes }}</label>
                    <textarea v-model="form.notes" rows="2" :placeholder="t.invoiceNotesPlaceholder"
                        class="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"></textarea>
                </div>
            </div>

            <!-- Pricing -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 transition-all duration-500 delay-150"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                    t.totalAmount }}</h3>

                <!-- Room Rent -->
                <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.roomRent }} ({{ t.unitTypePrice
                    }})</span>
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

                <!-- Common Area Fee -->
                <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span class="text-sm text-gray-600 dark:text-gray-400">🏛 {{ t.commonAreaFee }}</span>
                    <div class="w-32">
                        <input v-model.number="form.commonAreaFee" type="number" step="0.01" min="0"
                            class="w-full px-3 py-1.5 text-sm text-right text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
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
                <NuxtLink to="/manager/invoices"
                    class="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    {{ t.cancel }}
                </NuxtLink>
                <button type="submit" :disabled="isSubmitting"
                    class="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors">
                    {{ isSubmitting ? t.creating : t.createInvoice }}
                </button>
            </div>
        </form>
    </div>
</template>
