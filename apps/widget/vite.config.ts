import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/loader.ts",
      formats: ["es"],
      name: "SupportOpsWidget",
    },
    rollupOptions: {
      output: {
        entryFileNames: "widget.js",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
