<script setup lang="ts">
const { t } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

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
    fetchStats()
})
</script>

<template>
    <div class="space-y-6 max-w-3xl mx-auto">
        <!-- Page Header -->
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.dashboard || 'Dashboard' }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {{ t.welcomeBack || 'Welcome back' }}, {{ user?.username || 'Resident' }}
            </p>
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

        <!-- Quick nav -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NuxtLink v-for="link in [
                { to: '/resident/my-lease', icon: 'fa-file-contract', label: t.myLease || 'My Lease' },
                { to: '/resident/my-bills', icon: 'fa-receipt', label: t.myBills || 'My Bills' },
                { to: '/resident/maintenance', icon: 'fa-wrench', label: t.maintenance || 'Maintenance' },
                { to: '/resident/payment-history', icon: 'fa-clock-rotate-left', label: t.paymentHistory || 'Payment History' },
            ]" :key="link.to" :to="link.to"
                class="flex flex-col items-center justify-center gap-2 py-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                <i :class="`fa-solid ${link.icon} text-primary-600 dark:text-primary-400 text-lg`"></i>
                <span class="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">{{ link.label }}</span>
            </NuxtLink>
        </div>
    </div>
</template>
