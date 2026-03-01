export default defineNuxtRouteMiddleware((to) => {
    const { isAuthenticated } = useAuth()

    const publicPages = ['/signin', '/signup']
    const isPublicPage = publicPages.includes(to.path)

    if (!isAuthenticated.value && !isPublicPage) {
        return navigateTo('/signin')
    }

    if (isAuthenticated.value && isPublicPage) {
        return navigateTo('/')
    }
})
