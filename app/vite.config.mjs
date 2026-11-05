import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// App version comes from package.json; every build gets a unique id. Both are compiled into the client and
// published as /version.json so open tabs can detect a newer deployment (Settings → About & updates).
const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const buildTime = new Date().toISOString();
const buildId = buildTime.replace(/[-:T]/g, "").slice(0, 12);
const versionInfo = JSON.stringify({ version, buildId, builtAt: buildTime });
const versionFile = {
  name: "bayit-version",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: versionInfo }); },
  configureServer(server) { server.middlewares.use("/version.json", (_req, res) => { res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify({ version, buildId: "dev", builtAt: buildTime })); }); },
};

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(command === "build" ? buildId : "dev"),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    proxy: { "/api/ai": { target: "http://127.0.0.1:8787", changeOrigin: false } },
    watch: { usePolling: true, interval: 300 },
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), versionFile],
}));
