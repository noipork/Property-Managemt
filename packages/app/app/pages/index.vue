<script setup lang="ts">
import { onMounted, ref, nextTick, computed } from 'vue'
import gsap from 'gsap'

const { t } = useI18n()
const { user } = useAuth()

// ─── Mock Data ───────────────────────────────────────────────

const stats = computed(() => [
    { label: t.value.totalProperties, value: '124', change: '+12%', up: true, icon: 'ti-home', color: 'bg-blue-500', lightColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { label: t.value.activeTenants, value: '348', change: '+8%', up: true, icon: 'ti-user', color: 'bg-emerald-500', lightColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
    { label: t.value.monthlyRevenue, value: '$84,254', change: '+23%', up: true, icon: 'ti-wallet', color: 'bg-violet-500', lightColor: 'bg-violet-50', textColor: 'text-violet-600' },
    { label: t.value.occupancyRate, value: '94.2%', change: '-1.3%', up: false, icon: 'ti-bar-chart', color: 'bg-amber-500', lightColor: 'bg-amber-50', textColor: 'text-amber-600' },
])

const revenueData = [
    { month: 'Jul', revenue: 52000, expenses: 31000 },
    { month: 'Aug', revenue: 58000, expenses: 33000 },
    { month: 'Sep', revenue: 61000, expenses: 29000 },
    { month: 'Oct', revenue: 67000, expenses: 35000 },
    { month: 'Nov', revenue: 72000, expenses: 32000 },
    { month: 'Dec', revenue: 69000, expenses: 38000 },
    { month: 'Jan', revenue: 78000, expenses: 34000 },
    { month: 'Feb', revenue: 84000, expenses: 36000 },
]

const properties = [
    { id: 1, name: 'Sunset Apartments', location: 'Downtown, NYC', units: 24, occupied: 22, rent: '$2,400', image: '🏢', status: 'Active' },
    { id: 2, name: 'Green Valley Homes', location: 'Brooklyn, NYC', units: 16, occupied: 16, rent: '$1,800', image: '🏠', status: 'Active' },
    { id: 3, name: 'Harbor View Condos', location: 'Manhattan, NYC', units: 32, occupied: 28, rent: '$3,200', image: '🏙️', status: 'Active' },
    { id: 4, name: 'Pine Street Lofts', location: 'Queens, NYC', units: 12, occupied: 10, rent: '$2,100', image: '🏗️', status: 'Maintenance' },
    { id: 5, name: 'Maple Court', location: 'Bronx, NYC', units: 20, occupied: 18, rent: '$1,600', image: '🏘️', status: 'Active' },
]

const recentPayments = [
    { tenant: 'Sarah Mitchell', property: 'Sunset Apartments — 4B', amount: '$2,400', date: 'Feb 27, 2026', status: 'Completed', method: 'Bank Transfer' },
    { tenant: 'James Parker', property: 'Green Valley — 2A', amount: '$1,800', date: 'Feb 26, 2026', status: 'Completed', method: 'Credit Card' },
    { tenant: 'Emily Chen', property: 'Harbor View — 12C', amount: '$3,200', date: 'Feb 26, 2026', status: 'Pending', method: 'ACH' },
    { tenant: 'Michael Brown', property: 'Pine Street — 5D', amount: '$2,100', date: 'Feb 25, 2026', status: 'Completed', method: 'Bank Transfer' },
    { tenant: 'Lisa Rodriguez', property: 'Maple Court — 8A', amount: '$1,600', date: 'Feb 25, 2026', status: 'Overdue', method: 'Pending' },
]

const activities = [
    { icon: 'ti-money', color: 'bg-green-100 text-green-600', title: 'Payment received from Sarah M.', desc: 'Sunset Apartments — Unit 4B', time: '5 min ago' },
    { icon: 'ti-wrench', color: 'bg-orange-100 text-orange-600', title: 'Maintenance request submitted', desc: 'Pine Street Lofts — Unit 5D — Plumbing', time: '1 hour ago' },
    { icon: 'ti-file', color: 'bg-blue-100 text-blue-600', title: 'Lease renewed', desc: 'Green Valley Homes — Unit 2A — 12 months', time: '3 hours ago' },
    { icon: 'ti-user', color: 'bg-purple-100 text-purple-600', title: 'New tenant application', desc: 'Harbor View Condos — Unit 15A', time: '5 hours ago' },
    { icon: 'ti-alert', color: 'bg-red-100 text-red-600', title: 'Lease expiring soon', desc: 'Maple Court — Unit 8A — 30 days left', time: '1 day ago' },
    { icon: 'ti-check', color: 'bg-emerald-100 text-emerald-600', title: 'Inspection completed', desc: 'Sunset Apartments — Unit 2C', time: '1 day ago' },
]

const maintenanceRequests = [
    { id: '#MT-1024', property: 'Pine Street Lofts', unit: '5D', issue: 'Plumbing Leak', priority: 'High', status: 'In Progress' },
    { id: '#MT-1023', property: 'Sunset Apartments', unit: '2C', issue: 'AC Not Working', priority: 'Medium', status: 'Pending' },
    { id: '#MT-1022', property: 'Harbor View', unit: '8B', issue: 'Broken Window', priority: 'High', status: 'Assigned' },
    { id: '#MT-1021', property: 'Green Valley', unit: '4A', issue: 'Pest Control', priority: 'Low', status: 'Scheduled' },
]

const occupancyBreakdown = [
    { label: 'Occupied', value: 94, color: 'bg-emerald-500' },
    { label: 'Vacant', value: 4, color: 'bg-amber-500' },
    { label: 'Maintenance', value: 2, color: 'bg-red-500' },
]

// ─── Revenue chart helpers ───────────────────────────────────

const maxRevenue = Math.max(...revenueData.map((d) => d.revenue))

function barHeight(val: number): string {
    return `${(val / maxRevenue) * 100}%`
}

// ─── GSAP Animations ─────────────────────────────────────────

onMounted(() => {
    nextTick(() => {
        // Stat cards entrance (includes revenue + occupancy cards)
        gsap.fromTo('.stat-card',
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out', clearProps: 'all' },
        )

        // Stat value counter animation
        document.querySelectorAll('.stat-value').forEach((el) => {
            const htmlEl = el as HTMLElement
            const raw = htmlEl.dataset.value || '0'
            const numericStr = raw.replace(/[^0-9.]/g, '')
            const target = parseFloat(numericStr)
            const prefix = raw.match(/^[^0-9]*/)?.[0] || ''
            const suffix = raw.match(/[^0-9.]*$/)?.[0] || ''
            const proxy = { val: 0 }
            gsap.to(proxy, {
                val: target,
                duration: 1.5,
                ease: 'power2.out',
                delay: 0.3,
                onUpdate() {
                    const formatted = target >= 1000
                        ? proxy.val.toLocaleString('en-US', { maximumFractionDigits: target % 1 !== 0 ? 1 : 0 })
                        : proxy.val % 1 !== 0
                            ? proxy.val.toFixed(1)
                            : Math.round(proxy.val).toString()
                    htmlEl.textContent = `${prefix}${formatted}${suffix}`
                },
            })
        })

        // Revenue chart bars entrance
        gsap.fromTo('.revenue-bar',
            { scaleY: 0, opacity: 0 },
            { scaleY: 1, opacity: 1, duration: 0.8, stagger: 0.08, ease: 'power3.out', delay: 0.7, transformOrigin: 'bottom', clearProps: 'opacity' },
        )

        // Table rows entrance
        gsap.fromTo('.table-row',
            { x: -20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out', delay: 0.5, clearProps: 'all' },
        )

        // Activity items entrance
        gsap.fromTo('.activity-item',
            { x: 20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out', delay: 0.6, clearProps: 'all' },
        )

        // Property cards entrance
        gsap.fromTo('.property-card',
            { scale: 0.9, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.4)', delay: 0.3, clearProps: 'all' },
        )

        // Section headers
        gsap.fromTo('.section-header',
            { y: 15, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out', delay: 0.2, clearProps: 'all' },
        )

        // Occupancy progress bars
        gsap.fromTo('.occupancy-bar',
            { scaleX: 0 },
            { scaleX: 1, duration: 1, stagger: 0.15, ease: 'power3.out', delay: 1.0, transformOrigin: 'left', clearProps: 'all' },
        )

        // Maintenance rows
        gsap.fromTo('.maintenance-row',
            { y: 15, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out', delay: 0.7, clearProps: 'all' },
        )
    })
})
</script>

<template>
    <div>
        <!-- Mobile Header (only visible on mobile) -->
        <div class="md:hidden flex items-center justify-between mb-4 -mt-2">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                    <i class="ti-user text-primary-600 dark:text-primary-400"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ user?.name || 'User' }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ t.welcomeBack }}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button
                    class="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <i class="ti-bell text-gray-600 dark:text-gray-300"></i>
                </button>
            </div>
        </div>

        <!-- Page Header -->
        <div class="section-header flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 md:mb-6">
            <div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{{ t.dashboard }}</h1>
                <p class="text-gray-500 dark:text-gray-400 text-xs md:text-sm mt-1 hidden md:block">{{ t.welcomeBack }},
                    {{ user?.name || 'User'
                    }}. {{ t.dashboardSubtitle }}
                </p>
            </div>
            <div class="flex items-center gap-2 md:gap-3 mt-3 sm:mt-0">
                <button
                    class="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 text-xs md:text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                    <i class="ti-download text-gray-500 dark:text-gray-400"></i>
                    <span>{{ t.export }}</span>
                </button>
                <button
                    class="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 text-xs md:text-sm bg-primary-600 dark:bg-primary-700 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 dark:shadow-primary-700/20">
                    <i class="ti-plus"></i>
                    <span class="hidden sm:inline">{{ t.addProperty }}</span>
                    <span class="sm:hidden">{{ t.addProperty.split(' ')[0] }}</span>
                </button>
            </div>
        </div>

        <!-- ─── Stat Cards ────────────────────────────────────────── -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6 md:mb-8">
            <div v-for="stat in stats" :key="stat.label"
                class="stat-card bg-white dark:bg-gray-800 rounded-xl p-3 md:p-5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <div class="flex items-start justify-between mb-2 md:mb-4">
                    <div class="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 dark:bg-gray-700/50"
                        :class="stat.lightColor">
                        <i :class="[stat.icon, stat.textColor, 'text-lg md:text-xl', 'dark:text-gray-300']"></i>
                    </div>
                    <span
                        class="flex items-center gap-0.5 md:gap-1 text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full"
                        :class="stat.up ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'">
                        <i :class="stat.up ? 'ti-arrow-up' : 'ti-arrow-down'" class="text-[8px] md:text-[10px]"></i>
                        {{ stat.change }}
                    </span>
                </div>
                <p class="stat-value text-lg md:text-2xl font-bold text-gray-900 dark:text-white"
                    :data-value="stat.value">0</p>
                <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 md:mt-1 truncate">{{ stat.label }}
                </p>
            </div>
        </div>

        <!-- ─── Revenue Chart + Occupancy ─────────────────────────── -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
            <!-- Revenue chart -->
            <div
                class="stat-card lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 md:p-6">
                <div
                    class="section-header flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 md:mb-6">
                    <div>
                        <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{
                            t.revenueOverview }}</h2>
                        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400">{{ t.monthlyRevenueVsExpenses }}
                        </p>
                    </div>
                    <div class="flex items-center gap-3 md:gap-4 text-[10px] md:text-xs">
                        <span class="flex items-center gap-1">
                            <span
                                class="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-primary-500 dark:bg-primary-600"></span>
                            <span class="text-gray-600 dark:text-gray-400">{{ t.revenue }}</span>
                        </span>
                        <span class="flex items-center gap-1">
                            <span class="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                            <span class="text-gray-600 dark:text-gray-400">{{ t.expenses }}</span>
                        </span>
                    </div>
                </div>
                <div class="flex items-end gap-1.5 md:gap-3 h-40 md:h-56 overflow-x-auto overflow-y-visible pb-2">
                    <div v-for="item in revenueData" :key="item.month"
                        class="flex-1 min-w-[32px] md:min-w-0 flex flex-col items-center gap-1">
                        <div class="w-full flex items-end justify-center gap-0.5 md:gap-1 h-32 md:h-48">
                            <div class="revenue-bar w-3 md:w-5 rounded-t-md bg-primary-500 dark:bg-primary-600 hover:bg-primary-600 dark:hover:bg-primary-700 transition-colors cursor-pointer shadow-sm"
                                :style="{ height: barHeight(item.revenue), minHeight: '4px' }"
                                :title="`Revenue: $${item.revenue.toLocaleString('en-US')}`"></div>
                            <div class="revenue-bar w-3 md:w-5 rounded-t-md bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors cursor-pointer shadow-sm"
                                :style="{ height: barHeight(item.expenses), minHeight: '4px' }"
                                :title="`Expenses: $${item.expenses.toLocaleString('en-US')}`"></div>
                        </div>
                        <span class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">{{
                            item.month }}</span>
                    </div>
                </div>
            </div>

            <!-- Occupancy breakdown -->
            <div
                class="stat-card bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 md:p-6">
                <div class="section-header mb-4 md:mb-6">
                    <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{ t.occupancy }}</h2>
                    <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400">{{ t.currentUnitStatus }}</p>
                </div>
                <!-- Big percentage ring (simplified) -->
                <div class="flex items-center justify-center mb-4 md:mb-6">
                    <div class="relative w-28 h-28 md:w-36 md:h-36">
                        <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" class="dark:stroke-gray-700"
                                stroke-width="12" />
                            <circle cx="60" cy="60" r="52" fill="none" stroke="#10b981" class="dark:stroke-emerald-500"
                                stroke-width="12" stroke-linecap="round"
                                :stroke-dasharray="`${94.2 * 3.267} ${100 * 3.267}`" />
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                            <span class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">94.2%</span>
                            <span class="text-[10px] md:text-xs text-gray-400 dark:text-gray-500">Occupied</span>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 md:space-y-3">
                    <div v-for="item in occupancyBreakdown" :key="item.label" class="flex items-center gap-2 md:gap-3">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :class="item.color"></span>
                        <span class="text-xs md:text-sm text-gray-600 dark:text-gray-400 flex-1">{{ item.label }}</span>
                        <div class="w-16 md:w-24 h-1.5 md:h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                            <div class="occupancy-bar h-full rounded-full" :class="item.color"
                                :style="{ width: item.value + '%' }"></div>
                        </div>
                        <span
                            class="text-xs md:text-sm font-semibold text-gray-800 dark:text-gray-300 w-8 md:w-10 text-right">{{
                                item.value }}%</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ─── Properties List ───────────────────────────────────── -->
        <div class="mb-6 md:mb-8">
            <div class="section-header flex items-center justify-between mb-3 md:mb-4">
                <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{ t.properties }}</h2>
                <button
                    class="text-xs md:text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                    {{ t.viewAll }} <i class="ti-arrow-right text-xs"></i>
                </button>
            </div>
            <!-- Mobile: Horizontal scroll -->
            <div
                class="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
                <div v-for="prop in properties" :key="prop.id"
                    class="property-card flex-shrink-0 w-[200px] md:w-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 md:p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
                    <div class="flex items-center justify-between mb-2 md:mb-3">
                        <span class="text-2xl md:text-3xl">{{ prop.image }}</span>
                        <span class="text-[10px] md:text-xs font-medium px-1.5 md:px-2 py-0.5 rounded-full" :class="prop.status === 'Active'
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                            ">
                            {{ prop.status }}
                        </span>
                    </div>
                    <h3 class="font-semibold text-gray-900 dark:text-white text-xs md:text-sm mb-1 truncate">{{
                        prop.name }}</h3>
                    <p
                        class="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 mb-2 md:mb-3 flex items-center gap-1 truncate">
                        <i class="ti-location-pin"></i> {{ prop.location }}
                    </p>
                    <div class="flex items-center justify-between text-[10px] md:text-xs">
                        <span class="text-gray-500 dark:text-gray-400">
                            <span class="font-semibold text-gray-800 dark:text-gray-300">{{ prop.occupied }}</span>/{{
                                prop.units }} {{ t.units }}
                        </span>
                        <span class="font-semibold text-gray-900 dark:text-gray-200">{{ prop.rent }}<span
                                class="text-gray-400 dark:text-gray-500 font-normal">/mo</span></span>
                    </div>
                    <div
                        class="mt-2 md:mt-3 w-full bg-gray-100 dark:bg-gray-700 h-1 md:h-1.5 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all"
                            :class="prop.occupied / prop.units > 0.9 ? 'bg-emerald-500' : prop.occupied / prop.units > 0.7 ? 'bg-amber-500' : 'bg-red-500'"
                            :style="{ width: `${(prop.occupied / prop.units) * 100}%` }"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ─── Payments Table + Activity Feed ────────────────────── -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
            <!-- Payments table -->
            <div
                class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div
                    class="section-header px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{ t.recentPayments
                            }}</h2>
                        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{{
                            t.latestRentTransactions }}</p>
                    </div>
                    <button class="text-xs md:text-sm text-primary-600 dark:text-primary-400 hover:underline">{{
                        t.viewAll
                        }}</button>
                </div>

                <!-- Mobile: Card view -->
                <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
                    <div v-for="payment in recentPayments.slice(0, 4)" :key="payment.tenant"
                        class="table-row p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <div
                                    class="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                    <i class="ti-user text-gray-400 dark:text-gray-500 text-sm"></i>
                                </div>
                                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ payment.tenant
                                    }}</span>
                            </div>
                            <span class="text-sm font-bold text-gray-900 dark:text-white">{{ payment.amount }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{{ payment.property
                                }}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-gray-400 dark:text-gray-500">{{ payment.date.split(',')[0] }}</span>
                                <span class="text-[10px] font-medium px-2 py-0.5 rounded-full" :class="{
                                    'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400': payment.status === 'Completed',
                                    'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': payment.status === 'Pending',
                                    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400': payment.status === 'Overdue',
                                }">
                                    {{ payment.status }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Desktop: Table view -->
                <div class="hidden md:block overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr
                                class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-50 dark:border-gray-700">
                                <th class="text-left px-6 py-3 font-medium">{{ t.tenant }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.property }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.amount }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.date }}</th>
                                <th class="text-left px-6 py-3 font-medium">{{ t.status }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="payment in recentPayments" :key="payment.tenant"
                                class="table-row border-b border-gray-50 dark:border-gray-700 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-6 py-3.5">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                            <i class="ti-user text-gray-400 dark:text-gray-500 text-sm"></i>
                                        </div>
                                        <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{
                                            payment.tenant }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400">{{ payment.property }}
                                </td>
                                <td class="px-6 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">{{
                                    payment.amount }}</td>
                                <td class="px-6 py-3.5 text-sm text-gray-400 dark:text-gray-500">{{ payment.date }}</td>
                                <td class="px-6 py-3.5">
                                    <span class="text-xs font-medium px-2.5 py-1 rounded-full" :class="{
                                        'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400': payment.status === 'Completed',
                                        'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': payment.status === 'Pending',
                                        'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400': payment.status === 'Overdue',
                                    }">
                                        {{ payment.status }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Activity feed -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div
                    class="section-header px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{ t.recentActivity }}
                    </h2>
                    <button
                        class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <i class="ti-more-alt text-gray-400 dark:text-gray-500"></i>
                    </button>
                </div>
                <div class="divide-y divide-gray-50 dark:divide-gray-700 max-h-[300px] md:max-h-none overflow-y-auto">
                    <div v-for="(a, idx) in activities" :key="idx"
                        class="activity-item px-4 md:px-6 py-3 md:py-3.5 flex gap-2 md:gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                        <div class="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0 dark:bg-gray-700/50 dark:text-gray-300"
                            :class="a.color">
                            <i :class="a.icon" class="text-xs md:text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs md:text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{
                                a.title }}</p>
                            <p class="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 truncate">{{ a.desc }}</p>
                        </div>
                        <span
                            class="text-[10px] md:text-xs text-gray-300 dark:text-gray-600 whitespace-nowrap mt-0.5">{{
                                a.time
                            }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ─── Maintenance Requests ──────────────────────────────── -->
        <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-6 md:mb-8">
            <div
                class="section-header px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                    <h2 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{{
                        t.maintenanceRequests }}</h2>
                    <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{{
                        t.openAndInProgress }}</p>
                </div>
                <button
                    class="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 text-xs md:text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors">
                    <i class="ti-plus text-xs"></i> <span class="hidden sm:inline">{{ t.newRequest }}</span><span
                        class="sm:hidden">New</span>
                </button>
            </div>

            <!-- Mobile: Card view -->
            <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
                <div v-for="req in maintenanceRequests" :key="req.id"
                    class="maintenance-row p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ req.issue }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ req.property }} • {{ t.unit }} {{
                                req.unit }}</p>
                        </div>
                        <span class="text-[10px] font-medium px-2 py-0.5 rounded-full" :class="{
                            'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400': req.priority === 'High',
                            'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': req.priority === 'Medium',
                            'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': req.priority === 'Low',
                        }">
                            {{ req.priority }}
                        </span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500">{{ req.id }}</span>
                        <span class="text-[10px] font-medium px-2 py-0.5 rounded-full" :class="{
                            'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': req.status === 'In Progress',
                            'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': req.status === 'Pending',
                            'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400': req.status === 'Assigned',
                            'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400': req.status === 'Scheduled',
                        }">
                            {{ req.status }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Desktop: Table view -->
            <div class="hidden md:block overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr
                            class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-50 dark:border-gray-700">
                            <th class="text-left px-6 py-3 font-medium">{{ t.id }}</th>
                            <th class="text-left px-6 py-3 font-medium">{{ t.property }}</th>
                            <th class="text-left px-6 py-3 font-medium">{{ t.unit }}</th>
                            <th class="text-left px-6 py-3 font-medium">{{ t.issue }}</th>
                            <th class="text-left px-6 py-3 font-medium">{{ t.priority }}</th>
                            <th class="text-left px-6 py-3 font-medium">{{ t.status }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="req in maintenanceRequests" :key="req.id"
                            class="maintenance-row border-b border-gray-50 dark:border-gray-700 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                            <td class="px-6 py-3.5 text-sm font-mono text-gray-500 dark:text-gray-400">{{ req.id }}</td>
                            <td class="px-6 py-3.5 text-sm text-gray-800 dark:text-gray-200 font-medium">{{ req.property
                            }}</td>
                            <td class="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400">{{ req.unit }}</td>
                            <td class="px-6 py-3.5 text-sm text-gray-700 dark:text-gray-300">{{ req.issue }}</td>
                            <td class="px-6 py-3.5">
                                <span class="text-xs font-medium px-2.5 py-1 rounded-full" :class="{
                                    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400': req.priority === 'High',
                                    'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': req.priority === 'Medium',
                                    'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': req.priority === 'Low',
                                }">
                                    {{ req.priority }}
                                </span>
                            </td>
                            <td class="px-6 py-3.5">
                                <span class="text-xs font-medium px-2.5 py-1 rounded-full" :class="{
                                    'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': req.status === 'In Progress',
                                    'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': req.status === 'Pending',
                                    'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400': req.status === 'Assigned',
                                    'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400': req.status === 'Scheduled',
                                }">
                                    {{ req.status }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>
