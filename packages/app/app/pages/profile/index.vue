<script setup lang="ts">
import { ref, computed } from 'vue'

const { t } = useI18n()
const { user, token } = useAuth()
const config = useRuntimeConfig()
const STRAPI_URL = config.public.strapiUrl

// ─── Toast ────────────────────────────────────────────────────────────────────
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(type: 'success' | 'error', message: string) {
    if (toastTimer) clearTimeout(toastTimer)
    toast.value = { type, message }
    toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

// ─── Profile form ─────────────────────────────────────────────────────────────
const profileForm = ref({
    username: user.value?.name ?? '',
    email: user.value?.email ?? '',
})
const isSavingProfile = ref(false)

async function saveProfile() {
    if (!user.value) return
    isSavingProfile.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/users/${user.value.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                username: profileForm.value.username,
                email: profileForm.value.email,
            }),
        })
        if (!res.ok) throw new Error('Failed')
        // Update cached user
        user.value = {
            ...user.value,
            name: profileForm.value.username,
            email: profileForm.value.email,
        }
        if (process.client) {
            localStorage.setItem('authUser', JSON.stringify(user.value))
        }
        showToast('success', t.value.profileSaved)
    } catch {
        showToast('error', t.value.profileSaveError)
    } finally {
        isSavingProfile.value = false
    }
}

// ─── Password form ────────────────────────────────────────────────────────────
const passwordForm = ref({
    current: '',
    next: '',
    confirm: '',
})
const showCurrentPw = ref(false)
const showNextPw = ref(false)
const showConfirmPw = ref(false)
const isSavingPassword = ref(false)

const passwordError = computed(() => {
    if (passwordForm.value.next && passwordForm.value.next.length < 8) return t.value.passwordTooShort
    if (passwordForm.value.confirm && passwordForm.value.next !== passwordForm.value.confirm) return t.value.passwordsNotMatch
    return ''
})

async function changePassword() {
    if (passwordError.value) return
    if (!passwordForm.value.current || !passwordForm.value.next) return
    isSavingPassword.value = true
    try {
        const res = await fetch(`${STRAPI_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({
                currentPassword: passwordForm.value.current,
                password: passwordForm.value.next,
                passwordConfirmation: passwordForm.value.confirm,
            }),
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data?.error?.message ?? 'Failed')
        }
        passwordForm.value = { current: '', next: '', confirm: '' }
        showToast('success', t.value.passwordChanged)
    } catch (err: any) {
        showToast('error', err.message ?? t.value.passwordChangeError)
    } finally {
        isSavingPassword.value = false
    }
}

const userInitial = computed(() => (user.value?.name ?? 'U')[0].toUpperCase())
const roleColor = computed(() =>
    user.value?.role === 'manager'
        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
)
</script>

<template>
    <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <Transition appear enter-active-class="transition-all duration-500" enter-from-class="opacity-0 -translate-y-3"
            enter-to-class="opacity-100 translate-y-0">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t.profileTitle }}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ t.profileSubtitle }}</p>
            </div>
        </Transition>

        <!-- Avatar card -->
        <Transition appear enter-active-class="transition-all duration-500 delay-75"
            enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div class="flex items-center gap-5">
                    <div
                        class="w-16 h-16 rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center flex-shrink-0 text-white text-2xl font-bold select-none">
                        {{ userInitial }}
                    </div>
                    <div>
                        <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ user?.name }}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{{ user?.email }}</p>
                        <span
                            class="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase"
                            :class="roleColor">
                            {{ user?.role }}
                        </span>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Profile info form -->
        <Transition appear enter-active-class="transition-all duration-500 delay-100"
            enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fa-solid fa-user text-primary-600 dark:text-primary-400"></i>
                    {{ t.profileInfo }}
                </h2>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Display name -->
                    <div class="space-y-1.5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t.profileDisplayName }}
                        </label>
                        <input v-model="profileForm.username" type="text"
                            class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                            :placeholder="t.fullNamePlaceholder" />
                    </div>

                    <!-- Email -->
                    <div class="space-y-1.5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t.emailAddress }}
                        </label>
                        <input v-model="profileForm.email" type="email"
                            class="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                            :placeholder="t.emailPlaceholder" />
                    </div>
                </div>

                <div class="flex justify-end">
                    <button @click="saveProfile" :disabled="isSavingProfile"
                        class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors">
                        <i v-if="isSavingProfile" class="fa-solid fa-circle-notch animate-spin text-sm"></i>
                        <i v-else class="fa-solid fa-floppy-disk text-sm"></i>
                        {{ isSavingProfile ? t.saving : t.saveChanges }}
                    </button>
                </div>
            </div>
        </Transition>

        <!-- Change password form -->
        <Transition appear enter-active-class="transition-all duration-500 delay-150"
            enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0">
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fa-solid fa-lock text-primary-600 dark:text-primary-400"></i>
                    {{ t.changePassword }}
                </h2>

                <div class="space-y-4">
                    <!-- Current password -->
                    <div class="space-y-1.5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t.currentPassword }}
                        </label>
                        <div class="relative">
                            <input v-model="passwordForm.current" :type="showCurrentPw ? 'text' : 'password'"
                                class="w-full px-3 py-2.5 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                                :placeholder="t.currentPasswordPlaceholder" />
                            <button type="button" @click="showCurrentPw = !showCurrentPw"
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                <i :class="showCurrentPw ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                    class="text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <!-- New password -->
                        <div class="space-y-1.5">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {{ t.newPassword }}
                            </label>
                            <div class="relative">
                                <input v-model="passwordForm.next" :type="showNextPw ? 'text' : 'password'"
                                    class="w-full px-3 py-2.5 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                                    :placeholder="t.newPasswordPlaceholder" />
                                <button type="button" @click="showNextPw = !showNextPw"
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                    <i :class="showNextPw ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                        class="text-sm"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Confirm password -->
                        <div class="space-y-1.5">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {{ t.confirmPassword }}
                            </label>
                            <div class="relative">
                                <input v-model="passwordForm.confirm" :type="showConfirmPw ? 'text' : 'password'"
                                    class="w-full px-3 py-2.5 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                                    :placeholder="t.confirmPasswordPlaceholder" />
                                <button type="button" @click="showConfirmPw = !showConfirmPw"
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                    <i :class="showConfirmPw ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                        class="text-sm"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Inline validation -->
                    <Transition enter-active-class="transition-all duration-200"
                        enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0">
                        <p v-if="passwordError" class="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                            <i class="fa-solid fa-circle-exclamation"></i> {{ passwordError }}
                        </p>
                    </Transition>
                </div>

                <div class="flex justify-end">
                    <button @click="changePassword"
                        :disabled="isSavingPassword || !!passwordError || !passwordForm.current || !passwordForm.next || !passwordForm.confirm"
                        class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors">
                        <i v-if="isSavingPassword" class="fa-solid fa-circle-notch animate-spin text-sm"></i>
                        <i v-else class="fa-solid fa-key text-sm"></i>
                        {{ isSavingPassword ? t.saving : t.changePassword }}
                    </button>
                </div>
            </div>
        </Transition>

        <!-- Toast -->
        <Teleport to="body">
            <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0 translate-y-2"
                enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-2">
                <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <div class="flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border"
                        :class="toast.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'">
                        <i
                            :class="toast.type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'"></i>
                        {{ toast.message }}
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
