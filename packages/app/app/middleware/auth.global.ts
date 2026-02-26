export default defineNuxtRouteMiddleware((to, from) => {
    // Skip middleware on server-side to avoid localStorage access
    if (process.server) return

    const { isAuthenticated, user } = useAuth()

    // Allow access to auth pages (signin, signup)
    const publicPages = ['/signin', '/signup']
    const isPublicPage = publicPages.includes(to.path)

    // If user is not authenticated and trying to access a protected page
    if (!isAuthenticated.value && !isPublicPage) {
        return navigateTo('/signin')
    }

    // If user is authenticated and trying to access signin/signup, redirect to dashboard
    if (isAuthenticated.value && isPublicPage) {
        return navigateTo('/')
    }
})
