/**
 * Edge Function `cadastrar-aluna`
 *
 * Criar uma aluna exige escrever em `auth.users`, e o navegador não pode
 * — só a chave de serviço pode. Por isso esta função existe.
 *
 * Diferente de `entrar`, aqui `verify_jwt` fica LIGADO: quem chama já
 * tem sessão. E não basta ter sessão: a função confere, no banco, que a
 * conta de quem chama é da equipe — dono, administrador ou suporte.
 * Ter um token válido de aluna não abre esta porta.
 *
 * As alunas não têm e-mail nem senha. O Auth exige um identificador, e
 * ele é derivado do nome de acesso num domínio reservado que não recebe
 * correio. A senha gravada é aleatória e nunca usada: o acesso é sempre
 * pelo código, conferido por `verificar_codigo()`.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Domínio reservado, sem MX: nenhuma mensagem sai daqui. */
const DOMINIO_INTERNO = "alunas.mentoria-aion.invalid";

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

  // Quem está chamando?
  const { data: quem, error: erroQuem } = await admin.auth.getUser(
    autorizacao.replace("Bearer ", ""),
  );
  if (erroQuem || !quem?.user) {
    return resposta({ erro: "sessao_invalida" }, 401, origem);
  }

  // É da equipe mesmo? A resposta vem do banco, não do token.
  //
  // Os três papéis cadastram aluna: o dono, o administrador e o
  // suporte. Quem não está nesta lista — uma aluna com sessão válida,
  // por exemplo — para aqui.
  const EQUIPE = ["dono", "admin", "suporte"];

  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .select("papel, status")
    .eq("id", quem.user.id)
    .single();

  if (erroPerfil || !EQUIPE.includes(perfil?.papel) || perfil?.status !== "ativa") {
    return resposta({ erro: "sem_permissao" }, 403, origem);
  }

  let nome = "";
  let login = "";
  let codigo = "";
  let celular = "";
  let entrada = "";
  let validade = "";
  try {
    const corpo = await req.json();
    nome = String(corpo?.nome ?? "").trim();
    login = String(corpo?.login ?? "").trim().toLowerCase();
    codigo = String(corpo?.codigo ?? "").trim();
    // Só os dígitos. Guardar "(11) 98765-4321" faria o mesmo número
    // virar dois na hora de procurar, e o link do WhatsApp não aceita
    // pontuação de qualquer jeito.
    celular = String(corpo?.celular ?? "").replace(/\D/g, "");
    entrada = String(corpo?.entrada ?? "").trim();
    validade = String(corpo?.validade ?? "").trim();
  } catch {
    return resposta({ erro: "corpo_invalido" }, 400, origem);
  }

  if (nome.length < 2 || nome.length > 80) {
    return resposta({ erro: "nome_invalido", mensagem: "Informe o nome da aluna." }, 400, origem);
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
  // O celular é opcional — muita aluna vem sem, e travar o cadastro por
  // causa disso seria pior que o campo vazio. Mas se veio, tem de ser um
  // número plausível: DDD e o número, ou com o código do país na frente.
  if (celular && (celular.length < 10 || celular.length > 15)) {
    return resposta(
      { erro: "celular_invalido", mensagem: "O celular precisa do DDD. Ex.: 11 98765-4321." },
      400,
      origem,
    );
  }

  // Entrada e validade (0040): datas AAAA-MM-DD. Sem entrada, hoje; sem
  // validade, um ano depois da entrada. A validade é o último dia de
  // acesso, até 23h59 no horário de Brasília.
  const ehData = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + "T12:00:00Z"));
  if (entrada === "") {
    entrada = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  }
  if (validade === "") {
    const d = new Date(entrada + "T12:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    validade = d.toISOString().slice(0, 10);
  }
  if (!ehData(entrada) || !ehData(validade) || validade < entrada) {
    return resposta(
      { erro: "data_invalida", mensagem: "Confira a entrada e a validade." },
      400,
      origem,
    );
  }
  const fimDaValidade = new Date(validade + "T23:59:59-03:00").toISOString();

  if (!/^[0-9]{4,6}$/.test(codigo)) {
    return resposta(
      { erro: "codigo_invalido", mensagem: "O código tem 4 números." },
      400,
      origem,
    );
  }

  const { data: jaExiste } = await admin
    .from("profiles")
    .select("id")
    .eq("login", login)
    .maybeSingle();

  if (jaExiste) {
    return resposta(
      { erro: "login_em_uso", mensagem: "Já existe uma aluna com este nome de acesso." },
      409,
      origem,
    );
  }

  const senhaDescartavel = crypto.randomUUID() + crypto.randomUUID();

  // A conta do Auth é criada pela API administrativa, que preenche
  // sozinha as colunas de token — inserir na tabela à mão deixa nulos
  // que o Auth não sabe ler, e o login falha com "Database error
  // loading user".
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
    .insert({
      id: conta.user.id,
      nome,
      login,
      papel: "aluna",
      status: "ativa",
      celular: celular || null,
      entrada,
      acesso_ate: fimDaValidade,
    });

  if (erroPerfilNovo) {
    // Não deixa conta órfã no Auth.
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

  return resposta({ id: conta.user.id, nome, login }, 201, origem);
});
