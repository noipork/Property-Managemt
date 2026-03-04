<script setup lang="ts">
const { user } = useAuth()
const router = useRouter()

onMounted(() => {
    if (user.value?.role === 'resident') {
        router.replace('/resident/dashboard')
    } else {
        router.replace('/manager/dashboard')
    }
})
</script>

<template>
    <div class="flex items-center justify-center min-h-screen">
        <div class="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
</template>
