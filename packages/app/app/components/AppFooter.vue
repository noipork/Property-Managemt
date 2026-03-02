<script setup lang="ts">
const { t } = useI18n()
const year = ref('')

onMounted(() => {
    year.value = String(new Date().getFullYear())
})

const props = defineProps<{
    sidebarOpen: boolean
}>()
</script>

<template>
    <footer
        class="fixed bottom-0 right-0 h-12 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 flex items-center justify-between px-4 shadow-sm transition-all duration-300"
        :class="props.sidebarOpen ? 'left-64' : 'left-20'">
        <!-- Brand -->
        <div class="flex items-center gap-2">
            <div class="w-5 h-5 bg-primary-600 rounded-md flex items-center justify-center flex-shrink-0">
                <i class="ti-home text-white" style="font-size:10px"></i>
            </div>
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">PropManager</span>
        </div>

        <!-- Center links -->
        <div class="hidden sm:flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <NuxtLink to="/manager/properties"
                class="hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                {{ t.properties }}
            </NuxtLink>
            <span class="text-gray-200 dark:text-gray-700">·</span>
            <a href="mailto:support@propmanager.app"
                class="hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                Support
            </a>
        </div>

        <!-- Copyright -->
        <p class="text-xs text-gray-400 dark:text-gray-500">
            © {{ year }} PropManager
        </p>
    </footer>
</template>
