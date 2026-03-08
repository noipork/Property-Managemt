// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Disable SSR — this is a fully-authenticated dashboard app.
  // SSR causes hydration mismatches because auth state (localStorage) differs
  // between server render and client hydration.
  ssr: false,

  modules: ['@nuxtjs/tailwindcss'],

  runtimeConfig: {
    public: {
      strapiUrl: process.env.NUXT_PUBLIC_STRAPI_URL || 'http://localhost:1337',
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    },
  },

  app: {
    head: {
      link: [
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/themify-icons/0.1.2/css/themify-icons.css',
        },
        {
          rel: 'stylesheet',
          href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
        },
      ],
    },
  },
})
