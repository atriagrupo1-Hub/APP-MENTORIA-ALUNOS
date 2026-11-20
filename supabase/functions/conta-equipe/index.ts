/**
 * Edge Function `conta-equipe`
 *
 * Login da equipe com e-mail e senha (0138). Antes a equipe entrava como
 * os alunos, com login e código de 4 a 6 números. Agora cada pessoa da
 * equipe cria o próprio e-mail e senha de dentro do painel; a partir daí
 * o código deixa de abrir a conta dela (a função `entrar` recusa).
 *
 * Ações (POST, com a sessão de quem está no painel):
 *   - criar_login { email }: grava o e-mail (confirmado) da própria pessoa e a
 *     marca de senha própria. A senha já foi gravada pelo navegador.
 *   - senha_definida: só a marca, para quem já tem e-mail de verdade e criou
 *     a senha pelo link "Esqueci minha senha".
 *   - zerar_2fa { id }: quem gerencia a pessoa (pode_gerir) desliga a
 *     verificação em duas etapas dela, para quando ela perde o celular.
 *
 * Quem tem 2FA ativo só faz qualquer uma dessas ações com a sessão que
 * já passou pelo código (aal2).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_ANONIMA = Deno.env.get("SUPABASE_ANON_KEY")!;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ORIGENS = (Deno.env.get("ORIGENS_PERMITIDAS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function cabecalhosCors(origem: string | null): Record<string, string> {
  const permitida = ORIGENS.length === 0
    ? (origem ?? "*")
    : ORIGENS.includes(origem ?? "")
      ? origem!
      : ORIGENS[0];
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function resposta(corpo: unknown, status: number, origem: string | null): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(origem), "Content-Type": "application/json" },
  });
}

/** Nível da sessão (aal1/aal2), lido do próprio token já validado. */
function nivelDoToken(token: string): string {
  try {
    const meio = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(meio + "=".repeat((4 - (meio.length % 4)) % 4)))?.aal ?? "aal1";
  } catch {
    return "aal1";
  }
}

Deno.serve(async (req) => {
  const origem = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhosCors(origem) });
  if (req.method !== "POST") return resposta({ erro: "metodo_nao_permitido" }, 405, origem);

  const autorizacao = req.headers.get("Authorization") ?? "";
  if (!autorizacao.startsWith("Bearer ")) return resposta({ erro: "sem_sessao" }, 401, origem);
  const token = autorizacao.replace("Bearer ", "");

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta({ erro: "sessao_invalida" }, 401, origem);
  const eu = quem.user;

  const { data: perfil } = await admin
    .from("profiles")
    .select("papel, status")
    .eq("id", eu.id)
    .maybeSingle();
  if (!perfil || perfil.status !== "ativa" || !["dono", "admin", "suporte"].includes(perfil.papel)) {
    return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403, origem);
  }

  // Com 2FA ativo, a sessão precisa ter passado pelo código.
  const { data: fatores } = await admin.auth.admin.mfa.listFactors({ userId: eu.id });
  const tem2fa = (fatores?.factors ?? []).some((f) => f.status === "verified");
  if (tem2fa && nivelDoToken(token) !== "aal2") {
    return resposta({ erro: "precisa_2fa", mensagem: "Confirme o código de verificação antes." }, 403, origem);
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "corpo_invalido" }, 400, origem);
  }
  const acao = String(corpo?.acao ?? "");

  // A senha em si é gravada pelo navegador (supabase.auth.updateUser), que
  // mantém a sessão de quem está trocando; trocar pela API administrativa
  // derruba a sessão. Aqui só o que o navegador não pode: o e-mail
  // confirmado e a marca de "senha própria", que fecha o login por código.
  if (acao === "criar_login" || acao === "senha_definida") {
    const meta = { ...(eu.app_metadata ?? {}), senha_propria: true };
    const mudancas: Record<string, unknown> = { app_metadata: meta };
    if (acao === "criar_login") {
      const email = String(corpo?.email ?? "").trim().toLowerCase();
      if (!EMAIL.test(email) || email.endsWith(".invalid")) {
        return resposta({ erro: "email_invalido", mensagem: "Confira o e-mail." }, 400, origem);
      }
      mudancas.email = email;
      mudancas.email_confirm = true;
    } else if ((eu.email ?? "").endsWith(".invalid")) {
      return resposta({ erro: "sem_login", mensagem: "Crie primeiro seu e-mail e senha." }, 400, origem);
    }
    const { error } = await admin.auth.admin.updateUserById(eu.id, mudancas);
    if (error) {
      if (/already|registered|exists/i.test(error.message ?? "")) {
        return resposta({ erro: "email_em_uso", mensagem: "Este e-mail já está em uso." }, 400, origem);
      }
      console.error("falha ao gravar login", error.message);
      return resposta({ erro: "indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." }, 503, origem);
    }
    return resposta({ ok: true }, 200, origem);
  }

  // Trocar o e-mail de entrada: só com a senha atual (quem pegou uma sessão
  // aberta não consegue desviar o "Esqueci minha senha" para outro e-mail).
  if (acao === "trocar_email") {
    const email = String(corpo?.email ?? "").trim().toLowerCase();
    const senhaAtual = String(corpo?.senha_atual ?? "");
    if (!EMAIL.test(email) || email.endsWith(".invalid")) {
      return resposta({ erro: "email_invalido", mensagem: "Confira o e-mail." }, 400, origem);
    }
    if (!eu.app_metadata?.senha_propria || !eu.email) {
      return resposta({ erro: "sem_login", mensagem: "Crie primeiro seu e-mail e senha." }, 400, origem);
    }
    const teste = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHAVE_ANONIMA, "Content-Type": "application/json" },
      body: JSON.stringify({ email: eu.email, password: senhaAtual }),
    });
    if (!teste.ok) return resposta({ erro: "senha_errada", mensagem: "Senha atual incorreta." }, 400, origem);
    const { error } = await admin.auth.admin.updateUserById(eu.id, { email, email_confirm: true });
    if (error) {
      if (/already|registered|exists/i.test(error.message ?? "")) {
        return resposta({ erro: "email_em_uso", mensagem: "Este e-mail já está em uso." }, 400, origem);
      }
      return resposta({ erro: "indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." }, 503, origem);
    }
    return resposta({ ok: true }, 200, origem);
  }

  if (acao === "zerar_2fa") {
    const alvo = String(corpo?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(alvo)) return resposta({ erro: "id_invalido" }, 400, origem);
    // A regra de quem gerencia quem é a mesma do banco, conferida com a sessão de quem pede.
    const comoEu = createClient(URL_SUPABASE, CHAVE_ANONIMA, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: podeGerir } = await comoEu.rpc("pode_gerir", { p_id: alvo });
    if (podeGerir !== true) return resposta({ erro: "sem_permissao", mensagem: "Acesso bloqueado." }, 403, origem);
    const { data: dele } = await admin.auth.admin.mfa.listFactors({ userId: alvo });
    for (const f of dele?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ userId: alvo, id: f.id });
    }
    return resposta({ ok: true }, 200, origem);
  }

  return resposta({ erro: "acao_invalida" }, 400, origem);
});
