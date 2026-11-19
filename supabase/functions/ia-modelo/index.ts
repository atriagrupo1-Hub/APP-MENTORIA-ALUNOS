/**
 * Edge Function `ia-modelo`
 *
 * As IAs da tela nova de Produtos e Categorias (o modelo aprovado embutido no
 * painel): descrição, corrigir texto, sugestões de botão, capa (SVG desenhado
 * pela IA, com imagens de referência) e conteúdo do PDF de material.
 * O modelo manda o pedido pronto (o mesmo texto que usa no claude.ai) e
 * recebe o texto da resposta.
 *
 * Quem pode: pode('cur_editar'), conferido no banco com a sessão de quem
 * chamou. A chave da Anthropic vive só aqui (segredo ANTHROPIC_API_KEY).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_IA = Deno.env.get("ANTHROPIC_API_KEY") ?? Object.values(Deno.env.toObject()).find((v) => v.trim().startsWith("sk-ant-"))?.trim() ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const TIPOS_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IA) return resposta({ erro: "sem_chave", mensagem: "A chave da IA ainda não foi cadastrada no Supabase." }, 503);

  let pedido = "", rapido = false, imagens: { tipo: string; base64: string }[] = [];
  try {
    const c = await req.json();
    pedido = String(c.pedido ?? "").slice(0, 400_000);
    rapido = c.nivel === "quick";
    imagens = (Array.isArray(c.imagens) ? c.imagens : []).slice(0, 3).filter((x: { tipo: string; base64: string }) => TIPOS_IMG.includes(x?.tipo) && typeof x.base64 === "string" && x.base64.length < 7_000_000);
  } catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (!pedido.trim()) return resposta({ erro: "vazio" }, 400);

  const claude = new Anthropic({ apiKey: CHAVE_IA });
  try {
    const r = await claude.messages.create({
      model: "claude-opus-5-5",
      max_tokens: rapido ? 2000 : 16000,
      messages: [{ role: "user", content: [
        ...imagens.map((x) => ({ type: "image" as const, source: { type: "base64" as const, media_type: x.tipo as "image/png", data: x.base64 } })),
        { type: "text" as const, text: pedido },
      ] }],
    });
    if (r.stop_reason === "refusal") return resposta({ erro: "recusa", mensagem: "A IA não conseguiu atender esse pedido." }, 422);
    const texto = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return resposta({ texto });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA cadastrada no Supabase não foi aceita." }, 503);
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: "limite", mensagem: "A IA está ocupada. Tente de novo em instantes." }, 429);
    console.error("falha na IA", e instanceof Error ? e.message : e);
    return resposta({ erro: "ia", mensagem: "A IA não respondeu agora. Tente de novo." }, 502);
  }
});
