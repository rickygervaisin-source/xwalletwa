import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/wallet": "http://localhost:4000",
      "/balance": "http://localhost:4000",
      "/tx": "http://localhost:4000",
      "/chains": "http://localhost:4000",
      "/owner": "http://localhost:4000",
      "/market": "http://localhost:4000"
    }
  }
});
