<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import {
    Chart,
    LineController, LineElement, PointElement,
    BarController, BarElement,
    LinearScale, CategoryScale,
    Filler, Tooltip, Legend,
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, LinearScale, CategoryScale, Filler, Tooltip, Legend)

const { t, lang } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Properties list ─────────────────────────────────────────────────────────
interface Property { id: number; documentId: string; name: string; city: string }
const propertiesList = ref<Property[]>([])
const selectedPropertyDocumentId = ref('')

async function fetchProperties() {
    try {
        const params = new URLSearchParams({
            'pagination[pageSize]': '200',
            'fields[0]': 'name',
            'fields[1]': 'city',
        })
        if (user.value?.documentId) {
            params.set('filters[owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/properties?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        const data = await res.json()
        propertiesList.value = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            name: p.name,
            city: p.city,
        }))
        if (propertiesList.value.length > 0 && !selectedPropertyDocumentId.value) {
            selectedPropertyDocumentId.value = propertiesList.value[0].documentId
        }
    } catch { /* ignore */ }
}

// Refetch all data when property changes
watch(selectedPropertyDocumentId, () => {
    fetchStats()
    fetchRecentLeases()
    fetchUnpaidBills()
    fetchRecentMaintenance()
    fetchReviewingBills()
    fetchPendingAutoBills()
    buildCharts()
})

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = ref({
    activeLeases: 0,
    pendingMaintenance: 0,
    reviewingBillsCount: 0,
})
const isLoadingStats = ref(true)

async function fetchStats() {
    if (!token.value) return
    isLoadingStats.value = true
    try {
        const propFilter = selectedPropertyDocumentId.value
            ? `filters[property][documentId][$eq]=${selectedPropertyDocumentId.value}`
            : user.value?.documentId ? `filters[property][owner][documentId][$eq]=${user.value.documentId}` : ''

        const [leasesRes, maintenanceRes, billsRes] = await Promise.all([
            fetch(`${STRAPI_URL}/api/leases?${propFilter}&filters[status][$eq]=active&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/maintenances?${propFilter}&filters[status][$in][0]=pending&filters[status][$in][1]=in_progress&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
            fetch(`${STRAPI_URL}/api/payments?${propFilter}&filters[status][$eq]=reviewing&pagination[pageSize]=1`, {
                headers: { Authorization: `Bearer ${token.value}` },
            }),
        ])

        const [leasesData, maintenanceData, billsData] = await Promise.all([
            leasesRes.ok ? leasesRes.json() : null,
            maintenanceRes.ok ? maintenanceRes.json() : null,
            billsRes.ok ? billsRes.json() : null,
        ])

        stats.value = {
            activeLeases: leasesData?.meta?.pagination?.total ?? 0,
            pendingMaintenance: maintenanceData?.meta?.pagination?.total ?? 0,
            reviewingBillsCount: billsData?.meta?.pagination?.total ?? 0,
        }
    } catch (err) {
        console.error('Failed to fetch stats:', err)
    } finally {
        isLoadingStats.value = false
    }
}

// ─── Recent leases ───────────────────────────────────────────────────────────
interface RecentLease {
    id: number
    documentId: string
    leaseNo: string
    status: string
    startDate: string
    endDate: string
    monthlyRent: number
    currency: string
    resident: { username: string } | null
    unitType: { name: string } | null
}
const recentLeases = ref<RecentLease[]>([])
const isLoadingLeases = ref(true)

async function fetchRecentLeases() {
    if (!token.value) return
    isLoadingLeases.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'unitType',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '10',
        })
        if (selectedPropertyDocumentId.value) {
            params.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/leases?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        recentLeases.value = (data.data ?? []).map((l: any) => ({
            id: l.id,
            documentId: l.documentId,
            leaseNo: l.leaseNo,
            status: l.status,
            startDate: l.startDate,
            endDate: l.endDate,
            monthlyRent: l.monthlyRent,
            currency: l.currency || 'THB',
            resident: l.resident ? { username: l.resident.username } : null,
            unitType: l.unitType ? { name: l.unitType.name } : null,
        }))
    } catch (err) {
        console.error('Failed to fetch leases:', err)
    } finally {
        isLoadingLeases.value = false
    }
}

// ─── Unpaid bills ────────────────────────────────────────────────────────────
interface UnpaidBill {
    id: number
    documentId: string
    invoiceNo: string
    type: string
    description: string
    amount: number
    currency: string
    dueDate: string
    status: string
    resident: { username: string } | null
}
const unpaidBills = ref<UnpaidBill[]>([])
const isLoadingUnpaidBills = ref(true)

async function fetchUnpaidBills() {
    if (!token.value) return
    isLoadingUnpaidBills.value = true
    try {
        const params = new URLSearchParams({
            'filters[status][$in][0]': 'pending',
            'filters[status][$in][1]': 'overdue',
            'populate[0]': 'resident',
            'sort[0]': 'dueDate:asc',
            'pagination[pageSize]': '10',
        })
        if (selectedPropertyDocumentId.value) {
            params.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        unpaidBills.value = (data.data ?? []).map((b: any) => ({
            id: b.id,
            documentId: b.documentId,
            invoiceNo: b.invoiceNo,
            type: b.type,
            description: b.description,
            amount: b.amount,
            currency: b.currency || 'THB',
            dueDate: b.dueDate,
            status: b.status,
            resident: b.resident ? { username: b.resident.username } : null,
        }))
    } catch (err) {
        console.error('Failed to fetch unpaid bills:', err)
    } finally {
        isLoadingUnpaidBills.value = false
    }
}

// ─── Open maintenance ─────────────────────────────────────────────────────────
interface RecentMaintenance {
    id: number
    documentId: string
    title: string
    status: string
    priority: string
    createdAt: string
    resident: { username: string } | null
}
const recentMaintenance = ref<RecentMaintenance[]>([])
const isLoadingMaintenance = ref(true)

async function fetchRecentMaintenance() {
    if (!token.value) return
    isLoadingMaintenance.value = true
    try {
        const params = new URLSearchParams({
            'filters[status][$in][0]': 'pending',
            'filters[status][$in][1]': 'in_progress',
            'populate[0]': 'resident',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '5',
        })
        if (selectedPropertyDocumentId.value) {
            params.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/maintenances?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        recentMaintenance.value = (data.data ?? []).map((m: any) => ({
            id: m.id,
            documentId: m.documentId,
            title: m.title,
            status: m.status,
            priority: m.priority,
            createdAt: m.createdAt,
            resident: m.resident ? { username: m.resident.username } : null,
        }))
    } catch (err) {
        console.error('Failed to fetch maintenance:', err)
    } finally {
        isLoadingMaintenance.value = false
    }
}

// ─── Payments under review ───────────────────────────────────────────────────────────────
interface ReviewingBill {
    id: number
    documentId: string
    refNo: string
    amount: number
    currency: string
    date: string
    method: string
    resident: { username: string } | null
    billing: { invoiceNo: string } | null
}
const reviewingBills = ref<ReviewingBill[]>([])
const isLoadingBills = ref(true)

async function fetchReviewingBills() {
    if (!token.value) return
    isLoadingBills.value = true
    try {
        const params = new URLSearchParams({
            'populate[0]': 'resident',
            'populate[1]': 'billing',
            'sort[0]': 'createdAt:desc',
            'pagination[pageSize]': '10',
        })
        if (selectedPropertyDocumentId.value) {
            params.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        const res = await fetch(`${STRAPI_URL}/api/payments?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        reviewingBills.value = (data.data ?? []).map((p: any) => ({
            id: p.id,
            documentId: p.documentId,
            refNo: p.refNo,
            amount: p.amount,
            currency: p.currency || 'THB',
            date: p.date,
            method: p.method,
            resident: p.resident ? { username: p.resident.username } : null,
            billing: p.billing ? { invoiceNo: p.billing.invoiceNo } : null,
        }))
    } catch (err) {
        console.error('Failed to fetch payments:', err)
    } finally {
        isLoadingBills.value = false
    }
}

// ─── Usage charts ─────────────────────────────────────────────────────────────
const overallChartCanvas = ref<HTMLCanvasElement | null>(null)
const perResidentChartCanvas = ref<HTMLCanvasElement | null>(null)
const incomeChartCanvas = ref<HTMLCanvasElement | null>(null)
let overallChartInstance: Chart | null = null
let perResidentChartInstance: Chart | null = null
let incomeChartInstance: Chart | null = null

interface UsageRecord {
    dueDate: string
    electricUnitsUsed: number | null
    waterUnitsUsed: number | null
    resident: { username: string } | null
}

async function fetchUsageData(): Promise<UsageRecord[]> {
    if (!token.value) return []
    try {
        const params = new URLSearchParams({
            'fields[0]': 'dueDate',
            'fields[1]': 'electricUnitsUsed',
            'fields[2]': 'waterUnitsUsed',
            'populate[0]': 'resident',
            'filters[type][$eq]': 'utilities',
            'sort[0]': 'dueDate:asc',
            'pagination[pageSize]': '200',
        })
        if (selectedPropertyDocumentId.value) {
            params.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            params.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        // last 6 months
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        params.set('filters[dueDate][$gte]', sixMonthsAgo.toISOString().slice(0, 10))
        const res = await fetch(`${STRAPI_URL}/api/billings?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.data ?? []).map((b: any) => ({
            dueDate: b.dueDate,
            electricUnitsUsed: b.electricUnitsUsed ?? null,
            waterUnitsUsed: b.waterUnitsUsed ?? null,
            resident: b.resident ? { username: b.resident.username } : null,
        }))
    } catch { return [] }
}

function getMonthLabel(dateStr: string) {
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        month: 'short',
        year: '2-digit',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

const CHART_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
]

async function buildCharts() {
    const records = await fetchUsageData()

    // ── Income chart ──────────────────────────────────────────────────────────
    try {
        const incomeParams = new URLSearchParams({
            'fields[0]': 'date',
            'fields[1]': 'amount',
            'fields[2]': 'currency',
            'filters[status][$eq]': 'completed',
            'sort[0]': 'date:asc',
            'pagination[pageSize]': '500',
        })
        if (selectedPropertyDocumentId.value) {
            incomeParams.set('filters[property][documentId][$eq]', selectedPropertyDocumentId.value)
        } else if (user.value?.documentId) {
            incomeParams.set('filters[property][owner][documentId][$eq]', user.value.documentId)
        }
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        incomeParams.set('filters[date][$gte]', sixMonthsAgo.toISOString().slice(0, 10))
        const incomeRes = await fetch(`${STRAPI_URL}/api/payments?${incomeParams}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (incomeRes.ok) {
            const incomeData = await incomeRes.json()
            const payments: { date: string; amount: number }[] = (incomeData.data ?? []).map((p: any) => ({
                date: p.date,
                amount: p.amount ?? 0,
            }))
            const incomeMonthsSet = new Set(payments.map(p => p.date.slice(0, 7)))
            const incomeMonths = Array.from(incomeMonthsSet).sort()
            const incomeLabels = incomeMonths.map(m => getMonthLabel(m + '-01'))
            const incomeValues = incomeMonths.map(m =>
                payments.filter(p => p.date.startsWith(m)).reduce((s, p) => s + p.amount, 0)
            )
            await nextTick()
            if (incomeChartCanvas.value) {
                incomeChartInstance?.destroy()
                incomeChartInstance = new Chart(incomeChartCanvas.value, {
                    type: 'bar',
                    data: {
                        labels: incomeLabels,
                        datasets: [{
                            label: 'Income',
                            data: incomeValues,
                            backgroundColor: 'rgba(99,102,241,0.15)',
                            borderColor: '#6366f1',
                            borderWidth: 2,
                            borderRadius: 6,
                            hoverBackgroundColor: 'rgba(99,102,241,0.3)',
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: ctx => ` Income: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB' }).format(ctx.parsed.y)}`,
                                },
                            },
                        },
                        scales: {
                            x: { grid: { display: false } },
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: {
                                    callback: (v) => `฿${Number(v).toLocaleString()}`,
                                },
                            },
                        },
                    },
                })
            }
        }
    } catch { /* ignore */ }

    if (!records.length) return

    // collect sorted unique months
    const monthsSet = new Set(records.map(r => r.dueDate.slice(0, 7)))
    const months = Array.from(monthsSet).sort()
    const labels = months.map(m => getMonthLabel(m + '-01'))

    // ── Overall chart (total electric + water per month) ──────────────────────
    const totalElectric = months.map(m =>
        records.filter(r => r.dueDate.startsWith(m)).reduce((s, r) => s + (r.electricUnitsUsed ?? 0), 0)
    )
    const totalWater = months.map(m =>
        records.filter(r => r.dueDate.startsWith(m)).reduce((s, r) => s + (r.waterUnitsUsed ?? 0), 0)
    )

    await nextTick()
    if (overallChartCanvas.value) {
        overallChartInstance?.destroy()
        overallChartInstance = new Chart(overallChartCanvas.value, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Electric (units)',
                        data: totalElectric,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,0.08)',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Water (units)',
                        data: totalWater,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.08)',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} units` } },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                },
            },
        })
    }

    // ── Per-resident electric chart ───────────────────────────────────────────
    const residentNames = Array.from(new Set(records.map(r => r.resident?.username ?? 'Unknown')))

    const electricDatasets = residentNames.map((name, i) => ({
        label: name,
        data: months.map(m =>
            records
                .filter(r => r.dueDate.startsWith(m) && (r.resident?.username ?? 'Unknown') === name)
                .reduce((s, r) => s + (r.electricUnitsUsed ?? 0), 0)
        ),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.4,
    }))

    const waterDatasets = residentNames.map((name, i) => ({
        label: name,
        data: months.map(m =>
            records
                .filter(r => r.dueDate.startsWith(m) && (r.resident?.username ?? 'Unknown') === name)
                .reduce((s, r) => s + (r.waterUnitsUsed ?? 0), 0)
        ),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.4,
    }))

    if (perResidentChartCanvas.value) {
        perResidentChartInstance?.destroy()
        perResidentChartInstance = new Chart(perResidentChartCanvas.value, {
            type: 'line',
            data: { labels, datasets: electricDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 }, padding: 8 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} units` } },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                },
            },
        })
    }

    // store water datasets for tab switching
    perResidentElectricDatasets.value = electricDatasets
    perResidentWaterDatasets.value = waterDatasets
}

const activeUsageTab = ref<'electric' | 'water'>('electric')
const perResidentElectricDatasets = ref<any[]>([])
const perResidentWaterDatasets = ref<any[]>([])

function switchUsageTab(tab: 'electric' | 'water') {
    activeUsageTab.value = tab
    if (!perResidentChartInstance) return
    const datasets = tab === 'electric' ? perResidentElectricDatasets.value : perResidentWaterDatasets.value
    perResidentChartInstance.data.datasets = datasets
    perResidentChartInstance.update()
}

// ─── Auto Bill Generator ──────────────────────────────────────────────────
interface PendingAutoBill {
    id: number
    documentId: string
    username: string
    email: string
    roomNumber: string | null
    nextBillDate: string
    propertyId: number
    propertyDocumentId: string
    propertyName: string
    electricPricePerUnit: number
    waterPricePerUnit: number
    commonAreaFee: number
    invoiceDueDays: number
    propertyCurrency: string
    unitTypeId: number | null
    unitTypeName: string | null
    unitTypePrice: number
    roomDocumentId: string | null
    meterStatus: 'ready' | 'missing' | 'outdated' | 'no_room'
    latestMeterReading: {
        electricMeterValue: number
        waterMeterValue: number
        electricMeterPrev: number
        waterMeterPrev: number
        electricUnitsUsed: number
        waterUnitsUsed: number
    } | null
}

const pendingAutoBills = ref<PendingAutoBill[]>([])
const isLoadingAutoBills = ref(true)
const selectedForBilling = ref<Set<number>>(new Set())
const isGeneratingBills = ref(false)
const showAutoBillConfirm = ref(false)
const autoBillResult = ref<{ generated: number; failed: number } | null>(null)

async function fetchPendingAutoBills() {
    if (!token.value) return
    isLoadingAutoBills.value = true
    try {
        const params = new URLSearchParams()
        if (selectedPropertyDocumentId.value) {
            params.set('propertyDocumentId', selectedPropertyDocumentId.value)
        }
        const res = await fetch(`${STRAPI_URL}/api/billings/pending-auto?${params}`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const data = await res.json()
        pendingAutoBills.value = data.data ?? []
        // Auto-select all meter-ready residents
        selectedForBilling.value = new Set(
            pendingAutoBills.value
                .filter(r => r.meterStatus === 'ready')
                .map(r => r.id)
        )
    } catch (err) {
        console.error('Failed to fetch pending auto bills:', err)
    } finally {
        isLoadingAutoBills.value = false
    }
}

function toggleBillSelection(id: number) {
    const s = new Set(selectedForBilling.value)
    if (s.has(id)) {
        s.delete(id)
    } else {
        s.add(id)
    }
    selectedForBilling.value = s
}

function toggleSelectAll() {
    if (selectedForBilling.value.size === pendingAutoBills.value.length) {
        selectedForBilling.value = new Set()
    } else {
        selectedForBilling.value = new Set(pendingAutoBills.value.map(r => r.id))
    }
}

function estimateTotal(r: PendingAutoBill): number {
    const rent = r.unitTypePrice || 0
    const elec = r.latestMeterReading
        ? (r.latestMeterReading.electricUnitsUsed || 0) * (r.electricPricePerUnit || 0)
        : 0
    const water = r.latestMeterReading
        ? (r.latestMeterReading.waterUnitsUsed || 0) * (r.waterPricePerUnit || 0)
        : 0
    return rent + elec + water + (r.commonAreaFee || 0)
}

const selectedBillsTotal = computed(() => {
    return pendingAutoBills.value
        .filter(r => selectedForBilling.value.has(r.id))
        .reduce((sum, r) => sum + estimateTotal(r), 0)
})

async function generateBills() {
    isGeneratingBills.value = true
    autoBillResult.value = null
    try {
        const selected = pendingAutoBills.value.filter(r => selectedForBilling.value.has(r.id))
        const res = await fetch(`${STRAPI_URL}/api/billings/auto-generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                residents: selected.map(r => ({ id: r.id, documentId: r.documentId })),
            }),
        })
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        autoBillResult.value = { generated: data.meta?.generated ?? 0, failed: data.meta?.failed ?? 0 }
        // Refresh all dashboard data
        fetchPendingAutoBills()
        fetchStats()
        fetchUnpaidBills()
    } catch (err) {
        console.error('Failed to generate bills:', err)
        autoBillResult.value = { generated: 0, failed: selectedForBilling.value.size }
    } finally {
        isGeneratingBills.value = false
        showAutoBillConfirm.value = false
    }
}

const meterStatusColors: Record<string, string> = {
    ready: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    missing: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    outdated: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    no_room: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

const meterStatusIcons: Record<string, string> = {
    ready: 'fa-solid fa-circle-check',
    missing: 'fa-solid fa-circle-xmark',
    outdated: 'fa-solid fa-clock',
    no_room: 'fa-solid fa-circle-question',
}

onBeforeUnmount(() => {
    overallChartInstance?.destroy()
    perResidentChartInstance?.destroy()
    incomeChartInstance?.destroy()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    const isThai = lang.value === 'TH'
    return new Date(dateStr).toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

function formatCurrency(amount: number, currency = 'THB') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

const maintenancePriorityColors: Record<string, string> = {
    low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    urgent: 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300',
}

const maintenanceStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    on_hold: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    resolved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

const leaseStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    expired: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
    terminated: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
}

const paymentStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    refunded: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}

const billingStatusColors: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    partiallyPaid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
}

// ─── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
    await fetchProperties()
    fetchStats()
    fetchRecentLeases()
    fetchUnpaidBills()
    fetchRecentMaintenance()
    fetchReviewingBills()
    fetchPendingAutoBills()
    buildCharts()
})


</script>

<template>
    <div class="space-y-6 max-w-6xl mx-auto">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fadeUp"
            style="animation-delay:0ms">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.dashboard }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ t.welcomeBack }}, {{ user?.username || 'Manager' }}
                </p>
            </div>
            <div class="flex items-center gap-3 self-start">
                <!-- Property selector -->
                <div class="relative">
                    <i
                        class="fa-solid fa-building absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                    <select v-model="selectedPropertyDocumentId"
                        class="pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none transition-colors">
                        <option value="">{{ t.allProperties }}</option>
                        <option v-for="prop in propertiesList" :key="prop.id" :value="prop.documentId">
                            {{ prop.name }}{{ prop.city ? ' · ' + prop.city : '' }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>
                <NuxtLink to="/manager/residents"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
                    <i class="fa-solid fa-users text-sm"></i>
                    {{ t.residents }}
                </NuxtLink>
            </div>
        </div>

        <!-- Stat Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeUp" style="animation-delay:80ms">
            <NuxtLink to="/manager/leases"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-file-contract text-emerald-600 dark:text-emerald-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    <span v-if="isLoadingStats"
                        class="inline-block w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></span>
                    <span v-else>{{ stats.activeLeases }}</span>
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.activeLeases }}</p>
            </NuxtLink>

            <NuxtLink to="/manager/maintenance"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-wrench text-amber-600 dark:text-amber-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    <span v-if="isLoadingStats"
                        class="inline-block w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></span>
                    <span v-else>{{ stats.pendingMaintenance }}</span>
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ t.maintenanceRequests }}</p>
            </NuxtLink>

            <NuxtLink to="/manager/invoices"
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-receipt text-violet-600 dark:text-violet-400"></i>
                    </div>
                    <i
                        class="fa-solid fa-arrow-right text-gray-300 dark:text-gray-600 text-xs group-hover:translate-x-1 transition-transform"></i>
                </div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    <span v-if="isLoadingStats"
                        class="inline-block w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></span>
                    <span v-else>{{ stats.reviewingBillsCount }}</span>
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.awaitingReview }}
                </p>
            </NuxtLink>
        </div>

        <!-- Auto Bill Generator -->
        <div v-if="!isLoadingAutoBills && pendingAutoBills.length > 0"
            class="bg-white dark:bg-gray-900 rounded-xl border border-orange-200 dark:border-orange-800 overflow-hidden animate-fadeUp"
            style="animation-delay:120ms">
            <div
                class="flex items-center justify-between px-6 py-4 border-b border-orange-100 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10">
                <div class="flex items-center gap-3">
                    <div
                        class="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <i class="fa-solid fa-wand-magic-sparkles text-orange-600 dark:text-orange-400 text-sm"></i>
                    </div>
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {{ t.autoBillGenerator }}
                            <span
                                class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-full">
                                {{ pendingAutoBills.length }}
                            </span>
                        </h2>
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {{ t.autoBillSubtitle }}
                            <span
                                class="ml-1 inline-flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400">
                                <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                {{ t.autoBillCronActive }}
                            </span>
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button @click="toggleSelectAll()"
                        class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        {{ selectedForBilling.size === pendingAutoBills.length ? t.deselectAll : t.selectAll }}
                    </button>
                    <button @click="showAutoBillConfirm = true"
                        :disabled="selectedForBilling.size === 0 || isGeneratingBills"
                        class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <i :class="isGeneratingBills ? 'fa-solid fa-rotate animate-spin' : 'fa-solid fa-bolt'"
                            class="text-[10px]"></i>
                        {{ isGeneratingBills ? t.generatingBills : t.generateSelected }}
                        <span v-if="selectedForBilling.size > 0"
                            class="ml-0.5 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{{ selectedForBilling.size
                            }}</span>
                    </button>
                </div>
            </div>

            <!-- Result banner -->
            <div v-if="autoBillResult" class="px-6 py-3 border-b border-gray-100 dark:border-gray-800"
                :class="autoBillResult.failed > 0 ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-emerald-50 dark:bg-emerald-900/10'">
                <div class="flex items-center gap-2 text-sm">
                    <i
                        :class="autoBillResult.failed > 0 ? 'fa-solid fa-triangle-exclamation text-amber-500' : 'fa-solid fa-circle-check text-emerald-500'"></i>
                    <span class="text-gray-700 dark:text-gray-300">
                        <strong>{{ autoBillResult.generated }}</strong> {{ t.generatedCount }}
                        <template v-if="autoBillResult.failed > 0">
                            · <strong class="text-red-600 dark:text-red-400">{{ autoBillResult.failed }}</strong> {{
                                t.failedCount }}
                        </template>
                    </span>
                    <button @click="autoBillResult = null"
                        class="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Residents list -->
            <div class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
                <div v-for="r in pendingAutoBills" :key="r.id"
                    class="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    @click="toggleBillSelection(r.id)">
                    <!-- Checkbox -->
                    <div class="flex-shrink-0">
                        <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                            :class="selectedForBilling.has(r.id) ? 'bg-orange-600 border-orange-600' : 'border-gray-300 dark:border-gray-600'">
                            <i v-if="selectedForBilling.has(r.id)" class="fa-solid fa-check text-white text-[9px]"></i>
                        </div>
                    </div>

                    <!-- Resident info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ r.username
                            }}</span>
                            <span v-if="r.roomNumber"
                                class="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                {{ r.roomNumber }}
                            </span>
                        </div>
                        <div class="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                            <span>{{ r.propertyName }}</span>
                            <span v-if="r.unitTypeName">· {{ r.unitTypeName }}</span>
                            <span>· {{ t.dueDate }}: {{ formatDate(r.nextBillDate) }}</span>
                        </div>
                    </div>

                    <!-- Meter status badge -->
                    <div class="flex-shrink-0">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold"
                            :class="meterStatusColors[r.meterStatus]">
                            <i :class="meterStatusIcons[r.meterStatus]" class="text-[9px]"></i>
                            {{ r.meterStatus === 'ready' ? t.meterReady
                                : r.meterStatus === 'missing' ? t.meterMissing
                                    : r.meterStatus === 'outdated' ? t.meterOutdated
                                        : t.noRoom }}
                        </span>
                    </div>

                    <!-- Update meter link for missing/outdated -->
                    <NuxtLink
                        v-if="(r.meterStatus === 'missing' || r.meterStatus === 'outdated') && r.propertyDocumentId"
                        :to="`/manager/properties/${r.propertyDocumentId}/meters`"
                        class="flex-shrink-0 text-[10px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
                        @click.stop>
                        <i class="fa-solid fa-gauge text-[9px] mr-0.5"></i>
                        {{ t.updateMeterFirst }}
                    </NuxtLink>

                    <!-- Estimated total -->
                    <div class="flex-shrink-0 text-right min-w-[80px]">
                        <p class="text-sm font-bold text-gray-900 dark:text-white">
                            {{ formatCurrency(estimateTotal(r), r.propertyCurrency || 'THB') }}
                        </p>
                        <p class="text-[9px] text-gray-400">{{ t.estimatedTotal }}</p>
                    </div>
                </div>
            </div>

            <!-- Meter warning banner (if any have missing meters) -->
            <div v-if="pendingAutoBills.some(r => r.meterStatus === 'missing' || r.meterStatus === 'outdated')"
                class="px-6 py-3 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800">
                <div class="flex items-start gap-2">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
                    <p class="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        {{ t.meterWarning }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Auto Bill Confirm Modal -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showAutoBillConfirm" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showAutoBillConfirm = false">
                    </div>
                    <div
                        class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-3 mb-4">
                            <div
                                class="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                                <i class="fa-solid fa-wand-magic-sparkles text-orange-600 dark:text-orange-400"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.autoBillConfirm }}</h3>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ t.autoBillConfirmDesc }}</p>

                        <!-- Summary -->
                        <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4 space-y-1">
                            <div class="flex justify-between text-xs">
                                <span class="text-gray-500">{{ t.residents }}</span>
                                <span class="font-semibold text-gray-900 dark:text-white">{{ selectedForBilling.size
                                }}</span>
                            </div>
                            <div class="flex justify-between text-xs">
                                <span class="text-gray-500">{{ t.meterReady }}</span>
                                <span class="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {{pendingAutoBills.filter(r => selectedForBilling.has(r.id) && r.meterStatus ===
                                        'ready').length}}
                                </span>
                            </div>
                            <div v-if="pendingAutoBills.filter(r => selectedForBilling.has(r.id) && r.meterStatus !== 'ready').length > 0"
                                class="flex justify-between text-xs">
                                <span class="text-gray-500">{{ t.meterMissing }} / {{ t.meterOutdated }}</span>
                                <span class="font-semibold text-amber-600 dark:text-amber-400">
                                    {{pendingAutoBills.filter(r => selectedForBilling.has(r.id) && r.meterStatus !==
                                        'ready').length}}
                                </span>
                            </div>
                            <div
                                class="flex justify-between text-xs pt-1 border-t border-gray-200 dark:border-gray-700">
                                <span class="text-gray-500">{{ t.estimatedTotal }}</span>
                                <span class="font-bold text-gray-900 dark:text-white">
                                    {{ formatCurrency(selectedBillsTotal) }}
                                </span>
                            </div>
                        </div>

                        <!-- Warning for missing meters -->
                        <div v-if="pendingAutoBills.filter(r => selectedForBilling.has(r.id) && r.meterStatus !== 'ready').length > 0"
                            class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <div class="flex items-start gap-2">
                                <i
                                    class="fa-solid fa-triangle-exclamation text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
                                <p class="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                    {{ t.meterWarning }}
                                </p>
                            </div>
                        </div>

                        <div class="flex gap-3 justify-end">
                            <button @click="showAutoBillConfirm = false"
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {{ t.cancel }}
                            </button>
                            <button @click="generateBills" :disabled="isGeneratingBills"
                                class="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
                                <i :class="isGeneratingBills ? 'fa-solid fa-rotate animate-spin' : 'fa-solid fa-bolt'"
                                    class="text-xs"></i>
                                {{ isGeneratingBills ? t.generatingBills : t.generateSelected }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- Charts row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeUp" style="animation-delay:160ms">

            <!-- Income Chart (full width) -->
            <div
                class="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t.monthlyIncome }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">{{ t.monthlyIncomeSubtitle }}</p>
                    </div>
                    <i class="fa-solid fa-chart-bar text-indigo-400"></i>
                </div>
                <div class="h-52">
                    <canvas ref="incomeChartCanvas"></canvas>
                </div>
            </div>

            <!-- Overall Usage -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t.overallUtilityUsage }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">{{ t.overallUtilitySubtitle }}</p>
                    </div>
                    <i class="fa-solid fa-bolt-lightning text-amber-400"></i>
                </div>
                <div class="h-52">
                    <canvas ref="overallChartCanvas"></canvas>
                </div>
            </div>

            <!-- Per-Resident Usage -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t.perResidentUsage }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">{{ t.perResidentSubtitle }}</p>
                    </div>
                    <!-- Tab switcher -->
                    <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                        <button @click="switchUsageTab('electric')"
                            class="px-3 py-1 text-xs font-medium rounded-md transition-colors" :class="activeUsageTab === 'electric'
                                ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'">
                            <i class="fa-solid fa-bolt mr-1"></i>Electric
                        </button>
                        <button @click="switchUsageTab('water')"
                            class="px-3 py-1 text-xs font-medium rounded-md transition-colors" :class="activeUsageTab === 'water'
                                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'">
                            <i class="fa-solid fa-droplet mr-1"></i>Water
                        </button>
                    </div>
                </div>
                <div class="h-52">
                    <canvas ref="perResidentChartCanvas"></canvas>
                </div>
            </div>

        </div>

        <!-- Tables section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeUp" style="animation-delay:240ms">

            <!-- Recent Leases -->
            <div
                class="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ t.recentLeases }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">
                            {{ t.latestLeaseActivity }}</p>
                    </div>
                    <NuxtLink to="/manager/leases"
                        class="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        {{ t.viewAll }}
                    </NuxtLink>
                </div>

                <div v-if="isLoadingLeases" class="p-6 space-y-3">
                    <div v-for="i in 5" :key="i" class="flex items-center gap-3 animate-pulse">
                        <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                        <div class="flex-1 space-y-1.5">
                            <div class="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div class="h-2.5 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
                        </div>
                        <div class="h-5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full"></div>
                        <div class="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded"></div>
                    </div>
                </div>

                <div v-else-if="!recentLeases.length"
                    class="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                        class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <i class="fa-solid fa-file-contract text-gray-400 text-xl"></i>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noLeases }}</p>
                </div>

                <div v-else class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr
                                class="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                <th class="text-left px-6 py-3 font-medium">{{ t.leaseNo }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.resident }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.unitType }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.period }}</th>
                                <th class="text-right px-6 py-3 font-medium">{{ t.monthlyRent }}</th>
                                <th class="text-center px-6 py-3 font-medium">{{ t.status }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            <tr v-for="lease in recentLeases" :key="lease.id"
                                @click="$router.push(`/manager/leases/${lease.documentId}`)"
                                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                                <td class="px-6 py-3.5 text-sm font-mono font-medium text-gray-900 dark:text-white">{{
                                    lease.leaseNo }}</td>
                                <td class="px-6 py-3.5">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                            <i class="fa-solid fa-user text-blue-600 dark:text-blue-400 text-xs"></i>
                                        </div>
                                        <span class="text-sm text-gray-700 dark:text-gray-300">{{
                                            lease.resident?.username || '—' }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400">{{ lease.unitType?.name
                                    || '—' }}</td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                    {{ formatDate(lease.startDate) }} – {{ formatDate(lease.endDate) }}
                                </td>
                                <td
                                    class="px-6 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                    {{ formatCurrency(lease.monthlyRent, lease.currency) }}
                                </td>
                                <td class="px-6 py-3.5 text-center">
                                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                                        :class="leaseStatusColors[lease.status] || leaseStatusColors.pending">
                                        {{ lease.status }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Unpaid Bills -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ t.unpaidBills }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">{{ t.pendingAndOverdue }}</p>
                    </div>
                    <NuxtLink to="/manager/invoices"
                        class="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        {{ t.viewAll }}
                    </NuxtLink>
                </div>

                <div v-if="isLoadingUnpaidBills" class="p-6 space-y-3">
                    <div v-for="i in 4" :key="i" class="flex items-center gap-3 animate-pulse">
                        <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                        <div class="flex-1 space-y-1.5">
                            <div class="h-3 w-36 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div class="h-2.5 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
                        </div>
                        <div class="h-5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full"></div>
                        <div class="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded"></div>
                    </div>
                </div>

                <div v-else-if="!unpaidBills.length"
                    class="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                        class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <i class="fa-solid fa-circle-check text-emerald-400 text-xl"></i>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.noUnpaidBills }}</p>
                </div>

                <div v-else class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr
                                class="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                <th class="text-left px-6 py-3 font-medium">{{ t.invoiceNo }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.resident }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.type }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.description }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.dueDate }}</th>
                                <th class="text-right px-6 py-3 font-medium">{{ t.amount }}</th>
                                <th class="text-center px-6 py-3 font-medium">{{ t.status }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            <tr v-for="bill in unpaidBills" :key="bill.id"
                                @click="$router.push(`/manager/invoices/${bill.documentId}`)"
                                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                                <td class="px-6 py-3.5 text-sm font-mono font-medium text-gray-900 dark:text-white">{{
                                    bill.invoiceNo }}</td>
                                <td class="px-6 py-3.5">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                                            <i class="fa-solid fa-user text-amber-600 dark:text-amber-400 text-xs"></i>
                                        </div>
                                        <span class="text-sm text-gray-700 dark:text-gray-300">{{
                                            bill.resident?.username || '\u2014' }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 capitalize">{{
                                    bill.type?.replace(/([A-Z])/g, ' $1').trim() || '\u2014' }}</td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                                    {{ bill.description }}</td>
                                <td class="px-6 py-3.5 text-sm whitespace-nowrap"
                                    :class="bill.status === 'overdue' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'">
                                    {{ formatDate(bill.dueDate) }}
                                </td>
                                <td
                                    class="px-6 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                    {{ formatCurrency(bill.amount, bill.currency) }}</td>
                                <td class="px-6 py-3.5 text-center">
                                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                                        :class="billingStatusColors[bill.status] || billingStatusColors.pending">
                                        {{ bill.status }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Open Maintenance -->
            <div
                class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t.maintenanceRequests }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">{{ t.openAndInProgress }}</p>
                    </div>
                    <NuxtLink to="/manager/maintenance"
                        class="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        {{ t.viewAll }}
                    </NuxtLink>
                </div>

                <div v-if="isLoadingMaintenance" class="p-6 space-y-3">
                    <div v-for="i in 3" :key="i" class="flex items-center gap-3 animate-pulse">
                        <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                        <div class="flex-1 space-y-1.5">
                            <div class="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div class="h-2.5 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
                        </div>
                        <div class="h-5 w-14 bg-gray-100 dark:bg-gray-800 rounded-full"></div>
                    </div>
                </div>

                <div v-else-if="!recentMaintenance.length"
                    class="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                        class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <i class="fa-solid fa-wrench text-gray-400 text-xl"></i>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ t.noMaintenanceOpen }}</p>
                </div>

                <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
                    <NuxtLink v-for="m in recentMaintenance" :key="m.id" :to="`/manager/maintenance/${m.documentId}`"
                        class="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div
                            class="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                            <i class="fa-solid fa-wrench text-amber-600 dark:text-amber-400 text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ m.title }}</p>
                            <p class="text-xs text-gray-400 truncate">{{ m.resident?.username || '—' }} · {{
                                formatDate(m.createdAt) }}</p>
                        </div>
                        <div class="flex flex-col items-end gap-1 flex-shrink-0">
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="maintenancePriorityColors[m.priority] || maintenancePriorityColors.medium">
                                {{ m.priority }}
                            </span>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                                :class="maintenanceStatusColors[m.status] || maintenanceStatusColors.open">
                                {{ m.status?.replace('_', ' ') }}
                            </span>
                        </div>
                    </NuxtLink>
                </div>
            </div>

            <!-- Recent Payments -->
            <div
                class="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ t.recentPayments }}</h2>
                        <p class="text-xs text-gray-400 mt-0.5">
                            {{ t.latestPaymentActivity }}</p>
                    </div>
                    <NuxtLink to="/manager/payments"
                        class="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        {{ t.viewAll }}
                    </NuxtLink>
                </div>

                <div v-if="isLoadingBills" class="p-6 space-y-3">
                    <div v-for="i in 3" :key="i" class="flex items-center gap-3 animate-pulse">
                        <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                        <div class="flex-1 space-y-1.5">
                            <div class="h-3 w-36 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div class="h-2.5 w-20 bg-gray-100 dark:bg-gray-800 rounded"></div>
                        </div>
                        <div class="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded"></div>
                    </div>
                </div>

                <div v-else-if="!reviewingBills.length"
                    class="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                        class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <i class="fa-solid fa-receipt text-gray-400 text-xl"></i>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ t.noPayments }}</p>
                </div>

                <div v-else class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr
                                class="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                <th class="text-left px-6 py-3 font-medium">{{ t.refNo }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.invoiceNo }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.resident }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.method }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.date }}</th>
                                <th class="text-right px-6 py-3 font-medium">{{ t.amount }}</th>
                                <th class="text-center px-6 py-3 font-medium">{{ t.status }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            <tr v-for="p in reviewingBills" :key="p.id"
                                @click="$router.push(`/manager/payments/${p.documentId}`)"
                                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                                <td class="px-6 py-3.5 text-sm font-mono font-medium text-gray-900 dark:text-white">{{
                                    p.refNo }}</td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 font-mono">{{
                                    p.billing?.invoiceNo || '—' }}</td>
                                <td class="px-6 py-3.5">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                            <i
                                                class="fa-solid fa-user text-violet-600 dark:text-violet-400 text-xs"></i>
                                        </div>
                                        <span class="text-sm text-gray-700 dark:text-gray-300">{{ p.resident?.username
                                            || '—' }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 capitalize">{{
                                    p.method?.replace(/([A-Z])/g, ' $1').trim() || '—' }}</td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{{
                                    formatDate(p.date) }}</td>
                                <td
                                    class="px-6 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                    {{ formatCurrency(p.amount, p.currency) }}</td>
                                <td class="px-6 py-3.5 text-center">
                                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                                        :class="paymentStatusColors[p.status] || paymentStatusColors.pending">
                                        {{ p.status }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped>
@keyframes fadeUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-fadeUp {
    animation: fadeUp 0.45s ease both;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
