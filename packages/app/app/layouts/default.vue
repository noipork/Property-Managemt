<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const { t } = useI18n()
const sidebarOpen = ref(true)

function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
}

// ─── Global real-time notification tracking ───────────────────────────────────
const { user } = useAuth()
const { onNotification } = useSocket()
const { fetchNotifications, pushNotification } = useNotificationBadge()
const cleanupFns: Array<() => void> = []

// ─── Push Notification ────────────────────────────────────────────────────────
const { init: initPush, subscribe: subscribePush, isSupported: pushSupported, isSubscribed: pushSubscribed, isPermissionDenied: pushDenied, isLoading: pushLoading } = usePushNotification()
const showPushBanner = ref(false)

onMounted(async () => {
    // Initial fetch so the panel has data on first open
    await fetchNotifications()

    // Push real-time notifications as they arrive
    cleanupFns.push(
        onNotification((data) => {
            pushNotification(data)
        })
    )

    // Initialize push notifications
    await initPush()

    // Show the permission banner if push is supported but not yet subscribed and not denied
    if (pushSupported.value && !pushSubscribed.value && !pushDenied.value) {
        // Small delay so the page loads first
        setTimeout(() => {
            showPushBanner.value = true
        }, 2000)
    }
})

onUnmounted(() => {
    cleanupFns.forEach(fn => fn())
    cleanupFns.length = 0
})

async function handleEnablePush() {
    const success = await subscribePush()
    if (success) {
        showPushBanner.value = false
    }
}

function dismissPushBanner() {
    showPushBanner.value = false
    // Remember dismissal for this session
    try { sessionStorage.setItem('push-banner-dismissed', '1') } catch { /* silent */ }
}
</script>

<template>
    <div class="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
        <!-- Push Notification Permission Banner -->
        <Transition enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 -translate-y-full" enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200 ease-in" leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-full">
            <div v-if="showPushBanner"
                class="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-3 shadow-lg">
                <div class="max-w-4xl mx-auto flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <i class="ti-bell text-xl shrink-0 animate-bounce"></i>
                        <p class="text-sm font-medium truncate">
                            {{ t.pushBannerMessage }}
                        </p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button @click="handleEnablePush" :disabled="pushLoading"
                            class="px-4 py-1.5 bg-white text-primary-700 text-sm font-semibold rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50">
                            {{ pushLoading ? '...' : t.pushEnable }}
                        </button>
                        <button @click="dismissPushBanner" class="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <i class="ti-close text-sm"></i>
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

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
