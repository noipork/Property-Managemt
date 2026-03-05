<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { token, user } = useAuth()
const { t, lang } = useI18n()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const { markReadByRelated } = useNotificationBadge()

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; type: 'success' | 'error'; message: string }
const toasts = ref<Toast[]>([])
let toastCounter = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter
    toasts.value.push({ id, type, message })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 4000)
}
function dismissToast(id: number) { toasts.value = toasts.value.filter(t => t.id !== id) }

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const listVisible = ref(false)

interface Asset {
    id: number
    documentId: string
    name: string
    description: string | null
    price: number
    currency: string
    status: 'active' | 'inactive'
}

interface AssetRequest {
    id: number
    documentId: string
    status: 'pending' | 'approved' | 'rejected'
    notes: string | null
    rejectionReason: string | null
    createdAt: string
    asset: { documentId: string; name: string; price: number; currency: string } | null
}

const assets = ref<Asset[]>([])
const myRequests = ref<AssetRequest[]>([])
const isLoadingAssets = ref(true)
const isLoadingRequests = ref(true)
const residentProperty = ref<{ id?: number; documentId?: string } | null>(null)

// Request modal
const showRequestModal = ref(false)
const selectedAsset = ref<Asset | null>(null)
const requestNotes = ref('')
const isRequesting = ref(false)

const activeTab = ref<'browse' | 'my-requests'>('browse')

async function ensureResidentProperty() {
    if (user.value?.property?.id || user.value?.property?.documentId) {
        residentProperty.value = {
            id: user.value?.property?.id,
            documentId: user.value?.property?.documentId,
        }
        return
    }
    try {
        const res = await fetch(`${STRAPI_URL}/api/users/me?populate=property`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const me = await res.json()
        if (me?.property?.id || me?.property?.documentId) {
            residentProperty.value = { id: me.property.id, documentId: me.property.documentId }
        }
    } catch { }
}

// Assets that resident has already requested (pending or approved)
const requestedAssetDocIds = computed(() => {
    return new Set(
        myRequests.value
            .filter(r => r.status === 'pending' || r.status === 'approved')
            .map(r => r.asset?.documentId)
            .filter(Boolean)
    )
})

async function fetchAssets() {
    const propertyDocumentId = residentProperty.value?.documentId ?? user.value?.property?.documentId
    const propertyId = residentProperty.value?.id ?? user.value?.property?.id
    if (!propertyDocumentId && !propertyId) {
        assets.value = []
        isLoadingAssets.value = false
        return
    }
    isLoadingAssets.value = true
    try {
        const params = new URLSearchParams({
            'filters[status][$eq]': 'active',
            'sort[0]': 'name:asc',
            'pagination[pageSize]': '100',
        })
        if (propertyDocumentId) {
            params.set('filters[property][documentId][$eq]', propertyDocumentId)
        } else if (propertyId) {
            params.set('filters[property][id][$eq]', String(propertyId))
        }
        const res = await fetch(`${STRAPI_URL}/api/assets?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to load assets')
        const data = await res.json()
        assets.value = (data.data ?? []).map((a: any) => ({
            id: a.id,
            documentId: a.documentId,
            name: a.name,
            description: a.description ?? null,
            price: a.price,
            currency: a.currency || 'THB',
            status: a.status,
        }))
    } catch (err) {
        showToast('error', 'Failed to load assets')
    } finally {
        isLoadingAssets.value = false
    }
}

async function fetchMyRequests() {
    isLoadingRequests.value = true
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': String(user.value?.id ?? ''),
            'populate[0]': 'asset',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '100',
        })
        const res = await fetch(`${STRAPI_URL}/api/asset-requests?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to load requests')
        const data = await res.json()
        myRequests.value = (data.data ?? []).map((r: any) => ({
            id: r.id,
            documentId: r.documentId,
            status: r.status,
            notes: r.notes ?? null,
            rejectionReason: r.rejectionReason ?? null,
            createdAt: r.createdAt,
            asset: r.asset ?? null,
        }))
    } catch (err) {
        showToast('error', 'Failed to load requests')
    } finally {
        isLoadingRequests.value = false
    }
}

function openRequestModal(asset: Asset) {
    selectedAsset.value = asset
    requestNotes.value = ''
    showRequestModal.value = true
}

async function submitRequest() {
    if (!selectedAsset.value) return
    isRequesting.value = true
    try {
        const propertyDocumentId = residentProperty.value?.documentId ?? user.value?.property?.documentId
        const payload = {
            data: {
                asset: selectedAsset.value.documentId,
                resident: user.value?.documentId,
                property: propertyDocumentId ?? null,
                notes: requestNotes.value || null,
                status: 'pending',
            },
        }
        const res = await fetch(`${STRAPI_URL}/api/asset-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to submit request')
        showToast('success', t.value.submitRequest + '!')
        showRequestModal.value = false
        await fetchMyRequests()
    } catch (err) {
        showToast('error', 'Failed to submit request. Please try again.')
    } finally {
        isRequesting.value = false
    }
}

// ─── Request Detail Modal ─────────────────────────────────────────────────────
const showDetailModal = ref(false)
const selectedRequest = ref<AssetRequest | null>(null)
const isCancellingRequest = ref(false)

// Map of asset-request documentId → unread notification exists
const { notifications } = useNotificationBadge()
const unreadRequestIds = computed(() => {
    return new Set(
        notifications.value
            .filter(n => !n.isRead && n.type === 'asset' && n.relatedDocumentId)
            .map(n => n.relatedDocumentId as string)
    )
})

function openRequestDetail(req: AssetRequest) {
    selectedRequest.value = req
    showDetailModal.value = true
    // Mark related unread notifications as read
    if (unreadRequestIds.value.has(req.documentId)) {
        markReadByRelated(['asset'], req.documentId)
    }
}

function closeDetailModal() {
    showDetailModal.value = false
    selectedRequest.value = null
}

async function cancelRequest() {
    if (!selectedRequest.value || selectedRequest.value.status !== 'pending') return
    isCancellingRequest.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/asset-requests/${selectedRequest.value.documentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to cancel')
        showToast('success', t.value.requestCancelledSuccess)
        closeDetailModal()
        await Promise.all([fetchAssets(), fetchMyRequests()])
    } catch {
        showToast('error', 'Failed to cancel request')
    } finally {
        isCancellingRequest.value = false
    }
}

function getStatusLabel(status: string) {
    if (status === 'pending') return t.value.pending
    if (status === 'approved') return t.value.approved
    if (status === 'rejected') return t.value.rejected
    return status
}

function formatDate(d: string) {
    const isThai = lang.value === 'TH'
    return new Date(d).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await ensureResidentProperty()
    await Promise.all([fetchAssets(), fetchMyRequests()])
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

        <!-- Header -->
        <div class="transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.assets }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.assetsSubtitle }}</p>
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit transition-all duration-500 delay-75"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <button @click="activeTab = 'browse'" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                :class="activeTab === 'browse'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                {{ t.browseAssets }}
            </button>
            <button @click="activeTab = 'my-requests'" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                :class="activeTab === 'my-requests'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                {{ t.myRequests }}
                <span v-if="myRequests.filter(r => r.status === 'pending').length > 0"
                    class="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-amber-500 text-white rounded-full">
                    {{myRequests.filter(r => r.status === 'pending').length}}
                </span>
            </button>
        </div>

        <!-- Browse Tab -->
        <template v-if="activeTab === 'browse'">
            <div v-if="isLoadingAssets" class="flex items-center justify-center py-20">
                <div class="flex flex-col items-center gap-3">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.assets }}...</p>
                </div>
            </div>
            <div v-else-if="assets.length === 0"
                class="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <i class="ti-puzzle text-2xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noAssetsAvailable }}</h3>
            </div>
            <div v-else class="space-y-3">
                <div v-for="(asset, idx) in assets" :key="asset.documentId"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-500"
                    :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                    :style="{ transitionDelay: listVisible ? `${idx * 40}ms` : '0ms' }">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-4 flex-1 min-w-0">
                            <div
                                class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="ti-puzzle text-lg text-primary-600 dark:text-primary-400"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">{{ asset.name }}</h3>
                                <p v-if="asset.description"
                                    class="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{{
                                        asset.description }}</p>
                                <p class="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-1">
                                    {{ asset.currency }} {{ asset.price.toLocaleString() }} / month
                                </p>
                            </div>
                        </div>
                        <div class="flex-shrink-0">
                            <span v-if="requestedAssetDocIds.has(asset.documentId)"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <i class="ti-check text-xs"></i>
                                {{ t.requested }}
                            </span>
                            <button v-else @click="openRequestModal(asset)"
                                class="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                                {{ t.requestAsset }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- My Requests Tab -->
        <template v-if="activeTab === 'my-requests'">
            <div v-if="isLoadingRequests" class="flex items-center justify-center py-20">
                <div class="flex flex-col items-center gap-3">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.myRequests }}...</p>
                </div>
            </div>
            <div v-else-if="myRequests.length === 0"
                class="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <i class="ti-inbox text-2xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noRequestsYet }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.browseAssets }}</p>
                <button @click="activeTab = 'browse'"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                    <i class="ti-puzzle text-xs"></i>
                    {{ t.browseAssets }}
                </button>
            </div>
            <div v-else class="space-y-3">
                <div v-for="(req, idx) in myRequests" :key="req.documentId" @click="openRequestDetail(req)"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 transition-all duration-500 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md"
                    :class="[
                        listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
                        unreadRequestIds.has(req.documentId) ? 'border-primary-300 dark:border-primary-700' : ''
                    ]" :style="{ transitionDelay: listVisible ? `${idx * 40}ms` : '0ms' }">
                    <div class="flex items-start gap-4">
                        <div class="relative flex-shrink-0">
                            <div
                                class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                                <i class="ti-puzzle text-lg text-primary-600 dark:text-primary-400"></i>
                            </div>
                            <!-- Unread dot -->
                            <span v-if="unreadRequestIds.has(req.documentId)"
                                class="absolute -top-1 -right-1 w-3 h-3 bg-primary-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">{{ req.asset?.name ??
                                    'Unknown asset' }}</h3>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[req.status]">
                                    {{ getStatusLabel(req.status) }}
                                </span>
                            </div>
                            <p class="text-sm font-medium text-gray-600 dark:text-gray-300 mt-0.5">
                                {{ req.asset?.currency ?? 'THB' }} {{ (req.asset?.price ?? 0).toLocaleString() }}/month
                            </p>
                            <p v-if="req.notes" class="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">"{{
                                req.notes }}"</p>
                            <p v-if="req.rejectionReason && req.status === 'rejected'"
                                class="text-sm text-red-500 dark:text-red-400 mt-1">
                                {{ t.reasonLabel }}: {{ req.rejectionReason }}
                            </p>
                            <div class="flex items-center gap-1 mt-1.5">
                                <i class="ti-calendar text-[10px] text-gray-400"></i>
                                <p class="text-xs text-gray-400">{{ t.requestedOn }} {{ formatDate(req.createdAt) }}</p>
                            </div>
                        </div>
                    </div>
                    <div v-if="req.status === 'approved'"
                        class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                        <i class="ti-check-box text-base"></i>
                        <span>{{ t.assetApprovedMsg }}</span>
                    </div>
                </div>
            </div>
        </template>

        <!-- Request Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showRequestModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
                        <div
                            class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
                            <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t.requestAsset }}</h2>
                            <button @click="showRequestModal = false"
                                class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <i class="ti-close text-sm"></i>
                            </button>
                        </div>
                        <div class="p-5 space-y-4">
                            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <p class="font-medium text-gray-900 dark:text-white text-sm">{{ selectedAsset?.name }}
                                </p>
                                <p v-if="selectedAsset?.description"
                                    class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{
                                        selectedAsset.description }}</p>
                                <p class="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-1">
                                    {{ selectedAsset?.currency }} {{ (selectedAsset?.price ?? 0).toLocaleString() }} /
                                    month
                                </p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.requestNotes }}</label>
                                <textarea v-model="requestNotes" rows="3" :placeholder="t.requestNotesPlaceholder"
                                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                            </div>
                            <p class="text-xs text-gray-400">{{ t.requestOncApprovedMsg }}</p>
                        </div>
                        <div class="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-800">
                            <button @click="showRequestModal = false" :disabled="isRequesting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="submitRequest" :disabled="isRequesting"
                                class="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                                <i v-if="isRequesting" class="ti-reload text-xs animate-spin"></i>
                                {{ t.submitRequest }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
        <!-- Request Detail Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDetailModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Transition enter-active-class="transition-all duration-200 delay-75"
                        enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                        leave-active-class="transition-all duration-150" leave-from-class="opacity-100 scale-100"
                        leave-to-class="opacity-0 scale-95">
                        <div v-if="showDetailModal && selectedRequest"
                            class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
                            <!-- Header -->
                            <div
                                class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
                                <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t.requestDetails
                                }}</h2>
                                <button @click="closeDetailModal"
                                    class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <i class="ti-close text-sm"></i>
                                </button>
                            </div>

                            <!-- Body -->
                            <div class="p-5 space-y-4">
                                <!-- Asset info -->
                                <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                    <div
                                        class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <i class="ti-puzzle text-lg text-primary-600 dark:text-primary-400"></i>
                                    </div>
                                    <div>
                                        <p class="font-semibold text-gray-900 dark:text-white text-sm">{{
                                            selectedRequest.asset?.name ?? 'Unknown asset' }}</p>
                                        <p class="text-sm font-medium text-primary-600 dark:text-primary-400">
                                            {{ selectedRequest.asset?.currency ?? 'THB' }} {{
                                                (selectedRequest.asset?.price ??
                                            0).toLocaleString() }} / month
                                        </p>
                                    </div>
                                </div>

                                <!-- Status -->
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.status }}</span>
                                    <span
                                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                        :class="statusColors[selectedRequest.status]">
                                        <i :class="{
                                            'ti-time': selectedRequest.status === 'pending',
                                            'ti-check': selectedRequest.status === 'approved',
                                            'ti-close': selectedRequest.status === 'rejected',
                                        }" class="text-[10px]"></i>
                                        {{ getStatusLabel(selectedRequest.status) }}
                                    </span>
                                </div>

                                <!-- Requested on -->
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.requestedOn }}</span>
                                    <span class="text-sm text-gray-700 dark:text-gray-300">{{
                                        formatDate(selectedRequest.createdAt) }}</span>
                                </div>

                                <!-- Notes -->
                                <div v-if="selectedRequest.notes" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{
                                        t.requestNotes }}
                                    </p>
                                    <p class="text-sm text-gray-700 dark:text-gray-300 italic">"{{ selectedRequest.notes
                                        }}"</p>
                                </div>

                                <!-- Rejection reason -->
                                <div v-if="selectedRequest.status === 'rejected' && selectedRequest.rejectionReason"
                                    class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                    <p class="text-xs font-medium text-red-600 dark:text-red-400 mb-1">{{ t.reasonLabel
                                        }}</p>
                                    <p class="text-sm text-red-700 dark:text-red-300">{{ selectedRequest.rejectionReason
                                        }}</p>
                                </div>

                                <!-- Approved message -->
                                <div v-if="selectedRequest.status === 'approved'"
                                    class="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
                                    <i class="ti-check-box text-base flex-shrink-0"></i>
                                    <span>{{ t.assetApprovedMsg }}</span>
                                </div>
                            </div>

                            <!-- Footer -->
                            <div
                                class="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-800">
                                <button @click="closeDetailModal"
                                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                    {{ t.close }}
                                </button>
                                <button v-if="selectedRequest.status === 'pending'" @click="cancelRequest"
                                    :disabled="isCancellingRequest"
                                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg transition-colors">
                                    <span v-if="isCancellingRequest"
                                        class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    <i v-else class="ti-trash text-xs"></i>
                                    {{ t.cancelRequest }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
