<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { token, user } = useAuth()
const { t } = useI18n()
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

// ─── Entry Animation ─────────────────────────────────────────────────────────
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
            selectedPropertyId.value = properties.value[0].id
        }
    } catch { }
}

interface Asset {
    id: number
    documentId: string
    name: string
    description: string | null
    price: number
    currency: string
    status: 'active' | 'inactive'
    property?: { id: number; documentId: string; name: string } | null
}

const assets = ref<Asset[]>([])
const isLoading = ref(true)

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
const showModal = ref(false)
const isEditing = ref(false)
const isSaving = ref(false)
const editingDocId = ref<string | null>(null)

interface AssetForm {
    name: string
    description: string
    price: number
    currency: string
    status: 'active' | 'inactive'
}

const form = ref<AssetForm>({
    name: '',
    description: '',
    price: 0,
    currency: 'THB',
    status: 'active',
})

// ─── Delete confirm ───────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deletingDocId = ref<string | null>(null)
const isDeleting = ref(false)

async function fetchAssets() {
    if (!selectedPropertyId.value) { assets.value = []; isLoading.value = false; return }
    isLoading.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'property',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '100',
        })
        params.set('filters[property][id][$eq]', String(selectedPropertyId.value))
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
            property: a.property ?? null,
        }))
    } catch (err) {
        showToast('error', 'Failed to load assets')
    } finally {
        isLoading.value = false
    }
}

function openCreateModal() {
    isEditing.value = false
    editingDocId.value = null
    form.value = { name: '', description: '', price: 0, currency: 'THB', status: 'active' }
    showModal.value = true
}

function openEditModal(asset: Asset) {
    isEditing.value = true
    editingDocId.value = asset.documentId
    form.value = {
        name: asset.name,
        description: asset.description ?? '',
        price: asset.price,
        currency: asset.currency,
        status: asset.status,
    }
    showModal.value = true
}

function closeModal() {
    showModal.value = false
}

async function saveAsset() {
    if (!form.value.name || form.value.price < 0) return
    isSaving.value = true
    try {
        const payload = {
            data: {
                name: form.value.name,
                description: form.value.description || null,
                price: form.value.price,
                currency: form.value.currency,
                status: form.value.status,
                ...(selectedPropertyId.value ? { property: selectedPropertyId.value } : {}),
            },
        }

        const url = isEditing.value
            ? `${STRAPI_URL}/api/assets/${editingDocId.value}`
            : `${STRAPI_URL}/api/assets`
        const method = isEditing.value ? 'PUT' : 'POST'

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to save')
        showToast('success', isEditing.value ? t.value.saveChanges + '!' : t.value.createAsset + '!')
        closeModal()
        await fetchAssets()
    } catch (err) {
        showToast('error', 'Failed to save asset')
    } finally {
        isSaving.value = false
    }
}

function confirmDelete(docId: string) {
    deletingDocId.value = docId
    showDeleteConfirm.value = true
}

async function deleteAsset() {
    if (!deletingDocId.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/assets/${deletingDocId.value}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to delete')
        showToast('success', t.value.deleteAsset + '!')
        showDeleteConfirm.value = false
        deletingDocId.value = null
        await fetchAssets()
    } catch (err) {
        showToast('error', 'Failed to delete asset')
    } finally {
        isDeleting.value = false
    }
}

function statusLabel(status: string) {
    return status === 'active' ? t.value.assetStatusActive : t.value.assetStatusInactive
}

const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

async function onPropertyChange() {
    listVisible.value = false
    await fetchAssets()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => { listVisible.value = true }))
}

onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchProperties()
    await fetchAssets()
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
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.assets }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t.assetsSubtitle }}</p>
            </div>
            <div class="flex items-center gap-3">
                <NuxtLink to="/manager/asset-requests"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
                    <i class="fa-solid fa-inbox text-sm"></i>
                    {{ t.assetRequests }}
                </NuxtLink>
                <button @click="openCreateModal"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm">
                    <i class="fa-solid fa-plus text-xs"></i>
                    {{ t.addAsset }}
                </button>
            </div>
        </div>

        <!-- Property Selector -->
        <div class="transition-all duration-500 delay-75"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
            <div v-if="properties.length === 0"
                class="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                <i class="fa-solid fa-triangle-exclamation text-base"></i>
                <span>{{ t.noPropertySelected }}</span>
                <NuxtLink to="/manager/properties/create"
                    class="ml-auto font-medium underline underline-offset-2 hover:no-underline">
                    {{ t.addProperty }}
                </NuxtLink>
            </div>
            <div v-else class="flex items-center gap-3">
                <i class="fa-solid fa-house text-gray-400 text-sm"></i>
                <select v-model="selectedPropertyId" @change="onPropertyChange"
                    class="flex-1 max-w-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm">
                    <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.assets }}...</p>
            </div>
        </div>

        <!-- Empty -->
        <div v-else-if="assets.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <i class="fa-solid fa-puzzle-piece text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noAssetsYet }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.noAssetsYetDesc }}</p>
            <button @click="openCreateModal"
                class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                <i class="fa-solid fa-plus text-xs"></i>
                {{ t.addFirstAsset }}
            </button>
        </div>

        <!-- Asset Grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="(asset, idx) in assets" :key="asset.documentId"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-3 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-500"
                :class="listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'"
                :style="{ transitionDelay: listVisible ? `${idx * 40}ms` : '0ms' }">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div
                            class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i class="fa-solid fa-puzzle-piece text-lg text-primary-600 dark:text-primary-400"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900 dark:text-white">{{ asset.name }}</h3>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
                                :class="statusColors[asset.status]">
                                {{ statusLabel(asset.status) }}
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                        <button @click="openEditModal(asset)"
                            class="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <i class="fa-solid fa-pen text-sm"></i>
                        </button>
                        <button @click="confirmDelete(asset.documentId)"
                            class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <i class="fa-solid fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
                <p v-if="asset.description" class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{{
                    asset.description }}</p>
                <div
                    class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 mt-auto">
                    <span class="text-xs text-gray-400">{{ t.monthlyPrice }}</span>
                    <span class="text-base font-bold text-gray-900 dark:text-white">
                        {{ asset.currency }} {{ asset.price.toLocaleString() }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Create / Edit Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
                <div v-if="showModal"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    @click.self="closeModal">
                    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
                        <div
                            class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                                {{ isEditing ? t.editAsset : t.newAsset }}
                            </h2>
                            <button @click="closeModal"
                                class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <i class="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>
                        <div class="p-6 space-y-4">
                            <!-- Name -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.assetName }}
                                    <span class="text-red-500">*</span></label>
                                <input v-model="form.name" type="text" :placeholder="t.assetNamePlaceholder"
                                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                            <!-- Description -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.assetDescription }}</label>
                                <textarea v-model="form.description" rows="2"
                                    :placeholder="t.assetDescriptionPlaceholder"
                                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                            </div>
                            <!-- Price + Currency -->
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                        t.assetPrice }}
                                        <span class="text-red-500">*</span></label>
                                    <input v-model.number="form.price" type="number" min="0" step="0.01"
                                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                        t.currency }}</label>
                                    <input v-model="form.currency" type="text" maxlength="5"
                                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                </div>
                            </div>
                            <!-- Status -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.assetStatus }}</label>
                                <select v-model="form.status"
                                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                                    <option value="active">{{ t.assetStatusActive }}</option>
                                    <option value="inactive">{{ t.assetStatusInactive }}</option>
                                </select>
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
                            <button @click="closeModal"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="saveAsset" :disabled="isSaving || !form.name"
                                class="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2">
                                <div v-if="isSaving"
                                    class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin">
                                </div>
                                {{ isEditing ? t.saveChanges : t.createAsset }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Delete Confirm Modal -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showDeleteConfirm"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6">
                        <div class="flex items-start gap-4">
                            <div
                                class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">{{ t.deleteAsset }}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">{{ t.deleteAssetConfirm }}</p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 mt-6">
                            <button @click="showDeleteConfirm = false; deletingDocId = null" :disabled="isDeleting"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="deleteAsset" :disabled="isDeleting"
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
