<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const { t, lang } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Resident Profile ────────────────────────────────────────────────────────
interface ResidentProfile {
    id: number
    username: string
    email: string
    roomNumber: string | null
    registrationDate: string | null
    residencyStatus: string | null
    property: { id: number; name: string; city?: string; address?: string } | null
    unitType: { id: number; name: string; unitType?: string } | null
}

const residentProfile = ref<ResidentProfile | null>(null)
const isLoadingProfile = ref(true)

async function fetchResidentProfile() {
    if (!token.value) return
    isLoadingProfile.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/users/me?populate[0]=property&populate[1]=unitType`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const d = await res.json()
        residentProfile.value = {
            id: d.id,
            username: d.username,
            email: d.email,
            roomNumber: d.roomNumber ?? null,
            registrationDate: d.registrationDate ?? null,
            residencyStatus: d.residencyStatus ?? null,
            property: d.property ? { id: d.property.id, name: d.property.name, city: d.property.city, address: d.property.address } : null,
            unitType: d.unitType ? { id: d.unitType.id, name: d.unitType.name, unitType: d.unitType.unitType } : null,
        }
    } catch { /* silent */ } finally {
        isLoadingProfile.value = false
    }
}

// ─── Quick stats ──────────────────────────────────────────────────────────────
const stats = ref({ activeLease: false, openBills: 0, openMaintenance: 0 })
const isLoading = ref(true)

async function fetchStats() {
    if (!token.value) return
    isLoading.value = true
    try {
        const userId = user.value?.id
        const [leaseRes, billsRes, maintenanceRes] = await Promise.all([
            fetch(`${STRAPI_URL}/api/leases?filters[resident][id][$eq]=${userId}&filters[status][$eq]=active&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/billings?filters[resident][id][$eq]=${userId}&filters[status][$in][0]=pending&filters[status][$in][1]=overdue&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/maintenances?filters[resident][id][$eq]=${userId}&filters[status][$in][0]=open&filters[status][$in][1]=in_progress&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
        ])

        const [leaseData, billsData, maintenanceData] = await Promise.all([
            leaseRes.ok ? leaseRes.json() : null,
            billsRes.ok ? billsRes.json() : null,
            maintenanceRes.ok ? maintenanceRes.json() : null,
        ])

        stats.value = {
            activeLease: (leaseData?.meta?.pagination?.total ?? 0) > 0,
            openBills: billsData?.meta?.pagination?.total ?? 0,
            openMaintenance: maintenanceData?.meta?.pagination?.total ?? 0,
        }
    } catch (err) {
        console.error('Failed to fetch resident stats:', err)
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    fetchResidentProfile()
    fetchStats()
    fetchBillingHistory()
})

// ─── Billing Analytics ────────────────────────────────────────────────────────
interface BillingItem {
    amount: number
    dueDate: string
    electricUnitsUsed?: number
    electricAmount?: number
    waterUnitsUsed?: number
    waterAmount?: number
}

const billingHistory = ref<BillingItem[]>([])
const isLoadingBilling = ref(false)
const chartType = ref<'billing' | 'electric' | 'water'>('billing')
const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

async function fetchBillingHistory() {
    if (!token.value || !user.value?.id) return
    isLoadingBilling.value = true
    try {
        const params = new URLSearchParams({
            'filters[resident][id][$eq]': String(user.value.id),
            'sort[0]': 'id:desc',
            'pagination[pageSize]': '6',
        })
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        billingHistory.value = (data.data ?? []).map((b: any) => ({
            amount: b.amount,
            dueDate: b.dueDate,
            electricUnitsUsed: b.electricUnitsUsed,
            electricAmount: b.electricAmount,
            waterUnitsUsed: b.waterUnitsUsed,
            waterAmount: b.waterAmount,
        }))
    } catch { /* silent */ } finally {
        isLoadingBilling.value = false
    }
}

const chartData = computed(() => {
    if (!billingHistory.value.length) return { labels: [], datasets: [] }
    const last6 = [...billingHistory.value].reverse()
    const isThai = lang.value === 'TH'
    const labels = last6.map(b =>
        new Date(b.dueDate).toLocaleDateString(isThai ? 'th-TH' : 'en-US', {
            month: 'short', year: '2-digit',
            ...(isThai ? { calendar: 'buddhist' } : {}),
        })
    )
    if (chartType.value === 'billing') {
        return {
            labels,
            datasets: [{
                label: 'Total Amount',
                data: last6.map(b => b.amount),
                borderColor: 'rgb(99, 102, 241)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4, fill: true,
            }],
        }
    } else if (chartType.value === 'electric') {
        return {
            labels,
            datasets: [
                { label: 'Units', data: last6.map(b => b.electricUnitsUsed || 0), borderColor: 'rgb(234, 179, 8)', backgroundColor: 'rgba(234, 179, 8, 0.1)', tension: 0.4, fill: true, yAxisID: 'y' },
                { label: 'Amount', data: last6.map(b => b.electricAmount || 0), borderColor: 'rgb(251, 146, 60)', backgroundColor: 'rgba(251, 146, 60, 0.1)', tension: 0.4, fill: true, yAxisID: 'y1' },
            ],
        }
    } else {
        return {
            labels,
            datasets: [
                { label: 'Units', data: last6.map(b => b.waterUnitsUsed || 0), borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true, yAxisID: 'y' },
                { label: 'Amount', data: last6.map(b => b.waterAmount || 0), borderColor: 'rgb(14, 165, 233)', backgroundColor: 'rgba(14, 165, 233, 0.1)', tension: 0.4, fill: true, yAxisID: 'y1' },
            ],
        }
    }
})

function renderChart() {
    if (!chartCanvas.value) return
    if (chartInstance) chartInstance.destroy()
    const isDark = document.documentElement.classList.contains('dark')
    const textColor = isDark ? '#9ca3af' : '#6b7280'
    const gridColor = isDark ? '#374151' : '#e5e7eb'
    const cfg: any = {
        type: 'line',
        data: chartData.value,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: textColor, usePointStyle: true, padding: 15 } },
                tooltip: { backgroundColor: isDark ? '#1f2937' : '#ffffff', titleColor: isDark ? '#f9fafb' : '#111827', bodyColor: isDark ? '#d1d5db' : '#374151', borderColor: isDark ? '#374151' : '#e5e7eb', borderWidth: 1, padding: 12 },
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: textColor } },
                y: { type: 'linear', display: true, position: 'left', grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true },
            },
        },
    }
    if (chartType.value === 'electric' || chartType.value === 'water') {
        cfg.options.scales.y1 = { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: textColor }, beginAtZero: true }
    }
    chartInstance = new Chart(chartCanvas.value, cfg)
}

watch(chartType, () => nextTick(() => renderChart()))
watch(() => billingHistory.value.length, () => nextTick(() => renderChart()))
</script>

<template>
    <div class="space-y-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <!-- Resident Profile Card -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5">
            <div class="flex items-center gap-4">
                <!-- Avatar -->
                <div
                    class="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <span class="text-xl sm:text-2xl font-bold text-primary-600 dark:text-primary-400">
                        {{ (user?.name || user?.email || 'R')[0].toUpperCase() }}
                    </span>
                </div>
                <!-- Info -->
                <div class="flex-1 min-w-0">
                    <!-- Name + status -->
                    <div class="flex flex-wrap items-center gap-2 mb-0.5">
                        <h1 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{{ user?.name ||
                            user?.email }}</h1>
                        <span v-if="residentProfile?.residencyStatus === 'active'"
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold">
                            <i class="fa-solid fa-circle text-[6px]"></i>
                            {{ t.statusActive || 'Active' }}
                        </span>
                        <span v-else-if="residentProfile?.residencyStatus"
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                            {{ residentProfile.residencyStatus }}
                        </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ user?.email }}</p>
                </div>
            </div>

            <!-- Details row -->
            <div v-if="isLoadingProfile" class="mt-4 flex gap-3">
                <div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                <div class="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                <div class="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
            <div v-else class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <div v-if="residentProfile?.property"
                    class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <i class="fa-solid fa-house text-primary-500 dark:text-primary-400 text-xs"></i>
                    <span>{{ residentProfile.property.name }}<span v-if="residentProfile.property.city"
                            class="text-gray-400">, {{ residentProfile.property.city }}</span></span>
                </div>
                <div v-if="residentProfile?.roomNumber"
                    class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <i class="fa-solid fa-key text-primary-500 dark:text-primary-400 text-xs"></i>
                    <span>{{ t.roomNumber || 'Room' }} {{ residentProfile.roomNumber }}</span>
                </div>
                <div v-if="residentProfile?.unitType"
                    class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <i class="fa-solid fa-table-cells text-primary-500 dark:text-primary-400 text-xs"></i>
                    <span>{{ residentProfile.unitType.name }}</span>
                </div>
                <div v-if="residentProfile?.registrationDate"
                    class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-500">
                    <i class="fa-solid fa-calendar text-xs"></i>
                    <span>{{ t.registrationDate || 'Since' }} {{ new
                        Date(residentProfile.registrationDate).toLocaleDateString(lang === 'TH' ? 'th-TH' : 'en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric', ...(lang === 'TH' ? { calendar: 'buddhist' } :
                                {})
                        }) }}</span>
                </div>
            </div>
        </div>

        <!-- Quick nav – horizontal scroll strip -->
        <div class="-mx-1 overflow-x-auto scrollbar-none">
            <div class="flex gap-3 px-1 pb-1 w-max">
                <NuxtLink v-for="link in [
                    { to: '/resident/my-lease', icon: 'fa-file-contract', label: t.myLease || 'My Lease' },
                    { to: '/resident/my-bills', icon: 'fa-receipt', label: t.myBills || 'My Bills' },
                    { to: '/resident/maintenance', icon: 'fa-wrench', label: t.maintenance || 'Maintenance' },
                    { to: '/resident/assets', icon: 'fa-puzzle-piece', label: t.assets || 'Assets' },
                    { to: '/resident/payment-history', icon: 'fa-clock-rotate-left', label: t.paymentHistory || 'Payment History' },
                ]" :key="link.to" :to="link.to"
                    class="flex flex-col items-center justify-center gap-2 py-3 px-4 w-24 flex-shrink-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                    <i :class="`fa-solid ${link.icon} text-primary-600 dark:text-primary-400 text-lg`"></i>
                    <span class="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">{{
                        link.label }}</span>
                </NuxtLink>
            </div>
        </div>

        <!-- Quick stat cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NuxtLink to="/resident/my-lease"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-file-contract text-emerald-600 dark:text-emerald-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <div v-if="isLoading" class="w-12 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
                <p v-else class="text-2xl font-bold text-gray-900 dark:text-white">
                    <span :class="stats.activeLease ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'">
                        {{ stats.activeLease ? '✓' : '—' }}
                    </span>
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.myLease || 'My Lease' }}</p>
            </NuxtLink>

            <NuxtLink to="/resident/my-bills"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-receipt text-amber-600 dark:text-amber-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <div v-if="isLoading" class="w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
                <p v-else class="text-2xl font-bold"
                    :class="stats.openBills > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'">
                    {{ stats.openBills }}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.unpaidBills || 'Unpaid Bills' }}</p>
            </NuxtLink>

            <NuxtLink to="/resident/maintenance"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-wrench text-blue-600 dark:text-blue-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <div v-if="isLoading" class="w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
                <p v-else class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.openMaintenance }}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.openRequests || 'Open Requests' }}</p>
            </NuxtLink>
        </div>

        <!-- Billing Analytics -->
        <div
            class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-4">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-chart-line text-primary-600 dark:text-primary-400"></i>
                        {{ t.billingAnalytics || 'Billing Analytics' }}
                    </h3>
                    <p class="text-xs text-gray-400 mt-0.5">
                        {{ t.billingAnalyticsSubtitle
                            || 'Last 6 months billing history' }}</p>
                </div>
                <!-- Chart type switcher -->
                <div class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <button @click="chartType = 'billing'"
                        class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all"
                        :class="chartType === 'billing' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'">
                        <i class="fa-solid fa-receipt mr-1"></i>{{ t.billRate || 'Billing' }}
                    </button>
                    <button @click="chartType = 'electric'"
                        class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all"
                        :class="chartType === 'electric' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'">
                        <i class="fa-solid fa-bolt mr-1"></i>{{ t.electricMeter || 'Electric' }}
                    </button>
                    <button @click="chartType = 'water'"
                        class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all"
                        :class="chartType === 'water' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'">
                        <i class="fa-solid fa-droplet mr-1"></i>{{ t.waterMeter || 'Water' }}
                    </button>
                </div>
            </div>

            <!-- Loading -->
            <div v-if="isLoadingBilling" class="flex items-center justify-center" style="height:200px">
                <div class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>

            <!-- Empty -->
            <div v-else-if="!billingHistory.length"
                class="flex flex-col items-center justify-center text-center py-8 text-gray-400" style="height:200px">
                <i class="fa-solid fa-chart-line text-3xl mb-2 opacity-30"></i>
                <p class="text-sm">{{ t.noData || 'No billing data yet' }}</p>
            </div>

            <!-- Chart -->
            <div v-else class="relative" style="height:250px">
                <canvas ref="chartCanvas"></canvas>
            </div>
        </div>
    </div>
</template>
