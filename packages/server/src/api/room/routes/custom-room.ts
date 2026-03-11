export default {
  routes: [
    {
      method: 'POST',
      path: '/rooms/add-to-floor',
      handler: 'room.addToFloor',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/rooms/assign-resident',
      handler: 'room.assignResident',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/rooms/unassign-resident',
      handler: 'room.unassignResident',
      config: { policies: [], middlewares: [] },
    },
  ],
}
