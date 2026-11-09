import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Claude가 바깥에서 고친 파일도 바로 반영되도록 변경 감지를 주기적으로 확인
    watch: { usePolling: true, interval: 300 },
  },
})
