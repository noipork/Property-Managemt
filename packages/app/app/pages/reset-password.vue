<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import gsap from 'gsap'

definePageMeta({
    layout: 'auth',
})

const { t, lang, setLanguage: setLang } = useI18n()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl
const route = useRoute()

const code = computed(() => (route.query.code as string) || '')

const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const isSuccess = ref(false)
const showLangMenu = ref(false)

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

const passwordError = computed(() => {
    if (password.value && password.value.length < 8) return t.value.passwordTooShort
    if (confirmPassword.value && password.value !== confirmPassword.value) return t.value.passwordsNotMatch
    return ''
})

async function handleSubmit() {
    if (!code.value) {
        errorMessage.value = t.value.invalidResetLink
        return
    }
    if (passwordError.value || !password.value || !confirmPassword.value) return

    isLoading.value = true
    errorMessage.value = ''

    try {
        const res = await fetch(`${STRAPI_URL}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code.value,
                password: password.value,
                passwordConfirmation: confirmPassword.value,
            }),
        })

        if (!res.ok) {
            const data = await res.json()
            throw new Error(data?.error?.message || 'Failed')
        }

        isSuccess.value = true
    } catch {
        errorMessage.value = t.value.resetPasswordError
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    nextTick(() => {
        gsap.fromTo('.auth-hero',
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'all' }
        )
        gsap.fromTo('.auth-feature',
            { x: -20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.6, stagger: 0.15, delay: 0.3, ease: 'power2.out', clearProps: 'all' }
        )
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
            <div class="absolute inset-0 opacity-5">
                <div class="absolute top-20 left-10 w-72 h-72 bg-primary-500 dark:bg-primary-600 rounded-full blur-3xl">
                </div>
                <div
                    class="absolute bottom-20 right-10 w-96 h-96 bg-primary-400 dark:bg-primary-500 rounded-full blur-3xl">
                </div>
            </div>

            <div class="relative z-10">
                <div class="flex items-center gap-3 mb-16">
                    <img src="/logo.png" alt="PropManager" class="w-10 h-10 rounded-xl object-contain" />
                    <span class="text-xl font-bold text-white">PropManager</span>
                </div>

                <div class="auth-hero">
                    <h1 class="text-4xl font-bold text-white leading-tight mb-6">
                        {{ lang === 'TH' ? 'ตั้งรหัสผ่านใหม่' : 'Set your new' }}<br />{{ lang === 'TH' ? '' :
                            'password' }}
                    </h1>
                    <p class="text-gray-400 dark:text-gray-500 text-lg leading-relaxed max-w-md">
                        {{ lang === 'TH'
                            ? 'กรอกรหัสผ่านใหม่ที่คุณต้องการใช้สำหรับบัญชีของคุณ'
                            : 'Choose a strong password to keep your account secure' }}
                    </p>
                </div>
            </div>

            <div class="relative z-10 space-y-6">
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-primary-600/20 dark:bg-primary-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-lock text-primary-400 dark:text-primary-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'รหัสผ่านที่ปลอดภัย' : 'Strong Password' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'ใช้อย่างน้อย 8 ตัวอักษร'
                                : 'Use at least 8 characters' }}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-emerald-600/20 dark:bg-emerald-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-check-double text-emerald-400 dark:text-emerald-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'ยืนยันรหัสผ่าน' : 'Confirm Password' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'กรอกรหัสผ่านซ้ำเพื่อยืนยัน'
                                : 'Re-enter your password to confirm' }}</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Panel — Form -->
        <div class="w-full lg:w-1/2 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12 relative">
            <!-- Theme & Language Switchers -->
            <ClientOnly>
                <div class="absolute top-4 right-4 flex items-center gap-2">
                    <button
                        class="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
                        @click="toggleTheme">
                        <i v-if="isDarkMode" class="ti-shine text-gray-600 dark:text-gray-300 text-lg"></i>
                        <i v-else class="ti-shine text-gray-600 dark:text-gray-300 text-lg"></i>
                    </button>
                    <div class="relative">
                        <button
                            class="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
                            @click="showLangMenu = !showLangMenu">
                            <i class="ti-world text-gray-600 dark:text-gray-300 text-sm"></i>
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ lang }}</span>
                            <i class="ti-angle-down text-xs text-gray-400 dark:text-gray-500"></i>
                        </button>
                        <div v-if="showLangMenu"
                            class="absolute right-0 top-12 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 z-50">
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
                    <img src="/logo.png" alt="PropManager" class="w-9 h-9 rounded-lg object-contain" />
                    <span class="text-lg font-bold text-gray-800 dark:text-white">PropManager</span>
                </div>

                <div class="auth-form">
                    <!-- ── Invalid/missing code ── -->
                    <template v-if="!code && !isSuccess">
                        <div class="text-center space-y-6">
                            <div
                                class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                                <i class="fa-solid fa-link-slash text-red-500 text-3xl"></i>
                            </div>
                            <div>
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.invalidResetLink
                                }}</h2>
                                <p class="text-gray-500 dark:text-gray-400 text-sm">
                                    {{ lang === 'TH' ? 'ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุ'
                                        : 'The reset link is invalid or has expired' }}
                                </p>
                            </div>
                            <NuxtLink to="/forgot-password"
                                class="w-full py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <i class="fa-solid fa-paper-plane text-xs"></i>
                                {{ t.sendResetLink }}
                            </NuxtLink>
                        </div>
                    </template>

                    <!-- ── Reset Password Form ── -->
                    <template v-else-if="!isSuccess">
                        <div class="mb-8">
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.resetPasswordTitle }}
                            </h2>
                            <p class="text-gray-500 dark:text-gray-400 text-sm">{{ t.resetPasswordSubtitle }}</p>
                        </div>

                        <!-- Error Message -->
                        <div v-if="errorMessage"
                            class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                            <i class="fa-solid fa-circle-exclamation text-red-500 dark:text-red-400 text-sm"></i>
                            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
                        </div>

                        <form @submit.prevent="handleSubmit" class="space-y-5">
                            <!-- New Password -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.newPasswordLabel }}</label>
                                <div class="relative">
                                    <i
                                        class="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                    <input v-model="password" :type="showPassword ? 'text' : 'password'"
                                        :placeholder="t.newPasswordPlaceholder"
                                        class="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                                    <button type="button"
                                        class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                        @click="showPassword = !showPassword">
                                        <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                            class="text-sm"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Confirm Password -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.confirmNewPassword }}</label>
                                <div class="relative">
                                    <i
                                        class="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                    <input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'"
                                        :placeholder="t.confirmNewPasswordPlaceholder"
                                        class="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                                    <button type="button"
                                        class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                        @click="showConfirmPassword = !showConfirmPassword">
                                        <i :class="showConfirmPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                            class="text-sm"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Inline validation -->
                            <Transition enter-active-class="transition-all duration-200"
                                enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0">
                                <p v-if="passwordError"
                                    class="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                                    <i class="fa-solid fa-circle-exclamation"></i> {{ passwordError }}
                                </p>
                            </Transition>

                            <button type="submit"
                                :disabled="isLoading || !!passwordError || !password || !confirmPassword"
                                class="w-full py-2.5 bg-primary-600 dark:bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 dark:shadow-primary-700/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <i v-if="isLoading" class="fa-solid fa-circle-notch text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-key text-xs"></i>
                                {{ isLoading ? t.resettingPassword : t.resetPassword }}
                            </button>
                        </form>
                    </template>

                    <!-- ── Success State ── -->
                    <template v-else>
                        <div class="text-center space-y-6">
                            <div
                                class="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
                                <i class="fa-solid fa-circle-check text-emerald-500 text-3xl"></i>
                            </div>

                            <div>
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{
                                    t.passwordResetSuccess }}</h2>
                                <p class="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                    {{ t.passwordResetSuccessDesc }}
                                </p>
                            </div>

                            <NuxtLink to="/signin"
                                class="w-full py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <i class="fa-solid fa-arrow-right text-xs"></i>
                                {{ t.goToSignIn }}
                            </NuxtLink>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
