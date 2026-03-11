/**
 * Custom building routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/buildings/generate',
      handler: 'building.generate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
