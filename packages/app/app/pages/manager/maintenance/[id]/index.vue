<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const { joinMaintenance, leaveMaintenance, onNewMaintenanceMessage, onMaintenanceUpdated, isConnected } = useSocket()
const router = useRouter()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const maintenanceDocumentId = route.params.id as string
const LAST_SEEN_KEY = 'pm-maint-last-seen-manager'

interface MaintenanceMessage {
    id: number
    documentId: string
    message: string
    createdAt: string
    isInternal: boolean
    isRead: boolean
    readAt?: string | null
    sender: { id: number; username: string; email: string } | null
    images: { id: number; url: string; formats?: any }[] | null
}

interface MaintenanceRequest {
    id: number
    documentId: string
    requestNumber: string
    title: string
    description: string
    category: string
    priority: string
    status: string
    roomNumber: string | null
    scheduledDate: string | null
    completedDate: string | null
    assignedTo: string | null
    estimatedCost: number | null
    actualCost: number | null
    resolutionNotes: string | null
    createdAt: string
    images: { id: number; url: string; formats?: any }[] | null
    resident: { id: number; username: string; email: string; roomNumber: string | null } | null
    property: { id: number; documentId: string; name: string } | null
    messages: MaintenanceMessage[]
}

const request = ref<MaintenanceRequest | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

// Complete
const showCompleteModal = ref(false)
const isCompleting = ref(false)

// Messaging
const newMessage = ref('')
const isSendingMessage = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const selectedImages = ref<File[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)

// Image viewer
const showImageViewer = ref(false)
const viewerImages = ref<{ url: string }[]>([])
const viewerIndex = ref(0)

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    on_hold: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    resolved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    medium: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    urgent: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

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

const statusLabels = computed(() => ({
    pending: t.value.pending,
    in_progress: t.value.in_progress,
    on_hold: t.value.on_hold,
    resolved: t.value.resolved,
    cancelled: t.value.cancelled,
}))

const categoryLabels = computed(() => ({
    plumbing: t.value.plumbing,
    electrical: t.value.electrical,
    hvac: t.value.hvac,
    appliance: t.value.appliance,
    structural: t.value.structural,
    cleaning: t.value.cleaning,
    pest_control: t.value.pest_control,
    other: t.value.other,
}))

const priorityLabels = computed(() => ({
    low: t.value.low,
    medium: t.value.medium,
    high: t.value.high,
    urgent: t.value.urgent,
}))

// Toast
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
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(amount: number | null) {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB' }).format(amount)
}

function formatMessageTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
        return `${t.value.yesterday} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    } else {
        return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    }
}

function getImageUrl(img: { url: string; formats?: any }) {
    if (img.formats?.medium?.url) return `${STRAPI_URL}${img.formats.medium.url}`
    if (img.formats?.small?.url) return `${STRAPI_URL}${img.formats.small.url}`
    return `${STRAPI_URL}${img.url}`
}

function getFullImageUrl(img: { url: string; formats?: any }) {
    if (img.formats?.large?.url) return `${STRAPI_URL}${img.formats.large.url}`
    return `${STRAPI_URL}${img.url}`
}

// ─── Fetch Request ────────────────────────────────────────────────────────────
async function fetchRequest() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'property',
            'populate[2]': 'images',
            'populate[3]': 'messages',
            'populate[4]': 'messages.sender',
            'populate[5]': 'messages.images',
        })
        const res = await fetch(`${STRAPI_URL}/api/maintenances/${maintenanceDocumentId}?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        request.value = data.data ?? null
        if (!request.value) throw new Error('Not found')

        // Sort messages by createdAt
        if (request.value.messages) {
            request.value.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        }

        await ensureScrollToBottom()
        await markMessagesAsRead()
        recordLastSeen()
    } catch {
        errorMessage.value = t.value.maintenanceLoadError
    } finally {
        isLoading.value = false
    }
}

function scrollToBottom() {
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
}

async function ensureScrollToBottom() {
    await nextTick()
    requestAnimationFrame(() => scrollToBottom())
}

// Optimistically mark unread messages (not sent by me) as read
async function markMessagesAsRead() {
    if (!request.value || !request.value.messages?.length) return
    const unread = request.value.messages.filter(m => m.sender?.id !== user.value?.id && !m.isRead)
    if (unread.length === 0) return

    const now = new Date().toISOString()
    unread.forEach(m => {
        m.isRead = true
        m.readAt = now
    })

    try {
        await fetch(`${STRAPI_URL}/api/maintenance-messages/mark-read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({ maintenanceDocumentId: maintenanceDocumentId }),
        })
    } catch { /* silent */ }

    recordLastSeen()
}

function recordLastSeen() {
    if (typeof localStorage === 'undefined') return
    try {
        const raw = localStorage.getItem(LAST_SEEN_KEY)
        const map = raw ? JSON.parse(raw) as Record<string, number> : {}
        map[maintenanceDocumentId] = Date.now()
        localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map))
    } catch { /* ignore */ }
}

// ─── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage() {
    if (!newMessage.value.trim() && selectedImages.value.length === 0) return
    if (!request.value) return

    isSendingMessage.value = true
    try {
        // Upload images first if any
        let uploadedImageIds: number[] = []
        if (selectedImages.value.length > 0) {
            const formData = new FormData()
            selectedImages.value.forEach(file => {
                formData.append('files', file)
            })
            const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token.value}` },
                body: formData,
            })
            if (!uploadRes.ok) throw new Error('Upload failed')
            const uploadedFiles = await uploadRes.json()
            uploadedImageIds = uploadedFiles.map((f: any) => f.id)
        }

        // Create message
        const body: any = {
            data: {
                message: newMessage.value.trim(),
                maintenance: request.value.documentId,
                sender: user.value?.id,
                isInternal: false,
            },
        }
        if (uploadedImageIds.length > 0) {
            body.data.images = uploadedImageIds
        }

        const res = await fetch(`${STRAPI_URL}/api/maintenance-messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to send message')

        newMessage.value = ''
        selectedImages.value = []
        showToast('success', t.value.messageSent)
        if (!isConnected.value) {
            await fetchRequest()
        }
    } catch {
        showToast('error', t.value.messageError)
    } finally {
        isSendingMessage.value = false
    }
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
    }
}

function selectImages() {
    imageInputRef.value?.click()
}

function handleImageSelect(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) {
        const files = Array.from(input.files).slice(0, 5 - selectedImages.value.length)
        selectedImages.value.push(...files)
    }
    input.value = ''
}

function removeSelectedImage(index: number) {
    selectedImages.value.splice(index, 1)
}

function openImageViewer(images: { url: string; formats?: any }[], index: number) {
    viewerImages.value = images.map(img => ({ url: getFullImageUrl(img) }))
    viewerIndex.value = index
    showImageViewer.value = true
}

// ─── Complete ─────────────────────────────────────────────────────────────────
async function completeRequest() {
    if (!request.value) return
    isCompleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/maintenances/${request.value.documentId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: {
                    status: 'resolved',
                    completedDate: new Date().toISOString()
                }
            }),
        })
        if (!res.ok) throw new Error('Complete failed')
        showCompleteModal.value = false
        showToast('success', t.value.maintenanceCompleted)
        if (!isConnected.value) {
            await fetchRequest()
        }
    } catch {
        showToast('error', t.value.maintenanceCompleteError)
    } finally {
        isCompleting.value = false
    }
}

// ─── Entry Animation ─────────────────────────────────────────────────────────
const sectionsVisible = ref(false)

// ─── Socket Event Cleanup Functions ───────────────────────────────────────────
const cleanupFunctions: Array<() => void> = []

onMounted(async () => {
    await fetchRequest()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sectionsVisible.value = true
    }))

    // Join the maintenance room for real-time updates
    joinMaintenance(maintenanceDocumentId)

    // Real-time: new maintenance message
    cleanupFunctions.push(
        onNewMaintenanceMessage((data) => {
            if (data.maintenanceDocumentId === maintenanceDocumentId && request.value) {
                const exists = request.value.messages?.some(m => m.documentId === data.message.documentId)
                if (!exists) {
                    if (!request.value.messages) request.value.messages = []
                    const incoming = { ...(data.message as any) }
                    if (incoming.sender?.id === user.value?.id) {
                        incoming.isRead = true
                    }
                    request.value.messages.push(incoming)
                    ensureScrollToBottom()
                    if (incoming.sender?.id !== user.value?.id) {
                        markMessagesAsRead()
                    }
                }
            }
        })
    )

    // Real-time: maintenance status/field updates
    cleanupFunctions.push(
        onMaintenanceUpdated((data) => {
            if (data.maintenanceDocumentId === maintenanceDocumentId && request.value) {
                fetchRequest()
            }
        })
    )
})

onUnmounted(() => {
    cleanupFunctions.forEach(fn => fn())
    cleanupFunctions.length = 0
    leaveMaintenance(maintenanceDocumentId)
})
</script>

<template>
    <div class="max-w-5xl mx-auto space-y-6">
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
                        <i :class="toast.type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="fa-solid fa-xmark text-xs"></i></button>
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
            <i class="fa-solid fa-circle-exclamation text-4xl text-red-400 mb-4"></i>
            <p class="text-gray-600 dark:text-gray-400">{{ errorMessage }}</p>
            <NuxtLink to="/manager/maintenance" class="mt-4 text-sm text-primary-600 hover:underline">{{
                t.backToMaintenance }}
            </NuxtLink>
        </div>

        <template v-else-if="request">
            <!-- Header -->
            <div class="flex items-start justify-between gap-4 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-start gap-4">
                    <NuxtLink to="/manager/maintenance"
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0 mt-1">
                        <i class="fa-solid fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </NuxtLink>
                    <div>
                        <div class="flex items-center gap-3 mb-1 flex-wrap">
                            <span class="text-sm font-mono text-gray-400">{{ request.requestNumber }}</span>
                            <span :class="statusColors[request.status]"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold">
                                {{ statusLabels[request.status] }}
                            </span>
                            <span :class="priorityColors[request.priority]"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold">
                                {{ priorityLabels[request.priority] }}
                            </span>
                        </div>
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ request.title }}</h1>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {{ formatDateTime(request.createdAt) }}
                            <span v-if="request.resident"> · {{ request.resident.username }}</span>
                            <span v-if="request.roomNumber"> · Room {{ request.roomNumber }}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left Column: Details -->
                <div class="lg:col-span-2 space-y-6">
                    <!-- Description -->
                    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 transition-all duration-500 delay-100"
                        :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                        <h3
                            class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                            <i :class="categoryIcons[request.category]" class="text-primary-500"></i>
                            {{ categoryLabels[request.category] }}
                        </h3>
                        <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ request.description }}</p>

                        <!-- Request Images -->
                        <div v-if="request.images && request.images.length > 0" class="mt-6">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">{{ t.attachImages }}</p>
                            <div class="flex flex-wrap gap-2">
                                <button v-for="(img, idx) in request.images" :key="img.id"
                                    @click="openImageViewer(request.images!, idx)"
                                    class="relative group rounded-lg overflow-hidden w-24 h-24 bg-gray-100 dark:bg-gray-800">
                                    <img :src="getImageUrl(img)" :alt="`Image ${idx + 1}`"
                                        class="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    <div
                                        class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <i class="fa-solid fa-magnifying-glass-plus text-white text-lg"></i>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Discussion -->
                    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-all duration-500 delay-200"
                        :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
                            <h3
                                class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <i class="fa-solid fa-comments text-primary-500"></i>
                                {{ t.discussion }}
                                <span v-if="request.messages?.length"
                                    class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-normal text-gray-500">
                                    {{ request.messages.length }}
                                </span>
                            </h3>
                        </div>

                        <!-- Messages -->
                        <div ref="messagesContainer"
                            class="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950">
                            <div v-if="!request.messages || request.messages.length === 0"
                                class="flex flex-col items-center justify-center h-full text-gray-400">
                                <i class="fa-solid fa-message text-3xl mb-2"></i>
                                <p class="text-sm">{{ t.noMessages }}</p>
                            </div>

                            <div v-for="msg in request.messages" :key="msg.id" class="flex gap-3"
                                :class="msg.sender?.id === user?.id ? 'flex-row-reverse' : ''">
                                <!-- Avatar -->
                                <div
                                    class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                                    <i class="fa-solid fa-user text-primary-500 text-xs"></i>
                                </div>

                                <!-- Message bubble -->
                                <div class="max-w-[75%] space-y-1">
                                    <div class="flex items-center gap-2"
                                        :class="msg.sender?.id === user?.id ? 'flex-row-reverse' : ''">
                                        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                                            {{ msg.sender?.username || 'Unknown' }}
                                        </span>
                                        <span class="text-[10px] text-gray-400">{{ formatMessageTime(msg.createdAt)
                                        }}</span>
                                    </div>
                                    <div class="rounded-2xl px-4 py-2.5 text-sm"
                                        :class="msg.sender?.id === user?.id
                                            ? 'bg-primary-600 text-white rounded-br-md'
                                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-md'">
                                        <p class="whitespace-pre-wrap">{{ msg.message }}</p>
                                    </div>

                                    <!-- Message Images -->
                                    <div v-if="msg.images && msg.images.length > 0" class="flex flex-wrap gap-1 mt-1">
                                        <button v-for="(img, idx) in msg.images" :key="img.id"
                                            @click="openImageViewer(msg.images!, idx)"
                                            class="relative group rounded-lg overflow-hidden w-16 h-16 bg-gray-100 dark:bg-gray-800">
                                            <img :src="getImageUrl(img)" :alt="`Image ${idx + 1}`"
                                                class="w-full h-full object-cover" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Message Input -->
                        <div class="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                            <!-- Selected images preview -->
                            <div v-if="selectedImages.length > 0" class="flex flex-wrap gap-2 mb-3">
                                <div v-for="(file, idx) in selectedImages" :key="idx"
                                    class="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                    <img :src="URL.createObjectURL(file)" alt="Preview"
                                        class="w-full h-full object-cover" />
                                    <button @click="removeSelectedImage(idx)"
                                        class="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                                        <i class="fa-solid fa-xmark text-white text-[10px]"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="flex items-center gap-2">
                                <input ref="imageInputRef" type="file" accept="image/*" multiple class="hidden"
                                    @change="handleImageSelect" />
                                <button @click="selectImages" :disabled="selectedImages.length >= 5"
                                    class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 shrink-0"
                                    :title="t.attachImage">
                                    <i class="fa-solid fa-image text-gray-500 dark:text-gray-400"></i>
                                </button>
                                <div class="flex-1 relative">
                                    <input v-model="newMessage" type="text" :placeholder="t.writeMessage"
                                        @keydown="handleKeydown"
                                        class="w-full h-10 px-4 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                </div>
                                <button @click="sendMessage"
                                    :disabled="isSendingMessage || (!newMessage.trim() && selectedImages.length === 0)"
                                    class="p-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl transition-colors shrink-0">
                                    <i v-if="isSendingMessage" class="fa-solid fa-spinner fa-spin text-white"></i>
                                    <i v-else class="fa-solid fa-paper-plane text-white"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right Column: Info & Resolution -->
                <div class="space-y-6">
                    <!-- Request Info -->
                    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 transition-all duration-500 delay-150"
                        :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                        <h3
                            class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <i class="fa-solid fa-circle-info text-primary-500"></i>
                            {{ t.requestDetails }}
                        </h3>

                        <div class="space-y-3 text-sm">
                            <!-- Property -->
                            <div v-if="request.property"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.property }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{ request.property.name
                                }}</span>
                            </div>

                            <!-- Room -->
                            <div v-if="request.roomNumber"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.roomNo }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{ request.roomNumber }}</span>
                            </div>

                            <!-- Resident -->
                            <div v-if="request.resident"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.residentInfo }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{ request.resident.username
                                }}</span>
                            </div>

                            <!-- Category -->
                            <div
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.categoryLabel }}</span>
                                <span class="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                                    <i :class="categoryIcons[request.category]" class="text-xs"></i>
                                    {{ categoryLabels[request.category] }}
                                </span>
                            </div>

                            <!-- Priority -->
                            <div
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.priorityLabel }}</span>
                                <span :class="priorityColors[request.priority]"
                                    class="px-2 py-0.5 rounded-full text-xs font-medium">
                                    {{ priorityLabels[request.priority] }}
                                </span>
                            </div>

                            <!-- Status -->
                            <div
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.statusLabel }}</span>
                                <span :class="statusColors[request.status]"
                                    class="px-2 py-0.5 rounded-full text-xs font-medium">
                                    {{ statusLabels[request.status] }}
                                </span>
                            </div>

                            <!-- Assigned To -->
                            <div v-if="request.assignedTo"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.assignedTo }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{ request.assignedTo }}</span>
                            </div>

                            <!-- Scheduled Date -->
                            <div v-if="request.scheduledDate"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.scheduledDate }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{
                                    formatDateTime(request.scheduledDate) }}</span>
                            </div>

                            <!-- Completed Date -->
                            <div v-if="request.completedDate" class="flex items-center justify-between py-2">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.completedDate }}</span>
                                <span class="font-medium text-emerald-600 dark:text-emerald-400">{{
                                    formatDateTime(request.completedDate) }}</span>
                            </div>
                        </div>

                        <!-- Complete Button -->
                        <button @click="showCompleteModal = true"
                            class="w-full px-4 py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                            <i class="fa-solid fa-circle-check"></i>
                            <span>{{ t.completeMaintenanceButton }}</span>
                        </button>
                    </div>

                    <!-- Cost Info -->
                    <div v-if="request.estimatedCost || request.actualCost"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 transition-all duration-500 delay-200"
                        :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                        <h3
                            class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <i class="fa-solid fa-receipt text-primary-500"></i>
                            {{ t.financial }}
                        </h3>

                        <div class="space-y-3 text-sm">
                            <div v-if="request.estimatedCost"
                                class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.estimatedCost }}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{{
                                    formatCurrency(request.estimatedCost) }}</span>
                            </div>
                            <div v-if="request.actualCost" class="flex items-center justify-between py-2">
                                <span class="text-gray-500 dark:text-gray-400">{{ t.actualCost }}</span>
                                <span class="font-semibold text-primary-600 dark:text-primary-400">{{
                                    formatCurrency(request.actualCost) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Resolution Notes -->
                    <div v-if="request.resolutionNotes"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-all duration-500 delay-250"
                        :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                        <h3
                            class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-3">
                            <i class="fa-solid fa-circle-check text-emerald-500"></i>
                            {{ t.resolutionNotes }}
                        </h3>
                        <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{
                            request.resolutionNotes }}</p>
                    </div>
                </div>
            </div>
        </template>

        <!-- Complete Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showCompleteModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6">
                        <div class="flex items-start gap-4">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                <i class="fa-solid fa-circle-check text-emerald-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {{ t.completeMaintenance }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ t.completeMaintenanceConfirm }}
                                    <strong class="text-gray-900 dark:text-white">
                                        {{ request?.requestNumber }}
                                    </strong>
                                    {{ t.completeMaintenanceConfirm2 }}
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showCompleteModal = false" :disabled="isCompleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="completeRequest" :disabled="isCompleting"
                                class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isCompleting" class="fa-solid fa-spinner fa-spin text-xs"></i>
                                {{ t.completeMaintenance }}
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
                        <i class="fa-solid fa-xmark text-2xl"></i>
                    </button>

                    <!-- Navigation -->
                    <button v-if="viewerImages.length > 1"
                        @click.stop="viewerIndex = (viewerIndex - 1 + viewerImages.length) % viewerImages.length"
                        class="absolute left-4 p-3 text-white/70 hover:text-white transition-colors">
                        <i class="fa-solid fa-angle-left text-3xl"></i>
                    </button>
                    <button v-if="viewerImages.length > 1"
                        @click.stop="viewerIndex = (viewerIndex + 1) % viewerImages.length"
                        class="absolute right-4 p-3 text-white/70 hover:text-white transition-colors">
                        <i class="fa-solid fa-angle-right text-3xl"></i>
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
