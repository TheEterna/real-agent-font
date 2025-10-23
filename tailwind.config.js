/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 扩展颜色配置,与 Ant Design Vue 主题保持一致
      colors: {
        primary: {
          DEFAULT: '#1677ff',
          50: '#e6f4ff',
          100: '#bae0ff',
          200: '#91caff',
          300: '#69b1ff',
          400: '#4096ff',
          500: '#1677ff',
          600: '#0958d9',
          700: '#003eb3',
          800: '#002c8c',
          900: '#001d66',
        },
      },
      // 扩展间距
      spacing: {
        '128': '32rem',
        '144': '36rem',
      },
      // 扩展圆角
      borderRadius: {
        '4xl': '2rem',
      },
      // 扩展字体
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
  // 重要提示:避免与 Ant Design Vue 样式冲突
  corePlugins: {
    // 如果需要禁用某些 Tailwind 的预设样式,可以在这里配置
    // preflight: false, // 禁用 Tailwind 的基础样式重置(如果与 Ant Design 冲突)
  },
}
