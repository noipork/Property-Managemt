<script setup lang="ts">
import { ref } from 'vue'

const sidebarOpen = ref(true)

function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
}
</script>

<template>
    <div class="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
        <!-- Desktop: Show navbar and sidebar -->
        <div class="hidden md:block">
            <AppNavbar :sidebar-open="sidebarOpen" @toggle-sidebar="toggleSidebar" />
            <AppSidebar :open="sidebarOpen" />
        </div>

        <!-- Mobile: Show bottom navigation -->
        <MobileBottomNav />

        <!-- Main content -->
        <main class="transition-all duration-300 
                   md:pt-16 
                   pb-20 md:pb-12" :class="{ 'md:ml-64': sidebarOpen, 'md:ml-20': !sidebarOpen }">
            <div class="p-4 md:p-6">
                <slot />
            </div>
        </main>

        <!-- Footer (desktop only, matches navbar positioning) -->
        <div class="hidden md:block">
            <AppFooter :sidebar-open="sidebarOpen" />
        </div>
    </div>
</template>
