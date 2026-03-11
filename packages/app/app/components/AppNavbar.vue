<script setup lang="ts">
import { ref, onMounted } from 'vue'
import gsap from 'gsap'
import type { UserRole } from '~/composables/useAuth'

defineProps<{
    sidebarOpen: boolean
}>()

const emit = defineEmits<{
    (e: 'toggle-sidebar'): void
}>()

const { user, logout } = useAuth()
const { t, lang, setLanguage: setLang, currentLanguage } = useI18n()
const { notifications, unreadTotal, isFetching, markAsRead, markAllAsRead, clearRead } = useNotificationBadge()
const { isSubscribed: pushSubscribed, isSupported: pushSupported, isPermissionDenied: pushDenied, isLoading: pushLoading, toggle: togglePush } = usePushNotification()

const showProfileMenu = ref(false)
const showNotifications = ref(false)
const showLangMenu = ref(false)

// SSR-safe: always start false, restore from localStorage after hydration
const isDarkMode = ref(false)

onMounted(() => {
    const stored = localStorage.getItem('theme')
    isDarkMode.value = stored === 'dark'
})

const languages = [
    { code: 'EN', name: 'English' },
    { code: 'TH', name: 'ไทย' },
]

function toggleNotifications() {
    showNotifications.value = !showNotifications.value
    showProfileMenu.value = false
    showLangMenu.value = false
    if (showNotifications.value) {
        nextTick(() => {
            gsap.from('.notification-item', {
                y: -10,
                opacity: 0,
                stagger: 0.05,
                duration: 0.3,
                ease: 'power2.out',
            })
        })
    }
}

function toggleProfile() {
    showProfileMenu.value = !showProfileMenu.value
    showNotifications.value = false
    showLangMenu.value = false
}

function toggleLangMenu() {
    showLangMenu.value = !showLangMenu.value
    showNotifications.value = false
    showProfileMenu.value = false
}

function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
    if (isDarkMode.value) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme', 'dark')
    } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme', 'light')
    }
}

function setLanguage(langCode: 'EN' | 'TH') {
    setLang(langCode)
    showLangMenu.value = false
}

function handleLogout() {
    logout()
    navigateTo('/signin')
}

const notificationTypeIcons: Record<string, string> = {
    announcement: 'fa-solid fa-bullhorn',
    billing: 'fa-solid fa-receipt',
    payment: 'fa-solid fa-credit-card',
    lease: 'fa-solid fa-file-contract',
    maintenance: 'fa-solid fa-wrench',
    message: 'fa-solid fa-envelope',
    conversation: 'fa-solid fa-comments',
    property: 'fa-solid fa-building',
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
    system: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

function formatNotifTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 1) return t.value.justNow ?? 'Just now'
    if (diffMins < 60) return `${diffMins}${t.value.minutesAgo ?? 'm ago'}`
    if (diffHours < 24) return `${diffHours}${t.value.hoursAgo ?? 'h ago'}`
    if (diffDays === 1) return t.value.yesterday ?? 'Yesterday'
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

async function handleNotifClick(n: { id: string; type: string; actionUrl: string | null; relatedDocumentId: string | null }) {
    await markAsRead(n.id)

    const role = user.value?.role ?? 'resident'
    const prefix = role === 'manager' ? '/manager' : '/resident'

    // Build the correct route based on notification type + user role
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
            manager: '/manager/announcements',
            resident: `/resident/dashboard`,
        },
        property: {
            manager: '/manager/properties',
            resident: `/resident/dashboard`,
        },
    }

    const route = routeMap[n.type]?.[role]
    if (route) {
        showNotifications.value = false
        navigateTo(route)
    } else if (n.actionUrl) {
        showNotifications.value = false
        navigateTo(n.actionUrl)
    }
}
</script>

<template>
    <nav class="fixed top-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-40 flex items-center justify-between px-4 shadow-sm transition-all duration-300"
        :class="sidebarOpen ? 'left-64' : 'left-20'">
        <!-- Left side -->
        <div class="flex items-center gap-4">
            <button
                class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                @click="emit('toggle-sidebar')">
                <i class="ti-menu text-gray-600 dark:text-gray-300 text-lg"></i>
            </button>
        </div>

        <!-- Right side -->
        <div class="flex items-center gap-2">
            <ClientOnly>
                <!-- Theme Toggle -->
                <button
                    class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    @click="toggleTheme" :title="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'">
                    <i v-if="isDarkMode" class="ti-shine text-lg !text-black dark:!text-white"></i>
                    <i v-else class="ti-shine text-lg !text-black dark:!text-white"></i>
                </button>

                <!-- Language Switcher -->
                <div class="relative">
                    <button
                        class="flex items-center gap-1.5 px-3 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        @click="toggleLangMenu">
                        <i class="ti-world text-gray-600 dark:text-gray-300 text-sm"></i>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ currentLanguage }}</span>
                        <i class="ti-angle-down text-xs text-gray-400 dark:text-gray-500"></i>
                    </button>
                    <div v-if="showLangMenu"
                        class="absolute right-0 top-12 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2">
                        <button v-for="language in languages" :key="language.code"
                            @click="setLanguage(language.code as 'EN' | 'TH')"
                            class="flex items-center justify-center w-full px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            :class="currentLanguage === language.code ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold' : 'text-gray-600 dark:text-gray-300'">
                            <span class="font-medium">{{ language.name }}</span>
                        </button>
                    </div>
                </div>
            </ClientOnly>

            <!-- Notifications -->
            <button
                class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                @click="toggleNotifications">
                <i class="ti-bell text-gray-600 dark:text-gray-300 text-lg"></i>
                <transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-50"
                    enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200"
                    leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-50">
                    <span v-if="unreadTotal > 0"
                        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {{ unreadTotal > 99 ? '99+' : unreadTotal }}
                    </span>
                </transition>
            </button>

            <!-- Profile -->
            <ClientOnly>
                <div class="relative">
                    <button
                        class="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        @click="toggleProfile">
                        <div
                            class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                            <i class="ti-user text-primary-600 dark:text-primary-400 text-sm"></i>
                        </div>
                        <span class="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">{{ user?.name
                            ||
                            'User' }}</span>
                        <i class="ti-angle-down text-xs text-gray-400 dark:text-gray-500"></i>
                    </button>
                    <div v-if="showProfileMenu"
                        class="absolute right-0 top-12 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2">
                        <!-- Current Role Badge -->
                        <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                            <p class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{{
                                t.currentRole }}</p>
                            <span
                                class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                                :class="user?.role === 'manager'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'">
                                <i :class="user?.role === 'manager' ? 'ti-crown' : 'ti-user'"></i>
                                {{ user?.role === 'manager' ? t.manager : t.resident }}
                            </span>
                        </div>

                        <a
                            class="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                            <i class="ti-user"></i> {{ t.profile }}
                        </a>
                        <a
                            class="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                            <i class="ti-settings"></i> {{ t.settings }}
                        </a>
                        <!-- Push Notification Toggle -->
                        <a v-if="pushSupported" @click.stop="togglePush()"
                            class="flex items-center justify-between px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                            <span class="flex items-center gap-2">
                                <i class="ti-bell"></i> {{ t.pushNotifications }}
                            </span>
                            <span v-if="pushLoading"
                                class="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></span>
                            <span v-else-if="pushDenied" class="text-[10px] text-red-400">●</span>
                            <span v-else class="w-8 h-4 rounded-full relative transition-colors"
                                :class="pushSubscribed ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <span class="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                    :class="pushSubscribed ? 'translate-x-4' : 'translate-x-0.5'"></span>
                            </span>
                        </a>
                        <hr class="my-1 border-gray-100 dark:border-gray-700" />
                        <a @click="handleLogout"
                            class="flex items-center gap-2 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                            <i class="ti-power-off"></i> {{ t.logout }}
                        </a>
                    </div>
                </div>
            </ClientOnly>
        </div>

        <!-- Notifications Sidebar -->
        <Teleport to="body">
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showNotifications" class="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
                    @click="showNotifications = false"></div>
            </Transition>
            <Transition enter-active-class="transition-transform duration-300 ease-out"
                enter-from-class="translate-x-full" enter-to-class="translate-x-0"
                leave-active-class="transition-transform duration-250 ease-in" leave-from-class="translate-x-0"
                leave-to-class="translate-x-full">
                <div v-if="showNotifications"
                    class="fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
                    <!-- Header -->
                    <div
                        class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <i class="ti-bell text-primary-600 dark:text-primary-400 text-xl"></i>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t.notifications }}</h2>
                            <span v-if="unreadTotal > 0"
                                class="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {{ unreadTotal > 99 ? '99+' : unreadTotal }}
                            </span>
                        </div>
                        <button @click="showNotifications = false"
                            class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <i class="ti-close text-gray-500 dark:text-gray-400"></i>
                        </button>
                    </div>

                    <!-- Actions -->
                    <div
                        class="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <button @click="markAllAsRead" :disabled="unreadTotal === 0"
                            class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {{ t.markAllRead }}
                        </button>
                        <button @click="clearRead" :disabled="notifications.filter(n => n.isRead).length === 0"
                            class="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {{ t.clearRead ?? 'Clear read' }}
                        </button>
                    </div>

                    <!-- Notifications List -->
                    <div class="flex-1 overflow-y-auto">
                        <!-- Loading -->
                        <div v-if="isFetching" class="flex items-center justify-center py-12">
                            <div
                                class="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin">
                            </div>
                        </div>

                        <!-- Empty -->
                        <div v-else-if="notifications.length === 0"
                            class="flex flex-col items-center justify-center py-16 px-6 text-center">
                            <div
                                class="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                                <i class="fa-solid fa-bell text-2xl text-gray-300 dark:text-gray-600"></i>
                            </div>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                {{ t.noNotifications ??
                                    'No notifications' }}</p>
                        </div>

                        <!-- Items -->
                        <div v-else>
                            <button v-for="n in notifications" :key="n.id" @click="handleNotifClick(n)"
                                class="notification-item w-full px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors text-left"
                                :class="{ 'bg-primary-50/50 dark:bg-primary-900/10': !n.isRead }">
                                <div class="flex items-start gap-3">
                                    <!-- Icon -->
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        :class="notificationTypeColors[n.type] ?? notificationTypeColors.system">
                                        <i :class="notificationTypeIcons[n.type] ?? 'fa-solid fa-bell'"
                                            class="text-sm"></i>
                                    </div>
                                    <!-- Content -->
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-semibold text-gray-900 dark:text-white leading-snug"
                                            :class="{ 'font-bold': !n.isRead }">
                                            {{ n.title }}
                                        </p>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
                                            {{ n.message }}
                                        </p>
                                        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                            {{ formatNotifTime(n.createdAt) }}
                                        </p>
                                    </div>
                                    <!-- Unread dot -->
                                    <div v-if="!n.isRead"
                                        class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-2">
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </nav>
</template>
