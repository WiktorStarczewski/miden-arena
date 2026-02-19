import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
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
