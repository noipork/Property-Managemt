<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const route = useRoute()
const STRAPI_URL = config.public.strapiUrl

const propertyId = route.params.id as string

interface UnitType {
    id: number
    documentId: string
    name: string
    unitType: string
    quantity: number
    area: number | null
    areaUnit: string
    price: number | null
    currency: string
    status: string
    description: string | null
    images: { id: number; url: string }[]
}

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
    updatedAt: string
    image: { id: number; url: string; formats?: any } | null
    images: { id: number; url: string; formats?: any }[]
    unitTypes: UnitType[]
}

const property = ref<StrapiProperty | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const showDeleteModal = ref(false)
const isDeleting = ref(false)
const sectionsVisible = ref(false)

// Live lease counts — documentId of unitType → number of active leases
const leaseCountByUnitType = ref<Record<string, number>>({})

// Gallery lightbox
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const lightboxImages = ref<{ id: number; url: string }[]>([])

function openLightboxSet(images: { id: number; url: string }[], index: number) {
    lightboxImages.value = images
    lightboxIndex.value = index
    lightboxOpen.value = true
}

const allPropertyImages = computed(() => {
    if (!property.value) return []
    const imgs: { id: number; url: string }[] = []
    if (property.value.image) imgs.push(property.value.image)
    if (property.value.images?.length) imgs.push(...property.value.images)
    return imgs
})

const allImages = computed(() => allPropertyImages.value)

function imageUrl(url: string) {
    return url?.startsWith('http') ? url : `${STRAPI_URL}${url}`
}

function openLightbox(index: number) {
    openLightboxSet(allPropertyImages.value, index)
}

function lightboxPrev() {
    lightboxIndex.value = (lightboxIndex.value - 1 + lightboxImages.value.length) % lightboxImages.value.length
}

function lightboxNext() {
    lightboxIndex.value = (lightboxIndex.value + 1) % lightboxImages.value.length
}

function onLightboxKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') lightboxPrev()
    else if (e.key === 'ArrowRight') lightboxNext()
    else if (e.key === 'Escape') lightboxOpen.value = false
}

const typeLabels: Record<string, string> = {
    apartment: 'Apartment',
    condo: 'Condo',
    house: 'House',
    townhouse: 'Townhouse',
    commercial: 'Commercial',
    land: 'Land',
    other: 'Other',
}

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

// Live occupied count derived from active leases (overrides the stale DB value)
const liveOccupiedUnits = computed(() => {
    const counts = leaseCountByUnitType.value
    if (Object.keys(counts).length === 0) {
        // Fallback to DB value while leases haven't been fetched yet
        return property.value?.occupiedUnits ?? 0
    }
    return Object.values(counts).reduce((sum, n) => sum + n, 0)
})

const occupancyPercent = computed(() => {
    if (!property.value || !property.value.totalUnits) return 0
    return Math.round((liveOccupiedUnits.value / property.value.totalUnits) * 100)
})

const vacantUnits = computed(() => {
    if (!property.value) return 0
    return property.value.totalUnits - liveOccupiedUnits.value
})

async function fetchProperty() {
    try {
        isLoading.value = true
        sectionsVisible.value = false
        const [propRes, leasesRes] = await Promise.all([
            fetch(`${STRAPI_URL}/api/properties/${propertyId}?populate[0]=image&populate[1]=images&populate[2]=unitTypes.images`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/leases?filters[property][documentId][$eq]=${propertyId}&filters[status][$eq]=active&populate[0]=unitType&pagination[pageSize]=200`, {
                headers: { 'Authorization': `Bearer ${token.value}` },
            }),
        ])
        if (!propRes.ok) throw new Error('Failed to fetch property')
        const json = await propRes.json()
        property.value = json.data

        // Build live lease count map
        if (leasesRes.ok) {
            const leasesJson = await leasesRes.json()
            const counts: Record<string, number> = {}
            for (const lease of leasesJson.data ?? []) {
                const utDocId = lease.unitType?.documentId
                if (utDocId) counts[utDocId] = (counts[utDocId] ?? 0) + 1
            }
            leaseCountByUnitType.value = counts
        }
    } catch {
        errorMessage.value = 'Failed to load property'
    } finally {
        isLoading.value = false
        await nextTick()
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            sectionsVisible.value = true
            resolve()
        })))
    }
}

async function handleDelete() {
    if (!property.value) return
    isDeleting.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/properties/${property.value.documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token.value}` },
        })
        if (!res.ok) throw new Error('Delete failed')
        await navigateTo('/manager/properties')
    } catch {
        errorMessage.value = t.value.propertyDeleteError
    } finally {
        isDeleting.value = false
        showDeleteModal.value = false
    }
}

onMounted(() => {
    fetchProperty()
    window.addEventListener('keydown', onLightboxKey)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onLightboxKey)
})
</script>

<template>
    <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <button @click="$router.back()"
                    class="w-9 h-9 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <i class="fa-solid fa-arrow-left text-gray-600 dark:text-gray-300"></i>
                </button>
                <div>
                    <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{{ t.propertyDetails }}</h1>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ t.backToProperties }}</p>
                </div>
            </div>
            <div v-if="property" class="flex items-center gap-2">
                <NuxtLink :to="`/manager/properties/${property.documentId}/edit`"
                    class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                    <i class="fa-solid fa-pen text-xs"></i>
                    {{ t.edit }}
                </NuxtLink>
                <button @click="showDeleteModal = true"
                    class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                    <i class="fa-solid fa-trash text-xs"></i>
                    {{ t.delete }}
                </button>
            </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage"
            class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <i class="fa-solid fa-circle-exclamation text-red-500 text-sm"></i>
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="space-y-4">
            <div
                class="h-48 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
            </div>
            <div
                class="h-36 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
            </div>
        </div>

        <template v-else-if="property">
            <!-- Property Overview Card -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 overflow-hidden transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'">

                <!-- Cover Image Hero -->
                <div v-if="property.image" class="relative w-full h-56 md:h-72 cursor-pointer group"
                    @click="openLightbox(0)">
                    <img :src="imageUrl(property.image.url)" :alt="property.name" class="w-full h-full object-cover" />
                    <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div
                            class="opacity-0 group-hover:opacity-100 transition-opacity w-10 h-10 bg-white/90 dark:bg-gray-900/90 rounded-full flex items-center justify-center shadow-lg">
                            <i class="fa-solid fa-magnifying-glass-plus text-gray-800 dark:text-gray-200"></i>
                        </div>
                    </div>
                    <!-- Image count badge -->
                    <div v-if="allImages.length > 1"
                        class="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <i class="fa-solid fa-image text-[10px]"></i>
                        {{ allImages.length }}
                    </div>
                </div>

                <!-- Thumbnail strip -->
                <div v-if="property.image && property.images?.length"
                    class="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto scrollbar-hide">
                    <button
                        class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all border-primary-400"
                        @click="openLightbox(0)">
                        <img :src="imageUrl(property.image.url)" :alt="property.name"
                            class="w-full h-full object-cover" />
                    </button>
                    <button v-for="(img, i) in property.images" :key="img.id"
                        class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all border-transparent hover:border-gray-300 dark:hover:border-gray-500"
                        @click="openLightbox(i + 1)">
                        <img :src="imageUrl(img.url)" :alt="property.name" class="w-full h-full object-cover" />
                    </button>
                </div>

                <div class="p-6" :class="property.image ? 'pt-4' : ''">
                    <div class="flex items-start gap-4 mb-6">
                        <div v-if="!property.image"
                            class="w-14 h-14 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                            <i :class="typeIcons[property.propertyType] || 'fa-solid fa-house'"
                                class="text-primary-600 dark:text-primary-400 text-2xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ property.name }}</h2>
                                <span class="text-[10px] font-semibold px-2 py-1 rounded-full uppercase"
                                    :class="statusColors[property.status]">
                                    {{ property.status }}
                                </span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <i class="fa-solid fa-location-dot text-xs"></i>
                                {{ property.address }}, {{ property.city }}
                                <template v-if="property.state">, {{ property.state }}</template>
                                <template v-if="property.zipCode"> {{ property.zipCode }}</template>
                            </p>
                            <p v-if="property.description" class="text-sm text-gray-600 dark:text-gray-400 mt-2">{{
                                property.description }}</p>
                        </div>
                    </div>

                    <!-- Stat Cards Row -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                            <p class="text-xs text-blue-600 dark:text-blue-400 mb-1">{{ t.totalUnitsLabel }}</p>
                            <p class="text-xl font-bold text-blue-700 dark:text-blue-300">{{ property.totalUnits }}</p>
                        </div>
                        <div class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                            <p class="text-xs text-emerald-600 dark:text-emerald-400 mb-1">{{ t.occupied }}</p>
                            <p class="text-xl font-bold text-emerald-700 dark:text-emerald-300">{{ liveOccupiedUnits }}
                            </p>
                        </div>
                        <div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                            <p class="text-xs text-amber-600 dark:text-amber-400 mb-1">{{ t.vacant }}</p>
                            <p class="text-xl font-bold text-amber-700 dark:text-amber-300">{{ vacantUnits }}</p>
                        </div>
                        <div class="p-4 rounded-xl text-center"
                            :class="occupancyPercent >= 80 ? 'bg-emerald-50 dark:bg-emerald-900/20' : occupancyPercent >= 50 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'">
                            <p class="text-xs mb-1"
                                :class="occupancyPercent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : occupancyPercent >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'">
                                {{ t.occupancy }}</p>
                            <p class="text-xl font-bold"
                                :class="occupancyPercent >= 80 ? 'text-emerald-700 dark:text-emerald-300' : occupancyPercent >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'">
                                {{ occupancyPercent }}%</p>
                        </div>
                    </div>

                    <!-- Occupancy Bar -->
                    <div class="mt-4">
                        <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-700"
                                :class="occupancyPercent >= 80 ? 'bg-emerald-500' : occupancyPercent >= 50 ? 'bg-amber-500' : 'bg-red-500'"
                                :style="{ width: occupancyPercent + '%' }">
                            </div>
                        </div>
                    </div>
                </div><!-- end p-6 -->
            </div><!-- end overview card -->

            <!-- Details Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Property Info -->
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                    :style="{ transitionDelay: sectionsVisible ? '100ms' : '0ms' }">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-circle-info text-primary-500"></i>
                        {{ t.propertyInfo }}
                    </h3>
                    <dl class="space-y-3">
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.propertyType }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white capitalize">{{
                                typeLabels[property.propertyType] || property.propertyType }}</dd>
                        </div>
                        <div v-if="property.area" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.areaLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{
                                Number(property.area).toLocaleString('en-US')
                            }} {{ property.areaUnit }}</dd>
                        </div>
                        <div v-if="property.yearBuilt" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.yearBuiltLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.yearBuilt }}</dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.propertyCountry }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.country }}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Financial Info -->
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                    :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                    :style="{ transitionDelay: sectionsVisible ? '200ms' : '0ms' }">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-wallet text-primary-500"></i>
                        {{ t.financialInfo }}
                    </h3>
                    <dl class="space-y-3">
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.monthlyRentLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">
                                {{ property.monthlyRent ? Number(property.monthlyRent).toLocaleString('en-US') : '—' }}
                                {{
                                    property.currency }}
                            </dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">{{ t.totalUnitsLabel }}</dt>
                            <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ property.totalUnits }}</dd>
                        </div>
                        <div v-if="property.monthlyRent" class="flex justify-between">
                            <dt class="text-sm text-gray-500 dark:text-gray-400">Est. Monthly Revenue</dt>
                            <dd class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {{ (Number(property.monthlyRent) * liveOccupiedUnits).toLocaleString('en-US') }} {{
                                    property.currency
                                }}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <!-- Unit Types Section -->
            <div v-if="property.unitTypes?.length"
                class="mt-4 mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '300ms' : '0ms' }">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-grip text-primary-500"></i>
                    {{ t.unitTypes }}
                    <span class="ml-auto text-xs font-normal text-gray-400 dark:text-gray-500">
                        {{ liveOccupiedUnits }} / {{ property.totalUnits }} {{ t.occupied?.toLowerCase() }}
                    </span>
                </h3>
                <div class="space-y-3">
                    <div v-for="ut in property.unitTypes" :key="ut.id"
                        class="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                        <!-- Unit type header -->
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/40">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ ut.name
                                        }}</span>
                                    <span
                                        class="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 capitalize">
                                        {{ ut.unitType?.replace(/^br(\d)$/, '$1BR') ?? ut.unitType }}
                                    </span>
                                    <!-- Live status badge driven by active lease count -->
                                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="{
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400': (leaseCountByUnitType[ut.documentId] ?? 0) === 0 && ut.status !== 'maintenance' && ut.status !== 'unavailable',
                                        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400': (leaseCountByUnitType[ut.documentId] ?? 0) > 0,
                                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': ut.status === 'maintenance',
                                        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400': ut.status === 'unavailable',
                                    }">
                                        {{ (leaseCountByUnitType[ut.documentId] ?? 0) > 0
                                            ? (t.unitStatusOccupied ?? 'Occupied')
                                            : ut.status === 'maintenance'
                                                ? (t.unitStatusMaintenance ?? 'Maintenance')
                                                : ut.status === 'unavailable'
                                                    ? (t.unitStatusUnavailable ?? 'Unavailable')
                                                    : (t.unitStatusAvailable ?? 'Available') }}
                                    </span>
                                    <!-- Resident / lease count chip -->
                                    <span v-if="(leaseCountByUnitType[ut.documentId] ?? 0) > 0"
                                        class="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 flex items-center gap-1">
                                        <i class="fa-solid fa-user-check text-[9px]"></i>
                                        {{ leaseCountByUnitType[ut.documentId] }} / {{ ut.quantity }}
                                    </span>
                                </div>
                                <div
                                    class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                                    <span class="flex items-center gap-1">
                                        <i class="fa-solid fa-house"></i>
                                        {{ ut.quantity }} {{ ut.quantity === 1 ? 'unit' : 'units' }}
                                    </span>
                                    <span v-if="ut.area" class="flex items-center gap-1">
                                        <i class="fa-solid fa-ruler"></i>
                                        {{ Number(ut.area).toLocaleString('en-US') }} {{ ut.areaUnit }}
                                    </span>
                                    <span v-if="ut.price"
                                        class="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
                                        <i class="fa-solid fa-tag"></i>
                                        {{ Number(ut.price).toLocaleString('en-US') }} {{ ut.currency }} / mo
                                    </span>
                                </div>
                                <!-- Mini occupancy bar per unit type -->
                                <div v-if="ut.quantity > 0" class="mt-2">
                                    <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500" :class="(leaseCountByUnitType[ut.documentId] ?? 0) === 0
                                            ? 'bg-gray-300 dark:bg-gray-600'
                                            : (leaseCountByUnitType[ut.documentId] ?? 0) >= ut.quantity
                                                ? 'bg-blue-500'
                                                : 'bg-violet-400'"
                                            :style="{ width: Math.min(((leaseCountByUnitType[ut.documentId] ?? 0) / ut.quantity) * 100, 100) + '%' }">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Description + images -->
                        <div v-if="ut.description || ut.images?.length" class="p-3 space-y-2">
                            <p v-if="ut.description" class="text-xs text-gray-500 dark:text-gray-400">{{ ut.description
                                }}</p>
                            <div v-if="ut.images?.length" class="flex gap-2 flex-wrap">
                                <div v-for="(img, imgIdx) in ut.images" :key="img.id"
                                    class="relative w-24 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer group"
                                    @click="openLightboxSet(ut.images.map(i => ({ id: i.id, url: i.url?.startsWith('http') ? i.url : `${STRAPI_URL}${i.url}` })), imgIdx)">
                                    <img :src="img.url?.startsWith('http') ? img.url : `${STRAPI_URL}${img.url}`"
                                        class="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    <div
                                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                        <i
                                            class="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </template>

        <!-- Lightbox -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="lightboxOpen" class="fixed inset-0 z-[110] flex items-center justify-center"
                    @click.self="lightboxOpen = false">
                    <!-- Backdrop -->
                    <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="lightboxOpen = false"></div>

                    <!-- Close -->
                    <button @click="lightboxOpen = false"
                        class="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-xmark"></i>
                    </button>

                    <!-- Counter -->
                    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/70 text-sm font-medium">
                        {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
                    </div>

                    <!-- Prev -->
                    <button v-if="lightboxImages.length > 1" @click.stop="lightboxPrev"
                        class="absolute left-3 md:left-6 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>

                    <!-- Main image -->
                    <div class="relative z-10 max-w-4xl w-full mx-16 flex items-center justify-center">
                        <Transition name="slide-img" mode="out-in">
                            <img :key="lightboxIndex" :src="imageUrl(lightboxImages[lightboxIndex]?.url ?? '')"
                                :alt="property?.name"
                                class="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl select-none" />
                        </Transition>
                    </div>

                    <!-- Next -->
                    <button v-if="lightboxImages.length > 1" @click.stop="lightboxNext"
                        class="absolute right-3 md:right-6 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>

                    <!-- Thumbnail strip -->
                    <div v-if="lightboxImages.length > 1"
                        class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 px-4 py-2 bg-black/40 rounded-xl backdrop-blur-sm max-w-full overflow-x-auto">
                        <button v-for="(img, i) in lightboxImages" :key="img.id"
                            class="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all"
                            :class="i === lightboxIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'"
                            @click.stop="lightboxIndex = i">
                            <img :src="imageUrl(img.url)" class="w-full h-full object-cover" />
                        </button>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Delete Modal -->
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

.slide-img-enter-active,
.slide-img-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-img-enter-from {
    opacity: 0;
    transform: scale(0.96);
}

.slide-img-leave-to {
    opacity: 0;
    transform: scale(1.04);
}

.scrollbar-hide {
    scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
</style>
