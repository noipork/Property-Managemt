<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const { t, lang } = useI18n()
const { user } = useAuth()
const router = useRouter()
const {
    notifications,
    unreadTotal,
    isFetching,
    markAsRead,
    markAllAsRead,
    clearRead,
    fetchNotifications,
} = useNotificationBadge()

// ─── Entry Animation ─────────────────────────────────────────────────────────
const headerVisible = ref(false)
const listVisible = ref(false)

// ─── Filter ───────────────────────────────────────────────────────────────────
const filterType = ref('')
const showUnreadOnly = ref(false)

const notificationTypes = ['announcement', 'billing', 'payment', 'lease', 'maintenance', 'message', 'conversation', 'property', 'asset', 'system']

const typeLabels = computed<Record<string, string>>(() => ({
    announcement: t.value.announcements ?? 'Announcements',
    billing: t.value.invoices ?? 'Invoices',
    payment: t.value.payments ?? 'Payments',
    lease: t.value.leases ?? 'Leases',
    maintenance: t.value.maintenance ?? 'Maintenance',
    message: t.value.messages ?? 'Messages',
    conversation: t.value.messages ?? 'Messages',
    property: t.value.properties ?? 'Properties',
    asset: t.value.assets ?? 'Assets',
    system: (t.value as any).system ?? 'System',
}))

const notificationTypeIcons: Record<string, string> = {
    announcement: 'fa-solid fa-bullhorn',
    billing: 'fa-solid fa-receipt',
    payment: 'fa-solid fa-credit-card',
    lease: 'fa-solid fa-file-contract',
    maintenance: 'fa-solid fa-wrench',
    message: 'fa-solid fa-envelope',
    conversation: 'fa-solid fa-comments',
    property: 'fa-solid fa-building',
    asset: 'fa-solid fa-puzzle-piece',
    system: 'fa-solid fa-gear',
}

const notificationTypeColors: Record<string, string> = {
    announcement: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    billing: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    payment: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    lease: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    maintenance: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    message: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
    conversation: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
    property: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    asset: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
    system: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

const filteredNotifications = computed(() => {
    let result = notifications.value
    if (filterType.value) {
        result = result.filter(n => n.type === filterType.value)
    }
    if (showUnreadOnly.value) {
        result = result.filter(n => !n.isRead)
    }
    return result
})

// ─── Format Time ──────────────────────────────────────────────────────────────
function formatNotifTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    const isThai = lang.value === 'TH'
    const tr = t.value as any

    if (diffMins < 1) return tr.justNow ?? 'Just now'
    if (diffMins < 60) return `${diffMins} ${tr.minutesAgo ?? 'min ago'}`
    if (diffHours < 24) return `${diffHours} ${tr.hoursAgo ?? 'hr ago'}`
    if (diffDays === 1) return t.value.yesterday ?? 'Yesterday'
    if (diffDays < 7) return `${diffDays} ${tr.daysAgo ?? 'days ago'}`
    return date.toLocaleDateString(isThai ? 'th-TH' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(isThai ? { calendar: 'buddhist' } : {}),
    })
}

// ─── Navigate on Click ────────────────────────────────────────────────────────
async function handleNotifClick(n: { id: string; type: string; actionUrl: string | null; relatedDocumentId: string | null }) {
    await markAsRead(n.id)

    const role = user.value?.role ?? 'resident'
    const routeMap: Record<string, Record<string, string>> = {
        maintenance: {
            manager: `/manager/maintenance/${n.relatedDocumentId ?? ''}`,
            resident: `/resident/maintenance/${n.relatedDocumentId ?? ''}`,
        },
        message: {
            manager: '/manager/messages',
            resident: '/resident/messages',
        },
        conversation: {
            manager: '/manager/messages',
            resident: '/resident/messages',
        },
        billing: {
            manager: '/manager/invoices',
            resident: '/resident/my-bills',
        },
        payment: {
            manager: '/manager/payments',
            resident: '/resident/payment-history',
        },
        lease: {
            manager: '/manager/leases',
            resident: '/resident/my-lease',
        },
        announcement: {
            manager: `/manager/announcements/${n.relatedDocumentId ?? ''}`,
            resident: '/',
        },
        property: {
            manager: '/manager/properties',
            resident: '/',
        },
        asset: {
            manager: '/manager/asset-requests',
            resident: '/resident/assets',
        },
    }

    const route = routeMap[n.type]?.[role]
    if (route) {
        router.push(route)
    } else if (n.actionUrl) {
        router.push(n.actionUrl)
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        headerVisible.value = true
    }))
    await fetchNotifications()
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
        listVisible.value = true
    }))
})
</script>

<template>
    <div class="space-y-6 max-w-2xl mx-auto pb-24">
        <!-- Header -->
        <div class="transition-all duration-500"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
                    <i class="fa-solid fa-bell text-primary-600 dark:text-primary-400 text-lg"></i>
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.notifications }}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {{ unreadTotal > 0 ? `${unreadTotal} ${(t as any).unread ?? 'unread'}` : (t as any).allCaughtUp
                        ?? 'All caught up!' }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Actions Bar -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 transition-all duration-500 delay-75"
            :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
            <div class="flex flex-wrap items-center gap-2 sm:gap-3">
                <!-- Type Filter -->
                <div class="relative flex-1 min-w-[140px]">
                    <select v-model="filterType"
                        class="w-full pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                        <option value="">{{ t.allTypes ?? 'All types' }}</option>
                        <option v-for="type in notificationTypes" :key="type" :value="type">
                            {{ typeLabels[type] ?? type }}
                        </option>
                    </select>
                    <i
                        class="fa-solid fa-angle-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                </div>

                <!-- Unread Only Toggle -->
                <button @click="showUnreadOnly = !showUnreadOnly"
                    class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
                    :class="showUnreadOnly
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'">
                    <i class="fa-solid fa-filter text-xs"></i>
                    {{ (t as any).unreadOnly ?? 'Unread only' }}
                </button>

                <!-- Mark All Read -->
                <button @click="markAllAsRead" :disabled="unreadTotal === 0"
                    class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <i class="fa-solid fa-check-double text-xs"></i>
                    <span class="hidden sm:inline">{{ t.markAllRead ?? 'Mark all read' }}</span>
                </button>

                <!-- Clear Read -->
                <button @click="clearRead" :disabled="notifications.filter(n => n.isRead).length === 0"
                    class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <i class="fa-solid fa-trash text-xs"></i>
                    <span class="hidden sm:inline">{{ t.clearRead ?? 'Clear read' }}</span>
                </button>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="isFetching" class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ t.loading }}</p>
            </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredNotifications.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <i class="fa-solid fa-bell-slash text-2xl text-gray-400"></i>
            </div>
            <h3 class="text-base font-medium text-gray-900 dark:text-white mb-1">{{ t.noNotifications }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ showUnreadOnly ? ((t as any).noUnreadNotifications ?? 'No unread notifications') : ((t as
                    any).noNotificationsDesc ?? 'You\'re all caught up!') }}
            </p>
        </div>

        <!-- Notifications List -->
        <div v-else class="space-y-2">
            <button v-for="(n, idx) in filteredNotifications" :key="n.id" @click="handleNotifClick(n)"
                class="w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-500 text-left"
                :class="[
                    listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
                    !n.isRead ? 'border-l-4 border-l-primary-500' : ''
                ]" :style="{ transitionDelay: listVisible ? `${idx * 30}ms` : '0ms' }">
                <div class="flex items-start gap-3">
                    <!-- Icon -->
                    <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        :class="notificationTypeColors[n.type] ?? notificationTypeColors.system">
                        <i :class="notificationTypeIcons[n.type] ?? 'fa-solid fa-bell'" class="text-sm"></i>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-2">
                            <p class="text-sm text-gray-900 dark:text-white leading-snug"
                                :class="!n.isRead ? 'font-bold' : 'font-medium'">
                                {{ n.title }}
                            </p>
                            <span class="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                                {{ formatNotifTime(n.createdAt) }}
                            </span>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug line-clamp-2">
                            {{ n.message }}
                        </p>
                        <!-- Type Badge -->
                        <span
                            class="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            :class="notificationTypeColors[n.type] ?? notificationTypeColors.system">
                            <i :class="notificationTypeIcons[n.type] ?? 'fa-solid fa-bell'" class="text-[8px]"></i>
                            {{ typeLabels[n.type] ?? n.type }}
                        </span>
                    </div>

                    <!-- Unread Indicator -->
                    <div v-if="!n.isRead" class="w-2.5 h-2.5 rounded-full bg-primary-500 flex-shrink-0 mt-1.5"></div>
                </div>
            </button>
        </div>
    </div>
</template>
