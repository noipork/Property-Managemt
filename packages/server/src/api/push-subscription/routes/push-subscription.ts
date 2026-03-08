/**
 * push-subscription routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/push-subscriptions/subscribe',
      handler: 'push-subscription.subscribe',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/push-subscriptions/unsubscribe',
      handler: 'push-subscription.unsubscribe',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/push-subscriptions/vapid-public-key',
      handler: 'push-subscription.vapidPublicKey',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
