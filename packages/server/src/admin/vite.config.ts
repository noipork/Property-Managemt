import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  // Important: always return the modified config
  return mergeConfig(config, {
    resolve: {
      alias: {
        '@': '/src',
      },
      dedupe: ['react', 'react-dom', 'react-router-dom', 'styled-components'],
    },
    server: {
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'propertyapi.upstify-official.com',
      ],
    },
  });
};
