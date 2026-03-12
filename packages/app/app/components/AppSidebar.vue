<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import gsap from 'gsap'

const props = defineProps<{
    open: boolean
}>()

const { user } = useAuth()
const { t } = useI18n()
const route = useRoute()
const { unreadByType } = useNotificationBadge()

// Map sidebar paths to notification types they should show badges for
const pathNotifTypes: Record<string, string[]> = {
    '/manager/maintenance': ['maintenance'],
    '/manager/messages': ['message', 'conversation'],
    '/manager/invoices': ['billing'],
    '/manager/payments': ['payment'],
    '/manager/leases': ['lease'],
    '/manager/announcements': ['announcement'],
    '/manager/properties': ['property'],
    '/manager/asset-requests': ['asset'],
    '/resident/maintenance': ['maintenance'],
    '/resident/messages': ['message', 'conversation'],
    '/resident/my-bills': ['billing'],
    '/resident/payment-history': ['payment'],
    '/resident/my-lease': ['lease'],
    '/resident/dashboard': ['announcement'],
    '/resident/announcements': ['announcement'],
    '/resident/assets': ['asset'],
}

function badgeCount(path: string): number {
    const types = pathNotifTypes[path]
    if (!types) return 0
    return types.reduce((sum, t) => sum + (unreadByType.value[t] || 0), 0)
}

function isActive(path: string) {
    if (path === '/') return route.path === '/'
    return route.path === path || route.path.startsWith(path + '/')
}

// Manager menu - full property management access
const managerMenuSections = computed(() => [
    {
        title: t.value.main,
        items: [
            { name: t.value.dashboard, icon: 'ti-dashboard', badge: '', path: '/manager/dashboard' },
            { name: t.value.properties, icon: 'ti-home', badge: '', path: '/manager/properties' },
            { name: t.value.residents, icon: 'ti-user', badge: '', path: '/manager/residents' },
            { name: t.value.leases, icon: 'ti-file', badge: '', path: '/manager/leases' },
            { name: t.value.assets, icon: 'ti-package', badge: '', path: '/manager/assets' },

        ],
    },
    {
        title: t.value.financial,
        items: [
            { name: t.value.payments, icon: 'ti-wallet', badge: '', path: '/manager/payments' },
            { name: t.value.invoices, icon: 'ti-receipt', badge: '', path: '/manager/invoices' },
            // { name: t.value.expenses, icon: 'ti-money', badge: '', path: '/expenses' },
            // { name: t.value.reports, icon: 'ti-bar-chart', badge: '', path: '/reports' },
        ],
    },
    {
        title: t.value.operations,
        items: [
            { name: t.value.maintenance, icon: 'ti-headphone-alt', badge: '', path: '/manager/maintenance' },
            { name: t.value.announcements, icon: 'ti-announcement', badge: '', path: '/manager/announcements' },
            // { name: t.value.calendar, icon: 'ti-calendar', badge: '', path: '/calendar' },
            { name: t.value.messages, icon: 'ti-comment', badge: '', path: '/manager/messages' },
            // { name: t.value.documents, icon: 'ti-folder', badge: '', path: '/documents' },
            { name: t.value.assetRequests, icon: 'ti-envelope', badge: '', path: '/manager/asset-requests' },
        ],
    },
    {
        title: t.value.account,
        items: [
            { name: t.value.profile, icon: 'ti-user', badge: '', path: '/profile' },
            { name: t.value.packages, icon: 'ti-crown', badge: '', path: '/manager/packages' },
            { name: t.value.subscriptions, icon: 'ti-receipt', badge: '', path: '/manager/subscriptions' },

        ],
    },
])

// Resident menu - limited to tenant-specific features
const residentMenuSections = computed(() => [
    {
        title: t.value.overview,
        items: [
            { name: t.value.dashboard, icon: 'ti-dashboard', badge: '', path: '/resident/dashboard' },
            { name: t.value.myLease, icon: 'ti-file', badge: '', path: '/resident/my-lease' },
        ],
    },
    {
        title: t.value.financial,
        items: [
            { name: t.value.myBills, icon: 'ti-receipt', badge: '', path: '/resident/my-bills' },
            { name: t.value.paymentHistory, icon: 'ti-wallet', badge: '', path: '/resident/payment-history' },
        ],
    },
    {
        title: t.value.services,
        items: [
            { name: t.value.maintenance, icon: 'ti-headphone-alt', badge: '', path: '/resident/maintenance' },
            { name: t.value.announcements, icon: 'ti-announcement', badge: '', path: '/resident/announcements' },
            { name: t.value.messages, icon: 'ti-comment', badge: '', path: '/resident/messages' },
            { name: t.value.assets, icon: 'ti-package', badge: '', path: '/resident/assets' },
        ],
    },
    {
        title: t.value.account,
        items: [
            { name: t.value.profile, icon: 'ti-user', badge: '', path: '/profile' },
        ],
    },
])

// Use the appropriate menu based on user role
const menuSections = computed(() => {
    return user.value?.role === 'resident' ? residentMenuSections.value : managerMenuSections.value
})

watch(
    () => props.open,
    (val) => {
        nextTick(() => {
            if (val) {
                gsap.from('.sidebar-item', {
                    x: -20,
                    opacity: 0,
                    stagger: 0.03,
                    duration: 0.3,
                    ease: 'power2.out',
                })
            }
        })
    }
)
</script>

<template>
    <aside
        class="fixed left-0 top-0 bottom-0 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-400 transition-all duration-300 z-50 overflow-hidden flex flex-col border-r border-gray-200 dark:border-gray-800"
        :class="open ? 'w-64' : 'w-20'">
        <!-- Sidebar Header / Brand -->
        <div
            class="h-16 flex items-center gap-3 px-5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
            <img src="/logo.png" alt="PropManager" class="w-9 h-9 rounded-lg object-contain flex-shrink-0" />
            <span v-if="open"
                class="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">PropManager</span>
        </div>

        <!-- Scrollable Menu -->
        <div class="flex-1 overflow-y-auto overflow-x-hidden py-3">
            <div v-for="section in menuSections" :key="section.title" class="mb-1">
                <!-- Section title -->
                <div v-if="open"
                    class="px-6 py-2 text-xs font-semibold text-gray-500 dark:text-gray-600 uppercase tracking-wider">
                    {{ section.title }}
                </div>
                <div v-else class="px-3 py-1">
                    <hr class="border-gray-200 dark:border-gray-800" />
                </div>

                <!-- Menu items -->
                <div v-for="item in section.items" :key="item.name" class="sidebar-item mb-0.5"
                    :class="open ? 'mx-3' : 'mx-2'">
                    <NuxtLink :to="item.path"
                        class="w-full flex items-center rounded-lg transition-all duration-200 group relative" :class="[
                            isActive(item.path)
                                ? 'bg-primary-600 dark:bg-primary-700 text-white shadow-lg shadow-primary-600/20 dark:shadow-primary-700/20'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white',
                            open ? 'gap-3 px-3 py-2.5' : 'justify-center py-2 px-0'
                        ]" :title="!open ? item.name : undefined">
                        <div class="relative flex-shrink-0 w-5">
                            <i :class="[
                                item.icon,
                                'text-lg',
                                open ? 'w-5 text-center block' : 'w-5 text-center text-xl block',
                                isActive(item.path) ? 'text-white' : 'text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white',
                            ]"></i>
                            <!-- Collapsed badge dot -->
                            <span v-if="!open && badgeCount(item.path) > 0"
                                class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900"></span>
                        </div>
                        <span v-if="open" class="text-sm font-medium whitespace-nowrap">
                            {{ item.name }}
                        </span>
                        <!-- Expanded badge count -->
                        <span v-if="open && badgeCount(item.path) > 0"
                            class="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full"
                            :class="isActive(item.path)
                                ? 'bg-white/20 text-white'
                                : 'bg-red-500 text-white'">
                            {{ badgeCount(item.path) > 99 ? '99+' : badgeCount(item.path) }}
                        </span>
                    </NuxtLink>
                </div>
            </div>
        </div>

        <!-- Bottom user area -->
        <div class="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <ClientOnly>
                <div class="flex items-center gap-3" :class="{ 'justify-center': !open }">
                    <div
                        class="w-9 h-9 bg-primary-600/20 dark:bg-primary-700/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="ti-user text-primary-400 dark:text-primary-500"></i>
                    </div>
                    <div v-if="open" class="overflow-hidden flex-1">
                        <div class="flex items-center gap-2">
                            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ user?.name ||
                                'User' }}</p>
                            <span v-if="user?.role" class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase"
                                :class="user.role === 'manager'
                                    ? 'bg-purple-500/20 text-purple-400 dark:bg-purple-600/20 dark:text-purple-500'
                                    : 'bg-blue-500/20 text-blue-400 dark:bg-blue-600/20 dark:text-blue-500'">
                                {{ user.role }}
                            </span>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-600 truncate">{{ user?.email ||
                            'user@example.com' }}
                        </p>
                    </div>
                </div>
            </ClientOnly>
        </div>
    </aside>
</template>
