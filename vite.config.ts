import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'node:path'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [

        tailwindcss(),
        vueDevTools(),
        vue(),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    },
    server: {
        port: 5173,
        open: true,
        proxy: {
            '/api': {
                target: process.env.VITE_API_BASE_URL || 'http://localhost:8080',
                changeOrigin: true
            },
            // Proxy WebSocket for realtime voice stream to backend
            '/ws': {
                target: process.env.VITE_API_BASE_URL || 'http://localhost:8080',
                changeOrigin: true,
                ws: true
            }
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                // 自动注入全局变量文件（注意路径要正确）
                additionalData: `@use "@/styles/variables.scss" as *;`,
                // 注：如果是 Windows 系统，路径分隔符用 \\，如：
                // additionalData: `@import "@\\styles\\variables.scss";`,
            },
        },
    },
    build: {
        sourcemap: true
    }
})