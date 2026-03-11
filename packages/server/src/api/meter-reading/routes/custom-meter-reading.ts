export default {
  routes: [
    {
      method: 'POST',
      path: '/meter-readings/bulk',
      handler: 'meter-reading.bulkCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
