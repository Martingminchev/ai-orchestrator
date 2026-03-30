import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./renderer"),
      "@components": path.resolve(__dirname, "./renderer/components"),
      "@store": path.resolve(__dirname, "./renderer/store"),
      "@styles": path.resolve(__dirname, "./renderer/styles"),
    },
  },
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "zustand"],
  },
});
