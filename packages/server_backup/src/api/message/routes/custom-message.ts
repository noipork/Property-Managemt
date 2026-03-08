export default {
  routes: [
    {
      method: 'POST',
      path: '/messages/mark-read',
      handler: 'message.markRead',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
