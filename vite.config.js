import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies browser calls to Groq through the Vite dev/preview server so the
// API key stays on the server (never shipped in the client bundle).
function createGroqProxy(apiKey) {
  return {
    '/api/groq': {
      target: 'https://api.groq.com',
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(/^\/api\/groq/, ''),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          if (apiKey) {
            proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
          }
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GROQ_API_KEY;

  return {
    plugins: [react()],
    server: { proxy: createGroqProxy(apiKey) },
    preview: { proxy: createGroqProxy(apiKey) },
  };
});
