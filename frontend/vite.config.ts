import { defineConfig } from 'vite';

const FRONTEND_PORT = Number(process.env.FORMTXT_UI_PORT ?? 5210);
const PREVIEW_PORT = 5310;
const BACKEND_PORT = Number(process.env.FORMTXT_ENGINE_PORT ?? 8210);
const engine = { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true, ws: true };

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: FRONTEND_PORT,
    host: false,
    strictPort: true,
    proxy: { '/api': engine, '/mcp': engine },
  },
  preview: {
    port: PREVIEW_PORT,
    host: false,
    strictPort: true,
    proxy: { '/api': engine, '/mcp': engine },
  },
  optimizeDeps: {
    include: ['mermaid'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
