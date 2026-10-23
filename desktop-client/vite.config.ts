import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error Node builtins are available to Vite's config runtime
import { readFileSync } from "node:fs";
// @ts-expect-error Node builtins are available to Vite's config runtime
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;
const envDir = fileURLToPath(new URL("../", import.meta.url));

function readInferenceAccessKey(): string {
  try {
    const localEnv = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const value = localEnv.match(/^INFERENCE_ACCESS_KEY\s*=\s*(.+)$/m)?.[1]?.trim();
    return value?.replace(/^['"]|['"]$/g, "") ?? "";
  } catch {
    return "";
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "VITE_");
  const aiHttpUrl = (env.VITE_AI_HTTP_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const aiWsUrl = env.VITE_AI_WS_URL || `${aiHttpUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/ws/inference`;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_AI_HTTP_URL": JSON.stringify(aiHttpUrl),
      "import.meta.env.VITE_AI_WS_URL": JSON.stringify(aiWsUrl),
      "import.meta.env.VITE_AI_ACCESS_KEY": JSON.stringify(env.VITE_AI_ACCESS_KEY || readInferenceAccessKey()),
    },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
