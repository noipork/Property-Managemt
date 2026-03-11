export default {
  routes: [
    {
      method: 'GET',
      path: '/billings/pending-auto',
      handler: 'billing.pendingAuto',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/billings/auto-generate',
      handler: 'billing.autoGenerate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
