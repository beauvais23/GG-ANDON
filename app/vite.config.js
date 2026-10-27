import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {

  // The backend URL differs per environment (staging vs production).
  // Fail fast instead of building an app that points at the wrong backend.
  const env = loadEnv(mode, process.cwd(), "");

  if (!env.VITE_API_BASE_URL) {
    throw new Error(
      "VITE_API_BASE_URL is not set. Set it on the Railway service to the backend URL, e.g. https://gg-andon-production.up.railway.app"
    );
  }

  return {

    plugins: [react()],

    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true
    }

  };

});
