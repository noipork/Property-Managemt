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

const showProfileMenu = ref(false)
const showNotifications = ref(false)
const showLangMenu = ref(false)

// SSR-safe: always start false, restore from localStorage after hydration
const isDarkMode = ref(false)

onMounted(() => {
    const stored = localStorage.getItem('theme')
    isDarkMode.value = stored === 'dark'
})

const notifications = [
    { id: 1, text: 'New tenant application received', time: '5 min ago', read: false },
    { id: 2, text: 'Rent payment received — Unit 4B', time: '1 hour ago', read: false },
    { id: 3, text: 'Maintenance request completed', time: '3 hours ago', read: true },
    { id: 4, text: 'Lease expiring in 30 days — Unit 2A', time: '1 day ago', read: true },
]

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

        <!-- Center search -->
        <div class="hidden md:flex items-center flex-1 max-w-xl mx-8">
            <div class="relative w-full">
                <i class="ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"></i>
                <input type="text" :placeholder="t.searchPlaceholder"
                    class="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
            </div>
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
                <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
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
                        </div>
                        <button @click="showNotifications = false"
                            class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <i class="ti-close text-gray-500 dark:text-gray-400"></i>
                        </button>
                    </div>

                    <!-- Actions -->
                    <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
                        <button
                            class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors">
                            {{ t.markAllRead }}
                        </button>
                    </div>

                    <!-- Notifications List -->
                    <div class="flex-1 overflow-y-auto">
                        <div v-for="n in notifications" :key="n.id"
                            class="notification-item px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors"
                            :class="{ 'bg-primary-50/50 dark:bg-primary-900/20': !n.read }">
                            <div class="flex items-start gap-3">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    :class="!n.read ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-gray-100 dark:bg-gray-800'">
                                    <i class="ti-bell"
                                        :class="!n.read ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white leading-snug">{{ n.text
                                    }}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ n.time }}</p>
                                </div>
                                <div v-if="!n.read" class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-2">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-800">
                        <button
                            class="w-full px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                            {{ t.viewAll || 'View All Notifications' }}
                        </button>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </nav>
</template>
