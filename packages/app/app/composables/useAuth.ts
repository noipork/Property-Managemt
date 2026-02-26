export type UserRole = 'manager' | 'resident'

// Helper function to map Strapi role ID to our UserRole type
function mapStrapiRoleToUserRole(strapiRole: any): UserRole {
    if (!strapiRole) return 'manager' // Default to manager
    
    const roleId = typeof strapiRole === 'object' ? strapiRole.id : strapiRole
    
    // Role ID 3 = manager, Role ID 4 = resident
    if (roleId === 4) return 'resident'
    return 'manager'
}

export const useAuth = () => {
    const config = useRuntimeConfig()
    
    // Initialize state with SSR-safe approach
    const isAuthenticated = useState('isAuthenticated', () => {
        if (process.client) {
            return !!localStorage.getItem('authToken')
        }
        return false
    })
    
    const user = useState('user', () => {
        if (process.client) {
            const storedUser = localStorage.getItem('authUser')
            if (storedUser) {
                try {
                    return JSON.parse(storedUser) as { name: string; email: string; role: UserRole }
                } catch {
                    return null
                }
            }
        }
        return null
    })
    
    const token = useState('token', () => {
        if (process.client) {
            return localStorage.getItem('authToken')
        }
        return null
    })

    const STRAPI_URL = config.public.strapiUrl

    // Restore session from localStorage on client-side (for page refreshes)
    if (process.client) {
        const storedToken = localStorage.getItem('authToken')
        const storedUser = localStorage.getItem('authUser')
        
        if (storedToken && storedUser && !user.value) {
            try {
                token.value = storedToken
                user.value = JSON.parse(storedUser)
                isAuthenticated.value = true
            } catch (error) {
                console.error('Failed to restore session:', error)
                // Clear invalid data
                localStorage.removeItem('authToken')
                localStorage.removeItem('authUser')
            }
        } else if (!storedToken) {
            // Clear state if no token in localStorage
            isAuthenticated.value = false
            user.value = null
            token.value = null
        }
    }

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
            const userResponse = await fetch(`${STRAPI_URL}/api/users/me?populate=role`, {
                headers: {
                    'Authorization': `Bearer ${data.jwt}`,
                },
            })

            const userData = await userResponse.json()

            // Store token and user data
            token.value = data.jwt
            isAuthenticated.value = true
            user.value = {
                name: userData.username || userData.email.split('@')[0],
                email: userData.email,
                role: mapStrapiRoleToUserRole(userData.role),
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

    const register = async (name: string, email: string, password: string) => {
        try {
            const response = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: name.replace(/\s+/g, '').toLowerCase(),
                    email: email,
                    password: password,
                    role: 3, // Default role: Manager (role ID 3)
                }),
            })

            if (!response.ok) {
                throw new Error('Registration failed')
            }

            const data = await response.json()

            // Fetch user data with role populated
            const userResponse = await fetch(`${STRAPI_URL}/api/users/me?populate=role`, {
                headers: {
                    'Authorization': `Bearer ${data.jwt}`,
                },
            })

            const userData = await userResponse.json()

            // Store token and user data
            token.value = data.jwt
            isAuthenticated.value = true
            user.value = {
                name: name,
                email: userData.email,
                role: mapStrapiRoleToUserRole(userData.role),
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
