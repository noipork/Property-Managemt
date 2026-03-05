<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

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
    coverImage: { id: number; url: string; formats?: any } | null
    property: { id: number; documentId: string; name: string } | null
    author: { id: number; username: string } | null
}

interface Property {
    id: number
    documentId: string
    name: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const allAnnouncements = ref<Announcement[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterPropertyId = ref('')
const filterStatus = ref('')
const filterCategory = ref('')
const filterPriority = ref('')
const filterPinned = ref(false)


// ─── Pagination ───────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(12)
const totalCount = computed(() => allAnnouncements.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const announcements = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return allAnnouncements.value.slice(start, start + pageSize.value)
})

// ─── Delete Modal ─────────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleteTarget = ref<Announcement | null>(null)
const isDeleting = ref(false)

// ─── Properties list ──────────────────────────────────────────────────────────
const propertiesList = ref<Property[]>([])

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

// ─── Status / Category / Priority helpers ─────────────────────────────────────
const statuses = ['draft', 'published', 'archived']
const categories = ['general', 'maintenance', 'event', 'emergency', 'policy', 'reminder', 'celebration']
const priorities = ['normal', 'important', 'urgent']

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
    general: 'fa-solid fa-circle-info',
    maintenance: 'fa-solid fa-wrench',
    event: 'fa-solid fa-calendar-days',
    emergency: 'fa-solid fa-triangle-exclamation',
    policy: 'fa-solid fa-file-lines',
    reminder: 'fa-solid fa-bell',
    celebration: 'fa-solid fa-champagne-glasses',
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

// ─── Fetch Announcements ──────────────────────────────────────────────────────
let initializing = true

async function fetchAnnouncements() {
    if (initializing) return
    isLoading.value = true
    try {
        const params = new URLSearchParams()
        params.set('populate[0]', 'coverImage')
        params.set('populate[1]', 'property')
        params.set('populate[2]', 'author')
        params.set('pagination[pageSize]', '500')
        params.set('sort[0]', 'id:desc')

        if (filterPropertyId.value) {
            params.set('filters[property][documentId][$eq]', filterPropertyId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        if (filterStatus.value) {
            params.set('filters[status][$eq]', filterStatus.value)
        }
        if (filterCategory.value) {
            params.set('filters[category][$eq]', filterCategory.value)
        }
        if (filterPriority.value) {
            params.set('filters[priority][$eq]', filterPriority.value)
        }
        if (filterPinned.value) {
            params.set('filters[isPinned][$eq]', 'true')
        }
        if (searchQuery.value.trim()) {
            const q = searchQuery.value.trim()
            params.set('filters[$or][0][title][$containsi]', q)
            params.set('filters[$or][1][excerpt][$containsi]', q)
        }

        const res = await fetch(`${STRAPI_URL}/api/announcements?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        allAnnouncements.value = (data.data ?? []).map((a: any) => ({
            ...a,
            coverImage: a.coverImage ?? null,
            property: a.property ?? null,
            author: a.author ?? null,
            tags: a.tags ?? [],
        }))
    } catch {
        showToast('error', t.value.announcementLoadError)
    } finally {
        isLoading.value = false
    }
}

watch([filterPropertyId, filterStatus, filterCategory, filterPriority, filterPinned, searchQuery], () => {
    currentPage.value = 1
    fetchAnnouncements()
}, { debounce: 300 } as any)

watch(currentPage, () => {
    nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
})

// ─── Delete ───────────────────────────────────────────────────────────────────
function confirmDelete(ann: Announcement) {
    deleteTarget.value = ann
    showDeleteModal.value = true
}

async function deleteAnnouncement() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/announcements/${deleteTarget.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        showToast('success', t.value.announcementDeleted)
        showDeleteModal.value = false
        deleteTarget.value = null
        await fetchAnnouncements()
    } catch {
        showToast('error', t.value.announcementDeleteError)
    } finally {
        isDeleting.value = false
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToAnnouncement(documentId: string) {
    router.push(`/manager/announcements/${documentId}`)
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}


function getImageUrl(img: { url: string; formats?: any } | null) {
    if (!img) return ''
    if (img.formats?.medium?.url) return `${STRAPI_URL}${img.formats.medium.url}`
    if (img.formats?.small?.url) return `${STRAPI_URL}${img.formats.small.url}`
    return `${STRAPI_URL}${img.url}`
}

function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, '').substring(0, 150)
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const filtersVisible = ref(false)
const listVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        filtersVisible.value = true
    }))
    await fetchProperties()
    if (propertiesList.value.length > 0) {
        filterPropertyId.value = String(propertiesList.value[0]?.documentId ?? '')
    }
    initializing = false
    await fetchAnnouncements()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6">
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
                        <i :class="toast.type === 'success' ? 'fa-solid fa-check' : 'fa-solid fa-circle-exclamation'"
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
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.announcementsTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.announcementsSubtitle }}</p>
            </div>
            <NuxtLink to="/manager/announcements/create"
                class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm">
                <i class="fa-solid fa-plus text-xs"></i>
                {{ t.createAnnouncement }}
            </NuxtLink>
        </div>

        <!-- Filters -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 sm:p-4 transition-all duration-500 delay-100"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <!-- Search - Full width on mobile -->
            <div class="relative w-full mb-3">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchAnnouncements"
                    class="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            <!-- Filters grid -->
            <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                <!-- Property filter -->
                <div class="relative col-span-2 sm:col-span-1">
                    <select v-model="filterPropertyId"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allProperties }}</option>
                        <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                            {{ prop.name }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Status filter -->
                <div class="relative">
                    <select v-model="filterStatus"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allStatuses }}</option>
                        <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Category filter -->
                <div class="relative">
                    <select v-model="filterCategory"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allCategories }}</option>
                        <option v-for="c in categories" :key="c" :value="c">{{ categoryLabels[c] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Priority filter -->
                <div class="relative">
                    <select v-model="filterPriority"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allPriorities }}</option>
                        <option v-for="p in priorities" :key="p" :value="p">{{ priorityLabels[p] }}</option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Pinned toggle -->
                <button @click="filterPinned = !filterPinned"
                    class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors"
                    :class="filterPinned
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'">
                    <i class="fa-solid fa-thumbtack text-xs"></i>
                    <span class="hidden sm:inline">{{ t.pinned }}</span>
                </button>


            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingAnnouncements }}</p>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="allAnnouncements.length === 0"
            class="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <i class="fa-solid fa-bullhorn text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noAnnouncements }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.noAnnouncementsDesc }}</p>
            <NuxtLink to="/manager/announcements/create"
                class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                <i class="fa-solid fa-plus text-xs"></i>
                {{ t.createAnnouncement }}
            </NuxtLink>
        </div>

        <!-- Announcement Cards Grid -->
        <div v-else class="space-y-6">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <div v-for="(ann, idx) in announcements" :key="ann.id" @click="goToAnnouncement(ann.documentId)"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                    :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
                    :style="{ transitionDelay: `${idx * 50}ms` }">
                    <!-- Cover Image -->
                    <div class="relative h-40 sm:h-48 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <img v-if="ann.coverImage" :src="getImageUrl(ann.coverImage)" :alt="ann.title"
                            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div v-else class="w-full h-full flex items-center justify-center">
                            <i :class="categoryIcons[ann.category]"
                                class="text-4xl text-gray-300 dark:text-gray-600"></i>
                        </div>

                        <!-- Category badge -->
                        <div class="absolute top-3 left-3">
                            <span :class="categoryColors[ann.category]"
                                class="px-2.5 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1 backdrop-blur-sm bg-opacity-90">
                                <i :class="categoryIcons[ann.category]" class="text-[10px]"></i>
                                {{ categoryLabels[ann.category] }}
                            </span>
                        </div>

                        <!-- Pinned badge -->
                        <div v-if="ann.isPinned" class="absolute top-3 right-3">
                            <span class="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center">
                                <i class="fa-solid fa-thumbtack text-white text-xs"></i>
                            </span>
                        </div>

                        <!-- Priority badge for urgent/important -->
                        <div v-if="ann.priority !== 'normal'" class="absolute bottom-3 left-3">
                            <span :class="priorityColors[ann.priority]" class="px-2 py-0.5 rounded text-xs font-medium">
                                {{ priorityLabels[ann.priority] }}
                            </span>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <!-- Status & Date -->
                        <div class="flex items-center justify-between mb-2">
                            <span :class="statusColors[ann.status]" class="px-2 py-0.5 rounded text-xs font-medium">
                                {{ statusLabels[ann.status] }}
                            </span>
                            <span class="text-xs text-gray-400">{{ formatDate(ann.publishDate || ann.createdAt)
                            }}</span>
                        </div>

                        <!-- Title -->
                        <h3
                            class="font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {{ ann.title }}
                        </h3>

                        <!-- Excerpt -->
                        <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                            {{ ann.excerpt || stripHtml(ann.content) }}
                        </p>

                        <!-- Footer -->
                        <div
                            class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                            <div class="flex items-center gap-3 text-xs text-gray-400">
                                <span v-if="ann.property" class="flex items-center gap-1">
                                    <i class="fa-solid fa-house text-[10px]"></i>
                                    {{ ann.property.name }}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="fa-solid fa-eye text-[10px]"></i>
                                    {{ ann.viewCount }}
                                </span>
                            </div>

                            <!-- Actions -->
                            <div class="flex items-center gap-0.5" @click.stop>
                                <NuxtLink :to="`/manager/announcements/${ann.documentId}/edit`"
                                    class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    title="Edit">
                                    <i class="fa-solid fa-pen text-gray-500 dark:text-gray-400 text-sm"></i>
                                </NuxtLink>
                                <button @click.stop="confirmDelete(ann)"
                                    class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete">
                                    <i class="fa-solid fa-trash text-red-500 text-sm"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Pagination -->
            <div
                class="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-800">
                <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    <span>{{ totalCount }} {{ totalCount !== 1 ? t.announcementFoundPlural : t.announcementFound
                    }}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
                        class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <i class="fa-solid fa-angle-left text-gray-600 dark:text-gray-300 text-sm"></i>
                    </button>
                    <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 px-2 min-w-[60px] text-center">
                        {{ currentPage }} / {{ totalPages }}
                    </span>
                    <button @click="currentPage = Math.min(totalPages, currentPage + 1)"
                        :disabled="currentPage === totalPages"
                        class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <i class="fa-solid fa-angle-right text-gray-600 dark:text-gray-300 text-sm"></i>
                    </button>
                </div>
            </div>
        </div>

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
                                <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteAnnouncement }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ t.deleteAnnouncementConfirm }} <strong class="text-gray-900 dark:text-white">"{{
                                        deleteTarget?.title }}"</strong>{{ t.deleteAnnouncementConfirm2 }}
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showDeleteModal = false; deleteTarget = null" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="deleteAnnouncement" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isDeleting" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
