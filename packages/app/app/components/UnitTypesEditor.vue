<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export interface UnitTypeEntry {
    _key: string          // local unique key (not Strapi id)
    id?: number           // Strapi id if already saved
    documentId?: string
    name: string
    unitType: string
    quantity: number
    area: number | null
    areaUnit: string
    price: number | null
    currency: string
    status: string
    description: string
    imageFiles: File[]
    imagePreviews: string[]
    existingImages: { id: number; url: string }[]
    removedImageIds: number[]
    expanded: boolean
}

const props = defineProps<{
    modelValue: UnitTypeEntry[]
    currency?: string
    areaUnit?: string
    planUnitLimit?: number
    planUnitTypeLimit?: number
}>()

const emit = defineEmits<{
    'update:modelValue': [UnitTypeEntry[]]
}>()

const { t } = useI18n()

const unitTypeOptions = [
    { value: 'studio', label: () => t.value.unitTypeStudio },
    { value: 'br1', label: () => t.value.unitType1BR },
    { value: 'br2', label: () => t.value.unitType2BR },
    { value: 'br3', label: () => t.value.unitType3BR },
    { value: 'br4', label: () => t.value.unitType4BR },
    { value: 'penthouse', label: () => t.value.unitTypePenthouse },
    { value: 'shophouse', label: () => t.value.unitTypeShophouse },
    { value: 'office', label: () => t.value.unitTypeOffice },
    { value: 'warehouse', label: () => t.value.unitTypeWarehouse },
    { value: 'other', label: () => t.value.unitTypeOther },
]

const unitStatusOptions = [
    { value: 'available', label: () => t.value.unitStatusAvailable },
    { value: 'occupied', label: () => t.value.unitStatusOccupied },
    { value: 'maintenance', label: () => t.value.unitStatusMaintenance },
    { value: 'unavailable', label: () => t.value.unitStatusUnavailable },
]

const totalQuantity = computed(() =>
    props.modelValue.reduce((sum, u) => sum + (u.quantity || 0), 0)
)

function newEntry(): UnitTypeEntry {
    return {
        _key: `ut_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: '',
        unitType: 'studio',
        quantity: 1,
        area: null,
        areaUnit: props.areaUnit ?? 'sqm',
        price: null,
        currency: props.currency ?? 'THB',
        status: 'available',
        description: '',
        imageFiles: [],
        imagePreviews: [],
        existingImages: [],
        removedImageIds: [],
        expanded: true,
    }
}

function addUnit() {
    const updated = [...props.modelValue, newEntry()]
    emit('update:modelValue', updated)
}

function removeUnit(index: number) {
    const updated = [...props.modelValue]
    updated.splice(index, 1)
    emit('update:modelValue', updated)
}

function toggleExpand(index: number) {
    const updated = props.modelValue.map((u, i) =>
        i === index ? { ...u, expanded: !u.expanded } : u
    )
    emit('update:modelValue', updated)
}

function updateField(index: number, field: keyof UnitTypeEntry, value: unknown) {
    const updated = props.modelValue.map((u, i) =>
        i === index ? { ...u, [field]: value } : u
    )
    emit('update:modelValue', updated)
}

function onImagesChange(index: number, e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? [])
    if (!files.length) return
    const unit = props.modelValue[index]
    if (!unit) return
    const newFiles = [...unit.imageFiles, ...files]
    const newPreviews = [...unit.imagePreviews, ...files.map(f => URL.createObjectURL(f))]
    const updated = props.modelValue.map((u, i) =>
        i === index ? { ...u, imageFiles: newFiles, imagePreviews: newPreviews } : u
    )
    emit('update:modelValue', updated)
        ; (e.target as HTMLInputElement).value = ''
}

function removeNewImage(unitIndex: number, imgIndex: number) {
    const unit = props.modelValue[unitIndex]
    if (!unit) return
    const newFiles = [...unit.imageFiles]
    const newPreviews = [...unit.imagePreviews]
    newFiles.splice(imgIndex, 1)
    newPreviews.splice(imgIndex, 1)
    const updated = props.modelValue.map((u, i) =>
        i === unitIndex ? { ...u, imageFiles: newFiles, imagePreviews: newPreviews } : u
    )
    emit('update:modelValue', updated)
}

function removeExistingImage(unitIndex: number, imgIndex: number) {
    const unit = props.modelValue[unitIndex]
    if (!unit) return
    const imgs = [...unit.existingImages]
    const removed = imgs.splice(imgIndex, 1)[0]
    const newRemovedIds = removed ? [...unit.removedImageIds, removed.id] : [...unit.removedImageIds]
    const updated = props.modelValue.map((u, i) =>
        i === unitIndex ? { ...u, existingImages: imgs, removedImageIds: newRemovedIds } : u
    )
    emit('update:modelValue', updated)
}

const statusColors: Record<string, string> = {
    available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    occupied: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    maintenance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    unavailable: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}
</script>

<template>
    <div class="space-y-3">
        <!-- Summary bar -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span
                    :class="planUnitTypeLimit && planUnitTypeLimit < 999 && modelValue.length >= planUnitTypeLimit ? 'text-red-500 font-medium' : ''">
                    {{ modelValue.length }}<template v-if="planUnitTypeLimit && planUnitTypeLimit < 999"> / {{
                        planUnitTypeLimit }}</template>
                    {{
                        t.unitTypes }}
                </span>
                <span class="text-gray-300 dark:text-gray-600">·</span>
                <span>{{ totalQuantity }} {{ t.totalUnitsLabel }}</span>
                <span v-if="planUnitLimit" class="text-xs"
                    :class="totalQuantity > planUnitLimit ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'">
                    / {{ planUnitLimit }}
                </span>
            </div>
            <button type="button" @click="addUnit"
                :disabled="!!(planUnitTypeLimit && planUnitTypeLimit < 999 && modelValue.length >= planUnitTypeLimit)"
                class="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" :class="planUnitTypeLimit && planUnitTypeLimit < 999 && modelValue.length >= planUnitTypeLimit
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300'">
                <i class="ti-plus text-xs"></i>
                {{ t.addUnitType }}
                <span v-if="planUnitTypeLimit && planUnitTypeLimit < 999 && modelValue.length >= planUnitTypeLimit"
                    class="text-xs text-amber-500 flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[9px]"></i>
                    {{ t.planLimitUnitTypeReached?.replace('{current}', String(modelValue.length)).replace('{limit}',
                        String(planUnitTypeLimit)) }}
                </span>
            </button>
        </div>

        <!-- Empty state -->
        <div v-if="modelValue.length === 0"
            class="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
            <i class="ti-layout-grid2 text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">{{ t.noUnitTypes }}</p>
            <button type="button" @click="addUnit"
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                {{ t.addFirstUnitType }}
            </button>
        </div>

        <!-- Unit type cards -->
        <div v-for="(unit, index) in modelValue" :key="unit._key"
            class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">

            <!-- Card header (always visible) -->
            <div class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                @click="toggleExpand(index)">
                <!-- Drag handle visual -->
                <i class="ti-menu text-gray-300 dark:text-gray-600 text-sm flex-shrink-0"></i>

                <!-- Unit type badge -->
                <span
                    class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 flex-shrink-0">
                    {{unitTypeOptions.find(o => o.value === unit.unitType)?.label() ?? unit.unitType}}
                </span>

                <!-- Name (or placeholder) -->
                <span class="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate min-w-0">
                    {{ unit.name || t.unitNamePlaceholder }}
                </span>

                <!-- Qty pill -->
                <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 flex items-center gap-1">
                    <i class="ti-home text-xs"></i>
                    {{ unit.quantity }}
                </span>

                <!-- Price pill -->
                <span v-if="unit.price" class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                    {{ Number(unit.price).toLocaleString('en-US') }} {{ unit.currency }}
                </span>

                <!-- Status badge -->
                <span class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    :class="statusColors[unit.status]">
                    {{unitStatusOptions.find(o => o.value === unit.status)?.label() ?? unit.status}}
                </span>

                <!-- Expand toggle -->
                <i class="ti-angle-down text-xs text-gray-400 transition-transform flex-shrink-0"
                    :class="unit.expanded ? 'rotate-180' : ''"></i>

                <!-- Remove button -->
                <button type="button" @click.stop="removeUnit(index)"
                    class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">
                    <i class="ti-close" style="font-size:10px"></i>
                </button>
            </div>

            <!-- Expanded body -->
            <div v-if="unit.expanded" class="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/60 space-y-4">

                <!-- Row 1: Name + Type + Status -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t.unitName }}
                            *</label>
                        <input :value="unit.name"
                            @input="updateField(index, 'name', ($event.target as HTMLInputElement).value)"
                            :placeholder="t.unitNamePlaceholder" type="text"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{
                            t.unitTypeLabel }}</label>
                        <select :value="unit.unitType"
                            @change="updateField(index, 'unitType', ($event.target as HTMLSelectElement).value)"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                            <option v-for="opt in unitTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label() }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t.unitStatus
                        }}</label>
                        <select :value="unit.status"
                            @change="updateField(index, 'status', ($event.target as HTMLSelectElement).value)"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                            <option v-for="opt in unitStatusOptions" :key="opt.value" :value="opt.value">{{ opt.label()
                            }}</option>
                        </select>
                    </div>
                </div>

                <!-- Row 2: Quantity + Area + Price -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t.unitQuantity
                        }} *</label>
                        <input :value="unit.quantity"
                            @input="updateField(index, 'quantity', Number(($event.target as HTMLInputElement).value))"
                            type="number" min="1"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t.areaLabel }}
                            ({{ unit.areaUnit }})</label>
                        <input :value="unit.area ?? ''"
                            @input="updateField(index, 'area', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
                            type="number" min="0" step="0.01"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t.unitPrice
                        }}</label>
                        <input :value="unit.price ?? ''"
                            @input="updateField(index, 'price', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
                            type="number" min="0" step="0.01"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{
                            t.currencyLabel }}</label>
                        <input :value="unit.currency"
                            @input="updateField(index, 'currency', ($event.target as HTMLInputElement).value)"
                            type="text"
                            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{
                        t.propertyDescription }}</label>
                    <textarea :value="unit.description"
                        @input="updateField(index, 'description', ($event.target as HTMLTextAreaElement).value)"
                        :placeholder="t.unitDescriptionPlaceholder" rows="2"
                        class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"></textarea>
                </div>

                <!-- Images -->
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{{ t.unitImages
                    }}</label>
                    <div class="flex flex-wrap gap-2">
                        <!-- Existing images -->
                        <div v-for="(img, imgIdx) in unit.existingImages" :key="'ex-' + img.id"
                            class="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                            <img :src="img.url" class="w-full h-full object-cover" />
                            <button type="button" @click="removeExistingImage(index, imgIdx)"
                                class="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors">
                                <i class="ti-close" style="font-size:8px"></i>
                            </button>
                        </div>
                        <!-- New image previews -->
                        <div v-for="(preview, imgIdx) in unit.imagePreviews" :key="'new-' + imgIdx"
                            class="relative w-16 h-16 rounded-lg overflow-hidden border border-primary-300 dark:border-primary-700 flex-shrink-0">
                            <img :src="preview" class="w-full h-full object-cover" />
                            <button type="button" @click="removeNewImage(index, imgIdx)"
                                class="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors">
                                <i class="ti-close" style="font-size:8px"></i>
                            </button>
                        </div>
                        <!-- Upload button -->
                        <label
                            class="w-16 h-16 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex-shrink-0">
                            <i class="ti-plus text-gray-400 dark:text-gray-500 text-sm"></i>
                            <span class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ t.addMoreImages }}</span>
                            <input type="file" accept="image/*" multiple class="hidden"
                                @change="onImagesChange(index, $event)" />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
