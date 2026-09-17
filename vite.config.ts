import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
// Locally it defaults to "/" so `bun run dev` works without configuration.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: process.env['BASE_PATH'] ?? '/',
    build: { outDir: 'dist', emptyOutDir: true },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } }
})
