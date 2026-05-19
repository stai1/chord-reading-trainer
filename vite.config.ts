import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/chord-reading-trainer/',
  plugins: [react()],
  assetsInclude: ['**/*.opus'],
})
