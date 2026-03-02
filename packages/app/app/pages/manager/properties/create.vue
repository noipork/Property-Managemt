<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { UnitTypeEntry } from '~/components/UnitTypesEditor.vue'

const { t } = useI18n()
const { token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

const { canSetUnits } = usePlanLimit()

const isLoading = ref(false)
const errorMessage = ref('')
const unitLimitError = ref('')
const sectionsVisible = ref(false)

// Unit types
const unitTypes = ref<UnitTypeEntry[]>([])
const computedTotalUnits = computed(() =>
    unitTypes.value.reduce((sum, u) => sum + (u.quantity || 0), 0) || 1
)

// Image state
const coverImageFile = ref<File | null>(null)
const coverImagePreview = ref<string | null>(null)
const additionalImageFiles = ref<File[]>([])
const additionalImagePreviews = ref<string[]>([])

function onCoverImageChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    coverImageFile.value = file
    coverImagePreview.value = URL.createObjectURL(file)
}

function removeCoverImage() {
    coverImageFile.value = null
    coverImagePreview.value = null
}

function onAdditionalImagesChange(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? [])
    for (const file of files) {
        additionalImageFiles.value.push(file)
        additionalImagePreviews.value.push(URL.createObjectURL(file))
    }
    ; (e.target as HTMLInputElement).value = ''
}

function removeAdditionalImage(index: number) {
    additionalImageFiles.value.splice(index, 1)
    additionalImagePreviews.value.splice(index, 1)
}

const form = ref({
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'Thailand',
    propertyType: 'apartment',
    status: 'active',
    currency: 'THB',
    areaUnit: 'sqm',
})

const propertyTypes = [
    { value: 'apartment', label: 'apartment' },
    { value: 'condo', label: 'condo' },
    { value: 'house', label: 'house' },
    { value: 'townhouse', label: 'townhouse' },
    { value: 'commercial', label: 'commercial' },
    { value: 'land', label: 'land' },
    { value: 'other', label: 'other' },
]

const statuses = [
    { value: 'active', label: 'active' },
    { value: 'inactive', label: 'inactive' },
    { value: 'maintenance', label: 'maintenance' },
    { value: 'sold', label: 'sold' },
]

const typeLabels: Record<string, () => string> = {
    apartment: () => t.value.apartment,
    condo: () => t.value.condo,
    house: () => t.value.house,
    townhouse: () => t.value.townhouse,
    commercial: () => t.value.commercial,
    land: () => t.value.land,
    other: () => t.value.other,
}

const statusLabels: Record<string, () => string> = {
    active: () => t.value.active,
    inactive: () => t.value.inactive,
    maintenance: () => t.value.maintenance,
    sold: () => t.value.sold,
}

async function handleSubmit() {
    if (!form.value.name || !form.value.address || !form.value.city) {
        errorMessage.value = 'Please fill in all required fields'
        return
    }

    // Check unit limit
    unitLimitError.value = ''
    const unitCheck = await canSetUnits(computedTotalUnits.value)
    if (!unitCheck.allowed) {
        unitLimitError.value = t.value.planLimitUnitBody
            .replace('{plan}', unitCheck.planName ?? '')
            .replace('{limit}', String(unitCheck.limit ?? 0))
        return
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
        const payload: Record<string, unknown> = {
            ...form.value,
            totalUnits: computedTotalUnits.value,
        }

        const res = await fetch(`${STRAPI_URL}/api/properties`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.value}`,
            },
            body: JSON.stringify({ data: payload }),
        })

        if (!res.ok) {
            const err = await res.json()
            throw new Error(err?.error?.message || 'Failed to create property')
        }

        const created = await res.json()
        const docId = created.data.documentId
        const propertyId = created.data.id

        // Save unit types
        for (const ut of unitTypes.value) {
            if (!ut.name) continue
            const utPayload = {
                name: ut.name,
                unitType: ut.unitType,
                quantity: ut.quantity,
                area: ut.area,
                areaUnit: ut.areaUnit,
                price: ut.price,
                currency: ut.currency,
                status: ut.status,
                description: ut.description,
                property: propertyId,
            }
            const utRes = await fetch(`${STRAPI_URL}/api/unit-types`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token.value}`,
                },
                body: JSON.stringify({ data: utPayload }),
            })
            if (utRes.ok && ut.imageFiles.length > 0) {
                const utData = await utRes.json()
                const fd = new FormData()
                for (const f of ut.imageFiles) fd.append('files', f)
                fd.append('ref', 'api::unit-type.unit-type')
                fd.append('refId', String(utData.data.id))
                fd.append('field', 'images')
                await fetch(`${STRAPI_URL}/api/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token.value}` },
                    body: fd,
                })
            }
        }

        // Upload cover image
        if (coverImageFile.value) {
            const fd = new FormData()
            fd.append('files', coverImageFile.value)
            fd.append('ref', 'api::property.property')
            fd.append('refId', String(created.data.id))
            fd.append('field', 'image')
            await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.value}` },
                body: fd,
            })
        }

        // Upload additional images
        if (additionalImageFiles.value.length > 0) {
            const fd = new FormData()
            for (const f of additionalImageFiles.value) fd.append('files', f)
            fd.append('ref', 'api::property.property')
            fd.append('refId', String(created.data.id))
            fd.append('field', 'images')
            await fetch(`${STRAPI_URL}/api/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.value}` },
                body: fd,
            })
        }

        await navigateTo(`/manager/properties/${docId}`)
    } catch (e: any) {
        errorMessage.value = e.message || t.value.propertyCreateError
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            sectionsVisible.value = true
        })
    })
})
</script>

<template>
    <div class="max-w-3xl mx-auto">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-6">
            <NuxtLink to="/manager/properties"
                class="w-9 h-9 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <i class="ti-arrow-left text-gray-600 dark:text-gray-300"></i>
            </NuxtLink>
            <div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{{ t.createProperty }}</h1>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ t.backToProperties }}</p>
            </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage"
            class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <i class="ti-alert-circle text-red-500 text-sm"></i>
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Basic Info -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 md:p-6 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="ti-info-alt text-primary-500"></i>
                    {{ t.propertyInfo }}
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyName }} *</label>
                        <input v-model="form.name" type="text" :placeholder="t.propertyNamePlaceholder" required
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyDescription }}</label>
                        <textarea v-model="form.description" :placeholder="t.propertyDescriptionPlaceholder" rows="3"
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyType }} *</label>
                        <select v-model="form.propertyType" required
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                            <option v-for="pt in propertyTypes" :key="pt.value" :value="pt.value">{{
                                typeLabels[pt.value]?.() ?? pt.value }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyStatus }}</label>
                        <select v-model="form.status"
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                            <option v-for="s in statuses" :key="s.value" :value="s.value">{{ statusLabels[s.value]?.()
                                ?? s.value }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Property Images -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 md:p-6 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '300ms' : '0ms' }">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="ti-image text-primary-500"></i>
                    {{ t.imagesLabel }}
                </h2>

                <!-- Cover Image -->
                <div class="mb-5">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{{ t.coverImageLabel }}</p>
                    <div v-if="coverImagePreview"
                        class="relative w-full h-48 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-2">
                        <img :src="coverImagePreview" class="w-full h-full object-cover" />
                        <button type="button" @click="removeCoverImage"
                            class="absolute top-2 right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors">
                            <i class="ti-close text-xs"></i>
                        </button>
                    </div>
                    <label v-else
                        class="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                        <i class="ti-camera text-2xl text-gray-400 dark:text-gray-500 mb-2"></i>
                        <span class="text-sm text-gray-500 dark:text-gray-400">{{ t.uploadCoverImage }}</span>
                        <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ t.imageHint }}</span>
                        <input type="file" accept="image/*" class="hidden" @change="onCoverImageChange" />
                    </label>
                </div>

                <!-- Additional Images -->
                <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{{ t.additionalImagesLabel }}
                    </p>
                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                        <div v-for="(preview, i) in additionalImagePreviews" :key="i"
                            class="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img :src="preview" class="w-full h-full object-cover" />
                            <button type="button" @click="removeAdditionalImage(i)"
                                class="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors">
                                <i class="ti-close" style="font-size:9px"></i>
                            </button>
                        </div>
                        <label
                            class="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                            <i class="ti-plus text-gray-400 dark:text-gray-500 text-lg"></i>
                            <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ t.addMoreImages }}</span>
                            <input type="file" accept="image/*" multiple class="hidden"
                                @change="onAdditionalImagesChange" />
                        </label>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500">{{ t.imageHint }}</p>
                </div>
            </div>

            <!-- Location -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 md:p-6 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '100ms' : '0ms' }">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <i class="ti-location-pin text-primary-500"></i>
                    {{ t.locationInfo }}
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyAddress }} *</label>
                        <input v-model="form.address" type="text" :placeholder="t.propertyAddressPlaceholder" required
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyCity }} *</label>
                        <input v-model="form.city" type="text" :placeholder="t.propertyCityPlaceholder" required
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyState }}</label>
                        <input v-model="form.state" type="text" :placeholder="t.propertyStatePlaceholder"
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyZipCode }}</label>
                        <input v-model="form.zipCode" type="text" :placeholder="t.propertyZipCodePlaceholder"
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                            t.propertyCountry }}</label>
                        <input v-model="form.country" type="text"
                            class="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                </div>
            </div>

            <!-- Units & Financial -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 md:p-6 transition-all duration-500"
                :class="sectionsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'"
                :style="{ transitionDelay: sectionsVisible ? '200ms' : '0ms' }">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <i class="ti-layout-grid2 text-primary-500"></i>
                    {{ t.unitTypes }}
                </h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">{{ t.noUnitTypes }}</p>

                <UnitTypesEditor v-model="unitTypes" :currency="form.currency" :area-unit="form.areaUnit" />

                <!-- Plan limit error -->
                <p v-if="unitLimitError" class="mt-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                    <i class="ti-crown text-amber-500 flex-shrink-0 mt-0.5"></i>
                    {{ unitLimitError }}
                </p>
            </div>



            <!-- Submit -->
            <div class="flex items-center justify-end gap-3">
                <NuxtLink to="/manager/properties"
                    class="px-5 py-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    {{ t.cancel }}
                </NuxtLink>
                <button type="submit" :disabled="isLoading"
                    class="px-5 py-2.5 text-sm bg-primary-600 dark:bg-primary-700 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
                    <i v-if="isLoading" class="ti-reload text-xs animate-spin"></i>
                    <i v-else class="ti-plus text-xs"></i>
                    {{ isLoading ? t.creatingProperty : t.createProperty }}
                </button>
            </div>
        </form>
    </div>
</template>
