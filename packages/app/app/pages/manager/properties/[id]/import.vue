<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const { t } = useI18n()
const { token, user } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()
const router = useRouter()
const propertyId = route.params.id as string

const DEFAULT_PASSWORD = 'PropertyMag24791'

// ─── Property + Unit Types ────────────────────────────────────────────────────
interface Property {
    id: number
    documentId: string
    name: string
    currency: string
    electricPricePerUnit: number | null
    waterPricePerUnit: number | null
}

interface UnitType {
    id: number
    documentId: string
    name: string
    unitType: string
    quantity: number
    price: number | null
    currency: string
}

const property = ref<Property | null>(null)
const unitTypes = ref<UnitType[]>([])
const selectedUnitTypeId = ref<string>('')
const isLoadingProperty = ref(true)

// ─── CSV State ────────────────────────────────────────────────────────────────
interface CsvRow {
    fullName: string
    email: string
    phone: string
    registeredDate: string
    roomNumber: string
    leaseDuration: number
    monthlyRent: number
    electricPrev: number
    electricNow: number
    waterPrev: number
    waterNow: number
    nextBillDate: string
    assets: string
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done'

const step = ref<ImportStep>('upload')
const csvFile = ref<File | null>(null)
const csvRows = ref<CsvRow[]>([])
const dragOver = ref(false)
const parseError = ref('')

// ─── Import Progress ──────────────────────────────────────────────────────────
interface ImportResult {
    row: number
    name: string
    status: 'success' | 'failed' | 'skipped'
    message: string
}

const importProgress = ref(0)
const importTotal = ref(0)
const importResults = ref<ImportResult[]>([])
const isImporting = ref(false)

const successCount = computed(() => importResults.value.filter(r => r.status === 'success').length)
const failedCount = computed(() => importResults.value.filter(r => r.status === 'failed').length)
const skippedCount = computed(() => importResults.value.filter(r => r.status === 'skipped').length)

// ─── CSV Column Order ─────────────────────────────────────────────────────────
const CSV_HEADERS = [
    'Full Name',
    'Email',
    'Phone',
    'Registered Date',
    'Room Number',
    'Lease Duration (months)',
    'Monthly Rent',
    'Electric Meter (Prev)',
    'Electric Meter (Now)',
    'Water Meter (Prev)',
    'Water Meter (Now)',
    'Next Bill Date',
    'Assets',
]

// ─── Fetch Property ───────────────────────────────────────────────────────────
async function fetchProperty() {
    isLoadingProperty.value = true
    try {
        const res = await fetch(
            `${STRAPI_URL}/api/properties/${propertyId}?populate=unitTypes`,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        property.value = {
            id: data.data.id,
            documentId: data.data.documentId,
            name: data.data.name,
            currency: data.data.currency || 'THB',
            electricPricePerUnit: data.data.electricPricePerUnit ?? null,
            waterPricePerUnit: data.data.waterPricePerUnit ?? null,
        }
        unitTypes.value = (data.data.unitTypes ?? []).map((ut: any) => ({
            id: ut.id,
            documentId: ut.documentId,
            name: ut.name,
            unitType: ut.unitType,
            quantity: ut.quantity ?? 1,
            price: ut.price ?? null,
            currency: ut.currency || 'THB',
        }))
        if (unitTypes.value.length === 1) {
            selectedUnitTypeId.value = String(unitTypes.value[0]!.id)
        }
    } catch {
        // redirect back
    } finally {
        isLoadingProperty.value = false
    }
}

onMounted(() => {
    fetchProperty()
})

// ─── Template Download ────────────────────────────────────────────────────────
function downloadTemplate() {
    const sampleRows = [
        ['John Doe', 'john@example.com', '0812345678', '2026-03-01', '101', '12', '5000', '1000', '1050', '200', '220', '2026-04-01', 'Air conditioner, Refrigerator'],
        ['Jane Smith', 'jane@example.com', '0898765432', '2026-03-01', '102', '6', '4500', '500', '530', '100', '115', '2026-04-01', ''],
    ]
    const csvContent = [CSV_HEADERS.join(','), ...sampleRows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `residents-import-template.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"'
                i++
            } else if (ch === '"') {
                inQuotes = false
            } else {
                current += ch
            }
        } else {
            if (ch === '"') {
                inQuotes = true
            } else if (ch === ',') {
                result.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
    }
    result.push(current.trim())
    return result
}

function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
        parseError.value = t.value.csvInvalidFile
        return
    }
    csvFile.value = file
    parseError.value = ''

    const reader = new FileReader()
    reader.onload = (e) => {
        const text = e.target?.result as string
        if (!text) return

        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
            parseError.value = t.value.csvNoData
            return
        }

        // Skip header row
        const rows: CsvRow[] = []
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]!)
            if (!cols[0] || !cols[1]) continue // skip rows without name or email

            const registeredDate = cols[3]?.trim() || new Date().toISOString().split('T')[0]!
            const leaseDuration = parseInt(cols[5] ?? '12') || 12
            const endDate = new Date(registeredDate)
            endDate.setMonth(endDate.getMonth() + leaseDuration)

            rows.push({
                fullName: cols[0]?.trim() || '',
                email: cols[1]?.trim() || '',
                phone: cols[2]?.trim() || '',
                registeredDate,
                roomNumber: cols[4]?.trim() || '',
                leaseDuration,
                monthlyRent: parseFloat(cols[6] ?? '0') || 0,
                electricPrev: parseFloat(cols[7] ?? '0') || 0,
                electricNow: parseFloat(cols[8] ?? '0') || 0,
                waterPrev: parseFloat(cols[9] ?? '0') || 0,
                waterNow: parseFloat(cols[10] ?? '0') || 0,
                nextBillDate: cols[11]?.trim() || '',
                assets: cols[12]?.trim() || '',
            })
        }

        if (rows.length === 0) {
            parseError.value = t.value.csvNoData
            return
        }

        csvRows.value = rows
        step.value = 'preview'
    }
    reader.readAsText(file)
}

function onFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) handleFile(file)
}

function onDrop(e: DragEvent) {
    dragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
}

function resetImport() {
    step.value = 'upload'
    csvFile.value = null
    csvRows.value = []
    importResults.value = []
    importProgress.value = 0
    importTotal.value = 0
    parseError.value = ''
}

// ─── Import Logic ─────────────────────────────────────────────────────────────
async function startImport() {
    if (!property.value || !selectedUnitTypeId.value) return

    step.value = 'importing'
    isImporting.value = true
    importResults.value = []
    importProgress.value = 0
    importTotal.value = csvRows.value.length

    const unitTypeNumericId = Number(selectedUnitTypeId.value)
    const propertyNumericId = property.value.id

    for (let i = 0; i < csvRows.value.length; i++) {
        const row = csvRows.value[i]!
        importProgress.value = i + 1

        try {
            // ── 1. Register user ──
            const registerRes = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: row.fullName,
                    email: row.email,
                    password: DEFAULT_PASSWORD,
                }),
            })
            const registerData = await registerRes.json()
            if (!registerRes.ok) {
                const msg = registerData?.error?.message || 'Registration failed'
                // Check if email already exists — skip
                if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('taken')) {
                    importResults.value.push({ row: i + 1, name: row.fullName, status: 'skipped', message: msg })
                } else {
                    importResults.value.push({ row: i + 1, name: row.fullName, status: 'failed', message: msg })
                }
                continue
            }

            const newUserId: number = registerData.user?.id
            const newUserDocumentId: string = registerData.user?.documentId
            if (!newUserId) {
                importResults.value.push({ row: i + 1, name: row.fullName, status: 'failed', message: 'No user ID returned' })
                continue
            }

            // ── 2. Update user with role=4, property, unitType, roomNumber, etc. ──
            await fetch(`${STRAPI_URL}/api/users/${newUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({
                    role: 4,
                    phone: row.phone || null,
                    property: propertyNumericId,
                    unitType: unitTypeNumericId,
                    roomNumber: row.roomNumber,
                    registrationDate: row.registeredDate,
                    residencyStatus: 'active',
                    nextBillDate: row.nextBillDate || row.registeredDate,
                    plainPassword: DEFAULT_PASSWORD,
                }),
            })

            // ── 3. Assign resident to room in building ──
            if (row.roomNumber && newUserDocumentId) {
                try {
                    await fetch(`${STRAPI_URL}/api/rooms/assign-resident`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token.value}`,
                        },
                        body: JSON.stringify({
                            propertyId: propertyNumericId,
                            roomNumber: row.roomNumber,
                            residentDocumentId: newUserDocumentId,
                        }),
                    })
                } catch {
                    // Non-blocking
                }
            }

            // ── 4. Create lease ──
            const leaseStartDate = row.registeredDate
            const leaseEndDate = new Date(leaseStartDate)
            leaseEndDate.setMonth(leaseEndDate.getMonth() + row.leaseDuration)
            const leaseEndStr = leaseEndDate.toISOString().split('T')[0]

            const now = new Date()
            const datePart = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0')
            const rand = Math.floor(1000 + Math.random() * 9000)
            const leaseNo = `LSE-${datePart}-${rand}`

            try {
                await fetch(`${STRAPI_URL}/api/leases`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token.value}`,
                    },
                    body: JSON.stringify({
                        data: {
                            leaseNo,
                            status: 'active',
                            startDate: leaseStartDate,
                            endDate: leaseEndStr,
                            monthlyRent: row.monthlyRent || 0,
                            currency: property.value?.currency || 'THB',
                            resident: newUserId,
                            property: propertyNumericId,
                            unitType: unitTypeNumericId,
                        },
                    }),
                })
            } catch {
                // Non-blocking — user was still created
            }

            // ── 5. Save meter readings if values differ ──
            if (row.electricNow !== row.electricPrev || row.waterNow !== row.waterPrev) {
                try {
                    await fetch(`${STRAPI_URL}/api/meter-readings/bulk`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token.value}`,
                        },
                        body: JSON.stringify({
                            propertyDocumentId: propertyId,
                            readingDate: row.registeredDate,
                            readings: [{
                                roomDocumentId: null, // will resolve by room number
                                roomNumber: row.roomNumber,
                                electricMeterValue: row.electricNow,
                                waterMeterValue: row.waterNow,
                            }],
                        }),
                    })
                } catch {
                    // Non-blocking
                }
            }

            importResults.value.push({ row: i + 1, name: row.fullName, status: 'success', message: 'OK' })
        } catch (err: any) {
            importResults.value.push({ row: i + 1, name: row.fullName, status: 'failed', message: err.message || 'Unknown error' })
        }
    }

    isImporting.value = false
    step.value = 'done'
}
</script>

<template>
    <div class="max-w-4xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center gap-3">
            <button @click="router.back()"
                class="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <i class="fa-solid fa-arrow-left text-gray-600 dark:text-gray-300"></i>
            </button>
            <div class="min-w-0">
                <h1 class="text-lg md:text-2xl font-bold text-gray-900 dark:text-white truncate">{{ t.importResidents }}
                </h1>
                <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {{ property?.name }} <span class="hidden sm:inline">· {{ t.importResidentsSubtitle }}</span>
                </p>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoadingProperty" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <template v-else-if="property">
            <!-- ── Step 1: Upload ── -->
            <template v-if="step === 'upload'">
                <!-- Unit Type Selection -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                    <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-cog text-primary-600 dark:text-primary-400"></i>
                        Import Settings
                    </h2>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {{ t.unitTypeLabel }} <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <select v-model="selectedUnitTypeId"
                                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                                <option value="">{{ t.selectUnitType }}</option>
                                <option v-for="ut in unitTypes" :key="ut.id" :value="String(ut.id)">
                                    {{ ut.name }} · {{ ut.unitType }}
                                </option>
                            </select>
                            <i
                                class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                        </div>
                    </div>

                    <div
                        class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                        <i class="fa-solid fa-key text-gray-400 text-sm"></i>
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.csvDefaultPassword }}</p>
                            <p class="text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">{{
                                DEFAULT_PASSWORD }}</p>
                        </div>
                    </div>
                </div>

                <!-- Template Download -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-file-csv text-emerald-500"></i>
                            CSV Template
                        </h2>
                        <button @click="downloadTemplate"
                            class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                            <i class="fa-solid fa-download text-sm"></i>
                            {{ t.downloadTemplate }}
                        </button>
                    </div>

                    <!-- Column descriptions -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        <div v-for="(header, i) in CSV_HEADERS" :key="i"
                            class="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span
                                class="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                {{ String.fromCharCode(65 + i) }}
                            </span>
                            <span class="text-xs text-gray-600 dark:text-gray-400 truncate">{{ header }}</span>
                        </div>
                    </div>
                </div>

                <!-- Upload Zone -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
                    <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-upload text-primary-600 dark:text-primary-400"></i>
                        {{ t.uploadCsv }}
                    </h2>

                    <label
                        class="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all"
                        :class="dragOver
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                        @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
                        <i class="fa-solid fa-file-arrow-up text-3xl mb-3"
                            :class="dragOver ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'"></i>
                        <span class="text-sm"
                            :class="dragOver ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'">
                            {{ t.dragDropCsv }}
                        </span>
                        <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">CSV files only</span>
                        <input type="file" accept=".csv" class="hidden" @change="onFileInput" />
                    </label>

                    <!-- Parse error -->
                    <div v-if="parseError"
                        class="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                        <i class="fa-solid fa-circle-exclamation"></i>
                        {{ parseError }}
                    </div>
                </div>
            </template>

            <!-- ── Step 2: Preview ── -->
            <template v-if="step === 'preview'">
                <!-- Info bar -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div
                            class="w-10 h-10 flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                            <i class="fa-solid fa-file-csv text-emerald-600 dark:text-emerald-400 text-lg"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ csvFile?.name }}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                {{ t.csvRowsFound.replace('{count}', String(csvRows.length)) }}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                        <button @click="resetImport"
                            class="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                            {{ t.cancel }}
                        </button>
                        <button @click="startImport" :disabled="!selectedUnitTypeId"
                            class="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            <i class="fa-solid fa-play text-xs"></i>
                            {{ t.csvStartImport }}
                        </button>
                    </div>
                </div>

                <!-- Warning if no unit type selected -->
                <div v-if="!selectedUnitTypeId"
                    class="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Please select a unit type before importing.
                </div>

                <!-- Preview table -->
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div class="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-table text-primary-500"></i>
                            {{ t.csvPreview }}
                        </h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ t.csvPreviewDesc }}</p>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-200 dark:border-gray-700">
                                    <th
                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        #</th>
                                    <th
                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnFullName }}</th>
                                    <th
                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnEmail }}</th>
                                    <th
                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnPhone }}</th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnRoomNumber }}</th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnLeaseDuration }}</th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnMonthlyRent }}</th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                                        <i class="fa-solid fa-bolt mr-1 text-[10px]"></i>Prev
                                    </th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                                        <i class="fa-solid fa-bolt mr-1 text-[10px]"></i>Now
                                    </th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        <i class="fa-solid fa-droplet mr-1 text-[10px]"></i>Prev
                                    </th>
                                    <th
                                        class="px-3 py-2.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        <i class="fa-solid fa-droplet mr-1 text-[10px]"></i>Now
                                    </th>
                                    <th
                                        class="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {{ t.csvColumnAssets }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(row, i) in csvRows" :key="i"
                                    class="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-900/20">
                                    <td class="px-3 py-2 text-xs text-gray-400 font-mono">{{ i + 1 }}</td>
                                    <td class="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 font-medium">{{
                                        row.fullName }}</td>
                                    <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{{ row.email }}</td>
                                    <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{{ row.phone || '—'
                                        }}</td>
                                    <td class="px-3 py-2 text-center">
                                        <span
                                            class="inline-flex px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
                                            {{ row.roomNumber }}
                                        </span>
                                    </td>
                                    <td class="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                                        {{ row.leaseDuration }}m</td>
                                    <td
                                        class="px-3 py-2 text-center text-xs font-semibold text-gray-800 dark:text-gray-200">
                                        {{ row.monthlyRent.toLocaleString() }}</td>
                                    <td
                                        class="px-3 py-2 text-center text-xs font-mono text-gray-400 dark:text-gray-500">
                                        {{ row.electricPrev.toLocaleString() }}</td>
                                    <td
                                        class="px-3 py-2 text-center text-xs font-mono text-yellow-600 dark:text-yellow-400 font-semibold">
                                        {{ row.electricNow.toLocaleString() }}</td>
                                    <td
                                        class="px-3 py-2 text-center text-xs font-mono text-gray-400 dark:text-gray-500">
                                        {{ row.waterPrev.toLocaleString() }}</td>
                                    <td
                                        class="px-3 py-2 text-center text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                                        {{ row.waterNow.toLocaleString() }}</td>
                                    <td
                                        class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[150px] truncate">
                                        {{ row.assets || '—' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>

            <!-- ── Step 3: Importing ── -->
            <template v-if="step === 'importing'">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 sm:p-8 space-y-6">
                    <div class="text-center space-y-3">
                        <div
                            class="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto">
                            <div
                                class="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                        </div>
                        <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ t.csvImporting }}</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {{ t.csvProcessing.replace('{current}', String(importProgress)).replace('{total}',
                                String(importTotal)) }}
                        </p>
                    </div>

                    <!-- Progress bar -->
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div class="h-full bg-primary-600 rounded-full transition-all duration-300 ease-out"
                            :style="{ width: `${importTotal ? (importProgress / importTotal) * 100 : 0}%` }"></div>
                    </div>

                    <p class="text-center text-xs text-gray-400 font-mono">
                        {{ importProgress }} / {{ importTotal }}
                    </p>

                    <!-- Live results -->
                    <div v-if="importResults.length" class="space-y-1 max-h-60 overflow-y-auto">
                        <div v-for="result in importResults" :key="result.row"
                            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" :class="{
                                'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400': result.status === 'success',
                                'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400': result.status === 'failed',
                                'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400': result.status === 'skipped',
                            }">
                            <i :class="{
                                'fa-solid fa-check': result.status === 'success',
                                'fa-solid fa-xmark': result.status === 'failed',
                                'fa-solid fa-forward': result.status === 'skipped',
                            }"></i>
                            <span class="font-medium">Row {{ result.row }}</span>
                            <span>{{ result.name }}</span>
                            <span v-if="result.status !== 'success'" class="ml-auto truncate max-w-[200px]">{{
                                result.message }}</span>
                        </div>
                    </div>
                </div>
            </template>

            <!-- ── Step 4: Done ── -->
            <template v-if="step === 'done'">
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 sm:p-8 space-y-6">
                    <div class="text-center space-y-3">
                        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto" :class="failedCount === importTotal
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : 'bg-emerald-100 dark:bg-emerald-900/30'">
                            <i class="text-3xl" :class="failedCount === importTotal
                                ? 'fa-solid fa-circle-xmark text-red-500'
                                : 'fa-solid fa-circle-check text-emerald-500'"></i>
                        </div>
                        <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ t.csvResultTitle }}</h3>
                    </div>

                    <!-- Stats -->
                    <div class="grid grid-cols-3 gap-2 sm:gap-4">
                        <div class="text-center p-3 sm:p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                            <p class="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{
                                successCount }}</p>
                            <p class="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-300 mt-1">{{
                                t.csvResultSuccess }}</p>
                        </div>
                        <div class="text-center p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                            <p class="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{{ failedCount }}
                            </p>
                            <p class="text-[10px] sm:text-xs text-red-700 dark:text-red-300 mt-1">{{ t.csvResultFailed
                                }}</p>
                        </div>
                        <div class="text-center p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                            <p class="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{{ skippedCount
                                }}</p>
                            <p class="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300 mt-1">{{
                                t.csvResultSkipped }}</p>
                        </div>
                    </div>

                    <!-- Detailed results -->
                    <div class="space-y-1 max-h-72 overflow-y-auto">
                        <div v-for="result in importResults" :key="result.row"
                            class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" :class="{
                                'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400': result.status === 'success',
                                'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400': result.status === 'failed',
                                'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400': result.status === 'skipped',
                            }">
                            <i :class="{
                                'fa-solid fa-check': result.status === 'success',
                                'fa-solid fa-xmark': result.status === 'failed',
                                'fa-solid fa-forward': result.status === 'skipped',
                            }"></i>
                            <span class="font-mono text-[10px]">#{{ result.row }}</span>
                            <span class="font-medium">{{ result.name }}</span>
                            <span v-if="result.status !== 'success'" class="ml-auto text-[11px] truncate max-w-[250px]">
                                {{ result.message }}
                            </span>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button @click="resetImport"
                            class="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                            <i class="fa-solid fa-rotate-left mr-1.5"></i>
                            {{ t.csvImportAnother }}
                        </button>
                        <button @click="router.push(`/manager/properties/${propertyId}`)"
                            class="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                            <i class="fa-solid fa-arrow-right mr-1.5"></i>
                            {{ t.csvClose }}
                        </button>
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>
