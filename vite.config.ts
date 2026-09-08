import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = parseInt(env.PORT || '3001', 10);
  const clientPort = parseInt(env.VITE_PORT || '5173', 10);

  return {
    plugins: [react()],
    define: {
      global: 'globalThis',
    },
    server: {
      port: clientPort,
      host: true,
      allowedHosts: true,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: `http://127.0.0.1:${serverPort}`,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
