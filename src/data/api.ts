import {
  chavePublica,
  enderecoEntrar,
  enderecoVideoAssinado,
  supabase,
} from "./supabase";
import type {
  Catalogo,
  Categoria,
  Conteudo,
  Modulo,
  Presente,
  Produto,
  TipoConteudo,
} from "./tipos";

/**
 * Toda a conversa com o Supabase passa por aqui.
 *
 * Regra do item 8 do README do handoff: o banco é a única autoridade
 * sobre autenticação, liberações, bloqueios e progresso. Nenhuma função
 * deste arquivo decide acesso — todas perguntam. Falhando a resposta, o
 * chamador mostra erro e não concede nada.
 */

export type FalhaLogin = {
  status: number;
  erro: string;
  mensagem: string;
};

export type PerfilSessao = {
  id: string;
  nome: string;
  login: string;
  papel: "aluna" | "dono" | "admin" | "suporte";
  status: "ativa" | "bloqueada";
  primeiroAcessoEm: string | null;
  criadaEm: string;
  /** Fim do acesso. Nulo quer dizer sem prazo. */
  acessoAte: string | null;
};

/** Chama a Edge Function `entrar` e guarda a sessão devolvida. */
export async function entrar(
  login: string,
  codigo: string,
): Promise<{ ok: true } | { ok: false; falha: FalhaLogin }> {
  let resposta: Response;
  try {
    resposta = await fetch(enderecoEntrar, {
      method: "POST",
      headers: { apikey: chavePublica, "Content-Type": "application/json" },
      body: JSON.stringify({ login, codigo }),
    });
  } catch {
    return {
      ok: false,
      falha: {
        status: 0,
        erro: "sem_conexao",
        mensagem: "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
      },
    };
  }

  const corpo = await resposta.json().catch(() => ({}));

  if (!resposta.ok || !corpo?.access_token) {
    return {
      ok: false,
      falha: {
        status: resposta.status,
        erro: corpo?.erro ?? "indisponivel",
        mensagem:
          corpo?.mensagem ??
          "Não foi possível entrar agora. Tente de novo em alguns instantes.",
      },
    };
  }

  const { error } = await supabase.auth.setSession({
    access_token: corpo.access_token,
    refresh_token: corpo.refresh_token,
  });

  if (error) {
    return {
      ok: false,
      falha: {
        status: 500,
        erro: "sessao_invalida",
        mensagem: "Não foi possível abrir sua sessão. Tente de novo.",
      },
    };
  }

  return { ok: true };
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}

export async function temSessao(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Perfil de quem está logada. Vem por função, nunca da tabela direto. */
export async function meuPerfil(): Promise<PerfilSessao | null> {
  const { data, error } = await supabase.rpc("meu_perfil");
  if (error) throw new Error(`meu_perfil: ${error.message}`);
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    login: linha.login,
    papel: linha.papel,
    status: linha.status,
    primeiroAcessoEm: linha.primeiro_acesso_em,
    criadaEm: linha.criada_em,
    acessoAte: linha.acesso_ate,
  };
}

type LinhaModulo = {
  id: string;
  numero: number;
  titulo: string;
  intro: string | null;
  capa_path: string | null;
  cor_destaque: string | null;
  ordem: number;
  bloqueado_geral: boolean;
  titulo_na_arte: boolean;
  produto_id: string | null;
};

type LinhaAula = {
  id: string;
  modulo_id: string;
  numero: number;
  titulo: string;
  ordem: number;
  duracao_segundos: number | null;
  texto: string | null;
  capa_path: string | null;
  bloqueado_geral: boolean;
};

type LinhaCategoria = {
  id: string;
  titulo: string;
  ordem: number;
  destacada: boolean;
  bloqueada_geral: boolean;
};

type LinhaPresente = {
  id: string;
  categoria_id: string;
  titulo: string;
  descricao: string | null;
  duracao_texto: string | null;
  capa_path: string | null;
  ordem: number;
  bloqueado_geral: boolean;
  produto_id: string | null;
};

type LinhaProduto = {
  id: string;
  categoria_id: string;
  titulo: string;
  descricao: string | null;
  capa_path: string | null;
  ordem: number;
  publicado: boolean;
  bloqueado_geral: boolean;
  fundacao: string | null;
  aviso_material: string | null;
};

type LinhaConteudo = {
  id: string;
  produto_id: string;
  modulo_id: string | null;
  aula_id: string | null;
  presente_id: string | null;
  tipo: TipoConteudo;
  titulo: string | null;
  texto: string | null;
  arquivo_path: string | null;
  url: string | null;
  video_provider: string | null;
  video_ref: string | null;
  ordem: number;
  publicado: boolean;
};

/**
 * Catálogo inteiro, incluindo o que a aluna ainda não tem liberado — as
 * telas mostram módulo bloqueado com capa e título, e a liberação vem
 * separada, de `minhasAulas()`. Nenhum endereço de vídeo vem junto: a
 * mídia mora em tabela própria, fechada, e sai só por função.
 */
/**
 * Situação de cada módulo para a aluna que está logada.
 *
 * Só vêm os módulos em que ela tem alguma aula atribuída. Módulo
 * ausente desta lista é módulo oculto — a tela não desenha. Com
 * `abertas = 0` e uma `proximaAbertura`, é o "libera em breve".
 */
export type ModuloDaAluna = {
  moduloId: string;
  atribuidas: number;
  abertas: number;
  proximaAbertura: string | null;
};

export async function meusModulos(): Promise<Map<string, ModuloDaAluna>> {
  const { data, error } = await supabase.rpc("meus_modulos");
  if (error) throw new Error(`meus_modulos: ${error.message}`);
  const mapa = new Map<string, ModuloDaAluna>();
  for (const l of (data ?? []) as Array<{
    modulo_id: string;
    atribuidas: number;
    abertas: number;
    proxima_abertura: string | null;
  }>) {
    mapa.set(l.modulo_id, {
      moduloId: l.modulo_id,
      atribuidas: l.atribuidas,
      abertas: l.abertas,
      proximaAbertura: l.proxima_abertura,
    });
  }
  return mapa;
}

/**
 * Quando cada aula ainda fechada abre, para quem está logada.
 *
 * Vem por função porque `acessos` não é concedida ao navegador — e não
 * vai ser: aquela tabela diz quem tem acesso a quê, de todas as alunas.
 * A função devolve um par, aula e data, só da própria.
 *
 * Aula sem data marcada não aparece aqui, e isso é uma resposta: quer
 * dizer que o cronograma dela ainda não foi montado para essa aula. A
 * tela continua dizendo que abre "no momento certo" nesses casos, que
 * é a verdade — ninguém marcou ainda.
 */
export async function minhasAberturas(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("minhas_aberturas");
  if (error) throw new Error(`minhas_aberturas: ${error.message}`);
  const mapa = new Map<string, string>();
  for (const l of (data ?? []) as Array<{ aula_id: string; abre_em: string }>) {
    mapa.set(l.aula_id, l.abre_em);
  }
  return mapa;
}

export async function carregarCatalogo(): Promise<Catalogo> {
  const [modulos, aulas, categorias, presentes, aoVivo, produtos, conteudos, ajustes] =
    await Promise.all([
      supabase.from("modulos").select("*").order("ordem"),
      supabase.from("aulas").select("*").order("ordem"),
      supabase.from("categorias").select("*").order("ordem"),
      supabase.from("presentes").select("*").order("ordem"),
      supabase.from("aulas_ao_vivo").select("*"),
      supabase.from("produtos").select("*").order("ordem"),
      supabase.from("conteudos").select("*").order("ordem"),
      supabase.from("configuracoes").select("produto_jornada").maybeSingle(),
    ]);

  for (const r of [modulos, aulas, categorias, presentes, aoVivo, produtos, conteudos]) {
    if (r.error) throw new Error(`catálogo: ${r.error.message}`);
  }

  /*
   * Os conteúdos chegam numa lista só e são distribuídos aqui, por
   * dono. Uma consulta em vez de quatro — e, mais importante, um lugar
   * só decidindo onde cada pedaço mora.
   */
  const conteudoDaAula = new Map<string, Conteudo[]>();
  const conteudoDoModulo = new Map<string, Conteudo[]>();
  const conteudoDoPresente = new Map<string, Conteudo[]>();
  const conteudoDoProduto = new Map<string, Conteudo[]>();

  for (const k of (conteudos.data ?? []) as LinhaConteudo[]) {
    const item: Conteudo = {
      id: k.id,
      produtoId: k.produto_id,
      moduloId: k.modulo_id,
      aulaId: k.aula_id,
      presenteId: k.presente_id,
      tipo: k.tipo,
      titulo: k.titulo ?? "",
      texto: k.texto,
      arquivoPath: k.arquivo_path,
      url: k.url,
      videoProvider: k.video_provider,
      videoRef: k.video_ref,
      ordem: k.ordem,
      publicado: k.publicado,
    };

    const [mapa, chave] = k.aula_id
      ? [conteudoDaAula, k.aula_id]
      : k.modulo_id
        ? [conteudoDoModulo, k.modulo_id]
        : k.presente_id
          ? [conteudoDoPresente, k.presente_id]
          : [conteudoDoProduto, k.produto_id];

    const lista = mapa.get(chave) ?? [];
    lista.push(item);
    mapa.set(chave, lista);
  }

  const emOrdem = (lista: Conteudo[] | undefined) =>
    (lista ?? []).slice().sort((x, y) => x.ordem - y.ordem);

  /*
   * A frase do material é do produto, e quem precisa dela é a tela da
   * aula, que só tem o módulo. O mapa leva uma até a outra.
   */
  const avisoDoProduto = new Map<string, string | null>(
    ((produtos.data ?? []) as LinhaProduto[]).map((p) => [p.id, p.aviso_material]),
  );

  const porModulo = new Map<string, LinhaAula[]>();
  for (const a of (aulas.data ?? []) as LinhaAula[]) {
    const lista = porModulo.get(a.modulo_id) ?? [];
    lista.push(a);
    porModulo.set(a.modulo_id, lista);
  }

  const listaModulos: Modulo[] = ((modulos.data ?? []) as LinhaModulo[]).map((m) => ({
    id: m.id,
    numero: m.numero,
    titulo: m.titulo,
    intro: m.intro ?? "",
    ordem: m.ordem,
    produtoId: m.produto_id,
    capaPath: m.capa_path,
    bloqueadoGeral: m.bloqueado_geral,
    tituloNaArte: m.titulo_na_arte,
    avisoMaterial: avisoDoProduto.get(m.produto_id ?? "") ?? null,
    conteudos: emOrdem(conteudoDoModulo.get(m.id)),
    aulas: (porModulo.get(m.id) ?? [])
      .sort((x, y) => x.ordem - y.ordem)
      .map((a) => ({
        id: a.id,
        moduloId: a.modulo_id,
        numero: a.numero,
        titulo: a.titulo,
        ordem: a.ordem,
        duracaoSegundos: a.duracao_segundos,
        videoProvider: null,
        videoRef: null,
        materialPath: null,
        texto: a.texto,
        capaPath: a.capa_path,
        bloqueadoGeral: a.bloqueado_geral,
        conteudos: emOrdem(conteudoDaAula.get(a.id)),
      })),
  }));

  const listaPresentes: Presente[] = ((presentes.data ?? []) as LinhaPresente[]).map(
    (p): Presente => ({
      id: p.id,
      categoriaId: p.categoria_id,
      titulo: p.titulo,
      descricao: p.descricao ?? "",
      duracaoTexto: p.duracao_texto ?? "",
      capaPath: p.capa_path,
      videoProvider: null,
      videoRef: null,
      ordem: p.ordem,
      bloqueadoGeral: p.bloqueado_geral,
      produtoId: p.produto_id,
      conteudos: emOrdem(conteudoDoPresente.get(p.id)),
    }),
  );

  /*
   * O produto reúne o que é dele: os módulos que apontam para ele, os
   * itens de acervo que apontam para ele, e o conteúdo solto. É a
   * mesma leitura que o painel usa — `src/admin/dados.ts` reexporta
   * esta função —, então admin e aluna nunca divergem.
   */
  const listaProdutos: Produto[] = ((produtos.data ?? []) as LinhaProduto[]).map(
    (p): Produto => ({
      id: p.id,
      categoriaId: p.categoria_id,
      titulo: p.titulo,
      descricao: p.descricao ?? "",
      capaPath: p.capa_path,
      ordem: p.ordem,
      publicado: p.publicado,
      bloqueadoGeral: p.bloqueado_geral,
      modulos: listaModulos
        .filter((m) => m.produtoId === p.id)
        .sort((x, y) => x.ordem - y.ordem),
      presentes: listaPresentes
        .filter((i) => i.produtoId === p.id)
        .sort((x, y) => x.ordem - y.ordem),
      conteudos: emOrdem(conteudoDoProduto.get(p.id)),
      fundacao: p.fundacao,
      avisoMaterial: p.aviso_material,
    }),
  );

  const porCategoriaPresentes = new Map<string, Presente[]>();
  for (const p of listaPresentes) {
    const lista = porCategoriaPresentes.get(p.categoriaId) ?? [];
    lista.push(p);
    porCategoriaPresentes.set(p.categoriaId, lista);
  }

  const listaCategorias: Categoria[] = ((categorias.data ?? []) as LinhaCategoria[]).map(
    (c) => ({
      id: c.id,
      titulo: c.titulo,
      ordem: c.ordem,
      destacada: c.destacada,
      bloqueadaGeral: c.bloqueada_geral,
      presentes: (porCategoriaPresentes.get(c.id) ?? []).sort((x, y) => x.ordem - y.ordem),
      produtos: listaProdutos
        .filter((p) => p.categoriaId === c.id)
        .sort((x, y) => x.ordem - y.ordem),
    }),
  );

  const mapaAoVivo: Catalogo["aoVivo"] = {};
  for (const v of (aoVivo.data ?? []) as Array<{
    id: string;
    modulo_id: string;
    quando_texto: string | null;
    liberada: boolean;
  }>) {
    mapaAoVivo[v.modulo_id] = {
      id: v.id,
      moduloId: v.modulo_id,
      quandoTexto: v.quando_texto,
      liberada: v.liberada,
    };
  }

  return {
    modulos: listaModulos,
    categorias: listaCategorias,
    aoVivo: mapaAoVivo,
    produtos: listaProdutos,
    produtoJornada:
      (ajustes.data as { produto_jornada: string | null } | null)?.produto_jornada ?? null,
  };
}

export type AulaLiberada = {
  aulaId: string;
  posicaoSegundos: number;
  concluida: boolean;
  duracaoSegundos: number | null;
  /**
   * Quando esta aula mexeu pela última vez, no relógio do banco. Nulo
   * quer dizer que ela nunca abriu esta aula.
   *
   * É o que responde "de onde eu parei": sem esta data, a única coisa
   * que dava para saber era qual aula está pendente — e pendente não é
   * o mesmo que a última que ela estava assistindo.
   */
  atualizadaEm: string | null;
};

/**
 * O que a aluna pode ver, decidido pelo banco numa consulta só.
 * O aplicativo não recalcula liberação — apenas lê esta lista.
 */
export async function minhasAulas(): Promise<AulaLiberada[]> {
  const { data, error } = await supabase.rpc("minhas_aulas");
  if (error) throw new Error(`minhas_aulas: ${error.message}`);
  return (data ?? []).map(
    (l: {
      aula_id: string;
      posicao_segundos: number;
      concluida: boolean;
      duracao_segundos: number | null;
      atualizada_em: string | null;
    }) => ({
      aulaId: l.aula_id,
      posicaoSegundos: l.posicao_segundos,
      concluida: l.concluida,
      duracaoSegundos: l.duracao_segundos,
      atualizadaEm: l.atualizada_em,
    }),
  );
}

/** Presentes liberados: a decisão é do banco, uma pergunta por presente. */
export async function presentesLiberados(ids: string[]): Promise<Set<string>> {
  return perguntarUmAUm("pode_ver_presente", "p_presente", ids);
}

/**
 * Quais produtos a aluna pode abrir.
 *
 * Só faz sentido para o produto cujo conteúdo é direto — sem módulo e
 * sem item. Quando o conteúdo pendura numa aula ou num item, é a
 * liberação DELES que vale, e é ela que o banco confere.
 */
export async function produtosLiberados(ids: string[]): Promise<Set<string>> {
  return perguntarUmAUm("pode_ver_produto", "p_produto", ids);
}

/*
 * Uma pergunta por id. Quem decide continua sendo o banco: a tela não
 * recalcula liberação em lugar nenhum, só lê a resposta. Erro conta
 * como "não" — é a regra do item 8 do handoff.
 */
async function perguntarUmAUm(
  funcao: string,
  parametro: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const respostas = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc(funcao, { [parametro]: id });
      if (error) return [id, false] as const;
      return [id, Boolean(data)] as const;
    }),
  );
  return new Set(respostas.filter(([, pode]) => pode).map(([id]) => id));
}

export async function curtidas(): Promise<Set<string>> {
  const { data, error } = await supabase.from("curtidas").select("aula_id");
  if (error) throw new Error(`curtidas: ${error.message}`);
  return new Set((data ?? []).map((c: { aula_id: string }) => c.aula_id));
}

export type ComentarioPublico = {
  id: string;
  aulaId: string;
  texto: string;
  posicaoSegundos: number;
  criadoEm: string;
  /** Nulo quer dizer anônimo — comentário escrito antes da mudança. */
  autoraNome: string | null;
  minha: boolean;
  /** O comentário que esta linha responde. Nulo = primeiro nível. */
  respostaA: string | null;
  /**
   * Quem escreveu é a instrutora. Vem calculado no banco, e não podia
   * ser de outro jeito: o papel das outras pessoas não é legível pelo
   * navegador, então a tela não teria como descobrir sozinha.
   */
  ehInstrutor: boolean;
};

/**
 * Comentários de uma aula, numa viagem só.
 *
 * Eram duas: a view `comentarios_publicos`, que não trazia autoria, e
 * `meus_comentarios`, para saber quais eram dela. O navegador cruzava
 * os identificadores depois. Duas idas ao banco por aula aberta, e a
 * lista só aparecia quando a segunda voltasse — parte do que fazia a
 * seção parecer lenta.
 *
 * `comentarios_da_aula()` responde as duas coisas de uma vez, e traz o
 * nome. O anonimato continua sendo do banco, não da tela: a coluna da
 * autoria segue inalcançável pelo navegador, e a função só devolve o
 * nome de quem escreveu sabendo que ele apareceria.
 */
export async function comentariosDaAula(aulaId: string): Promise<ComentarioPublico[]> {
  const { data, error } = await supabase.rpc("comentarios_da_aula", { p_aula: aulaId });
  if (error) throw new Error(`comentarios: ${error.message}`);

  return (data ?? []).map(
    (c: {
      id: string;
      aula_id: string;
      texto: string;
      posicao_segundos: number;
      criado_em: string;
      autora_nome: string | null;
      minha: boolean;
      resposta_a: string | null;
      eh_instrutor: boolean;
    }) => ({
      id: c.id,
      aulaId: c.aula_id,
      texto: c.texto,
      posicaoSegundos: c.posicao_segundos,
      criadoEm: c.criado_em,
      autoraNome: c.autora_nome,
      minha: c.minha,
      respostaA: c.resposta_a,
      ehInstrutor: c.eh_instrutor,
    }),
  );
}

/**
 * Escreve um comentário, ou uma resposta a um deles.
 *
 * `respostaA` é só o que a tela pede. Quem confere se o pedido vale é o
 * banco: a resposta tem de apontar para um comentário publicado, da
 * mesma aula, que não seja ele próprio uma resposta. Alterar o pedido
 * daqui não abre um segundo nível — a linha não entra.
 */
export async function comentar(
  aulaId: string,
  texto: string,
  posicaoSegundos: number,
  respostaA?: string,
  semNome = false,
): Promise<void> {
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) throw new Error("sem sessão");
  const { error } = await supabase.from("comentarios").insert({
    aula_id: aulaId,
    autora_id: sessao.user.id,
    texto,
    posicao_segundos: Math.round(posicaoSegundos),
    resposta_a: respostaA ?? null,
    // A aluna escolhe ficar anônima (0040). Sem escolha, vale o padrão
    // do banco, que mostra o nome.
    ...(semNome ? { nome_visivel: false } : {}),
  });
  if (error) throw new Error(`comentar: ${error.message}`);
}

export async function removerMeuComentario(id: string): Promise<void> {
  const { error } = await supabase.rpc("remover_meu_comentario", { p_comentario: id });
  if (error) throw new Error(`remover comentário: ${error.message}`);
}

export async function salvarPosicao(aulaId: string, segundos: number): Promise<void> {
  const { error } = await supabase.rpc("salvar_posicao", {
    p_aula: aulaId,
    p_segundos: Math.round(segundos),
  });
  if (error) throw new Error(`salvar posição: ${error.message}`);
}

export async function marcarConcluida(aulaId: string, concluida: boolean): Promise<void> {
  const { error } = await supabase.rpc("marcar_concluida", {
    p_aula: aulaId,
    p_concluida: concluida,
  });
  if (error) throw new Error(`marcar concluída: ${error.message}`);
}

export async function alternarCurtida(aulaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("alternar_curtida", { p_aula: aulaId });
  if (error) throw new Error(`curtir: ${error.message}`);
  return Boolean(data);
}

export async function registrarDuracao(aulaId: string, segundos: number): Promise<void> {
  await supabase.rpc("registrar_duracao", {
    p_aula: aulaId,
    p_segundos: Math.round(segundos),
  });
}

export type Video = { provider: string; ref: string };

/**
 * Endereço do vídeo.
 *
 * Passa pela Edge Function `video-assinado`, e não pela função do banco
 * direto. O motivo: sem assinatura, o endereço do Cloudflare Stream é
 * permanente — a aluna copia o link, manda no WhatsApp, e quem receber
 * assiste sem login e sem liberação. A função devolve um token de curta
 * duração no lugar do identificador.
 *
 * A autoridade continua no banco: a função chama `video_da_aula()` com
 * o token da própria aluna, então todas as regras já provadas valem.
 *
 * Enquanto a chave de assinatura não estiver configurada, ela devolve o
 * identificador sem assinar, e o vídeo toca como antes. Nada quebra no
 * meio do caminho.
 */
async function pedirVideo(corpo: Record<string, string>): Promise<Video | null> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) return null;

  const r = await fetch(enderecoVideoAssinado, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: chavePublica,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (!r.ok) return null;
  const resposta = await r.json();
  if (!resposta?.ref) return null;
  return { provider: String(resposta.provedor), ref: String(resposta.ref) };
}

export const videoDaAula = (aulaId: string) => pedirVideo({ aulaId });
export const videoDoPresente = (presenteId: string) => pedirVideo({ presenteId });
export const videoDaAoVivo = (aoVivoId: string) => pedirVideo({ aoVivoId });
export const videoDoConteudo = (conteudoId: string) => pedirVideo({ conteudoId });

export function enderecoDoVideo(video: Video): string {
  const opcoes = "autoplay=1&playsinline=1";
  switch (video.provider) {
    case "stream":
      return `https://iframe.videodelivery.net/${video.ref}?${opcoes}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${video.ref}?${opcoes}`;
    case "youtube":
      return `https://www.youtube.com/embed/${video.ref}?${opcoes}&rel=0`;
    default:
      return "";
  }
}

/** Endereço público de uma capa no depósito `capas`. */
/**
 * Endereço temporário de um arquivo guardado.
 *
 * `materiais` e `audios` são depósitos fechados: quem decide se o
 * arquivo sai é a política do Storage, que confere
 * `pode_ver_conteudo()` no banco. Esconder o endereço nunca foi a
 * proteção — a assinatura curta é.
 */
export async function enderecoDoArquivo(
  deposito: "materiais" | "audios",
  caminho: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(deposito)
    .createSignedUrl(caminho, 600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function urlDaCapa(caminho: string | null): string | null {
  if (!caminho) return null;
  const { data } = supabase.storage.from("capas").getPublicUrl(caminho);
  return data.publicUrl;
}
