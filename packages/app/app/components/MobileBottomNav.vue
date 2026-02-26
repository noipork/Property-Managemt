<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const navItems = computed(() => [
    { name: t.value.dashboard, icon: 'ti-dashboard', path: '/' },
    { name: t.value.payments, icon: 'ti-wallet', path: '/payments' },
    { name: t.value.maintenance, icon: 'ti-headphone-alt', path: '/maintenance' },
    { name: t.value.messages, icon: 'ti-comment', path: '/messages', badge: 8 },
    { name: t.value.settings, icon: 'ti-settings', path: '/settings' },
])

function isActive(path: string) {
    return route.path === path
}
</script>

<template>
    <nav
        class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        <div class="flex items-center justify-around h-16 px-2">
            <NuxtLink v-for="item in navItems" :key="item.path" :to="item.path"
                class="flex flex-col items-center justify-center flex-1 h-full relative transition-colors" :class="isActive(item.path)
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                <div class="relative">
                    <i :class="item.icon" class="text-xl"></i>
                    <span v-if="item.badge"
                        class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                        {{ item.badge > 99 ? '99+' : item.badge }}
                    </span>
                </div>
                <span class="text-[10px] mt-1 font-medium truncate max-w-[60px]">{{ item.name }}</span>
                <!-- Active indicator -->
                <span v-if="isActive(item.path)"
                    class="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-500 dark:bg-primary-400 rounded-full"></span>
            </NuxtLink>
        </div>
    </nav>
</template>

<style scoped>
.safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0);
}
</style>
