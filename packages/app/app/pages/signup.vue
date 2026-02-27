<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'

definePageMeta({
    layout: 'auth',
})

const { register } = useAuth()
const { t, lang, setLanguage: setLang } = useI18n()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const agreeTerms = ref(false)
const selectedPlan = ref('starter')
const isLoading = ref(false)
const errorMessage = ref('')
const showLangMenu = ref(false)

// Initialize from localStorage immediately (client-side only)
const isDarkMode = ref(process.client ? localStorage.getItem('theme') === 'dark' : false)

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

const planIcons: Record<string, string> = {
    starter: 'ti-home',
    professional: 'ti-crown',
    enterprise: 'ti-briefcase',
}

const config = useRuntimeConfig()

interface StrapiPlan {
    id: number
    documentId: string
    name: string
    slug: string
    price: number
    currency: string
    maxProperties: number
    maxUnitsPerProperty: number
    features: string[]
    isActive: boolean
    sortOrder: number
}

const plans = ref<StrapiPlan[]>([])
const plansLoading = ref(true)
const plansError = ref(false)

async function fetchPlans() {
    try {
        plansLoading.value = true
        plansError.value = false
        const res = await fetch(
            `${config.public.strapiUrl}/api/plans?sort=sortOrder:asc&filters[isActive][$eq]=true`
        )
        if (!res.ok) throw new Error('Failed to fetch plans')
        const json = await res.json()
        plans.value = json.data ?? []
        // default select first plan
        if (plans.value.length > 0 && !plans.value.find(p => p.slug === selectedPlan.value)) {
            selectedPlan.value = plans.value[0].slug
        }
    } catch (e) {
        plansError.value = true
    } finally {
        plansLoading.value = false
    }
}

const handleSubmit = async () => {
    if (!fullName.value || !email.value || !password.value || !agreeTerms.value) {
        return
    }

    if (password.value !== confirmPassword.value) {
        errorMessage.value = t.value.passwordsNotMatch
        return
    }

    if (password.value.length < 8) {
        errorMessage.value = t.value.passwordTooShort
        return
    }

    isLoading.value = true
    errorMessage.value = ''

    const selectedPlanData = plans.value.find(p => p.slug === selectedPlan.value)
    const result = await register(
        fullName.value,
        email.value,
        password.value,
        selectedPlanData
            ? { id: selectedPlanData.id, documentId: selectedPlanData.documentId }
            : undefined
    )

    isLoading.value = false

    if (result.success) {
        // Middleware will handle redirect to dashboard
        await navigateTo('/')
    } else {
        errorMessage.value = t.value.registrationFailed
    }
}

onMounted(() => {
    fetchPlans()
    nextTick(() => {
        // Animate hero text
        gsap.fromTo('.auth-hero',
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'all' }
        )

        // Animate stats
        gsap.fromTo('.auth-stats > div',
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, delay: 0.3, ease: 'power2.out', clearProps: 'all' }
        )

        // Animate testimonial
        gsap.fromTo('.auth-testimonial',
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.7, delay: 0.6, ease: 'power2.out', clearProps: 'all' }
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
                <div
                    class="absolute top-20 right-20 w-80 h-80 bg-emerald-500 dark:bg-emerald-600 rounded-full blur-3xl">
                </div>
                <div
                    class="absolute bottom-32 left-10 w-72 h-72 bg-primary-400 dark:bg-primary-500 rounded-full blur-3xl">
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
                        Start managing<br />smarter today
                    </h1>
                    <p class="text-gray-400 dark:text-gray-500 text-lg leading-relaxed max-w-md">
                        Join thousands of property managers who trust PropManager to streamline their operations.
                    </p>
                </div>
            </div>

            <div class="relative z-10">
                <!-- Stats -->
                <div class="grid grid-cols-3 gap-6 auth-stats">
                    <div>
                        <p class="text-2xl font-bold text-white">10K+</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">Active Users</p>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-white">50K+</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">Properties</p>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-white">99.9%</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">Uptime</p>
                    </div>
                </div>

                <!-- Testimonial -->
                <div
                    class="mt-8 p-5 bg-white/5 dark:bg-white/[0.03] rounded-xl border border-white/10 dark:border-white/5 auth-testimonial">
                    <p class="text-sm text-gray-300 dark:text-gray-400 leading-relaxed italic">
                        "PropManager cut our admin time in half. The dashboard gives us instant visibility into every
                        property."
                    </p>
                    <div class="flex items-center gap-3 mt-4">
                        <div
                            class="w-8 h-8 bg-primary-600/30 dark:bg-primary-700/30 rounded-full flex items-center justify-center">
                            <i class="ti-user text-primary-400 dark:text-primary-500 text-xs"></i>
                        </div>
                        <div>
                            <p class="text-sm text-white font-medium">Sarah Mitchell</p>
                            <p class="text-xs text-gray-500 dark:text-gray-600">Managing 120+ units</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Panel — Sign Up Form -->
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
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">{{ t.getStarted }}</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm mb-8">{{ t.signUpSubtitle }}</p>

                    <!-- Error Message -->
                    <div v-if="errorMessage"
                        class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                        <i class="ti-alert-circle text-red-500 dark:text-red-400 text-sm"></i>
                        <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
                    </div>

                    <form @submit.prevent="handleSubmit" class="space-y-5">
                        <!-- Full Name -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.fullName }}</label>
                            <div class="relative">
                                <i
                                    class="ti-user absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                <input v-model="fullName" type="text" :placeholder="t.fullNamePlaceholder"
                                    class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                            </div>
                        </div>

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
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.password }}</label>
                            <div class="relative">
                                <i
                                    class="ti-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                <input v-model="password" :type="showPassword ? 'text' : 'password'"
                                    :placeholder="t.passwordPlaceholder"
                                    class="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all" />
                                <button type="button"
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    @click="showPassword = !showPassword">
                                    <i class="ti-eye text-sm"></i>
                                </button>
                            </div>
                            <!-- Password strength hints -->
                            <div class="flex gap-1 mt-2">
                                <div class="h-1 flex-1 rounded-full"
                                    :class="password.length >= 1 ? 'bg-red-400 dark:bg-red-500' : 'bg-gray-200 dark:bg-gray-700'">
                                </div>
                                <div class="h-1 flex-1 rounded-full"
                                    :class="password.length >= 4 ? 'bg-amber-400 dark:bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'">
                                </div>
                                <div class="h-1 flex-1 rounded-full"
                                    :class="password.length >= 8 ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'">
                                </div>
                                <div class="h-1 flex-1 rounded-full"
                                    :class="password.length >= 12 ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'">
                                </div>
                            </div>
                        </div>

                        <!-- Confirm Password -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.confirmPassword }}</label>
                            <div class="relative">
                                <i
                                    class="ti-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm"></i>
                                <input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'"
                                    :placeholder="t.confirmPasswordPlaceholder"
                                    class="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                    :class="confirmPassword && confirmPassword !== password ? 'border-red-300 dark:border-red-700 focus:ring-red-500' : ''" />
                                <button type="button"
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    @click="showConfirmPassword = !showConfirmPassword">
                                    <i class="ti-eye text-sm"></i>
                                </button>
                            </div>
                            <p v-if="confirmPassword && confirmPassword !== password"
                                class="text-xs text-red-500 dark:text-red-400 mt-1">
                                {{ t.passwordsNotMatch }}
                            </p>
                        </div>

                        <!-- Plan Picker -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{
                                t.choosePlan }}</label>

                            <!-- Loading skeleton -->
                            <div v-if="plansLoading" class="grid grid-cols-3 gap-2">
                                <div v-for="i in 3" :key="i"
                                    class="h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse">
                                </div>
                            </div>

                            <!-- Error -->
                            <div v-else-if="plansError"
                                class="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 text-center">
                                Failed to load plans. <button type="button" class="underline"
                                    @click="fetchPlans">Retry</button>
                            </div>

                            <!-- Plans -->
                            <div v-else class="grid grid-cols-3 gap-2">
                                <button v-for="plan in plans" :key="plan.id" type="button"
                                    class="relative p-3 rounded-lg border text-center transition-all"
                                    :class="selectedPlan === plan.slug
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500'
                                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'"
                                    @click="selectedPlan = plan.slug">
                                    <i :class="[planIcons[plan.slug] ?? 'ti-tag', selectedPlan === plan.slug ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500']"
                                        class="text-lg block mb-1"></i>
                                    <p class="text-xs font-semibold"
                                        :class="selectedPlan === plan.slug ? 'text-primary-700 dark:text-primary-400' : 'text-gray-800 dark:text-gray-200'">
                                        {{ plan.name }}
                                    </p>
                                    <p class="text-[10px] mt-0.5"
                                        :class="selectedPlan === plan.slug ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'">
                                        {{ plan.price.toLocaleString() }} {{ plan.currency }}
                                    </p>
                                </button>
                            </div>
                        </div>

                        <!-- Terms -->
                        <div class="flex items-start gap-2">
                            <input id="terms" v-model="agreeTerms" type="checkbox"
                                class="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-800" />
                            <label for="terms" class="text-sm text-gray-600 dark:text-gray-400">
                                {{ t.agreeToTerms }}
                                <a href="#" class="text-primary-600 dark:text-primary-400 hover:underline">{{
                                    t.termsOfService }}</a>
                                {{ t.and }}
                                <a href="#" class="text-primary-600 dark:text-primary-400 hover:underline">{{
                                    t.privacyPolicy }}</a>
                            </label>
                        </div>

                        <!-- Submit -->
                        <button type="submit"
                            :disabled="isLoading || !fullName || !email || !password || !agreeTerms || password !== confirmPassword || password.length < 8 || plansLoading || plansError || !selectedPlan"
                            class="w-full py-2.5 bg-primary-600 dark:bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors shadow-sm shadow-primary-600/20 dark:shadow-primary-700/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i v-if="!isLoading" class="ti-plus text-xs"></i>
                            <i v-else class="ti-reload text-xs animate-spin"></i>
                            {{ isLoading ? t.creatingAccount : t.createAccount }}
                        </button>
                    </form>

                    <!-- Divider -->
                    <div class="flex items-center gap-3 my-6">
                        <hr class="flex-1 border-gray-200 dark:border-gray-700" />
                        <span class="text-xs text-gray-400 dark:text-gray-500">{{ t.orContinueWith }}</span>
                        <hr class="flex-1 border-gray-200 dark:border-gray-700" />
                    </div>

                    <!-- Social signup -->
                    <div class="grid grid-cols-2 gap-3">
                        <button
                            class="flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <i class="ti-google text-red-500"></i>
                            Google
                        </button>
                        <button
                            class="flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <i class="ti-microsoft text-blue-500"></i>
                            Microsoft
                        </button>
                    </div>

                    <!-- Sign in link -->
                    <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
                        {{ t.alreadyHaveAccount }}
                        <NuxtLink to="/signin"
                            class="text-primary-600 dark:text-primary-400 font-medium hover:underline">{{ t.signIn }}
                        </NuxtLink>
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
