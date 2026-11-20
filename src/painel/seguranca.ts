/**
 * Login da equipe com e-mail e senha, recuperação por e-mail e 2FA (0138).
 *
 * A tela só pede; quem decide é o servidor: a função `conta-equipe` grava
 * e-mail e senha, a `entrar` recusa o código de quem já tem senha própria,
 * e o banco só trata como equipe a sessão que passou pelo 2FA (aal2).
 */
import { supabase } from "@/data/supabase";

export type ModoLogin = "email" | "codigo" | "esqueci" | "2fa" | "novaSenha";

/** Situação de segurança de quem está no painel. */
export type Situacao = {
  email: string;
  senhaPropria: boolean;
  fator2fa: string | null;
};

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string;
const CHAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

/** O link do e-mail de recuperação volta para a página em que a pessoa está (o painel). */
export const veioDoLinkDeSenha = typeof location !== "undefined" && /type=recovery/.test(location.hash);

function traduzir(m: string): string {
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
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
  return { email, senhaPropria: u.app_metadata?.senha_propria === true, fator2fa: f?.totp.find((x) => x.status === "verified")?.id ?? null };
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
