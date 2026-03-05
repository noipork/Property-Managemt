<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { token, user } = useAuth()
const { t, lang } = useI18n()
const { markReadByRelated } = useNotificationBadge()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

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

// ─── Entry Animation ──────────────────────────────────────────────────────────
const headerVisible = ref(false)
const listVisible = ref(false)

// ─── Properties ───────────────────────────────────────────────────────────────
interface PropertyOption { id: number; documentId: string; name: string }
const properties = ref<PropertyOption[]>([])
const selectedPropertyId = ref<number | null>(null)

async function fetchProperties() {
    try {
        const params = new URLSearchParams({ 'sort': 'createdAt:desc', 'pagination[pageSize]': '100' })
        if (user.value?.documentId) params.set('filters[owner][documentId][$eq]', user.value.documentId)
        const res = await fetch(`${STRAPI_URL}/api/properties?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        properties.value = (data.data ?? []).map((p: any) => ({ id: p.id, documentId: p.documentId, name: p.name }))
        if (properties.value.length > 0 && !selectedPropertyId.value) {
            const firstProperty = properties.value[0]
            if (firstProperty) {
                selectedPropertyId.value = firstProperty.id
            }
        }
    } catch { }
}

interface AssetRequest {
    id: number
    documentId: string
    status: 'pending' | 'approved' | 'rejected'
    notes: string | null
    rejectionReason: string | null
    createdAt: string
    asset: { id: number; documentId: string; name: string; price: number; currency: string } | null
    resident: { id: number; documentId: string; username: string } | null
    property: { id: number; documentId: string; name: string } | null
}

const requests = ref<AssetRequest[]>([])
const isLoading = ref(true)
const filterStatus = ref<'all' | 'pending' | 'approved' | 'rejected'>('all')

// Action modal
const showActionModal = ref(false)
const actionType = ref<'approve' | 'reject' | null>(null)
const selectedRequest = ref<AssetRequest | null>(null)
const rejectionReason = ref('')
const isActioning = ref(false)

const filteredRequests = computed(() => {
    if (filterStatus.value === 'all') return requests.value
    return requests.value.filter(r => r.status === filterStatus.value)
})

const pendingCount = computed(() => requests.value.filter(r => r.status === 'pending').length)

async function fetchRequests() {
    if (!selectedPropertyId.value) { requests.value = []; isLoading.value = false; return }
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'asset',
            'populate[1]': 'resident',
            'populate[2]': 'property',
            'filters[property][id][$eq]': String(selectedPropertyId.value),
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '100',
        })
        const res = await fetch(`${STRAPI_URL}/api/asset-requests?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        requests.value = (data.data ?? []).map((r: any) => ({
            id: r.id,
            documentId: r.documentId,
            status: r.status,
            notes: r.notes ?? null,
            rejectionReason: r.rejectionReason ?? null,
            createdAt: r.createdAt,
            asset: r.asset ?? null,
            resident: r.resident ?? null,
            property: r.property ?? null,
        }))
    } catch (err) {
        showToast('error', 'Failed to load requests')
    } finally {
        isLoading.value = false
    }
}

function openApprove(req: AssetRequest) {
    selectedRequest.value = req
    actionType.value = 'approve'
    rejectionReason.value = ''
    showActionModal.value = true
}

function openReject(req: AssetRequest) {
    selectedRequest.value = req
    actionType.value = 'reject'
    rejectionReason.value = ''
    showActionModal.value = true
}

async function submitAction() {
    if (!selectedRequest.value || !actionType.value) return
    isActioning.value = true
    try {
        const payload: any = {
            data: {
                status: actionType.value === 'approve' ? 'approved' : 'rejected',
            },
        }
        if (actionType.value === 'reject' && rejectionReason.value) {
            payload.data.rejectionReason = rejectionReason.value
        }
        const res = await fetch(`${STRAPI_URL}/api/asset-requests/${selectedRequest.value.documentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to update')
        await markReadByRelated(['asset'], selectedRequest.value.documentId)
        showToast('success', actionType.value === 'approve' ? t.value.approveRequest + '!' : t.value.rejectRequest + '!')
        showActionModal.value = false
        await fetchRequests()
        await nextTick()
        listVisible.value = false
        requestAnimationFrame(() => requestAnimationFrame(() => { listVisible.value = true }))
    } catch (err) {
        showToast('error', 'Failed to update request')
    } finally {
        isActioning.value = false
    }
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

async function onPropertyChange() {
    listVisible.value = false
    await fetchRequests()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => { listVisible.value = true }))
}

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchProperties()
    await fetchRequests()
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
            <div class="flex items-center gap-3">
                <NuxtLink to="/manager/assets"
                    class="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <i class="fa-solid fa-arrow-left text-lg"></i>
                </NuxtLink>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.assetRequests }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.assetRequestsSubtitle }}</p>
                </div>
            </div>
            <span v-if="pendingCount > 0"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                {{ pendingCount }} {{ t.pendingRequests }}
            </span>
        </div>

        <!-- Filter Tabs -->
        <div class="transition-all duration-500 delay-75"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
            <div v-if="properties.length === 0"
                class="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                <i class="fa-solid fa-triangle-exclamation text-base"></i>
                <span>{{ t.noPropertySelected }}</span>
            </div>
            <div v-else class="flex items-center gap-3">
                <i class="fa-solid fa-house text-gray-400 text-sm"></i>
                <select v-model="selectedPropertyId" @change="onPropertyChange"
                    class="flex-1 max-w-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm">
                    <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit transition-all duration-500 delay-75"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <button v-for="tab in (['all', 'pending', 'approved', 'rejected'] as const)" :key="tab"
                @click="filterStatus = tab" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all" :class="filterStatus === tab
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                {{ tab === 'all' ? t.all : tab === 'pending' ? t.pending : tab === 'approved' ? t.approved : t.rejected
                }}
                <span v-if="tab === 'pending' && pendingCount > 0"
                    class="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-amber-500 text-white rounded-full">
                    {{ pendingCount }}
                </span>
            </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.assetRequests }}...</p>
            </div>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredRequests.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <i class="fa-solid fa-inbox text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noRequestsFound }}</h3>
        </div>

        <!-- List -->
        <div v-else class="space-y-3">
            <div v-for="(req, idx) in filteredRequests" :key="req.documentId"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-500"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${idx * 40}ms` : '0ms' }">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex items-start gap-4 flex-1 min-w-0">
                        <div
                            class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i class="fa-solid fa-puzzle-piece text-lg text-primary-600 dark:text-primary-400"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">
                                    {{ req.asset?.name ?? 'Unknown asset' }}
                                </h3>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[req.status]">
                                    {{ req.status === 'pending' ? t.pending : req.status === 'approved' ? t.approved :
                                        t.rejected }}
                                </span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {{ req.resident?.username ?? 'Unknown resident' }}
                                <span v-if="req.property" class="before:content-['·'] before:mx-1">{{ req.property.name
                                    }}</span>
                            </p>
                            <p v-if="req.notes" class="text-sm text-gray-600 dark:text-gray-300 mt-1 italic">"{{
                                req.notes }}"</p>
                            <p v-if="req.rejectionReason && req.status === 'rejected'"
                                class="text-sm text-red-500 dark:text-red-400 mt-1">
                                {{ t.reasonLabel }}: {{ req.rejectionReason }}
                            </p>
                            <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                    {{ req.asset?.currency ?? 'THB' }} {{ (req.asset?.price ?? 0).toLocaleString()
                                    }}/month
                                </span>
                                <span class="inline-flex items-center gap-1 text-xs text-gray-400">
                                    <i class="fa-solid fa-calendar text-[10px]"></i>
                                    {{ formatDate(req.createdAt) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions (only for pending) -->
                    <div v-if="req.status === 'pending'" class="flex items-center gap-2 flex-shrink-0">
                        <button @click="openReject(req)"
                            class="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors">
                            {{ t.reject }}
                        </button>
                        <button @click="openApprove(req)"
                            class="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                            {{ t.approve }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Action Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showActionModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
                        <div
                            class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center"
                                    :class="actionType === 'approve' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'">
                                    <i :class="actionType === 'approve' ? 'fa-solid fa-check text-emerald-600 dark:text-emerald-400' : 'fa-solid fa-xmark text-red-600 dark:text-red-400'"
                                        class="text-sm"></i>
                                </div>
                                <h2 class="text-base font-semibold text-gray-900 dark:text-white">
                                    {{ actionType === 'approve' ? t.approveRequest : t.rejectRequest }}
                                </h2>
                            </div>
                            <button @click="showActionModal = false"
                                class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <i class="fa-solid fa-xmark text-sm"></i>
                            </button>
                        </div>
                        <div class="p-5 space-y-4">
                            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <p class="font-medium text-gray-900 dark:text-white text-sm">{{
                                    selectedRequest?.asset?.name }}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    {{ t.requestedOn }} {{ selectedRequest?.resident?.username }} ·
                                    {{ selectedRequest?.asset?.currency }} {{ (selectedRequest?.asset?.price ??
                                        0).toLocaleString() }}/month
                                </p>
                            </div>
                            <div v-if="actionType === 'approve'">
                                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t.approveConfirmMsg }}</p>
                            </div>
                            <div v-else>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.rejectionReason }}</label>
                                <textarea v-model="rejectionReason" rows="3" :placeholder="t.rejectionReasonPlaceholder"
                                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-800">
                            <button @click="showActionModal = false" :disabled="isActioning"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="submitAction" :disabled="isActioning"
                                class="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                :class="actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'">
                                <i v-if="isActioning" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                {{ actionType === 'approve' ? t.approve : t.reject }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
