export default defineNuxtRouteMiddleware((to) => {
    const { isAuthenticated, user } = useAuth()

    const publicPages = ['/signin', '/signup', '/terms', '/privacy', '/forgot-password', '/reset-password']
    const isPublicPage = publicPages.includes(to.path)

    if (!isAuthenticated.value && !isPublicPage) {
        return navigateTo('/signin')
    }

    if (isAuthenticated.value && isPublicPage) {
        return navigateTo('/')
    }

    // Role-based route protection
    if (isAuthenticated.value && user.value) {
        const role = user.value.role

        // Prevent residents from accessing manager routes
        if (role === 'resident' && to.path.startsWith('/manager')) {
            return navigateTo('/')
        }

        // Prevent managers from accessing resident routes
        if (role === 'manager' && to.path.startsWith('/resident')) {
            return navigateTo('/')
        }
    }
})
