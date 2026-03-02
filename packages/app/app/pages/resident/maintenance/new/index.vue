<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface Property {
    id: number
    documentId: string
    name: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const propertiesList = ref<Property[]>([])
const isLoadingProperties = ref(true)
const isSubmitting = ref(false)

// Form
const form = ref({
    propertyDocumentId: '',
    title: '',
    description: '',
    category: '' as string,
    priority: 'medium' as string,
    roomNumber: '',
})
const selectedImages = ref<File[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const errors = ref<Record<string, string>>({})

// ─── Categories / Priorities ──────────────────────────────────────────────────
const categories = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'pest_control', 'other']
const priorities = ['low', 'medium', 'high', 'urgent']

const categoryLabels = computed(() => ({
    plumbing: t.value.plumbing || 'Plumbing',
    electrical: t.value.electrical || 'Electrical',
    hvac: t.value.hvac || 'HVAC',
    appliance: t.value.appliance || 'Appliance',
    structural: t.value.structural || 'Structural',
    cleaning: t.value.cleaning || 'Cleaning',
    pest_control: t.value.pest_control || 'Pest Control',
    other: t.value.other || 'Other',
}))

const priorityLabels = computed(() => ({
    low: t.value.low || 'Low',
    medium: t.value.medium || 'Medium',
    high: t.value.high || 'High',
    urgent: t.value.urgent || 'Urgent',
}))

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

const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    medium: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700',
    high: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700',
    urgent: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700',
}

// ─── UI labels (formatter-safe) ───────────────────────────────────────────────
const ui = computed(() => ({
    newRequest: t.value.newMaintenanceRequest || 'New Maintenance Request',
    newRequestDesc: t.value.newMaintenanceRequestDesc || 'Submit a new maintenance request to your property manager',
    backToMaintenance: t.value.backToMaintenance || 'Back to Maintenance',
    selectProperty: t.value.selectProperty || 'Select Property',
    titleLabel: t.value.titleLabel || 'Title',
    enterTitle: t.value.enterTitle || 'Brief description of the issue',
    descriptionLabel: t.value.descriptionLabel || 'Description',
    enterDescription: t.value.enterDescription || 'Provide details about the issue...',
    categoryLabel: t.value.categoryLabel || 'Category',
    selectCategory: t.value.selectCategory || 'Select Category',
    priorityLabel: t.value.priorityLabel || 'Priority',
    selectPriority: t.value.selectPriority || 'Select Priority',
    roomNo: t.value.roomNo || 'Room Number',
    enterRoomNumber: t.value.enterRoomNumber || 'Enter room number',
    attachPhotos: t.value.attachPhotos || 'Attach Photos',
    maxPhotos: t.value.maxPhotos || 'Up to 5 photos',
    dragDropImages: t.value.dragDropImages || 'Drag & drop images or click to browse',
    submitRequest: t.value.submitRequest || 'Submit Request',
    submittingRequest: t.value.submittingRequest || 'Submitting...',
    fieldRequired: t.value.fieldRequired || 'This field is required',
    property: t.value.property || 'Property',
    cancel: t.value.cancel || 'Cancel',
}))

// ─── Toast ────────────────────────────────────────────────────────────────────
const toasts = ref<{ id: number; type: 'success' | 'error'; message: string }[]>([])
let toastId = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastId
    toasts.value.push({ id, type, message })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 4000)
}

// ─── Fetch Properties ─────────────────────────────────────────────────────────
async function fetchProperties() {
    isLoadingProperties.value = true
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id, documentId: p.documentId, name: p.name,
        }))
        if (propertiesList.value.length === 1) {
            form.value.propertyDocumentId = propertiesList.value[0].documentId
        }
    } catch { /* ignore */ }
    finally {
        isLoadingProperties.value = false
    }
}

// ─── Image Handling ───────────────────────────────────────────────────────────
function selectImages() {
    imageInputRef.value?.click()
}

function handleImageSelect(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) {
        const remaining = 5 - selectedImages.value.length
        const files = Array.from(input.files).slice(0, remaining)
        selectedImages.value.push(...files)
    }
    input.value = ''
}

function removeImage(index: number) {
    selectedImages.value.splice(index, 1)
}

function getImagePreviewUrl(file: File): string {
    return URL.createObjectURL(file)
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(): boolean {
    errors.value = {}
    if (!form.value.propertyDocumentId) errors.value.property = ui.value.fieldRequired
    if (!form.value.title.trim()) errors.value.title = ui.value.fieldRequired
    if (!form.value.description.trim()) errors.value.description = ui.value.fieldRequired
    if (!form.value.category) errors.value.category = ui.value.fieldRequired
    return Object.keys(errors.value).length === 0
}

// ─── Generate Request Number ──────────────────────────────────────────────────
function generateRequestNumber(): string {
    const now = new Date()
    const y = now.getFullYear().toString().slice(-2)
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const rand = Math.floor(1000 + Math.random() * 9000)
    return `MR-${y}${m}${d}-${rand}`
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submitRequest() {
    if (!validate()) return
    isSubmitting.value = true
    try {
        // Upload images first
        let uploadedImageIds: number[] = []
        if (selectedImages.value.length > 0) {
            const formData = new FormData()
            selectedImages.value.forEach(file => formData.append('files', file))
            const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token.value}` },
                body: formData,
            })
            if (!uploadRes.ok) throw new Error('Upload failed')
            const uploadedFiles = await uploadRes.json()
            uploadedImageIds = uploadedFiles.map((f: any) => f.id)
        }

        // Create maintenance request
        const body: any = {
            data: {
                title: form.value.title.trim(),
                description: form.value.description.trim(),
                category: form.value.category,
                priority: form.value.priority,
                status: 'pending',
                requestNumber: generateRequestNumber(),
                property: form.value.propertyDocumentId,
                resident: user.value?.documentId,
                roomNumber: form.value.roomNumber.trim() || null,
            },
        }
        if (uploadedImageIds.length > 0) {
            body.data.images = uploadedImageIds
        }

        const res = await fetch(`${STRAPI_URL}/api/maintenances`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Create failed')

        showToast('success', t.value.requestSubmitted || 'Request submitted successfully!')
        setTimeout(() => router.push('/resident/maintenance'), 800)
    } catch {
        showToast('error', t.value.requestSubmitError || 'Failed to submit request')
    } finally {
        isSubmitting.value = false
    }
}

// ─── Entry Animation ──────────────────────────────────────────────────────────
const pageVisible = ref(false)

onMounted(async () => {
    await fetchProperties()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        pageVisible.value = true
    }))
})
</script>

<template>
    <div class="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-6">
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
                        <button @click="toasts = toasts.filter(t => t.id !== toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Header -->
        <div class="transition-all duration-500"
            :class="pageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div class="flex items-center gap-3 mb-1">
                <NuxtLink to="/resident/maintenance"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                </NuxtLink>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ ui.newRequest }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ ui.newRequestDesc }}</p>
                </div>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoadingProperties" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Form -->
        <form v-else @submit.prevent="submitRequest" class="space-y-5 transition-all duration-500 delay-100"
            :class="pageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

            <!-- Property -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-building text-primary-500"></i>
                    {{ ui.property }}
                </h3>
                <div>
                    <div class="relative">
                        <select v-model="form.propertyDocumentId"
                            class="w-full pl-3 pr-8 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
                            :class="errors.property ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'">
                            <option value="" disabled>{{ ui.selectProperty }}</option>
                            <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                                {{ prop.name }}
                            </option>
                        </select>
                        <i
                            class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                    </div>
                    <p v-if="errors.property" class="text-xs text-red-500 mt-1">{{ errors.property }}</p>
                </div>

                <!-- Room Number -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ ui.roomNo
                        }}</label>
                    <input v-model="form.roomNumber" type="text" :placeholder="ui.enterRoomNumber"
                        class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
            </div>

            <!-- Issue Details -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-clipboard-list text-primary-500"></i>
                    {{ ui.descriptionLabel }}
                </h3>

                <!-- Title -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ ui.titleLabel }}
                        <span class="text-red-500">*</span>
                    </label>
                    <input v-model="form.title" type="text" :placeholder="ui.enterTitle"
                        class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        :class="errors.title ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'" />
                    <p v-if="errors.title" class="text-xs text-red-500 mt-1">{{ errors.title }}</p>
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{
                        ui.descriptionLabel }}
                        <span class="text-red-500">*</span>
                    </label>
                    <textarea v-model="form.description" :placeholder="ui.enterDescription" rows="4"
                        class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                        :class="errors.description ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'"></textarea>
                    <p v-if="errors.description" class="text-xs text-red-500 mt-1">{{ errors.description }}</p>
                </div>
            </div>

            <!-- Category Selection -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-tag text-primary-500"></i>
                    {{ ui.categoryLabel }}
                    <span class="text-red-500 text-xs">*</span>
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button v-for="cat in categories" :key="cat" type="button"
                        @click="form.category = cat; delete errors.category"
                        class="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200"
                        :class="form.category === cat
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 shadow-sm'
                            : errors.category
                                ? 'border-red-200 dark:border-red-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'">
                        <i :class="categoryIcons[cat]" class="text-lg"></i>
                        <span class="text-xs font-medium text-center">{{ categoryLabels[cat as keyof typeof
                            categoryLabels] }}</span>
                    </button>
                </div>
                <p v-if="errors.category" class="text-xs text-red-500">{{ errors.category }}</p>
            </div>

            <!-- Priority Selection -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-flag text-primary-500"></i>
                    {{ ui.priorityLabel }}
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button v-for="pri in priorities" :key="pri" type="button" @click="form.priority = pri"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200"
                        :class="form.priority === pri
                            ? 'border-primary-500 ' + priorityColors[pri] + ' shadow-sm ring-1 ring-primary-200 dark:ring-primary-800'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'">
                        <i :class="{
                            'fa-solid fa-arrow-down': pri === 'low',
                            'fa-solid fa-minus': pri === 'medium',
                            'fa-solid fa-arrow-up': pri === 'high',
                            'fa-solid fa-circle-exclamation': pri === 'urgent',
                        }" class="text-xs"></i>
                        {{ priorityLabels[pri as keyof typeof priorityLabels] }}
                    </button>
                </div>
            </div>

            <!-- Photos -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <div class="flex items-center justify-between">
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <i class="fa-solid fa-camera text-primary-500"></i>
                        {{ ui.attachPhotos }}
                    </h3>
                    <span class="text-xs text-gray-400">{{ ui.maxPhotos }}</span>
                </div>

                <input ref="imageInputRef" type="file" accept="image/*" multiple class="hidden"
                    @change="handleImageSelect" />

                <!-- Image previews -->
                <div v-if="selectedImages.length > 0" class="flex flex-wrap gap-3">
                    <div v-for="(file, idx) in selectedImages" :key="idx"
                        class="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group">
                        <img :src="getImagePreviewUrl(file)" alt="Preview" class="w-full h-full object-cover" />
                        <button type="button" @click="removeImage(idx)"
                            class="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-xmark text-white text-xs"></i>
                        </button>
                    </div>

                    <!-- Add more button -->
                    <button v-if="selectedImages.length < 5" type="button" @click="selectImages"
                        class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-primary-500 hover:border-primary-400 transition-colors">
                        <i class="fa-solid fa-plus text-lg"></i>
                        <span class="text-[10px]">{{ selectedImages.length }}/5</span>
                    </button>
                </div>

                <!-- Empty upload area -->
                <button v-else type="button" @click="selectImages"
                    class="w-full py-8 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-primary-500 hover:border-primary-400 transition-colors">
                    <i class="fa-solid fa-cloud-arrow-up text-2xl"></i>
                    <span class="text-sm">{{ ui.dragDropImages }}</span>
                    <span class="text-xs text-gray-400">{{ ui.maxPhotos }}</span>
                </button>
            </div>

            <!-- Submit Button -->
            <div class="flex items-center gap-3">
                <NuxtLink to="/resident/maintenance"
                    class="px-5 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">
                    {{ ui.cancel }}
                </NuxtLink>
                <button type="submit" :disabled="isSubmitting"
                    class="flex-1 px-5 py-3 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <i v-if="isSubmitting" class="fa-solid fa-spinner fa-spin text-sm"></i>
                    <i v-else class="fa-solid fa-paper-plane text-sm"></i>
                    {{ isSubmitting ? ui.submittingRequest : ui.submitRequest }}
                </button>
            </div>
        </form>
    </div>
</template>
