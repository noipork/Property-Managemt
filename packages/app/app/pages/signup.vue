<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import gsap from "gsap";

definePageMeta({
    layout: "auth",
});

const { register } = useAuth();
const { t, lang, setLanguage: setLang } = useI18n();
const config = useRuntimeConfig();
const STRAPI_URL = config.public.strapiUrl;

const fullName = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const agreeTerms = ref(false);
const selectedPlanSlug = ref("");
const selectedDuration = ref(1); // Default 1 month
const isLoading = ref(false);
const errorMessage = ref("");
const showLangMenu = ref(false);

// SSR-safe: always start false, restore from localStorage after hydration
const isDarkMode = ref(false);

onMounted(() => {
    const stored = localStorage.getItem("theme");
    isDarkMode.value = stored === "dark";
});

const languages = [
    { code: "EN", name: "English" },
    { code: "TH", name: "ไทย" },
];

function toggleTheme() {
    isDarkMode.value = !isDarkMode.value;
    if (isDarkMode.value) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
    } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
    }
}

function setLanguage(langCode: "EN" | "TH") {
    setLang(langCode);
    showLangMenu.value = false;
}

// Plan tier icons based on sortOrder
const planTierIcons: Record<number, string> = {
    1: "fa-solid fa-leaf",
    2: "fa-solid fa-rocket",
    3: "fa-solid fa-crown",
};

// Plan tier colors based on sortOrder
const planTierColors: Record<
    number,
    { border: string; bg: string; text: string; icon: string }
> = {
    1: {
        border: "border-blue-500",
        bg: "bg-blue-50 dark:bg-blue-900/20",
        text: "text-blue-600 dark:text-blue-400",
        icon: "text-blue-500",
    },
    2: {
        border: "border-purple-500",
        bg: "bg-purple-50 dark:bg-purple-900/20",
        text: "text-purple-600 dark:text-purple-400",
        icon: "text-purple-500",
    },
    3: {
        border: "border-amber-500",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        text: "text-amber-600 dark:text-amber-400",
        icon: "text-amber-500",
    },
};

const defaultTierStyle = {
    border: "border-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-600 dark:text-blue-400",
    icon: "text-blue-500",
};

function getPlanTierStyle(sortOrder: number): {
    border: string;
    bg: string;
    text: string;
    icon: string;
} {
    return planTierColors[sortOrder] ?? defaultTierStyle;
}

function getPlanIcon(sortOrder: number): string {
    return planTierIcons[sortOrder] ?? "fa-solid fa-box";
}

interface StrapiPlan {
    id: number;
    documentId: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    maxProperties: number;
    maxUnitsPerProperty: number;
    features: string[];
    isActive: boolean;
    sortOrder?: number;
}

// Helper to safely get sortOrder
function getSortOrder(plan: StrapiPlan): number {
    return plan.sortOrder ?? 1;
}

const plans = ref<StrapiPlan[]>([]);
const plansLoading = ref(true);
const plansError = ref(false);

// Duration options with discounts
interface DurationOption {
    months: number;
    label: string;
    discount: number;
}

const durationOptions: DurationOption[] = [
    { months: 1, label: "1month", discount: 0 },
    { months: 3, label: "3months", discount: 10 },
    { months: 6, label: "6months", discount: 15 },
    { months: 12, label: "1year", discount: 20 },
];

function getDurationLabel(months: number): string {
    const labels: Record<number, { en: string; th: string }> = {
        1: { en: "1 Month", th: "1 เดือน" },
        3: { en: "3 Months", th: "3 เดือน" },
        6: { en: "6 Months", th: "6 เดือน" },
        12: { en: "1 Year", th: "1 ปี" },
    };
    const label = labels[months];
    return lang.value === "TH"
        ? label?.th || `${months} Months`
        : label?.en || `${months} Months`;
}

function getDiscount(months: number): number {
    const option = durationOptions.find((d) => d.months === months);
    return option?.discount || 0;
}

function getDiscountedPrice(basePrice: number, months: number): number {
    const discount = getDiscount(months);
    const totalPrice = basePrice * months;
    const discountAmount = totalPrice * (discount / 100);
    return Math.round(totalPrice - discountAmount);
}

function formatPrice(price: number, currency: string) {
    return new Intl.NumberFormat(lang.value === "TH" ? "th-TH" : "en-US", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price);
}

const selectedPlan = computed(() => {
    return plans.value.find((p) => p.slug === selectedPlanSlug.value) || null;
});

const totalPrice = computed(() => {
    if (!selectedPlan.value) return 0;
    return getDiscountedPrice(selectedPlan.value.price, selectedDuration.value);
});

const isFreeplan = computed(() => {
    return selectedPlan.value?.price === 0;
});

async function fetchPlans() {
    try {
        plansLoading.value = true;
        plansError.value = false;
        const res = await fetch(
            `${STRAPI_URL}/api/plans?sort=sortOrder:asc&filters[isActive][$eq]=true`,
        );
        if (!res.ok) throw new Error("Failed to fetch plans");
        const json = await res.json();
        plans.value = json.data ?? [];
        // default select first plan
        if (plans.value.length > 0 && plans.value[0]) {
            selectedPlanSlug.value = plans.value[0].slug;
        }
    } catch (e) {
        plansError.value = true;
    } finally {
        plansLoading.value = false;
    }
}

// Stripe checkout for paid plans
const STRIPE_PUBLISHABLE_KEY = config.public.stripePublishableKey;

let stripePromise: Promise<any> | null = null;

function loadStripe(): Promise<any> {
    if (stripePromise) return stripePromise;

    stripePromise = new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("Stripe can only be loaded in browser"));
            return;
        }

        if ((window as any).Stripe) {
            resolve((window as any).Stripe(STRIPE_PUBLISHABLE_KEY));
            return;
        }

        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.async = true;
        script.onload = () => {
            if ((window as any).Stripe) {
                resolve((window as any).Stripe(STRIPE_PUBLISHABLE_KEY));
            } else {
                reject(new Error("Stripe.js failed to load"));
            }
        };
        script.onerror = () => reject(new Error("Failed to load Stripe.js"));
        document.head.appendChild(script);
    });

    return stripePromise;
}

const handleSubmit = async () => {
    if (
        !fullName.value ||
        !email.value ||
        !password.value ||
        !agreeTerms.value ||
        !selectedPlan.value
    ) {
        return;
    }

    if (password.value !== confirmPassword.value) {
        errorMessage.value = t.value.passwordsNotMatch;
        return;
    }

    if (password.value.length < 8) {
        errorMessage.value = t.value.passwordTooShort;
        return;
    }

    isLoading.value = true;
    errorMessage.value = "";

    try {
        // For free plans, register directly
        if (isFreeplan.value) {
            const result = await register(
                fullName.value,
                email.value,
                password.value,
                {
                    id: selectedPlan.value.id,
                    documentId: selectedPlan.value.documentId,
                    price: 0,
                    currency: selectedPlan.value.currency,
                },
            );

            if (result.success) {
                await navigateTo("/");
            } else {
                errorMessage.value = t.value.registrationFailed;
            }
        } else {
            // For paid plans, create checkout session with pending registration
            const res = await fetch(
                `${STRAPI_URL}/api/subscriptions/signup-checkout`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        fullName: fullName.value,
                        email: email.value,
                        password: password.value,
                        planId: selectedPlan.value.documentId,
                        durationMonths: selectedDuration.value,
                    }),
                },
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(
                    data.error?.message || "Failed to create checkout session",
                );
            }

            // Redirect to Stripe Checkout
            if (data.sessionUrl) {
                window.location.href = data.sessionUrl;
            } else if (data.sessionId) {
                const stripe = await loadStripe();
                const { error } = await stripe.redirectToCheckout({
                    sessionId: data.sessionId,
                });
                if (error) {
                    throw new Error(error.message);
                }
            }
        }
    } catch (err: any) {
        errorMessage.value = err.message || t.value.registrationFailed;
    } finally {
        isLoading.value = false;
    }
};

// Handle payment success/cancelled query params
const route = useRoute();
const paymentSuccess = ref(false);
const paymentCancelled = ref(false);

async function handlePaymentReturn() {
    const { success, cancelled, session_id } = route.query;

    if (success === "true" && session_id) {
        paymentSuccess.value = true;
        isLoading.value = true;
        errorMessage.value = "";

        try {
            // Complete signup after payment
            const res = await fetch(
                `${STRAPI_URL}/api/subscriptions/complete-signup?session_id=${session_id}`,
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to complete signup");
            }

            if (data.success && data.jwt) {
                // Map the role from Strapi format to our format
                const roleType = typeof data.user?.role === 'object'
                    ? data.user.role.type
                    : 'manager';
                const mappedRole = roleType === 'resident' ? 'resident' : 'manager';

                // Store using the same keys that useAuth reads
                const userData = {
                    id: data.user.id,
                    documentId: data.user.documentId,
                    name: data.user.username || data.user.email?.split('@')[0],
                    email: data.user.email,
                    role: mappedRole,
                    property: null,
                };

                localStorage.setItem("authToken", data.jwt);
                localStorage.setItem("authUser", JSON.stringify(userData));

                // Redirect to dashboard after a short delay
                setTimeout(() => {
                    window.location.href = "/manager/dashboard";
                }, 2000);
            }
        } catch (err: any) {
            errorMessage.value = err.message;
            paymentSuccess.value = false;
        } finally {
            isLoading.value = false;
        }
    } else if (cancelled === "true") {
        paymentCancelled.value = true;
        // Clear the query params
        navigateTo("/signup", { replace: true });
    }
}

onMounted(() => {
    fetchPlans();

    // Handle payment return from Stripe
    handlePaymentReturn();

    nextTick(() => {
        // Animate hero text
        gsap.fromTo(
            ".auth-hero",
            { y: 30, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                ease: "power3.out",
                clearProps: "all",
            },
        );

        // Animate stats
        gsap.fromTo(
            ".auth-stats > div",
            { y: 20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.6,
                stagger: 0.1,
                delay: 0.3,
                ease: "power2.out",
                clearProps: "all",
            },
        );

        // Animate testimonial
        gsap.fromTo(
            ".auth-testimonial",
            { y: 20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.7,
                delay: 0.6,
                ease: "power2.out",
                clearProps: "all",
            },
        );

        // Animate form
        gsap.fromTo(
            ".auth-form",
            { y: 20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.7,
                delay: 0.2,
                ease: "power3.out",
                clearProps: "all",
            },
        );
    });
});
</script>

<template>
    <!-- Payment Success Overlay -->
    <div v-if="paymentSuccess" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
            <div
                class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fa-solid fa-check text-2xl text-emerald-500"></i>
            </div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {{ t.paymentSuccess }}
            </h2>
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-4">
                {{ t.paymentSuccessDesc }}
            </p>
            <div class="flex items-center justify-center gap-2 text-sm text-primary-600 dark:text-primary-400">
                <i class="ti-reload animate-spin"></i>
                <span>Redirecting to dashboard...</span>
            </div>
        </div>
    </div>

    <!-- Payment Cancelled Notice -->
    <div v-if="paymentCancelled && !paymentSuccess"
        class="fixed top-4 right-4 z-50 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4 max-w-sm shadow-lg">
        <div class="flex items-start gap-3">
            <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
            <div>
                <h4 class="font-medium text-amber-800 dark:text-amber-200">
                    {{ t.paymentCancelled }}
                </h4>
                <p class="text-sm text-amber-600 dark:text-amber-300 mt-1">
                    {{ t.paymentCancelledDesc }}
                </p>
            </div>
            <button @click="paymentCancelled = false"
                class="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200">
                <i class="ti-x"></i>
            </button>
        </div>
    </div>

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
                    <img src="/logo.png" alt="PropManager" class="w-10 h-10 rounded-xl object-contain" />
                    <span class="text-xl font-bold text-white">PropManager</span>
                </div>

                <div class="auth-hero">
                    <h1 class="text-4xl font-bold text-white leading-tight mb-6">
                        {{ lang === "TH" ? "เริ่มต้นจัดการ" : "Start managing" }}<br />
                        {{ lang === "TH" ? "อสังหาฯ วันนี้" : "smarter today" }}
                    </h1>
                    <p class="text-gray-400 dark:text-gray-500 text-lg leading-relaxed max-w-md">
                        {{
                            lang === "TH"
                                ? "ระบบจัดการอสังหาริมทรัพย์แบบครบวงจร เหมาะสำหรับอพาร์ตเมนต์ คอนโด หอพัก และบ้านเช่า"
                                : "Complete property management for apartments, condos, dormitories, and rental houses"
                        }}
                    </p>
                </div>
            </div>

            <div class="relative z-10">
                <!-- Stats -->
                <div class="grid grid-cols-3 gap-6 auth-stats">
                    <div>
                        <p class="text-2xl font-bold text-white">2</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">
                            {{ lang === "TH" ? "บทบาทผู้ใช้" : "User Roles" }}
                        </p>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-white">15+</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">
                            {{ lang === "TH" ? "โมดูลระบบ" : "Modules" }}
                        </p>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-white">2</p>
                        <p class="text-xs text-gray-500 dark:text-gray-600 mt-1">
                            {{ lang === "TH" ? "ภาษา" : "Languages" }}
                        </p>
                    </div>
                </div>

                <!-- Features -->
                <div
                    class="mt-8 p-5 bg-white/5 dark:bg-white/[0.03] rounded-xl border border-white/10 dark:border-white/5 auth-testimonial">
                    <p class="text-sm text-gray-300 dark:text-gray-400 leading-relaxed">
                        <span class="font-medium text-white">{{
                            lang === "TH" ? "ฟีเจอร์ครบครัน:" : "Full Features:"
                            }}</span>
                        {{
                            lang === 'TH'
                                ? `แดชบอร์ด, จัดการทรัพย์สิน, สัญญาเช่า, บิล/ชำระเงิน, งานซ่อมบำรุง, แชทเรียลไทม์,
                        ประกาศข่าวสาร, Push Notification`
                                : ` Dashboard, Properties, Leases, Billing/Payments, Maintenance, Real-time Chat, Announcements,
                        Push Notifications` }}
                    </p>
                    <div class="flex items-center gap-3 mt-4">
                        <div
                            class="w-8 h-8 bg-emerald-600/30 dark:bg-emerald-700/30 rounded-full flex items-center justify-center">
                            <i class="ti-check text-emerald-400 dark:text-emerald-500 text-xs"></i>
                        </div>
                        <div>
                            <p class="text-sm text-white font-medium">
                                {{ lang === "TH" ? "รองรับ Dark Mode" : "Dark Mode Support" }}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-600">
                                {{
                                    lang === "TH"
                                        ? "UI ทันสมัย ใช้งานง่าย"
                                        : "Modern UI, Easy to use"
                                }}
                            </p>
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
                                :class="lang === language.code
                                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold'
                                    : 'text-gray-600 dark:text-gray-300'
                                    ">
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
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {{ t.getStarted }}
                    </h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm mb-8">
                        {{ t.signUpSubtitle }}
                    </p>

                    <!-- Error Message -->
                    <div v-if="errorMessage"
                        class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                        <i class="ti-alert-circle text-red-500 dark:text-red-400 text-sm"></i>
                        <p class="text-sm text-red-600 dark:text-red-400">
                            {{ errorMessage }}
                        </p>
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
                                <div class="h-1 flex-1 rounded-full" :class="password.length >= 1
                                    ? 'bg-red-400 dark:bg-red-500'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                    "></div>
                                <div class="h-1 flex-1 rounded-full" :class="password.length >= 4
                                    ? 'bg-amber-400 dark:bg-amber-500'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                    "></div>
                                <div class="h-1 flex-1 rounded-full" :class="password.length >= 8
                                    ? 'bg-emerald-400 dark:bg-emerald-500'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                    "></div>
                                <div class="h-1 flex-1 rounded-full" :class="password.length >= 12
                                    ? 'bg-emerald-500 dark:bg-emerald-600'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                    "></div>
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
                                    :class="confirmPassword && confirmPassword !== password
                                        ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                                        : ''
                                        " />
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
                                    class="h-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse">
                                </div>
                            </div>

                            <!-- Error -->
                            <div v-else-if="plansError"
                                class="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 text-center">
                                Failed to load plans.
                                <button type="button" class="underline" @click="fetchPlans">
                                    Retry
                                </button>
                            </div>

                            <!-- Plans with tier-based styling -->
                            <div v-else class="grid grid-cols-3 gap-2">
                                <button v-for="plan in plans" :key="plan.id" type="button"
                                    class="relative p-3 rounded-lg border-2 text-center transition-all" :class="selectedPlanSlug === plan.slug
                                        ? [
                                            getPlanTierStyle(getSortOrder(plan)).border,
                                            getPlanTierStyle(getSortOrder(plan)).bg,
                                            'ring-1',
                                            getPlanTierStyle(getSortOrder(plan)).border,
                                        ]
                                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                                        " @click="selectedPlanSlug = plan.slug">
                                    <!-- Popular badge for tier 3 -->
                                    <div v-if="getSortOrder(plan) === 3"
                                        class="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-bold rounded-full">
                                        Popular
                                    </div>
                                    <i :class="[
                                        getPlanIcon(getSortOrder(plan)),
                                        selectedPlanSlug === plan.slug
                                            ? getPlanTierStyle(getSortOrder(plan)).icon
                                            : 'text-gray-400 dark:text-gray-500',
                                    ]" class="text-lg block mb-1"></i>
                                    <p class="text-xs font-semibold" :class="selectedPlanSlug === plan.slug
                                        ? getPlanTierStyle(getSortOrder(plan)).text
                                        : 'text-gray-800 dark:text-gray-200'
                                        ">
                                        {{ plan.name }}
                                    </p>
                                    <p class="text-[10px] mt-0.5" :class="selectedPlanSlug === plan.slug
                                        ? getPlanTierStyle(getSortOrder(plan)).text
                                        : 'text-gray-400 dark:text-gray-500'
                                        ">
                                        {{
                                            plan.price === 0
                                                ? t.free
                                                : formatPrice(plan.price, plan.currency) + "/" + t.month
                                        }}
                                    </p>
                                </button>
                            </div>
                        </div>

                        <!-- Duration Selector (only for paid plans) -->
                        <div v-if="selectedPlan && selectedPlan.price > 0">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {{ t.selectDuration }}
                            </label>
                            <div class="grid grid-cols-4 gap-1.5">
                                <button v-for="option in durationOptions" :key="option.months" type="button"
                                    @click="selectedDuration = option.months"
                                    class="relative px-2 py-2 rounded-lg border transition-all text-xs font-medium"
                                    :class="selectedDuration === option.months
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                                        ">
                                    <span>{{ getDurationLabel(option.months) }}</span>
                                    <span v-if="option.discount > 0"
                                        class="absolute -top-1.5 -right-1 px-1 py-0.5 bg-emerald-500 text-white text-[8px] font-bold rounded-full">
                                        -{{ option.discount }}%
                                    </span>
                                </button>
                            </div>
                            <!-- Price summary -->
                            <div class="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-gray-600 dark:text-gray-400">{{ t.total }}:</span>
                                    <div class="text-right">
                                        <span class="font-bold"
                                            :class="getPlanTierStyle(getSortOrder(selectedPlan)).text">
                                            {{ formatPrice(totalPrice, selectedPlan.currency) }}
                                        </span>
                                        <span v-if="getDiscount(selectedDuration) > 0"
                                            class="text-xs text-gray-400 line-through ml-1">
                                            {{
                                                formatPrice(
                                                    selectedPlan.price * selectedDuration,
                                                    selectedPlan.currency,
                                                )
                                            }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Terms -->
                        <div class="flex items-start gap-2">
                            <input id="terms" v-model="agreeTerms" type="checkbox"
                                class="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-800" />
                            <label for="terms" class="text-sm text-gray-600 dark:text-gray-400">
                                {{ t.agreeToTerms }}
                                <NuxtLink to="/terms" class="text-primary-600 dark:text-primary-400 hover:underline">{{
                                    t.termsOfService }}</NuxtLink>
                                {{ t.and }}
                                <NuxtLink to="/privacy" class="text-primary-600 dark:text-primary-400 hover:underline">
                                    {{
                                        t.privacyPolicy }}</NuxtLink>
                            </label>
                        </div>

                        <!-- Submit -->
                        <button type="submit" :disabled="isLoading ||
                            !fullName ||
                            !email ||
                            !password ||
                            !agreeTerms ||
                            password !== confirmPassword ||
                            password.length < 8 ||
                            plansLoading ||
                            plansError ||
                            !selectedPlan
                            "
                            class="w-full py-2.5 text-white text-sm font-medium rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            :class="selectedPlan && selectedPlan.price > 0
                                ? 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800'
                                : 'bg-primary-600 dark:bg-primary-700 hover:bg-primary-700 dark:hover:bg-primary-800 shadow-primary-600/20 dark:shadow-primary-700/20'
                                ">
                            <i v-if="!isLoading" :class="selectedPlan && selectedPlan.price > 0
                                ? 'ti-credit-card'
                                : 'ti-plus'
                                " class="text-xs"></i>
                            <i v-else class="ti-reload text-xs animate-spin"></i>
                            <template v-if="isLoading">
                                {{ t.processing }}
                            </template>
                            <template v-else-if="selectedPlan && selectedPlan.price > 0">
                                {{ t.continueToPayment }}
                            </template>
                            <template v-else>
                                {{ t.createAccount }}
                            </template>
                        </button>
                    </form>

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
