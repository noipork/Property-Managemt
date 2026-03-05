<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const { t, lang } = useI18n()
const { token, user } = useAuth()
const { joinConversation, leaveConversation, onNewMessage, onConversationUpdated, onUserTyping, onUserStopTyping, onConversationCreated, onConversationDeleted, onMessagesRead, emitTyping, emitStopTyping, isConnected } = useSocket()
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

// Remember last opened conversation
const LAST_CONV_KEY = 'pm-last-conversation'

// ─── Delete Conversation ──────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const conversationToDelete = ref<string | null>(null)
const isDeleting = ref(false)

// ─── Broadcast Message ────────────────────────────────────────────────────────
const showBroadcastModal = ref(false)
const broadcastPropertyId = ref('')
const broadcastResidents = ref<User[]>([])
const broadcastSelectedIds = ref<Set<number>>(new Set())
const broadcastMessage = ref('')
const broadcastSearchQuery = ref('')
const isLoadingBroadcastResidents = ref(false)
const isSendingBroadcast = ref(false)
const broadcastProgress = ref({ current: 0, total: 0 })

// ─── Message Container Ref ────────────────────────────────────────────────────
const messagesContainer = ref<HTMLElement | null>(null)

// ─── Typing Indicator ─────────────────────────────────────────────────────────
const typingUsers = ref<Map<string, string>>(new Map())
let typingTimeout: ReturnType<typeof setTimeout> | null = null

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
            unreadCount: c.unreadCount ?? 0,
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
        await ensureScrollToBottom()
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

// Ensure DOM has painted before trying to scroll
async function ensureScrollToBottom() {
    await nextTick()
    requestAnimationFrame(() => scrollToBottom())
}

// ─── Select Conversation ──────────────────────────────────────────────────────
let previousConversationId: string | null = null

async function selectConversation(conversation: Conversation) {
    if (previousConversationId) {
        leaveConversation(previousConversationId)
    }

    selectedConversation.value = conversation
    showChatOnMobile.value = true
    previousConversationId = conversation.documentId

    joinConversation(conversation.documentId)
    typingUsers.value.clear()

    // Persist last opened conversation to restore on refresh
    try {
        localStorage.setItem(LAST_CONV_KEY, conversation.documentId)
    } catch { /* ignore */ }

    await fetchMessages(conversation.documentId)

    // Mark notification badges as read for this conversation
    const { markReadByRelated } = useNotificationBadge()
    markReadByRelated(['message', 'conversation'], conversation.documentId)

    // Always mark messages as read when opening a conversation
    conversation.unreadCount = 0
    // Check if there are any unread messages from others
    const hasUnread = messages.value.some(m => m.sender?.id !== user.value?.id && !m.isRead)
    if (hasUnread) {
        // Update local state immediately
        messages.value.forEach(m => {
            if (m.sender?.id !== user.value?.id && !m.isRead) {
                m.isRead = true
            }
        })
        // Persist to server
        try {
            await fetch(`${STRAPI_URL}/api/messages/mark-read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({ conversationDocumentId: conversation.documentId }),
            })
        } catch { /* silent */ }
    }
}

// ─── Delete Conversation ──────────────────────────────────────────────────────
function openDeleteModal(conversationId: string) {
    conversationToDelete.value = conversationId
    showDeleteModal.value = true
}

async function confirmDeleteConversation() {
    if (!conversationToDelete.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/conversations/${conversationToDelete.value}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to delete conversation')

        if (selectedConversation.value?.documentId === conversationToDelete.value) {
            selectedConversation.value = null
            messages.value = []
        }
        await fetchConversations()
        showDeleteModal.value = false
        conversationToDelete.value = null
        showToast('success', 'Conversation deleted')
    } catch {
        showToast('error', 'Failed to delete conversation')
    } finally {
        isDeleting.value = false
    }
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
        if (!isConnected.value) {
            await fetchMessages(selectedConversation.value.documentId)
            await fetchConversations()
        }
    } catch {
        showToast('error', 'Failed to send message')
    } finally {
        isSending.value = false
    }
}

// ─── Typing Indicator Helpers ─────────────────────────────────────────────────
function handleTyping() {
    if (!selectedConversation.value) return
    emitTyping(selectedConversation.value.documentId)

    if (typingTimeout) clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
        if (selectedConversation.value) {
            emitStopTyping(selectedConversation.value.documentId)
        }
    }, 2000)
}

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

// ─── Broadcast Message ────────────────────────────────────────────────────────
async function fetchBroadcastResidents() {
    if (!broadcastPropertyId.value) {
        broadcastResidents.value = []
        return
    }
    isLoadingBroadcastResidents.value = true
    try {
        const params = new URLSearchParams({
            'filters[role][id][$eq]': '4',
            'filters[property][id][$eq]': broadcastPropertyId.value,
            'pagination[pageSize]': '200',
            'fields[0]': 'username',
            'fields[1]': 'email',
            'fields[2]': 'roomNumber',
        })
        const res = await fetch(`${STRAPI_URL}/api/users?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        broadcastResidents.value = (Array.isArray(data) ? data : (data.data ?? [])).map((u: any) => ({
            id: u.id,
            documentId: u.documentId,
            username: u.username,
            email: u.email,
            roomNumber: u.roomNumber,
        }))
    } catch {
        showToast('error', t.value.broadcastLoadResidentsError || 'Failed to load residents')
    } finally {
        isLoadingBroadcastResidents.value = false
    }
}

const filteredBroadcastResidents = computed(() => {
    if (!broadcastSearchQuery.value.trim()) return broadcastResidents.value
    const q = broadcastSearchQuery.value.toLowerCase()
    return broadcastResidents.value.filter(r =>
        r.username.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(q))
    )
})

const isAllBroadcastSelected = computed(() => {
    return broadcastResidents.value.length > 0 && broadcastSelectedIds.value.size === broadcastResidents.value.length
})

function toggleBroadcastResident(id: number) {
    const newSet = new Set(broadcastSelectedIds.value)
    if (newSet.has(id)) {
        newSet.delete(id)
    } else {
        newSet.add(id)
    }
    broadcastSelectedIds.value = newSet
}

function toggleAllBroadcastResidents() {
    if (isAllBroadcastSelected.value) {
        broadcastSelectedIds.value = new Set()
    } else {
        broadcastSelectedIds.value = new Set(broadcastResidents.value.map(r => r.id))
    }
}

function openBroadcastModal() {
    broadcastPropertyId.value = ''
    broadcastResidents.value = []
    broadcastSelectedIds.value = new Set()
    broadcastMessage.value = ''
    broadcastSearchQuery.value = ''
    broadcastProgress.value = { current: 0, total: 0 }
    showBroadcastModal.value = true
}

async function sendBroadcast() {
    if (!broadcastMessage.value.trim() || broadcastSelectedIds.value.size === 0 || !broadcastPropertyId.value) return
    isSendingBroadcast.value = true
    const selectedResidents = broadcastResidents.value.filter(r => broadcastSelectedIds.value.has(r.id))
    broadcastProgress.value = { current: 0, total: selectedResidents.length }
    const property = propertiesList.value.find(p => String(p.id) === broadcastPropertyId.value)
    let successCount = 0

    for (const resident of selectedResidents) {
        try {
            // Check if conversation already exists
            let conversationDocId: string | null = null
            const existing = conversations.value.find(c =>
                c.participants.some(p => p.id === resident.id) &&
                c.participants.some(p => p.id === user.value?.id)
            )

            if (existing) {
                conversationDocId = existing.documentId
            } else {
                // Create new conversation
                const convRes = await fetch(`${STRAPI_URL}/api/conversations`, {
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
                if (!convRes.ok) throw new Error('Failed to create conversation')
                const convData = await convRes.json()
                conversationDocId = convData.data.documentId
            }

            // Send message
            const msgRes = await fetch(`${STRAPI_URL}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({
                    data: {
                        content: broadcastMessage.value.trim(),
                        conversation: conversationDocId,
                        isRead: false,
                    },
                }),
            })
            if (!msgRes.ok) throw new Error('Failed to send message')

            // Update conversation lastMessage
            await fetch(`${STRAPI_URL}/api/conversations/${conversationDocId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({
                    data: {
                        lastMessage: broadcastMessage.value.trim(),
                        lastMessageAt: new Date().toISOString(),
                    },
                }),
            })

            successCount++
        } catch { /* continue to next resident */ }
        broadcastProgress.value.current++
    }

    await fetchConversations()
    showBroadcastModal.value = false
    isSendingBroadcast.value = false

    if (successCount === selectedResidents.length) {
        showToast('success', t.value.broadcastSent || `Broadcast sent to ${successCount} residents`)
    } else {
        showToast('error', t.value.broadcastPartialError || `Sent to ${successCount}/${selectedResidents.length} residents`)
    }
}

watch(broadcastPropertyId, () => {
    broadcastSelectedIds.value = new Set()
    broadcastSearchQuery.value = ''
    fetchBroadcastResidents()
})

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
    const isThai = lang.value === 'TH'

    if (diffDays === 0) {
        return date.toLocaleTimeString(isThai ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
        return t.value.yesterday
    } else if (diffDays < 7) {
        return date.toLocaleDateString(isThai ? 'th-TH' : 'en-US', { weekday: 'short', ...(isThai ? { calendar: 'buddhist' } : {}) })
    } else {
        return date.toLocaleDateString(isThai ? 'th-TH' : 'en-GB', { day: '2-digit', month: 'short', ...(isThai ? { calendar: 'buddhist' } : {}) })
    }
}

function formatMessageTime(dateStr: string) {
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleTimeString(isThai ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

function getDayLabel(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.round((today.getTime() - msgDay.getTime()) / (1000 * 60 * 60 * 24))
    const isThai = lang.value === 'TH'
    if (diffDays === 0) return t.value.today ?? 'Today'
    if (diffDays === 1) return t.value.yesterday ?? 'Yesterday'
    return date.toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function dayKey(dateStr: string): string {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Messages interleaved with day-separator markers
type MessageOrSeparator = (Message & { _type?: 'message' }) | { _type: 'separator'; label: string; key: string }
const messagesWithDaySeparators = computed<MessageOrSeparator[]>(() => {
    const result: MessageOrSeparator[] = []
    let lastDay = ''
    for (const msg of messages.value) {
        const dk = dayKey(msg.createdAt)
        if (dk !== lastDay) {
            lastDay = dk
            result.push({ _type: 'separator', label: getDayLabel(msg.createdAt), key: dk })
        }
        result.push({ ...msg, _type: 'message' })
    }
    return result
})

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

// Auto-scroll when a conversation is (re)opened
watch(selectedConversation, (conv) => {
    if (conv) ensureScrollToBottom()
})

// ─── Entry Animation ──────────────────────────────────────────────────────────
const headerVisible = ref(false)
const contentVisible = ref(false)

// ─── Socket Event Cleanup Functions ───────────────────────────────────────────
const cleanupFunctions: Array<() => void> = []

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await Promise.all([fetchConversations(), fetchProperties()])

    // Do not auto-open a conversation on load so unread badges stay visible
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        contentVisible.value = true
    }))

    // ─── Set up Socket.IO event listeners ─────────────────────────────────
    cleanupFunctions.push(
        onNewMessage((data) => {
            if (
                selectedConversation.value &&
                data.conversationDocumentId === selectedConversation.value.documentId
            ) {
                const exists = messages.value.some(m => m.documentId === data.message.documentId)
                if (!exists) {
                    messages.value.push(data.message as any)
                    ensureScrollToBottom()
                }
                // Auto-mark as read since conversation is open
                if (data.message.sender.documentId !== user.value?.documentId) {
                    // Update local isRead state immediately
                    const msg = messages.value.find(m => m.documentId === data.message.documentId)
                    if (msg) msg.isRead = true
                    fetch(`${STRAPI_URL}/api/messages/mark-read`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token.value}`,
                        },
                        body: JSON.stringify({ conversationDocumentId: data.conversationDocumentId }),
                    }).catch(() => { })
                }
            } else {
                // Increment unread count for non-selected conversations
                if (data.message.sender.documentId !== user.value?.documentId) {
                    const conv = conversations.value.find(c => c.documentId === data.conversationDocumentId)
                    if (conv) {
                        conv.unreadCount = (conv.unreadCount ?? 0) + 1
                    } else {
                        // Conversation not in list - refetch to get it with proper unread count
                        fetchConversations()
                    }
                }
            }
            typingUsers.value.delete(data.message.sender.documentId)
        })
    )

    cleanupFunctions.push(
        onMessagesRead((data) => {
            const conv = conversations.value.find(c => c.documentId === data.conversationDocumentId)
            if (!conv) return

            if (data.readByDocumentId !== user.value?.documentId) {
                // The other user read our messages — update read status on displayed messages
                if (
                    selectedConversation.value &&
                    selectedConversation.value.documentId === data.conversationDocumentId
                ) {
                    messages.value.forEach(m => {
                        if (m.sender?.id === user.value?.id && !m.isRead) {
                            m.isRead = true
                        }
                    })
                }
            } else {
                // I read messages in this conversation — reset unread count
                conv.unreadCount = 0
            }
        })
    )

    cleanupFunctions.push(
        onConversationUpdated((data) => {
            const conv = conversations.value.find(c => c.documentId === data.conversationDocumentId)
            if (conv) {
                conv.lastMessage = data.lastMessage
                conv.lastMessageAt = data.lastMessageAt

                // If conversation is not currently open and the other user sent the message, increment unread
                if (
                    (!selectedConversation.value || selectedConversation.value.documentId !== data.conversationDocumentId) &&
                    data.senderDocumentId && data.senderDocumentId !== user.value?.documentId
                ) {
                    conv.unreadCount = (conv.unreadCount ?? 0) + 1
                }

                conversations.value.sort((a, b) => {
                    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
                    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
                    return bTime - aTime
                })
            } else {
                // Conversation not in list yet; refetch to include it with unread state
                fetchConversations()
            }
        })
    )

    cleanupFunctions.push(
        onUserTyping((data) => {
            if (
                selectedConversation.value &&
                data.conversationDocumentId === selectedConversation.value.documentId &&
                data.user.documentId !== user.value?.documentId
            ) {
                typingUsers.value.set(data.user.documentId, data.user.username)
            }
        })
    )

    cleanupFunctions.push(
        onUserStopTyping((data) => {
            typingUsers.value.delete(data.user.documentId)
        })
    )

    // Real-time: a new conversation was created that includes this user
    cleanupFunctions.push(
        onConversationCreated((data) => {
            // Refetch conversations to get the full conversation object with participants & property
            fetchConversations()
        })
    )

    // Real-time: a conversation was deleted
    cleanupFunctions.push(
        onConversationDeleted((data) => {
            // If the deleted conversation is the one currently selected, deselect it
            if (selectedConversation.value?.documentId === data.conversationDocumentId) {
                selectedConversation.value = null
                messages.value = []
                showChatOnMobile.value = false
                previousConversationId = null
            }
            // Remove from the local list
            conversations.value = conversations.value.filter(
                c => c.documentId !== data.conversationDocumentId
            )
        })
    )
})

onUnmounted(() => {
    cleanupFunctions.forEach(fn => fn())
    cleanupFunctions.length = 0
    if (previousConversationId) {
        leaveConversation(previousConversationId)
    }
    if (typingTimeout) clearTimeout(typingTimeout)
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
                        <i :class="toast.type === 'success' ? 'fa-solid fa-square-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Page Header -->
        <div class="flex-shrink-0 mb-4 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.messagesTitle }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.messagesSubtitle }}</p>
        </div>

        <!-- Main Chat Container -->
        <div class="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex transition-all duration-500"
            :class="contentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'">

            <!-- Conversation List (Left Sidebar) -->
            <div class="w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-800 flex flex-col"
                :class="{ 'hidden md:flex': showChatOnMobile && selectedConversation }">
                <!-- Header -->
                <div class="p-3 border-b border-gray-200 dark:border-gray-800">
                    <button @click="showNewConversationModal = true"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2 mb-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-pen-to-square text-base"></i>
                        {{ t.newConversation }}
                    </button>
                    <button @click="openBroadcastModal"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2 mb-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
                        <i class="fa-solid fa-tower-broadcast text-base"></i>
                        {{ t.broadcastMessage }}
                    </button>
                    <!-- Search -->
                    <div class="relative">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
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
                            <i class="fa-solid fa-comment text-2xl text-gray-400"></i>
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
                                <i class="fa-solid fa-user text-primary-600 dark:text-primary-400 text-lg"></i>
                            </div>
                            <!-- Content -->
                            <div class="flex-1 min-w-0 text-left">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-sm truncate"
                                        :class="conv.unreadCount ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-900 dark:text-white'">
                                        {{ getOtherParticipant(conv)?.username || 'Unknown' }}
                                    </span>
                                    <div class="flex items-center gap-2 flex-shrink-0">
                                        <span v-if="conv.unreadCount"
                                            class="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                            {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
                                        </span>
                                        <span class="text-xs text-gray-400">
                                            {{ formatTime(conv.lastMessageAt) }}
                                        </span>
                                    </div>
                                </div>
                                <p class="text-xs truncate mt-0.5"
                                    :class="conv.unreadCount ? 'font-semibold text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'">
                                    {{ conv.lastMessage || t.noMessages }}
                                </p>
                                <div v-if="conv.property" class="flex items-center gap-1 mt-1">
                                    <i class="fa-solid fa-house text-[10px] text-gray-400"></i>
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
                            <i class="fa-solid fa-comment text-3xl text-gray-400"></i>
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
                            <i class="fa-solid fa-arrow-left text-gray-600 dark:text-gray-400"></i>
                        </button>
                        <!-- Avatar -->
                        <div
                            class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <i class="fa-solid fa-user text-primary-600 dark:text-primary-400"></i>
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
                        <!-- Delete Button -->
                        <button @click="openDeleteModal(selectedConversation.documentId)" :disabled="isDeleting"
                            class="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg transition-colors disabled:opacity-50"
                            :title="t.deleteConversation">
                            <i class="fa-solid fa-trash text-base"></i>
                        </button>
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
                            <template v-for="item in messagesWithDaySeparators"
                                :key="item._type === 'separator' ? item.key : (item as any).id">
                                <!-- Day Separator -->
                                <div v-if="item._type === 'separator'" class="flex items-center gap-3 my-2">
                                    <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                    <span
                                        class="text-[11px] font-medium text-gray-400 dark:text-gray-500 px-2 shrink-0">
                                        {{ (item as any).label }}
                                    </span>
                                    <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                </div>

                                <!-- Message -->
                                <div v-else class="flex"
                                    :class="(item as any).sender?.id === user?.id ? 'justify-end' : 'justify-start'">
                                    <div class="max-w-[75%] sm:max-w-[65%]"
                                        :class="(item as any).sender?.id === user?.id ? 'order-1' : ''">
                                        <!-- Message Bubble -->
                                        <div class="px-4 py-2 rounded-2xl"
                                            :class="(item as any).sender?.id === user?.id
                                                ? 'bg-primary-600 text-white rounded-br-md'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md'">
                                            <p class="text-sm whitespace-pre-wrap break-words">{{ (item as any).content
                                                }}</p>
                                            <!-- Images -->
                                            <div v-if="(item as any).images && (item as any).images.length > 0"
                                                class="mt-2 flex flex-wrap gap-2">
                                                <img v-for="img in (item as any).images" :key="img.id"
                                                    :src="STRAPI_URL + img.url" alt="Image"
                                                    class="max-w-[200px] max-h-[200px] rounded-lg object-cover cursor-pointer" />
                                            </div>
                                        </div>
                                        <!-- Time -->
                                        <div class="flex items-center gap-1 mt-1 px-1"
                                            :class="(item as any).sender?.id === user?.id ? 'justify-end' : 'justify-start'">
                                            <span class="text-[10px] text-gray-400">{{ formatMessageTime((item as
                                                any).createdAt) }}</span>
                                            <span v-if="(item as any).isEdited" class="text-[10px] text-gray-400">({{
                                                t.edited }})</span>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </template>
                    </div>

                    <!-- Typing Indicator -->
                    <div v-if="typingUsers.size > 0"
                        class="flex-shrink-0 px-4 py-2 border-t border-gray-100 dark:border-gray-800">
                        <div class="flex items-center gap-2 text-xs text-gray-400">
                            <span class="flex gap-0.5">
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                    style="animation-delay: 0ms"></span>
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                    style="animation-delay: 150ms"></span>
                                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                    style="animation-delay: 300ms"></span>
                            </span>
                            <span>{{ Array.from(typingUsers.values()).join(', ') }} {{ t.typing }}</span>
                        </div>
                    </div>

                    <!-- Message Input -->
                    <div
                        class="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                        <form @submit.prevent="sendMessage" class="flex items-stretch gap-3">
                            <div class="flex-1 relative">
                                <textarea v-model="newMessage" :placeholder="t.typeMessage" rows="1"
                                    class="w-full h-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                    @keydown.enter.exact.prevent="sendMessage" @input="handleTyping"
                                    style="min-height: 44px; max-height: 120px;"></textarea>
                            </div>
                            <button type="submit" :disabled="!newMessage.trim() || isSending"
                                class="flex-shrink-0 px-4 h-auto bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors">
                                <i v-if="isSending" class="fa-solid fa-rotate text-lg animate-spin"></i>
                                <i v-else class="fa-solid fa-paper-plane text-lg"></i>
                            </button>
                        </form>
                    </div>
                </template>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
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
                                <i class="fa-solid fa-trash text-red-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteConversation }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {{ t.deleteConversationConfirm }}
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showDeleteModal = false; conversationToDelete = null" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="confirmDeleteConversation" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isDeleting" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Broadcast Message Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showBroadcastModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                        enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                        <div v-if="showBroadcastModal"
                            class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
                            <!-- Modal Header -->
                            <div
                                class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                                        <i class="fa-solid fa-tower-broadcast text-amber-600 dark:text-amber-400"></i>
                                    </div>
                                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{
                                        t.broadcastMessage }}
                                    </h3>
                                </div>
                                <button @click="showBroadcastModal = false" :disabled="isSendingBroadcast"
                                    class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    <i class="fa-solid fa-xmark text-gray-500"></i>
                                </button>
                            </div>

                            <!-- Modal Body -->
                            <div class="p-6 space-y-4 overflow-y-auto flex-1">
                                <!-- Property Select -->
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        {{ t.property }} <span class="text-red-500">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-house absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                        <select v-model="broadcastPropertyId" :disabled="isSendingBroadcast"
                                            class="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                            <option value="">{{ t.selectProperty }}</option>
                                            <option v-for="prop in propertiesList" :key="prop.id"
                                                :value="String(prop.id)">
                                                {{ prop.name }}
                                            </option>
                                        </select>
                                        <i
                                            class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                                    </div>
                                </div>

                                <!-- Recipients -->
                                <div v-if="broadcastPropertyId">
                                    <div class="flex items-center justify-between mb-1.5">
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {{ t.broadcastRecipients }} <span class="text-red-500">*</span>
                                        </label>
                                        <span class="text-xs text-gray-400">{{ broadcastSelectedIds.size }} {{
                                            t.broadcastSelected }}</span>
                                    </div>

                                    <!-- Search + Select All -->
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="relative flex-1">
                                            <i
                                                class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                            <input v-model="broadcastSearchQuery" type="text"
                                                :placeholder="t.searchResidents"
                                                class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                        </div>
                                        <button @click="toggleAllBroadcastResidents"
                                            :disabled="isSendingBroadcast || broadcastResidents.length === 0"
                                            class="px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                                            :class="isAllBroadcastSelected
                                                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'">
                                            {{ isAllBroadcastSelected ? t.broadcastDeselectAll : t.broadcastSelectAll }}
                                        </button>
                                    </div>

                                    <!-- Loading -->
                                    <div v-if="isLoadingBroadcastResidents" class="py-4 text-center">
                                        <div
                                            class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto">
                                        </div>
                                    </div>

                                    <!-- Residents List -->
                                    <div v-else-if="filteredBroadcastResidents.length > 0"
                                        class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                                        <button v-for="resident in filteredBroadcastResidents" :key="resident.id"
                                            @click="toggleBroadcastResident(resident.id)" type="button"
                                            :disabled="isSendingBroadcast"
                                            class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                                            :class="{ 'bg-primary-50 dark:bg-primary-900/20': broadcastSelectedIds.has(resident.id) }">
                                            <!-- Checkbox -->
                                            <div class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                                                :class="broadcastSelectedIds.has(resident.id)
                                                    ? 'bg-primary-600 border-primary-600'
                                                    : 'border-gray-300 dark:border-gray-600'">
                                                <i v-if="broadcastSelectedIds.has(resident.id)"
                                                    class="fa-solid fa-check text-white text-xs"></i>
                                            </div>
                                            <div
                                                class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                                <i class="fa-solid fa-user text-primary-600 dark:text-primary-400 text-xs"></i>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{
                                                    resident.username }}</p>
                                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    {{ resident.roomNumber ? `Room ${resident.roomNumber}` :
                                                        resident.email }}
                                                </p>
                                            </div>
                                        </button>
                                    </div>

                                    <!-- No Residents -->
                                    <div v-else class="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                        {{ t.noResidentsFound }}
                                    </div>
                                </div>

                                <!-- Message -->
                                <div v-if="broadcastPropertyId">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        {{ t.broadcastMessageLabel }} <span class="text-red-500">*</span>
                                    </label>
                                    <textarea v-model="broadcastMessage" :placeholder="t.broadcastMessagePlaceholder"
                                        rows="4" :disabled="isSendingBroadcast"
                                        class="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                                </div>

                                <!-- Progress -->
                                <div v-if="isSendingBroadcast" class="space-y-2">
                                    <div class="flex items-center justify-between text-sm">
                                        <span class="text-gray-600 dark:text-gray-400">{{ t.broadcastSending }}</span>
                                        <span class="font-medium text-gray-900 dark:text-white">{{
                                            broadcastProgress.current
                                            }}/{{ broadcastProgress.total }}</span>
                                    </div>
                                    <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div class="h-full bg-amber-500 rounded-full transition-all duration-300"
                                            :style="{ width: broadcastProgress.total ? `${(broadcastProgress.current / broadcastProgress.total) * 100}%` : '0%' }">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Modal Footer -->
                            <div
                                class="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 shrink-0">
                                <button @click="showBroadcastModal = false" :disabled="isSendingBroadcast"
                                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    {{ t.cancel }}
                                </button>
                                <button @click="sendBroadcast"
                                    :disabled="!broadcastPropertyId || broadcastSelectedIds.size === 0 || !broadcastMessage.trim() || isSendingBroadcast"
                                    class="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2">
                                    <i v-if="isSendingBroadcast" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                    <i v-else class="fa-solid fa-tower-broadcast text-sm"></i>
                                    {{ t.broadcastSendButton }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>

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
                                    <i class="fa-solid fa-xmark text-gray-500"></i>
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
                                            class="fa-solid fa-house absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                        <select v-model="selectedPropertyId"
                                            class="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                            <option value="">{{ t.selectProperty }}</option>
                                            <option v-for="prop in propertiesList" :key="prop.id"
                                                :value="String(prop.id)">
                                                {{ prop.name }}
                                            </option>
                                        </select>
                                        <i
                                            class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
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
                                            class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
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
                                                <i class="fa-solid fa-user text-primary-600 dark:text-primary-400 text-sm"></i>
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
                                                class="fa-solid fa-check text-primary-600 dark:text-primary-400"></i>
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
