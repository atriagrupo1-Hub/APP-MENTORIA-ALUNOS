/**
 * Edge Function `gerar-capa`
 *
 * Cria a capa da aula com a IA de imagens da OpenAI, já com o texto
 * ("MÓDULO X • AULA Y" e o título) escrito na arte, no mesmo estilo das
 * capas que a mentoria já tem: até 3 capas prontas vão como modelo
 * (primeiro as do mesmo módulo), junto com as orientações de estilo que a
 * equipe guardou em Configurações (configuracoes.capa_guia, 0094).
 *
 * Quem pode: quem cria e edita aulas — pode('cur_editar'), conferido no
 * banco com a sessão de quem chamou. A chave da OpenAI vive só aqui.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// O segredo se chama OPENAI_API_KEY; se foi salvo com outro nome, vale o que tiver cara de chave da OpenAI.
const CHAVE_IMG = Deno.env.get("OPENAI_API_KEY")
  ?? Object.values(Deno.env.toObject()).map((v) => v.trim()).find((v) => v.startsWith("sk-") && !v.startsWith("sk-ant-")) ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IMG) return resposta({ erro: "sem_chave", mensagem: "A chave da IA de imagens ainda não foi cadastrada no Supabase." }, 503);

  let alvo = "aula", aulaId = "", moduloId = "", descricao = "", titulo = "", linha1 = "", retrato = false;
  try {
    const c = await req.json();
    alvo = ["modh", "modv"].includes(c.alvo) ? c.alvo : "aula"; moduloId = String(c.modulo_id ?? "");
    aulaId = String(c.aula_id ?? ""); descricao = String(c.descricao ?? "").slice(0, 1500);
    titulo = String(c.titulo ?? "").slice(0, 160); linha1 = String(c.linha1 ?? "").slice(0, 80); retrato = c.formato === "retrato";
  } catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (!/^[0-9a-f-]{36}$/.test(alvo === "aula" ? aulaId : moduloId) || !titulo.trim()) return resposta({ erro: "corpo_invalido" }, 400);

  // Os modelos: capas já feitas do mesmo tipo (aula; módulo deitada; módulo em pé), primeiro as mais próximas.
  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
  const { data: cfg } = await admin.from("configuracoes").select("capa_guia").maybeSingle();
  let caminhos: string[] = [];
  const valido = (p: unknown) => !!p && !String(p).startsWith("/") && !/^https?:/.test(String(p));
  if (alvo === "aula") {
    const { data: aula } = await admin.from("aulas").select("modulo_id").eq("id", aulaId).maybeSingle();
    const { data: capas } = await admin.from("aulas").select("capa_path, modulo_id").not("capa_path", "is", null).neq("id", aulaId).limit(60);
    caminhos = (capas ?? []).filter((x) => valido(x.capa_path))
      .sort((a, b) => Number(b.modulo_id === aula?.modulo_id) - Number(a.modulo_id === aula?.modulo_id)).map((x) => String(x.capa_path));
  } else {
    const col = alvo === "modh" ? "capa_horizontal_path" : "capa_path";
    const { data: mod } = await admin.from("modulos").select("produto_id").eq("id", moduloId).maybeSingle();
    const { data: capas } = await admin.from("modulos").select(`${col}, produto_id`).not(col, "is", null).neq("id", moduloId).limit(60);
    caminhos = ((capas ?? []) as Record<string, unknown>[]).filter((x) => valido(x[col]))
      .sort((a, b) => Number(b.produto_id === mod?.produto_id) - Number(a.produto_id === mod?.produto_id)).map((x) => String(x[col]));
  }
  // Capa deitada de módulo sem modelos ainda: as capas em pé dos módulos e as das aulas mostram o estilo.
  if (alvo === "modh" && caminhos.length < 3) {
    const { data: outras } = await admin.from("aulas").select("capa_path").not("capa_path", "is", null).limit(20);
    caminhos = caminhos.concat((outras ?? []).filter((x) => valido(x.capa_path)).map((x) => String(x.capa_path)));
  }
  caminhos = caminhos.slice(0, 3);
  const modelos: Blob[] = [];
  for (const p of caminhos) { const { data } = await admin.storage.from("capas").download(p); if (data) modelos.push(data); }

  const guia = String(cfg?.capa_guia ?? "").trim();
  const prompt = [
    modelos.length ? "As imagens enviadas são capas desta mesma mentoria. Crie UMA capa nova que pareça da mesma coleção: mesmo estilo de arte, mesma luz dourada sobre fundo escuro, mesma tipografia, mesmo tamanho e posição dos textos, mesmas cores." : "Capa de aula de mentoria cristã: arte cinematográfica, fundo escuro, luz dourada, tipografia condensada dourada.",
    guia ? `Orientações de estilo da mentoria (siga à risca):\n${guia}` : "",
    `Escreva na capa, exatamente assim, com acentos corretos e sem outras palavras:\n- Linha pequena: "${linha1.toUpperCase()}"\n- Título: "${titulo.toUpperCase()}"`,
    alvo === "aula" ? "" : `É a capa ${alvo === "modh" ? "deitada" : "em pé"} de um MÓDULO (não de uma aula).`,
    descricao.trim() ? `A arte desta capa deve mostrar: ${descricao.trim()}` : "Crie uma arte simbólica que represente o título.",
    retrato ? "Formato em pé." : "Formato horizontal. Deixe todo o texto e o elemento principal dentro da faixa central 16:9 (nada importante colado nas bordas de cima e de baixo).",
  ].filter(Boolean).join("\n\n");

  let r: Response;
  try {
    if (modelos.length) {
      const fd = new FormData();
      fd.append("model", "gpt-image-1"); fd.append("prompt", prompt); fd.append("size", retrato ? "1024x1536" : "1536x1024"); fd.append("quality", "high");
      modelos.forEach((m, i) => fd.append("image[]", new File([m], `modelo-${i + 1}.${(m.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: m.type || "image/png" })));
      r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${CHAVE_IMG}` }, body: fd });
    } else {
      r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { Authorization: `Bearer ${CHAVE_IMG}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: retrato ? "1024x1536" : "1536x1024", quality: "high", n: 1 }),
      });
    }
  } catch { return resposta({ erro: "ia", mensagem: "A IA de imagens não respondeu agora. Tente de novo." }, 502); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(j?.error?.message ?? ""), codigo = String(j?.error?.code ?? j?.error?.type ?? "");
    console.error("falha na IA de imagens", r.status, codigo, msg);
    if (r.status === 401) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA de imagens cadastrada no Supabase não foi aceita." }, 503);
    if (/quota|billing/i.test(codigo + msg)) return resposta({ erro: "sem_creditos", mensagem: "A conta da OpenAI está sem créditos. Coloque créditos em platform.openai.com → Billing e tente de novo." }, 402);
    if (r.status === 429) return resposta({ erro: "limite", mensagem: "A IA de imagens está ocupada. Tente de novo em instantes." }, 429);
    if (/verif/i.test(msg)) return resposta({ erro: "verificacao", mensagem: "A OpenAI pede para verificar a organização antes de liberar esse modelo de imagem (platform.openai.com → Settings → Organization → Verify)." }, 403);
    if (/safety|policy/i.test(msg)) return resposta({ erro: "recusa", mensagem: "A IA de imagens recusou essa descrição. Tente descrever de outro jeito." }, 422);
    return resposta({ erro: "ia", mensagem: "A IA de imagens não conseguiu gerar agora. Tente de novo." }, 502);
  }
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) return resposta({ erro: "ia", mensagem: "A IA de imagens não devolveu a imagem. Tente de novo." }, 502);
  return resposta({ imagem: `data:image/png;base64,${b64}`, modelos: modelos.length });
});
