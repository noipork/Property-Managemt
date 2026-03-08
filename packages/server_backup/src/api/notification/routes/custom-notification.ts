/**
 * custom notification routes
 */

export default {
  routes: [
    {
      method: 'PUT',
      path: '/notifications/:id/read',
      handler: 'notification.markAsRead',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/notifications/read-all',
      handler: 'notification.markAllAsRead',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/notifications/unread-count',
      handler: 'notification.unreadCount',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/notifications/clear-read',
      handler: 'notification.clearRead',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
