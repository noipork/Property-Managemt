/**
 * Custom subscription routes for Stripe integration
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/subscriptions/create-checkout',
      handler: 'subscription.createCheckout',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/subscriptions/signup-checkout',
      handler: 'subscription.createSignupCheckout',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Public route for signup
      },
    },
    {
      method: 'GET',
      path: '/subscriptions/complete-signup',
      handler: 'subscription.completeSignup',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Public route for completing signup
      },
    },
    {
      method: 'POST',
      path: '/subscriptions/webhook',
      handler: 'subscription.handleWebhook',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Webhook doesn't require authentication
      },
    },
    {
      method: 'GET',
      path: '/subscriptions/checkout-success',
      handler: 'subscription.checkoutSuccess',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
