/**
 * Edge Function `cadastrar-colaborador`
 *
 * Irmã de `cadastrar-aluna`, e pelo mesmo motivo: criar uma conta exige
 * escrever em `auth.users`, e o navegador não pode — só a chave de
 * serviço pode.
 *
 * A diferença é quem abre a porta. Ali é a equipe inteira; aqui é só o
 * dono, conferido no banco e não no token. É a mesma regra que a 0023
 * grava nas funções de remover, bloquear e trocar código: a promessa de
 * que só o dono mexe na equipe não pode viver na tela.
 *
 * E o papel que vem no corpo é conferido contra uma lista de dois. Sem
 * isso, uma chamada montada à mão com `papel: "dono"` criaria um
 * segundo dono — que é exatamente a coisa que esta função existe para
 * impedir.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Domínio reservado, sem MX: nenhuma mensagem sai daqui. */
const DOMINIO_INTERNO = "equipe.mentoria-aion.invalid";

/** Os dois papéis que o dono pode criar. `dono` não está aqui. */
const PAPEIS = ["admin", "suporte"];

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

Deno.serve(async (req) => {
  const origem = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors(origem) });
  }
  if (req.method !== "POST") {
    return resposta({ erro: "metodo_nao_permitido" }, 405, origem);
  }

  const autorizacao = req.headers.get("Authorization") ?? "";
  if (!autorizacao.startsWith("Bearer ")) {
    return resposta({ erro: "sem_sessao" }, 401, origem);
  }

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: quem, error: erroQuem } = await admin.auth.getUser(
    autorizacao.replace("Bearer ", ""),
  );
  if (erroQuem || !quem?.user) {
    return resposta({ erro: "sessao_invalida" }, 401, origem);
  }

  // Quem está pedindo? A resposta vem do banco. O dono cria
  // administrador e suporte; o administrador, só suporte (0040).
  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .select("papel, status")
    .eq("id", quem.user.id)
    .single();

  if (
    erroPerfil || perfil?.status !== "ativa" ||
    (perfil?.papel !== "dono" && perfil?.papel !== "admin")
  ) {
    return resposta({ erro: "sem_permissao" }, 403, origem);
  }

  let nome = "";
  let login = "";
  let codigo = "";
  let papel = "";
  try {
    const corpo = await req.json();
    nome = String(corpo?.nome ?? "").trim();
    login = String(corpo?.login ?? "").trim().toLowerCase();
    codigo = String(corpo?.codigo ?? "").trim();
    papel = String(corpo?.papel ?? "").trim();
  } catch {
    return resposta({ erro: "corpo_invalido" }, 400, origem);
  }

  if (!PAPEIS.includes(papel)) {
    return resposta(
      { erro: "papel_invalido", mensagem: "Escolha suporte ou administrador." },
      400,
      origem,
    );
  }
  if (perfil?.papel === "admin" && papel !== "suporte") {
    return resposta(
      { erro: "sem_permissao", mensagem: "Só o dono adiciona administradores." },
      403,
      origem,
    );
  }
  // Sem código no pedido, o código nasce aqui, no servidor.
  if (codigo === "") {
    const sorteio = new Uint32Array(1);
    crypto.getRandomValues(sorteio);
    codigo = String(1000 + (sorteio[0] % 9000));
  }
  if (nome.length < 2 || nome.length > 80) {
    return resposta(
      { erro: "nome_invalido", mensagem: "Informe o nome de quem vai usar." },
      400,
      origem,
    );
  }
  if (!/^[a-z0-9._-]{2,40}$/.test(login)) {
    return resposta(
      {
        erro: "login_invalido",
        mensagem: "O nome de acesso aceita letras minúsculas, números, ponto, hífen e sublinhado.",
      },
      400,
      origem,
    );
  }
  if (!/^[0-9]{4,6}$/.test(codigo)) {
    return resposta(
      { erro: "codigo_invalido", mensagem: "O código tem de 4 a 6 números." },
      400,
      origem,
    );
  }

  // O nome de acesso é único no aplicativo inteiro, aluna ou não: é por
  // ele que `verificar_codigo()` acha a pessoa.
  const { data: jaExiste } = await admin
    .from("profiles")
    .select("id")
    .eq("login", login)
    .maybeSingle();

  if (jaExiste) {
    return resposta(
      { erro: "login_em_uso", mensagem: "Já existe alguém com este nome de acesso." },
      409,
      origem,
    );
  }

  const senhaDescartavel = crypto.randomUUID() + crypto.randomUUID();

  const { data: conta, error: erroConta } = await admin.auth.admin.createUser({
    email: `${login}@${DOMINIO_INTERNO}`,
    password: senhaDescartavel,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (erroConta || !conta?.user) {
    console.error("falha ao criar a conta no Auth", erroConta?.message);
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  const { error: erroPerfilNovo } = await admin
    .from("profiles")
    .insert({ id: conta.user.id, nome, login, papel, status: "ativa" });

  if (erroPerfilNovo) {
    await admin.auth.admin.deleteUser(conta.user.id);
    console.error("falha ao criar o perfil", erroPerfilNovo.message);
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  const { error: erroCredencial } = await admin
    .from("credenciais")
    .insert({ aluna_id: conta.user.id, codigo });

  if (erroCredencial) {
    await admin.auth.admin.deleteUser(conta.user.id);
    console.error("falha ao gravar a credencial", erroCredencial.message);
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  return resposta({ id: conta.user.id, nome, login, papel, codigo }, 201, origem);
});
