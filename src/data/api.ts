import { notifDe, type NotifCfg } from "./notif";
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

/**
 * Avisa o banco que a aluna abriu o aplicativo — é o "último acesso" que a
 * equipe vê no painel. Falhar aqui não atrapalha nada da aluna.
 */
export async function marcarPresenca(): Promise<void> {
  await supabase.rpc("marcar_presenca");
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
  capa_horizontal_path?: string | null;
  rotulo?: string | null;
  numero: number;
  sem_numero?: boolean;
  titulo: string;
  intro: string | null;
  capa_path: string | null;
  cor_destaque: string | null;
  estilo?: Record<string, unknown> | null;
  ordem: number;
  bloqueado_geral: boolean;
  titulo_na_arte: boolean;
  produto_id: string | null;
};

type LinhaAula = {
  id: string;
  botao_ebook?: string | null;
  botao_ebook_cor?: string | null;
  tipo?: string | null;
  arquivo_path?: string | null;
  rotulo?: string | null;
  modulo_id: string;
  numero: number;
  sem_numero?: boolean;
  titulo: string;
  ordem: number;
  duracao_segundos: number | null;
  texto: string | null;
  resumo?: string | null;
  exercicio?: string | null;
  capa_path: string | null;
  publicado?: boolean;
  bloqueado_geral: boolean;
};

type LinhaCategoria = {
  id: string;
  titulo: string;
  ordem: number;
  destacada: boolean;
  bloqueada_geral: boolean;
  publicado?: boolean;
  icone?: string | null;
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
  rotulo_inicio?: string | null;
  nome_curto?: string | null;
  categoria_id: string;
  categoria_aba_id?: string | null;
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
  opcao?: boolean | null;
  bloqueado?: boolean | null;
  aviso_bloqueio?: string | null;
  cor?: string | null;
  capa_path?: string | null;
  titulo_tela?: string | null;
  instrucoes?: string | null;
  pai_id?: string | null;
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
  const [modulos, aulas, categorias, presentes, aoVivo, produtos, conteudos, ajustes, catsAba, trancadas] =
    await Promise.all([
      supabase.from("modulos").select("*").order("ordem"),
      supabase.from("aulas").select("*").order("ordem"),
      supabase.from("categorias").select("*").order("ordem"),
      supabase.from("presentes").select("*").order("ordem"),
      supabase.from("aulas_ao_vivo").select("*"),
      supabase.from("produtos").select("*").order("ordem"),
      supabase.from("conteudos").select("*").order("ordem"),
      supabase.from("configuracoes").select("produto_jornada").maybeSingle(),
      supabase.from("categorias_aba").select("id, publicado, bloqueada_geral, icone, cor, ordem, estilo"),
      supabase.rpc("opcoes_bloqueadas"),
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

  // Opções bloqueadas: o banco não entrega o conteúdo, só o botão com cadeado e o aviso.
  const linhas = ((conteudos.data ?? []) as LinhaConteudo[]).slice();
  const ja = new Set(linhas.map((k) => k.id));
  for (const t of (trancadas.data ?? []) as Array<{ id: string; aula_id: string | null; presente_id: string | null; modulo_id: string | null; produto_id: string; tipo: Conteudo["tipo"]; titulo: string | null; cor: string | null; ordem: number; aviso: string | null }>) {
    if (ja.has(t.id)) continue;
    linhas.push({ id: t.id, produto_id: t.produto_id, modulo_id: t.modulo_id, aula_id: t.aula_id, presente_id: t.presente_id, tipo: t.tipo, titulo: t.titulo, texto: null, arquivo_path: null, url: null, video_provider: null, video_ref: null, ordem: t.ordem, publicado: true, opcao: true, cor: t.cor, bloqueado: true, aviso_bloqueio: t.aviso } as LinhaConteudo);
  }

  for (const k of linhas) {
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
      opcao: !!k.opcao, cor: k.cor ?? null, capaPath: k.capa_path ?? null,
      tituloTela: k.titulo_tela ?? null, instrucoes: k.instrucoes ?? null, paiId: k.pai_id ?? null,
      bloqueado: !!k.bloqueado, avisoBloqueio: k.aviso_bloqueio ?? null,
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
    semNumero: !!m.sem_numero,
    titulo: m.titulo,
    intro: m.intro ?? "",
    ordem: m.ordem,
    produtoId: m.produto_id,
    capaPath: m.capa_path,
    capaHorizontalPath: m.capa_horizontal_path ?? null,
    cor: m.cor_destaque ?? null,
    estilo: m.estilo ?? null,
    rotulo: m.rotulo ?? null,
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
        semNumero: !!a.sem_numero,
        rotulo: a.rotulo ?? null,
        tipo: a.tipo ?? "video",
        botaoEbook: a.botao_ebook ?? null,
        botaoEbookCor: a.botao_ebook_cor ?? null,
        arquivoPath: a.arquivo_path ?? null,
        titulo: a.titulo,
        ordem: a.ordem,
        duracaoSegundos: a.duracao_segundos,
        videoProvider: null,
        videoRef: null,
        materialPath: null,
        texto: a.texto,
        resumo: a.resumo ?? null,
        exercicio: a.exercicio ?? null,
        capaPath: a.capa_path,
        publicado: a.publicado !== false,
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
  // Categoria dentro da aba (0076): Oculta esconde o curso; Bloqueada o deixa à vista, sem acesso.
  const estadoCatAba = new Map(((catsAba.data ?? []) as Array<{ id: string; publicado: boolean; bloqueada_geral: boolean; icone: string | null; cor: string | null; ordem: number | null; estilo: Record<string, unknown> | null }>).map((x) => [x.id, x]));
  const listaProdutos: Produto[] = ((produtos.data ?? []) as LinhaProduto[]).map(
    (p): Produto => ({
      id: p.id,
      rotuloInicio: p.rotulo_inicio ?? null,
      nomeCurto: p.nome_curto ?? null,
      categoriaId: p.categoria_id,
      titulo: p.titulo,
      descricao: p.descricao ?? "",
      capaPath: p.capa_path,
      ordem: p.ordem,
      publicado: p.publicado && estadoCatAba.get(p.categoria_aba_id ?? "")?.publicado !== false,
      bloqueadoGeral: p.bloqueado_geral || !!estadoCatAba.get(p.categoria_aba_id ?? "")?.bloqueada_geral,
      catIcone: estadoCatAba.get(p.categoria_aba_id ?? "")?.icone ?? null,
      catCor: estadoCatAba.get(p.categoria_aba_id ?? "")?.cor ?? null,
      catAbaId: p.categoria_aba_id ?? null,
      catEstilo: estadoCatAba.get(p.categoria_aba_id ?? "")?.estilo ?? null,
      catOrdem: estadoCatAba.get(p.categoria_aba_id ?? "")?.ordem ?? null,
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
      publicado: c.publicado !== false,
      icone: c.icone || "presentes",
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
    data_hora: string | null;
    liberada: boolean;
  }>) {
    mapaAoVivo[v.modulo_id] = {
      id: v.id,
      moduloId: v.modulo_id,
      quandoTexto: v.quando_texto,
      dataHora: v.data_hora,
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
  /** Foto e cor do Perfil de quem escreveu (0055); nulas se anônimo. */
  autoraFoto?: string | null;
  autoraCor?: string | null;
  /** Comentário dela que ainda espera a aprovação da equipe. */
  pendente?: boolean;
  curtidas: number;
  curti: boolean;
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
  const [{ data, error }, curt] = await Promise.all([
    supabase.rpc("comentarios_do_conteudo", { p_aula: aulaId }),
    supabase.rpc("curtidas_da_aula", { p_aula: aulaId }),
  ]);
  if (error) throw new Error(`comentarios: ${error.message}`);
  const curtidas = new Map<string, { curtidas: number; curti: boolean }>(
    ((curt.data ?? []) as Array<{ comentario_id: string; curtidas: number; curti: boolean }>).map((k) => [k.comentario_id, k]),
  );

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
      autora_foto?: string | null;
      autora_cor?: string | null;
      pendente?: boolean;
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
      autoraFoto: c.autora_foto ?? null,
      autoraCor: c.autora_cor ?? null,
      pendente: !!c.pendente,
      // `curtidas_da_aula()` (0047); sem ela, zero e não curtido.
      curtidas: curtidas.get(c.id)?.curtidas ?? 0,
      curti: !!curtidas.get(c.id)?.curti,
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

/** A cor que a aluna escolheu no Perfil (0055). `undefined` = não deu para ler. */
/* ---------- notificações (0092) ---------- */
/** Chave pública VAPID do projeto (a privada vive só na Edge Function enviar-avisos). */
export const VAPID_PUBLICA = "BAJfH-y9zUGlfGc0DliczrEzDE2ac9zVGp8iMDgo05-Il4jWoDyyHUVDeYgWFepYEmrgaERgERQBt47VFrl0c5M";
export async function salvarInscricaoPush(sub: PushSubscription): Promise<void> {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("salvar_inscricao_push", { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth });
  if (error) throw new Error(`notificações: ${error.message}`);
}
export async function adiarAvisoNotificacao(): Promise<void> { await supabase.rpc("adiar_aviso_notificacao"); }
export async function meuAvisoNotificacao(): Promise<string | null> {
  const { data, error } = await supabase.rpc("meu_aviso_notificacao");
  if (error) throw new Error(`notificações: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function minhaCor(): Promise<string | null | undefined> {
  const { data, error } = await supabase.rpc("minha_cor");
  if (error) return undefined;
  return (data as string | null) ?? null;
}

export async function salvarMinhaCor(cor: string): Promise<void> {
  const { error } = await supabase.rpc("salvar_minha_cor", { p_cor: cor });
  if (error) throw new Error(`cor: ${error.message}`);
}

/** A foto da aluna logada (0050): o recorte, a imagem inteira e o enquadramento. */
export async function minhaFoto(): Promise<{ foto: string; original: string | null; ajuste: Record<string, number> | null } | null> {
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) return null;
  const { data, error } = await supabase.from("fotos_aluna").select("foto, original, ajuste").eq("aluna_id", sessao.user.id).maybeSingle();
  if (error) throw new Error(`foto: ${error.message}`);
  return data ?? null;
}

/** Grava (ou, com `foto` nulo, apaga) a foto da aluna logada. */
export async function salvarMinhaFoto(foto: string | null, original: string | null, ajuste: Record<string, number> | null): Promise<void> {
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) throw new Error("sem sessão");
  const { error } = await supabase.rpc("salvar_foto_aluna", { p_aluna: sessao.user.id, p_foto: foto, p_original: original, p_ajuste: ajuste });
  if (error) throw new Error(`salvar foto: ${error.message}`);
}

export type Destaque = {
  id: string; imagem: string; rotulo: string; titulo: string; descricao: string; botao: string;
  destino: "presentes" | "categoria"; categoriaId: string | null; categoriaNome: string;
  icone: string; cor: string;
};
/**
 * O que o Início mostra e o painel edita (0052): o nome no cabeçalho, os
 * versículos (um por dia, em sequência) e os destaques visíveis, na ordem.
 */
/** Uid do Cloudflare Stream a partir do link ou do próprio uid. */
export function uidStream(ref: string): string {
  const t = (ref || "").trim();
  const m = t.match(/videodelivery\.net\/([a-f0-9]{32})/i) || t.match(/cloudflarestream\.com\/([a-f0-9]{32})/i) || t.match(/^([a-f0-9]{32})$/i);
  return m ? m[1] : "";
}

/** Qual versão do app a aluna vê (0103): "mentoria" ou "geral". Quem decide é o banco, pelos acessos dela. */
export async function minhaVersao(): Promise<"mentoria" | "geral"> {
  const { data, error } = await supabase.rpc("minha_versao");
  if (error) throw new Error(`versão: ${error.message}`);
  return data === "geral" ? "geral" : "mentoria";
}

export async function dadosDoInicio(geral = false): Promise<{ marca: { titulo: string; sub: string }; fraseRetorno: string; saudacao: string; versiculos: [string, string][]; destaques: Destaque[]; banner: { tipo: string; imagem: string; video: string }; estilo: string; telas: Record<string, string | boolean>; vers: { exibir: boolean; estilo: string; posicao: string; referencia: boolean; fundo: string; fonte: string; tamanho: string; cores: Record<string, string> | null }; menu: { botoes: Array<{ id: string; rotulo: string; icone?: string; cor?: string; url?: string; visivel: boolean }> | null; estilo: string; cores: Record<string, string> | null; tamanho: string }; perfil: { titulo: string; saudacao: string; imagem: string; texto: string; layout: string; botoes: Array<{ id: string; rotulo: string; desc?: string; url?: string; cor?: string; corTexto?: string; visivel: boolean }> }; notif: NotifCfg; estiloAula: Record<string, unknown> | null; estiloInicio: Record<string, unknown> | null; estiloPerfil: Record<string, unknown> | null; estiloNotif: Record<string, unknown> | null; divisor: { exibir: boolean; texto: string; cor: string; linha: string }; versao: string; aparencia: Record<string, unknown> | null }> {
  const [cfg, vs, ds] = await Promise.all([
    supabase.from("configuracoes").select("marca_titulo, marca_sub, frase_retorno, inicio_saudacao, exibir_destaques, inicio_banner, inicio_banner_imagem, inicio_banner_video, inicio_estilo, modulos_titulo, modulos_titulo_estilo, modulos_progresso, modulos_layout, modulos_tamanho, presentes_titulo, presentes_titulo_estilo, presentes_layout, presentes_estilo, perfil_titulo, perfil_saudacao, perfil_imagem, perfil_texto, perfil_layout, perfil_botoes, menu_botoes, menu_estilo, menu_cores, menu_tamanho, vers_exibir, vers_estilo, vers_posicao, vers_referencia, vers_fundo, vers_fonte, vers_tamanho, vers_cores, notif, inicio_divisor, estilo_aula, estilo_inicio, estilo_perfil, estilo_notif, aparencia, versao_geral").maybeSingle(),
    supabase.from("versiculos").select("texto, referencia").eq("visivel", true).order("ordem").order("criado_em"),
    supabase.from("destaques_inicio").select("*").eq("visivel", true).order("ordem").order("criado_em"),
  ]);
  for (const r of [cfg, vs, ds]) if (r.error) throw new Error(`início: ${r.error.message}`);
  // Versão geral (0103): o que a equipe configurou para ela vale por cima do resto.
  const base = (cfg.data ?? {}) as Record<string, any>;
  const vg = base.versao_geral && typeof base.versao_geral === "object" ? base.versao_geral : {};
  const d = (geral ? { ...base, ...vg } : base) as Record<string, any>;
  return {
    versao: geral ? "geral" : "mentoria",
    aparencia: (d?.aparencia ?? null) as Record<string, unknown> | null,
    marca: { titulo: d?.marca_titulo ?? "", sub: d?.marca_sub ?? "" },
    fraseRetorno: d?.frase_retorno ?? "",
    saudacao: d?.inicio_saudacao ?? "Bem-vindo(a), {nome}",
    banner: {
      tipo: d?.inicio_banner ?? "card",
      imagem: urlDaCapa(d?.inicio_banner_imagem ?? null) ?? "",
      video: uidStream(d?.inicio_banner_video ?? ""),
    },
    estilo: d?.inicio_estilo ?? "padrao",
    telas: {
      modTitulo: d?.modulos_titulo ?? "Todos os módulos", modTitEstilo: d?.modulos_titulo_estilo ?? "padrao",
      modProgresso: d?.modulos_progresso !== false, modLayout: d?.modulos_layout ?? "padrao", modTamanho: d?.modulos_tamanho ?? "medio",
      presTitulo: d?.presentes_titulo ?? "Presentes", presTitEstilo: d?.presentes_titulo_estilo ?? "padrao",
      presLayout: d?.presentes_layout ?? "grandes", presEstilo: d?.presentes_estilo ?? "padrao",
    },
    vers: {
      exibir: d?.vers_exibir !== false, estilo: d?.vers_estilo ?? "caixa", posicao: d?.vers_posicao ?? "mensagem",
      referencia: d?.vers_referencia !== false, fundo: d?.vers_fundo ?? "escuro", fonte: d?.vers_fonte ?? "serifa",
      tamanho: d?.vers_tamanho ?? "medio", cores: d?.vers_cores ?? null,
    },
    menu: {
      botoes: Array.isArray(d?.menu_botoes) ? d.menu_botoes : null,
      estilo: d?.menu_estilo ?? "padrao", cores: d?.menu_cores ?? null, tamanho: d?.menu_tamanho ?? "medio",
    },
    perfil: {
      titulo: d?.perfil_titulo ?? "Seu perfil", saudacao: d?.perfil_saudacao ?? "{nome_completo}",
      imagem: d?.perfil_imagem ?? "nenhum", texto: d?.perfil_texto ?? "", layout: d?.perfil_layout ?? "padrao",
      botoes: Array.isArray(d?.perfil_botoes) ? d.perfil_botoes : [],
    },
    notif: notifDe(d?.notif),
    estiloAula: d?.estilo_aula ?? null,
    estiloInicio: d?.estilo_inicio ?? null,
    estiloPerfil: d?.estilo_perfil ?? null,
    estiloNotif: d?.estilo_notif ?? null,
    divisor: ((d) => ({ exibir: d.exibir !== false, texto: typeof d.texto === "string" && d.texto.trim() ? d.texto : "Também para você", cor: typeof d.cor === "string" ? d.cor : "", linha: typeof d.linha === "string" ? d.linha : "" }))((d?.inicio_divisor ?? {}) as Record<string, unknown>),
    versiculos: ((vs.data ?? []) as Array<{ texto: string; referencia: string }>).map((v) => [v.texto, v.referencia]),
    destaques: (d?.exibir_destaques === false || (d?.inicio_banner ?? "card") !== "card" ? [] : (ds.data ?? []) as Record<string, string | null>[]).map((d) => ({
      id: String(d.id), imagem: d.imagem_path ?? "", rotulo: d.rotulo ?? "", titulo: d.titulo ?? "", descricao: d.descricao ?? "",
      botao: d.botao ?? "", destino: d.destino === "categoria" ? "categoria" : "presentes", categoriaId: d.categoria_id ?? null,
      categoriaNome: d.categoria_nome ?? "", icone: d.icone ?? "estrela", cor: d.cor ?? "dourado",
    })),
  };
}

export async function alternarCurtidaComentario(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("alternar_curtida_comentario", { p_comentario: id });
  if (error) throw new Error(`curtir comentário: ${error.message}`);
  return Boolean(data);
}

export async function denunciarComentario(id: string): Promise<void> {
  const { error } = await supabase.rpc("denunciar_comentario", { p_comentario: id });
  if (error) throw new Error(`denunciar: ${error.message}`);
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
  segundos = 600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(deposito)
    .createSignedUrl(caminho, segundos);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function urlDaCapa(caminho: string | null): string | null {
  if (!caminho) return null;
  const { data } = supabase.storage.from("capas").getPublicUrl(caminho);
  return data.publicUrl;
}

/** Aparência da área da aluna (0089); pode ser lida antes do login. */
export async function aparenciaDoApp(): Promise<import("./aparencia").Aparencia | null> {
  const { data } = await supabase.from("configuracoes").select("aparencia").maybeSingle();
  return (data?.aparencia as import("./aparencia").Aparencia | null) ?? null;
}
