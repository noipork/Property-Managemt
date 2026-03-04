<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const announcementDocumentId = route.params.id as string

interface Announcement {
    id: number
    documentId: string
    title: string
    excerpt: string | null
    content: string
    category: string
    priority: string
    status: string
    publishDate: string | null
    expiryDate: string | null
    isPinned: boolean
    viewCount: number
    tags: string[] | null
    createdAt: string
    updatedAt: string
    coverImage: { id: number; url: string; formats?: any } | null
    images: { id: number; url: string; formats?: any }[] | null
    property: { id: number; documentId: string; name: string } | null
    author: { id: number; username: string; email: string } | null
}

const announcement = ref<Announcement | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

// Delete Modal
const showDeleteModal = ref(false)
const isDeleting = ref(false)

// Image viewer
const showImageViewer = ref(false)
const viewerImages = ref<{ url: string }[]>([])
const viewerIndex = ref(0)

const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    published: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    archived: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
}

const priorityColors: Record<string, string> = {
    normal: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    important: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    urgent: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

const categoryColors: Record<string, string> = {
    general: 'bg-gray-500',
    maintenance: 'bg-orange-500',
    event: 'bg-purple-500',
    emergency: 'bg-red-500',
    policy: 'bg-blue-500',
    reminder: 'bg-amber-500',
    celebration: 'bg-pink-500',
}

const categoryIcons: Record<string, string> = {
    general: 'ti-info-circle',
    maintenance: 'ti-wrench',
    event: 'ti-calendar-event',
    emergency: 'ti-alert-triangle',
    policy: 'ti-file-text',
    reminder: 'ti-bell',
    celebration: 'ti-confetti',
}

const statusLabels = computed(() => ({
    draft: t.value.draft,
    published: t.value.published,
    archived: t.value.archived,
}))

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

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function getImageUrl(img: { url: string; formats?: any } | null) {
    if (!img) return ''
    if (img.formats?.medium?.url) return `${STRAPI_URL}${img.formats.medium.url}`
    if (img.formats?.small?.url) return `${STRAPI_URL}${img.formats.small.url}`
    return `${STRAPI_URL}${img.url}`
}

function getFullImageUrl(img: { url: string; formats?: any }) {
    if (img.formats?.large?.url) return `${STRAPI_URL}${img.formats.large.url}`
    return `${STRAPI_URL}${img.url}`
}

function openImageViewer(images: { url: string; formats?: any }[], index: number) {
    viewerImages.value = images.map(img => ({ url: getFullImageUrl(img) }))
    viewerIndex.value = index
    showImageViewer.value = true
}

// ─── Fetch Announcement ───────────────────────────────────────────────────────
async function fetchAnnouncement() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'coverImage',
            'populate[1]': 'images',
            'populate[2]': 'property',
            'populate[3]': 'author',
        })
        const res = await fetch(`${STRAPI_URL}/api/announcements/${announcementDocumentId}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        announcement.value = data.data ?? null
        if (!announcement.value) throw new Error('Not found')

        // Increment view count
        await fetch(`${STRAPI_URL}/api/announcements/${announcementDocumentId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: { viewCount: (announcement.value.viewCount || 0) + 1 }
            }),
        })
    } catch {
        errorMessage.value = t.value.announcementLoadError
    } finally {
        isLoading.value = false
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteAnnouncement() {
    if (!announcement.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/announcements/${announcement.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.announcementDeleted)
        setTimeout(() => router.push('/manager/announcements'), 800)
    } catch {
        showToast('error', t.value.announcementDeleteError)
    } finally {
        isDeleting.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const sectionsVisible = ref(false)

onMounted(async () => {
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

        <template v-else-if="announcement">
            <!-- Header -->
            <div class="flex items-start justify-between gap-4 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-start gap-4">
                    <NuxtLink to="/manager/announcements"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0 mt-1">
                        <i class="ti-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                            <span :class="categoryColors[announcement.category]"
                                class="px-2.5 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1">
                                <i :class="categoryIcons[announcement.category]" class="text-[10px]"></i>
                                {{ categoryLabels[announcement.category] }}
                            </span>
                            <span :class="statusColors[announcement.status]"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold">
                                {{ statusLabels[announcement.status] }}
                            </span>
                            <span v-if="announcement.priority !== 'normal'"
                                :class="priorityColors[announcement.priority]"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold">
                                {{ priorityLabels[announcement.priority] }}
                            </span>
                            <span v-if="announcement.isPinned"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <i class="ti-pin text-[10px]"></i>
                                {{ t.pinned }}
                            </span>
                        </div>
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ announcement.title }}</h1>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {{ formatDateTime(announcement.publishDate || announcement.createdAt) }}
                            <span v-if="announcement.author"> · {{ announcement.author.username }}</span>
                            <span v-if="announcement.property"> · {{ announcement.property.name }}</span>
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <NuxtLink :to="`/manager/announcements/${announcementDocumentId}/edit`"
                        class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2">
                        <i class="ti-pencil text-xs"></i>
                        {{ t.edit }}
                    </NuxtLink>
                    <button @click="showDeleteModal = true"
                        class="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors flex items-center gap-2">
                        <i class="ti-trash text-xs"></i>
                        {{ t.delete }}
                    </button>
                </div>
            </div>

            <!-- Cover Image -->
            <div v-if="announcement.coverImage" class="rounded-xl overflow-hidden transition-all duration-500 delay-100"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <img :src="getFullImageUrl(announcement.coverImage)" :alt="announcement.title"
                    class="w-full h-64 sm:h-80 lg:h-96 object-cover cursor-pointer"
                    @click="openImageViewer([announcement.coverImage!], 0)" />
            </div>

            <!-- Content -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 transition-all duration-500 delay-150"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <!-- Excerpt -->
                <p v-if="announcement.excerpt"
                    class="text-lg text-gray-600 dark:text-gray-400 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
                    {{ announcement.excerpt }}
                </p>

                <!-- Content HTML -->
                <div class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100"
                    v-html="announcement.content"></div>

                <!-- Tags -->
                <div v-if="announcement.tags && announcement.tags.length > 0"
                    class="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                    <div class="flex flex-wrap gap-2">
                        <span v-for="tag in announcement.tags" :key="tag"
                            class="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                            #{{ tag }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Additional Images -->
            <div v-if="announcement.images && announcement.images.length > 0"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-200"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                    <i class="ti-photos text-primary-500"></i>
                    {{ t.attachImages }}
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <button v-for="(img, idx) in announcement.images" :key="img.id"
                        @click="openImageViewer(announcement.images!, idx)"
                        class="relative group rounded-lg overflow-hidden aspect-square bg-gray-100 dark:bg-gray-800">
                        <img :src="getImageUrl(img)" :alt="`Image ${idx + 1}`"
                            class="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div
                            class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <i class="ti-zoom-in text-white text-lg"></i>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Meta Info -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-250"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 mb-1">{{ t.viewCount }}</p>
                        <p class="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                            <i class="ti-eye text-xs text-gray-400"></i>
                            {{ announcement.viewCount }}
                        </p>
                    </div>
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 mb-1">{{ t.publishDate }}</p>
                        <p class="font-medium text-gray-900 dark:text-white">
                            {{ formatDate(announcement.publishDate) }}
                        </p>
                    </div>
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 mb-1">{{ t.expiryDate }}</p>
                        <p class="font-medium text-gray-900 dark:text-white">
                            {{ formatDate(announcement.expiryDate) }}
                        </p>
                    </div>
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 mb-1">{{ t.lastUpdated }}</p>
                        <p class="font-medium text-gray-900 dark:text-white">
                            {{ formatDate(announcement.updatedAt) }}
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <!-- Delete Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDeleteModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6">
                        <div class="flex items-start gap-4">
                            <div
                                class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <i class="ti-alert-triangle text-red-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteAnnouncement }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ t.deleteAnnouncementConfirm }} <strong class="text-gray-900 dark:text-white">"{{
                                        announcement?.title }}"</strong>{{ t.deleteAnnouncementConfirm2 }}
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showDeleteModal = false" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="deleteAnnouncement" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isDeleting" class="ti-reload text-xs animate-spin"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Image Viewer Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showImageViewer" @click="showImageViewer = false"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
                    <button @click.stop="showImageViewer = false"
                        class="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors">
                        <i class="ti-close text-2xl"></i>
                    </button>

                    <!-- Navigation -->
                    <button v-if="viewerImages.length > 1"
                        @click.stop="viewerIndex = (viewerIndex - 1 + viewerImages.length) % viewerImages.length"
                        class="absolute left-4 p-3 text-white/70 hover:text-white transition-colors">
                        <i class="ti-angle-left text-3xl"></i>
                    </button>
                    <button v-if="viewerImages.length > 1"
                        @click.stop="viewerIndex = (viewerIndex + 1) % viewerImages.length"
                        class="absolute right-4 p-3 text-white/70 hover:text-white transition-colors">
                        <i class="ti-angle-right text-3xl"></i>
                    </button>

                    <img :src="viewerImages[viewerIndex]?.url" alt="Full size image" @click.stop
                        class="max-w-full max-h-[90vh] object-contain rounded-lg" />

                    <!-- Counter -->
                    <div v-if="viewerImages.length > 1"
                        class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                        {{ viewerIndex + 1 }} / {{ viewerImages.length }}
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
