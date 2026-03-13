import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiHost = env.ACOO_API_HOST || "127.0.0.1";
  const apiPort = env.ACOO_API_PORT || "4317";
  const apiTarget = `http://${apiHost}:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
        },
        "/healthz": {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
  };
});
