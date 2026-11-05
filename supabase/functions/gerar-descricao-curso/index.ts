/**
 * Edge Function `gerar-descricao-curso`
 *
 * Criar novo curso · 01 Dados iniciais: a equipe envia o documento do
 * conteúdo (PDF, Word ou texto) e o Claude escreve a descrição do curso
 * só com base nele. "anterior" pede uma versão diferente da última.
 *
 * Arquivos grandes: o painel sobe o documento para o depósito `materiais`
 * (pasta ia-temp/) e manda só o caminho. PDF acima de 20 MB vai para a IA
 * pela Files API da Anthropic (até 500 MB) e é apagado de lá em seguida.
 *
 * Quem pode: pode('cur_editar'), conferido no banco com a sessão de quem
 * chamou. A chave da Anthropic vive só aqui (segredo ANTHROPIC_API_KEY).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic, { toFile } from "npm:@anthropic-ai/sdk";
import mammoth from "npm:mammoth@1.8.0";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_IA = Deno.env.get("ANTHROPIC_API_KEY") ?? Object.values(Deno.env.toObject()).find((v) => v.trim().startsWith("sk-ant-"))?.trim() ?? "";
const LIMITE = 500 * 1024 * 1024, INLINE = 20 * 1024 * 1024;

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

/** Apaga documentos temporários da IA (materiais/ia-temp/) com mais de 24 horas: sobra de quem fechou a tela. */
async function limparTemp(admin: ReturnType<typeof createClient>) {
  try {
    const { data: pastas } = await admin.storage.from("materiais").list("ia-temp", { limit: 100 });
    const velhos: string[] = [];
    for (const p of pastas ?? []) {
      const { data: itens } = await admin.storage.from("materiais").list("ia-temp/" + p.name, { limit: 20 });
      for (const it of itens ?? []) if (it.created_at && Date.now() - Date.parse(it.created_at) > 864e5) velhos.push(`ia-temp/${p.name}/${it.name}`);
    }
    if (velhos.length) await admin.storage.from("materiais").remove(velhos);
  } catch { /* limpeza é de melhor esforço */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IA) return resposta({ erro: "sem_chave", mensagem: "A chave da IA ainda não foi cadastrada no Supabase." }, 503);

  let nomeArq = "", tipoArq = "", dados = "", caminho = "", nome = "", rotulo = "", tipo = "", categoria = "", anterior = "";
  try {
    const c = await req.json();
    nomeArq = String(c.arquivo_nome ?? ""); tipoArq = String(c.arquivo_tipo ?? ""); dados = String(c.base64 ?? ""); caminho = String(c.caminho ?? "");
    nome = String(c.nome ?? "").slice(0, 200); rotulo = String(c.rotulo ?? "").slice(0, 60); tipo = String(c.tipo ?? "").slice(0, 40);
    categoria = String(c.categoria ?? "").slice(0, 120); anterior = String(c.anterior ?? "").slice(0, 3000);
  } catch { return resposta({ erro: "corpo_invalido" }, 400); }
  let bytes: Uint8Array;
  if (caminho) {
    // Só a pasta temporária da IA; o resto do depósito não passa por aqui.
    if (!/^ia-temp\/[\w.-]+\/[\w.-]+$/.test(caminho)) return resposta({ erro: "caminho_invalido" }, 400);
    const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(limparTemp(admin));
    const { data: blob, error } = await admin.storage.from("materiais").download(caminho);
    if (error || !blob) return resposta({ erro: "sem_documento", mensagem: "Não encontrei o documento enviado. Envie de novo." }, 404);
    if (blob.size > LIMITE) return resposta({ erro: "grande", mensagem: "O arquivo passa de 500 MB." }, 413);
    bytes = new Uint8Array(await blob.arrayBuffer());
  } else if (dados) {
    bytes = Uint8Array.from(atob(dados), (ch) => ch.charCodeAt(0));
  } else return resposta({ erro: "sem_documento", mensagem: "Envie o documento do conteúdo." }, 400);

  const claude = new Anthropic({ apiKey: CHAVE_IA });
  // deno-lint-ignore no-explicit-any
  const arquivos = ((claude as any).files ?? (claude as any).beta.files) as { upload: (x: unknown) => Promise<{ id: string }>; delete: (id: string) => Promise<unknown> };
  let enviado = "";
  let documento: Anthropic.ContentBlockParam;
  const ehPdf = tipoArq === "application/pdf" || /\.pdf$/i.test(nomeArq);
  const ehWord = /wordprocessingml|msword/.test(tipoArq) || /\.docx$/i.test(nomeArq);
  try {
    if (ehPdf && bytes.length > INLINE) {
      const f = await arquivos.upload({ file: await toFile(bytes, nomeArq || "documento.pdf", { type: "application/pdf" }) });
      enviado = f.id;
      documento = { type: "document", source: { type: "file", file_id: f.id } } as unknown as Anthropic.ContentBlockParam;
    } else if (ehPdf) {
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      documento = { type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(bin) } };
    }
    else {
      const texto = ehWord ? (await mammoth.extractRawText({ buffer: bytes })).value : new TextDecoder().decode(bytes);
      if (!texto.trim()) return resposta({ erro: "vazio", mensagem: "Não encontrei texto nesse arquivo." }, 400);
      documento = { type: "document", source: { type: "text", media_type: "text/plain", data: texto } };
    }
  } catch (e) { console.error("leitura", e instanceof Error ? e.message : e); if (enviado) await arquivos.delete(enviado).catch(() => {}); return resposta({ erro: "ilegivel", mensagem: "Não consegui ler esse arquivo. Envie em PDF, Word (.docx) ou texto." }, 400); }

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
    const msg = e instanceof Error ? e.message : "";
    if (/page/i.test(msg) && /limit|exceed|maximum/i.test(msg)) return resposta({ erro: "paginas", mensagem: "O PDF tem páginas demais para a IA ler de uma vez (máximo 600)." }, 422);
    return resposta({ erro: "ia", mensagem: "A IA não respondeu agora. Tente de novo." }, 502);
  } finally {
    if (enviado) await arquivos.delete(enviado).catch(() => {});
  }
});
