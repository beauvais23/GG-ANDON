const config = {
  company: "G&G Industrial Lighting",
  facility: "Malta",
  workCenter: "Final Test",

  // Backend URL per environment, set on the Railway service (build time).
  // vite.config.js fails the build if it is missing.
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
};

export default config;
