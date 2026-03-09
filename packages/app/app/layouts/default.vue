<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const { t } = useI18n()
const sidebarOpen = ref(true)
const router = useRouter()
const route = useRoute()

function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
}

// ─── Global real-time notification tracking ───────────────────────────────────
const { user } = useAuth()
const { onNotification } = useSocket()
const { fetchNotifications, pushNotification } = useNotificationBadge()
const cleanupFns: Array<() => void> = []

// ─── Subscription Check for Managers ──────────────────────────────────────────
const { fetchSubscription, requiresSubscription, isLoading: subscriptionLoading } = useSubscription()
const showSubscriptionModal = ref(false)
const subscriptionChecked = ref(false)

// Pages that are allowed even without subscription
const allowedPagesWithoutSubscription = ['/manager/packages', '/signin', '/signup']

async function checkManagerSubscription() {
    if (!user.value || user.value.role !== 'manager') {
        subscriptionChecked.value = true
        return
    }

    await fetchSubscription(true)
    subscriptionChecked.value = true

    // Check if current route requires subscription
    const currentPath = route.path
    const isAllowedPage = allowedPagesWithoutSubscription.some(p => currentPath.startsWith(p))

    if (requiresSubscription.value && !isAllowedPage) {
        showSubscriptionModal.value = true
    }
}

// Watch for route changes to check subscription on each navigation
watch(() => route.path, (newPath) => {
    if (!subscriptionChecked.value) return
    if (!user.value || user.value.role !== 'manager') return

    const isAllowedPage = allowedPagesWithoutSubscription.some(p => newPath.startsWith(p))

    if (requiresSubscription.value && !isAllowedPage) {
        showSubscriptionModal.value = true
    } else {
        showSubscriptionModal.value = false
    }
})

function goToPackages() {
    showSubscriptionModal.value = false
    router.push('/manager/packages')
}

// ─── Push Notification ────────────────────────────────────────────────────────
const { init: initPush, subscribe: subscribePush, isSupported: pushSupported, isSubscribed: pushSubscribed, isPermissionDenied: pushDenied, isLoading: pushLoading } = usePushNotification()
const showPushBanner = ref(false)

onMounted(async () => {
    // Check manager subscription
    await checkManagerSubscription()

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

        <!-- Subscription Required Modal for Managers -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0"
                enter-to-class="opacity-100" leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="showSubscriptionModal"
                    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Transition enter-active-class="transition-all duration-300 ease-out delay-100"
                        enter-from-class="opacity-0 scale-95 translate-y-4"
                        enter-to-class="opacity-100 scale-100 translate-y-0"
                        leave-active-class="transition-all duration-200 ease-in"
                        leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
                        <div v-if="showSubscriptionModal"
                            class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                            <!-- Modal Header with Icon -->
                            <div class="relative bg-gradient-to-br from-amber-500 to-orange-500 px-6 py-8 text-center">
                                <div class="absolute inset-0 bg-black/10"></div>
                                <div class="relative">
                                    <div
                                        class="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                                        <i class="fa-solid fa-crown text-4xl text-white"></i>
                                    </div>
                                    <h2 class="text-2xl font-bold text-white">{{ t.subscriptionRequiredTitle }}</h2>
                                </div>
                            </div>

                            <!-- Modal Body -->
                            <div class="px-6 py-6">
                                <div
                                    class="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-6">
                                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xl mt-0.5"></i>
                                    <div>
                                        <p class="font-medium text-amber-700 dark:text-amber-400 mb-1">{{
                                            t.noSubscriptionFound }}</p>
                                        <p class="text-sm text-amber-600 dark:text-amber-500">{{
                                            t.subscriptionRequiredDesc }}</p>
                                    </div>
                                </div>

                                <!-- Features Preview -->
                                <div class="space-y-3 mb-6">
                                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                                        <i class="fa-solid fa-check-circle text-emerald-500"></i>
                                        <span>{{ t.properties }}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                                        <i class="fa-solid fa-check-circle text-emerald-500"></i>
                                        <span>{{ t.residents }}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                                        <i class="fa-solid fa-check-circle text-emerald-500"></i>
                                        <span>{{ t.invoices }}</span>
                                    </div>
                                </div>

                                <!-- Action Button -->
                                <button @click="goToPackages"
                                    class="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/30">
                                    <i class="fa-solid fa-arrow-right mr-2"></i>
                                    {{ t.viewPlans }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
