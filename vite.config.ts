import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "/miden-arena/",
  plugins: [react()],
  resolve: {
    alias: {
      // Deduplicate: force the symlinked react-sdk to use the app's
      // single copy of miden-sdk so WASM class identity checks pass.
      "@miden-sdk/miden-sdk": path.resolve(
        __dirname,
        "node_modules/@miden-sdk/miden-sdk"
      ),
    },
    dedupe: ["@miden-sdk/miden-sdk"],
    preserveSymlinks: true,
  },
  server: {
    fs: {
      allow: [
        // Project root
        ".",
        // Local react-sdk symlink target
        "../miden-client",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      // gRPC-web requests from the WASM client go to /rpc.Api/* on same origin.
      // Proxy them to the real Miden testnet RPC to avoid CORS issues.
      "/rpc.Api": {
        target: "https://rpc.testnet.miden.io",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
  },
  optimizeDeps: {
    exclude: ["@miden-sdk/miden-sdk"],
  },
});
