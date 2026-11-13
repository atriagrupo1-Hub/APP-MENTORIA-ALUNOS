import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/** Build do app da aluna para a página de apresentação (?demo=1), no depósito `previa`, pasta a/. */
const SUPA = process.env.VITE_SUPABASE_URL ?? "";
/** O CSS da tela vai à parte (scripts/previa.sh envia o arquivo direto), para mudança só de CSS sair em segundos. */
const cssFora = { name: "css-fora", enforce: "pre" as const, resolveId: (s: string, de?: string) => (s === "./area.css" && de?.endsWith("area.ts") ? "\0css-fora" : null), load: (id: string) => (id === "\0css-fora" ? "" : null) };
export default defineConfig({
  plugins: [cssFora],
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
