<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface User {
    id: number
    documentId: string
    username: string
    email: string
    roomNumber: string | null
    property?: { id: number; name: string } | null
}

interface Message {
    id: number
    documentId: string
    content: string
    createdAt: string
    isRead: boolean
    isEdited: boolean
    sender: User | null
    images: { id: number; url: string }[] | null
}

interface Conversation {
    id: number
    documentId: string
    participants: User[]
    property: { id: number; name: string } | null
    lastMessage: string | null
    lastMessageAt: string | null
    isActive: boolean
    messages?: Message[]
    unreadCount?: number
}

interface Property {
    id: number
    documentId: string
    name: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const conversations = ref<Conversation[]>([])
const selectedConversation = ref<Conversation | null>(null)
const messages = ref<Message[]>([])
const isLoadingConversations = ref(true)
const isLoadingMessages = ref(false)
const isSending = ref(false)
const newMessage = ref('')
const searchQuery = ref('')

// ─── New Conversation Modal ───────────────────────────────────────────────────
const showNewConversationModal = ref(false)
const residents = ref<User[]>([])
const propertiesList = ref<Property[]>([])
const selectedPropertyId = ref('')
const selectedResidentId = ref('')
const isLoadingResidents = ref(false)
const residentSearchQuery = ref('')

// ─── Mobile View ──────────────────────────────────────────────────────────────
const showChatOnMobile = ref(false)

// ─── Message Container Ref ────────────────────────────────────────────────────
const messagesContainer = ref<HTMLElement | null>(null)

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

// ─── Fetch Conversations ──────────────────────────────────────────────────────
async function fetchConversations() {
    isLoadingConversations.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'participants',
            'populate[1]': 'property',
            'sort[0]': 'lastMessageAt:desc',
            'pagination[pageSize]': '100',
        })
        // Filter by current user as participant
        if (user.value?.id) {
            params.set('filters[participants][id][$in]', String(user.value.id))
        }
        const res = await fetch(`${STRAPI_URL}/api/conversations?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch conversations')
        const data = await res.json()
        conversations.value = (data.data ?? []).map((c: any) => ({
            id: c.id,
            documentId: c.documentId,
            participants: c.participants ?? [],
            property: c.property,
            lastMessage: c.lastMessage,
            lastMessageAt: c.lastMessageAt,
            isActive: c.isActive,
        }))
    } catch {
        showToast('error', 'Failed to load conversations')
    } finally {
        isLoadingConversations.value = false
    }
}

// ─── Fetch Messages for a Conversation ────────────────────────────────────────
async function fetchMessages(conversationId: string) {
    isLoadingMessages.value = true
    try {
        const params = new URLSearchParams({
            'filters[conversation][documentId][$eq]': conversationId,
            'populate[0]': 'sender',
            'populate[1]': 'images',
            'sort[0]': 'createdAt:asc',
            'pagination[pageSize]': '200',
        })
        const res = await fetch(`${STRAPI_URL}/api/messages?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch messages')
        const data = await res.json()
        messages.value = (data.data ?? []).map((m: any) => ({
            id: m.id,
            documentId: m.documentId,
            content: m.content,
            createdAt: m.createdAt,
            isRead: m.isRead,
            isEdited: m.isEdited,
            sender: m.sender,
            images: m.images?.map((img: any) => ({ id: img.id, url: img.url })) ?? null,
        }))
        await nextTick()
        scrollToBottom()
    } catch {
        showToast('error', 'Failed to load messages')
    } finally {
        isLoadingMessages.value = false
    }
}

// ─── Scroll to bottom of messages ─────────────────────────────────────────────
function scrollToBottom() {
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
}

// ─── Select Conversation ──────────────────────────────────────────────────────
async function selectConversation(conversation: Conversation) {
    selectedConversation.value = conversation
    showChatOnMobile.value = true
    await fetchMessages(conversation.documentId)
}

// ─── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage() {
    if (!newMessage.value.trim() || !selectedConversation.value || isSending.value) return
    isSending.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    content: newMessage.value.trim(),
                    conversation: selectedConversation.value.documentId,
                    sender: user.value?.documentId,
                    isRead: false,
                },
            }),
        })
        if (!res.ok) throw new Error('Failed to send message')

        // Update conversation's lastMessage
        await fetch(`${STRAPI_URL}/api/conversations/${selectedConversation.value.documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    lastMessage: newMessage.value.trim(),
                    lastMessageAt: new Date().toISOString(),
                },
            }),
        })

        newMessage.value = ''
        await fetchMessages(selectedConversation.value.documentId)
        await fetchConversations()
    } catch {
        showToast('error', 'Failed to send message')
    } finally {
        isSending.value = false
    }
}

// ─── Fetch Properties ─────────────────────────────────────────────────────────
async function fetchProperties() {
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/properties?pagination[pageSize]=200&fields[0]=name`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            name: p.name,
        }))
    } catch { /* ignore */ }
}

// ─── Fetch Residents for New Conversation ─────────────────────────────────────
async function fetchResidents() {
    if (!selectedPropertyId.value) {
        residents.value = []
        return
    }
    isLoadingResidents.value = true
    try {
        const params = new URLSearchParams({
            'filters[role][id][$eq]': '4', // Resident role
            'filters[property][id][$eq]': selectedPropertyId.value,
            'pagination[pageSize]': '200',
            'fields[0]': 'username',
            'fields[1]': 'email',
            'fields[2]': 'roomNumber',
        })
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        residents.value = (Array.isArray(data) ? data : (data.data ?? [])).map((u: any) => ({
            id: u.id,
            documentId: u.documentId,
            username: u.username,
            email: u.email,
            roomNumber: u.roomNumber,
        }))
    } catch {
        showToast('error', 'Failed to load residents')
    } finally {
        isLoadingResidents.value = false
    }
}

// ─── Filtered Residents ───────────────────────────────────────────────────────
const filteredResidents = computed(() => {
    if (!residentSearchQuery.value.trim()) return residents.value
    const q = residentSearchQuery.value.toLowerCase()
    return residents.value.filter(r =>
        r.username.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(q))
    )
})

// ─── Start New Conversation ───────────────────────────────────────────────────
async function startNewConversation() {
    if (!selectedResidentId.value || !selectedPropertyId.value) return

    const resident = residents.value.find(r => String(r.id) === selectedResidentId.value)
    if (!resident) return

    // Check if conversation already exists
    const existingConversation = conversations.value.find(c =>
        c.participants.some(p => p.id === resident.id) &&
        c.participants.some(p => p.id === user.value?.id)
    )

    if (existingConversation) {
        showNewConversationModal.value = false
        selectedPropertyId.value = ''
        selectedResidentId.value = ''
        residentSearchQuery.value = ''
        await selectConversation(existingConversation)
        return
    }

    try {
        const property = propertiesList.value.find(p => String(p.id) === selectedPropertyId.value)
        const res = await fetch(`${STRAPI_URL}/api/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    participants: [user.value?.documentId, resident.documentId],
                    property: property?.documentId,
                    isActive: true,
                },
            }),
        })
        if (!res.ok) throw new Error('Failed to create conversation')
        const data = await res.json()

        showNewConversationModal.value = false
        selectedPropertyId.value = ''
        selectedResidentId.value = ''
        residentSearchQuery.value = ''

        await fetchConversations()

        // Select the new conversation
        const newConv = conversations.value.find(c => c.documentId === data.data.documentId)
        if (newConv) {
            await selectConversation(newConv)
        }

        showToast('success', 'Conversation started')
    } catch {
        showToast('error', 'Failed to start conversation')
    }
}

// ─── Get Other Participant (not current user) ─────────────────────────────────
function getOtherParticipant(conversation: Conversation): User | null {
    return conversation.participants.find(p => p.id !== user.value?.id) ?? null
}

// ─── Format Time ──────────────────────────────────────────────────────────────
function formatTime(dateStr: string | null) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
        return t.value.yesterday
    } else if (diffDays < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    }
}

function formatMessageTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// ─── Filtered Conversations ───────────────────────────────────────────────────
const filteredConversations = computed(() => {
    if (!searchQuery.value.trim()) return conversations.value
    const q = searchQuery.value.toLowerCase()
    return conversations.value.filter(c => {
        const other = getOtherParticipant(c)
        return (
            (other?.username && other.username.toLowerCase().includes(q)) ||
            (other?.email && other.email.toLowerCase().includes(q)) ||
            (c.property?.name && c.property.name.toLowerCase().includes(q)) ||
            (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
        )
    })
})

// ─── Watch Property Selection ─────────────────────────────────────────────────
watch(selectedPropertyId, () => {
    selectedResidentId.value = ''
    residentSearchQuery.value = ''
    fetchResidents()
})

// ─── Entry Animation ──────────────────────────────────────────────────────────
const headerVisible = ref(false)
const contentVisible = ref(false)

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await Promise.all([fetchConversations(), fetchProperties()])
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        contentVisible.value = true
    }))
})
</script>

<template>
    <div class="h-[calc(100vh-7rem)] flex flex-col">
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

        <!-- Page Header -->
        <div class="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.messagesTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.messagesSubtitle }}</p>
            </div>
            <button @click="showNewConversationModal = true"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="ti-edit text-base"></i>
                {{ t.newConversation }}
            </button>
        </div>

        <!-- Main Chat Container -->
        <div class="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex transition-all duration-500"
            :class="contentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">

            <!-- Conversation List (Left Sidebar) -->
            <div class="w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-800 flex flex-col"
                :class="{ 'hidden md:flex': showChatOnMobile && selectedConversation }">
                <!-- Search -->
                <div class="p-3 border-b border-gray-200 dark:border-gray-800">
                    <div class="relative">
                        <i class="ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input v-model="searchQuery" type="text" :placeholder="t.searchMessages"
                            class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                </div>

                <!-- Conversations List -->
                <div class="flex-1 overflow-y-auto">
                    <!-- Loading -->
                    <div v-if="isLoadingConversations" class="flex items-center justify-center py-12">
                        <div class="flex flex-col items-center gap-3">
                            <div
                                class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                            <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.loadingConversations }}</span>
                        </div>
                    </div>

                    <!-- Empty State -->
                    <div v-else-if="filteredConversations.length === 0"
                        class="flex flex-col items-center justify-center py-12 px-4">
                        <div
                            class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <i class="ti-comment text-2xl text-gray-400"></i>
                        </div>
                        <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-1">{{ t.noConversations }}</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 text-center">{{ t.noConversationsDesc }}</p>
                    </div>

                    <!-- Conversation Items -->
                    <div v-else>
                        <button v-for="conv in filteredConversations" :key="conv.id" @click="selectConversation(conv)"
                            class="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800"
                            :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedConversation?.id === conv.id }">
                            <!-- Avatar -->
                            <div
                                class="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="ti-user text-primary-600 dark:text-primary-400 text-lg"></i>
                            </div>
                            <!-- Content -->
                            <div class="flex-1 min-w-0 text-left">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {{ getOtherParticipant(conv)?.username || 'Unknown' }}
                                    </span>
                                    <span class="text-xs text-gray-400 flex-shrink-0">
                                        {{ formatTime(conv.lastMessageAt) }}
                                    </span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {{ conv.lastMessage || t.noMessages }}
                                </p>
                                <div v-if="conv.property" class="flex items-center gap-1 mt-1">
                                    <i class="ti-home text-[10px] text-gray-400"></i>
                                    <span class="text-[10px] text-gray-400 truncate">{{ conv.property.name }}</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Chat Area (Right) -->
            <div class="flex-1 flex flex-col" :class="{ 'hidden md:flex': !showChatOnMobile || !selectedConversation }">
                <!-- No Conversation Selected -->
                <div v-if="!selectedConversation" class="flex-1 flex items-center justify-center">
                    <div class="text-center px-4">
                        <div
                            class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="ti-comment text-3xl text-gray-400"></i>
                        </div>
                        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">{{ t.selectConversation }}
                        </h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noConversationsDesc }}</p>
                    </div>
                </div>

                <!-- Conversation Selected -->
                <template v-else>
                    <!-- Chat Header -->
                    <div
                        class="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
                        <!-- Back button (mobile) -->
                        <button @click="showChatOnMobile = false; selectedConversation = null"
                            class="md:hidden p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            <i class="ti-arrow-left text-gray-600 dark:text-gray-400"></i>
                        </button>
                        <!-- Avatar -->
                        <div
                            class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <i class="ti-user text-primary-600 dark:text-primary-400"></i>
                        </div>
                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {{ getOtherParticipant(selectedConversation)?.username || 'Unknown' }}
                            </h3>
                            <p v-if="selectedConversation.property"
                                class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {{ selectedConversation.property.name }}
                            </p>
                        </div>
                    </div>

                    <!-- Messages Area -->
                    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
                        <!-- Loading Messages -->
                        <div v-if="isLoadingMessages" class="flex items-center justify-center py-8">
                            <div
                                class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                        </div>

                        <!-- No Messages -->
                        <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center py-12">
                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noMessages }}</p>
                        </div>

                        <!-- Messages -->
                        <template v-else>
                            <div v-for="msg in messages" :key="msg.id" class="flex"
                                :class="msg.sender?.id === user?.id ? 'justify-end' : 'justify-start'">
                                <div class="max-w-[75%] sm:max-w-[65%]"
                                    :class="msg.sender?.id === user?.id ? 'order-1' : ''">
                                    <!-- Message Bubble -->
                                    <div class="px-4 py-2 rounded-2xl"
                                        :class="msg.sender?.id === user?.id
                                            ? 'bg-primary-600 text-white rounded-br-md'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md'">
                                        <p class="text-sm whitespace-pre-wrap break-words">{{ msg.content }}</p>
                                        <!-- Images -->
                                        <div v-if="msg.images && msg.images.length > 0"
                                            class="mt-2 flex flex-wrap gap-2">
                                            <img v-for="img in msg.images" :key="img.id" :src="STRAPI_URL + img.url"
                                                alt="Image"
                                                class="max-w-[200px] max-h-[200px] rounded-lg object-cover cursor-pointer" />
                                        </div>
                                    </div>
                                    <!-- Time -->
                                    <div class="flex items-center gap-1 mt-1 px-1"
                                        :class="msg.sender?.id === user?.id ? 'justify-end' : 'justify-start'">
                                        <span class="text-[10px] text-gray-400">{{ formatMessageTime(msg.createdAt)
                                            }}</span>
                                        <span v-if="msg.isEdited" class="text-[10px] text-gray-400">({{ t.edited
                                            }})</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>

                    <!-- Message Input -->
                    <div class="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-800">
                        <form @submit.prevent="sendMessage" class="flex items-end gap-2">
                            <div class="flex-1 relative">
                                <textarea v-model="newMessage" :placeholder="t.typeMessage" rows="1"
                                    class="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                    @keydown.enter.exact.prevent="sendMessage"
                                    style="min-height: 42px; max-height: 120px;"></textarea>
                            </div>
                            <button type="submit" :disabled="!newMessage.trim() || isSending"
                                class="flex-shrink-0 w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center transition-colors">
                                <i v-if="isSending" class="ti-loader animate-spin"></i>
                                <i v-else class="ti-send"></i>
                            </button>
                        </form>
                    </div>
                </template>
            </div>
        </div>

        <!-- New Conversation Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showNewConversationModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                        <div v-if="showNewConversationModal"
                            class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                            <!-- Modal Header -->
                            <div
                                class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.newConversation }}
                                </h3>
                                <button @click="showNewConversationModal = false"
                                    class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    <i class="ti-close text-gray-500"></i>
                                </button>
                            </div>

                            <!-- Modal Body -->
                            <div class="p-6 space-y-4">
                                <!-- Property Select -->
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        {{ t.property }} <span class="text-red-500">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="ti-home absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                        <select v-model="selectedPropertyId"
                                            class="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                            <option value="">{{ t.selectProperty }}</option>
                                            <option v-for="prop in propertiesList" :key="prop.id"
                                                :value="String(prop.id)">
                                                {{ prop.name }}
                                            </option>
                                        </select>
                                        <i
                                            class="ti-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                                    </div>
                                </div>

                                <!-- Resident Select -->
                                <div v-if="selectedPropertyId">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        {{ t.selectResident }} <span class="text-red-500">*</span>
                                    </label>

                                    <!-- Search Residents -->
                                    <div class="relative mb-2">
                                        <i
                                            class="ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                        <input v-model="residentSearchQuery" type="text"
                                            :placeholder="t.searchResidents"
                                            class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                    </div>

                                    <!-- Loading Residents -->
                                    <div v-if="isLoadingResidents" class="py-4 text-center">
                                        <div
                                            class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto">
                                        </div>
                                    </div>

                                    <!-- Residents List -->
                                    <div v-else-if="filteredResidents.length > 0"
                                        class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                                        <button v-for="resident in filteredResidents" :key="resident.id"
                                            @click="selectedResidentId = String(resident.id)" type="button"
                                            class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                                            :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedResidentId === String(resident.id) }">
                                            <div
                                                class="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                                <i class="ti-user text-primary-600 dark:text-primary-400 text-sm"></i>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{
                                                    resident.username }}</p>
                                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    {{ resident.roomNumber ? `Room ${resident.roomNumber}` :
                                                    resident.email }}
                                                </p>
                                            </div>
                                            <i v-if="selectedResidentId === String(resident.id)"
                                                class="ti-check text-primary-600 dark:text-primary-400"></i>
                                        </button>
                                    </div>

                                    <!-- No Residents -->
                                    <div v-else class="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                        {{ t.noResidentsFound }}
                                    </div>
                                </div>
                            </div>

                            <!-- Modal Footer -->
                            <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
                                <button @click="showNewConversationModal = false"
                                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    {{ t.cancel }}
                                </button>
                                <button @click="startNewConversation"
                                    :disabled="!selectedPropertyId || !selectedResidentId"
                                    class="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 rounded-lg transition-colors">
                                    {{ t.startChat }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
