import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Vercel serves /admin from admin.html (cleanUrls); mirror that in dev and preview.
const rewriteAdmin = (req, _res, next) => {
  if (req.url === '/admin' || req.url?.startsWith('/admin?')) req.url = req.url.replace('/admin', '/admin.html');
  next();
};
const cleanAdminUrl = {
  name: 'clean-admin-url',
  configureServer: server => { server.middlewares.use(rewriteAdmin); },
  configurePreviewServer: server => { server.middlewares.use(rewriteAdmin); },
};

export default defineConfig({
  plugins: [cleanAdminUrl],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
