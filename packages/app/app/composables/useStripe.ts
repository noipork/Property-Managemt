import { ref } from 'vue'

const STRIPE_PUBLISHABLE_KEY = 'pk_test_51T8vDVGgm8V7nGJH6KHLYZvnE9oj1Si6ZrCoyYs3PYlySq7ANolmSXc3iHJZk7mo64gntQiZdPRlqljkf98egS1s00x7aL7kgF'

let stripePromise: Promise<any> | null = null

// Dynamically load Stripe.js
function loadStripe(): Promise<any> {
    if (stripePromise) return stripePromise

    stripePromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('Stripe can only be loaded in browser'))
            return
        }

        // Check if already loaded
        if ((window as any).Stripe) {
            resolve((window as any).Stripe(STRIPE_PUBLISHABLE_KEY))
            return
        }

        const script = document.createElement('script')
        script.src = 'https://js.stripe.com/v3/'
        script.async = true
        script.onload = () => {
            if ((window as any).Stripe) {
                resolve((window as any).Stripe(STRIPE_PUBLISHABLE_KEY))
            } else {
                reject(new Error('Stripe.js failed to load'))
            }
        }
        script.onerror = () => reject(new Error('Failed to load Stripe.js'))
        document.head.appendChild(script)
    })

    return stripePromise
}

export function useStripe() {
    const { token } = useAuth()
    const config = useRuntimeConfig()
    const STRAPI_URL = config.public.strapiUrl

    const isLoading = ref(false)
    const error = ref<string | null>(null)

    async function createCheckoutSession(planId: string, durationMonths: number = 1): Promise<{ sessionId?: string; sessionUrl?: string; free?: boolean; success: boolean }> {
        isLoading.value = true
        error.value = null

        try {
            const res = await fetch(`${STRAPI_URL}/api/subscriptions/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({ planId, durationMonths }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error?.message || 'Failed to create checkout session')
            }

            return data
        } catch (err: any) {
            error.value = err.message
            return { success: false }
        } finally {
            isLoading.value = false
        }
    }

    async function redirectToCheckout(planId: string, durationMonths: number = 1): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            // Create checkout session
            const result = await createCheckoutSession(planId, durationMonths)

            if (!result.success) {
                return false
            }

            // If free plan, no redirect needed
            if (result.free) {
                return true
            }

            // Redirect to Stripe Checkout
            if (result.sessionUrl) {
                window.location.href = result.sessionUrl
                return true
            }

            // Fallback: use Stripe.js redirect
            if (result.sessionId) {
                const stripe = await loadStripe()
                const { error: stripeError } = await stripe.redirectToCheckout({
                    sessionId: result.sessionId,
                })

                if (stripeError) {
                    error.value = stripeError.message
                    return false
                }
                return true
            }

            error.value = 'No checkout session created'
            return false
        } catch (err: any) {
            error.value = err.message
            return false
        } finally {
            isLoading.value = false
        }
    }

    async function verifyCheckoutSuccess(sessionId: string): Promise<any> {
        isLoading.value = true
        error.value = null

        try {
            const res = await fetch(`${STRAPI_URL}/api/subscriptions/checkout-success?session_id=${sessionId}`, {
                headers: {
                    Authorization: `Bearer ${token.value}`,
                },
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error?.message || 'Failed to verify payment')
            }

            return data
        } catch (err: any) {
            error.value = err.message
            return null
        } finally {
            isLoading.value = false
        }
    }

    // Create checkout session for new signup (before user creation)
    async function createSignupCheckout(
        planId: string,
        durationMonths: number,
        fullName: string,
        email: string,
        password: string
    ): Promise<{ sessionId?: string; sessionUrl?: string; success: boolean }> {
        isLoading.value = true
        error.value = null

        try {
            const res = await fetch(`${STRAPI_URL}/api/subscriptions/signup-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ planId, durationMonths, fullName, email, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error?.message || 'Failed to create checkout session')
            }

            return data
        } catch (err: any) {
            error.value = err.message
            return { success: false }
        } finally {
            isLoading.value = false
        }
    }

    // Redirect to Stripe checkout for signup
    async function redirectToSignupCheckout(
        planId: string,
        durationMonths: number,
        fullName: string,
        email: string,
        password: string
    ): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            const result = await createSignupCheckout(planId, durationMonths, fullName, email, password)

            if (!result.success) {
                return false
            }

            // Redirect to Stripe Checkout
            if (result.sessionUrl) {
                window.location.href = result.sessionUrl
                return true
            }

            // Fallback: use Stripe.js redirect
            if (result.sessionId) {
                const stripe = await loadStripe()
                const { error: stripeError } = await stripe.redirectToCheckout({
                    sessionId: result.sessionId,
                })

                if (stripeError) {
                    error.value = stripeError.message
                    return false
                }
                return true
            }

            error.value = 'No checkout session created'
            return false
        } catch (err: any) {
            error.value = err.message
            return false
        } finally {
            isLoading.value = false
        }
    }

    // Complete signup after successful payment
    async function completeSignup(sessionId: string): Promise<{ success: boolean; jwt?: string; user?: any; alreadyCreated?: boolean }> {
        isLoading.value = true
        error.value = null

        try {
            const res = await fetch(`${STRAPI_URL}/api/subscriptions/complete-signup?session_id=${sessionId}`)

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error?.message || 'Failed to complete signup')
            }

            return data
        } catch (err: any) {
            error.value = err.message
            return { success: false }
        } finally {
            isLoading.value = false
        }
    }

    return {
        isLoading,
        error,
        createCheckoutSession,
        redirectToCheckout,
        verifyCheckoutSuccess,
        createSignupCheckout,
        redirectToSignupCheckout,
        completeSignup,
    }
}
