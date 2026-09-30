import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // This repository is published at https://<owner>.github.io/officical-doc-ai/.
  base: '/officical-doc-ai/',
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
