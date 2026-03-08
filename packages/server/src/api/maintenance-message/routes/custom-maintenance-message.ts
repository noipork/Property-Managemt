export default {
  routes: [
    {
      method: 'POST',
      path: '/maintenance-messages/mark-read',
      handler: 'maintenance-message.markRead',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
