<script setup lang="ts">
const { t } = useI18n()
const { user } = useAuth()
const route = useRoute()
const { unreadTotal, unreadByType } = useNotificationBadge()

// Manager nav items
const managerNavItems = computed(() => [
    { name: t.value.dashboard, icon: 'fa-solid fa-gauge', path: '/manager/dashboard' },
    { name: t.value.properties, icon: 'fa-solid fa-house', path: '/manager/properties' },
    { name: t.value.messages, icon: 'fa-solid fa-comment', path: '/manager/messages', badge: (unreadByType.value.message ?? 0) + (unreadByType.value.conversation ?? 0) },
    { name: t.value.notifications, icon: 'fa-solid fa-bell', path: '/notifications', badge: unreadTotal.value },
    { name: t.value.settings, icon: 'fa-solid fa-gear', path: '/settings' },
])

// Resident nav items
const residentNavItems = computed(() => [
    { name: t.value.dashboard, icon: 'fa-solid fa-gauge', path: '/resident/dashboard' },
    { name: t.value.messages, icon: 'fa-solid fa-comment', path: '/resident/messages', badge: (unreadByType.value.message ?? 0) + (unreadByType.value.conversation ?? 0) },
    { name: t.value.notifications, icon: 'fa-solid fa-bell', path: '/notifications', badge: unreadTotal.value },
    { name: t.value.settings, icon: 'fa-solid fa-gear', path: '/settings' },
])

// Use appropriate nav based on user role
const navItems = computed(() => {
    return user.value?.role === 'resident' ? residentNavItems.value : managerNavItems.value
})

function isActive(path: string) {
    return route.path === path || route.path.startsWith(path + '/')
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
                    <transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 scale-50"
                        enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-50">
                        <span v-if="item.badge && item.badge > 0"
                            class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                            {{ item.badge > 99 ? '99+' : item.badge }}
                        </span>
                    </transition>
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
