/**
 * Edge Function `importar-video`
 *
 * Leva um vídeo de aula para o Cloudflare Stream a partir de um link (por
 * exemplo, o download de um arquivo do Google Drive) e liga o vídeo à aula.
 * O Stream baixa o arquivo sozinho; o vídeo nasce exigindo link assinado
 * (requireSignedURLs), como os outros — quem assina é `video-assinado`.
 *
 * Modos: "copiar" (manda o Stream buscar o vídeo e grava o uid na aula) e
 * "estado" (diz se o Stream já terminou de processar os uids pedidos).
 *
 * Quem pode: quem cria e edita aulas — pode('cur_editar'), conferido no banco.
 * O token da Cloudflare vive só aqui.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTA = Deno.env.get("CLOUDFLARE_CONTA") ?? "a54e4b1eed5a8b84d9b40ebf919d2a6f";
// O segredo se chama CLOUDFLARE_STREAM_TOKEN; se foi salvo com outro nome, vale o que tiver CLOUDFLARE no nome.
const TOKEN = Deno.env.get("CLOUDFLARE_STREAM_TOKEN")
  ?? Object.entries(Deno.env.toObject()).find(([k]) => /cloudflare/i.test(k) && !/conta/i.test(k))?.[1]?.trim() ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const cf = (caminho: string, init?: RequestInit) =>
  fetch(`https://api.cloudflare.com/client/v4/accounts/${CONTA}/stream${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }).then((r) => r.json());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!TOKEN) return resposta({ erro: "sem_chave", mensagem: "O token da Cloudflare ainda não foi cadastrado no Supabase." }, 503);

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return resposta({ erro: "corpo_invalido" }, 400); }

  if (c.modo === "estado") {
    const uids = (Array.isArray(c.uids) ? c.uids : []).map(String).filter((u) => /^[a-f0-9]{32}$/.test(u)).slice(0, 60);
    const out: Record<string, unknown> = {};
    for (const u of uids) {
      const j = await cf(`/${u}`);
      out[u] = j?.success ? { estado: j.result?.status?.state, erro: j.result?.status?.errorReasonText || null, duracao: j.result?.duration ?? null, pronto: !!j.result?.readyToStream, nome: j.result?.meta?.name ?? null } : { estado: "nao_encontrado", erro: j?.errors?.[0]?.message ?? null };
    }
    return resposta({ estados: out });
  }

  const aulaId = String(c.aula_id ?? ""), url = String(c.url ?? ""), nome = String(c.nome ?? "").slice(0, 200);
  if (!/^[0-9a-f-]{36}$/.test(aulaId) || !/^https:\/\//.test(url)) return resposta({ erro: "corpo_invalido" }, 400);

  const j = await cf("/copy", { method: "POST", body: JSON.stringify({ url, meta: { name: nome || aulaId }, requireSignedURLs: true }) });
  if (!j?.success) {
    const msg = j?.errors?.[0]?.message ?? "erro";
    console.error("falha no Stream", JSON.stringify(j?.errors ?? j));
    return resposta({ erro: "stream", mensagem: `A Cloudflare recusou: ${msg}` }, 502);
  }
  const uid = String(j.result?.uid ?? "");
  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
  const gravou = await admin.from("aula_midia").upsert({ aula_id: aulaId, video_provider: "stream", video_ref: uid });
  if (gravou.error) return resposta({ erro: "banco", mensagem: gravou.error.message, uid }, 500);
  return resposta({ uid });
});
