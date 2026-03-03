<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const announcementDocumentId = route.params.id as string

interface Property {
    id: number
    documentId: string
    name: string
}

interface ExistingImage {
    id: number
    url: string
    formats?: any
}

// ─── Form State ───────────────────────────────────────────────────────────────
const form = ref({
    title: '',
    excerpt: '',
    content: '',
    category: 'general',
    priority: 'normal',
    status: 'draft',
    publishDate: '',
    expiryDate: '',
    isPinned: false,
    tags: [] as string[],
    propertyId: '',
})

const isLoading = ref(true)
const isSubmitting = ref(false)
const errorMessage = ref('')
const propertiesList = ref<Property[]>([])
const contentEditor = ref<HTMLElement | null>(null)
const newTag = ref('')

// Cover image
const existingCoverImage = ref<ExistingImage | null>(null)
const coverImageFile = ref<File | null>(null)
const coverImagePreview = ref<string | null>(null)
const coverImageInputRef = ref<HTMLInputElement | null>(null)
const removedCoverImage = ref(false)

// Additional images
const existingImages = ref<ExistingImage[]>([])
const additionalImages = ref<File[]>([])
const additionalImagePreviews = ref<string[]>([])
const additionalImagesInputRef = ref<HTMLInputElement | null>(null)
const removedImageIds = ref<number[]>([])

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

// ─── Options ──────────────────────────────────────────────────────────────────
const categories = ['general', 'maintenance', 'event', 'emergency', 'policy', 'reminder', 'celebration']
const priorities = ['normal', 'important', 'urgent']
const statuses = ['draft', 'published', 'archived']

const categoryLabels = computed(() => ({
    general: t.value.general,
    maintenance: t.value.maintenance,
    event: t.value.event,
    emergency: t.value.emergency,
    policy: t.value.policy,
    reminder: t.value.reminder,
    celebration: t.value.celebration,
}))

const priorityLabels = computed(() => ({
    normal: t.value.normal,
    important: t.value.important,
    urgent: t.value.urgent,
}))

const statusLabels = computed(() => ({
    draft: t.value.draft,
    published: t.value.published,
    archived: t.value.archived,
}))

// ─── Fetch Properties ─────────────────────────────────────────────────────────
async function fetchProperties() {
    try {
        const params = new URLSearchParams({
            'pagination[pageSize]': '200',
            'fields[0]': 'name',
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
            id: p.id, documentId: p.documentId, name: p.name,
        }))
    } catch { /* ignore */ }
}

// ─── Fetch Announcement ───────────────────────────────────────────────────────
async function fetchAnnouncement() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'coverImage',
            'populate[1]': 'images',
            'populate[2]': 'property',
        })
        const res = await fetch(`${STRAPI_URL}/api/announcements/${announcementDocumentId}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        const ann = data.data

        if (!ann) throw new Error('Not found')

        form.value.title = ann.title || ''
        form.value.excerpt = ann.excerpt || ''
        form.value.content = ann.content || ''
        form.value.category = ann.category || 'general'
        form.value.priority = ann.priority || 'normal'
        form.value.status = ann.status || 'draft'
        form.value.publishDate = ann.publishDate ? ann.publishDate.slice(0, 16) : ''
        form.value.expiryDate = ann.expiryDate ? ann.expiryDate.slice(0, 16) : ''
        form.value.isPinned = ann.isPinned || false
        form.value.tags = ann.tags || []
        form.value.propertyId = ann.property?.documentId || ''

        existingCoverImage.value = ann.coverImage || null
        existingImages.value = ann.images || []
    } catch {
        errorMessage.value = t.value.announcementLoadError
    } finally {
        isLoading.value = false
        // Set content editor HTML after loading
        await nextTick()
        if (contentEditor.value && form.value.content) {
            contentEditor.value.innerHTML = form.value.content
        }
    }
}

function getImageUrl(img: { url: string; formats?: any }) {
    if (img.formats?.small?.url) return `${STRAPI_URL}${img.formats.small.url}`
    return `${STRAPI_URL}${img.url}`
}

// ─── Image Handling ───────────────────────────────────────────────────────────
function selectCoverImage() {
    coverImageInputRef.value?.click()
}

function handleCoverImageSelect(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files && input.files[0]) {
        coverImageFile.value = input.files[0]
        coverImagePreview.value = URL.createObjectURL(input.files[0])
        removedCoverImage.value = false
    }
    input.value = ''
}

function removeCoverImage() {
    if (existingCoverImage.value) {
        removedCoverImage.value = true
    }
    coverImageFile.value = null
    coverImagePreview.value = null
}

function selectAdditionalImages() {
    additionalImagesInputRef.value?.click()
}

function handleAdditionalImagesSelect(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) {
        const totalImages = existingImages.value.filter(img => !removedImageIds.value.includes(img.id)).length + additionalImages.value.length
        const files = Array.from(input.files).slice(0, 10 - totalImages)
        files.forEach(file => {
            additionalImages.value.push(file)
            additionalImagePreviews.value.push(URL.createObjectURL(file))
        })
    }
    input.value = ''
}

function removeExistingImage(id: number) {
    removedImageIds.value.push(id)
}

function removeAdditionalImage(index: number) {
    additionalImages.value.splice(index, 1)
    additionalImagePreviews.value.splice(index, 1)
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
function addTag() {
    const tag = newTag.value.trim()
    if (tag && !form.value.tags.includes(tag)) {
        form.value.tags.push(tag)
    }
    newTag.value = ''
}

function removeTag(index: number) {
    form.value.tags.splice(index, 1)
}

function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        e.preventDefault()
        addTag()
    }
}

// ─── WYSIWYG Editor Commands ──────────────────────────────────────────────────
function execCmd(cmd: string, val?: string) {
    document.execCommand(cmd, false, val)
}

function updateContent() {
    if (contentEditor.value) {
        form.value.content = contentEditor.value.innerHTML
    }
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
    // Validate
    if (!form.value.title.trim()) {
        showToast('error', 'Title is required')
        return
    }
    if (!form.value.content.trim()) {
        showToast('error', 'Content is required')
        return
    }
    if (!form.value.propertyId) {
        showToast('error', 'Please select a property')
        return
    }

    isSubmitting.value = true
    try {
        // Upload new cover image if exists
        let coverImageId: number | null = existingCoverImage.value && !removedCoverImage.value ? existingCoverImage.value.id : null
        if (coverImageFile.value) {
            const formData = new FormData()
            formData.append('files', coverImageFile.value)
            const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token.value}` },
                body: formData,
            })
            if (!uploadRes.ok) throw new Error('Cover image upload failed')
            const uploadedFiles = await uploadRes.json()
            coverImageId = uploadedFiles[0]?.id ?? null
        }

        // Upload new additional images if any
        let additionalImageIds: number[] = existingImages.value
            .filter(img => !removedImageIds.value.includes(img.id))
            .map(img => img.id)

        if (additionalImages.value.length > 0) {
            const formData = new FormData()
            additionalImages.value.forEach(file => formData.append('files', file))
            const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token.value}` },
                body: formData,
            })
            if (!uploadRes.ok) throw new Error('Images upload failed')
            const uploadedFiles = await uploadRes.json()
            additionalImageIds = [...additionalImageIds, ...uploadedFiles.map((f: any) => f.id)]
        }

        // Update announcement
        const body: any = {
            data: {
                title: form.value.title.trim(),
                excerpt: form.value.excerpt.trim() || null,
                content: form.value.content,
                category: form.value.category,
                priority: form.value.priority,
                status: form.value.status,
                publishDate: form.value.publishDate || null,
                expiryDate: form.value.expiryDate || null,
                isPinned: form.value.isPinned,
                tags: form.value.tags.length > 0 ? form.value.tags : null,
                property: form.value.propertyId,
                coverImage: coverImageId,
                images: additionalImageIds.length > 0 ? additionalImageIds : null,
            },
        }

        const res = await fetch(`${STRAPI_URL}/api/announcements/${announcementDocumentId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })

        if (!res.ok) throw new Error('Update failed')

        showToast('success', t.value.announcementUpdated)
        setTimeout(() => router.push(`/manager/announcements/${announcementDocumentId}`), 800)
    } catch (err) {
        showToast('error', t.value.announcementUpdateError)
    } finally {
        isSubmitting.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const sectionsVisible = ref(false)

onMounted(async () => {
    await fetchProperties()
    await fetchAnnouncement()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sectionsVisible.value = true
    }))
})
</script>

<template>
    <div class="max-w-4xl mx-auto space-y-6">
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
                        <i :class="toast.type === 'success' ? 'ti-check' : 'ti-alert-circle'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="ti-close text-xs"></i></button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Hidden inputs -->
        <input ref="coverImageInputRef" type="file" accept="image/*" class="hidden" @change="handleCoverImageSelect" />
        <input ref="additionalImagesInputRef" type="file" accept="image/*" multiple class="hidden"
            @change="handleAdditionalImagesSelect" />

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage"
            class="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <i class="ti-alert-circle text-4xl text-red-400 mb-4"></i>
            <p class="text-gray-600 dark:text-gray-400">{{ errorMessage }}</p>
            <NuxtLink to="/manager/announcements" class="mt-4 text-sm text-primary-600 hover:underline">{{
                t.backToAnnouncements
                }}</NuxtLink>
        </div>

        <template v-else>
            <!-- Header -->
            <div class="flex items-center gap-4 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <NuxtLink :to="`/manager/announcements/${announcementDocumentId}`"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                </NuxtLink>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.editAnnouncement }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ form.title || t.editAnnouncement }}</p>
                </div>
            </div>

            <form @submit.prevent="submit" class="space-y-6">
                <!-- Cover Image -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-100"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                        <i class="ti-photo text-primary-500"></i>
                        {{ t.coverImage }}
                    </h3>

                    <!-- Show existing or new preview -->
                    <div v-if="coverImagePreview || (existingCoverImage && !removedCoverImage)"
                        class="relative rounded-xl overflow-hidden">
                        <img :src="coverImagePreview || getImageUrl(existingCoverImage!)" alt="Cover preview"
                            class="w-full h-48 sm:h-64 object-cover" />
                        <button type="button" @click="removeCoverImage"
                            class="absolute top-3 right-3 w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors">
                            <i class="ti-close text-white text-sm"></i>
                        </button>
                        <button type="button" @click="selectCoverImage"
                            class="absolute bottom-3 right-3 px-3 py-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white text-xs font-medium transition-colors">
                            {{ t.change }}
                        </button>
                    </div>

                    <div v-else @click="selectCoverImage"
                        class="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 transition-colors">
                        <i class="ti-upload text-3xl text-gray-300 dark:text-gray-600 mb-2"></i>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.dragDropImages }}</p>
                        <p class="text-xs text-gray-400 mt-1">Recommended: 1200x630px</p>
                    </div>
                </div>

                <!-- Basic Info -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-5 transition-all duration-500 delay-150"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <i class="ti-info-circle text-primary-500"></i>
                        {{ t.announcementDetails }}
                    </h3>

                    <!-- Property -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ t.property
                        }} *</label>
                        <div class="relative">
                            <select v-model="form.propertyId"
                                class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option value="" disabled>{{ t.selectProperty }}</option>
                                <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                                    {{ prop.name }}
                                </option>
                            </select>
                            <i
                                class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>

                    <!-- Title -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ t.titleLabel
                        }} *</label>
                        <input v-model="form.title" type="text" :placeholder="t.titleLabel"
                            class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>

                    <!-- Excerpt -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ t.excerpt
                        }}</label>
                        <textarea v-model="form.excerpt" rows="2" :placeholder="t.excerptPlaceholder"
                            class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                    </div>

                    <!-- Content (WYSIWYG) -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ t.content }}
                            *</label>
                        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <!-- Toolbar -->
                            <div
                                class="flex flex-wrap items-center gap-0.5 p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <button type="button" @click="execCmd('bold')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-bold text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <button type="button" @click="execCmd('italic')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-italic text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <button type="button" @click="execCmd('underline')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-underline text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <div class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button type="button" @click="execCmd('insertUnorderedList')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-list text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <button type="button" @click="execCmd('insertOrderedList')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-list-numbers text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <div class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button type="button" @click="execCmd('justifyLeft')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-align-left text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <button type="button" @click="execCmd('justifyCenter')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-align-center text-gray-600 dark:text-gray-400"></i>
                                </button>
                                <button type="button" @click="execCmd('justifyRight')"
                                    class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <i class="ti-align-right text-gray-600 dark:text-gray-400"></i>
                                </button>
                            </div>
                            <!-- Editor -->
                            <div ref="contentEditor" contenteditable="true" @input="updateContent"
                                class="min-h-[200px] p-4 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 focus:outline-none prose dark:prose-invert max-w-none"
                                :data-placeholder="t.contentPlaceholder"></div>
                        </div>
                    </div>

                    <!-- Category, Priority, Status -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.categoryLabel }}</label>
                            <div class="relative">
                                <select v-model="form.category"
                                    class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                    <option v-for="c in categories" :key="c" :value="c">{{ categoryLabels[c] }}</option>
                                </select>
                                <i
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.priorityLabel }}</label>
                            <div class="relative">
                                <select v-model="form.priority"
                                    class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                    <option v-for="p in priorities" :key="p" :value="p">{{ priorityLabels[p] }}</option>
                                </select>
                                <i
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.statusLabel }}</label>
                            <div class="relative">
                                <select v-model="form.status"
                                    class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                    <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                                </select>
                                <i
                                    class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Dates -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.publishDate }}</label>
                            <input v-model="form.publishDate" type="datetime-local"
                                class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.expiryDate }}</label>
                            <input v-model="form.expiryDate" type="datetime-local"
                                class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                    </div>

                    <!-- Pin toggle -->
                    <div class="flex items-center gap-3">
                        <button type="button" @click="form.isPinned = !form.isPinned"
                            class="relative w-11 h-6 rounded-full transition-colors"
                            :class="form.isPinned ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'">
                            <span
                                class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                                :class="form.isPinned ? 'translate-x-5' : ''"></span>
                        </button>
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.isPinned }}</label>
                    </div>
                </div>

                <!-- Tags -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-200"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                        <i class="ti-tag text-primary-500"></i>
                        {{ t.tags }}
                    </h3>

                    <div class="flex flex-wrap gap-2 mb-3">
                        <span v-for="(tag, idx) in form.tags" :key="idx"
                            class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                            {{ tag }}
                            <button type="button" @click="removeTag(idx)" class="hover:text-red-500 transition-colors">
                                <i class="ti-close text-xs"></i>
                            </button>
                        </span>
                    </div>

                    <div class="flex gap-2">
                        <input v-model="newTag" type="text" :placeholder="t.addTag" @keydown="handleTagKeydown"
                            class="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        <button type="button" @click="addTag"
                            class="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors">
                            {{ t.addTag }}
                        </button>
                    </div>
                </div>

                <!-- Additional Images -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-250"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                        <i class="ti-photos text-primary-500"></i>
                        {{ t.attachImages }}
                    </h3>

                    <div class="flex flex-wrap gap-3">
                        <!-- Existing images -->
                        <div v-for="img in existingImages.filter(i => !removedImageIds.includes(i.id))" :key="img.id"
                            class="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <img :src="getImageUrl(img)" alt="Preview" class="w-full h-full object-cover" />
                            <button type="button" @click="removeExistingImage(img.id)"
                                class="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors">
                                <i class="ti-close text-white text-xs"></i>
                            </button>
                        </div>

                        <!-- New images -->
                        <div v-for="(preview, idx) in additionalImagePreviews" :key="`new-${idx}`"
                            class="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <img :src="preview" alt="Preview" class="w-full h-full object-cover" />
                            <button type="button" @click="removeAdditionalImage(idx)"
                                class="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors">
                                <i class="ti-close text-white text-xs"></i>
                            </button>
                        </div>

                        <button
                            v-if="existingImages.filter(i => !removedImageIds.includes(i.id)).length + additionalImages.length < 10"
                            type="button" @click="selectAdditionalImages"
                            class="w-24 h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex flex-col items-center justify-center hover:border-primary-400 dark:hover:border-primary-600 transition-colors">
                            <i class="ti-plus text-gray-400 mb-1"></i>
                            <span class="text-xs text-gray-400">{{ t.maxImages }}</span>
                        </button>
                    </div>
                </div>

                <!-- Submit -->
                <div class="flex items-center justify-end gap-3 pt-4 transition-all duration-500 delay-300"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                    <NuxtLink :to="`/manager/announcements/${announcementDocumentId}`"
                        class="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        {{ t.cancel }}
                    </NuxtLink>
                    <button type="submit" :disabled="isSubmitting"
                        class="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                        <i v-if="isSubmitting" class="ti-reload text-xs animate-spin"></i>
                        {{ t.updateAnnouncement }}
                    </button>
                </div>
            </form>
        </template>
    </div>
</template>

<style scoped>
[contenteditable]:empty:before {
    content: attr(data-placeholder);
    color: #9ca3af;
    pointer-events: none;
}
</style>
