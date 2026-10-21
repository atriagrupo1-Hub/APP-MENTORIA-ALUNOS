/**
 * Edge Function `entrar`
 *
 * O único ponto do sistema que conhece a chave de serviço.
 *
 * Recebe nome de acesso e código, confere no banco e, dando certo, emite
 * a sessão. O navegador nunca vê a chave de serviço, nunca chama
 * `verificar_codigo()` e nunca decide nada sobre acesso — a decisão é
 * inteiramente do servidor, como manda o item 8 do README do handoff.
 *
 * Duas proteções, uma sobre a outra:
 *   - por conta, dentro de `verificar_codigo()`: 5 erros travam 15 min
 *   - por origem, aqui: 20 tentativas por IP a cada 15 min
 *
 * A primeira protege uma aluna. A segunda impede varrer muitas contas em
 * paralelo, que é o ataque real contra um código de 4 dígitos.
 *
 * `verify_jwt` fica desligado de propósito: é o endpoint de login, quem
 * chama ainda não tem sessão. A autenticação é a própria função.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_ANONIMA = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Origens autorizadas, separadas por vírgula. Sem a variável definida,
 * responde a qualquer origem — serve para desenvolvimento, mas em
 * produção defina `ORIGENS_PERMITIDAS` com o domínio da Cloudflare Pages.
 */
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

/** Origem da chamada, atrás do proxy da plataforma. */
function origemDaChamada(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
}

/**
 * O caminho de antes da 0048, quatro idas ao banco. Fica para a função
 * continuar funcionando se for publicada antes da migração.
 */
async function caminhoAntigo(
  admin: ReturnType<typeof createClient>,
  ip: string,
  login: string,
  codigo: string,
): Promise<{ alunaId: string | null; email: string | null; falha: string | null }> {
  const { data: podeTentar, error: erroLimite } = await admin.rpc("registrar_tentativa_ip", { p_ip: ip });
  if (erroLimite) {
    console.error("falha no limite por IP", erroLimite.message);
    return { alunaId: null, email: null, falha: "indisponivel" };
  }
  if (podeTentar === false) return { alunaId: null, email: null, falha: "muitas_tentativas" };

  const { data: alunaId, error: erroCodigo } = await admin.rpc("verificar_codigo", {
    p_login: login,
    p_codigo: codigo,
  });
  if (erroCodigo) {
    const detalhe = erroCodigo.message ?? "";
    if (detalhe.includes("conta_travada")) return { alunaId: null, email: null, falha: "conta_travada" };
    if (detalhe.includes("conta_bloqueada")) return { alunaId: null, email: null, falha: "conta_bloqueada" };
    console.error("falha em verificar_codigo", detalhe);
    return { alunaId: null, email: null, falha: "indisponivel" };
  }
  if (!alunaId) return { alunaId: null, email: null, falha: "acesso_invalido" };

  const { data: conta, error: erroConta } = await admin.auth.admin.getUserById(alunaId as string);
  if (erroConta || !conta?.user?.email) {
    console.error("conta sem e-mail no Auth", erroConta?.message);
    return { alunaId: null, email: null, falha: "indisponivel" };
  }
  await admin.rpc("limpar_tentativas_ip", { p_ip: ip });
  return { alunaId: alunaId as string, email: conta.user.email, falha: null };
}

Deno.serve(async (req) => {
  const origem = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors(origem) });
  }

  if (req.method !== "POST") {
    return resposta({ erro: "metodo_nao_permitido" }, 405, origem);
  }

  let login = "";
  let codigo = "";
  try {
    const corpo = await req.json();
    login = String(corpo?.login ?? "").trim();
    codigo = String(corpo?.codigo ?? "").trim();
  } catch {
    return resposta({ erro: "corpo_invalido" }, 400, origem);
  }

  if (!login || !codigo) {
    return resposta(
      { erro: "campos_faltando", mensagem: "Preencha seu nome e seu código para entrar." },
      400,
      origem,
    );
  }

  // Formato antes de tocar no banco: só dígitos, 4 a 6.
  if (!/^[0-9]{4,6}$/.test(codigo)) {
    /*
      A mensagem dizia "O código tem 4 números." — o contrário do que a
      linha acima exige, e falso para qualquer conta com código de 5 ou
      6 dígitos. Quem tem um código de 6 lia isso e o encurtava, o que
      não podia dar certo nunca: nos registros do servidor de 17/09 há
      três 400 seguidos, um atrás do outro, antes da pessoa desistir.
      Uma mensagem de erro que contradiz a própria regra é pior que
      nenhuma — ela manda a pessoa para o lado errado.
    */
    return resposta(
      { erro: "codigo_invalido", mensagem: "O código tem de 4 a 6 números." },
      400,
      origem,
    );
  }

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = origemDaChamada(req);

  // 1 e 2. Limite por origem e conferência do código numa ida só ao banco
  //    (`conferir_entrada()`, 0048). Sem ela no banco, o caminho antigo.
  let alunaId: string | null = null;
  let email: string | null = null;
  let falha: string | null = null;
  const { data: conferido, error: erroConferir } = await admin.rpc("conferir_entrada", {
    p_ip: ip,
    p_login: login,
    p_codigo: codigo,
  });
  if (!erroConferir) {
    const linha = Array.isArray(conferido) ? conferido[0] : conferido;
    alunaId = linha?.aluna_id ?? null;
    email = linha?.email ?? null;
    falha = linha?.erro ?? (alunaId ? null : "indisponivel");
  } else if (/conferir_entrada/.test(erroConferir.message ?? "") && /(find|exist)/i.test(erroConferir.message ?? "")) {
    ({ alunaId, email, falha } = await caminhoAntigo(admin, ip, login, codigo));
  } else {
    console.error("falha em conferir_entrada", erroConferir.message);
    falha = "indisponivel";
  }

  if (falha === "muitas_tentativas") {
    return resposta(
      {
        erro: "muitas_tentativas",
        mensagem: "Muitas tentativas deste dispositivo. Aguarde alguns minutos e tente de novo.",
      },
      429,
      origem,
    );
  }
  if (falha === "conta_travada") {
    return resposta(
      {
        erro: "conta_travada",
        mensagem:
          "Seu acesso ficou travado por 15 minutos depois de várias tentativas. Tente de novo mais tarde.",
      },
      423,
      origem,
    );
  }
  if (falha === "conta_bloqueada") {
    return resposta(
      {
        erro: "conta_bloqueada",
        mensagem:
          "Seu acesso está temporariamente suspenso. Fale com a equipe da mentoria.",
      },
      403,
      origem,
    );
  }
  // A equipe pediu que a tela aponte o campo errado (0057).
  if (falha === "nome_invalido") {
    return resposta(
      { erro: "nome_invalido", mensagem: "Não encontramos este nome. Confira e digite de novo." },
      401,
      origem,
    );
  }
  if (falha === "codigo_invalido") {
    return resposta(
      { erro: "codigo_invalido", mensagem: "Código incorreto. Confira e digite de novo." },
      401,
      origem,
    );
  }
  if (falha === "acesso_invalido") {
    // Nome inexistente e código errado devolvem a mesma coisa, de
    // propósito: não se diz a ninguém quais nomes existem.
    return resposta(
      {
        erro: "acesso_invalido",
        mensagem: "Não encontramos este acesso. Confira o nome e o código informados.",
      },
      401,
      origem,
    );
  }
  if (falha || !alunaId || !email) {
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  // 3. Sessão. O Auth não tem login por código, então a sessão é emitida
  //    por um token de uso único, gerado e consumido aqui mesmo — nunca
  //    enviado por e-mail, nunca exposto ao navegador.
  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (erroLink || !link?.properties?.hashed_token) {
    console.error("falha ao gerar o token de sessao", erroLink?.message);
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  const anonimo = createClient(URL_SUPABASE, CHAVE_ANONIMA, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // O tipo aceito pelo `verifyOtp` para um token de magic link variou
  // entre versões do Auth: já foi `magiclink`, e a forma genérica é
  // `email`. Tenta as duas, para não depender de qual delas o projeto
  // está rodando.
  let sessao = null;
  let ultimoErro = "";

  for (const tipo of ["magiclink", "email"] as const) {
    const { data, error } = await anonimo.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: tipo,
    });
    if (!error && data?.session) {
      sessao = data.session;
      break;
    }
    ultimoErro = error?.message ?? "sem sessao na resposta";
  }

  if (!sessao) {
    console.error("falha ao trocar o token pela sessao", ultimoErro);
    return resposta({ erro: "indisponivel" }, 503, origem);
  }

  return resposta(
    {
      access_token: sessao.access_token,
      refresh_token: sessao.refresh_token,
      expires_at: sessao.expires_at,
      aluna: {
        id: alunaId,
        nome: sessao.user?.user_metadata?.nome ?? null,
      },
    },
    200,
    origem,
  );
});
