import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site from /<repo>/, so the build needs that
// base or every asset — including the analysis worker — 404s. Dev stays at /.
// Override with BASE_PATH when deploying somewhere else (a user/org page,
// Netlify, S3): BASE_PATH=/ npm run build
const REPO_BASE = process.env.BASE_PATH ?? '/scaffoldlab/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
}))
