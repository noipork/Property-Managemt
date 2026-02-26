<script setup lang="ts">
import { ref } from 'vue'
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

// Initialize from localStorage immediately (client-side only)
const isDarkMode = ref(process.client ? localStorage.getItem('theme') === 'dark' : false)

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
            <div class="relative">
                <button
                    class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                    @click="toggleNotifications">
                    <i class="ti-bell text-gray-600 dark:text-gray-300 text-lg"></i>
                    <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
                <div v-if="showNotifications"
                    class="absolute right-0 top-12 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div
                        class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <span class="font-semibold text-gray-800 dark:text-white">{{ t.notifications }}</span>
                        <span class="text-xs text-primary-600 dark:text-primary-400 cursor-pointer hover:underline">{{
                            t.markAllRead }}</span>
                    </div>
                    <div class="max-h-72 overflow-y-auto">
                        <div v-for="n in notifications" :key="n.id"
                            class="notification-item px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-50 dark:border-gray-700 last:border-0"
                            :class="{ 'bg-primary-50/50 dark:bg-primary-900/20': !n.read }">
                            <p class="text-sm text-gray-700 dark:text-gray-300">{{ n.text }}</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ n.time }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Messages -->
            <button
                class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <i class="ti-email text-gray-600 dark:text-gray-300 text-lg"></i>
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
    </nav>
</template>
