<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'

definePageMeta({
    layout: 'auth',
})

const { login } = useAuth()
const { t, lang, setLanguage: setLang, currentLanguage } = useI18n()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
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

const handleSubmit = async () => {
    if (!email.value || !password.value) {
        return
    }

    isLoading.value = true
    errorMessage.value = ''

    const result = await login(email.value, password.value)

    isLoading.value = false

    if (result.success) {
        // Middleware will handle redirect to dashboard
        await navigateTo('/')
    } else {
        errorMessage.value = t.value.invalidCredentials
    }
}

onMounted(() => {
    nextTick(() => {
        // Animate hero text
        gsap.fromTo('.auth-hero',
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'all' }
        )

        // Animate features
        gsap.fromTo('.auth-feature',
            { x: -20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.6, stagger: 0.15, delay: 0.3, ease: 'power2.out', clearProps: 'all' }
        )

        // Animate form
        gsap.fromTo('.auth-form',
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.7, delay: 0.2, ease: 'power3.out', clearProps: 'all' }
        )
    })
})
</script>

<template>
    <div class="min-h-screen flex">
        <!-- Left Panel — Branding -->
        <div
            class="hidden lg:flex lg:w-1/2 bg-sidebar dark:bg-gray-900 relative overflow-hidden flex-col justify-between p-12">
            <!-- Background pattern -->
            <div class="absolute inset-0 opacity-5">
                <div class="absolute top-20 left-10 w-72 h-72 bg-primary-500 dark:bg-primary-600 rounded-full blur-3xl">
                </div>
                <div
                    class="absolute bottom-20 right-10 w-96 h-96 bg-primary-400 dark:bg-primary-500 rounded-full blur-3xl">
                </div>
            </div>

            <div class="relative z-10">
                <div class="flex items-center gap-3 mb-16">
                    <div
                        class="w-10 h-10 bg-primary-600 dark:bg-primary-700 rounded-xl flex items-center justify-center">
                        <i class="ti-home text-white text-lg"></i>
                    </div>
                    <span class="text-xl font-bold text-white">PropManager</span>
                </div>

                <div class="auth-hero">
                    <h1 class="text-4xl font-bold text-white leading-tight mb-6">
                        {{ lang === 'TH' ? 'จัดการอสังหาฯ' : 'Manage properties' }}<br />{{ lang === 'TH' ?
                            'อย่างมั่นใจ' : 'with confidence' }}
                    </h1>
                    <p class="text-gray-400 dark:text-gray-500 text-lg leading-relaxed max-w-md">
                        {{ lang === 'TH'
                            ? 'ระบบครบวงจรสำหรับจัดการทรัพย์สิน สัญญาเช่า บิล งานซ่อม และการสื่อสารแบบเรียลไทม์'
                            : 'Complete system for properties, leases, billing, maintenance, and real-time communication' }}
                    </p>
                </div>
            </div>

            <div class="relative z-10 space-y-6">
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-primary-600/20 dark:bg-primary-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="ti-home text-primary-400 dark:text-primary-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'จัดการทรัพย์สิน' : 'Property Management' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'ข้อมูลโครงการ ห้อง ราคา สถานะ' : 'Projects, units, pricing, status' }}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-emerald-600/20 dark:bg-emerald-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="ti-receipt text-emerald-400 dark:text-emerald-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'บิลและการชำระเงิน' : 'Billing & Payments' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'ค่าเช่า ค่าน้ำ-ไฟ ตรวจสอบหลักฐาน'
                                : 'Rent, utilities, payment verification' }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-amber-600/20 dark:bg-amber-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="ti-comment-alt text-amber-400 dark:text-amber-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">{{ lang === 'TH' ? 'แชทเรียลไทม์' : 'Real-time Chat'
                            }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">{{ lang === 'TH' ?
                            'สื่อสารระหว่างผู้จัดการและผู้เช่า' : 'Manager & resident communication' }}</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Panel — Sign In Form -->
        <div class="w-full lg:w-1/2 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12 relative">
            <!-- Theme & Language Switchers -->
            <ClientOnly>
                <div class="absolute top-4 right-4 flex items-center gap-2">
                    <!-- Theme Toggle -->
                    <button
                        class="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
                        @click="toggleTheme" :title="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'">
                        <i v-if="isDarkMode" class="ti-shine text-gray-600 dark:text-gray-300 text-lg"></i>
                        <i v-else class="ti-shine text-gray-600 dark:text-gray-300 text-lg"></i>
                    </button>

                    <!-- Language Switcher -->
                    <div class="relative">
                        <button
                            class="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
                            @click="showLangMenu = !showLangMenu">
                            <i class="ti-world text-gray-600 dark:text-gray-300 text-sm"></i>
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ lang }}</span>
                            <i class="ti-angle-down text-xs text-gray-400 dark:text-gray-500"></i>
                        </button>
                        <div v-if="showLangMenu"
                            class="absolute right-0 top-12 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2">
                            <button v-for="language in languages" :key="language.code"
                                @click="setLanguage(language.code as 'EN' | 'TH')"
                                class="flex items-center justify-center w-full px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                :class="lang === language.code ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold' : 'text-gray-600 dark:text-gray-300'">
                                <span class="font-medium">{{ language.name }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </ClientOnly>

            <div class="w-full max-w-md">
                <!-- Mobile brand -->
                <div class="flex items-center gap-2 mb-8 lg:hidden">
                    <div class="w-9 h-9 bg-primary-600 dark:bg-primary-700 rounded-lg flex items-center justify-center">
                        <i class="ti-home text-white text-sm"></i>
                    </div>
                    <span class="text-lg font-bold text-gray-800 dark:text-white">PropManager</span>
                </div>

                <div class="auth-form">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.welcomeBackTitle }}</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm mb-8">{{ t.signInSubtitle }}</p>

                    <!-- Error Message -->
                    <div v-if="errorMessage"
                        class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                        <i class="ti-alert-circle text-red-500 dark:text-red-400 text-sm"></i>
                        <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
                    </div>

                    <form @submit.prevent="handleSubmit" class="space-y-5">
                        <!-- Email -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.emailAddress }}</label>
                            <div class="relative">
                                <i
                                    class="ti-email absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                <input v-model="email" type="email" :placeholder="t.emailPlaceholder"
                                    class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                            </div>
                        </div>

                        <!-- Password -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ t.password
                                }}</label>
                                <a href="#" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">{{
                                    t.forgotPassword }}</a>
                            </div>
                            <div class="relative">
                                <i
                                    class="ti-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                <input v-model="password" :type="showPassword ? 'text' : 'password'"
                                    :placeholder="t.passwordPlaceholder"
                                    class="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                                <button type="button"
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    @click="showPassword = !showPassword">
                                    <i :class="showPassword ? 'ti-eye' : 'ti-eye'" class="text-sm"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Remember me -->
                        <div class="flex items-center gap-2">
                            <input id="remember" v-model="rememberMe" type="checkbox"
                                class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-800" />
                            <label for="remember" class="text-sm text-gray-600 dark:text-gray-400">{{ t.rememberMe
                            }}</label>
                        </div>

                        <!-- Submit -->
                        <button type="submit" :disabled="isLoading || !email || !password"
                            class="w-full py-2.5 bg-primary-600 dark:bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 dark:shadow-primary-700/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i v-if="!isLoading" class="ti-arrow-right text-xs"></i>
                            <i v-else class="ti-reload text-xs animate-spin"></i>
                            {{ isLoading ? t.signingIn : t.signIn }}
                        </button>
                    </form>

                    <!-- Sign up link -->
                    <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
                        {{ t.noAccount }}
                        <NuxtLink to="/signup"
                            class="text-primary-600 dark:text-primary-400 font-medium hover:underline">{{ t.signUp }}
                        </NuxtLink>
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
