<script setup lang="ts">
import { ref, onMounted } from 'vue'

const { t, lang, setLanguage } = useI18n()
const { user, logout } = useAuth()
const router = useRouter()

const isManager = computed(() => user.value?.role !== 'resident')

// Theme
const isDarkMode = ref(false)
onMounted(() => {
    isDarkMode.value = localStorage.getItem('theme') === 'dark'
})

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

// Language
function toggleLang() {
    setLanguage(lang.value === 'EN' ? 'TH' : 'EN')
}

// Logout
function handleLogout() {
    logout()
    navigateTo('/signin')
}

// Menu items
const managerMenuItems = computed(() => [
    { label: t.value.profile, icon: 'fa-solid fa-user', path: '/profile' },
    { label: t.value.properties, icon: 'fa-solid fa-house', path: '/manager/properties' },
    { label: t.value.residents, icon: 'fa-solid fa-users', path: '/manager/residents' },
    { label: t.value.leases, icon: 'fa-solid fa-file-contract', path: '/manager/leases' },
    { label: t.value.invoices, icon: 'fa-solid fa-receipt', path: '/manager/invoices' },
    { label: t.value.payments, icon: 'fa-solid fa-wallet', path: '/manager/payments' },
    { label: t.value.maintenance, icon: 'fa-solid fa-wrench', path: '/manager/maintenance' },
    { label: t.value.announcements, icon: 'fa-solid fa-bullhorn', path: '/manager/announcements' },
    { label: t.value.messages, icon: 'fa-solid fa-comment', path: '/manager/messages' },
    { label: t.value.assets, icon: 'fa-solid fa-puzzle-piece', path: '/manager/assets' },
    { label: t.value.assetRequests, icon: 'fa-solid fa-envelope', path: '/manager/asset-requests' },
    { label: t.value.subscriptions, icon: 'fa-solid fa-credit-card', path: '/manager/subscriptions' },
    { label: t.value.packages, icon: 'fa-solid fa-crown', path: '/manager/packages' },
])

const residentMenuItems = computed(() => [
    { label: t.value.profile, icon: 'fa-solid fa-user', path: '/profile' },
    { label: t.value.myLease, icon: 'fa-solid fa-file-contract', path: '/resident/my-lease' },
    { label: t.value.myBills, icon: 'fa-solid fa-receipt', path: '/resident/my-bills' },
    { label: t.value.paymentHistory, icon: 'fa-solid fa-wallet', path: '/resident/payment-history' },
    { label: t.value.maintenance, icon: 'fa-solid fa-wrench', path: '/resident/maintenance' },
    { label: t.value.messages, icon: 'fa-solid fa-comment', path: '/resident/messages' },
    { label: t.value.assets, icon: 'fa-solid fa-puzzle-piece', path: '/resident/assets' },
])

const menuItems = computed(() => isManager.value ? managerMenuItems.value : residentMenuItems.value)
</script>

<template>
    <div class="max-w-lg mx-auto space-y-6 pb-24 md:pb-0">
        <!-- Header -->
        <div class="animate-fadeUp" style="animation-delay:0ms">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.settings }}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.settingsSubtitle }}</p>
        </div>

        <!-- User card -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4 animate-fadeUp"
            style="animation-delay:40ms">
            <div
                class="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <span class="text-lg font-bold text-primary-600 dark:text-primary-400">
                    {{ (user?.name || user?.email || 'U')[0].toUpperCase() }}
                </span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ user?.name || user?.email }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ user?.email }}</p>
            </div>
            <span class="px-2.5 py-1 text-[10px] font-semibold rounded-full"
                :class="isManager ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'">
                {{ isManager ? t.manager : t.resident }}
            </span>
        </div>

        <!-- Navigation menu -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 animate-fadeUp"
            style="animation-delay:80ms">
            <NuxtLink v-for="item in menuItems" :key="item.path" :to="item.path"
                class="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div
                    class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <i :class="item.icon" class="text-sm text-gray-600 dark:text-gray-400"></i>
                </div>
                <span class="text-sm font-medium text-gray-900 dark:text-white flex-1">{{ item.label }}</span>
                <i class="fa-solid fa-chevron-right text-[10px] text-gray-300 dark:text-gray-600"></i>
            </NuxtLink>
        </div>

        <!-- Preferences -->
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 animate-fadeUp"
            style="animation-delay:120ms">
            <!-- Theme toggle -->
            <button @click="toggleTheme"
                class="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div
                    class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <i :class="isDarkMode ? 'fa-solid fa-moon text-indigo-500' : 'fa-solid fa-sun text-amber-500'"
                        class="text-sm"></i>
                </div>
                <span class="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">{{
                    isDarkMode ? t.switchToLight : t.switchToDark }}</span>
                <div class="relative w-11 h-6 rounded-full transition-colors"
                    :class="isDarkMode ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'">
                    <div class="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                        :class="isDarkMode ? 'translate-x-5' : 'translate-x-0.5'"></div>
                </div>
            </button>

            <!-- Language toggle -->
            <button @click="toggleLang"
                class="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div
                    class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-globe text-sm text-blue-500"></i>
                </div>
                <span class="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">{{ t.language }}</span>
                <span
                    class="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {{ lang === 'EN' ? 'English' : 'ไทย' }}
                </span>
            </button>
        </div>

        <!-- Logout -->
        <div class="animate-fadeUp" style="animation-delay:160ms">
            <button @click="handleLogout"
                class="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors font-medium text-sm">
                <i class="fa-solid fa-right-from-bracket"></i>
                {{ t.logout }}
            </button>
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
</style>
