import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      input: {
        panel: fileURLToPath(new URL('./index.html', import.meta.url)),
        driverMap: fileURLToPath(new URL('./driver-map.html', import.meta.url)),
      },
    },
  },
});
