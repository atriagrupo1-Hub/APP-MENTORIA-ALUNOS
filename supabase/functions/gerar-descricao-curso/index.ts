/**
 * Edge Function `gerar-descricao-curso`
 *
 * Criar novo curso · 01 Dados iniciais: a equipe envia o documento do
 * conteúdo (PDF, Word ou texto) e o Claude escreve a descrição do curso
 * só com base nele. "anterior" pede uma versão diferente da última.
 *
 * Quem pode: pode('cur_editar'), conferido no banco com a sessão de quem
 * chamou. A chave da Anthropic vive só aqui (segredo ANTHROPIC_API_KEY).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import mammoth from "npm:mammoth@1.8.0";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_IA = Deno.env.get("ANTHROPIC_API_KEY") ?? Object.values(Deno.env.toObject()).find((v) => v.trim().startsWith("sk-ant-"))?.trim() ?? "";
const LIMITE = 20 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ESQUEMA = { type: "object", additionalProperties: false, required: ["descricao"], properties: { descricao: { type: "string" } } };

const SISTEMA = `Você escreve a descrição de um curso de uma área de membros de mentoria cristã (AIÓN), em português do Brasil.
Leia o documento do conteúdo e escreva só com base nele — não invente ensinamentos, versículos, números ou promessas que não estejam no documento.
A descrição aparece no card e na página do curso: 1 ou 2 parágrafos curtos (no máximo 600 caracteres no total), acolhedora e direta, dizendo o que a aluna vai encontrar e receber. Sem emojis, sem título, sem aspas em volta.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IA) return resposta({ erro: "sem_chave", mensagem: "A chave da IA ainda não foi cadastrada no Supabase." }, 503);

  let nomeArq = "", tipoArq = "", dados = "", nome = "", rotulo = "", tipo = "", categoria = "", anterior = "";
  try {
    const c = await req.json();
    nomeArq = String(c.arquivo_nome ?? ""); tipoArq = String(c.arquivo_tipo ?? ""); dados = String(c.base64 ?? "");
    nome = String(c.nome ?? "").slice(0, 200); rotulo = String(c.rotulo ?? "").slice(0, 60); tipo = String(c.tipo ?? "").slice(0, 40);
    categoria = String(c.categoria ?? "").slice(0, 120); anterior = String(c.anterior ?? "").slice(0, 3000);
  } catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (!dados) return resposta({ erro: "sem_documento", mensagem: "Envie o documento do conteúdo." }, 400);
  if (dados.length * 0.75 > LIMITE) return resposta({ erro: "grande", mensagem: "O arquivo passa de 20 MB." }, 413);

  const bytes = Uint8Array.from(atob(dados), (ch) => ch.charCodeAt(0));
  let documento: Anthropic.ContentBlockParam;
  const ehPdf = tipoArq === "application/pdf" || /\.pdf$/i.test(nomeArq);
  const ehWord = /wordprocessingml|msword/.test(tipoArq) || /\.docx$/i.test(nomeArq);
  try {
    if (ehPdf) documento = { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } };
    else {
      const texto = ehWord ? (await mammoth.extractRawText({ buffer: bytes })).value : new TextDecoder().decode(bytes);
      if (!texto.trim()) return resposta({ erro: "vazio", mensagem: "Não encontrei texto nesse arquivo." }, 400);
      documento = { type: "document", source: { type: "text", media_type: "text/plain", data: texto } };
    }
  } catch { return resposta({ erro: "ilegivel", mensagem: "Não consegui ler esse arquivo. Envie em PDF, Word (.docx) ou texto." }, 400); }

  const claude = new Anthropic({ apiKey: CHAVE_IA });
  try {
    const r = await claude.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{ role: "user", content: [documento, { type: "text", text: `Tipo: ${tipo || "-"}\nTexto em cima do nome: ${rotulo || "-"}\nNome do curso: ${nome || "-"}\nCategoria: ${categoria || "-"}\n\nEscreva a descrição deste curso.`
        + (anterior.trim() ? `\n\nEscreva uma versão diferente desta anterior:\n${anterior.trim()}` : "") }] }],
    } as never) as Anthropic.Beta.BetaMessage;
    if (r.stop_reason === "refusal") return resposta({ erro: "recusa", mensagem: "A IA não conseguiu gerar a descrição deste documento." }, 422);
    const txt = r.content.find((b) => b.type === "text");
    const out = JSON.parse(txt && txt.type === "text" ? txt.text : "");
    return resposta({ descricao: String(out.descricao ?? "").trim() });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA cadastrada no Supabase não foi aceita." }, 503);
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: "limite", mensagem: "A IA está ocupada. Tente de novo em instantes." }, 429);
    console.error("falha na IA", e instanceof Error ? e.message : e);
    return resposta({ erro: "ia", mensagem: "A IA não respondeu agora. Tente de novo." }, 502);
  }
});
