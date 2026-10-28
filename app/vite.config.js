import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Unique per build. Shipped in the bundle and in /version.json so open
// screens can tell a new version was deployed (see useAutoReload).
const BUILD_ID = Date.now().toString(36);

function versionFile() {

  return {
    name: "andon-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID })
      });
    }
  };

}

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

    plugins: [react(), versionFile()],

    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID)
    },

    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true
    }

  };

});
