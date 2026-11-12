import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/** Build do app da aluna para a página de apresentação (?demo=1), no depósito `previa`, pasta a/. */
const SUPA = process.env.VITE_SUPABASE_URL ?? "";
export default defineConfig({
  base: `${SUPA}/storage/v1/object/public/previa/a/`,
  define: { __VERSAO__: JSON.stringify("demo") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "dist-app-previa",
    emptyOutDir: true,
    manifest: true,
    minify: false,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { input: { app: fileURLToPath(new URL("./src/previa-app-entrada.ts", import.meta.url)) }, preserveEntrySignatures: "exports-only" },
  },
});
