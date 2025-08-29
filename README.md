# Kit Agent Console (Front-end)

- Vite + React + TypeScript + Ant Design
- 开发: `npm i` `npm run dev`
- 预设 API: `/api/tools` `/api/tools/execute` 等，见 `src/services/*`

## 目录
- `src/app` 路由与布局
- `src/pages` 页面
- `src/services` API SDK

## 环境变量
- `VITE_API_BASE_URL` 由 `vite.config.ts` 代理 `/api`
