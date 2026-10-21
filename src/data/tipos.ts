/**
 * Formas de dados da área de membros.
 *
 * Os nomes seguem o modelo aprovado (`Modelo de Dados.md`) para que a
 * troca da fonte local pelo Supabase seja uma troca de adaptador, não
 * uma reescrita das telas.
 */

export type Modulo = {
  id: string;
  /** Capa deitada (16:9) do "Comece por aqui" (0052). */
  capaHorizontalPath?: string | null;
  /** Cor do módulo (#rrggbb), do painel: contorno, brilho e linha (0054). */
  cor?: string | null;
  numero: number;
  titulo: string;
  intro: string;
  ordem: number;
  /** A qual produto este módulo pertence. Nulo só em base antiga. */
  produtoId: string | null;
  /** Capa própria. Nulo cai na arte numerada do curso. */
  capaPath: string | null;
  bloqueadoGeral: boolean;
  /** A arte da capa já traz o título; a tela não sobrepõe o dela. */
  tituloNaArte: boolean;
  /**
   * A frase do curso sobre material de apoio — "peça o PDF no grupo".
   *
   * Vem do produto, e desce até aqui de propósito: a tela da aula tem o
   * módulo na mão, não o produto, e escrever a mesma frase em cinquenta
   * e uma aulas seria cinquenta e uma chances de ela ficar diferente.
   */
  avisoMaterial: string | null;
  aulas: Aula[];
  /** Conteúdos da seção — pendurados no módulo, fora de qualquer aula. */
  conteudos: Conteudo[];
};

export type Aula = {
  id: string;
  /** Só aulas publicadas contam (a equipe também enxerga rascunhos). */
  publicado?: boolean;
  moduloId: string;
  numero: number;
  titulo: string;
  ordem: number;
  duracaoSegundos: number | null;
  videoProvider: string | null;
  videoRef: string | null;
  materialPath: string | null;
  /**
   * O que a aula ensina, escrito à mão. UM texto só.
   *
   * Existe porque o vídeo não serve sozinho: quem está no ônibus, com o
   * dado no fim ou numa casa de internet fraca ficava sem a aula
   * inteira. E é o único conteúdo que algo automático — uma busca, um
   * assistente de dúvidas — conseguiria ler: título não é conteúdo.
   *
   * Um campo, e não três (resumo/exercício/aplicação, como chegou a
   * ser): o texto nasce inteiro na cabeça de quem escreve, e picá-lo em
   * caixas obriga a inventar divisão onde não há. O espaçamento e o
   * destaque são de quem escreve; a tela repete o que recebeu.
   */
  texto: string | null;
  resumo?: string | null;
  exercicio?: string | null;
  capaPath: string | null;
  bloqueadoGeral: boolean;
  /** Conteúdos extras desta aula, além do vídeo e do material de sempre. */
  conteudos: Conteudo[];
};

export type AulaAoVivo = {
  /**
   * O identificador do encontro.
   *
   * Sem ele a tela do ao vivo não tinha como pedir o vídeo:
   * `videoDaAoVivo(id)` existe desde sempre, mas o catálogo jogava o
   * `id` fora ao montar o mapa. Era por isso que aquela tela mostrava
   * só a data.
   */
  id: string;
  moduloId: string;
  quandoTexto: string | null;
  /** Data e hora marcadas no painel; nulo = "data a confirmar". */
  dataHora?: string | null;
  liberada: boolean;
};

export type Categoria = {
  id: string;
  titulo: string;
  ordem: number;
  destacada: boolean;
  bloqueadaGeral: boolean;
  presentes: Presente[];
  /** Os produtos desta categoria, na ordem definida no painel. */
  produtos: Produto[];
};

/** Um pedaço de conteúdo. O mesmo formato serve para todos os tipos. */
export type TipoConteudo = "video" | "audio" | "texto" | "pdf" | "link" | "imagem";

export type Conteudo = {
  id: string;
  produtoId: string;
  /** Onde ele está pendurado. Os três nulos = conteúdo direto do produto. */
  moduloId: string | null;
  aulaId: string | null;
  presenteId: string | null;
  tipo: TipoConteudo;
  titulo: string;
  texto: string | null;
  arquivoPath: string | null;
  url: string | null;
  videoProvider: string | null;
  videoRef: string | null;
  ordem: number;
  publicado: boolean;
};

/**
 * O container universal.
 *
 * `categoriaId` diz ONDE ele aparece — e só isso. Não diz o que ele tem
 * dentro: um produto pode ter módulos e aulas, pode ter itens de
 * acervo, pode ter conteúdo direto, ou qualquer combinação.
 */
export type Produto = {
  id: string;
  /** Início: rótulo ("Sua mentoria") e nome curto ("Bênçãos Ilimitadas"), 0052. */
  rotuloInicio?: string | null;
  nomeCurto?: string | null;
  categoriaId: string;
  titulo: string;
  descricao: string;
  capaPath: string | null;
  ordem: number;
  publicado: boolean;
  bloqueadoGeral: boolean;
  modulos: Modulo[];
  presentes: Presente[];
  /** Conteúdo pendurado direto no produto, sem módulo nem item. */
  conteudos: Conteudo[];
  /** O que é este curso: para quem, o que promete, com que voz. */
  fundacao: string | null;
  /** Frase única sobre material de apoio, escrita uma vez para todas as aulas. */
  avisoMaterial: string | null;
};

export type Presente = {
  id: string;
  categoriaId: string;
  titulo: string;
  descricao: string;
  duracaoTexto: string;
  capaPath: string | null;
  videoProvider: string | null;
  videoRef: string | null;
  ordem: number;
  bloqueadoGeral: boolean;
  /** A qual produto este item pertence. Nulo só em base antiga. */
  produtoId: string | null;
  /** Conteúdos deste item. */
  conteudos: Conteudo[];
};

export type Catalogo = {
  modulos: Modulo[];
  categorias: Categoria[];
  aoVivo: Record<string, AulaAoVivo>;
  /** Todos os produtos, na ordem de categoria e depois de posição. */
  produtos: Produto[];
  /**
   * Qual produto é "Minha jornada" — Início, Módulos, Perfil e o
   * percentual. Os outros aparecem na prateleira por categoria.
   *
   * É colocação, não tipo: qualquer produto pode ser este, e sê-lo não
   * muda nada do que ele tem dentro.
   */
  produtoJornada: string | null;
};

export type StatusConta = "ativa" | "bloqueada";

export type Aluna = {
  id: string;
  nome: string;
  login: string;
  codigo: string;
  status: StatusConta;
  /** Ids das aulas liberadas. Em produção vem da tabela `acessos`. */
  acessos: string[];
  /** Ids dos presentes liberados. */
  acessosPresentes: string[];
};

export type Progresso = {
  aulaId: string;
  posicaoSegundos: number;
  percentualAssistido: number;
  concluidaEm: string | null;
};

export type Comentario = {
  id: string;
  aulaId: string;
  autoraId: string;
  texto: string;
  posicaoSegundos: number;
  criadoEm: string;
};

export type AtividadeAluna = {
  alunaId: string;
  progresso: Record<string, Progresso>;
  curtidas: string[];
  comentarios: Comentario[];
};
