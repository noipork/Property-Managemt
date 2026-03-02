import { ref, watch } from 'vue'
import { io, Socket } from 'socket.io-client'

// ─── Module-scope shared state (singleton) ────────────────────────────────────
const socket = ref<Socket | null>(null)
const isConnected = ref(false)
const connectionError = ref<string | null>(null)

export const useSocket = () => {
    const { token, user, isAuthenticated } = useAuth()
    const config = useRuntimeConfig()
    const STRAPI_URL = config.public.strapiUrl

    /**
     * Connect to the WebSocket server.
     * Safe to call multiple times — will reuse existing connection.
     */
    function connect() {
        if (socket.value?.connected) return
        if (!token.value) return

        // Disconnect any stale socket before reconnecting
        if (socket.value) {
            socket.value.disconnect()
            socket.value = null
        }

        const newSocket = io(STRAPI_URL, {
            auth: { token: token.value },
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10,
        })

        newSocket.on('connect', () => {
            isConnected.value = true
            connectionError.value = null
            console.log('[Socket.IO] Connected:', newSocket.id)
        })

        newSocket.on('disconnect', (reason) => {
            isConnected.value = false
            console.log('[Socket.IO] Disconnected:', reason)
        })

        newSocket.on('connect_error', (err) => {
            isConnected.value = false
            connectionError.value = err.message
            console.warn('[Socket.IO] Connection error:', err.message)
        })

        socket.value = newSocket
    }

    /**
     * Disconnect from the WebSocket server.
     */
    function disconnect() {
        if (socket.value) {
            socket.value.disconnect()
            socket.value = null
            isConnected.value = false
            connectionError.value = null
        }
    }

    // ─── Conversation helpers ─────────────────────────────────────────────

    function joinConversation(conversationDocumentId: string) {
        socket.value?.emit('join-conversation', conversationDocumentId)
    }

    function leaveConversation(conversationDocumentId: string) {
        socket.value?.emit('leave-conversation', conversationDocumentId)
    }

    function emitTyping(conversationDocumentId: string) {
        socket.value?.emit('typing', { conversationDocumentId })
    }

    function emitStopTyping(conversationDocumentId: string) {
        socket.value?.emit('stop-typing', { conversationDocumentId })
    }

    // ─── Maintenance helpers ──────────────────────────────────────────────

    function joinMaintenance(maintenanceDocumentId: string) {
        socket.value?.emit('join-maintenance', maintenanceDocumentId)
    }

    function leaveMaintenance(maintenanceDocumentId: string) {
        socket.value?.emit('leave-maintenance', maintenanceDocumentId)
    }

    // ─── Event listener helpers ───────────────────────────────────────────

    function onNewMessage(callback: (data: {
        message: {
            id: number
            documentId: string
            content: string
            createdAt: string
            isRead: boolean
            isEdited: boolean
            sender: { id: number; documentId: string; username: string; email: string }
            images: { id: number; url: string }[] | null
        }
        conversationDocumentId: string
    }) => void) {
        socket.value?.on('new-message', callback)
        // Return cleanup function
        return () => socket.value?.off('new-message', callback)
    }

    function onConversationUpdated(callback: (data: {
        conversationDocumentId: string
        lastMessage: string
        lastMessageAt: string
        senderDocumentId: string
        senderUsername: string
    }) => void) {
        socket.value?.on('conversation-updated', callback)
        return () => socket.value?.off('conversation-updated', callback)
    }

    function onUserTyping(callback: (data: {
        conversationDocumentId: string
        user: { documentId: string; username: string }
    }) => void) {
        socket.value?.on('user-typing', callback)
        return () => socket.value?.off('user-typing', callback)
    }

    function onUserStopTyping(callback: (data: {
        conversationDocumentId: string
        user: { documentId: string; username: string }
    }) => void) {
        socket.value?.on('user-stop-typing', callback)
        return () => socket.value?.off('user-stop-typing', callback)
    }

    function onConversationCreated(callback: (data: {
        conversationDocumentId: string
        createdBy: { documentId: string; username: string }
    }) => void) {
        socket.value?.on('conversation-created', callback)
        return () => socket.value?.off('conversation-created', callback)
    }

    function onConversationDeleted(callback: (data: {
        conversationDocumentId: string
        deletedBy: { documentId: string; username: string }
    }) => void) {
        socket.value?.on('conversation-deleted', callback)
        return () => socket.value?.off('conversation-deleted', callback)
    }

    function onMaintenanceUpdated(callback: (data: {
        maintenanceDocumentId: string
        status: string
        updatedFields: Record<string, any>
    }) => void) {
        socket.value?.on('maintenance-updated', callback)
        return () => socket.value?.off('maintenance-updated', callback)
    }

    function onNewMaintenanceMessage(callback: (data: {
        maintenanceDocumentId: string
        message: {
            id: number
            documentId: string
            message: string
            createdAt: string
            isInternal: boolean
            sender: { id: number; documentId: string; username: string; email: string }
            images: { id: number; url: string }[] | null
        }
    }) => void) {
        socket.value?.on('new-maintenance-message', callback)
        return () => socket.value?.off('new-maintenance-message', callback)
    }

    function onMessagesRead(callback: (data: {
        conversationDocumentId: string
        readByDocumentId: string
        count: number
    }) => void) {
        socket.value?.on('messages-read', callback)
        return () => socket.value?.off('messages-read', callback)
    }

    /**
     * Remove a specific event listener
     */
    function off(event: string, callback?: (...args: any[]) => void) {
        if (callback) {
            socket.value?.off(event, callback)
        } else {
            socket.value?.removeAllListeners(event)
        }
    }

    // ─── Auto-connect / disconnect based on auth ──────────────────────────
    watch(
        () => isAuthenticated.value,
        (authed) => {
            if (authed && token.value) {
                connect()
            } else {
                disconnect()
            }
        },
        { immediate: true }
    )

    return {
        socket,
        isConnected,
        connectionError,
        connect,
        disconnect,

        // Conversation
        joinConversation,
        leaveConversation,
        emitTyping,
        emitStopTyping,

        // Maintenance
        joinMaintenance,
        leaveMaintenance,

        // Event listeners
        onNewMessage,
        onConversationUpdated,
        onUserTyping,
        onUserStopTyping,
        onConversationCreated,
        onConversationDeleted,
        onMaintenanceUpdated,
        onNewMaintenanceMessage,
        onMessagesRead,
        off,
    }
}
