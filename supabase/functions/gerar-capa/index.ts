/**
 * Edge Function `gerar-capa`
 *
 * Cria a arte de fundo da capa da aula com a IA de imagens da OpenAI,
 * sem texto: o painel escreve "MÓDULO X • AULA Y" e o título por cima, no
 * estilo das capas AIÓN, e a equipe decide se usa, refaz ou descarta.
 *
 * Quem pode: quem cria e edita aulas — pode('cur_editar'), conferido no
 * banco com a sessão de quem chamou. A chave da OpenAI vive só aqui.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
// O segredo se chama OPENAI_API_KEY; se foi salvo com outro nome, vale o que tiver cara de chave da OpenAI.
const CHAVE_IMG = Deno.env.get("OPENAI_API_KEY")
  ?? Object.values(Deno.env.toObject()).map((v) => v.trim()).find((v) => v.startsWith("sk-") && !v.startsWith("sk-ant-")) ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** O estilo das capas atuais: escuro, dourado, cinematográfico — e espaço livre para o título. */
const ESTILO = (retrato: boolean) => `Arte de capa para uma aula de mentoria cristã de prosperidade e transformação interior.
Estilo: cinematográfico, fundo quase preto, luz dourada intensa e quente, atmosfera espiritual e misteriosa, alto detalhe, aparência de pintura digital fotorrealista, tons de preto, dourado e âmbar.
Composição: ${retrato ? "o elemento principal na metade de cima; o terço de baixo escuro e limpo, para um título" : "o elemento principal na metade esquerda; o terço da direita escuro e limpo, para um título"}.
Proibido: qualquer texto, letra, número, logotipo ou marca d'água na imagem. Sem pessoas reconhecíveis.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  const doUsuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: pode } = await doUsuario.rpc("pode", { p_acao: "cur_editar" });
  if (pode !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403);
  if (!CHAVE_IMG) return resposta({ erro: "sem_chave", mensagem: "A chave da IA de imagens ainda não foi cadastrada no Supabase." }, 503);

  let descricao = "", aula = "", modulo = "", retrato = false;
  try { const c = await req.json(); descricao = String(c.descricao ?? "").slice(0, 1500); aula = String(c.aula ?? "").slice(0, 200); modulo = String(c.modulo ?? "").slice(0, 200); retrato = c.formato === "retrato"; }
  catch { return resposta({ erro: "corpo_invalido" }, 400); }
  if (!descricao.trim() && !aula.trim()) return resposta({ erro: "vazio", mensagem: "Descreva a imagem da capa." }, 400);

  const prompt = `${ESTILO(retrato)}\n\nTema da aula: ${aula}${modulo ? ` (módulo: ${modulo})` : ""}.\n${descricao.trim() ? `O que deve aparecer: ${descricao.trim()}` : "Crie uma imagem simbólica que represente o tema."}`;
  let r: Response;
  try {
    r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${CHAVE_IMG}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: retrato ? "1024x1536" : "1536x1024", quality: "high", n: 1 }),
    });
  } catch { return resposta({ erro: "ia", mensagem: "A IA de imagens não respondeu agora. Tente de novo." }, 502); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(j?.error?.message ?? "");
    console.error("falha na IA de imagens", r.status, msg);
    if (r.status === 401) return resposta({ erro: "chave_invalida", mensagem: "A chave da IA de imagens cadastrada no Supabase não foi aceita." }, 503);
    const codigo = String(j?.error?.code ?? j?.error?.type ?? "");
    if (/quota|billing/i.test(codigo + msg)) return resposta({ erro: "sem_creditos", mensagem: "A conta da OpenAI está sem créditos. Coloque créditos em platform.openai.com → Billing e tente de novo." }, 402);
    if (r.status === 429) return resposta({ erro: "limite", mensagem: "A IA de imagens está ocupada. Tente de novo em instantes." }, 429);
    if (/safety|policy/i.test(msg)) return resposta({ erro: "recusa", mensagem: "A IA de imagens recusou essa descrição. Tente descrever de outro jeito." }, 422);
    if (/verif/i.test(msg)) return resposta({ erro: "verificacao", mensagem: "A OpenAI pede para verificar a organização antes de liberar esse modelo de imagem." }, 403);
    return resposta({ erro: "ia", mensagem: "A IA de imagens não conseguiu gerar agora. Tente de novo." }, 502);
  }
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) return resposta({ erro: "ia", mensagem: "A IA de imagens não devolveu a imagem. Tente de novo." }, 502);
  return resposta({ imagem: `data:image/png;base64,${b64}` });
});
