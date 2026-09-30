import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative assets work both on localhost and under /<repo>/ on GitHub Pages.
  base: './',
})
