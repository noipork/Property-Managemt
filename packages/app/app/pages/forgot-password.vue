<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'

definePageMeta({
    layout: 'auth',
})

const { t, lang, setLanguage: setLang } = useI18n()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

const email = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const isSent = ref(false)
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

async function handleSubmit() {
    if (!email.value) return
    isLoading.value = true
    errorMessage.value = ''

    try {
        const res = await fetch(`${STRAPI_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.value }),
        })

        if (!res.ok) {
            const data = await res.json()
            throw new Error(data?.error?.message || 'Failed')
        }

        isSent.value = true
    } catch {
        errorMessage.value = t.value.forgotPasswordError
    } finally {
        isLoading.value = false
    }
}

function resetForm() {
    isSent.value = false
    email.value = ''
    errorMessage.value = ''
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
                        {{ lang === 'TH' ? 'รีเซ็ตรหัสผ่าน' : 'Reset your' }}<br />{{ lang === 'TH' ?
                            'ของคุณ' : 'password' }}
                    </h1>
                    <p class="text-gray-400 dark:text-gray-500 text-lg leading-relaxed max-w-md">
                        {{ lang === 'TH'
                            ? 'กรอกอีเมลของคุณ แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่'
                            : 'Enter your email and we\'ll send you a link to set a new password' }}
                    </p>
                </div>
            </div>

            <div class="relative z-10 space-y-6">
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-primary-600/20 dark:bg-primary-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-shield-halved text-primary-400 dark:text-primary-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'ปลอดภัย' : 'Secure' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'ลิงก์รีเซ็ตจะหมดอายุภายใน 1 ชั่วโมง'
                                : 'Reset link expires in 1 hour' }}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-4 auth-feature">
                    <div
                        class="w-10 h-10 bg-emerald-600/20 dark:bg-emerald-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-envelope text-emerald-400 dark:text-emerald-500"></i>
                    </div>
                    <div>
                        <p class="text-white text-sm font-medium">
                            {{ lang === 'TH' ? 'ตรวจสอบอีเมล' : 'Check your email' }}</p>
                        <p class="text-gray-500 dark:text-gray-600 text-xs">
                            {{ lang === 'TH' ? 'เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ'
                                : 'We\'ll send a password reset link' }}</p>
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
                    <!-- ── Send Reset Link Form ── -->
                    <template v-if="!isSent">
                        <div class="mb-8">
                            <NuxtLink to="/signin"
                                class="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mb-6">
                                <i class="fa-solid fa-arrow-left text-xs"></i>
                                {{ t.backToSignIn }}
                            </NuxtLink>
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.forgotPasswordTitle
                            }}</h2>
                            <p class="text-gray-500 dark:text-gray-400 text-sm">{{ t.forgotPasswordSubtitle }}</p>
                        </div>

                        <!-- Error Message -->
                        <div v-if="errorMessage"
                            class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                            <i class="fa-solid fa-circle-exclamation text-red-500 dark:text-red-400 text-sm"></i>
                            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
                        </div>

                        <form @submit.prevent="handleSubmit" class="space-y-5">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                    t.emailAddress }}</label>
                                <div class="relative">
                                    <i
                                        class="fa-solid fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                    <input v-model="email" type="email" :placeholder="t.emailPlaceholder" required
                                        class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                                </div>
                            </div>

                            <button type="submit" :disabled="isLoading || !email"
                                class="w-full py-2.5 bg-primary-600 dark:bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 dark:shadow-primary-700/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <i v-if="isLoading" class="fa-solid fa-circle-notch text-xs animate-spin"></i>
                                <i v-else class="fa-solid fa-paper-plane text-xs"></i>
                                {{ isLoading ? t.sendingResetLink : t.sendResetLink }}
                            </button>
                        </form>

                        <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
                            {{ t.noAccount }}
                            <NuxtLink to="/signup"
                                class="text-primary-600 dark:text-primary-400 font-medium hover:underline">{{ t.signUp
                                }}</NuxtLink>
                        </p>
                    </template>

                    <!-- ── Success State ── -->
                    <template v-else>
                        <div class="text-center space-y-6">
                            <div
                                class="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
                                <i class="fa-solid fa-envelope-circle-check text-emerald-500 text-3xl"></i>
                            </div>

                            <div>
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.resetLinkSent }}
                                </h2>
                                <p class="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                    {{ t.resetLinkSentDesc }}
                                </p>
                            </div>

                            <div
                                class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <i class="fa-solid fa-at text-gray-400 text-sm"></i>
                                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ email }}</p>
                            </div>

                            <div class="space-y-3">
                                <button @click="resetForm"
                                    class="w-full py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                    <i class="fa-solid fa-rotate-left mr-1.5"></i>
                                    {{ t.tryAnotherEmail }}
                                </button>
                                <NuxtLink to="/signin"
                                    class="w-full py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                                    <i class="fa-solid fa-arrow-left text-xs"></i>
                                    {{ t.backToSignIn }}
                                </NuxtLink>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
