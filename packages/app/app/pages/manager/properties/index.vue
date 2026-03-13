<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

interface StrapiProperty {
    id: number
    documentId: string
    name: string
    description: string | null
    address: string
    city: string
    state: string | null
    zipCode: string | null
    country: string
    propertyType: string
    status: string
    totalUnits: number
    occupiedUnits: number
    monthlyRent: number | null
    currency: string
    area: number | null
    areaUnit: string
    yearBuilt: number | null
    createdAt: string
    image: { id: number; url: string } | null
}

const properties = ref<StrapiProperty[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')
const { canCreateProperty } = usePlanLimit()

const showDeleteModal = ref(false)
const deleteTarget = ref<StrapiProperty | null>(null)
const isDeleting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Plan limit modal
const showLimitModal = ref(false)
const limitModalData = ref<{ current: number; limit: number; planName: string } | null>(null)
const isCheckingLimit = ref(false)

async function handleAddProperty() {
    isCheckingLimit.value = true
    const result = await canCreateProperty()
    isCheckingLimit.value = false
    if (!result.allowed && result.reason === 'propertyLimit') {
        limitModalData.value = { current: result.current, limit: result.limit, planName: result.planName }
        showLimitModal.value = true
        return
    }
    await navigateTo('/manager/properties/create')
}

const propertyTypes = ['apartment', 'condo', 'house', 'townhouse', 'commercial', 'land', 'other']
const statuses = ['active', 'inactive', 'maintenance', 'sold']

const typeLabels = computed(() => ({
    apartment: t.value.apartment,
    condo: t.value.condo,
    house: t.value.house,
    townhouse: t.value.townhouse,
    commercial: t.value.commercial,
    land: t.value.land,
    other: t.value.other,
}))

const statusLabels = computed(() => ({
    active: t.value.active,
    inactive: t.value.inactive,
    maintenance: t.value.maintenance,
    sold: t.value.sold,
}))

const typeIcons: Record<string, string> = {
    apartment: 'fa-solid fa-house',
    condo: 'fa-solid fa-grip',
    house: 'fa-solid fa-house',
    townhouse: 'fa-solid fa-table-columns',
    commercial: 'fa-solid fa-briefcase',
    land: 'fa-solid fa-map',
    other: 'fa-solid fa-tag',
}

const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    maintenance: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    sold: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

const filteredProperties = computed(() => {
    return properties.value.filter(p => {
        const matchSearch = !searchQuery.value ||
            p.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            p.address.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            p.city.toLowerCase().includes(searchQuery.value.toLowerCase())
        const matchType = !filterType.value || p.propertyType === filterType.value
        const matchStatus = !filterStatus.value || p.status === filterStatus.value
        return matchSearch && matchType && matchStatus
    })
})

const headerVisible = ref(false)
const filtersVisible = ref(false)
const cardsVisible = ref(false)

// Live lease counts — property documentId → number of leases (same source as detail page)
const liveOccupiedByProperty = ref<Record<string, number>>({})

function liveOccupied(p: StrapiProperty): number {
    return liveOccupiedByProperty.value[p.documentId] ?? p.occupiedUnits
}

async function fetchProperties() {
    try {
        isLoading.value = true
        cardsVisible.value = false
        const params = new URLSearchParams({
            'sort': 'createdAt:desc',
            'populate': '*',
        })
        if (user.value?.documentId) {
            params.set('filters[owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/properties?${params}`, {
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        properties.value = json.data ?? []

        // Fetch live lease counts for all owned properties in one request
        if (properties.value.length > 0) {
            const leaseParams = new URLSearchParams({
                'fields[0]': 'status',
                'populate[property][fields][0]': 'documentId',
                'pagination[pageSize]': '500',
            })
            leaseParams.set('filters[status][$notIn][0]', 'expired')
            leaseParams.set('filters[status][$notIn][1]', 'terminated')
            leaseParams.set('filters[status][$notIn][2]', 'cancelled')
            if (user.value?.documentId) {
                leaseParams.set('filters[property][owner][documentId][$eq]', user.value.documentId)
            }
            const leaseRes = await fetch(`${STRAPI_URL}/api/leases?${leaseParams}`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            })
            if (leaseRes.ok) {
                const leaseJson = await leaseRes.json()
                const counts: Record<string, number> = {}
                for (const lease of leaseJson.data ?? []) {
                    const propDocId = lease.property?.documentId
                    if (propDocId) counts[propDocId] = (counts[propDocId] ?? 0) + 1
                }
                liveOccupiedByProperty.value = counts
            }
        }
    } catch (e) {
        errorMessage.value = 'Failed to load properties'
    } finally {
        isLoading.value = false
        // nextTick lets the skeleton unmount and cards render in opacity-0 state,
        // then double-rAF guarantees the browser paints before flipping visible.
        await nextTick()
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            cardsVisible.value = true
            resolve()
        })))
    }
}

onMounted(() => {
    // Double rAF: first frame lets browser paint the opacity-0 state,
    // second frame flips visible so the CSS transition always fires.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            headerVisible.value = true
            filtersVisible.value = true
        })
    })
    fetchProperties()
})

function confirmDelete(property: StrapiProperty) {
    deleteTarget.value = property
    showDeleteModal.value = true
}

async function handleDelete() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/properties/${deleteTarget.value.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        properties.value = properties.value.filter(p => p.id !== deleteTarget.value!.id)
        successMessage.value = t.value.propertyDeleted
        setTimeout(() => successMessage.value = '', 3000)
    } catch {
        errorMessage.value = t.value.propertyDeleteError
        setTimeout(() => errorMessage.value = '', 3000)
    } finally {
        isDeleting.value = false
        showDeleteModal.value = false
        deleteTarget.value = null
    }
}

function occupancyPercent(p: StrapiProperty) {
    if (!p.totalUnits) return 0
    return Math.round((liveOccupied(p) / p.totalUnits) * 100)
}

function imageUrl(url: string) {
    return url?.startsWith('http') ? url : `${STRAPI_URL}${url}`
}
</script>

<template>
    <div>
        <!-- Success / Error Messages -->
        <Transition name="fade">
            <div v-if="successMessage"
                class="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
                <i class="fa-solid fa-check text-emerald-500"></i>
                <p class="text-sm text-emerald-700 dark:text-emerald-400">{{ successMessage }}</p>
            </div>
        </Transition>
        <Transition name="fade">
            <div v-if="errorMessage"
                class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <i class="fa-solid fa-circle-exclamation text-red-500"></i>
                <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>
        </Transition>

        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{{ t.propertiesTitle }}</h1>
                <p class="text-gray-500 dark:text-gray-400 text-xs md:text-sm mt-1">{{ t.propertiesSubtitle }}</p>
            </div>
            <div class="mt-3 sm:mt-0">
                <button @click="handleAddProperty" :disabled="isCheckingLimit"
                    class="inline-flex items-center gap-2 px-4 py-2.5 text-sm bg-primary-600 dark:bg-primary-700 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 disabled:opacity-60">
                    <i v-if="isCheckingLimit" class="fa-solid fa-rotate text-xs animate-spin"></i>
                    <i v-else class="fa-solid fa-plus text-xs"></i>
                    {{ isCheckingLimit ? t.planLimitChecking : t.addNewProperty }}
                </button>
            </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-500"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <!-- Search -->
            <div class="relative flex-1">
                <i
                    class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input v-model="searchQuery" type="text" :placeholder="t.searchProperties"
                    class="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <!-- Type Filter -->
            <select v-model="filterType"
                class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">{{ t.allTypes }}</option>
                <option v-for="type in propertyTypes" :key="type" :value="type">{{ typeLabels[type as keyof typeof
                    typeLabels] }}</option>
            </select>
            <!-- Status Filter -->
            <select v-model="filterStatus"
                class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">{{ t.allStatuses }}</option>
                <option v-for="s in statuses" :key="s" :value="s">{{ statusLabels[s as keyof typeof statusLabels] }}
                </option>
            </select>
        </div>

        <!-- Loading Skeleton -->
        <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-all duration-500"
            :class="filtersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div v-for="i in 6" :key="i"
                class="h-56 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
            </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredProperties.length === 0"
            class="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-500"
            :class="cardsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div
                class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fa-solid fa-house text-2xl text-gray-400 dark:text-gray-500"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">{{ t.noProperties }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ t.noPropertiesDesc }}</p>
            <button @click="handleAddProperty" :disabled="isCheckingLimit"
                class="inline-flex items-center gap-2 px-4 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60">
                <i v-if="isCheckingLimit" class="fa-solid fa-rotate text-xs animate-spin"></i>
                <i v-else class="fa-solid fa-plus text-xs"></i>
                {{ isCheckingLimit ? t.planLimitChecking : t.addNewProperty }}
            </button>
        </div>

        <!-- Property Cards -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div v-for="(property, index) in filteredProperties" :key="property.id"
                class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all duration-500 group cursor-pointer"
                :class="cardsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
                :style="{ transitionDelay: cardsVisible ? `${index * 60}ms` : '0ms' }">
                <!-- Clickable main content area -->
                <NuxtLink :to="`/manager/properties/${property.documentId}`" class="block">
                    <!-- Card Header -->
                    <!-- Cover Image / Placeholder -->
                    <div class="relative w-full h-40 overflow-hidden bg-gray-100 dark:bg-gray-900/60">
                        <img v-if="property.image" :src="imageUrl(property.image.url)" :alt="property.name"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2">
                            <div
                                class="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-xl flex items-center justify-center">
                                <i :class="typeIcons[property.propertyType] || 'fa-solid fa-house'"
                                    class="text-primary-400 dark:text-primary-500 text-2xl"></i>
                            </div>
                            <span class="text-xs text-gray-400 dark:text-gray-500">{{ t.noImages }}</span>
                        </div>
                        <!-- Status badge over image -->
                        <span
                            class="absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-full uppercase backdrop-blur-sm"
                            :class="statusColors[property.status] || statusColors.active">
                            {{ statusLabels[property.status as keyof typeof statusLabels] || property.status }}
                        </span>
                    </div>

                    <div class="p-5">
                        <div class="flex items-start justify-between mb-3">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <i :class="typeIcons[property.propertyType] || 'fa-solid fa-house'"
                                        class="text-primary-600 dark:text-primary-400 text-sm"></i>
                                </div>
                                <div>
                                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">{{
                                        property.name }}</h3>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ property.address }},
                                        {{
                                            property.city }}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Stats Row -->
                        <div class="grid grid-cols-3 gap-3 mb-4">
                            <div class="text-center p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.units }}</p>
                                <p class="text-sm font-bold text-gray-900 dark:text-white">{{ property.totalUnits }}</p>
                            </div>
                            <div class="text-center p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.occupied }}</p>
                                <p class="text-sm font-bold text-gray-900 dark:text-white">{{ liveOccupied(property) }}
                                </p>
                            </div>
                            <div class="text-center p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.occupancy }}</p>
                                <p class="text-sm font-bold"
                                    :class="occupancyPercent(property) >= 80 ? 'text-emerald-600 dark:text-emerald-400' : occupancyPercent(property) >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'">
                                    {{ occupancyPercent(property) }}%
                                </p>
                            </div>
                        </div>

                        <!-- Occupancy Bar -->
                        <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                            <div class="h-full rounded-full transition-all duration-500"
                                :class="occupancyPercent(property) >= 80 ? 'bg-emerald-500' : occupancyPercent(property) >= 50 ? 'bg-amber-500' : 'bg-red-500'"
                                :style="{ width: occupancyPercent(property) + '%' }">
                            </div>
                        </div>

                        <!-- Rent -->
                        <div v-if="property.monthlyRent" class="flex items-center justify-between mb-4">
                            <span class="text-xs text-gray-500 dark:text-gray-400">{{ t.monthlyRentLabel }}</span>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                {{ Number(property.monthlyRent).toLocaleString('en-US') }} {{ property.currency }}
                            </span>
                        </div>
                    </div>
                </NuxtLink>

                <!-- Actions -->
                <div
                    class="border-t border-gray-100 dark:border-gray-700 px-5 py-3 flex items-center justify-end gap-2 bg-gray-50/50 dark:bg-gray-900/30">
                    <NuxtLink :to="`/manager/properties/${property.documentId}`"
                        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <i class="fa-solid fa-eye text-xs"></i>
                        {{ t.view }}
                    </NuxtLink>
                    <NuxtLink :to="`/manager/properties/${property.documentId}/edit`"
                        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                        <i class="fa-solid fa-pen text-xs"></i>
                        {{ t.edit }}
                    </NuxtLink>
                    <button @click="confirmDelete(property)"
                        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                        <i class="fa-solid fa-trash text-xs"></i>
                        {{ t.delete }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Plan Limit Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showLimitModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showLimitModal = false"></div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-4">
                            <div
                                class="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-crown text-amber-500 text-lg"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.planLimitTitle }}</h3>
                        </div>

                        <!-- Progress bar -->
                        <div v-if="limitModalData"
                            class="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                            <div
                                class="flex justify-between text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                                <span>{{ limitModalData.planName }}</span>
                                <span>{{ limitModalData.current }} / {{ limitModalData.limit }} {{
                                    t.planLimitPropertiesOf }}</span>
                            </div>
                            <div class="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                                <div class="h-full bg-amber-500 rounded-full transition-all duration-500"
                                    :style="{ width: '100%' }"></div>
                            </div>
                        </div>

                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            {{ t.planLimitPropertyBody
                                .replace('{plan}', limitModalData?.planName ?? '')
                                .replace('{current}', String(limitModalData?.current ?? 0))
                                .replace('{limit}', String(limitModalData?.limit ?? 0)) }}
                        </p>
                        <div class="flex gap-3 justify-end">
                            <button @click="showLimitModal = false"
                                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.planLimitClose }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Delete Confirmation Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showDeleteModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showDeleteModal = false"></div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-4">
                            <div
                                class="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <i class="fa-solid fa-circle-exclamation text-red-500 text-lg"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.deleteProperty }}</h3>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">{{ t.deletePropertyConfirm }}</p>
                        <div v-if="deleteTarget"
                            class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg mb-6 border border-gray-100 dark:border-gray-700">
                            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ deleteTarget.name }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ deleteTarget.address }}, {{
                                deleteTarget.city }}</p>
                        </div>
                        <div class="flex gap-3 justify-end">
                            <button @click="showDeleteModal = false"
                                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="handleDelete" :disabled="isDeleting"
                                class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                                <i v-if="isDeleting" class="fa-solid fa-rotate text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-trash text-xs"></i>
                                {{ t.delete }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
