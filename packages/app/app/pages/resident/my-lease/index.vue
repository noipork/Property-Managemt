<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'

const { t } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lease {
    id: number
    documentId: string
    leaseNo: string
    status: 'pending' | 'active' | 'expired' | 'terminated' | 'cancelled'
    startDate: string
    endDate: string
    monthlyRent: number
    depositAmount: number
    currency: string
    notes: string | null
    terms: string | null
    acceptedAt: string | null
    identityVerified: boolean
    identityDocumentType: string | null
    identityDocumentNumber: string | null
    residentFullName: string | null
    residentPhone: string | null
    residentAddress: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
    identityDocuments?: { id: number; url: string; name: string; ext: string }[]
    createdAt: string
    property?: { id: number; documentId: string; name: string; city?: string; address?: string }
    unitType?: { id: number; name: string; unitType?: string }
    resident?: { id: number; username: string; email: string }
}

interface LeaseForm {
    residentFullName: string
    residentPhone: string
    residentAddress: string
    emergencyContactName: string
    emergencyContactPhone: string
    identityDocumentType: string
    identityDocumentNumber: string
}

// ─── State ────────────────────────────────────────────────────────────────────
const lease = ref<Lease | null>(null)
const allLeases = ref<Lease[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const isAccepting = ref(false)
const isSavingInfo = ref(false)
const uploadedFiles = ref<File[]>([])
const existingDocuments = ref<{ id: number; url: string; name: string; ext: string }[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const leaseForm = ref<LeaseForm>({
    residentFullName: '',
    residentPhone: '',
    residentAddress: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    identityDocumentType: '',
    identityDocumentNumber: '',
})

// ─── Toast ────────────────────────────────────────────────────────────────────
const toasts = ref<{ id: number; type: 'success' | 'error'; message: string }[]>([])
let toastId = 0
function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastId
    toasts.value.push({ id, type, message })
    setTimeout(() => dismissToast(id), 4000)
}
function dismissToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
}

// ─── Computed ─────────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    terminated: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const statusLabels = computed(() => ({
    pending: t.value.leaseStatusPending || 'Pending',
    reviewing: t.value.leaseStatusReviewing || 'Under Review',
    active: t.value.statusActive,
    expired: t.value.statusExpired,
    terminated: t.value.leaseTerminated || 'Terminated',
    cancelled: 'Cancelled',
}))

const daysRemaining = computed(() => {
    if (!lease.value?.endDate) return null
    const end = new Date(lease.value.endDate)
    const now = new Date()
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
})

const leaseProgress = computed(() => {
    if (!lease.value?.startDate || !lease.value?.endDate) return 0
    const start = new Date(lease.value.startDate).getTime()
    const end = new Date(lease.value.endDate).getTime()
    const now = Date.now()
    if (now <= start) return 0
    if (now >= end) return 100
    return Math.round(((now - start) / (end - start)) * 100)
})

const requiredFields: Array<keyof LeaseForm> = [
    'residentFullName',
    'residentPhone',
    'residentAddress',
    'emergencyContactName',
    'emergencyContactPhone',
    'identityDocumentType',
]

const fieldLabels: Record<keyof LeaseForm, string> = {
    residentFullName: t.value.fullName || 'Full Name',
    residentPhone: t.value.leasePhone || 'Phone',
    residentAddress: t.value.leaseAddress || 'Address',
    emergencyContactName: t.value.emergencyContactName || 'Emergency Contact Name',
    emergencyContactPhone: t.value.emergencyContactPhone || 'Emergency Contact Phone',
    identityDocumentType: t.value.leaseDocType || 'Document Type',
    identityDocumentNumber: t.value.leaseDocNumber || 'Document Number',
}

const missingRequiredFields = computed(() => requiredFields.filter(f => !(leaseForm.value[f] || '').toString().trim()))
const missingFieldLabels = computed(() => missingRequiredFields.value.map(f => fieldLabels[f] || f))
const pendingBannerDesc = computed(() =>
    missingFieldLabels.value.length
        ? (t.value.completeInfoBeforeAccept || 'Complete all required information below before accepting.')
        : (t.value.pendingAcceptanceDesc || 'Please review the lease details and terms below, then accept to activate your lease.')
)

const ui = computed(() => ({
    completeYourInfo: t.value.completeYourInfo || 'Complete Your Information',
    infoRequiredToAccept: t.value.infoRequiredToAccept || 'Fill in the required details below to activate your lease.',
    fieldsMissing: t.value.fieldsMissing || 'fields missing',
    allSet: t.value.allSet || 'All set ✓',
    fullName: t.value.fullName || 'Full Name',
    leasePhone: t.value.leasePhone || 'Phone',
    leaseAddress: t.value.leaseAddress || 'Address',
    emergencyContactName: t.value.emergencyContactName || 'Emergency Contact Name',
    emergencyContactPhone: t.value.emergencyContactPhone || 'Emergency Contact Phone',
    leaseDocType: t.value.leaseDocType || 'Document Type',
    leaseDocNumber: t.value.leaseDocNumber || 'Document Number',
    selectDocType: t.value.selectDocType || 'Select document type',
    nationalId: t.value.nationalId || 'National ID',
    passport: t.value.passport || 'Passport',
    driversLicense: t.value.driversLicense || "Driver's License",
    otherDocType: t.value.otherDocType || 'Other',
    fieldsMissingLabel: t.value.fieldsMissing || 'Fields missing:',
    allInfoCompleted: t.value.allInfoCompleted || 'All required information is completed.',
    saving: t.value.saving || 'Saving…',
    saveInfo: t.value.saveInfo || 'Save Information',
    saveAndSubmit: t.value.saveAndSubmit || 'Save & Submit for Review',
    uploadDocuments: t.value.uploadDocuments || 'Identity Documents',
    uploadDocumentsHint: t.value.uploadDocumentsHint || 'Upload a photo of your ID, passport, or other identity document (JPG, PNG, PDF).',
    uploadDocumentsBtn: t.value.uploadDocumentsBtn || 'Choose files',
    uploadDocumentsRequired: t.value.uploadDocumentsRequired || 'At least one document is required.',
    removeFile: t.value.removeFile || 'Remove',
}))

function hydrateFormFromLease(current?: Lease | null) {
    const data = current || lease.value
    if (!data) return

    // If current lease has no data, try to find previous lease with data
    const hasData = data.residentFullName || data.residentPhone || data.residentAddress
    if (!hasData && allLeases.value.length > 1) {
        // Find most recent completed lease (has accepted info)
        const previousLease = allLeases.value
            .filter(l => l.documentId !== data.documentId && l.acceptedAt)
            .sort((a, b) => new Date(b.acceptedAt!).getTime() - new Date(a.acceptedAt!).getTime())[0]

        if (previousLease) {
            leaseForm.value = {
                residentFullName: previousLease.residentFullName || '',
                residentPhone: previousLease.residentPhone || '',
                residentAddress: previousLease.residentAddress || '',
                emergencyContactName: previousLease.emergencyContactName || '',
                emergencyContactPhone: previousLease.emergencyContactPhone || '',
                identityDocumentType: previousLease.identityDocumentType || '',
                identityDocumentNumber: previousLease.identityDocumentNumber || '',
            }
            existingDocuments.value = previousLease.identityDocuments || []
            uploadedFiles.value = []
            return
        }
    }

    leaseForm.value = {
        residentFullName: data.residentFullName || '',
        residentPhone: data.residentPhone || '',
        residentAddress: data.residentAddress || '',
        emergencyContactName: data.emergencyContactName || '',
        emergencyContactPhone: data.emergencyContactPhone || '',
        identityDocumentType: data.identityDocumentType || '',
        identityDocumentNumber: data.identityDocumentNumber || '',
    }
    existingDocuments.value = data.identityDocuments || []
    uploadedFiles.value = []
}

function selectLease(selectedLease: Lease) {
    lease.value = selectedLease
    hydrateFormFromLease(selectedLease)
}

function cleanedFormData() {
    const cleaned: Partial<LeaseForm> = {}
    requiredFields.forEach(key => {
        cleaned[key] = (leaseForm.value[key] || '').toString().trim()
    })
    return cleaned
}

const hasDocuments = computed(() => existingDocuments.value.length > 0 || uploadedFiles.value.length > 0)
const canAcceptLease = computed(() =>
    lease.value?.status === 'pending' &&
    missingRequiredFields.value.length === 0 &&
    hasDocuments.value &&
    !isAccepting.value
)

const hasMultipleLeases = computed(() => allLeases.value.length > 1)
const historicalLeases = computed(() =>
    allLeases.value.filter(l => l.status === 'expired' || l.status === 'terminated' || l.status === 'cancelled')
)

function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (!input.files) return
    const newFiles = Array.from(input.files)

    // Check file sizes (10MB limit per file)
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    const oversizedFiles = newFiles.filter(f => f.size > MAX_FILE_SIZE)

    if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map(f => f.name).join(', ')
        showToast('error', `File(s) too large: ${fileNames}. Maximum size is 10MB per file.`)
        input.value = ''
        return
    }

    uploadedFiles.value = [...uploadedFiles.value, ...newFiles]
    input.value = ''
}

function removeNewFile(index: number) {
    uploadedFiles.value = uploadedFiles.value.filter((_, i) => i !== index)
}

async function removeExistingDocument(fileId: number) {
    if (!lease.value) return
    try {
        await fetch(`${STRAPI_URL}/upload/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` },
        })
        existingDocuments.value = existingDocuments.value.filter(d => d.id !== fileId)
    } catch {
        showToast('error', 'Could not remove file')
    }
}

async function uploadFilesToStrapi(): Promise<number[]> {
    if (!uploadedFiles.value.length) return []
    const formData = new FormData()
    uploadedFiles.value.forEach(f => formData.append('files', f))
    const res = await fetch(`${STRAPI_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: formData,
    })
    if (!res.ok) {
        if (res.status === 413) {
            throw new Error('File size too large. Please upload files smaller than 10MB each.')
        }
        throw new Error('Upload failed')
    }
    const uploaded = await res.json()
    return (uploaded as { id: number }[]).map(f => f.id)
}

// ─── Gallery / Lightbox ───────────────────────────────────────────────────────
const lightboxSrc = ref<string | null>(null)
const lightboxName = ref('')

function openLightbox(src: string, name: string) {
    lightboxSrc.value = src
    lightboxName.value = name
}
function closeLightbox() {
    lightboxSrc.value = null
    lightboxName.value = ''
}

function fileObjectUrl(file: File): string {
    return URL.createObjectURL(file)
}

function isImageFile(nameOrExt: string): boolean {
    return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(nameOrExt)
}

function fileTypeIcon(nameOrExt: string): string {
    if (isImageFile(nameOrExt)) return 'fa-solid fa-image'
    if (/\.pdf$/i.test(nameOrExt)) return 'fa-solid fa-file-pdf'
    return 'fa-solid fa-file'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | null, currency = 'THB') {
    if (amount == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function leaseDuration(start: string, end: string) {
    if (!start || !end) return '—'
    const s = new Date(start)
    const e = new Date(end)
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months >= 12) {
        const y = Math.floor(months / 12)
        const m = months % 12
        return m > 0 ? `${y}y ${m}m` : `${y}y`
    }
    return `${months}m`
}

// ─── Fetch Lease ──────────────────────────────────────────────────────────────
async function fetchLease() {
    isLoading.value = true
    errorMessage.value = ''
    try {
        if (!user.value?.documentId) {
            throw new Error('Missing user documentId')
        }

        const params = new URLSearchParams()
        params.set('populate[property]', 'true')
        params.set('populate[unitType]', 'true')
        params.set('populate[resident]', 'true')
        params.set('populate[identityDocuments]', 'true')
        params.set('filters[resident][documentId][$eq]', user.value.documentId)
        params.set('sort[0]', 'createdAt:desc')
        params.set('pagination[pageSize]', '100')

        const res = await fetch(`${STRAPI_URL}/api/leases?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        allLeases.value = data.data || []

        // Prefer active lease, then pending, then most recent
        lease.value = allLeases.value.find((l: Lease) => l.status === 'active')
            || allLeases.value.find((l: Lease) => l.status === 'pending')
            || allLeases.value[0]
            || null
        hydrateFormFromLease(lease.value)
    } catch {
        errorMessage.value = t.value.leaseLoadError
    } finally {
        isLoading.value = false
    }
}

// ─── Accept Lease ─────────────────────────────────────────────────────────────
async function acceptLease() {
    if (!lease.value || lease.value.status !== 'pending') return
    if (missingRequiredFields.value.length) {
        showToast('error', t.value.leaseInfoRequired || 'Please complete all required information before accepting.')
        return
    }
    if (!hasDocuments.value) {
        showToast('error', ui.value.uploadDocumentsRequired)
        return
    }
    isAccepting.value = true
    try {
        const newFileIds = await uploadFilesToStrapi()
        const existingIds = existingDocuments.value.map(d => d.id)
        const allDocIds = [...existingIds, ...newFileIds]
        const res = await fetch(`${STRAPI_URL}/api/leases/${lease.value.documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                data: {
                    ...cleanedFormData(),
                    identityDocuments: allDocIds,
                    status: 'reviewing',
                    acceptedAt: new Date().toISOString(),
                },
            }),
        })
        if (!res.ok) throw new Error('Accept failed')
        showToast('success', t.value.leaseSubmittedForReview || 'Lease submitted for manager review')
        await fetchLease()
    } catch (err: any) {
        const errorMessage = err.message || t.value.leaseAcceptError
        showToast('error', errorMessage)
    } finally {
        isAccepting.value = false
    }
}
// ─── Save Resident Info (auto-accepts when all info is complete) ────────────
async function saveLeaseInfo() {
    if (!lease.value) return
    isSavingInfo.value = true
    try {
        const newFileIds = await uploadFilesToStrapi()
        const existingIds = existingDocuments.value.map(d => d.id)
        const allDocIds = [...existingIds, ...newFileIds]

        // Auto-accept: if all required fields filled + has documents + status is pending
        const shouldAutoAccept =
            lease.value.status === 'pending' &&
            missingRequiredFields.value.length === 0 &&
            (allDocIds.length > 0)

        const payload: Record<string, any> = {
            ...cleanedFormData(),
            identityDocuments: allDocIds,
        }
        if (shouldAutoAccept) {
            payload.status = 'reviewing'
            payload.acceptedAt = new Date().toISOString()
        }

        const res = await fetch(`${STRAPI_URL}/api/leases/${lease.value.documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({ data: payload }),
        })
        if (!res.ok) throw new Error(shouldAutoAccept ? 'Accept failed' : 'Save failed')
        showToast('success', shouldAutoAccept
            ? (t.value.leaseSubmittedForReview || 'Lease submitted for manager review')
            : (t.value.leaseInfoSaved || 'Information saved'))
        await fetchLease()
    } catch (err: any) {
        const errorMessage = err.message || t.value.leaseInfoSaveError || 'Could not save information'
        showToast('error', errorMessage)
    } finally {
        isSavingInfo.value = false
    }
}

// ─── Entry Animation ──────────────────────────────────────────────────────────
const headerVisible = ref(false)
const mainVisible = ref(false)
const sidebarVisible = ref(false)

onMounted(async () => {
    await fetchLease()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
        mainVisible.value = true
        sidebarVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-20 md:pb-0">
        <!-- Toast -->
        <Teleport to="body">
            <div
                class="fixed top-4 left-4 right-4 sm:left-auto sm:top-5 sm:right-5 z-50 flex flex-col gap-2 pointer-events-none sm:w-96">
                <TransitionGroup enter-active-class="transition-all duration-300"
                    enter-from-class="opacity-0 translate-x-8" enter-to-class="opacity-100 translate-x-0"
                    leave-active-class="transition-all duration-300" leave-from-class="opacity-100 translate-x-0"
                    leave-to-class="opacity-0 translate-x-8">
                    <div v-for="toast in toasts" :key="toast.id"
                        class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium"
                        :class="toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'">
                        <i :class="toast.type === 'success' ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-exclamation text-red-500'"
                            class="text-base mt-0.5 shrink-0"></i>
                        <span class="flex-1 leading-snug">{{ toast.message }}</span>
                        <button @click="dismissToast(toast.id)"
                            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"><i
                                class="fa-solid fa-xmark text-xs"></i></button>
                    </div>
                </TransitionGroup>
            </div>
        </Teleport>

        <!-- Lightbox -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-150"
                leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                <div v-if="lightboxSrc" class="fixed inset-0 z-50 flex items-center justify-center p-4"
                    @click.self="closeLightbox()">
                    <!-- Backdrop -->
                    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeLightbox()"></div>
                    <!-- Content -->
                    <div class="relative z-10 max-w-4xl w-full flex flex-col items-center gap-3">
                        <!-- Image -->
                        <img v-if="isImageFile(lightboxName)" :src="lightboxSrc" :alt="lightboxName"
                            class="max-h-[80vh] max-w-full rounded-xl shadow-2xl object-contain" />
                        <!-- PDF / other: open in new tab -->
                        <div v-else
                            class="bg-white dark:bg-gray-900 rounded-xl p-10 flex flex-col items-center gap-4 shadow-2xl">
                            <i class="fa-solid fa-file-pdf text-5xl text-red-500"></i>
                            <p class="text-sm text-gray-700 dark:text-gray-300 font-medium">{{ lightboxName }}</p>
                            <a :href="lightboxSrc" target="_blank" rel="noopener"
                                class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                Open file
                            </a>
                        </div>
                        <!-- Footer bar -->
                        <div class="flex items-center justify-between w-full px-1">
                            <span class="text-sm text-white/80 truncate max-w-xs">{{ lightboxName }}</span>
                            <button @click="closeLightbox()"
                                class="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
                                <i class="fa-solid fa-xmark"></i> Close
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <i class="fa-solid fa-circle-exclamation text-2xl text-red-500"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ errorMessage }}</h3>
            <button @click="fetchLease" class="mt-4 text-sm text-primary-600 hover:underline">{{ t.retry || 'Retry'
            }}</button>
        </div>

        <!-- No Lease -->
        <div v-else-if="!lease" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
                <i class="fa-solid fa-file-circle-xmark text-3xl text-gray-400 dark:text-gray-500"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">{{ t.noActiveLease }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 max-w-md">{{ t.noActiveLeaseDesc }}</p>
            <NuxtLink to="/resident/messages"
                class="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <i class="fa-solid fa-message text-sm"></i>
                {{ t.contactManager }}
            </NuxtLink>
        </div>

        <!-- Lease Content -->
        <template v-else>
            <!-- Pending Acceptance Banner -->
            <div v-if="lease.status === 'pending'"
                class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex items-center gap-3 flex-1">
                    <div
                        class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-clock text-amber-600 dark:text-amber-400 text-lg"></i>
                    </div>
                    <div>
                        <h3 class="text-sm font-semibold text-amber-800 dark:text-amber-300">{{ t.pendingAcceptance }}
                        </h3>
                        <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{{ pendingBannerDesc }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span v-if="canAcceptLease"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-semibold">
                        <i class="fa-solid fa-circle-check text-xs"></i>
                        {{ t.readyToSubmit || 'Ready — save to submit' }}
                    </span>
                    <span v-else
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-semibold">
                        <i class="fa-solid fa-circle-info text-xs"></i>
                        {{ t.completeInfoFirst || 'Complete info below' }}
                    </span>
                </div>
            </div>

            <!-- Expiring Soon Warning -->
            <div v-else-if="lease.status === 'active' && daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 30"
                class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5 flex items-start gap-3 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div
                    class="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-triangle-exclamation text-orange-600 dark:text-orange-400 text-lg"></i>
                </div>
                <div>
                    <h3 class="text-sm font-semibold text-orange-800 dark:text-orange-300">{{ t.leaseExpiresSoon }}</h3>
                    <p class="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                        {{ t.leaseExpiresSoonDesc.replace('{days}', String(daysRemaining)) }}
                    </p>
                </div>
            </div>

            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
                <div class="flex-1">
                    <div class="flex items-center gap-3">
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.myLease }}</h1>
                        <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                            :class="statusColors[lease.status] || statusColors.pending">
                            {{ statusLabels[lease.status as keyof typeof statusLabels] || lease.status }}
                        </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ lease.leaseNo }}</p>
                </div>
            </div>

            <!-- Main Content -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <!-- Left: Main info -->
                <div class="lg:col-span-2 space-y-4 sm:space-y-6 order-2 lg:order-1 transition-all duration-500 delay-100"
                    :class="mainVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

                    <!-- Lease Overview -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseOverview }}</h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseNo }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ lease.leaseNo
                                }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.status }}</p>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                    :class="statusColors[lease.status] || statusColors.pending">
                                    {{ statusLabels[lease.status as keyof typeof statusLabels] || lease.status }}
                                </span>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseCurrency }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.currency }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseStartDate }}
                                </p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(lease.startDate) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseEndDate }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    formatDate(lease.endDate) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDuration }}</p>
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded text-xs font-semibold">
                                    <i class="fa-solid fa-calendar text-xs"></i>
                                    {{ leaseDuration(lease.startDate, lease.endDate) }}
                                </span>
                            </div>
                            <div v-if="lease.acceptedAt">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseAcceptedAt }}
                                </p>
                                <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                    formatDate(lease.acceptedAt) }}</p>
                            </div>
                        </div>

                        <!-- Lease Progress Bar -->
                        <div v-if="lease.status === 'active'"
                            class="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs text-gray-400">{{ t.leaseDuration }}</span>
                                <span v-if="daysRemaining !== null && daysRemaining > 0" class="text-xs font-medium"
                                    :class="daysRemaining <= 30 ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400'">
                                    {{ daysRemaining }} {{ t.daysRemaining }}
                                </span>
                            </div>
                            <div class="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-700"
                                    :class="leaseProgress >= 90 ? 'bg-orange-500' : 'bg-primary-500'"
                                    :style="{ width: `${leaseProgress}%` }"></div>
                            </div>
                            <div class="flex justify-between mt-1">
                                <span class="text-xs text-gray-400">{{ formatDate(lease.startDate) }}</span>
                                <span class="text-xs text-gray-400">{{ formatDate(lease.endDate) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Financial -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseFinancial }}</h3>
                        <div
                            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.leaseMonthlyRent }}</span>
                            <span class="text-sm font-semibold text-primary-600 dark:text-primary-400">{{
                                formatCurrency(lease.monthlyRent, lease.currency) }}</span>
                        </div>
                        <div class="flex items-center justify-between py-2">
                            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t.leaseDepositAmount }}</span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">{{
                                formatCurrency(lease.depositAmount, lease.currency) }}</span>
                        </div>
                    </div>

                    <!-- Resident Info Form (pending) -->
                    <div v-if="lease.status === 'pending'"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-5">
                        <!-- Section header -->
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                                <h3
                                    class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                                    {{ ui.completeYourInfo }}
                                </h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ ui.infoRequiredToAccept }}
                                </p>
                                <!-- Auto-filled notice -->
                                <div v-if="existingDocuments.length > 0 && (leaseForm.residentFullName || leaseForm.residentPhone)"
                                    class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <i class="fa-solid fa-circle-info text-blue-500 text-xs"></i>
                                    <span class="text-xs text-blue-700 dark:text-blue-300">
                                        {{ t.autoFilledFromPrevious
                                            || 'Information auto-filled from your previous lease' }}
                                    </span>
                                </div>
                            </div>
                            <span
                                class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                :class="(missingFieldLabels.length || !hasDocuments)
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'">
                                <i :class="(missingFieldLabels.length || !hasDocuments) ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'"
                                    class="text-[11px]"></i>
                                {{ missingFieldLabels.length ? missingFieldLabels.length + ' ' + ui.fieldsMissing :
                                    (!hasDocuments ? ui.uploadDocumentsRequired : ui.allSet) }}
                            </span>
                        </div>

                        <form class="space-y-4" @submit.prevent="saveLeaseInfo">
                            <!-- Row 1: Full name + Phone -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.fullName }}
                                        <span class="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <input v-model="leaseForm.residentFullName" type="text"
                                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition"
                                            :placeholder="ui.fullName" required>
                                    </div>
                                </div>
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.leasePhone }}
                                        <span class="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-phone absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <input v-model="leaseForm.residentPhone" type="tel"
                                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition"
                                            :placeholder="ui.leasePhone" required>
                                    </div>
                                </div>
                            </div>

                            <!-- Row 2: Address (full width) -->
                            <div class="space-y-1.5">
                                <label
                                    class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                    {{ ui.leaseAddress }}
                                    <span class="text-red-500 ml-0.5">*</span>
                                </label>
                                <div class="relative">
                                    <i
                                        class="fa-solid fa-location-dot absolute left-3 top-3 text-gray-400 text-sm pointer-events-none"></i>
                                    <textarea v-model="leaseForm.residentAddress" rows="2"
                                        class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition resize-none"
                                        :placeholder="ui.leaseAddress" required></textarea>
                                </div>
                            </div>

                            <!-- Row 3: Emergency contact name + phone -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.emergencyContactName }}
                                        <span class="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-user-shield absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <input v-model="leaseForm.emergencyContactName" type="text"
                                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition"
                                            :placeholder="ui.emergencyContactName" required>
                                    </div>
                                </div>
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.emergencyContactPhone }}
                                        <span class="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-phone-volume absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <input v-model="leaseForm.emergencyContactPhone" type="tel"
                                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition"
                                            :placeholder="ui.emergencyContactPhone" required>
                                    </div>
                                </div>
                            </div>

                            <!-- Row 4: Document type + number -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.leaseDocType }}
                                        <span class="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-id-card absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <select v-model="leaseForm.identityDocumentType"
                                            class="w-full pl-9 pr-8 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition appearance-none"
                                            required>
                                            <option value="" disabled>{{ ui.selectDocType }}</option>
                                            <option value="nationalId">{{ ui.nationalId }}</option>
                                            <option value="passport">{{ ui.passport }}</option>
                                            <option value="driversLicense">{{ ui.driversLicense }}</option>
                                            <option value="other">{{ ui.otherDocType }}</option>
                                        </select>
                                        <i
                                            class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                                    </div>
                                </div>
                                <div class="space-y-1.5">
                                    <label
                                        class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                        {{ ui.leaseDocNumber }}
                                    </label>
                                    <div class="relative">
                                        <i
                                            class="fa-solid fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                                        <input v-model="leaseForm.identityDocumentNumber" type="text"
                                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 transition"
                                            :placeholder="ui.leaseDocNumber">
                                    </div>
                                </div>
                            </div>

                            <!-- Row 5: Identity Document Upload -->
                            <div class="space-y-1.5">
                                <label
                                    class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                    {{ ui.uploadDocuments }}
                                    <span class="text-red-500 ml-0.5">*</span>
                                </label>
                                <p class="text-xs text-gray-400 dark:text-gray-500 -mt-0.5">{{ ui.uploadDocumentsHint }}
                                </p>

                                <!-- Gallery grid: saved + new files -->
                                <div v-if="existingDocuments.length || uploadedFiles.length"
                                    class="flex flex-col gap-3 mt-2">

                                    <!-- Saved (already uploaded) files -->
                                    <div v-for="doc in existingDocuments" :key="'ex-' + doc.id"
                                        class="group relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col w-full">
                                        <!-- Image preview -->
                                        <template v-if="isImageFile(doc.name)">
                                            <div class="aspect-[4/3] overflow-hidden">
                                                <img :src="STRAPI_URL + doc.url" :alt="doc.name"
                                                    class="w-full h-full object-cover cursor-zoom-in"
                                                    @click="openLightbox(STRAPI_URL + doc.url, doc.name)" />
                                            </div>
                                        </template>
                                        <!-- Non-image (PDF, etc.) -->
                                        <template v-else>
                                            <button type="button"
                                                class="aspect-[4/3] w-full flex flex-col items-center justify-center gap-2 cursor-pointer"
                                                @click="openLightbox(STRAPI_URL + doc.url, doc.name)">
                                                <i :class="fileTypeIcon(doc.name)" class="text-3xl text-gray-400"></i>
                                                <span
                                                    class="text-xs text-gray-500 dark:text-gray-400 px-2 text-center truncate w-full">{{
                                                        doc.name }}</span>
                                            </button>
                                        </template>
                                        <!-- Mobile-friendly action bar -->
                                        <div
                                            class="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                            <span
                                                class="text-[11px] text-gray-600 dark:text-gray-400 truncate flex-1">{{
                                                    doc.name }}</span>
                                            <div class="flex items-center gap-1.5 shrink-0">
                                                <button type="button"
                                                    @click="openLightbox(STRAPI_URL + doc.url, doc.name)"
                                                    class="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 flex items-center justify-center transition-colors">
                                                    <i
                                                        class="fa-solid fa-eye text-[10px] text-gray-500 dark:text-gray-400"></i>
                                                </button>
                                                <button type="button" @click.stop="removeExistingDocument(doc.id)"
                                                    class="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors">
                                                    <i class="fa-solid fa-trash-can text-[10px] text-red-500"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <!-- Saved badge -->
                                        <span
                                            class="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white text-[9px] font-semibold">
                                            <i class="fa-solid fa-check text-[8px]"></i> Saved
                                        </span>
                                    </div>

                                    <!-- New (pending upload) files -->
                                    <div v-for="(file, idx) in uploadedFiles" :key="'new-' + idx"
                                        class="group relative rounded-xl overflow-hidden border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 flex flex-col w-full">
                                        <template v-if="isImageFile(file.name)">
                                            <div class="aspect-[4/3] overflow-hidden">
                                                <img :src="fileObjectUrl(file)" :alt="file.name"
                                                    class="w-full h-full object-cover cursor-zoom-in"
                                                    @click="openLightbox(fileObjectUrl(file), file.name)" />
                                            </div>
                                        </template>
                                        <template v-else>
                                            <button type="button"
                                                class="aspect-[4/3] w-full flex flex-col items-center justify-center gap-2"
                                                @click="openLightbox(fileObjectUrl(file), file.name)">
                                                <i :class="fileTypeIcon(file.name)" class="text-3xl text-blue-400"></i>
                                                <span
                                                    class="text-xs text-blue-600 dark:text-blue-300 px-2 text-center truncate w-full">{{
                                                        file.name }}</span>
                                            </button>
                                        </template>
                                        <!-- Mobile-friendly action bar -->
                                        <div
                                            class="flex items-center justify-between gap-2 px-3 py-2 border-t border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800">
                                            <span
                                                class="text-[11px] text-gray-600 dark:text-gray-400 truncate flex-1">{{
                                                    file.name }}</span>
                                            <div class="flex items-center gap-1.5 shrink-0">
                                                <button type="button"
                                                    @click="openLightbox(fileObjectUrl(file), file.name)"
                                                    class="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 flex items-center justify-center transition-colors">
                                                    <i
                                                        class="fa-solid fa-eye text-[10px] text-gray-500 dark:text-gray-400"></i>
                                                </button>
                                                <button type="button" @click.stop="removeNewFile(idx)"
                                                    class="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors">
                                                    <i class="fa-solid fa-trash-can text-[10px] text-red-500"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <!-- Pending badge -->
                                        <span
                                            class="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[9px] font-semibold">
                                            <i class="fa-solid fa-arrow-up text-[8px]"></i> New
                                        </span>
                                    </div>
                                </div>
                                <!-- Drop zone / file picker -->
                                <div class="mt-1 flex items-center justify-center gap-3 px-4 py-5 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
                                    :class="hasDocuments ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/10'"
                                    @click="fileInput?.click()">
                                    <i class="fa-solid fa-cloud-arrow-up text-xl"
                                        :class="hasDocuments ? 'text-emerald-500' : 'text-gray-400'"></i>
                                    <div class="text-center">
                                        <p class="text-sm font-medium"
                                            :class="hasDocuments ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'">
                                            {{ ui.uploadDocumentsBtn }}
                                        </p>
                                        <p class="text-xs text-gray-400 mt-0.5">JPG, PNG, PDF · Max 10MB per file</p>
                                    </div>
                                </div>
                                <input ref="fileInput" type="file" class="hidden" multiple
                                    accept="image/jpeg,image/png,image/webp,application/pdf" @change="onFileChange" />

                                <!-- Footer: status + save button -->
                                <div
                                    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <p class="text-xs">
                                        <span v-if="missingFieldLabels.length"
                                            class="text-amber-600 dark:text-amber-400">
                                            <i class="fa-solid fa-circle-info mr-1"></i>
                                            {{ ui.fieldsMissingLabel }} {{ missingFieldLabels.join(', ') }}
                                        </span>
                                        <span v-else class="text-emerald-600 dark:text-emerald-400">
                                            <i class="fa-solid fa-circle-check mr-1"></i>
                                            {{ ui.allInfoCompleted }}
                                        </span>
                                    </p>
                                    <button type="submit" :disabled="isSavingInfo"
                                        class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors shrink-0"
                                        :class="canAcceptLease ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary-600 hover:bg-primary-700'">
                                        <i :class="isSavingInfo ? 'fa-solid fa-spinner animate-spin' : (canAcceptLease ? 'fa-solid fa-paper-plane' : 'fa-solid fa-floppy-disk')"
                                            class="text-sm"></i>
                                        {{ isSavingInfo ? ui.saving : (canAcceptLease ? ui.saveAndSubmit : ui.saveInfo)
                                        }}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    <!-- Identity Info -->
                    <div v-else-if="lease.identityVerified || lease.residentFullName"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                                t.leaseIdentityInfo }}</h3>
                            <span v-if="lease.identityVerified"
                                class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold">
                                <i class="fa-solid fa-check text-xs"></i> {{ t.leaseVerified }}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div v-if="lease.residentFullName">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.fullName }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.residentFullName
                                }}</p>
                            </div>
                            <div v-if="lease.residentPhone">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leasePhone }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.residentPhone }}
                                </p>
                            </div>
                            <div v-if="lease.identityDocumentType">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDocType }}</p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                    lease.identityDocumentType }}</p>
                            </div>
                            <div v-if="lease.identityDocumentNumber">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseDocNumber }}
                                </p>
                                <p class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{
                                    lease.identityDocumentNumber }}</p>
                            </div>
                            <div v-if="lease.residentAddress" class="col-span-2">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ t.leaseAddress }}</p>
                                <p class="text-sm text-gray-700 dark:text-gray-300">{{ lease.residentAddress }}</p>
                            </div>
                        </div>
                        <!-- Emergency Contact -->
                        <div v-if="lease.emergencyContactName || lease.emergencyContactPhone"
                            class="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">{{ t.leaseEmergencyContact }}
                            </p>
                            <div class="grid grid-cols-2 gap-4">
                                <div v-if="lease.emergencyContactName">
                                    <p class="text-xs text-gray-400 mb-0.5">{{ t.fullName }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        lease.emergencyContactName }}</p>
                                </div>
                                <div v-if="lease.emergencyContactPhone">
                                    <p class="text-xs text-gray-400 mb-0.5">{{ t.leasePhone }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        lease.emergencyContactPhone }}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Uploaded Documents -->
                        <div v-if="lease.identityDocuments?.length"
                            class="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">{{ ui.uploadDocuments }}</p>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div v-for="doc in lease.identityDocuments" :key="doc.id"
                                    class="group relative rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 transition-all bg-gray-50 dark:bg-gray-800">
                                    <!-- Image preview -->
                                    <div class="aspect-square cursor-pointer"
                                        @click="openLightbox(STRAPI_URL + doc.url, doc.name)">
                                        <img v-if="isImageFile(doc.name)" :src="STRAPI_URL + doc.url" :alt="doc.name"
                                            class="w-full h-full object-cover" />
                                        <!-- PDF/Other icon -->
                                        <div v-else
                                            class="w-full h-full flex flex-col items-center justify-center gap-2">
                                            <i
                                                :class="[fileTypeIcon(doc.name), 'text-4xl', /\.pdf$/i.test(doc.name) ? 'text-red-400' : 'text-gray-400']"></i>
                                            <span
                                                class="text-xs text-gray-500 dark:text-gray-400 font-medium px-2 text-center truncate w-full">{{
                                                    doc.ext.toUpperCase() }}</span>
                                        </div>
                                    </div>
                                    <!-- Always-visible action bar -->
                                    <div
                                        class="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                        <span class="text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1">{{
                                            doc.name }}</span>
                                        <button type="button" @click="openLightbox(STRAPI_URL + doc.url, doc.name)"
                                            class="shrink-0 w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 flex items-center justify-center transition-colors">
                                            <i class="fa-solid fa-eye text-[9px] text-gray-500 dark:text-gray-400"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Terms -->
                    <div v-if="lease.terms"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseTerms }}</h3>
                        <div class="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300
                            [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2
                            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
                            text-gray-900 dark:text-gray-100" v-html="lease.terms">
                        </div>
                    </div>

                    <!-- Notes -->
                    <div v-if="lease.notes"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseNotes }}</h3>
                        <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{{ lease.notes }}</p>
                    </div>
                </div>

                <!-- Right: Sidebar -->
                <div class="space-y-4 sm:space-y-6 order-1 lg:order-2 transition-all duration-500 delay-150"
                    :class="sidebarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">

                    <!-- Rent Summary Card -->
                    <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-4 sm:p-6 text-white">
                        <p class="text-sm opacity-80">{{ t.leaseMonthlyRent }}</p>
                        <p class="text-2xl sm:text-3xl font-bold mt-1">{{ formatCurrency(lease.monthlyRent,
                            lease.currency) }}</p>
                        <p v-if="lease.depositAmount" class="text-sm opacity-80 mt-2">{{ t.leaseDepositAmount }}: {{
                            formatCurrency(lease.depositAmount, lease.currency) }}</p>
                        <div class="mt-3 pt-3 border-t border-white/20">
                            <p class="text-sm opacity-80">{{ t.leaseDuration }}</p>
                            <p class="text-lg font-semibold mt-0.5">{{ leaseDuration(lease.startDate, lease.endDate) }}
                            </p>
                        </div>
                        <div v-if="daysRemaining !== null && daysRemaining > 0 && lease.status === 'active'"
                            class="mt-3 pt-3 border-t border-white/20">
                            <p class="text-sm opacity-80">{{ t.daysRemaining }}</p>
                            <p class="text-2xl font-bold mt-0.5">{{ daysRemaining }}</p>
                        </div>
                    </div>

                    <!-- Property -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.yourProperty }}</h3>
                        <div v-if="lease.property" class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-house text-emerald-600 dark:text-emerald-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.property.name }}
                                </p>
                                <p v-if="lease.property.city" class="text-xs text-gray-400">{{ lease.property.city }}
                                </p>
                                <p v-if="lease.property.address" class="text-xs text-gray-400">{{ lease.property.address
                                }}</p>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-400">—</p>
                    </div>

                    <!-- Unit Type -->
                    <div v-if="lease.unitType"
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-3">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.yourUnitType }}</h3>
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <i class="fa-solid fa-table-cells text-violet-600 dark:text-violet-400"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ lease.unitType.name }}
                                </p>
                                <p v-if="lease.unitType.unitType" class="text-xs text-gray-400">{{
                                    lease.unitType.unitType }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Timeline -->
                    <div
                        class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{{
                            t.leaseTimeline }}</h3>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-calendar-day text-emerald-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseStartDate }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.startDate) }}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-calendar-xmark text-red-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseEndDate }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.endDate) }}</p>
                                </div>
                            </div>
                            <div v-if="lease.acceptedAt" class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-circle-check text-blue-500 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseAcceptedAt }}</p>
                                    <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{
                                        formatDate(lease.acceptedAt) }}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-clock text-gray-400 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400">{{ t.leaseCreatedAt }}</p>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{
                                        formatDate(lease.createdAt) }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Lease History -->
        <div v-if="historicalLeases.length > 0" class="mt-8">
            <div class="flex items-center gap-3 mb-4">
                <div
                    class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-clock-rotate-left text-gray-500 dark:text-gray-400 text-sm"></i>
                </div>
                <div>
                    <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t.leaseHistory }}</h2>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.leaseHistoryDesc }}</p>
                </div>
            </div>

            <div class="space-y-3">
                <div v-for="item in historicalLeases" :key="item.id"
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-gray-300 dark:hover:border-gray-700 transition-all cursor-pointer"
                    @click="selectLease(item)">
                    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                        <!-- Left: Lease Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{
                                    item.leaseNo
                                    }}</span>
                                <span :class="statusColors[item.status] || ''"
                                    class="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">
                                    {{ statusLabels[item.status] || item.status }}
                                </span>
                            </div>
                            <div
                                class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                <span class="inline-flex items-center gap-1">
                                    <i class="fa-solid fa-calendar text-[10px]"></i>
                                    {{ formatDate(item.startDate) }} — {{ formatDate(item.endDate) }}
                                </span>
                                <span class="inline-flex items-center gap-1">
                                    <i class="fa-solid fa-hourglass-half text-[10px]"></i>
                                    {{ leaseDuration(item.startDate, item.endDate) }}
                                </span>
                                <span v-if="item.property" class="inline-flex items-center gap-1">
                                    <i class="fa-solid fa-house text-[10px]"></i>
                                    {{ item.property.name }}
                                </span>
                            </div>
                        </div>

                        <!-- Right: Rent & Action -->
                        <div class="flex items-center gap-4 flex-shrink-0">
                            <div class="text-right">
                                <p class="text-xs text-gray-400 uppercase tracking-wider">{{ t.leaseHistoryRent }}</p>
                                <p class="text-sm font-bold text-gray-900 dark:text-white">
                                    {{ formatCurrency(item.monthlyRent, item.currency) }}
                                </p>
                            </div>
                            <div
                                class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <i class="fa-solid fa-chevron-right text-xs text-gray-400"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
