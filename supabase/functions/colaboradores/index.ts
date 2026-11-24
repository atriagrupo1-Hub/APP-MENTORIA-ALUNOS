/**
 * Edge Function `colaboradores` (0144) — gestão da equipe, só o dono principal.
 *
 * Ações (POST { acao, ... }, com a sessão do dono; com 2FA, sessão aal2):
 *   convidar { nome, email, funcao, acesso, areas, produtos, modo: "link"|"email" }
 *     link  → cria a conta SEM senha e sem e-mail e devolve o link de convite
 *             (token aleatório de 32 bytes; o banco guarda só o SHA-256;
 *             vale 7 dias, uso único, até 10 tentativas)
 *     email → convite pelo Auth (inviteUserByEmail); a pessoa cria a senha pelo e-mail
 *   gerar_link { id }        → link novo para quem ainda não criou a senha (cancela o anterior)
 *   link_senha { id }        → link de nova senha (para copiar)
 *   enviar_link_senha { id } → manda o link de nova senha por e-mail
 *   salvar_acesso { id, acesso, areas, produtos } · salvar_funcao { id, funcao } · salvar_nome { id, nome }
 *   bloquear { id } / ativar { id } → corta na hora: status, usuarios_bloqueados, ban no Auth
 *   remover { id }
 * O dono principal não pode ter o acesso mudado, ser bloqueado nem removido.
 *
 * Central (0145): quem é Admin da Central também gerencia (menos o dono e
 * outros Admins da Central). Só o dono cria ou tira Admin da Central.
 *   convidar … paineis { slug: "ver"|"editar"|"admin" }, admin_central, destino: "central"|"admin"
 *   salvar_paineis { id, paineis, admin_central? } · bloquear_painel { id, slug, bloqueado }
 * Tudo que muda vai para `historico_central` e para o app_metadata (paineis, admin_central).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAINEL_PADRAO = "https://souaion.com/admin";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AREAS = ["inicio", "alunas", "engajamento", "comentarios", "cursos", "layout", "config", "lixeira", "reduzir"];
const TIPOS = ["admin", "personalizado", "leitura", "conteudo"];

const ORIGENS = (Deno.env.get("ORIGENS_PERMITIDAS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
function cors(origem: string | null): Record<string, string> {
  const ok = ORIGENS.length === 0 ? (origem ?? "*") : ORIGENS.includes(origem ?? "") ? origem! : ORIGENS[0];
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (corpo: unknown, status: number, origem: string | null) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(origem), "Content-Type": "application/json" } });
const erro = (codigo: string, mensagem: string, status: number, origem: string | null) => json({ erro: codigo, mensagem }, status, origem);

function nivelDoToken(token: string): string {
  try {
    const meio = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(meio + "=".repeat((4 - (meio.length % 4)) % 4)))?.aal ?? "aal1";
  } catch { return "aal1"; }
}
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function tokenNovo() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** Tipo de acesso → papel no banco e mapa de áreas. */
function normalizarAcesso(tipo: string, areas: unknown): { papel: string; areas: Record<string, string> } {
  if (tipo === "admin") return { papel: "admin", areas: {} };
  if (tipo === "leitura") return { papel: "suporte", areas: Object.fromEntries(AREAS.map((a) => [a, "ver"])) };
  if (tipo === "conteudo") return { papel: "suporte", areas: { cursos: "editar", layout: "editar" } };
  const out: Record<string, string> = {};
  if (areas && typeof areas === "object") {
    for (const [k, v] of Object.entries(areas as Record<string, unknown>)) if (AREAS.includes(k) && (v === "ver" || v === "editar")) out[k] = v;
  }
  return { papel: "suporte", areas: out };
}
const uuids = (x: unknown) => Array.isArray(x) ? x.map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s)) : null;

Deno.serve(async (req) => {
  const origem = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origem) });
  if (req.method !== "POST") return erro("metodo", "Método não permitido.", 405, origem);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return erro("sem_sessao", "Entre de novo no painel.", 401, origem);

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: quem } = await admin.auth.getUser(token);
  const eu = quem?.user;
  if (!eu) return erro("sem_sessao", "Entre de novo no painel.", 401, origem);
  const { data: meu } = await admin.from("profiles").select("nome, papel, status, dono_principal").eq("id", eu.id).maybeSingle();
  const { data: bloq } = await admin.from("usuarios_bloqueados").select("user_id").eq("user_id", eu.id).maybeSingle();
  const souDono = !!meu && meu.papel === "dono" && !!meu.dono_principal;
  const { data: adm } = await admin.from("acessos_painel").select("nivel, bloqueado").eq("usuario_id", eu.id).eq("painel_slug", "central").maybeSingle();
  const souAdminCentral = !!adm && adm.nivel === "admin" && !adm.bloqueado;
  if (!meu || meu.status !== "ativa" || bloq || (!souDono && !souAdminCentral)) {
    return erro("sem_permissao", "Só o dono e os Admins da Central gerenciam colaboradores.", 403, origem);
  }
  const { data: fatores } = await admin.auth.admin.mfa.listFactors({ userId: eu.id });
  if ((fatores?.factors ?? []).some((f) => f.status === "verified") && nivelDoToken(token) !== "aal2") {
    return erro("precisa_2fa", "Confirme o código de verificação antes.", 403, origem);
  }

  let c: Record<string, unknown> = {};
  try { c = await req.json(); } catch { return erro("corpo", "Pedido inválido.", 400, origem); }
  const acao = String(c.acao ?? "");
  const base = (() => { const o = origem && /^https?:\/\//.test(origem) ? origem : ""; return o ? o.replace(/\/$/, "") : PAINEL_PADRAO.replace(/\/admin$/, ""); })();
  const painel = base + (c.destino === "central" ? "/central" : "/admin");
  async function historico(tipo: string, alvo: { id?: string; nome?: string } | null, detalhe = "", slug: string | null = null) {
    await admin.from("historico_central").insert({ ator_id: eu!.id, ator_nome: meu!.nome, tipo, painel_slug: slug, alvo_id: alvo?.id ?? null, alvo_nome: alvo?.nome ?? null, detalhe });
  }
  const NIVEIS = ["ver", "editar", "admin"];
  async function slugsValidos() { const { data } = await admin.from("paineis").select("slug"); return new Set((data ?? []).map((x) => x.slug as string)); }
  /** Grava os painéis da pessoa e acerta o AION ADM (papel/áreas) quando o nível dele muda. */
  async function gravarPaineis(id: string, paineis: Record<string, unknown>, adminCentral: boolean | undefined) {
    const val = await slugsValidos();
    const { data: antes } = await admin.from("acessos_painel").select("painel_slug, nivel, bloqueado").eq("usuario_id", id);
    const A = new Map((antes ?? []).map((x) => [x.painel_slug as string, x]));
    for (const slug of val) {
      const n = String(paineis?.[slug] ?? "");
      if (!(slug in (paineis ?? {}))) continue;
      if (NIVEIS.includes(n)) await admin.from("acessos_painel").upsert({ usuario_id: id, painel_slug: slug, nivel: n, bloqueado: A.get(slug)?.bloqueado ?? false, atualizado_em: new Date().toISOString() });
      else await admin.from("acessos_painel").delete().eq("usuario_id", id).eq("painel_slug", slug);
    }
    if (adminCentral !== undefined && souDono) {
      if (adminCentral) await admin.from("acessos_painel").upsert({ usuario_id: id, painel_slug: "central", nivel: "admin", bloqueado: false });
      else await admin.from("acessos_painel").delete().eq("usuario_id", id).eq("painel_slug", "central");
    }
    const novo = String(paineis?.["aion-adm"] ?? "");
    if ("aion-adm" in (paineis ?? {}) && NIVEIS.includes(novo) && novo !== A.get("aion-adm")?.nivel) {
      const { data: pf } = await admin.from("profiles").select("acesso_tipo, areas").eq("id", id).maybeSingle();
      const tipo = novo === "admin" ? "admin" : novo === "ver" ? "leitura" : (pf?.acesso_tipo === "personalizado" || pf?.acesso_tipo === "conteudo") && Object.keys(pf?.areas ?? {}).length ? pf!.acesso_tipo : "personalizado";
      const n = tipo === "personalizado" && !(pf?.acesso_tipo === "personalizado" && Object.keys(pf?.areas ?? {}).length) ? normalizarAcesso("personalizado", Object.fromEntries(AREAS.map((a) => [a, "editar"]))) : normalizarAcesso(tipo, pf?.areas);
      await admin.from("profiles").update({ papel: n.papel, acesso_tipo: tipo, areas: n.areas }).eq("id", id);
    }
    await espelharPaineis(id);
  }
  async function espelharPaineis(id: string) {
    const { data } = await admin.from("acessos_painel").select("painel_slug, nivel, bloqueado").eq("usuario_id", id);
    const pain: Record<string, string> = {}; let ac = false;
    for (const x of data ?? []) { if (x.painel_slug === "central") ac = x.nivel === "admin" && !x.bloqueado; else if (!x.bloqueado) pain[x.painel_slug] = x.nivel; }
    await espelhar(id, { paineis: pain, admin_central: ac });
  }

  /** Cria um link de convite novo para a pessoa (cancela os anteriores). */
  async function novoLink(userId: string) {
    await admin.from("convites_equipe").update({ cancelado_em: new Date().toISOString() }).eq("user_id", userId).is("usado_em", null).is("cancelado_em", null);
    const t = tokenNovo();
    const { error } = await admin.from("convites_equipe").insert({ user_id: userId, token_hash: await sha256(t), criado_por: eu!.id });
    if (error) throw new Error(error.message);
    return `${painel}#/convite?t=${t}`;
  }
  async function alvoValido(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { data } = await admin.from("profiles").select("id, nome, papel, dono_principal, status").eq("id", id).maybeSingle();
    if (!data || !["dono", "admin", "suporte"].includes(data.papel)) return null;
    return data;
  }
  async function espelhar(id: string, extra: Record<string, unknown>) {
    const { data } = await admin.auth.admin.getUserById(id);
    await admin.auth.admin.updateUserById(id, { app_metadata: { ...(data?.user?.app_metadata ?? {}), ...extra } });
  }

  try {
    if (acao === "convidar") {
      const nome = String(c.nome ?? "").trim().slice(0, 80);
      const email = String(c.email ?? "").trim().toLowerCase();
      const funcao = String(c.funcao ?? "").trim().slice(0, 40) || null;
      const tipo = String(c.acesso ?? "");
      const modo = c.modo === "email" ? "email" : "link";
      if (!nome) return erro("nome", "Escreva o nome.", 400, origem);
      if (!EMAIL.test(email)) return erro("email", "Confira o e-mail.", 400, origem);
      if (!TIPOS.includes(tipo)) return erro("acesso", "Escolha o tipo de acesso.", 400, origem);
      const { papel, areas } = normalizarAcesso(tipo, c.areas);
      const produtos = uuids(c.produtos);
      const meta = { dono: false, papel: tipo, permissoes: areas, funcao, bloqueado: false, senha_propria: false };
      let userId = "";
      if (modo === "email") {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo: painel });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return erro("email_em_uso", "Este e-mail já tem uma conta.", 400, origem);
          console.error("convite por e-mail", error.message);
          return erro("email_falhou", "Não foi possível enviar o convite por e-mail agora. Use o convite por link.", 503, origem);
        }
        userId = data.user.id;
        await admin.auth.admin.updateUserById(userId, { app_metadata: { ...(data.user.app_metadata ?? {}), ...meta } });
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nome }, app_metadata: meta });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return erro("email_em_uso", "Este e-mail já tem uma conta.", 400, origem);
          throw new Error(error.message);
        }
        userId = data.user.id;
      }
      const login = (email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "equipe") + "." + userId.slice(0, 4);
      const { error: ep } = await admin.from("profiles").upsert({ id: userId, nome, login, email, papel, status: "ativa", acesso_tipo: tipo, areas, funcao, produtos_vis: produtos, dono_principal: false });
      if (ep) { await admin.auth.admin.deleteUser(userId); throw new Error(ep.message); }
      // Painéis: o que veio da Central; do AION ADM, o próprio AION ADM no nível do acesso escolhido.
      const paineis = (c.paineis && typeof c.paineis === "object") ? c.paineis as Record<string, unknown> : { "aion-adm": tipo === "admin" ? "admin" : tipo === "leitura" ? "ver" : "editar" };
      await gravarPaineis(userId, paineis, c.admin_central === true ? true : undefined);
      const link = modo === "link" ? await novoLink(userId) : null;
      await historico("criou", { id: userId, nome }, modo === "link" ? "convite por link" : "convite por e-mail");
      return json({ ok: true, id: userId, link, painel, modo }, 200, origem);
    }

    const id = String(c.id ?? "");
    const alvo = await alvoValido(id);
    if (!alvo) return erro("nao_encontrado", "Colaborador não encontrado.", 404, origem);
    // Admin da Central não mexe no dono nem em outro Admin da Central.
    if (!souDono && id !== eu.id) {
      const { data: ac } = await admin.from("acessos_painel").select("nivel").eq("usuario_id", id).eq("painel_slug", "central").maybeSingle();
      if (alvo.dono_principal || ac?.nivel === "admin") return erro("sem_permissao", "Só o dono mexe em outro Admin da Central.", 403, origem);
    }
    const { data: contaAlvo } = await admin.auth.admin.getUserById(id);
    const emailAlvo = contaAlvo?.user?.email ?? "";

    if (acao === "gerar_link") {
      if (contaAlvo?.user?.app_metadata?.senha_propria === true) return json({ ok: true, link: null, painel }, 200, origem);
      return json({ ok: true, link: await novoLink(id), painel }, 200, origem);
    }
    if (acao === "link_senha" || acao === "enviar_link_senha") {
      if (!emailAlvo || emailAlvo.endsWith(".invalid")) return erro("sem_email", "Esta pessoa ainda não tem e-mail.", 400, origem);
      if (acao === "enviar_link_senha") {
        const r = await fetch(`${URL_SUPABASE}/auth/v1/recover?redirect_to=${encodeURIComponent(painel)}`, { method: "POST", headers: { apikey: CHAVE_SERVICO, Authorization: `Bearer ${CHAVE_SERVICO}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: emailAlvo }) });
        if (!r.ok) return erro("email_falhou", "Não foi possível enviar o e-mail agora. Use “Copiar link de nova senha”.", 503, origem);
        return json({ ok: true }, 200, origem);
      }
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: emailAlvo, options: { redirectTo: painel } });
      if (error || !data?.properties?.action_link) throw new Error(error?.message ?? "sem link");
      return json({ ok: true, link: data.properties.action_link }, 200, origem);
    }
    if (acao === "salvar_nome") {
      const nome = String(c.nome ?? "").trim().slice(0, 80);
      if (!nome) return erro("nome", "Escreva o nome.", 400, origem);
      await admin.from("profiles").update({ nome }).eq("id", id);
      return json({ ok: true }, 200, origem);
    }

    // Daqui para baixo, nunca o dono principal nem a própria conta.
    if (alvo.dono_principal || id === eu.id) return erro("dono", "O acesso do dono não pode ser mudado.", 400, origem);

    if (acao === "salvar_funcao") {
      const funcao = String(c.funcao ?? "").trim().slice(0, 40) || null;
      await admin.from("profiles").update({ funcao }).eq("id", id);
      await espelhar(id, { funcao });
      return json({ ok: true }, 200, origem);
    }
    if (acao === "salvar_paineis") {
      if (c.admin_central !== undefined && !souDono) return erro("sem_permissao", "Só o dono cria ou tira Admin da Central.", 403, origem);
      await gravarPaineis(id, (c.paineis ?? {}) as Record<string, unknown>, c.admin_central === undefined ? undefined : c.admin_central === true);
      await historico("acesso", { id, nome: alvo.nome }, "mudou o acesso aos painéis");
      return json({ ok: true }, 200, origem);
    }
    if (acao === "bloquear_painel") {
      const slug = String(c.slug ?? ""), b = c.bloqueado === true;
      const { error } = await admin.from("acessos_painel").update({ bloqueado: b, atualizado_em: new Date().toISOString() }).eq("usuario_id", id).eq("painel_slug", slug);
      if (error) throw new Error(error.message);
      await espelharPaineis(id);
      await historico(b ? "bloqueou" : "desbloqueou", { id, nome: alvo.nome }, "só neste painel", slug);
      return json({ ok: true }, 200, origem);
    }
    if (acao === "salvar_acesso") {
      const tipo = String(c.acesso ?? "");
      if (!TIPOS.includes(tipo)) return erro("acesso", "Escolha o tipo de acesso.", 400, origem);
      const { papel, areas } = normalizarAcesso(tipo, c.areas);
      const mud: Record<string, unknown> = { papel, acesso_tipo: tipo, areas };
      if ("produtos" in c) mud.produtos_vis = uuids(c.produtos);
      const { error } = await admin.from("profiles").update(mud).eq("id", id);
      if (error) throw new Error(error.message);
      await espelhar(id, { papel: tipo, permissoes: areas, dono: false });
      await admin.from("acessos_painel").upsert({ usuario_id: id, painel_slug: "aion-adm", nivel: tipo === "admin" ? "admin" : tipo === "leitura" ? "ver" : "editar" });
      await espelharPaineis(id);
      await historico("acesso", { id, nome: alvo.nome }, "mudou o acesso no AION ADM", "aion-adm");
      return json({ ok: true }, 200, origem);
    }
    if (acao === "bloquear") {
      await admin.from("profiles").update({ status: "bloqueada" }).eq("id", id);
      await admin.from("usuarios_bloqueados").upsert({ user_id: id, por: eu.id });
      const { data } = await admin.auth.admin.getUserById(id);
      await admin.auth.admin.updateUserById(id, { ban_duration: "876000h", app_metadata: { ...(data?.user?.app_metadata ?? {}), bloqueado: true } });
      await historico("bloqueou", { id, nome: alvo.nome }, "tudo");
      return json({ ok: true }, 200, origem);
    }
    if (acao === "ativar") {
      await admin.from("usuarios_bloqueados").delete().eq("user_id", id);
      await admin.from("profiles").update({ status: "ativa" }).eq("id", id);
      const { data } = await admin.auth.admin.getUserById(id);
      await admin.auth.admin.updateUserById(id, { ban_duration: "none", app_metadata: { ...(data?.user?.app_metadata ?? {}), bloqueado: false } });
      await historico("desbloqueou", { id, nome: alvo.nome }, "tudo");
      return json({ ok: true }, 200, origem);
    }
    if (acao === "remover") {
      await historico("removeu", { id, nome: alvo.nome });
      const { error } = await admin.from("profiles").delete().eq("id", id);
      if (error) throw new Error(error.message);
      const { error: ea } = await admin.auth.admin.deleteUser(id);
      if (ea) await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      return json({ ok: true }, 200, origem);
    }
    return erro("acao", "Ação desconhecida.", 400, origem);
  } catch (e) {
    console.error("colaboradores", acao, e instanceof Error ? e.message : e);
    return erro("indisponivel", "Não foi possível concluir agora. Tente de novo.", 503, origem);
  }
});
