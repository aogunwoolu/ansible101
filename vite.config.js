import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the browser-safe UMD build of nunjucks (no Node.js fs/path deps)
      nunjucks: 'nunjucks/browser/nunjucks.js',
    },
  },
})
