export default {
  routes: [
    {
      method: 'POST',
      path: '/floors/add-to-building',
      handler: 'floor.addToBuilding',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/floors/insert',
      handler: 'floor.insertFloor',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
