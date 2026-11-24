/**
 * Login da equipe com e-mail e senha, recuperação por e-mail e 2FA (0138).
 *
 * A tela só pede; quem decide é o servidor: a função `conta-equipe` grava
 * e-mail e senha, a `entrar` recusa o código de quem já tem senha própria,
 * e o banco só trata como equipe a sessão que passou pelo 2FA (aal2).
 */
import { supabase } from "@/data/supabase";

export type ModoLogin = "email" | "codigo" | "esqueci" | "2fa" | "novaSenha" | "convite";

/** Situação de segurança de quem está no painel. */
export type Situacao = {
  email: string;
  senhaPropria: boolean;
  fator2fa: string | null;
  /** Ações que também pedem o código (user_metadata.exigir_2fa). */
  exigir: string[];
};

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string;
const CHAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

/** O link do e-mail de recuperação volta para a página em que a pessoa está (o painel). */
export const veioDoLinkDeSenha = typeof location !== "undefined" && /type=(recovery|invite)/.test(location.hash);

export const BLOQUEADO = "Seu acesso a este painel foi bloqueado. Fale com o dono do painel.";

function traduzir(m: string): string {
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/banned/i.test(m)) return BLOQUEADO;
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (/invalid (totp|code)|expired|challenge/i.test(m)) return "Código incorreto ou vencido. Confira no aplicativo e digite de novo.";
  if (/network|fetch/i.test(m)) return "Não conseguimos falar com o servidor. Confira sua conexão.";
  return "Não foi possível concluir agora. Tente de novo em alguns instantes.";
}

export async function entrarComEmail(email: string, senha: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
  return error ? traduzir(error.message) : null;
}

/** A sessão existe, mas ainda falta o código do 2FA. */
export async function falta2fa(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

export async function confirmar2fa(codigo: string): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return traduzir(error.message);
  const fator = data?.totp.find((f) => f.status === "verified");
  if (!fator) return "Verificação em duas etapas não encontrada.";
  const r = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.replace(/\s/g, "") });
  return r.error ? traduzir(r.error.message) : null;
}

export async function enviarLinkDeSenha(email: string): Promise<string | null> {
  const destino = location.origin + location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: destino });
  // Não se diz se o e-mail existe: a resposta é a mesma.
  return error && /rate limit|too many/i.test(error.message) ? traduzir(error.message) : null;
}

async function contaEquipe(corpo: Record<string, unknown>): Promise<string | null> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return "Sua sessão terminou. Entre de novo.";
  try {
    const r = await fetch(`${URL_SUPABASE}/functions/v1/conta-equipe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.session.access_token}`, apikey: CHAVE, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return null;
    return (j?.mensagem as string) || traduzir(String(j?.erro ?? ""));
  } catch {
    return traduzir("network");
  }
}

function erroDeSenha(m: string): string {
  if (/pwned|leak|compromised/i.test(m)) return "Essa senha já apareceu em vazamentos na internet. Escolha outra.";
  if (/same|different from the old/i.test(m)) return "A senha nova precisa ser diferente da atual.";
  if (/weak|short|characters/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres, com letras e números.";
  if (/aal2|mfa/i.test(m)) return "Confirme antes o código de verificação em duas etapas.";
  return traduzir(m);
}

/**
 * Grava e-mail e senha da própria pessoa. A senha vai primeiro (pelo
 * navegador, que mantém a sessão); só depois o servidor fecha o login por
 * código. Assim ninguém fica sem nenhuma forma de entrar.
 */
export async function criarLogin(email: string, senha: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return erroDeSenha(error.message);
  const erro = await contaEquipe({ acao: "criar_login", email: email.trim().toLowerCase() });
  if (!erro) await supabase.auth.refreshSession();
  return erro;
}

export async function trocarSenha(senha: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return erroDeSenha(error.message);
  const { data } = await supabase.auth.getUser();
  if (data.user && data.user.app_metadata?.senha_propria !== true) {
    const erro = await contaEquipe({ acao: "senha_definida" });
    if (!erro) await supabase.auth.refreshSession();
  }
  return null;
}

export async function situacao(): Promise<Situacao | null> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const { data: f } = await supabase.auth.mfa.listFactors();
  const email = u.email && !u.email.endsWith(".invalid") ? u.email : "";
  return { email, senhaPropria: u.app_metadata?.senha_propria === true, fator2fa: f?.totp.find((x) => x.status === "verified")?.id ?? null, exigir: (u.user_metadata?.exigir_2fa as string[] | undefined) ?? [] };
}

/** Começa a ativar o 2FA: devolve o QR para o aplicativo autenticador. */
export async function iniciar2fa(): Promise<{ id: string; qr: string; segredo: string } | string> {
  const { data: f } = await supabase.auth.mfa.listFactors();
  for (const x of f?.all ?? []) if (x.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: x.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `AION ${new Date().toISOString().slice(0, 16)}`, issuer: "AION Painel" });
  if (error || !data) return traduzir(error?.message ?? "");
  return { id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function ativar2fa(id: string, codigo: string): Promise<string | null> {
  const r = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: codigo.replace(/\s/g, "") });
  return r.error ? traduzir(r.error.message) : null;
}

export async function desligar2fa(id: string): Promise<string | null> {
  const r = await supabase.auth.mfa.unenroll({ factorId: id });
  return r.error ? traduzir(r.error.message) : null;
}

/** Senha: as mesmas regras do servidor, para avisar antes de enviar. */
export function problemaDaSenha(senha: string, repetida: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return "Use letras e números na senha.";
  if (senha !== repetida) return "As duas senhas não são iguais.";
  return null;
}

/* ---------- como no Atria Track: olho na senha, 2FA por ação, sessões, equipe ---------- */

const OLHO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12C3.5 9.3 7 5 12 5s8.5 4.3 9.5 7c-1 2.7-4.5 7-9.5 7s-8.5-4.3-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const OLHO_RISCADO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 8.5 4.3 9.5 7a12.6 12.6 0 01-2.7 4M6.6 6.6C4.5 8 3.1 10 2.5 12c1 2.7 4.5 7 9.5 7a9.7 9.7 0 005.4-1.6"/></svg>`;

/** Campo de senha com o "olhinho" para mostrar ou esconder o que foi digitado. `attrs` já vem escapado. */
export function campoSenha(attrs: string): string {
  return `<span class="seg-senha"><input class="campo" type="password" ${attrs} /><button type="button" class="seg-olho" data-seg-olho aria-label="Mostrar senha" aria-pressed="false" title="Mostrar">${OLHO}</button></span>`;
}

/** Clique no olhinho: troca só o campo, sem redesenhar a tela (não perde o que foi digitado). */
export function ligarOlhos(raiz: Document | HTMLElement = document) {
  raiz.addEventListener("click", (e) => {
    const bt = (e.target as HTMLElement).closest?.<HTMLButtonElement>("[data-seg-olho]");
    if (!bt) return;
    e.preventDefault(); e.stopPropagation();
    const campo = bt.parentElement?.querySelector("input");
    if (!campo) return;
    const ver = campo.type === "password";
    campo.type = ver ? "text" : "password";
    bt.innerHTML = ver ? OLHO_RISCADO : OLHO;
    bt.setAttribute("aria-label", ver ? "Esconder senha" : "Mostrar senha");
    bt.setAttribute("aria-pressed", String(ver));
    bt.title = ver ? "Esconder" : "Mostrar";
    campo.focus();
  }, true);
}

/** Ações que podem pedir o código do 2FA (preferência de cada pessoa, em user_metadata.exigir_2fa). */
export const ACOES_2FA = [
  { value: "alunos", label: "Remover e bloquear alunos", acoes: ["remover-aluna", "lote-remover", "bloquear-aluna"] },
  { value: "conteudo", label: "Remover produtos, módulos e aulas", acoes: ["curso-remover", "mod-remover", "mods-excluir", "aula-remover", "lixo-excluir"] },
  { value: "equipe", label: "Adicionar, editar, bloquear e remover membros da equipe", acoes: ["equipe-nova", "equipe-editar", "equipe-bloquear", "equipe-desbloquear", "equipe-remover", "seg-zerar-2fa"] },
  { value: "codigos", label: "Ver e copiar códigos de acesso", acoes: ["ver-codigo", "copiar-acesso", "copiar-acesso-equipe"] },
] as const;

const PROTEGIVEIS = new Set<string>(ACOES_2FA.flatMap((g) => [...g.acoes]));
/** A ação está em algum grupo que pode pedir o código (conferência rápida, sem rede). */
export const acaoProtegivel = (acao: string) => PROTEGIVEIS.has(acao);

let confirmadoEm = 0;
let prefsCache: string[] | null = null;
export function esquecerPrefs() { prefsCache = null; confirmadoEm = 0; }

/** A ação pede o código? (só para quem tem 2FA ativo e marcou o grupo; vale 5 minutos depois de confirmar) */
export async function precisaCodigo(acao: string): Promise<string | null> {
  if (Date.now() - confirmadoEm < 5 * 60_000) return null;
  if (prefsCache === null) {
    const { data } = await supabase.auth.getUser();
    prefsCache = (data.user?.user_metadata?.exigir_2fa as string[] | undefined) ?? [];
  }
  if (!ACOES_2FA.some((g) => prefsCache!.includes(g.value) && (g.acoes as readonly string[]).includes(acao))) return null;
  const { data: f } = await supabase.auth.mfa.listFactors();
  return f?.totp.find((x) => x.status === "verified")?.id ?? null;
}

export async function salvarPrefs2fa(sel: string[]): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ data: { exigir_2fa: sel } });
  if (error) return "Não foi possível salvar agora. Tente novamente.";
  prefsCache = sel;
  return null;
}

/** Janela do código 2FA, por cima de tudo. Resolve `true` com o código certo, `false` se cancelar. */
export function pedirCodigo(fatorId: string, titulo = "Confirmação 2FA necessária", texto = "Para confirmar esta ação, digite o código gerado pelo aplicativo autenticador."): Promise<boolean> {
  return new Promise((resolver) => {
    const fundo = document.createElement("div");
    fundo.className = "modal-fundo seg-fundo";
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="segPedTit"><form class="seg-ped" novalidate>
      <h2 class="titulo" id="segPedTit"></h2><p class="explica"></p>
      <label class="grupo" style="margin-top:12px"><span class="rotulo">Código de 6 números</span><input class="campo seg-cod" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
      <p class="erro" hidden></p>
      <div class="rodape-modal" style="margin-top:14px"><button class="botao">Confirmar</button><button type="button" class="botao-neutro grande" data-seg-cancelar>Cancelar</button></div>
    </form></div>`;
    fundo.querySelector("h2")!.textContent = titulo;
    fundo.querySelector(".explica")!.textContent = texto;
    const campo = fundo.querySelector<HTMLInputElement>("input")!, erro = fundo.querySelector<HTMLElement>(".erro")!, bt = fundo.querySelector<HTMLButtonElement>("button.botao")!;
    const fechar = (ok: boolean) => { fundo.remove(); document.removeEventListener("keydown", esc, true); resolver(ok); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fechar(false); } };
    campo.addEventListener("input", () => { campo.value = campo.value.replace(/\D/g, "").slice(0, 6); });
    fundo.querySelector("[data-seg-cancelar]")!.addEventListener("click", () => fechar(false));
    fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(false); });
    fundo.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (campo.value.length !== 6) { erro.textContent = "Digite os 6 números."; erro.hidden = false; return; }
      bt.disabled = true; bt.textContent = "Verificando…";
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: campo.value });
      bt.disabled = false; bt.textContent = "Confirmar";
      if (r.error) { erro.textContent = traduzir(r.error.message); erro.hidden = false; campo.select(); return; }
      confirmadoEm = Date.now();
      fechar(true);
    });
    document.addEventListener("keydown", esc, true);
    document.body.appendChild(fundo);
    setTimeout(() => campo.focus(), 30);
  });
}

/** Desativar o 2FA pede o código antes (como no Atria Track). */
export async function desativar2fa(id: string): Promise<string | null | false> {
  const ok = await pedirCodigo(id, "Desativar a autenticação 2FA", "Para desativar a autenticação em dois fatores, digite o código gerado pelo aplicativo autenticador.");
  if (!ok) return false;
  const r = await supabase.auth.mfa.unenroll({ factorId: id });
  if (r.error) return traduzir(r.error.message);
  await supabase.auth.refreshSession();
  return null;
}

export async function trocarEmail(email: string, senhaAtual: string): Promise<string | null> {
  const erro = await contaEquipe({ acao: "trocar_email", email: email.trim().toLowerCase(), senha_atual: senhaAtual });
  if (!erro) await supabase.auth.refreshSession();
  return erro;
}

export async function sairDeTodos(): Promise<string | null> {
  const { error } = await supabase.auth.signOut({ scope: "global" });
  return error ? traduzir(error.message) : null;
}

/** E-mail, senha própria e 2FA de cada pessoa da equipe (só administrador e dono recebem). */
export type SegEquipe = { email: string; senhaPropria: boolean; tem2fa: boolean };
export async function segurancaDaEquipe(): Promise<Map<string, SegEquipe>> {
  const m = new Map<string, SegEquipe>();
  const { data } = await supabase.rpc("equipe_seguranca");
  for (const x of (data ?? []) as { id: string; email: string | null; senha_propria: boolean; tem_2fa: boolean }[]) m.set(x.id, { email: x.email ?? "", senhaPropria: !!x.senha_propria, tem2fa: !!x.tem_2fa });
  return m;
}

export async function zerar2faDe(id: string): Promise<string | null> {
  return contaEquipe({ acao: "zerar_2fa", id });
}
