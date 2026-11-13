import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/**
 * Build do modo prévia: só o painel, com endereço base no depósito `previa`
 * do Supabase. Usado por `npm run previa` (build em modo vigia + envio).
 */
const SUPA = process.env.VITE_SUPABASE_URL ?? "";
/** O CSS da tela vai à parte (scripts/previa.sh envia o arquivo direto), para mudança só de CSS sair em segundos. */
const cssFora = { name: "css-fora", enforce: "pre" as const, resolveId: (s: string, de?: string) => (s === "./painel.css" && de?.endsWith("painel.ts") ? "\0css-fora" : null), load: (id: string) => (id === "\0css-fora" ? "" : null) };
export default defineConfig({
  plugins: [cssFora],
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
