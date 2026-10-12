import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
export default defineConfig({
  plugins: [react()],
  build: { lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    rollupOptions: { external: (id) => [...Object.keys(pkg.dependencies), "react", "react-dom"].some((dep) => id === dep || id.startsWith(`${dep}/`)), output: { banner: '"use client";' } } },
});
