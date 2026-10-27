/**
 * Edge Function `gerar-material-aula`
 *
 * A equipe envia o documento da aula (PDF, Word ou texto). O Claude lê e
 * devolve três coisas: o texto de "Sobre a aula", as "Instruções" e o
 * conteúdo de um PDF de apoio. O PDF é montado aqui (pdf-lib), guardado
 * no depósito `materiais` e devolvido para a equipe revisar e pôr na aula.
 *
 * Quem pode: quem cria e edita aulas — pode('cur_editar'), conferido no
 * banco com a sessão de quem chamou. A chave da Anthropic vive só aqui
 * (segredo ANTHROPIC_API_KEY), nunca no navegador.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import mammoth from "npm:mammoth@1.8.0";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_IA = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const LIMITE = 20 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Material = {
  sobre: string;
  instrucoes: string;
  pdf: { titulo: string; subtitulo: string; secoes: { titulo: string; paragrafos: string[]; itens: string[] }[]; fechamento: string };
};

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sobre", "instrucoes", "pdf"],
  properties: {
    sobre: { type: "string" },
    instrucoes: { type: "string" },
    pdf: {
      type: "object",
      additionalProperties: false,
      required: ["titulo", "subtitulo", "secoes", "fechamento"],
      properties: {
        titulo: { type: "string" },
        subtitulo: { type: "string" },
        fechamento: { type: "string" },
        secoes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["titulo", "paragrafos", "itens"],
            properties: { titulo: { type: "string" }, paragrafos: { type: "array", items: { type: "string" } }, itens: { type: "array", items: { type: "string" } } },
          },
        },
      },
    },
  },
};

const SISTEMA = `Você prepara o material de apoio de uma aula de mentoria cristã (área de membros AIÓN), em português do Brasil.
Leia o documento da aula e escreva só com base nele — não invente ensinamentos, versículos, números ou promessas que não estejam no documento.
- "sobre": o texto "Sobre a aula" que a aluna lê embaixo do vídeo. 2 a 4 parágrafos curtos, separados por uma linha em branco, acolhedores e diretos. Pode destacar uma expressão-chave com *asteriscos*.
- "instrucoes": a primeira linha é um título curto; depois, os passos práticos que a aluna deve fazer, um por linha, começando com "1.", "2."...
- "pdf": o roteiro de um PDF de apoio para baixar: título, subtítulo de uma linha, de 3 a 6 seções (cada uma com parágrafos curtos e, quando fizer sentido, itens de lista) e uma frase de fechamento. Sem emojis.`;

/** Só o que as fontes padrão do PDF (WinAnsi) desenham. */
const limpar = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ•]/g, "");

function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of limpar(texto).split("\n")) {
    let atual = "";
    for (const p of par.split(/\s+/).filter(Boolean)) {
      const tenta = atual ? atual + " " + p : p;
      if (fonte.widthOfTextAtSize(tenta, tam) <= largura) atual = tenta;
      else { if (atual) linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  return linhas;
}

async function montarPdf(m: Material, aula: string, modulo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(limpar(m.pdf.titulo)); doc.setAuthor("AIÓN");
  const serif = await doc.embedFont(StandardFonts.TimesRoman), serifN = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica), sansN = await doc.embedFont(StandardFonts.HelveticaBold);
  const OURO = rgb(0.72, 0.58, 0.31), ESCURO = rgb(0.07, 0.06, 0.05), TEXTO = rgb(0.16, 0.14, 0.12), CINZA = rgb(0.42, 0.39, 0.35);
  const W = 595.28, H = 841.89, MX = 56, LARG = W - MX * 2;
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try { const r = await fetch("https://souaion.com/icone-192.png"); if (r.ok) logo = await doc.embedPng(new Uint8Array(await r.arrayBuffer())); } catch { /* sem logo */ }

  let pg: PDFPage = doc.addPage([W, H]), y = 0, n = 0;
  const rodape = (p: PDFPage) => { n++; p.drawLine({ start: { x: MX, y: 40 }, end: { x: W - MX, y: 40 }, thickness: 0.5, color: OURO }); p.drawText(limpar(`AIÓN · ${modulo}`), { x: MX, y: 26, size: 8, font: sans, color: CINZA }); p.drawText(String(n), { x: W - MX - 8, y: 26, size: 8, font: sans, color: CINZA }); };
  const novaPagina = () => { rodape(pg); pg = doc.addPage([W, H]); y = H - 64; };
  const espaco = (h: number) => { if (y - h < 60) novaPagina(); };

  // Capa: faixa escura com o logo e o título.
  pg.drawRectangle({ x: 0, y: H - 230, width: W, height: 230, color: ESCURO });
  pg.drawRectangle({ x: 0, y: H - 233, width: W, height: 3, color: OURO });
  if (logo) pg.drawImage(logo, { x: MX, y: H - 110, width: 56, height: 56 });
  pg.drawText(limpar(modulo.toUpperCase()), { x: MX, y: H - 138, size: 9, font: sansN, color: OURO });
  let ty = H - 168;
  for (const l of quebrar(m.pdf.titulo, serifN, 26, LARG)) { pg.drawText(l, { x: MX, y: ty, size: 26, font: serifN, color: rgb(0.96, 0.92, 0.84) }); ty -= 30; }
  y = H - 270;
  for (const l of quebrar(m.pdf.subtitulo || aula, serif, 14, LARG)) { pg.drawText(l, { x: MX, y, size: 14, font: serif, color: CINZA }); y -= 19; }
  y -= 14;

  for (const s of m.pdf.secoes) {
    espaco(60);
    pg.drawRectangle({ x: MX, y: y - 2, width: 3, height: 16, color: OURO });
    for (const l of quebrar(s.titulo, serifN, 16, LARG - 12)) { pg.drawText(l, { x: MX + 12, y, size: 16, font: serifN, color: ESCURO }); y -= 21; }
    y -= 4;
    for (const p of s.paragrafos) {
      for (const l of quebrar(p, sans, 10.5, LARG)) { espaco(16); pg.drawText(l, { x: MX, y, size: 10.5, font: sans, color: TEXTO }); y -= 15.5; }
      y -= 7;
    }
    for (const it of s.itens) {
      const ls = quebrar(it, sans, 10.5, LARG - 16);
      ls.forEach((l, k) => { espaco(16); if (k === 0) pg.drawText("•", { x: MX + 2, y, size: 10.5, font: sansN, color: OURO }); pg.drawText(l, { x: MX + 16, y, size: 10.5, font: sans, color: TEXTO }); y -= 15.5; });
      y -= 3;
    }
    y -= 12;
  }
  if (m.pdf.fechamento) {
    const ls = quebrar(m.pdf.fechamento, serif, 13, LARG - 40);
    espaco(ls.length * 18 + 30);
    pg.drawLine({ start: { x: MX, y: y + 6 }, end: { x: MX + 60, y: y + 6 }, thickness: 1, color: OURO }); y -= 14;
    for (const l of ls) { pg.drawText(l, { x: MX, y, size: 13, font: serif, color: ESCURO }); y -= 18; }
  }
  rodape(pg);
  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  // Quem chamou pode criar e editar aulas? O banco responde, com a sessão dela.
  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IA) return resposta({ erro: "sem_chave", mensagem: "A chave da IA ainda não foi cadastrada no Supabase." }, 503);

  let aulaId = "", nome = "", tipo = "", dados = "";
  try { const c = await req.json(); aulaId = String(c.aula_id ?? ""); nome = String(c.nome ?? ""); tipo = String(c.tipo ?? ""); dados = String(c.base64 ?? ""); }
  catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (!/^[0-9a-f-]{36}$/.test(aulaId) || !dados) return resposta({ erro: "corpo_invalido" }, 400);
  if (dados.length * 0.75 > LIMITE) return resposta({ erro: "grande", mensagem: "O arquivo passa de 20 MB." }, 413);

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
  const { data: aula } = await admin.from("aulas").select("titulo, modulos(titulo, produto_id)").eq("id", aulaId).maybeSingle();
  if (!aula) return resposta({ erro: "aula_nao_encontrada" }, 404);
  const mod = (aula as unknown as { modulos: { titulo: string; produto_id: string } | null }).modulos;

  // O documento como o Claude lê: PDF direto; Word e texto viram texto.
  const bytes = Uint8Array.from(atob(dados), (ch) => ch.charCodeAt(0));
  let documento: Anthropic.ContentBlockParam;
  const ehPdf = tipo === "application/pdf" || /\.pdf$/i.test(nome);
  const ehWord = /wordprocessingml|msword/.test(tipo) || /\.docx$/i.test(nome);
  try {
    if (ehPdf) documento = { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } };
    else {
      const texto = ehWord ? (await mammoth.extractRawText({ buffer: bytes })).value : new TextDecoder().decode(bytes);
      if (!texto.trim()) return resposta({ erro: "vazio", mensagem: "Não encontrei texto nesse arquivo." }, 400);
      documento = { type: "document", source: { type: "text", media_type: "text/plain", data: texto } };
    }
  } catch { return resposta({ erro: "ilegivel", mensagem: "Não consegui ler esse arquivo. Envie em PDF, Word (.docx) ou texto." }, 400); }

  const claude = new Anthropic({ apiKey: CHAVE_IA });
  let material: Material;
  try {
    const r = await claude.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{ role: "user", content: [documento, { type: "text", text: `Aula: ${aula.titulo}\nMódulo: ${mod?.titulo ?? ""}\n\nPrepare o material desta aula.` }] }],
    } as never) as Anthropic.Beta.BetaMessage;
    if (r.stop_reason === "refusal") return resposta({ erro: "recusa", mensagem: "A IA não conseguiu gerar o material deste documento." }, 422);
    if (r.stop_reason === "max_tokens") return resposta({ erro: "longo", mensagem: "O documento é longo demais para gerar de uma vez." }, 422);
    const txt = r.content.find((b) => b.type === "text");
    material = JSON.parse(txt && txt.type === "text" ? txt.text : "");
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA cadastrada no Supabase não foi aceita." }, 503);
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: "limite", mensagem: "A IA está ocupada. Tente de novo em instantes." }, 429);
    console.error("falha na IA", e instanceof Error ? e.message : e);
    return resposta({ erro: "ia", mensagem: "A IA não respondeu agora. Tente de novo." }, 502);
  }

  const pdf = await montarPdf(material, aula.titulo, mod?.titulo ?? "");
  const slug = aula.titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60);
  const caminho = `${mod?.produto_id ?? "aulas"}/${Date.now()}-material-${slug || "aula"}.pdf`;
  const up = await admin.storage.from("materiais").upload(caminho, pdf, { contentType: "application/pdf" });
  if (up.error) { console.error("falha ao guardar o PDF", up.error.message); return resposta({ erro: "indisponivel", mensagem: "Não consegui guardar o PDF. Tente de novo." }, 503); }
  const { data: link } = await admin.storage.from("materiais").createSignedUrl(caminho, 60 * 60);

  return resposta({ sobre: material.sobre, instrucoes: material.instrucoes, titulo_pdf: material.pdf.titulo, pdf_path: caminho, pdf_url: link?.signedUrl ?? "" });
});
