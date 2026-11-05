import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/**
 * Build do modo prévia: só o painel, com endereço base no depósito `previa`
 * do Supabase. Usado por `npm run previa` (build em modo vigia + envio).
 */
const SUPA = process.env.VITE_SUPABASE_URL ?? "";
export default defineConfig({
  base: `${SUPA}/storage/v1/object/public/previa/b/`,
  define: { __VERSAO__: JSON.stringify("previa") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "dist-previa",
    emptyOutDir: false,
    manifest: true,
    minify: false,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { input: { painel: fileURLToPath(new URL("./src/previa-entrada.ts", import.meta.url)) }, preserveEntrySignatures: "exports-only" },
  },
});
