import { ref } from 'vue'

export type UserRole = 'manager' | 'resident'

// Helper function to map Strapi role ID to our UserRole type
function mapStrapiRoleToUserRole(strapiRole: any): UserRole {
    if (!strapiRole) return 'manager' // Default to manager
    
    const roleId = typeof strapiRole === 'object' ? strapiRole.id : strapiRole
    
    // Role ID 3 = manager, Role ID 4 = resident
    if (roleId === 4) return 'resident'
    return 'manager'
}

// ─── Module-scope shared state ────────────────────────────────────────────────
// With ssr: false this runs once in the browser. Plain refs at module scope are
// shared across all composable calls (same reference), and reading localStorage
// here is safe — it runs before any component or middleware.

function restoreToken(): string | null {
    try { return localStorage.getItem('authToken') } catch { return null }
}
function restoreUser(): { id: number; documentId: string; name: string; email: string; role: UserRole; property?: { id: number; documentId: string; name: string } | null } | null {
    try {
        const raw = localStorage.getItem('authUser')
        return raw ? JSON.parse(raw) : null
    } catch { return null }
}

const _token = ref<string | null>(restoreToken())
const _user = ref<{ id: number; documentId: string; name: string; email: string; role: UserRole; property?: { id: number; documentId: string; name: string } | null } | null>(restoreUser())
const _isAuthenticated = ref<boolean>(!!_token.value)

export const useAuth = () => {
    const config = useRuntimeConfig()
    const STRAPI_URL = config.public.strapiUrl

    const isAuthenticated = _isAuthenticated
    const user = _user
    const token = _token

    const login = async (email: string, password: string) => {
        try {
            const response = await fetch(`${STRAPI_URL}/api/auth/local`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    identifier: email,
                    password: password,
                }),
            })

            if (!response.ok) {
                throw new Error('Authentication failed')
            }

            const data = await response.json()

            // Fetch user data with role populated
            const userResponse = await fetch(`${STRAPI_URL}/api/users/me?populate=*`, {
                headers: {
                    'Authorization': `Bearer ${data.jwt}`,
                },
            })

            const userData = await userResponse.json()

            // Store token and user data
            token.value = data.jwt
            isAuthenticated.value = true
            user.value = {
                id: userData.id,
                documentId: userData.documentId,
                name: userData.username || userData.email.split('@')[0],
                email: userData.email,
                role: mapStrapiRoleToUserRole(userData.role),
                property: userData.property ? { id: userData.property.id, documentId: userData.property.documentId, name: userData.property.name } : null,
            }

            if (process.client) {
                localStorage.setItem('authToken', data.jwt)
                localStorage.setItem('authUser', JSON.stringify(user.value))
            }

            return { success: true, data }
        } catch (error) {
            console.error('Login error:', error)
            return { success: false, error }
        }
    }

    const logout = () => {
        isAuthenticated.value = false
        user.value = null
        token.value = null

        if (process.client) {
            localStorage.removeItem('authToken')
            localStorage.removeItem('authUser')
        }
    }

    const register = async (
        name: string,
        email: string,
        password: string,
        plan?: { id?: number; documentId?: string; price?: number; currency?: string }
    ) => {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }
            
            // Pass plan via custom header to avoid Strapi body validation
            if (plan?.documentId) {
                headers['X-Selected-Plan'] = plan.documentId
            }

            const response = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    username: name.replace(/\s+/g, '').toLowerCase(),
                    email: email,
                    password: password,
                }),
            })

            if (!response.ok) {
                throw new Error('Registration failed')
            }

            const data = await response.json()

            const userId: number | undefined = data?.user?.id

            // Update role and plan after registration completes
            if (userId) {
                const updatePayload: Record<string, unknown> = { role: 3 }

                if (plan?.id) {
                    updatePayload.plan = plan.id
                }

                const updateResponse = await fetch(`${STRAPI_URL}/api/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${data.jwt}`,
                    },
                    body: JSON.stringify(updatePayload),
                })

                if (!updateResponse.ok) {
                    console.error('Failed to update user role/plan after register', await updateResponse.text())
                }

                // Create subscription for the user
                if (plan?.id) {
                    const now = new Date()
                    const startDate = now.toISOString().split('T')[0]
                    // Default subscription period: 1 month (or 30 days for trial/free)
                    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    const invoiceNo = `SUB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

                    const subscriptionPayload = {
                        data: {
                            user: userId,
                            plan: plan.id,
                            status: plan.price === 0 ? 'active' : 'pending', // Free plans auto-activate
                            startDate,
                            endDate,
                            amount: plan.price ?? 0,
                            currency: plan.currency ?? 'THB',
                            paymentStatus: plan.price === 0 ? 'paid' : 'pending',
                            paidAt: plan.price === 0 ? now.toISOString() : null,
                            invoiceNo,
                            isAutoRenew: false,
                        }
                    }

                    const subscriptionResponse = await fetch(`${STRAPI_URL}/api/subscriptions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${data.jwt}`,
                        },
                        body: JSON.stringify(subscriptionPayload),
                    })

                    if (subscriptionResponse.ok) {
                        const subscriptionData = await subscriptionResponse.json()
                        // Link active subscription to user
                        await fetch(`${STRAPI_URL}/api/users/${userId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${data.jwt}`,
                            },
                            body: JSON.stringify({
                                activeSubscription: subscriptionData.data?.id || subscriptionData.id,
                            }),
                        })
                    } else {
                        console.error('Failed to create subscription', await subscriptionResponse.text())
                    }
                }
            }

            // Fetch user data with role populated
            const userResponse = await fetch(`${STRAPI_URL}/api/users/me?populate=*`, {
                headers: {
                    'Authorization': `Bearer ${data.jwt}`,
                },
            })

            const userData = await userResponse.json()

            // Store token and user data
            token.value = data.jwt
            isAuthenticated.value = true
            user.value = {
                id: userData.id,
                documentId: userData.documentId,
                name: name,
                email: userData.email,
                role: mapStrapiRoleToUserRole(userData.role),
                property: userData.property ? { id: userData.property.id, documentId: userData.property.documentId, name: userData.property.name } : null,
            }

            if (process.client) {
                localStorage.setItem('authToken', data.jwt)
                localStorage.setItem('authUser', JSON.stringify(user.value))
            }

            return { success: true, data }
        } catch (error) {
            console.error('Registration error:', error)
            return { success: false, error }
        }
    }

    return {
        isAuthenticated,
        user,
        token,
        login,
        logout,
        register,
    }
}
