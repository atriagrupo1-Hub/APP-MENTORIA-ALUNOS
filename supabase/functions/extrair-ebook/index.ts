/**
 * Edge Function `extrair-ebook`
 *
 * Criar novo curso · 02 Conteúdo (e-book): o painel lê o texto do e-book no
 * navegador e manda aqui. O Claude separa o que dá para oferecer à aluna à
 * parte: um resumo, as orações (cada uma com o texto exato do e-book) e
 * outras práticas (receitas, rituais, meditações). Não grava nada.
 *
 * Quem pode: pode('cur_editar'). A chave da Anthropic vive só aqui.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_IA = Deno.env.get("ANTHROPIC_API_KEY") ?? Object.values(Deno.env.toObject()).find((v) => v.trim().startsWith("sk-ant-"))?.trim() ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ITEM = { type: "object", additionalProperties: false, required: ["titulo", "texto"], properties: { titulo: { type: "string" }, texto: { type: "string" } } };
const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["resumo", "oracoes", "outros"],
  properties: {
    resumo: { type: "string" },
    oracoes: { type: "array", items: ITEM },
    outros: { type: "array", items: { type: "object", additionalProperties: false, required: ["tipo", "titulo", "texto"], properties: { tipo: { type: "string", enum: ["receita", "ritual", "pratica", "meditacao", "afirmacao", "outro"] }, titulo: { type: "string" }, texto: { type: "string" } } } },
  },
};
const SISTEMA = `Você organiza o conteúdo de um e-book de uma mentoria cristã (área de membros AIÓN), em português do Brasil.
Leia o e-book e devolva:
- "resumo": um resumo fiel do e-book em 2 a 4 parágrafos curtos, separados por linha em branco.
- "oracoes": TODAS as orações, frases de oração e afirmações de fé que estão no e-book, cada uma com um título curto (o do e-book, se houver) e o texto copiado exatamente como está no e-book, sem resumir nem mudar palavras.
- "outros": receitas, rituais, práticas e meditações guiadas que a aluna pode seguir, cada uma com tipo, título e o texto/passos copiados do e-book.
Não invente nada que não esteja no e-book. Se não houver itens de um tipo, devolva a lista vazia. Sem emojis.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);
  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IA) return resposta({ erro: "sem_chave", mensagem: "A chave da IA ainda não foi cadastrada no Supabase." }, 503);
  let texto = "", nome = "";
  try { const c = await req.json(); texto = String(c.texto ?? "").slice(0, 600000); nome = String(c.nome ?? "").slice(0, 200); } catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (texto.trim().length < 200) return resposta({ erro: "vazio", mensagem: "Não encontrei texto suficiente no e-book." }, 400);
  const claude = new Anthropic({ apiKey: CHAVE_IA });
  try {
    const stream = claude.beta.messages.stream({
      model: "claude-opus-5-5", max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{ role: "user", content: [{ type: "document", source: { type: "text", media_type: "text/plain", data: texto }, title: nome || "E-book" }, { type: "text", text: "Organize este e-book." }] }],
    } as never);
    const r = await (stream as unknown as { finalMessage: () => Promise<Anthropic.Beta.BetaMessage> }).finalMessage();
    if (r.stop_reason === "refusal") return resposta({ erro: "recusa", mensagem: "A IA não conseguiu ler este e-book." }, 422);
    if (r.stop_reason === "max_tokens") return resposta({ erro: "longo", mensagem: "O e-book é longo demais para separar de uma vez." }, 422);
    const t = r.content.find((b) => b.type === "text");
    return resposta(JSON.parse(t && t.type === "text" ? t.text : "{}"));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA cadastrada no Supabase não foi aceita." }, 503);
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: "limite", mensagem: "A IA está ocupada. Tente de novo em instantes." }, 429);
    console.error("falha na IA", e instanceof Error ? e.message : e);
    return resposta({ erro: "ia", mensagem: "A IA não respondeu agora. Tente de novo." }, 502);
  }
});
