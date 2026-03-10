import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  // Important: always return the modified config
  return mergeConfig(config, {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    server: {
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'propertyapi.upstify-official.com',
      ],
    },
    build: {
      rollupOptions: {
        external: ['zod/v4', 'zod/v3'],
      },
    },
    optimizeDeps: {
      exclude: ['zod/v4', 'zod/v3'],
    },
  });
};
