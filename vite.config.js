import { defineConfig } from 'vite'

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['wt-animation-github-io.onrender.com']
  }
})