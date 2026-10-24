/**
 * O painel da equipe, ligado ao Supabase.
 *
 * A tela é a da maquete aprovada (`previa/painel-para-desenhar.html`):
 * as mesmas marcações, classes, textos e ordem, desenhadas pelas mesmas
 * funções de texto. O que mudou é a origem dos dados. Na maquete tudo
 * vivia no navegador; aqui cada ação é uma chamada ao banco, e a tela
 * se redesenha com o que o banco devolve. O banco confere o papel de
 * quem pede — o que a tela esconde é só conforto, não é a trava.
 *
 * No navegador ficam só a sessão (guardada pelo cliente do Supabase) e a
 * escolha do tema.
 */
import "./painel.css";
import { supabase } from "@/data/supabase";
import * as api from "@/data/api";
import { idDoVideo, provedorDoLink } from "@/admin/video";
import { editarFoto, lerImagem, type Ajuste } from "./editorFoto";
import { editarCapa } from "./editorCapa";

/* ---------- tipos ---------- */

type Papel = "Dono" | "Administrador" | "Suporte";
type AcessoAula = "padrao" | "liberada" | "bloqueada";
type TipoExtra = "Vídeo" | "Áudio" | "Texto" | "PDF / e-book" | "Link" | "Imagem / capa";

type Extra = { id: string; tipo: TipoExtra; nome: string; arquivo: string };
type Aula = {
  id: string; nome: string; video: string; capa: string; texto: string;
  // Nulos enquanto a 0047 não estiver no banco: aí os campos não aparecem.
  resumo: string | null; exercicio: string | null;
  acesso: AcessoAula; extras: Extra[]; criado: string; duracao: number;
  /** Número escolhido no painel (0063). */
  num: number;
  /** Desativada (não publicada): some da área da aluna. */
  pub: boolean;
  /** Quando foi liberada para todas (0070). */
  liberadaEm: string;
  /** Nome antes do número: "Aula", "Episódio"… (0064). */
  rot: string;
  /** Data de liberação da aula para todas; vazio = sem data própria (0066). */
  libera: string;
  /** Vídeo, áudio ou PDF (e-book); áudio e PDF guardam o caminho do arquivo (0067). */
  tipo: "video" | "audio" | "pdf"; arquivo: string;
  /** E-book: nome e cor do botão do PDF e as outras opções (0068). */
  botaoEbook: string; botaoEbookCor: string; opcoes: Opcao[];
};
/** Uma opção a mais na tela do e-book (conteúdo da aula com `opcao`). */
type Opcao = {
  id: string; rotulo: string; cor: string; tipo: "texto" | "audio" | "video" | "pdf";
  texto: string; arquivo: string; video: string; capa: string; tituloTela: string; instrucoes: string; extras: Extra[];
};
type Modulo = { id: string; nome: string; num: number; rot: string; ativo: boolean; pub: boolean; libera: string; aulas: Aula[]; criado: string; intro: string; capaH: string; capa: string; cor: string; vivo: { data: string } | null };
type Curso = {
  id: string; nome: string; cat: string; catAba: string; visivel: boolean; inicio: number;
  /** Bloqueado: aparece para a aluna, sem acesso (0069). */
  bloq: boolean;
  /** Data de liberação do curso (0072). */
  libera: string;
  descricao: string; fundacao: string; aviso: string; modulos: Modulo[];
  criado: string; capa: string;
  /** Início da área da aluna (0052): rótulo e nome curto do bloco da mentoria. */
  rotuloInicio: string; nomeCurto: string;
};
type Versiculo = { id: string; texto: string; ref: string };
type Destaque = {
  id: string; imagem: string; rotulo: string; titulo: string; descricao: string; botao: string;
  destino: "presentes" | "categoria"; categoriaId: string; categoriaNome: string; icone: string; cor: string; visivel: boolean;
};
type CatAba = { id: string; aba: string; nome: string; descricao: string; capa: string; pub: boolean; bloq: boolean; criado: string };
type Cat = { id: string; nome: string; visivel: boolean; pub: boolean; icone: string; capa: string; descricao: string; criado: string };
type Aluna = {
  id: string; nome: string; login: string; codigo: string;
  celular: string; email: string;
  entrada: string; validade: string; bloqueada: boolean; liberadas: number;
  acesso: { cursos: string[]; modulos: string[]; aulas: string[] };
  datas: Record<string, string>;
  cronograma: Record<string, number>;
  /** Do banco (0043): último acesso (AAAA-MM-DD), última aula, concluídas e nota. */
  ultimoAcesso: string; ultimoAcessoEm?: string; ultimaAula: string;
  /** Cada liberação, com quando foi dada e quando abre (página do curso). */
  concessoes: { escopo: string; alvo: string; em: string; abre: string }[]; concluidas: number; nota: number; nComentarios: number;
  /** Quando foi cadastrada (data e hora), para a lista sair na ordem em que entraram. */
  criadaEm: string;
  feitas: Set<string>;
  notas: Nota[]; contatos: Contato[];
};
type Nota = { id: string; texto: string; quem: string; quando: string };
type Contato = { id: string; resultado: string; obs: string; quem: string; quando: string };
type Hist = { id: string; aluna: string | null; quem: string; quando: string; texto: string };
type Sugestao = { id: string; texto: string; quem: string; autorId: string; quando: string };
type Estado = "moderar" | "publicado" | "oculto";
type Comentario = {
  id: string; autora: string; autoraId: string; aula: string; quando: string;
  texto: string; estado: Estado; resposta: string;
  /** Data e hora em que foi escrito (ISO). */
  criado: string;
};
type Pessoa = {
  id: string; nome: string; login: string; codigo: string | null;
  papel: Papel; bloqueada: boolean; souEu: boolean;
};
type Eu = { id: string; nome: string; papel: Papel };

type Dados = {
  cats: Cat[]; catsAba: CatAba[]; catItens: { id: string; cat: string; tipo: "curso" | "modulo" | "aula"; item: string }[]; cursos: Curso[]; alunas: Aluna[];
  comentarios: Comentario[]; equipe: Pessoa[];
  historico: Hist[]; sugestoes: Sugestao[];
  /** Foto de cada aluna (o recorte redondo), quando tem. */
  fotos: Record<string, string>;
  /** Configurações gerais e Destaques do Início (0052). */
  config: { marcaTitulo: string; marcaSub: string; fraseRetorno: string; exibirDestaques: boolean; jornada: string };
  versiculos: Versiculo[];
  destaques: Destaque[];
};

/* ---------- utilidades (as mesmas da maquete) ---------- */

const FUSO = "America/Sao_Paulo";
const h = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
/** O dia, no horário de Brasília, em AAAA-MM-DD. */
const diaDe = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { timeZone: FUSO });
const hoje = () => diaDe(new Date());
const br = (s: string) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y; };
const brCurto = (s: string) => { if (!s) return "—"; const [, m, d] = s.split("-"); return d + "/" + m; };
const maisAno = (s: string) => { const d = new Date(s + "T12:00:00"); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
const maisDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const novoCodigo = () => { const r = new Uint32Array(1); crypto.getRandomValues(r); return String(1000 + (r[0] % 9000)); };
const p = (n: number, um: string, varios: string) => n + " " + (n === 1 ? um : varios);
/** Celular no formato (11) 98765-4321, enquanto digita. Só números entram. */
function formatarCelular(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return "(" + d;
  if (d.length <= 7) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}

const vencida = (a: Aluna) => !!a.validade && a.validade < hoje();
function quando(iso: string): string {
  const dia = diaDe(iso);
  const hora = new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  if (dia === hoje()) return "hoje, " + hora;
  if (dia === maisDias(hoje(), -1)) return "ontem, " + hora;
  return brCurto(dia) + ", " + hora;
}

const PAPEL: Record<string, Papel> = { dono: "Dono", admin: "Administrador", suporte: "Suporte" };

/** Tipo do extra na tela ↔ tipo no banco, e o depósito do arquivo. */
const TIPOS: { tela: TipoExtra; banco: string; deposito: "materiais" | "audios" | "capas" | null }[] = [
  { tela: "Vídeo", banco: "video", deposito: null },
  { tela: "Áudio", banco: "audio", deposito: "audios" },
  { tela: "Texto", banco: "texto", deposito: null },
  { tela: "PDF / e-book", banco: "pdf", deposito: "materiais" },
  { tela: "Link", banco: "link", deposito: null },
  { tela: "Imagem / capa", banco: "imagem", deposito: "capas" },
];
const tipoDaTela = (t: TipoExtra) => TIPOS.find((x) => x.tela === t)!;
const tipoDoBanco = (b: string) => (TIPOS.find((x) => x.banco === b) ?? TIPOS[2]).tela;

/** O que o banco recusa, dito para gente. */
const MOTIVOS: Record<string, string> = {
  sem_permissao: "Seu papel não permite esta ação.",
  login_em_uso: "Já existe alguém com esse login.",
  login_invalido: "O login aceita letras minúsculas, números, ponto, hífen e sublinhado.",
  codigo_invalido: "O código tem de 4 a 6 números.",
  nome_invalido: "Confira o nome.",
  validade_antes_da_entrada: "A validade não pode ser antes da entrada.",
  data_vazia: "Preencha a entrada e a validade.",
  celular_invalido: "Preencha o celular com DDD: (11) 98765-4321.",
  email_invalido: "Confira o e-mail.",
  nao_bloqueia_a_si_mesmo: "Você não pode bloquear a si mesma.",
  nao_remove_a_si_mesmo: "Você não pode remover a si mesma.",
  produtos_categoria_id_fkey: "Este botão tem categorias. Mude-as de botão antes de remover.",
  "JWT expired": "Sua sessão expirou. Entre de novo.",
  // Atualização que a RLS barrou volta sem linha nenhuma.
  "multiple (or no) rows returned": "Seu papel não permite esta ação, ou o item já não existe.",
};
function motivo(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  for (const k of Object.keys(MOTIVOS)) if (msg.includes(k)) return MOTIVOS[k];
  return "Não foi possível concluir. " + msg;
}
function falhou<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

/* ---------- leitura do banco ---------- */

/*
 * O banco devolve no máximo 1000 linhas por consulta. As liberações já
 * passam disso (uma linha por aula por aluna), e o que ficava de fora
 * sumia do painel — e podia sumir de vez num "Salvar liberação". Aqui a
 * leitura vai em páginas até acabar.
 */
async function emPaginas<T>(pedir: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const todas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await pedir(de, de + 999);
    if (r.error) return { data: null, error: r.error };
    todas.push(...(r.data ?? []));
    if (!r.data || r.data.length < 1000) return { data: todas, error: null };
  }
}

// As fotos das alunas são o maior peso da abertura: vêm por último, sem segurar a tela.
let fotosCache: Record<string, string> = {};
async function carregarFotos(): Promise<boolean> {
  const r = await supabase.from("fotos_aluna").select("aluna_id, foto");
  if (r.error) return false;
  fotosCache = Object.fromEntries(((r.data ?? []) as Array<{ aluna_id: string; foto: string }>).map((x) => [x.aluna_id, x.foto]));
  return true;
}
/** Liberação de cada aula pelas alunas: a próxima data marcada e a última já aberta. */
const libPorAula = new Map<string, { prox: string; ult: string }>();
async function lerTudo(quem: Eu | Promise<Eu | null>): Promise<Dados> {
  libPorAula.clear();
  // Tudo sai junto, numa leva só: as duas rodadas e a equipe não esperam umas pelas outras.
  const euP = Promise.resolve(quem);
  const equipeP = euP.then((e) => (e && e.papel !== "Suporte" ? supabase.rpc("equipe_do_painel") : null));
  const ondaA = Promise.all([
    supabase.from("categorias").select("*").order("ordem"),
    supabase.from("produtos").select("id, titulo, categoria_id, categoria_aba_id, publicado, bloqueado_geral, libera_em, inicio, descricao, fundacao, aviso_material, ordem, criado_em, capa_path, rotulo_inicio, nome_curto").order("ordem"),
    supabase.from("modulos").select("id, produto_id, numero, titulo, ordem, bloqueado_geral, publicado, libera_em, criado_em, intro, capa_horizontal_path, capa_path, cor_destaque, rotulo").not("produto_id", "is", null).order("ordem"),
    supabase.from("aulas").select("*").order("ordem").order("numero"),
    supabase.from("aula_midia").select("aula_id, video_ref"),
    supabase.from("conteudos").select("id, aula_id, tipo, titulo, texto, arquivo_path, url, video_ref, video_provider, ordem, opcao, cor, capa_path, titulo_tela, instrucoes, pai_id").not("aula_id", "is", null).order("ordem"),
    supabase.rpc("alunas_do_painel"),
    emPaginas((de, ate) => supabase.from("acessos").select("aluna_id, escopo, produto_id, modulo_id, aula_id, abre_em, concedido_em").order("id").range(de, ate)),
    supabase.from("cronograma_modulo").select("aluna_id, modulo_id, dias"),
    supabase.rpc("comentarios_para_moderacao", { p_aula: null }),
    supabase.rpc("contatos_das_alunas"),
  ]);
  const ondaB = Promise.all([
    supabase.rpc("engajamento_alunas"),
    emPaginas((de, ate) => supabase.rpc("aulas_concluidas_alunas").order("aluna_id").order("aula_id").range(de, ate)),
    supabase.from("anotacoes_aluna").select("id, aluna_id, texto, autor_nome, quando").order("quando"),
    supabase.from("contatos_aluna").select("id, aluna_id, resultado, observacao, autor_nome, quando").order("quando"),
    supabase.from("sugestoes").select("id, texto, autor_id, autor_nome, quando").order("quando", { ascending: false }),
    supabase.from("historico_acoes").select("id, aluna_id, autor_nome, quando, texto").order("quando", { ascending: false }).limit(1000),
    supabase.from("profiles").select("id, criada_em").eq("papel", "aluna"),
    Promise.resolve(null), // as fotos chegam depois (carregarFotos), para a tela abrir antes
    supabase.from("configuracoes").select("marca_titulo, marca_sub, frase_retorno, exibir_destaques, produto_jornada").maybeSingle(),
    supabase.from("versiculos").select("id, texto, referencia").order("ordem").order("criado_em"),
    supabase.from("destaques_inicio").select("*").order("ordem").order("criado_em"),
    supabase.from("aulas_ao_vivo").select("modulo_id, data_hora"),
    supabase.from("categorias_aba").select("*").order("ordem").order("criada_em"),
    supabase.from("categoria_itens").select("id, categoria_aba_id, tipo, item_id").order("ordem").order("criado_em"),
  ]);
  const [cats, prods, mods, aulas, midias, extras, alunas, acessos, crono, coms, contatos] = await ondaA;
  // Rodada 2 (0043). Se alguma leitura destas falhar, o painel abre do mesmo jeito, sem ela.
  const [eng, feitas, notas, contatosAl, sugs, hist, cadastro, , cfgIni, versos, dests, vivos, catsAbaR, catItensR] = await ondaB;
  const criadaEm = new Map<string, string>(((cadastro.data ?? []) as Array<{ id: string; criada_em: string }>).map((x) => [x.id, x.criada_em]));
  for (const r of [cats, prods, mods, aulas, extras, alunas, acessos, crono, coms]) falhou(r);

  const video = new Map<string, string>();
  for (const m of midias.data ?? []) video.set(m.aula_id, m.video_ref ?? "");

  const extrasDa = new Map<string, Extra[]>(), opcoesDa = new Map<string, Opcao[]>(), extrasDaOpcao = new Map<string, Extra[]>();
  const comoExtra = (k: any): Extra => ({ id: k.id, tipo: tipoDoBanco(k.tipo), nome: k.titulo ?? "", arquivo: k.arquivo_path ?? k.url ?? k.video_ref ?? k.texto ?? "" });
  for (const k of extras.data ?? []) {
    if (k.pai_id) { const l = extrasDaOpcao.get(k.pai_id) ?? []; l.push(comoExtra(k)); extrasDaOpcao.set(k.pai_id, l); continue; }
    if (k.opcao) {
      const l = opcoesDa.get(k.aula_id) ?? [];
      l.push({ id: k.id, rotulo: k.titulo ?? "", cor: k.cor || "", tipo: ["texto", "audio", "video", "pdf"].includes(k.tipo) ? k.tipo : "texto", texto: k.texto ?? "", arquivo: k.arquivo_path ?? "", video: k.video_ref ?? "", capa: k.capa_path ?? "", tituloTela: k.titulo_tela ?? "", instrucoes: k.instrucoes ?? "", extras: [] });
      opcoesDa.set(k.aula_id, l); continue;
    }
    const lista = extrasDa.get(k.aula_id) ?? [];
    lista.push(comoExtra(k));
    extrasDa.set(k.aula_id, lista);
  }
  for (const l of opcoesDa.values()) for (const o of l) o.extras = extrasDaOpcao.get(o.id) ?? [];

  const aulasDo = new Map<string, Aula[]>();
  for (const a of aulas.data ?? []) {
    const lista = aulasDo.get(a.modulo_id) ?? [];
    lista.push({
      id: a.id, nome: a.titulo, video: video.get(a.id) ?? "", capa: a.capa_path ?? "",
      texto: a.texto ?? "",
      resumo: "resumo" in a ? a.resumo ?? "" : null, exercicio: "exercicio" in a ? a.exercicio ?? "" : null,
      acesso: a.bloqueado_geral ? "bloqueada" : a.liberada_geral ? "liberada" : "padrao",
      extras: extrasDa.get(a.id) ?? [], criado: a.criada_em ?? "", duracao: Number(a.duracao_segundos) || 0,
      num: Number(a.numero) || 0, pub: a.publicado !== false, liberadaEm: a.liberada_em ?? "", rot: (a.rotulo ?? "").trim() || "Aula", libera: a.libera_em ?? "",
      tipo: a.tipo === "audio" || a.tipo === "pdf" ? a.tipo : "video", arquivo: a.arquivo_path ?? "",
      botaoEbook: a.botao_ebook ?? "", botaoEbookCor: a.botao_ebook_cor ?? "", opcoes: opcoesDa.get(a.id) ?? [],
    });
    aulasDo.set(a.modulo_id, lista);
  }

  const modsDo = new Map<string, Modulo[]>();
  const vivoDo = new Map<string, string>(((vivos.data ?? []) as Array<{ modulo_id: string; data_hora: string | null }>).map((v) => [v.modulo_id, v.data_hora ?? ""]));
  for (const m of mods.data ?? []) {
    const lista = modsDo.get(m.produto_id) ?? [];
    lista.push({ id: m.id, nome: m.titulo, num: Number(m.numero) || 0, rot: (m.rotulo ?? "").trim() || "Módulo", ativo: !m.bloqueado_geral, pub: m.publicado !== false, libera: m.libera_em ?? "", aulas: aulasDo.get(m.id) ?? [], criado: m.criado_em ?? "", intro: m.intro ?? "", capaH: m.capa_horizontal_path ?? "", capa: m.capa_path ?? "", cor: m.cor_destaque ?? "", vivo: vivoDo.has(m.id) ? { data: vivoDo.get(m.id)! } : null });
    modsDo.set(m.produto_id, lista);
  }

  const cursos: Curso[] = (prods.data ?? []).map((c) => ({
    id: c.id, nome: c.titulo, cat: c.categoria_id ?? "", catAba: c.categoria_aba_id ?? "", visivel: !!c.publicado, bloq: !!c.bloqueado_geral, libera: c.libera_em ?? "",
    inicio: c.inicio ?? 1, descricao: c.descricao ?? "", fundacao: c.fundacao ?? "",
    aviso: c.aviso_material ?? "", modulos: modsDo.get(c.id) ?? [],
    criado: c.criado_em ?? "", capa: c.capa_path ?? "",
    rotuloInicio: c.rotulo_inicio ?? "", nomeCurto: c.nome_curto ?? "",
  }));

  // Celular e e-mail (0041). Se a leitura falhar, a lista abre do mesmo jeito, só sem eles.
  const contato = new Map<string, { celular?: string; email?: string }>();
  for (const c of contatos.data ?? []) contato.set(c.id, c);
  const listaAlunas: Aluna[] = (alunas.data ?? []).map((a: Record<string, unknown>) => ({
    id: String(a.id), nome: String(a.nome), login: String(a.login), codigo: String(a.codigo ?? ""),
    celular: String(a.celular ?? contato.get(String(a.id))?.celular ?? ""),
    email: String(contato.get(String(a.id))?.email ?? ""),
    entrada: String(a.entrada ?? ""), validade: a.validade ? String(a.validade) : "",
    bloqueada: a.status === "bloqueada", liberadas: Number(a.aulas_liberadas ?? 0),
    acesso: { cursos: [], modulos: [], aulas: [] }, datas: {}, cronograma: {},
    ultimoAcesso: "", ultimaAula: "", concluidas: 0, nota: 0, nComentarios: 0,
    criadaEm: criadaEm.get(String(a.id)) ?? "",
    feitas: new Set<string>(), notas: [], contatos: [], concessoes: [],
  }));
  const porId = new Map(listaAlunas.map((a) => [a.id, a]));
  for (const e of (eng.data ?? []) as Record<string, unknown>[]) {
    const al = porId.get(String(e.aluna_id));
    if (!al) continue;
    al.ultimoAcesso = e.ultimo_acesso ? diaDe(String(e.ultimo_acesso)) : "";
    al.ultimoAcessoEm = e.ultimo_acesso ? String(e.ultimo_acesso) : "";
    al.ultimaAula = e.ultima_aula ? String(e.ultima_aula) : "";
    al.liberadas = Number(e.liberadas ?? al.liberadas);
    al.concluidas = Number(e.concluidas ?? 0);
    al.nComentarios = Number(e.comentarios ?? 0);
    al.nota = Number(e.nota ?? 0);
  }
  for (const f of (feitas.data ?? []) as { aluna_id: string; aula_id: string }[]) porId.get(f.aluna_id)?.feitas.add(f.aula_id);
  for (const n of notas.data ?? []) porId.get(n.aluna_id)?.notas.push({ id: n.id, texto: n.texto, quem: n.autor_nome, quando: n.quando });
  for (const c of contatosAl.data ?? []) porId.get(c.aluna_id)?.contatos.push({ id: c.id, resultado: c.resultado, obs: c.observacao ?? "", quem: c.autor_nome, quando: c.quando });
  for (const ac of acessos.data ?? []) {
    const al = porId.get(ac.aluna_id);
    if (!al) continue;
    al.concessoes.push({ escopo: ac.escopo, alvo: ac.produto_id || ac.modulo_id || ac.aula_id || "", em: ac.concedido_em ?? "", abre: ac.abre_em ?? "" });
    if (ac.escopo === "produto" && ac.produto_id) al.acesso.cursos.push(ac.produto_id);
    if (ac.escopo === "modulo" && ac.modulo_id) al.acesso.modulos.push(ac.modulo_id);
    if (ac.escopo === "aula" && ac.aula_id) {
      al.acesso.aulas.push(ac.aula_id);
      if (ac.abre_em) al.datas[ac.aula_id] = diaDe(ac.abre_em);
    }
  }
  for (const ac of acessos.data ?? []) {
    if (ac.escopo !== "aula" || !ac.aula_id) continue;
    const quando = ac.abre_em || ac.concedido_em || "";
    const l = libPorAula.get(ac.aula_id) ?? { prox: "", ult: "" };
    if (ac.abre_em && new Date(ac.abre_em).getTime() > Date.now()) { if (!l.prox || ac.abre_em < l.prox) l.prox = ac.abre_em; }
    else if (quando && (!l.ult || quando > l.ult)) l.ult = quando;
    libPorAula.set(ac.aula_id, l);
  }
  for (const c of crono.data ?? []) {
    const al = porId.get(c.aluna_id);
    if (al) al.cronograma[c.modulo_id] = c.dias;
  }

  // Comentário das alunas na lista; a resposta da equipe vai dentro dele.
  type Linha = { id: string; aula_id: string; autora_id: string; autora_nome: string; texto: string; status: string; criado_em: string; resposta_a: string | null; eh_instrutor: boolean };
  const linhas = (coms.data ?? []) as Linha[];
  const resposta = new Map<string, string>();
  for (const c of [...linhas].reverse()) {
    if (c.eh_instrutor && c.resposta_a && c.status !== "removido" && !resposta.has(c.resposta_a)) {
      resposta.set(c.resposta_a, c.texto);
    }
  }
  const comentarios: Comentario[] = linhas
    .filter((c) => !c.eh_instrutor && c.status !== "removido")
    .map((c) => ({
      id: c.id, autora: c.autora_nome, autoraId: c.autora_id ?? "", aula: c.aula_id, quando: quando(c.criado_em), criado: c.criado_em, texto: c.texto,
      estado: c.status === "pendente" ? "moderar" : (c.status as Estado),
      resposta: resposta.get(c.id) ?? "",
    }));

  let equipe: Pessoa[] = [];
  const eqR = await equipeP;
  if (eqR) {
    const r = falhou(eqR);
    equipe = ((r.data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: String(e.id), nome: String(e.nome), login: String(e.login),
      codigo: e.codigo ? String(e.codigo) : null, papel: PAPEL[String(e.papel)] ?? "Suporte",
      bloqueada: e.status === "bloqueada", souEu: !!e.sou_eu,
    }));
  }

  return {
    cats: (cats.data ?? []).map((k) => ({ id: k.id, nome: k.titulo, visivel: !k.bloqueada_geral, pub: k.publicado !== false, icone: k.icone || "presentes", capa: k.capa_path ?? "", descricao: k.descricao ?? "", criado: k.criada_em ?? "" })),
    catsAba: ((catsAbaR.data ?? []) as Record<string, string & boolean>[]).map((x) => ({ id: x.id, aba: x.aba_id, nome: x.titulo, descricao: x.descricao ?? "", capa: x.capa_path ?? "", pub: x.publicado !== false, bloq: !!x.bloqueada_geral, criado: x.criada_em ?? "" })),
    catItens: ((catItensR.data ?? []) as Record<string, string>[]).map((x) => ({ id: x.id, cat: x.categoria_aba_id, tipo: x.tipo as "curso" | "modulo" | "aula", item: x.item_id })),
    cursos, alunas: listaAlunas, comentarios, equipe,
    config: { marcaTitulo: cfgIni.data?.marca_titulo ?? "", marcaSub: cfgIni.data?.marca_sub ?? "", fraseRetorno: cfgIni.data?.frase_retorno ?? "", exibirDestaques: cfgIni.data?.exibir_destaques !== false, jornada: cfgIni.data?.produto_jornada ?? "" },
    versiculos: ((versos.data ?? []) as Record<string, string>[]).map((x) => ({ id: x.id, texto: x.texto, ref: x.referencia })),
    destaques: ((dests.data ?? []) as Record<string, string & boolean>[]).map((x) => ({
      id: x.id, imagem: x.imagem_path ?? "", rotulo: x.rotulo, titulo: x.titulo, descricao: x.descricao ?? "", botao: x.botao,
      destino: x.destino === "categoria" ? "categoria" : "presentes", categoriaId: x.categoria_id ?? "", categoriaNome: x.categoria_nome ?? "",
      icone: x.icone ?? "estrela", cor: x.cor ?? "dourado", visivel: !!x.visivel,
    })),
    fotos: fotosCache,
    historico: ((hist.data ?? []) as Record<string, string>[]).map((x) => ({ id: x.id, aluna: x.aluna_id ?? null, quem: x.autor_nome, quando: x.quando, texto: x.texto })),
    sugestoes: ((sugs.data ?? []) as Record<string, string>[]).map((x) => ({ id: x.id, texto: x.texto, quem: x.autor_nome, autorId: x.autor_id ?? "", quando: x.quando })),
  };
}

async function quemSouEu(): Promise<Eu | null> {
  const perfil = await api.meuPerfil();
  if (!perfil || perfil.status !== "ativa" || !PAPEL[perfil.papel]) return null;
  return { id: perfil.id, nome: perfil.nome, papel: PAPEL[perfil.papel] };
}

/** Chama uma Edge Function com a sessão de quem está no painel. */
async function chamarFuncao(nome: string, corpo: unknown): Promise<Record<string, unknown>> {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) throw new Error("JWT expired");
  const resposta = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nome}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessao.session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  const r = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(String(r?.mensagem ?? r?.erro ?? "Não foi possível concluir agora."));
  return r;
}

async function enviarArquivo(deposito: string, pasta: string, arquivo: File): Promise<string> {
  const limpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const caminho = `${pasta}/${Date.now()}-${limpo || "arquivo"}`;
  falhou(await supabase.storage.from(deposito).upload(caminho, arquivo, { contentType: arquivo.type || undefined }));
  return caminho;
}
const urlDaCapa = (caminho: string) =>
  /^https?:\/\//.test(caminho) ? caminho : supabase.storage.from("capas").getPublicUrl(caminho).data.publicUrl;

/* ---------- o painel ---------- */

export function montar(app: HTMLElement) {
  document.body.setAttribute("data-painel", "sim");
  document.title = "Painel AION";

  let eu: Eu | null = null;
  let S: Dados = { cats: [], catsAba: [], catItens: [], cursos: [], alunas: [], comentarios: [], equipe: [], historico: [], sugestoes: [], fotos: {}, config: { marcaTitulo: "", marcaSub: "", fraseRetorno: "", exibirDestaques: true, jornada: "" }, versiculos: [], destaques: [] };
  let carregando = true;
  let ocupado = false;
  /** Os quadros do Início que a pessoa abriu. Começam todos fechados. */
  const inicioAberto = new Set<string>();
  const ui = {
    tab: "inicio", curso: null as string | null, aula: null as string | null, busca: "",
    filtroCom: "responder" as Estado | "responder", modal: null as null | Record<string, string>,
    editando: null as null | { tipo: string; id: string }, addAula: null as string | null,
    respondendo: null as string | null, extraTipo: "PDF / e-book" as TipoExtra, erroLogin: "",
    focar: null as string | null, arrasto: null as string | null,
    abertos: new Set<string>(), primeiraVez: true, iniDe: "", iniAte: "", periodoAberto: false, ativTodas: false, iniLista: "", iniLib: "hoje", iniLibTodas: false, comAlvo: "", destEditar: null as string | null, paginaAl: 1, catVer: new Set<string>(), catEditar: null as string | null, catAnima: false, catBusca: "", catVista: "cards", catNova: "", catOrdenar: false, destOrdenar: false, previa: "mobile", catxFiltro: "", catxOrdem: "posicao", catxTipo: "curso", catxEditar: "", catxSel: "", layAba: "", layCat: "", abaNova: false, abaRen: "", destAberto: false,
    filtroAl: "todas", ordemAl: "recentes", sel: [] as string[], menu: null as string | null,
    ficha: null as string | null, verCodigo: null as string | null,
    buscaGeral: "", buscaAberta: false, inicioVista: "",
    acessoLista: "", acessoAluna: null as string | null, acessoAba: "geral", aaAnima: "", filtroEng: "todas", guiaEng: true, ajuda: null as string | null,
    sujo: null as null | { f: string; id: string },
    engDias: 7, engMenu: "" as string,
    csComFiltro: "moderar", csComPer: "hoje", csComMod: "", csAddMod: false, novaAula: "", novoMod: "", estMenu: "", modBusca: "", aulaTipo: "", op2Tipo: "", modPagina: null as string | null, aulaMais: null as string | null, csAddAluna: false, csSit: "todas", csPag: 1, csPorPag: 10, relPer: "7", relDe: "", relAte: "",
    cursoAba: "visao", curAlBusca: "", curAlFiltro: "", curAlDe: "", curAlAte: "", curAlMenu: "",
    curMenu: "" as string, cursoBusca: "", cursoOrdem: "categorias", cursoVista: "grade", cursoCat: "",
  };
  const previas: Record<string, string> = {};
  let pend: null | (() => Promise<Resultado>) = null;

  const toastEl = document.createElement("div");
  toastEl.id = "toast"; toastEl.className = "toast"; toastEl.setAttribute("role", "status"); toastEl.hidden = true;
  const arquivoCapa = Object.assign(document.createElement("input"), { type: "file", id: "arquivoCapa", accept: "image/*", hidden: true });
  const arquivoCat = Object.assign(document.createElement("input"), { type: "file", id: "arquivoCat", accept: "image/*", hidden: true });
  const arquivoFoto = Object.assign(document.createElement("input"), { type: "file", id: "arquivoFoto", accept: "image/*", hidden: true });
  let fotoPara: string | null = null;
  // Imagem para um campo de formulário: envia ao depósito "capas", guarda o caminho no campo escondido e mostra a prévia.
  const arquivoImg = Object.assign(document.createElement("input"), { type: "file", id: "arquivoImg", accept: "image/*", hidden: true });
  let imgPara: { form: string; campo: string; previa: string; pasta: string; prop?: number } | null = null;
  const arquivoExtra = Object.assign(document.createElement("input"), { type: "file", id: "arquivoExtra", hidden: true });
  const arquivoAula = Object.assign(document.createElement("input"), { type: "file", id: "arquivoAula", hidden: true });
  // Arquivos das opções do e-book: um seletor só, e quem pediu diz para onde vai.
  const arquivoOp = Object.assign(document.createElement("input"), { type: "file", id: "arquivoOp", hidden: true });
  let paraOp: { deposito: string; pronto: (caminho: string, nome: string) => void } | null = null;
  arquivoOp.addEventListener("change", () => {
    const file = arquivoOp.files?.[0]; arquivoOp.value = ""; const alvo = paraOp; paraOp = null;
    const x = ui.aula ? acharAula(ui.aula) : null; if (!file || !alvo || !x) return;
    toast("Enviando o arquivo…");
    void (async () => {
      try { const caminho = await enviarArquivo(alvo.deposito, x.c.id, file); alvo.pronto(caminho, file.name.replace(/\.[^.]+$/, "")); if (ui.aula) ui.sujo = { f: "aula", id: ui.aula }; toast("Arquivo enviado. Clique em Salvar aula para guardar."); }
      catch (e) { toast(motivo(e)); }
    })();
  });
  document.body.append(arquivoOp);
  document.body.append(toastEl, arquivoCapa, arquivoExtra, arquivoAula, arquivoCat, arquivoFoto, arquivoImg);

  const KT = "aion-painel-tema";
  let tema = (() => { try { return localStorage.getItem(KT) || "escuro"; } catch { return "escuro"; } })();
  const aplicarTema = () => { document.documentElement.setAttribute("data-tema", tema); };
  aplicarTema();
  const botaoTema = () => `<button class="tema-bola" data-a="tema" aria-label="Trocar para tema ${tema === "claro" ? "escuro" : "claro"}" title="Trocar para tema ${tema === "claro" ? "escuro" : "claro"}"><span class="bola"></span></button>`;

  /* ---------- procurar ---------- */
  const curso = (id: string | null) => S.cursos.find((c) => c.id === id);
  const aluna = (id: string) => S.alunas.find((a) => a.id === id)!;
  const pessoa = (id: string) => S.equipe.find((e) => e.id === id)!;
  const cat = (id: string) => S.cats.find((c) => c.id === id);
  function acharModulo(mid: string) {
    for (const c of S.cursos) { const i = c.modulos.findIndex((m) => m.id === mid); if (i >= 0) return { c, m: c.modulos[i], i }; }
    return null;
  }
  function acharAula(aid: string) {
    for (const c of S.cursos) for (let mi = 0; mi < c.modulos.length; mi++) {
      const m = c.modulos[mi]; const ai = m.aulas.findIndex((a) => a.id === aid);
      if (ai >= 0) return { c, m, mi, a: m.aulas[ai], ai };
    }
    return null;
  }
  const numModulo = (c: Curso, i: number) => c.modulos[i]?.num ?? i + (c.inicio == null ? 1 : c.inicio);
  /** Sugestão de número: o próximo depois do maior que já existe. */
  const proxNumModulo = (c: Curso) => c.modulos.length ? Math.max(...c.modulos.map((m) => m.num)) + 1 : (c.inicio == null ? 1 : c.inicio);
  const proxNumAula = (m: Modulo) => m.aulas.length ? Math.max(...m.aulas.map((a) => a.num)) + 1 : 1;
  const erroNumero = (n: number, usados: number[], oQue: "módulo" | "aula") =>
    !Number.isInteger(n) || n < 0 || n > 999 ? "O número precisa ser de 0 a 999."
      : usados.includes(n) ? (oQue === "módulo" ? "Já existe um módulo com o número " + n + "." : "Já existe uma aula com o número " + n + " neste módulo.") : "";
  const campoNumero = (valor: number, rotulo: string) => `<input type="number" class="campo campo-num" name="numero" min="0" max="999" step="1" inputmode="numeric" required value="${valor}" aria-label="${rotulo}" />`;
  const localAula = (aid: string) => { const x = acharAula(aid); return x ? x.m.rot + " " + numModulo(x.c, x.mi) + " · " + x.a.rot + " " + x.a.num : "Aula removida"; };
  function trocado<T>(arr: T[], i: number, d: number): T[] | null {
    const j = i + d; if (j < 0 || j >= arr.length) return null;
    const novo = arr.slice(); const t = novo[i]; novo[i] = novo[j]; novo[j] = t; return novo;
  }
  const totalModulos = () => S.cursos.reduce((s, c) => s + c.modulos.length, 0);
  const totalAulas = (c: Curso) => c.modulos.reduce((s, m) => s + m.aulas.length, 0);
  const podeEquipe = () => eu?.papel !== "Suporte";
  /** Quem a pessoa logada pode bloquear, remover e trocar o código. */
  const gere = (e: Pessoa) =>
    !e.souEu && (eu?.papel === "Dono" ? e.papel !== "Dono" : eu?.papel === "Administrador" && e.papel === "Suporte");
  /** As aulas que ela tem pela liberação, na ordem do curso. */
  function aulasDaLiberacao(al: Aluna): string[] {
    const ac = al.acesso; const ids: string[] = [];
    S.cursos.forEach((c) => c.modulos.forEach((m) => m.aulas.forEach((a) => {
      if (ac.cursos.includes(c.id) || ac.modulos.includes(m.id) || ac.aulas.includes(a.id)) ids.push(a.id);
    })));
    return ids;
  }

  /* ---------- avisos ---------- */
  let tToast: ReturnType<typeof setTimeout> | undefined;
  function toast(msg: string) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(tToast); tToast = setTimeout(() => { toastEl.hidden = true; }, 3400);
  }
  /**
   * As últimas alterações que dá para voltar, da mais recente para a mais
   * antiga. Remover não entra: é definitivo. Fica só nesta aba do navegador
   * — o que volta é feito no banco, ação por ação.
   */
  const LIMITE_DESFAZER = 5;
  let pilha: { texto: string; quando: string; fn: () => Promise<void> }[] = [];
  /** Uma linha no histórico. Se o banco recusar, a ação em si já valeu — não desfaz nada. */
  async function registrar(alunaId: string | null, texto: string) {
    await supabase.from("historico_acoes").insert({ aluna_id: alunaId, texto: texto.slice(0, 500) });
  }
  type Resultado = string | void | { msg: string; desfazer?: () => Promise<void>; texto: string };
  function confirmar(opts: Record<string, string>, fn: () => Promise<Resultado>) {
    pend = fn; ui.modal = Object.assign({ tipo: "confirmar" }, opts); ui.focar = "confirmaPalavra";
  }

  /**
   * Toda escrita passa por aqui: chama o banco, avisa, relê e redesenha.
   * Se o banco recusar, a tela diz por quê e mostra o que o banco tem.
   */
  async function executar(fn: () => Promise<Resultado>) {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await fn();
      if (typeof r === "string") toast(r);
      else if (r) {
        if (r.desfazer) pilha = [{ texto: r.texto, quando: new Date().toISOString(), fn: r.desfazer }, ...pilha].slice(0, LIMITE_DESFAZER);
        toast(r.msg);
      }
    } catch (e) {
      toast(motivo(e));
    }
    try { if (eu) S = await lerTudo(eu); } catch (e) { toast(motivo(e)); }
    ocupado = false;
    render();
  }

  /* ---------- moldura ---------- */
  const ICONE_MENU: Record<string, string> = {
    inicio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6.5 8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>`,
    alunas: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.3c2.4.2 4 1.7 4.5 4.4"/></svg>`,
    engajamento: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/></svg>`,
    cursos: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10.5 9.3v5.4l4.5-2.7z"/></svg>`,
    layout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`,
    comentarios: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z"/></svg>`,
    equipe: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M5.5 19.5c.6-3.4 3.3-5.3 6.5-5.3s5.9 1.9 6.5 5.3"/></svg>`,
    config: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    registro: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h8l3.5 3.5v13.5h-11.5z"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>`,
    sair: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M19.5 12h-10M16 8.5l3.5 3.5-3.5 3.5"/></svg>`,
    ideia: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.2 1 2.1h5c0-.9.3-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>`,
  };
  const SUB_ABA: Record<string, string> = { inicio: "Visão geral da sua plataforma.", alunas: "Gerencie todas as alunas da mentoria.", layout: "Crie categorias, coloque uma capa e escolha os cursos que ficam dentro de cada uma.", engajamento: "Acompanhe a participação das alunas e identifique quem precisa de atenção." };
  const ACAO_ABA: Record<string, string> = {
    alunas: `<button class="al-botao-ouro" data-a="aluna-nova"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Cadastrar aluna</button>`,
    cursos: `<button class="al-botao-ouro" data-a="curso-novo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Criar novo curso</button>`,
  };
  ACAO_ABA.layout = `<button class="al-botao cl-ver" data-a="cs-ver-aluna">Ver na área da aluna <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/></svg></button><button class="al-botao-ouro" data-a="catx-nova-geral"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nova categoria</button>`;
  const ABAS_EXTRA: [string, string][] = [["config", "Configurações"]];
  const ABAS = [["inicio", "Início"], ["alunas", "Alunas"], ["engajamento", "Engajamento"], ["cursos", "Cursos e conteúdos"], ["layout", "Categorias"], ["comentarios", "Comentários"], ["equipe", "Equipe"], ["registro", "Registro"]];

  function titulo(): [string, string] {
    const ativas = S.alunas.filter((a) => !a.bloqueada && !vencida(a)).length;
    const c = curso(ui.curso); const x = ui.aula ? acharAula(ui.aula) : null;
    const moderar = S.comentarios.filter((k) => k.estado === "moderar").length;
    switch (ui.tab) {
      case "inicio": return ["Início", "o que pede atenção hoje"];
      case "ficha": { const fa = S.alunas.find((x) => x.id === ui.ficha); return fa ? [fa.nome, "Ficha da aluna"] : ["Ficha", "aluna não encontrada"]; }
      case "engajamento": return ["Engajamento", "quem está avançando e quem precisa de um empurrão"];
      case "registro": return ["Registro", p(S.historico.length, "ação registrada", "ações registradas")];
      case "alunas": return ["Alunas", p(S.alunas.length, "aluna", "alunas") + " · " + p(ativas, "ativa", "ativas")];
      case "layout": return ["Categorias", p(S.catsAba.length, "categoria", "categorias")];
      case "cursos": return ["Cursos e conteúdos", p(S.cursos.length, "produto", "produtos") + " · " + p(totalModulos(), "módulo", "módulos") + " · " + p(S.cursos.reduce((s, k) => s + totalAulas(k), 0), "aula", "aulas")];
      case "curso": return c ? [c.nome, p(c.modulos.length, "módulo", "módulos") + " · " + p(totalAulas(c), "aula", "aulas")] : ["Curso aberto", "nenhum curso aberto"];
      case "aula": return x ? [x.a.nome, localAula(x.a.id)] : ["Aula aberta", "nenhuma aula aberta"];
      case "catAba": { const xa = catAba(ui.catxSel); return [xa ? xa.nome : "Categoria", "Categoria · cursos desta categoria"]; }
      case "comentarios": return ["Comentários", p(moderar, "para moderar", "para moderar")];
      case "equipe": return ["Equipe", p(S.equipe.length, "pessoa", "pessoas")];
      case "config": return ["Configurações", "Configurações gerais da área de membros."];
    }
    return ["", ""];
  }

  function render() {
    const ae = document.activeElement as HTMLInputElement | null;
    const fid = ae && ae.id;
    const sel = fid && typeof ae.selectionStart === "number" ? [ae.selectionStart, ae.selectionEnd] : null;
    // Os painéis laterais rolam por dentro: redesenhar não pode jogá-los de volta ao topo.
    const rolagem = new Map<string, number>();
    app.querySelectorAll<HTMLElement>("[data-rolagem]").forEach((x) => rolagem.set(x.dataset.rolagem!, x.scrollTop));
    app.innerHTML = carregando ? carregandoTela() : eu ? painel() : login();
    document.body.classList.toggle("aa-trava", !!app.querySelector(".aa-painel"));
    ajustarListaLateral();
    ajustarArvore();
    soltarTexto();
    app.querySelectorAll<HTMLElement>("[data-rolagem]").forEach((x) => { const t = rolagem.get(x.dataset.rolagem!); if (t) x.scrollTop = t; });
    const alvo = ui.focar || fid; const veioDeFora = !!ui.focar; ui.focar = null;
    if (alvo) {
      const el = document.getElementById(alvo) as HTMLInputElement | null;
      if (el) { el.focus(); if (sel && !veioDeFora) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* campo sem seleção */ } } }
    }
  }

  /*
   * Lista de "Alunas e acessos" aberta: como na referência, os quadros
   * continuam nas mesmas posições, só mais estreitos, para caberem à
   * esquerda do painel e o escolhido ficar à vista, encostado nele. Em
   * tela estreita o painel fica por cima, na largura toda.
   */
  /*
   * Todo texto do painel pode ser selecionado e copiado com o mouse. Por
   * isso o que se arrasta (cartões, linhas) só arrasta pela alça: fora
   * dela, segurar e arrastar seleciona o texto.
   */
  function soltarTexto() {
    app.querySelectorAll<HTMLElement>('[draggable="true"]').forEach((el) => { if (el.tagName !== "BUTTON") el.draggable = false; });
  }
  /** A linha que liga o rótulo "Categorias" da aba aos cartões: do centro do cabeçalho até o primeiro e o último cartão da primeira fileira. */
  function ajustarArvore() {
    app.querySelectorAll<HTMLElement>(".ax-arvore").forEach((caixa) => {
      const g = caixa.querySelector<HTMLElement>(".ax-grade"); if (!g) return;
      const cards = [...g.querySelectorAll<HTMLElement>(".ax-card")]; if (!cards.length) return;
      const topo = cards[0].offsetTop, linha1 = cards.filter((c) => c.offsetTop === topo);
      const gx = g.getBoundingClientRect().left, meio = caixa.getBoundingClientRect().left + caixa.clientWidth / 2 - gx;
      const centros = linha1.map((c) => c.getBoundingClientRect().left - gx + c.offsetWidth / 2);
      g.style.setProperty("--arv-de", Math.min(meio, ...centros) + "px"); g.style.setProperty("--arv-ate", Math.max(meio, ...centros) + "px");
      cards.forEach((c) => c.classList.toggle("arv-fora", c.offsetTop !== topo));
    });
  }
  function ajustarListaLateral() {
    const painel = document.getElementById("aaLista"); const grade = app.querySelector<HTMLElement>(".aa-grade");
    if (!painel || !grade || innerWidth <= 900) return;
    grade.classList.add("estreita");
    grade.style.maxWidth = Math.max(320, painel.getBoundingClientRect().left - 14 - grade.getBoundingClientRect().left) + "px";
  }

  const selo = `<span class="marca-bloco"><span class="selo">AION <em>Mentoria</em></span><span class="rotulo">Painel administrativo</span></span>`;
  const marca = (resto = "") => `<div class="marca">${selo}<span style="flex:1"></span>${resto}</div>`;

  function carregandoTela() {
    return `${marca(botaoTema())}<div class="conteudo"><div class="vazio">Carregando…</div></div>`;
  }

  // "Salvar login": só o login fica no navegador. O código, o navegador
  // oferece guardar no gerenciador de senhas dele — nunca em texto aqui.
  const lerLocal = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const gravarLocal = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* sem armazenamento */ } };
  const loginSalvo = () => lerLocal("aion-painel-login");

  function login() {
    return `
    ${marca(botaoTema())}
    <div class="conteudo" style="max-width:460px;margin:48px auto 0">
      <form data-f="entrar" class="cartao" style="padding:22px">
        <h1 style="margin:0 0 4px;font-size:24px;font-weight:700">Entrar no painel</h1>
        <p style="margin:0 0 20px;font-size:14px;color:var(--texto-2)">Use seu login e o seu código.</p>
        <label class="grupo" style="margin-bottom:14px"><span class="rotulo">Login</span><input id="loginCampo" class="campo" name="login" autocomplete="username" value="${h(loginSalvo())}" required /></label>
        <label class="grupo"><span class="rotulo">Código</span><input id="codigoCampo" class="campo" name="codigo" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" required /></label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;cursor:pointer"><input type="checkbox" name="salvar" ${loginSalvo() || !lerLocal("aion-painel-login-off") ? "checked" : ""} style="width:18px;height:18px" />Salvar login</label>
        ${ui.erroLogin ? `<p class="erro">${h(ui.erroLogin)}</p>` : ""}
        <button class="botao" style="width:100%;margin-top:20px" ${ocupado ? "disabled" : ""}>Entrar</button>
      </form>
    </div>`;
  }

  function painel() {
    const [t, cont] = titulo();
    const restrita = (id: string) => (id === "equipe" || id === "registro") && !podeEquipe();
    const abas = [...ABAS, ...ABAS_EXTRA].filter(([id]) => !restrita(id));
    const telas: Record<string, () => string> = { inicio: telaInicio, alunas: telaAlunas, ficha: telaFicha, engajamento: telaEngajamento, layout: telaCategorias, catAba: telaCategoriaAba, config: telaConfig, cursos: telaCursos, curso: telaCurso, aula: telaAula, comentarios: telaComentarios, equipe: telaEquipe, registro: telaRegistro };
    if (restrita(ui.tab)) ui.tab = "inicio";
    const papel: Record<string, string> = { dono: "Dono", admin: "Administrador", suporte: "Suporte" };
    return `
    <div class="casca">
      <aside class="lado" aria-label="Menu do painel">
        <div class="lado-marca"><span class="lado-selo">AION</span><span class="lado-sub">Mentoria</span><span class="lado-rot">Painel administrativo</span></div>
        <nav class="lado-menu">
          ${abas.map(([id, nome]) => { const on = ui.tab === id || (id === "cursos" && (ui.tab === "curso" || ui.tab === "aula")) || (id === "alunas" && ui.tab === "ficha") || (id === "layout" && ui.tab === "catAba"); const nb = id === "comentarios" ? paraResponder().length : id === "inicio" ? tarefasInicio() : 0; return `<button class="lado-item" data-a="aba" data-v="${id}" ${on ? 'aria-current="page"' : ""}>${ICONE_MENU[id] || ""}<span>${nome}</span>${badge(nb)}</button>`; }).join("")}
        </nav>
        <div class="lado-pe">
          <div class="lado-quem"><span class="lado-av">${h(iniciais(eu!.nome))}</span><span><b>${h(eu!.nome)}</b><span>${h(papel[eu!.papel] || eu!.papel)}</span></span></div>
          <button class="lado-sair" data-a="sair">${ICONE_MENU.sair}Sair</button>
        </div>
      </aside>
      <div class="principal">
        <div class="topo">
          <div class="busca-geral">
            <input id="buscaGeral" class="campo" type="search" placeholder="Buscar aluna, celular, aula ou comentário" value="${h(ui.buscaGeral)}" data-i="buscaGeral" autocomplete="off" aria-label="Busca geral" />
            <div id="buscaResultados">${resultadosBusca()}</div>
          </div>
          <button class="al-botao topo-sug" data-a="sugestoes">${ICONE_MENU.ideia}Sugestões${S.sugestoes.length ? ` <span class="bolinha">${S.sugestoes.length}</span>` : ""}</button>
          ${botaoTema()}
          <span class="topo-av" title="${h(eu!.nome)}">${h(iniciais(eu!.nome))}</span>
        </div>
        <div class="conteudo">
          ${ui.tab === "curso" || ui.tab === "aula" ? "" : `<div class="cabecalho"><div class="cab-tit"><div class="cab-linha"><h1>${h(t)}</h1>${ajudaAba()}</div>${ui.tab === "layout" ? "" : `<p class="contagem">${h(SUB_ABA[ui.tab] || cont)}</p>`}</div><span style="flex:1"></span>${pilha.length ? `<button class="botao-neutro" data-a="desfazer-abrir" title="Voltar as últimas alterações">↶ Desfazer (${pilha.length})</button>` : ""}${ui.tab === "inicio" || ui.tab === "engajamento" ? seletorPeriodo() : ACAO_ABA[ui.tab] || ""}</div>`}
          ${(telas[ui.tab] || telaInicio)()}
        </div>
      </div>
    </div>
    ${modal()}`;
  }

  const etiqueta = (txt: string, cor: string) => `<span class="etiqueta" style="color:${cor}">${h(txt)}</span>`;
  const VERDE = "#9dc08b", VERMELHO = "var(--perigo)", OURO = "var(--ouro)";
  const botoesEdicao = (rotulo: string) => `<button class="botao-neutro">${rotulo}</button><button type="button" class="botao-neutro" data-a="cancelar-edicao">Cancelar</button>`;
  const editando = (tipo: string, id: string) => !!ui.editando && ui.editando.tipo === tipo && ui.editando.id === id;

  /* ---------- datas e nomes (rodada 2) ---------- */
  const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 864e5);
  const dataHora = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("pt-BR", { timeZone: FUSO }) + " · " + d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  };
  const iniciais = (n: string) => String(n || "?").trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁ-Ú]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const haQuanto = (s: string) => { if (!s) return "nunca"; const n = diasEntre(s, hoje()); return n <= 0 ? "hoje" : n === 1 ? "ontem" : "há " + n + " dias"; };
  const fone = (t: string) => formatarCelular(t || "");
  const primeiroNome = (n: string) => n.split(" ")[0];
  /** O último segundo do dia, no horário de Brasília — é assim que a validade é guardada. */
  const fimDoDia = (dia: string) => new Date(dia + "T23:59:59-03:00").toISOString();

  /* ---------- situação da aluna ---------- */
  type Sit = "ativa" | "vencendo" | "vencida" | "bloqueada";
  function situacao(a: Aluna): Sit {
    if (a.bloqueada) return "bloqueada";
    if (vencida(a)) return "vencida";
    if (a.validade && diasEntre(hoje(), a.validade) <= 15) return "vencendo";
    return "ativa";
  }
  /*
   * Quem nunca entrou não "parou": ainda não começou. Misturar as duas
   * coisas punha a aluna cadastrada há uma hora em "sem acesso há mais
   * de 14 dias". A data de cadastro é a entrada.
   */
  const parada = (a: Aluna) => !a.bloqueada && !vencida(a) && !!a.ultimoAcesso && diasEntre(a.ultimoAcesso, hoje()) > 14;
  const cadastrada = (a: Aluna) => "cadastrada " + (a.entrada ? haQuanto(a.entrada) + " (" + br(a.entrada) + ")" : "sem data");
  const sitInfo = (s: Sit): [string, string] => ({ ativa: ["Ativa", "var(--verde)"], vencendo: ["Vence em breve", "var(--ouro-txt)"], vencida: ["Vencida", VERMELHO], bloqueada: ["Bloqueada", VERMELHO] } as Record<Sit, [string, string]>)[s];
  const avatar = (a: Aluna, grande = false) => `<span class="avatar${grande ? " grande" : ""}" style="--cor:${sitInfo(situacao(a))[1]}" aria-hidden="true">${h(iniciais(a.nome))}</span>`;
  const numero = (n: number, rotulo: string, atencao = false) => `<div class="numero${atencao && n ? " atencao" : ""}"><b>${n}</b><span>${h(rotulo)}</span></div>`;
  const numeroTxt = (txt: string, rotulo: string, sub = "") => `<div class="numero"><b class="txt">${h(txt)}</b><span>${h(rotulo)}</span>${sub ? `<em>${h(sub)}</em>` : ""}</div>`;
  const semNada = (t: string) => `<p class="nada">${t}</p>`;
  const nova = (a: Aluna) => !!a.entrada && diasEntre(a.entrada, hoje()) >= 0 && diasEntre(a.entrada, hoje()) <= 7;
  const comentariosDe = (a: Aluna) => S.comentarios.filter((k) => k.autoraId === a.id);

  /* ---------- INÍCIO ---------- */
  /*
   * Início, no desenho da referência: o período no alto e três quadros —
   * últimos comentários, últimas atividades das alunas e alunas
   * adicionadas recentemente. Tudo dentro do período escolhido.
   */
  type Atividade = { tipo: "assistiu" | "comentou" | "acessou"; aluna: string; nome: string; aula: string; quando: string };
  let ativ: { chave: string; lista: Atividade[] } | null = null; let ativCarregando = "";
  const periodoIni = () => {
    const ate = ui.iniAte || hoje();
    const de = ui.iniDe || ate.slice(0, 8) + "01";
    return { de, ate, chave: de + "|" + ate };
  };
  function carregarAtividades() {
    const { de, ate, chave } = periodoIni();
    if ((ativ && ativ.chave === chave) || ativCarregando === chave) return;
    ativCarregando = chave;
    void (async () => {
      const r = await supabase.rpc("atividades_recentes", { p_de: de + "T00:00:00-03:00", p_ate: ate + "T23:59:59-03:00", p_limite: 200 });
      ativCarregando = "";
      ativ = { chave, lista: ((r.data ?? []) as Record<string, string>[]).map((x) => ({ tipo: x.tipo as Atividade["tipo"], aluna: x.aluna_id, nome: x.aluna_nome, aula: x.aula_titulo ?? "", quando: x.quando })) };
      if (ui.tab === "inicio") render();
    })();
  }
  const haTempo = (iso: string) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) { const m = Math.max(1, Math.round(s / 60)); return "há " + m + (m === 1 ? " minuto" : " minutos"); }
    if (s < 86400) { const hh = Math.round(s / 3600); return "há " + hh + (hh === 1 ? " hora" : " horas"); }
    const d = Math.round(s / 86400); return "há " + d + (d === 1 ? " dia" : " dias");
  };
  const IC_INI = {
    balao: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z"/></svg>`,
    onda: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12h3l2-5 3 11 3-14 2.5 11 1.5-3h4"/></svg>`,
    pessoas: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.3c2.4.2 4 1.7 4.5 4.4"/></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M10.3 8.8v6.4l5-3.2z"/></svg>`,
    pessoa: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c.7-3.6 3.5-5.6 7-5.6s6.3 2 7 5.6"/></svg>`,
    cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/></svg>`,
    seta: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  };
  const avatarDe = (id: string, nome: string) => {
    const al = S.alunas.find((x) => x.id === id);
    return al ? aaAvatar(al) : `<span class="avatar" style="--cor:#b07a2a" aria-hidden="true">${h(iniciais(nome))}</span>`;
  };
  const linhaAtividade = (x: Atividade) => {
    const [cls, ic, txt] = x.tipo === "assistiu" ? ["verde", IC_INI.play, `assistiu a aula <b>"${h(x.aula)}"</b>`]
      : x.tipo === "comentou" ? ["roxo", IC_INI.balao, `comentou na aula <b>"${h(x.aula)}"</b>`]
      : ["azul", IC_INI.pessoa, "acessou a plataforma"];
    return `<div class="ini-item"><span class="ini-ic ${cls}">${ic}</span><span class="ini-txt"><span><b>${h(x.nome)}</b> ${txt}</span></span><span class="ini-quando">${haTempo(x.quando)}</span></div>`;
  };
  /** Tarefas da equipe: comentários sem resposta da equipe (e não ocultos). Diminui conforme responde. */
  const paraResponder = () => S.comentarios.filter((k) => k.estado !== "oculto" && !k.resposta);
  const badge = (n: number) => (n ? `<span class="badge-alerta" aria-label="${n} para fazer">${n > 99 ? "99+" : n}</span>` : "");
  function tarefasInicio() { return paraResponder().length + listasAcessos().reduce((t, l) => t + l.lista.length, 0); }
  function telaInicio() {
    const { de, ate, chave } = periodoIni();
    carregarAtividades();
    const noPeriodo = (iso: string) => { if (!iso) return false; const d = diaDe(iso); return d >= de && d <= ate; };
    const coms = S.comentarios.filter((k) => noPeriodo(k.criado)).sort((x, y) => y.criado.localeCompare(x.criado));
    const novas = S.alunas.filter((a) => noPeriodo(a.criadaEm)).sort((x, y) => y.criadaEm.localeCompare(x.criadaEm));
    const atv = ativ && ativ.chave === chave ? ativ.lista : null;
    const cartao = (ic: string, titulo: string, acao: string, corpo: string) => `
      <section class="ini-cartao">
        <header><span class="ini-cab-ic">${ic}</span><h3>${titulo}</h3><button class="al-botao pequeno" data-a="${acao}">Ver todos ${IC_INI.seta}</button></header>
        <div class="ini-lista">${corpo}</div>
      </section>`;
    const vazio = (t: string) => `<p class="ini-vazio">${t}</p>`;
    const ls = listasAcessos(), nResp = paraResponder().length;
    const tarefa = (ic: string, titulo: string, n: number, acao: string, v = "") => `<button type="button" class="ini-tarefa${n ? " tem" : ""}" data-a="${acao}"${v ? ` data-v="${v}"` : ""}><span class="ini-cab-ic">${ic}</span><span class="ini-tarefa-txt">${titulo}</span>${n ? badge(n) : `<span class="ini-tarefa-ok">em dia</span>`}</button>`;
    return `
    <section class="tela ativa ini">
      <div class="ini-tarefas" aria-label="Para fazer agora">
        <h3>Para fazer agora</h3>
        <div class="ini-tarefas-lista">
          ${tarefa(IC_INI.balao, "Comentários para responder", nResp, "ir-comentarios")}
          ${tarefa(IC_INI.cal, "Acessos que vencem em 15 dias", ls[0].lista.length, "ini-lista", "vencem")}
          ${tarefa(IC_INI.pessoas, "Sem acesso há mais de 14 dias", ls[1].lista.length, "ini-lista", "parada")}
          ${tarefa(IC_INI.pessoa, "Ainda sem o primeiro acesso", ls[2].lista.length, "ini-lista", "comecar")}
        </div>
      </div>
      <div class="ini-grade">
        ${cartao(IC_INI.balao, "Últimos comentários" + (nResp ? " " + badge(nResp) : ""), "ir-comentarios", coms.slice(0, 3).map((k) => `
          <div class="ini-item${k.estado !== "oculto" && !k.resposta ? " a-responder" : ""}">${avatarDe(k.autoraId, k.autora)}<span class="ini-txt"><b>${h(k.autora)}</b><span>${h(k.texto)}</span></span><span class="ini-quando">${haTempo(k.criado)}</span><button class="al-botao pequeno ini-moderar" data-a="ini-moderar" data-id="${k.id}" aria-label="Moderar o comentário de ${h(k.autora)}">${k.estado === "moderar" ? "Moderar" : k.estado !== "oculto" && !k.resposta ? "Responder" : "Ver"}</button></div>`).join("") || vazio("Nenhum comentário no período."))}
        ${cartao(IC_INI.onda, "Últimas atividades", "ini-ativ-todas", atv ? (atv.slice(0, 3).map(linhaAtividade).join("") || vazio("Nenhuma atividade no período.")) : vazio("Carregando…"))}
        ${cartao(IC_INI.pessoas, "Alunas adicionadas recentemente", "ir-alunas-recentes", novas.slice(0, 3).map((a) => `
          <button class="ini-item ini-aluna" data-a="ini-abrir-aluna" data-id="${a.id}">${aaAvatar(a)}<span class="ini-txt"><b>${h(a.nome)}</b></span><span class="ini-quando">${br(diaDe(a.criadaEm))}</span></button>`).join("") || vazio("Nenhuma aluna cadastrada no período."))}
      </div>
      ${blocoAcessos()}
      ${blocoConteudo()}
      ${ui.ativTodas ? `
        <div class="aa-fundo" data-a="ini-ativ-fechar"></div>
        <aside class="aa-painel" role="dialog" aria-modal="true" aria-label="Últimas atividades">
          <header class="aa-cab"><div><h2>Últimas atividades</h2><p>${br(de)} a ${br(ate)} · ${p((atv || []).length, "atividade", "atividades")}</p></div><button type="button" class="aa-fechar" data-a="ini-ativ-fechar" aria-label="Fechar">${xis}</button></header>
          <div class="aa-corpo" data-rolagem="ativ">${(atv || []).map(linhaAtividade).join("") || vazio("Nenhuma atividade no período.")}</div>
        </aside>` : ""}
      ${ui.acessoAluna ? cadastroAluna(false) : ""}
    </section>`;
  }
  /*
   * "Alunas e acessos" (segunda parte do Início): três listas lado a
   * lado — acessos que vencem em 15 dias, sem acesso há mais de 14 dias
   * e quem ainda não fez o primeiro acesso — com as três primeiras de
   * cada uma; o cabeçalho de cada coluna abre a lista inteira.
   */
  type ListaIni = { id: string; titulo: string; sub: string; icone: string; lista: Aluna[]; direita: (a: Aluna) => string };
  const cursoPrincipal = (a: Aluna) => {
    const libs = new Set(aulasDaLiberacao(a));
    const c = S.cursos.find((k) => k.modulos.some((m) => m.aulas.some((x) => libs.has(x.id))));
    return c ? c.nome : "Sem conteúdo liberado";
  };
  function listasAcessos(): ListaIni[] {
    const nunca = (a: Aluna) => !a.bloqueada && !vencida(a) && !a.ultimoAcesso;
    return [
      { id: "vencem", titulo: "Acessos que vencem em 15 dias", sub: "Alunas com acesso próximo do vencimento.", icone: IC_INI.cal,
        lista: S.alunas.filter((a) => situacao(a) === "vencendo").sort((x, y) => x.validade.localeCompare(y.validade)), direita: (a) => br(a.validade) },
      { id: "parada", titulo: "Sem acesso há mais de 14 dias", sub: "Alunas que não acessam há mais de 14 dias.", icone: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.2" height="14" rx="1" class="cheio"/><rect x="13.8" y="5" width="3.2" height="14" rx="1" class="cheio"/></svg>`,
        lista: S.alunas.filter(parada).sort((x, y) => x.ultimoAcesso.localeCompare(y.ultimoAcesso)), direita: (a) => "há " + diasEntre(a.ultimoAcesso, hoje()) + " dias" },
      { id: "comecar", titulo: "Ainda não fizeram o primeiro acesso", sub: "Alunas cadastradas recentemente.", icone: IC_INI.pessoa,
        lista: S.alunas.filter(nunca).sort((x, y) => (y.criadaEm || "").localeCompare(x.criadaEm || "")), direita: (a) => br(cadastroDe(a)) },
    ];
  }
  const linhaIni = (l: ListaIni, a: Aluna) => `
        <div class="ac-item">
          <button class="ac-quem" data-a="ini-abrir-aluna" data-id="${a.id}">${aaAvatar(a)}<span class="ini-txt"><b>${h(a.nome)}</b><span>${h(cursoPrincipal(a))}</span></span></button>
          <span class="ini-quando">${l.direita(a)}</span>
          <span class="menu-acoes"><button class="ini-mais" data-a="menu" data-id="${a.id}" aria-label="Mais ações para ${h(a.nome)}" aria-haspopup="menu" aria-expanded="${ui.menu === a.id}">⋮</button>${ui.menu === a.id ? menuAluna(a) : ""}</span>
        </div>`;
  function blocoAcessos() {
    const ls = listasAcessos();
    const aberta = ls.find((l) => l.id === ui.iniLista);
    return `
      <section class="ac-bloco">
        <header class="ac-cab"><span class="ini-cab-ic">${IC_INI.pessoas}</span><span class="ac-cab-txt"><h3>Alunas e acessos</h3><span>Acompanhe o acesso das alunas na sua mentoria.</span></span><button class="al-botao pequeno" data-a="aba" data-v="alunas">Ver todos ${IC_INI.seta}</button></header>
        <div class="ac-colunas">${ls.map((l) => `
          <div class="ac-coluna">
            <button class="ac-topo" data-a="ini-lista" data-v="${l.id}" aria-label="Ver a lista inteira: ${h(l.titulo)}">
              <span class="ac-ic">${l.icone}</span>
              <span class="ac-topo-txt"><b>${l.titulo}</b><span>${l.sub}</span></span>
              <span class="aa-conta${l.lista.length ? " tem" : ""}">${l.lista.length}</span>${seta}
            </button>
            ${l.lista.slice(0, 3).map((a) => linhaIni(l, a)).join("") || `<p class="ini-vazio">Nenhuma aluna aqui agora.</p>`}
          </div>`).join("")}
        </div>
      </section>
      ${aberta ? `
        <div class="aa-fundo" data-a="ini-lista-fechar"></div>
        <aside class="aa-painel" role="dialog" aria-modal="true" aria-label="${h(aberta.titulo)}">
          <header class="aa-cab"><div><h2>${aberta.titulo}</h2><p><span class="aa-conta tem">${aberta.lista.length}</span> ${aberta.sub}</p></div><button type="button" class="aa-fechar" data-a="ini-lista-fechar" aria-label="Fechar">${xis}</button></header>
          <div class="aa-corpo" data-rolagem="ini-${aberta.id}">${aberta.lista.map((a) => linhaIni(aberta, a)).join("") || `<p class="ini-vazio">Nenhuma aluna aqui agora.</p>`}</div>
        </aside>` : ""}`;
  }
  /*
   * Terceira parte do Início: aulas liberadas (hoje, ontem ou na última
   * semana), o último curso, os últimos módulos e as últimas categorias.
   * "Liberada" é o dia em que a aula abriu para a aluna: a data marcada
   * na aula ou o cronograma do módulo (dias depois da entrada dela).
   */
  type Liberacao = { aula: Aula; m: Modulo; c: Curso; dia: string; alunas: number };
  function aulasLiberadas(de: string, ate: string): Liberacao[] {
    const conta = new Map<string, { dia: string; n: number }>();
    for (const al of S.alunas) {
      if (al.bloqueada || vencida(al)) continue;
      const libs = new Set(aulasDaLiberacao(al));
      for (const c of S.cursos) for (const m of c.modulos) for (const a of m.aulas) {
        if (!libs.has(a.id)) continue;
        let dia = al.datas[a.id] || "";
        if (!dia && al.cronograma[m.id] != null && al.entrada) dia = diaDe(new Date(Date.parse(al.entrada + "T12:00:00") + al.cronograma[m.id] * 864e5));
        if (!dia || dia < de || dia > ate) continue;
        const k = a.id + "|" + dia; const x = conta.get(k); if (x) x.n++; else conta.set(k, { dia, n: 1 });
      }
    }
    const out: Liberacao[] = [];
    for (const [k, v] of conta) {
      const x = acharAula(k.split("|")[0]); if (!x) continue;
      out.push({ aula: x.a, m: x.m, c: x.c, dia: v.dia, alunas: v.n });
    }
    return out.sort((x, y) => y.dia.localeCompare(x.dia) || x.c.modulos.indexOf(x.m) - y.c.modulos.indexOf(y.m) || x.m.aulas.indexOf(x.aula) - y.m.aulas.indexOf(y.aula));
  }
  const quandoDia = (dia: string) => { const n = diasEntre(dia, hoje()); return n === 0 ? "hoje" : n === 1 ? "ontem" : n > 0 ? "há " + n + " dias" : br(dia); };
  function blocoConteudo() {
    const hj = hoje(); const menos = (n: number) => diaDe(new Date(Date.now() - n * 864e5));
    const f = ui.iniLib || "hoje";
    const [de, ate] = f === "hoje" ? [hj, hj] : f === "ontem" ? [menos(1), menos(1)] : [menos(6), hj];
    const libs = aulasLiberadas(de, ate);
    const nomeAula = (x: Liberacao) => `Módulo ${numModulo(x.c, x.c.modulos.indexOf(x.m))} - Aula ${x.aula.num}`;
    const capaAula = (a: Aula) => (a.capa ? urlDaCapa(a.capa) : "");
    const ultimoCurso = S.cursos.slice().sort((x, y) => y.criado.localeCompare(x.criado))[0];
    const mods = S.cursos.flatMap((c) => c.modulos.map((m, i) => ({ c, m, i }))).sort((x, y) => y.m.criado.localeCompare(x.m.criado)).slice(0, 4);
    const cats = S.cats.slice().sort((x, y) => y.criado.localeCompare(x.criado)).slice(0, 4);
    const capaCurso = (c: Curso) => { if (c.capa) return urlDaCapa(c.capa); const k = cat(c.cat); return k ? capaCat(k) : ""; };
    const img = (src: string) => (src ? `<img src="${h(src)}" alt="" loading="lazy" onerror="this.remove()" />` : "");
    const cab = (ic: string, titulo: string, sub: string, extra = "") => `<header class="ct-cab"><span class="ini-cab-ic">${ic}</span><span class="ct-cab-txt"><h3>${titulo}</h3><span>${sub}</span></span>${extra}</header>`;
    return `
      <div class="ct-grade">
        <section class="ini-cartao ct">
          ${cab(IC_INI.play, "Aulas liberadas", "As aulas que abriram para as alunas.")}
          <div class="ct-filtros">${[["hoje", "Hoje"], ["ontem", "Ontem"], ["semana", "Última semana"]].map(([v, n]) => `<button class="al-filtro" data-a="ini-lib" data-v="${v}" aria-pressed="${f === v}">${n}</button>`).join("")}</div>
          <div class="ini-lista">${libs.slice(0, ui.iniLibTodas ? 999 : 4).map((x) => `
            <button class="ct-item" data-a="abrir-aula" data-id="${x.aula.id}"><span class="ct-mini">${img(capaAula(x.aula))}</span><span class="ini-txt"><b>${nomeAula(x)}</b><span>${p(x.alunas, "aluna", "alunas")} · ${quandoDia(x.dia)}</span></span>${seta}</button>`).join("") || `<p class="ini-vazio">Nenhuma aula liberada ${f === "hoje" ? "hoje" : f === "ontem" ? "ontem" : "na última semana"}.</p>`}
          ${libs.length > 4 ? `<button class="al-botao pequeno ct-mais" data-a="ini-lib-todas">${ui.iniLibTodas ? "Ver menos" : "Ver todas (" + libs.length + ")"}</button>` : ""}</div>
        </section>
        <section class="ini-cartao ct">
          ${cab(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5M21.5 9.5v5"/></svg>`, "Último curso adicionado", "Curso mais recente na plataforma.", ultimoCurso ? `<button class="al-botao pequeno" data-a="aba" data-v="cursos">Ver todos ${IC_INI.seta}</button>` : "")}
          ${ultimoCurso ? `<button class="ct-curso" data-a="abrir-curso" data-id="${ultimoCurso.id}"><span class="ct-curso-img">${img(capaCurso(ultimoCurso))}</span><span class="ct-curso-txt"><b>${h(ultimoCurso.nome)}</b><span>${p(totalAulas(ultimoCurso), "aula", "aulas")} · ${p(ultimoCurso.modulos.length, "módulo", "módulos")}</span></span>${seta}</button>` : `<p class="ini-vazio">Nenhum curso ainda.</p>`}
        </section>
        <section class="ini-cartao ct">
          ${cab(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12L12 16.5 20.5 12M3.5 16L12 20.5 20.5 16"/></svg>`, "Últimos módulos adicionados", "Módulos mais recentes na plataforma.", `<button class="al-botao pequeno" data-a="aba" data-v="cursos">Ver todos ${IC_INI.seta}</button>`)}
          <div class="ini-lista">${mods.map(({ c, m, i }) => `
            <button class="ct-item" data-a="abrir-curso" data-id="${c.id}"><span class="ct-num">${numModulo(c, i)}</span><span class="ini-txt"><b>Módulo ${numModulo(c, i)} - ${h(m.nome.charAt(0) + m.nome.slice(1).toLowerCase())}</b><span>${m.criado ? haTempo(m.criado) : ""}</span></span>${seta}</button>`).join("") || `<p class="ini-vazio">Nenhum módulo ainda.</p>`}</div>
        </section>
        <section class="ini-cartao ct">
          ${cab(ICONE_MENU.layout, "Últimas categorias adicionadas", "Categorias mais recentes na plataforma.")}
          <div class="ini-lista">${cats.map((k) => `
            <button class="ct-item" data-a="ini-abrir-cat" data-id="${k.id}"><span class="ct-mini">${img(capaCat(k))}</span><span class="ini-txt"><b>${h(k.nome)}</b><span>${k.criado ? haTempo(k.criado) : ""}</span></span>${seta}</button>`).join("") || `<p class="ini-vazio">Nenhuma categoria ainda.</p>`}</div>
        </section>
      </div>`;
  }
  /** O seletor de período, no alto do Início. */
  function seletorPeriodo() {
    const { de, ate } = periodoIni();
    return `<span class="ini-periodo">
      <button class="al-botao" data-a="ini-periodo" aria-expanded="${ui.periodoAberto}">${IC_INI.cal}${br(de)} - ${br(ate)}<span aria-hidden="true">⌄</span></button>
      ${ui.periodoAberto ? `<span class="ini-periodo-pop" role="dialog" aria-label="Escolher período">
        <span class="ini-rapidos">${[["hoje", "Hoje"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["mes", "Este mês"]].map(([v, n]) => `<button class="al-filtro" data-a="ini-periodo-rapido" data-v="${v}">${n}</button>`).join("")}</span>
        <label>De <input id="iniDe" type="date" class="campo" value="${de}" /></label>
        <label>Até <input id="iniAte" type="date" class="campo" value="${ate}" /></label>
        <button class="al-botao-ouro" data-a="ini-periodo-aplicar">Aplicar</button>
      </span>` : ""}
    </span>`;
  }


  /* ---------- ALUNAS E ACESSOS ----------
   *
   * Indicadores → lista lateral → cadastro da aluna. Os quatro quadros
   * nunca mudam de tamanho: a lista abre num painel à direita, por cima
   * da página, e o cadastro abre por cima da lista. Fechar o cadastro
   * volta à lista; fechar a lista volta aos quadros. As listas e o
   * cálculo de cada uma são os mesmos de antes — só a apresentação muda.
   */

  /** Avatar da seção: uma cor suave por pessoa, como na referência (a cor não quer dizer nada). */
  const AA_CORES = ["#4f8a43", "#b4465f", "#3f6fa8", "#5c8a5a", "#b07a2a", "#7a52a8", "#2f8a8a"];
  const aaAvatar = (a: Aluna, grande = false) => {
    let n = 0; for (const c of a.id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    const foto = S.fotos[a.id];
    return `<span class="avatar${grande ? " grande" : ""}${foto ? " com-foto" : ""}" style="--cor:${AA_CORES[n % AA_CORES.length]}" aria-hidden="true">${foto ? `<img src="${foto}" alt="" />` : h(iniciais(a.nome))}</span>`;
  };
  const pilula = (txt: string, tipo: "ouro" | "verde" | "vermelho" | "neutro") => `<span class="aa-pilula ${tipo}"><i></i>${h(txt)}</span>`;
  /*
   * Três estados de curso, módulo e aula (0069): Ativo (publicado, sem
   * bloqueio), Bloqueado (publicado e bloqueado_geral: aparece, sem acesso)
   * e Desativado (não publicado: some da área da aluna).
   */
  type Estado3 = "ativo" | "bloqueado" | "desativado";
  const estado3 = (pub: boolean, bloq: boolean): Estado3 => (!pub ? "desativado" : bloq ? "bloqueado" : "ativo");
  const EST3: Record<Estado3, [string, string, string]> = {
    ativo: ["Ativo", "verde", "Visível e liberado para as alunas"],
    bloqueado: ["Bloqueado", "amarelo", "Visível, mas não acessível para as alunas"],
    desativado: ["Oculto", "vermelho", "Não aparece na área da aluna"],
  };
  const IC_CAD = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`;
  const IC_OLHO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
  const IC_OLHO_X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3.2 3.8M6.6 7.6C4 9.4 2.5 12 2.5 12S6 18 12 18c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
  /** Em todo item com os três estados: Oculto enfraquece e ganha o olho fechado; Bloqueado ganha o cadeado. */
  const cls3 = (e: Estado3) => (e === "desativado" ? " e3-oculto" : e === "bloqueado" ? " e3-bloq" : "");
  const selo3 = (e: Estado3, fem = false) => (e === "desativado" ? `<span class="ax-selo" title="Não aparece na área da aluna">${IC_OLHO_X}<b>${fem ? "Oculta" : "Oculto"}</b></span>` : e === "bloqueado" ? `<span class="ax-selo" title="A aluna vê, mas não acessa">${IC_CAD}<b>${fem ? "Bloqueada" : "Bloqueado"}</b></span>` : "");
  /*
   * Liberação da aula: "Liberada para todas · data" (clica para tirar);
   * "Libera em N dias · data" quando há data marcada (da aula ou das
   * alunas); "Liberada · data" quando já abriu para as alunas; senão, o
   * botão "Liberar para todas".
   */
  const IC_ENGR_M = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>`;
  const IC_EXP_M = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>`;
  /** Liberação do módulo: a data dele, ou o que as aulas já têm (a mais próxima a abrir, ou a última aberta). */
  function situacaoModulo(m: Modulo) {
    const dia = (iso: string) => br(diaDe(iso)), futuro = (x: string) => !!x && new Date(x).getTime() > Date.now();
    const emDias = (iso: string) => { const n = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)); return n === 1 ? "amanhã" : "em " + n + " dias"; };
    if (futuro(m.libera)) return `<span class="lib-info lib-breve">${IC_CUR.cal}Libera ${emDias(m.libera)} · ${dia(m.libera)}</span>`;
    const proxs: string[] = [], ults: string[] = [];
    for (const a of m.aulas) {
      const l = libPorAula.get(a.id);
      if (a.acesso === "liberada") ults.push(a.liberadaEm || "");
      if (l?.prox) proxs.push(l.prox); if (futuro(a.libera)) proxs.push(a.libera);
      if (l?.ult) ults.push(l.ult); if (a.libera && !futuro(a.libera)) ults.push(a.libera);
    }
    const ult = ults.filter(Boolean).sort().pop(), prox = proxs.sort()[0];
    if (ult) return `<span class="lib-info lib-ok">${IC_OK_LIB}Liberado · ${dia(ult)}</span>${prox ? `<span class="lib-info lib-breve">${IC_CUR.cal}Próxima aula ${emDias(prox)} · ${dia(prox)}</span>` : ""}`;
    if (prox) return `<span class="lib-info lib-breve">${IC_CUR.cal}Libera ${emDias(prox)} · ${dia(prox)}</span>`;
    if (m.libera) return `<span class="lib-info lib-ok">${IC_OK_LIB}Liberado · ${dia(m.libera)}</span>`;
    return `<span class="lib-info">Nenhuma aula liberada ainda</span>`;
  }
  function botaoLiberacao(a: Aula) {
    const dia = (iso: string) => br(diaDe(iso));
    const emDias = (iso: string) => { const n = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)); return n === 1 ? "amanhã" : "em " + n + " dias"; };
    if (a.acesso === "liberada") return `<button type="button" class="al-botao lib-ok" data-a="aula-liberar" data-id="${a.id}" title="Clique para tirar a liberação para todas">${IC_OK_LIB}Liberada para todas${a.liberadaEm ? " · " + dia(a.liberadaEm) : ""}</button>`;
    const l = libPorAula.get(a.id), futuro = (x: string) => !!x && new Date(x).getTime() > Date.now();
    const prox = [futuro(a.libera) ? a.libera : "", l?.prox || ""].filter(Boolean).sort()[0];
    if (prox) return `<span class="lib-info lib-breve">${IC_CUR.cal}Libera ${emDias(prox)} · ${dia(prox)}</span>`;
    const ult = [a.libera && !futuro(a.libera) ? a.libera : "", l?.ult || ""].filter(Boolean).sort().pop();
    if (ult) return `<span class="lib-info lib-ok">${IC_OK_LIB}Liberada · ${dia(ult)}</span>`;
    return `<button type="button" class="al-botao" data-a="aula-liberar" data-id="${a.id}">Liberar para todas</button>`;
  }
  const IC_OK_LIB = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>`;
  /** Pílula clicável: abre as três opções; `sub` mostra a explicação embaixo. */
  function seletorEstado(tipo: "curso" | "mod" | "aula" | "cat" | "catx", id: string, e: Estado3, sub = false, fem = false) {
    const chave = tipo + ":" + id, [nome, cor, txt] = EST3[e];
    const rot = (x: Estado3) => (fem && x !== "desativado" ? EST3[x][0].replace(/o$/, "a") : fem ? "Oculta" : EST3[x][0]);
    return `<span class="est3${sub ? " com-sub" : ""}">
      <button type="button" class="est3-pil ${cor}" data-a="estado-menu" data-v="${chave}" aria-haspopup="menu" aria-expanded="${ui.estMenu === chave}" title="Mudar o estado">${e === "bloqueado" ? IC_CAD : e === "desativado" ? IC_OLHO_X : IC_OLHO}${h(fem ? rot(e) : nome)}</button>
      ${sub ? `<em>${txt}</em>` : ""}
      ${ui.estMenu === chave ? `<span class="est3-menu" role="menu">${(["ativo", "bloqueado", "desativado"] as Estado3[]).map((x) => `<button type="button" role="menuitemradio" aria-checked="${x === e}" data-a="estado-set" data-v="${chave}:${x}"><span class="est3-pil ${EST3[x][1]}">${x === "bloqueado" ? IC_CAD : x === "desativado" ? IC_OLHO_X : IC_OLHO}${h(fem ? rot(x) : EST3[x][0])}</span><em>${EST3[x][2]}</em></button>`).join("")}</span>` : ""}
    </span>`;
  }
  const seta = `<svg class="aa-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
  const xis = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

  /** Um quadro da seção: o número, o resumo e a lista que ele abre. */
  type Quadro = { titulo: string; resumo: string; sub: string; vazio: string; lista: Aluna[]; icone: string; meta: (a: Aluna) => string; acao: (a: Aluna) => string; acoesAbaixo?: boolean; ajuda?: [string, string, string] };

  /*
   * Quadros → lista lateral → cadastro da aluna. É o mesmo padrão em
   * "Alunas e acessos" e em "Engajamento": quem chama só diz quais são os
   * quadros e o que cada lista mostra.
   */
  /*
   * O "?" de cada quadro: o que o grupo quer dizer e o que fazer com ele.
   * Fica dentro do cartão, que já é um botão — por isso é um span com
   * data-a, e o balão também fecha ao clicar nele, sem abrir a lista.
   */
  const ajudaQuadro = (id: string, [titulo, texto, oque]: [string, string, string]) => {
    const key = "quadro-" + id;
    return ` <span class="ajuda aa-ajuda"><span role="button" tabindex="0" class="ajuda-btn" data-a="ajuda" data-v="${key}" aria-label="O que é ${h(titulo)}" aria-expanded="${ui.ajuda === key}">?</span>${ui.ajuda === key ? `<span class="ajuda-pop" role="tooltip" data-a="ajuda" data-v="${key}"><b>${h(titulo)}</b><span>${texto}</span>${oque ? `<em>O que fazer: ${oque}</em>` : ""}</span>` : ""}</span>`;
  };
  function quadrosComLista(defs: Record<string, Quadro>, ordem: string[], soLista = false) {
    const aberta = defs[ui.acessoLista] ? ui.acessoLista : "";
    const anima = ui.aaAnima; ui.aaAnima = "";
    const cartao = (id: string) => {
      const d = defs[id]; const n = d.lista.length;
      return `
        <button type="button" class="aa-ind${aberta === id ? " sel" : ""}" data-a="aa-lista" data-v="${id}" aria-expanded="${aberta === id}" aria-controls="aaLista">
          <span class="aa-icone">${d.icone}</span>
          <span class="aa-ind-txt"><b>${d.titulo}${d.ajuda ? ajudaQuadro(id, d.ajuda) : ""}</b><span>${h(d.resumo)}</span></span>
          <span class="aa-conta${n ? " tem" : ""}">${n}</span>
          ${seta}
        </button>`;
    };
    let lista = "";
    if (aberta) {
      const d = defs[aberta]; const l = d.lista;
      lista = `
      <div class="aa-fundo" data-a="aa-fechar-lista"></div>
      <aside id="aaLista" class="aa-painel${anima === "lista" ? " entra" : ""}" role="dialog" aria-modal="true" aria-label="${h(d.titulo)}">
        <header class="aa-cab">
          <div><h2>${d.titulo}</h2><p><span class="aa-conta tem">${l.length}</span> ${h(d.resumo)}</p></div>
          <button type="button" class="aa-fechar" data-a="aa-fechar-lista" aria-label="Fechar a lista">${xis}</button>
        </header>
        <div class="aa-corpo" data-rolagem="lista-${aberta}">
          <p class="aa-sub">${d.sub}</p>
          ${l.map((a) => `
          <div class="aa-item${d.acoesAbaixo ? " abaixo" : ""}">
            <button type="button" class="aa-item-abre" data-a="aa-aluna" data-id="${a.id}" aria-label="Abrir o cadastro de ${h(a.nome)}">${aaAvatar(a)}<span class="nome"><b>${h(a.nome)}</b><span>${d.meta(a)}</span></span></button>
            <span class="acoes">${d.acao(a)}</span>
            <button type="button" class="aa-item-seta" data-a="aa-aluna" data-id="${a.id}" aria-label="Abrir o cadastro de ${h(a.nome)}">${seta}</button>
          </div>`).join("") || semNada(d.vazio)}
        </div>
      </aside>`;
    }
    return `
      ${soLista ? "" : `<div class="aa-grade">${ordem.map(cartao).join("")}</div>`}
      ${lista}
      ${aberta && ui.acessoAluna ? cadastroAluna(anima === "aluna") : ""}`;
  }



  /**
   * O cadastro completo, por cima da lista, como na referência: visão
   * geral, acessos, progresso, pagamentos e observações. Só mostra o que
   * o sistema guarda — "não informado" quando o campo está vazio, e
   * Pagamentos diz que não há registro, porque o sistema não guarda
   * pagamentos.
   */
  function cadastroAluna(entra: boolean) {
    const a = S.alunas.find((x) => x.id === ui.acessoAluna);
    if (!a) { ui.acessoAluna = null; return ""; }
    const sit = situacao(a);
    const status = !a.ultimoAcesso && !a.bloqueada && !vencida(a) ? pilula("Ainda não acessou", "ouro")
      : pilula(sitInfo(sit)[0], sit === "ativa" ? "verde" : sit === "vencendo" ? "ouro" : "vermelho");
    const hist = S.historico.filter((x) => x.aluna === a.id);
    const coms = comentariosDe(a);
    const estCom: Record<Estado, string> = { moderar: "para moderar", publicado: "publicado", oculto: "oculto" };
    const verCod = ui.verCodigo === a.id;
    const libs = new Set(aulasDaLiberacao(a));
    const produtos = S.cursos.map((c) => {
      const n = c.modulos.reduce((s2, m) => s2 + m.aulas.filter((k) => libs.has(k.id)).length, 0);
      return n ? { c, n } : null;
    }).filter(Boolean) as { c: Curso; n: number }[];
    const ABAS_AL: [string, string][] = [["geral", "Visão geral"], ["acessos", "Acessos"], ["progresso", "Progresso"], ["pagamentos", "Pagamentos"], ["observacoes", "Observações"]];
    const aba = ABAS_AL.some(([k]) => k === ui.acessoAba) ? ui.acessoAba : "geral";
    const naoInf = `<span class="aa-vazio">não informado</span>`;
    const linha = (rotulo: string, valor: string) => `<div class="aa-dado"><span>${rotulo}</span><b>${valor}</b></div>`;
    const IC = {
      cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13h2M11 13h2M14 13h2"/></svg>`,
      cadeado: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5"/></svg>`,
      relogio: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
      play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>`,
      lapis: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4L15.8 5.2a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8.5 18.5z"/></svg>`,
    };
    const resumo = (ic: string, rotulo: string, valor: string) => `<div class="aa-resumo"><span class="aa-icone pequeno">${ic}</span><span><span>${rotulo}</span><b>${valor}</b></span></div>`;
    const notas = (comAcoes: boolean) => a.notas.slice().reverse().map((n) => `<div class="mini"><span class="nome"><b class="leve">${h(n.texto)}</b><span>${h(n.quem)} · ${dataHora(n.quando)}</span></span>${comAcoes ? `<span class="acoes"><button class="botao-neutro botao-remover" data-a="nota-remover" data-id="${a.id}" data-v="${n.id}">Remover</button></span>` : ""}</div>`).join("");

    let corpo = "";
    if (aba === "geral") corpo = `
        <div class="aa-duas">
          <div class="aa-cartao">
            <div class="aa-cartao-cab"><h3>Informações da aluna</h3><button type="button" class="aa-editar" data-a="editar-aluna" data-id="${a.id}">${IC.lapis}Editar</button></div>
            ${linha("Nome completo", h(a.nome))}
            ${linha("Login", h(a.login))}
            ${linha("E-mail", a.email ? h(a.email) : naoInf)}
            ${linha("Celular", a.celular ? h(fone(a.celular)) : naoInf)}
            ${linha("Data de cadastro", br(a.criadaEm ? diaDe(a.criadaEm) : a.entrada))}
            ${linha("Status", status)}
          </div>
          <div class="aa-cartao">
            <div class="aa-cartao-cab"><h3>Resumo de acesso</h3></div>
            ${resumo(IC.cal, "Acesso liberado até", a.validade ? br(a.validade) : "sem prazo")}
            ${resumo(IC.cadeado, "Aulas liberadas", p(a.liberadas, "aula", "aulas"))}
            ${resumo(IC.relogio, "Último acesso", a.ultimoAcesso ? br(a.ultimoAcesso) : "Nunca acessou")}
          </div>
        </div>
        <h3 class="aa-secao">Produtos e acessos</h3>
        ${produtos.map((x) => `<div class="aa-produto"><span class="aa-icone">${IC.play}</span><span class="nome"><b>${h(x.c.nome)}</b><span>${p(x.n, "aula liberada", "aulas liberadas")}</span></span>${a.bloqueada ? pilula("Bloqueado", "vermelho") : vencida(a) ? pilula("Vencido", "vermelho") : pilula("Ativo", "verde")}</div>`).join("") || `<div class="aa-obs">Nenhum produto liberado.</div>`}
        <h3 class="aa-secao">Observações</h3>
        <div class="aa-obs">${a.notas.length ? notas(false) : "Nenhuma observação registrada."}</div>`;
    else if (aba === "acessos") corpo = `
        <div class="aa-cartao">
          <div class="aa-cartao-cab"><h3>Acesso</h3></div>
          ${linha("Login", h(a.login))}
          ${linha("Código de acesso", a.codigo ? `<span style="letter-spacing:.14em">${verCod ? h(a.codigo) : "••••"}</span><button class="link" data-a="ver-codigo-aluna" data-id="${a.id}">${verCod ? "ocultar" : "mostrar"}</button>` : naoInf)}
          ${linha("Acesso liberado em", br(a.entrada))}
          ${linha("Acesso até", a.validade ? br(a.validade) : naoInf)}
          ${linha("Status", status)}
        </div>
        <h3 class="aa-secao">Ações</h3>
        <div class="acoes aa-acoes">
          <button class="botao" data-a="copiar-acesso" data-id="${a.id}">Copiar login e código</button>
          <button class="botao-neutro grande" data-a="whatsapp" data-id="${a.id}" ${a.celular ? "" : 'disabled title="Cadastre o WhatsApp em Editar dados"'}>Enviar pelo WhatsApp</button>
          <button class="botao-neutro grande" data-a="liberar" data-id="${a.id}">Liberar conteúdo</button>
          <button class="botao-neutro grande" data-a="cronograma" data-id="${a.id}">Cronograma</button>
          <button class="botao-neutro grande" data-a="renovar" data-id="${a.id}">Renovar</button>
          ${a.bloqueada
            ? `<button class="botao-neutro grande" data-a="desbloquear-aluna" data-id="${a.id}">Desbloquear</button>`
            : `<button class="botao-neutro grande botao-remover" data-a="bloquear-aluna" data-id="${a.id}">Bloquear</button>`}
        </div>`;
    else if (aba === "progresso") {
      const feitasLib = [...libs].filter((id) => a.feitas.has(id)).length;
      const pctG = libs.size ? Math.round(feitasLib / libs.size * 100) : 0;
      const mods = S.cursos.flatMap((c) => c.modulos.map((m, i) => ({ c, m, i, lib: m.aulas.filter((k) => libs.has(k.id)) }))).filter((x) => x.lib.length);
      corpo = `
        <h3 class="aa-secao" style="margin-top:4px">Progresso geral</h3>
        <div class="al-prog-geral"><span class="al-pct">${pctG}%</span><span class="al-barra-p"><i style="width:${pctG}%"></i></span><span class="al-prog-txt">${feitasLib} de ${libs.size} ${libs.size === 1 ? "aula concluída" : "aulas concluídas"}</span></div>
        <h3 class="aa-secao">Progresso por módulo</h3>
        ${mods.length ? `<div class="al-mods">${mods.map(({ c, m, i, lib }) => {
          const n = lib.filter((k) => a.feitas.has(k.id)).length; const pct = Math.round(n / lib.length * 100);
          return `<div class="al-mod"><span class="al-mod-nome">Módulo ${numModulo(c, i)} - ${h(m.nome)}</span><span class="al-barra-p"><i style="width:${pct}%"></i></span><span class="al-mod-pct">${pct}%</span><span class="al-mod-qt">${n} de ${p(lib.length, "aula", "aulas")}</span>${seta}</div>`;
        }).join("")}</div>` : `<div class="aa-obs">Nenhum conteúdo liberado ainda.</div>`}
        ${coms.length ? `<h3 class="aa-secao">Comentários dela</h3><div class="aa-cartao">${coms.map((k) => `<div class="mini"><span class="nome"><b class="leve">${h(k.texto)}</b><span>${localAula(k.aula)} · ${h(k.quando)} · ${estCom[k.estado]}</span></span></div>`).join("")}</div>` : ""}`;
    }
    else if (aba === "pagamentos") corpo = `
        <div class="aa-obs">Nenhuma informação de pagamento registrada.</div>`;
    else corpo = `
        <div class="aa-cartao">
          <form data-f="nota" data-id="${a.id}" style="display:flex;flex-direction:column;gap:8px">
            <textarea class="campo" name="texto" rows="2" placeholder="Escreva uma observação. Só a equipe vê." required></textarea>
            <div><button class="botao-neutro grande">Adicionar observação</button></div>
          </form>
        </div>
        <div class="aa-obs" style="margin-top:12px">${a.notas.length ? notas(true) : "Nenhuma observação registrada."}</div>
        ${a.contatos.length ? `<h3 class="aa-secao">Contatos registrados</h3><div class="aa-cartao">${a.contatos.slice().reverse().map((c) => `<div class="mini"><span class="nome"><b class="leve">${h(c.resultado)}${c.obs ? " — " + h(c.obs) : ""}</b><span>${h(c.quem)} · ${dataHora(c.quando)}</span></span></div>`).join("")}</div>` : ""}
        <h3 class="aa-secao">Histórico</h3>
        <div class="aa-cartao">${hist.length ? `<ul class="tempo">${hist.map((x) => `<li><span class="quando">${dataHora(x.quando)} · ${h(x.quem)}</span><p>${h(x.texto)}</p></li>`).join("")}</ul>` : semNada("Nada registrado ainda.")}</div>`;

    return `
      <div class="aa-fundo dois" data-a="aa-fechar-aluna"></div>
      <aside class="aa-painel largo${entra ? " entra" : ""}" role="dialog" aria-modal="true" aria-label="Cadastro de ${h(a.nome)}">
        <button type="button" class="aa-fechar canto" data-a="aa-fechar-aluna" aria-label="Fechar o cadastro e voltar à lista">${xis}</button>
        <header class="aa-cab aluna">
          <div class="aa-quem">${aaAvatar(a, true)}<div><h2>${h(a.nome)}</h2><p>Cadastrada em ${br(a.criadaEm ? diaDe(a.criadaEm) : a.entrada)} • ${p(a.liberadas, "aula liberada", "aulas liberadas")}</p>
            <span class="aa-foto-acoes">${S.fotos[a.id]
              ? `<button type="button" class="link" data-a="foto-aluna-escolher" data-id="${a.id}">Trocar foto</button><button type="button" class="link" data-a="foto-aluna-ajustar" data-id="${a.id}">Ajustar</button><button type="button" class="link perigo" data-a="foto-aluna-remover" data-id="${a.id}">Remover foto</button>`
              : `<button type="button" class="link" data-a="foto-aluna-escolher" data-id="${a.id}">Colocar foto</button>`}</span></div></div>
          ${status}
        </header>
        <nav class="aa-abas" role="tablist">${ABAS_AL.map(([k, n]) => `<button type="button" role="tab" class="aa-aba" data-a="aa-aba" data-v="${k}" aria-selected="${k === aba}">${n}</button>`).join("")}</nav>
        <div class="aa-corpo" data-rolagem="aluna-${a.id}-${aba}">${corpo}</div>
      </aside>`;
  }

  /* ---------- FICHA ---------- */
  function progressoModulos(a: Aluna) {
    const ac = a.acesso;
    const blocos = S.cursos.filter((c) => c.modulos.length).map((c) => {
      const linhas = c.modulos.map((m, i) => {
        const libs = m.aulas.filter((k) => ac.cursos.includes(c.id) || ac.modulos.includes(m.id) || ac.aulas.includes(k.id));
        if (!libs.length) return "";
        const n = m.aulas.filter((k) => a.feitas.has(k.id)).length;
        const pct = m.aulas.length ? Math.round(n / m.aulas.length * 100) : 0;
        return `<div class="prog"><div class="prog-topo"><span>Módulo ${numModulo(c, i)} — ${h(m.nome)}</span><span>${n}/${m.aulas.length}</span></div><div class="barra"><i style="width:${pct}%"></i></div></div>`;
      }).join("");
      return linhas ? `<p class="rotulo" style="margin:12px 0 2px">${h(c.nome)}</p>${linhas}` : "";
    }).join("");
    return blocos || semNada("Nenhum conteúdo liberado ainda.");
  }

  function telaFicha() {
    const a = ui.ficha ? S.alunas.find((x) => x.id === ui.ficha) : undefined;
    if (!a) return `<section class="tela ativa"><div class="vazio">Aluna não encontrada.</div><button class="botao-neutro grande" style="margin-top:14px" data-a="aba" data-v="alunas">← Alunas</button></section>`;
    const [rot, cor] = sitInfo(situacao(a));
    const ult = a.ultimaAula ? acharAula(a.ultimaAula) : null;
    const hist = S.historico.filter((x) => x.aluna === a.id);
    const coms = comentariosDe(a);
    const estCom: Record<Estado, string> = { moderar: "para moderar", publicado: "publicado", oculto: "oculto" };
    const verCod = ui.verCodigo === a.id;
    return `
    <section class="tela ativa">
      <button class="botao-neutro grande" style="margin-bottom:18px" data-a="aba" data-v="alunas">← Alunas</button>

      <div class="cartao ficha-topo">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:18px">
          ${avatar(a, true)}
          <span style="flex:1 1 280px;min-width:0">
            <span style="display:flex;flex-wrap:wrap;align-items:center;gap:10px"><b style="font-size:22px">${h(a.nome)}</b>${etiqueta(rot, cor)}</span>
            <span class="ficha-meta">Login <b>${h(a.login)}</b> · Código <b style="letter-spacing:.14em">${verCod ? h(a.codigo) : "••••"}</b><button class="link" data-a="ver-codigo-aluna" data-id="${a.id}">${verCod ? "ocultar" : "mostrar"}</button> · ${a.celular ? "WhatsApp " + h(fone(a.celular)) : "sem WhatsApp cadastrado"}</span>
            <span class="ficha-datas">Entrou em ${br(a.entrada)} · ${vencida(a) ? "acesso venceu em " + br(a.validade) : "acesso até " + br(a.validade)}</span>
          </span>
        </div>
        <div class="acoes" style="margin-top:20px">
          <button class="botao" data-a="copiar-acesso" data-id="${a.id}">Copiar login e código</button>
          <button class="botao-neutro grande" data-a="whatsapp" data-id="${a.id}" ${a.celular ? "" : 'disabled title="Cadastre o WhatsApp em Editar dados"'}>Enviar pelo WhatsApp</button>
          <button class="botao-neutro grande" data-a="editar-aluna" data-id="${a.id}">Editar dados</button>
          <button class="botao-neutro grande" data-a="liberar" data-id="${a.id}">Liberar conteúdo</button>
          <button class="botao-neutro grande" data-a="cronograma" data-id="${a.id}">Cronograma</button>
          <button class="botao-neutro grande" data-a="renovar" data-id="${a.id}">Renovar</button>
          ${a.bloqueada
            ? `<button class="botao-neutro grande" data-a="desbloquear-aluna" data-id="${a.id}">Desbloquear</button>`
            : `<button class="botao-neutro grande botao-remover" data-a="bloquear-aluna" data-id="${a.id}">Bloquear</button>`}
        </div>
      </div>

      <div class="numeros">
        ${numero(a.concluidas, "Aulas concluídas")}
        ${numero(a.liberadas, "Aulas liberadas")}
        ${a.ultimoAcesso ? numeroTxt(haQuanto(a.ultimoAcesso), "Último acesso") : numeroTxt("ainda não entrou", "Último acesso", cadastrada(a))}
        ${numeroTxt(ult ? localAula(ult.a.id) : "—", "Última aula assistida", ult ? ult.a.nome : "")}
      </div>

      <div class="grade-2" style="align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="painel-bloco">
            <h3>Progresso por módulo</h3>
            <p class="sub">Aulas concluídas em cada módulo liberado.</p>
            ${progressoModulos(a)}
          </div>
          <div class="painel-bloco">
            <h3>Anotações internas</h3>
            <p class="sub">Só a equipe vê.</p>
            <form data-f="nota" data-id="${a.id}" style="display:flex;flex-direction:column;gap:8px;margin-bottom:6px">
              <textarea class="campo" name="texto" rows="2" placeholder="Ex.: pediu ajuda com o celular" required></textarea>
              <div><button class="botao-neutro grande">Adicionar anotação</button></div>
            </form>
            ${a.notas.slice().reverse().map((n) => `<div class="mini"><span class="nome"><b class="leve">${h(n.texto)}</b><span>${h(n.quem)} · ${dataHora(n.quando)}</span></span><span class="acoes"><button class="botao-neutro botao-remover" data-a="nota-remover" data-id="${a.id}" data-v="${n.id}">Remover</button></span></div>`).join("") || semNada("Nenhuma anotação.")}
          </div>
          ${coms.length ? `<div class="painel-bloco">
            <h3>Comentários dela</h3>
            <p class="sub">${p(coms.length, "comentário", "comentários")} nas aulas.</p>
            ${coms.map((k) => `<div class="mini"><span class="nome"><b class="leve">${h(k.texto)}</b><span>${localAula(k.aula)} · ${h(k.quando)} · ${estCom[k.estado]}</span></span></div>`).join("")}
          </div>` : ""}
        </div>
        <div class="painel-bloco">
          <h3>Histórico</h3>
          <p class="sub">Tudo o que aconteceu com esta aluna, do mais recente ao mais antigo.</p>
          ${hist.length ? `<ul class="tempo">${hist.map((x) => `<li><span class="quando">${dataHora(x.quando)} · ${h(x.quem)}</span><p>${h(x.texto)}</p></li>`).join("")}</ul>` : semNada("Nada registrado ainda.")}
        </div>
      </div>
    </section>`;
  }

  /* ---------- ENGAJAMENTO (a nota vem do banco) ---------- */
  /** Recém-chegada: cadastrada há até 7 dias e ainda sem o primeiro acesso. Depois disso, a nota decide. */
  const nivel = (x: Aluna): [string, string, string] => !x.ultimoAcesso && nova(x) ? ["Recém-chegada", "var(--texto-2)", "recem"] : nivelEng(x.nota);
  const nivelEng = (n: number): [string, string, string] => n >= 60 ? ["Avançando", "var(--verde)", "avancando"] : n >= 35 ? ["No ritmo", "var(--ouro-txt)", "ritmo"] : ["Precisa de um empurrão", VERMELHO, "empurrao"];
  const AJUDA: Record<string, [string, string, string, string]> = {
    avancando: ["Avançando", "Está assistindo e voltando com frequência.", "um elogio rápido, ou nada — ela está bem.", "var(--verde)"],
    ritmo: ["No ritmo", "Assiste, mas devagar ou com intervalos.", "uma mensagem de incentivo, lembrando a próxima aula.", "var(--ouro-txt)"],
    empurrao: ["Precisa de um empurrão", "Parou de entrar ou quase não começou.", "ligue ou mande WhatsApp perguntando se precisa de ajuda para entrar.", "var(--perigo)"],
    recem: ["Recém-chegada", "Cadastrada nos últimos 7 dias e ainda sem o primeiro acesso. É normal.", "confira se ela recebeu o login e o código. Passando 7 dias sem entrar, ela vai para “Precisa de um empurrão”.", "var(--texto-2)"],
  };
  const AJUDA_ABAS: Record<string, [string, string, string]> = {
    inicio: ["Início", "O resumo do dia: o que pede atenção agora.", "comece pelos comentários esperando e pelos acessos que vencem. Clique no nome da aluna para abrir a ficha dela."],
    alunas: ["Alunas", "Todas as alunas cadastradas, com a situação de cada uma.", "use os filtros para achar quem está vencendo ou sem acesso. Abra a ficha para liberar aulas, renovar ou mandar o acesso pelo WhatsApp."],
    ficha: ["Ficha da aluna", "Tudo sobre uma aluna: dados, aulas liberadas, progresso, anotações e histórico.", "confira o que ela já tem liberado antes de responder qualquer dúvida. Anote o que conversou para a equipe saber."],
    engajamento: ["Engajamento", "Quem está avançando e quem parou. Cada quadro tem um ? explicando o grupo.", "comece por “Precisam de um empurrão”; ligue ou mande o recado pelo WhatsApp (o botão já abre a conversa com a mensagem pronta); e clique em “Registrar contato” para anotar como foi — assim ninguém da equipe liga duas vezes para a mesma pessoa."],
    layout: ["Categorias", "Cada categoria tem uma capa e reúne os cursos que você escolher. Um curso pode estar em mais de uma categoria.", "clique numa categoria para ver os cursos dela, ou em Nova categoria para criar outra."],
    cursos: ["Cursos e conteúdos", "Todos os produtos: a mentoria e os presentes.", "clique num produto para montar os módulos e as aulas. Use + Criar novo para um produto novo."],
    curso: ["Curso aberto", "Um produto por dentro: configurações, módulos e aulas.", "adicione, renomeie, reordene ou bloqueie módulos e aulas. Clique em Abrir na aula para colocar vídeo, capa e texto."],
    aula: ["Aula aberta", "O conteúdo de uma aula: vídeo, capa, texto e extras.", "cole o link do vídeo, escolha a capa, escreva o texto e clique em Salvar aula."],
    comentarios: ["Comentários", "O que as alunas escreveram nas aulas.", "publique o que estiver bom, oculte o que não for adequado e responda quando fizer sentido."],
    equipe: ["Equipe", "Quem tem acesso a este painel.", "adicione uma pessoa, passe o código para ela e bloqueie quando ela sair da equipe."],
    registro: ["Registro", "Tudo o que a equipe fez no painel, com data e hora.", "consulte quando precisar saber quem mudou o quê."],
  };
  /*
   * O manual do cronograma, aberto pelo "?" da janela.
   *
   * É `<details>` e não o balão das abas de propósito: o balão redesenha
   * a tela, e aqui isso apagaria os dias e as datas que a pessoa já
   * digitou sem salvar.
   */
  const manualCronograma = (a: Aluna) => {
    const ex = a.entrada || hoje();
    return `
    <details class="manual">
      <summary><span class="ajuda-btn" aria-hidden="true">?</span> Como funciona o cronograma</summary>
      <div class="manual-corpo">
        <p><b>1. Primeiro, libere.</b> O cronograma só marca <em>quando</em> abre o que já está liberado para ela em <b>Liberar conteúdo</b>. Os dias do módulo não liberam nada sozinhos: se o módulo não estiver liberado, ele continua fechado.</p>
        <p><b>2. Dias do módulo (o número ao lado de cada módulo).</b> Quantos dias depois da data de entrada da aluna o módulo inteiro abre, à meia-noite (horário de Brasília).</p>
        <ul>
          <li>Ela entrou em ${br(ex)}. Com <b>2</b>, o módulo abre em <b>${br(maisDias(ex, 2))}</b>.</li>
          <li><b>0</b> abre no próprio dia da entrada.</li>
          <li><b>Vazio</b> (—) abre assim que estiver liberado, sem esperar.</li>
        </ul>
        <p><b>3. Data fixa por aula.</b> Clique em "Data fixa por aula" embaixo do módulo e escolha o dia de cada aula. A aula abre nesse dia, à meia-noite.</p>
        <ul>
          <li>A data da aula vale mais que os dias do módulo. Exemplo: módulo com 2 dias e a aula 1 com data fixa — a aula 1 abre na data dela; as outras aulas do módulo abrem pelos 2 dias.</li>
          <li>Pôr uma data também <b>libera aquela aula</b>, mesmo que o módulo não esteja liberado.</li>
          <li>Apagar a data: a aula volta a seguir o módulo. Se ela estava liberada só por causa da data, fica aberta na hora.</li>
        </ul>
        <p><b>4. "Uma aula a cada tantos dias".</b> Atalho para não preencher data por data: escolha de quantos em quantos dias e a partir de quando, e clique em <b>Preencher datas</b>. Ele preenche as aulas já liberadas para ela, uma depois da outra. Confira as datas antes de salvar.</p>
        <p><b>5. Aula "liberada para todas"</b> não segue cronograma: abre para todo mundo, na hora.</p>
        <p><b>6. Nada muda até clicar em Salvar cronograma.</b> Cancelar descarta o que foi digitado.</p>
      </div>
    </details>`;
  };
  /*
   * "Mesmo de outra aluna": copiar a liberação ou o cronograma de quem
   * já está configurada.
   *
   * A anterior é a de entrada mais recente (o banco não guarda a ordem
   * de cadastro na lista do painel); as outras ficam no seletor. Copiar
   * só preenche a janela — quem grava continua sendo o Salvar.
   */
  const modelosPara = (a: Aluna, tem: (x: Aluna) => boolean) =>
    S.alunas.filter((x) => x.id !== a.id && tem(x))
      .sort((x, y) => (y.entrada || "").localeCompare(x.entrada || "") || x.nome.localeCompare(y.nome));
  const temLiberacao = (x: Aluna) => x.acesso.cursos.length + x.acesso.modulos.length + x.acesso.aulas.length > 0;
  const temCronograma = (x: Aluna) => Object.keys(x.cronograma).length + Object.keys(x.datas).length > 0;
  const copiarDe = (a: Aluna, tipo: "liberacao" | "cronograma") => {
    const lista = modelosPara(a, tipo === "liberacao" ? temLiberacao : temCronograma);
    if (!lista.length) return "";
    const oque = tipo === "liberacao" ? "liberação" : "cronograma";
    return `
    <div class="copiar-de">
      <span class="nome" style="font-size:14px">Mesm${tipo === "liberacao" ? "a" : "o"} ${oque} da aluna anterior</span>
      <span style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
        <select class="campo" id="copiarDe" style="flex:1 1 220px;max-width:320px" aria-label="Copiar de qual aluna">
          ${lista.map((x) => `<option value="${x.id}">${h(x.nome)} — entrou em ${br(x.entrada)}</option>`).join("")}
        </select>
        <button type="button" class="botao-neutro grande" data-a="copiar-${tipo}" data-id="${a.id}">Usar ${tipo === "liberacao" ? "esta liberação" : "este cronograma"}</button>
      </span>
    </div>`;
  };
  const ajudaAba = () => {
    const g = AJUDA_ABAS[ui.tab]; if (!g) return "";
    const key = "aba-" + ui.tab;
    return `<span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="${key}" aria-label="O que é ${g[0]}" aria-expanded="${ui.ajuda === key}">?</button>${ui.ajuda === key ? `<span class="ajuda-pop esq" role="tooltip"><b>${g[0]}</b><span>${g[1]}</span><em>O que fazer: ${g[2]}</em></span>` : ""}</span>`;
  };
  /*
   * Engajamento no mesmo padrão de "Alunas e acessos": um quadro por
   * grupo (os mesmos filtros e a mesma nota de antes), a lista abre ao
   * lado e a aluna abre no cadastro completo.
   */
  const ICONE_ENG: Record<string, string> = {
    empurrao: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/></svg>`,
    ritmo: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
    avancando: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5l5-5 4 4 7-7.5M14.5 8H20v5.5"/></svg>`,
    recem: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8.5" r="3.8"/><path d="M3 20c.8-4 3.5-6 7-6 1.6 0 3 .4 4.1 1.2M18 13.5v6M15 16.5h6"/></svg>`,
    semcontato: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.7a2 2 0 0 1 2-2.2z"/></svg>`,
    todas: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="17.5" r="1.1"/></svg>`,
  };
  function quadrosEng(base: Aluna[], FIL: [string, string, (x: Aluna) => boolean][], media: number): Record<string, Quadro> {
    const meta = (x: Aluna) => {
      const uc = x.contatos[x.contatos.length - 1];
      return `${base.indexOf(x) + 1}º · nota ${x.nota} · ${x.concluidas} de ${x.liberadas} aulas concluídas<br>${x.ultimoAcesso ? "último acesso " + haQuanto(x.ultimoAcesso) : "ainda não entrou"} · ${uc ? "contato " + haQuanto(diaDe(uc.quando)) : "sem contato registrado"}`;
    };
    const acao = (x: Aluna) => {
      const k = nivel(x)[2];
      return `<button class="botao-verde" data-a="contato" data-id="${x.id}">Registrar contato</button>`
        + (k === "recem" && x.celular ? `<button class="botao-neutro" data-a="whatsapp" data-id="${x.id}">Enviar acesso</button>`
          : k !== "avancando" && x.celular ? `<button class="botao-neutro" data-a="whatsapp-volta" data-id="${x.id}">Mandar recado</button>` : "");
    };
    const filtro = (id: string) => (FIL.find((f) => f[0] === id) || FIL[0])[2];
    const q = (id: string, titulo: string, resumoCom: string, resumoSem: string, sub: string, vazio: string): Quadro => {
      const lista = base.filter(filtro(id));
      return { titulo, lista, icone: ICONE_ENG[id], resumo: lista.length ? resumoCom : resumoSem, sub, vazio, meta, acao, acoesAbaixo: true };
    };
    const guia = (k: string) => AJUDA[k][1] + " O que fazer: " + AJUDA[k][2];
    const ajudaDe = (k: string): [string, string, string] => [AJUDA[k][0], AJUDA[k][1], AJUDA[k][2]];
    const quadros: Record<string, Quadro> = {
      empurrao: q("empurrao", "Precisam de um empurrão", "pararam ou quase não começaram", "Ninguém precisa agora", guia("empurrao"), "Nenhuma aluna precisa de um empurrão agora."),
      ritmo: q("ritmo", "No ritmo", "assistem, mas devagar ou com intervalos", "Ninguém neste grupo", guia("ritmo"), "Nenhuma aluna neste grupo."),
      avancando: q("avancando", "Avançando", "assistem e voltam com frequência", "Ninguém neste grupo ainda", guia("avancando"), "Nenhuma aluna neste grupo."),
      recem: q("recem", "Recém-chegadas", "cadastradas há até 7 dias, sem o primeiro acesso", "Nenhuma recém-chegada", guia("recem"), "Nenhuma recém-chegada."),
      semcontato: q("semcontato", "Sem contato há 7 dias", "ninguém da equipe falou com elas na semana", "Todas tiveram contato", "Ninguém da equipe registrou contato com elas nos últimos 7 dias. Ligue ou mande recado e clique em Registrar contato.", "Todas tiveram contato nos últimos 7 dias."),
      todas: q("todas", "Todas as alunas", "ranking pela nota · média " + media, "Nenhuma aluna ativa ainda", "Da maior para a menor nota. A nota vai de 0 a 100: aulas concluídas, último acesso e comentários. Bloqueadas ou com acesso vencido ficam fora.", "Nenhuma aluna ativa ainda."),
    };
    quadros.empurrao.ajuda = ajudaDe("empurrao");
    quadros.ritmo.ajuda = ajudaDe("ritmo");
    quadros.avancando.ajuda = ajudaDe("avancando");
    quadros.recem.ajuda = ajudaDe("recem");
    quadros.semcontato.ajuda = ["Sem contato há 7 dias", "Ninguém da equipe registrou contato com ela nos últimos 7 dias.", "ligue ou mande recado e clique em Registrar contato para anotar como foi — assim ninguém liga duas vezes para a mesma pessoa."];
    quadros.todas.ajuda = ["A nota", "Vai de 0 a 100 e soma três coisas: aulas concluídas entre as liberadas, há quanto tempo foi o último acesso e os comentários. Só a equipe vê. Alunas bloqueadas ou com acesso vencido ficam fora.", ""];
    return quadros;
  }
  /*
   * Engajamento (referência aprovada): engajamento geral do período,
   * os grupos com a variação em relação ao período anterior, a evolução
   * dia a dia, a distribuição e as três listas. Os números do período
   * vêm de `resumo_engajamento()` (0058); as listas, do mesmo cálculo
   * de sempre (`engajamento_alunas()`).
   */
  type ResumoEng = { dias: { dia: string; ativas: number; total: number }[]; ativas: number; total: number; ativas_ant: number; total_ant: number; grupos: Record<string, number>; grupos_ant: Record<string, number>; sem_contato: number; sem_contato_ant: number; media_nota: number | null };
  let resEng: { chave: string; r: ResumoEng | null } | null = null;
  let resEngCarregando = "";
  function carregarResumoEng() {
    const { de, ate, chave } = periodoIni();
    if ((resEng && resEng.chave === chave) || resEngCarregando === chave) return;
    resEngCarregando = chave;
    void (async () => {
      const r = await supabase.rpc("resumo_engajamento", { p_de: de, p_ate: ate });
      resEngCarregando = "";
      resEng = { chave, r: r.error ? null : (r.data as ResumoEng) };
      if (ui.tab === "engajamento") render();
    })();
  }
  // Variação em relação ao período anterior. Sem dado anterior, não mostra nada.
  const variacao = (cur: number, ant: number | undefined, subirEhBom: boolean) => {
    if (!ant) return "";
    const v = Math.round(((cur - ant) / ant) * 100);
    if (!v) return `<span class="eng-var neutro">0%</span>`;
    const bom = (v > 0) === subirEhBom;
    return `<span class="eng-var ${bom ? "bom" : "ruim"}">${v > 0 ? "↑" : "↓"} ${Math.abs(v)}%</span>`;
  };
  function telaEngajamento() {
    carregarResumoEng();
    const { ate, chave } = periodoIni();
    const r = resEng && resEng.chave === chave ? resEng.r : null;
    const base = S.alunas.filter((a) => !a.bloqueada && !vencida(a)).sort((x, y) => y.nota - x.nota);
    const media = base.length ? Math.round(base.reduce((s, x) => s + x.nota, 0) / base.length) : 0;
    const semContato = (x: Aluna) => !x.contatos.some((c) => diasEntre(diaDe(c.quando), hoje()) <= 7);
    const grupo = (g: string) => (x: Aluna) => nivel(x)[2] === g;
    const FIL: [string, string, (x: Aluna) => boolean][] = [["todas", "Todas", () => true], ["avancando", "Avançando", grupo("avancando")], ["ritmo", "No ritmo", grupo("ritmo")], ["empurrao", "Precisa de um empurrão", grupo("empurrao")], ["recem", "Recém-chegadas", grupo("recem")], ["semcontato", "Sem contato há 7 dias", semContato]];
    const Q = quadrosEng(base, FIL, media);
    // Período terminando hoje: os números são as próprias listas. Antes disso, como estavam no fim do período.
    const atual = ate >= hoje();
    const conta = (g: string) => (atual || !r ? Q[g].lista.length : r.grupos[g] || 0);
    const nSemContato = atual || !r ? Q.semcontato.lista.length : r.sem_contato;
    const nTodas = atual || !r ? base.length : r.total;
    const notaMedia = atual || !r || r.media_nota == null ? media : r.media_nota;
    const geral = r && r.total ? Math.round((r.ativas / r.total) * 100) : null;
    const geralAnt = r && r.total_ant ? Math.round((r.ativas_ant / r.total_ant) * 100) : null;
    const dGeral = geral != null && geralAnt != null ? geral - geralAnt : null;
    const cartao = (id: string, ic: string, titulo: string, n: number, varHtml: string, sub: string) => `
        <button type="button" class="eng-ind" data-a="aa-lista" data-v="${id}">
          <span class="eng-ind-ic">${ic}</span>
          <span class="eng-ind-txt">
            <span class="eng-ind-tit">${titulo}${Q[id].ajuda ? ajudaQuadro(id, Q[id].ajuda!) : ""}</span>
            <span class="eng-ind-num"><b>${n}</b>${varHtml}</span>
            <span class="eng-ind-sub">${sub}</span>
          </span>
        </button>`;
    // Evolução: % das alunas que tiveram atividade (abriram o app, assistiram ou comentaram) em cada dia.
    const nDias = ui.engDias || 7;
    const dias = r ? r.dias.slice(-nDias) : [];
    const barras = dias.map((d) => { const v = d.total ? Math.round((d.ativas / d.total) * 100) : 0; return `<span class="eng-barra" title="${br(d.dia)}: ${d.ativas} de ${d.total} alunas (${v}%)"><i style="height:${v}%"></i><em>${br(d.dia).slice(0, 5)}</em></span>`; }).join("");
    // Distribuição: os três grupos.
    const nAv = conta("avancando"), nRi = conta("ritmo"), nEm = conta("empurrao"), soma = nAv + nRi + nEm;
    const fat = (n: number) => (soma ? (n / soma) * 100 : 0);
    const dist = soma ? `conic-gradient(var(--eng-verde) 0 ${fat(nAv)}%, var(--eng-ouro) ${fat(nAv)}% ${fat(nAv) + fat(nRi)}%, var(--eng-rosa) ${fat(nAv) + fat(nRi)}% 100%)` : "var(--aa-cinza)";
    const linhaDist = (cls: string, nome: string, n: number) => `<li><span class="eng-ponto ${cls}"></span><span>${nome}</span><b>${n} (${soma ? Math.round(fat(n)) : 0}%)</b></li>`;
    // As três listas, 5 de cada.
    const lista = (id: string, ic: string, titulo: string, sub: string, etiqueta: string, cls: string) => {
      const l = Q[id].lista.slice(0, 5);
      return `
        <section class="eng-lista">
          <header><span class="eng-lista-ic">${ic}</span><span class="eng-lista-tit"><b>${titulo}</b><span>${sub}</span></span><button class="al-botao pequeno" data-a="aa-lista" data-v="${id}">Ver todas ${IC_INI.seta}</button></header>
          ${l.map((a) => `
          <div class="eng-linha">
            <button type="button" class="eng-linha-abre" data-a="ficha" data-id="${a.id}">${aaAvatar(a)}<span class="eng-linha-txt"><b>${h(a.nome)}</b><span>${a.ultimoAcessoEm ? (id === "empurrao" ? "Último acesso " : "Acessou ") + haTempo(a.ultimoAcessoEm) : "Ainda não acessou"}</span></span></button>
            <span class="eng-tag ${cls}">${etiqueta}</span>
            <span class="eng-menu"><button type="button" class="eng-mais" data-a="eng-menu" data-id="${a.id}" aria-label="Opções de ${h(a.nome)}" aria-expanded="${ui.engMenu === a.id}">⋮</button>${ui.engMenu === a.id ? `<span class="eng-menu-pop" role="menu">
              <button role="menuitem" data-a="contato" data-id="${a.id}">Registrar contato</button>
              ${a.celular ? `<button role="menuitem" data-a="whatsapp-volta" data-id="${a.id}">Mandar recado no WhatsApp</button>` : ""}
              <button role="menuitem" data-a="ficha" data-id="${a.id}">Abrir ficha</button>
            </span>` : ""}</span>
          </div>`).join("") || `<p class="ini-vazio">${Q[id].vazio}</p>`}
        </section>`;
    };
    return `
    <section class="tela ativa aa eng">
      <div class="eng-topo">
        <div class="eng-geral">
          <span class="eng-anel" style="--p:${geral ?? 0}"><b>${geral == null ? "–" : geral + "%"}</b></span>
          <span class="eng-geral-txt">
            <b>Engajamento geral${ajudaQuadro("geral", ["Engajamento geral", "Quantas alunas ativas tiveram alguma atividade no período: abriram o app, assistiram ou comentaram.", "compare com o período anterior. Caiu? Comece por “Precisam de um empurrão”."])}</b>
            <span>Média de alunas ativas</span>
            ${dGeral != null && dGeral !== 0 ? `<span class="eng-var ${dGeral > 0 ? "bom" : "ruim"}">${dGeral > 0 ? "↑" : "↓"} ${Math.abs(dGeral)}%</span><em>em relação ao período anterior</em>` : ""}
          </span>
        </div>
        <div class="eng-inds">
          ${cartao("empurrao", ICONE_ENG.empurrao, "Precisam de um empurrão", conta("empurrao"), r ? variacao(conta("empurrao"), r.grupos_ant.empurrao, false) : "", "sem atividade recente")}
          ${cartao("ritmo", ICONE_ENG.ritmo, "No ritmo", conta("ritmo"), r ? variacao(conta("ritmo"), r.grupos_ant.ritmo, true) : "", "acessando regularmente")}
          ${cartao("avancando", ICONE_ENG.avancando, "Avançando", conta("avancando"), r ? variacao(conta("avancando"), r.grupos_ant.avancando, true) : "", "alta participação")}
          ${cartao("recem", ICONE_ENG.recem, "Recém-chegadas", conta("recem"), "", "cadastradas há até 7 dias")}
          ${cartao("semcontato", ICONE_ENG.semcontato, "Sem contato há 7 dias", nSemContato, r ? variacao(nSemContato, r.sem_contato_ant, false) : "", "sem contato da equipe há 7+ dias")}
          ${cartao("todas", ICONE_ENG.todas, "Todas as alunas", nTodas, "", "média de nota " + String(Math.round(notaMedia) / 10).replace(".", ","))}
        </div>
      </div>
      <div class="eng-meio">
        <section class="eng-cartao eng-evolucao">
          <header><span class="eng-cab-ic">${ICONE_ENG.ritmo}</span><h3>Evolução do engajamento</h3>
            <select class="campo eng-sel" data-eng-dias aria-label="Quantos dias mostrar">${[[7, "Últimos 7 dias"], [14, "Últimos 14 dias"], [30, "Últimos 30 dias"]].map(([v, n]) => `<option value="${v}" ${nDias === v ? "selected" : ""}>${n}</option>`).join("")}</select>
          </header>
          ${r ? `<div class="eng-graf"><span class="eng-eixo"><em>100%</em><em>75%</em><em>50%</em><em>25%</em><em>0%</em></span><div class="eng-barras">${barras}</div></div>` : `<p class="ini-vazio">Carregando…</p>`}
        </section>
        <section class="eng-cartao eng-dist">
          <header><span class="eng-cab-ic">${ICONE_ENG.ritmo}</span><h3>Distribuição das alunas</h3></header>
          <div class="eng-dist-corpo">
            <span class="eng-rosca" style="background:${dist}"><span><b>${soma}</b>alunas</span></span>
            <ul>${linhaDist("verde", "Avançando", nAv)}${linhaDist("ouro", "No ritmo", nRi)}${linhaDist("rosa", "Precisam de um empurrão", nEm)}</ul>
          </div>
        </section>
      </div>
      <div class="eng-listas">
        ${lista("empurrao", ICONE_ENG.empurrao, "Alunas que precisam de um empurrão", "Sem atividade nos últimos 7 dias.", "Sem atividade", "rosa")}
        ${lista("ritmo", ICONE_ENG.recem, "Alunas no ritmo", "Acessando regularmente.", "No ritmo", "verde")}
        ${lista("avancando", ICONE_ENG.avancando, "Alunas avançando", "Alta participação e progresso.", "Avançando", "azul")}
      </div>
      ${quadrosComLista(Q, [], true)}
    </section>`;
  }

  /* ---------- BUSCA GERAL ---------- */
  const norm = (s: unknown) => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  /*
   * Toda busca do painel passa por aqui.
   *
   * Palavra por palavra, em qualquer ordem: "angela fatima" acha
   * "Angela de Fátima". Uma palavra feita de números (e parênteses,
   * traço, +) procura nos dígitos do celular, então "(31) 99696",
   * "3199696" e "9711" acham o mesmo número, digitado como for.
   */
  const casa = (consulta: string, texto: string, celular = "") => {
    const alvo = norm(texto); const digitos = celular.replace(/\D/g, "");
    return norm(consulta).split(/\s+/).filter(Boolean).every((w) => {
      if (alvo.includes(w)) return true;
      const d = w.replace(/\D/g, "");
      return !!d && /^[\d()+.\-]+$/.test(w) && digitos.includes(d);
    });
  };
  function resultadosBusca() {
    const q = norm(ui.buscaGeral).trim();
    if (!q || !ui.buscaAberta) return "";
    const r: [string, string, string, string, string][] = [];
    // Os números do celular, juntos ou separados, acham a aluna mesmo
    // espalhados em várias palavras: "31 99696 9711".
    const soDigitos = q.replace(/\D/g, "");
    const pelosDigitos = (a: Aluna) => soDigitos.length >= 4 && /^[\d\s()+.\-]+$/.test(q) && a.celular.replace(/\D/g, "").includes(soDigitos);
    S.alunas.forEach((a) => { if (casa(q, a.nome + " " + a.login + " " + a.email, a.celular) || pelosDigitos(a)) r.push(["Aluna", a.nome, a.login + (a.celular ? " · " + fone(a.celular) : "") + " · " + sitInfo(situacao(a))[0], "aluna", a.id]); });
    S.cursos.forEach((c) => {
      if (casa(q, c.nome)) r.push(["Produto", c.nome, p(c.modulos.length, "módulo", "módulos"), "curso", c.id]);
      c.modulos.forEach((m, i) => {
        if (casa(q, m.nome + " " + c.nome)) r.push(["Módulo", m.nome, c.nome + " · Módulo " + numModulo(c, i), "curso", c.id]);
        m.aulas.forEach((au) => { if (casa(q, au.nome + " " + m.nome)) r.push(["Aula", au.nome, localAula(au.id), "aula", au.id]); });
      });
    });
    S.comentarios.forEach((k) => { if (casa(q, k.texto + " " + k.autora)) r.push(["Comentário", k.texto, k.autora + " · " + localAula(k.aula), "comentario", k.id]); });
    if (!r.length) return `<div class="busca-pop"><p class="nada" style="padding:10px 12px;margin:0">Nada encontrado para “${h(ui.buscaGeral.trim())}”.</p></div>`;
    return `<div class="busca-pop" role="listbox">${r.slice(0, 12).map(([tipo, tit, sub, k, id]) => `<button data-a="busca-ir" data-k="${k}" data-id="${id}" role="option"><span class="tipo">${tipo}</span><span class="txt"><b>${h(tit)}</b><span>${h(sub)}</span></span></button>`).join("")}${r.length > 12 ? `<p class="nada" style="padding:8px 12px;margin:0">Mais ${r.length - 12} resultados. Escreva mais para refinar.</p>` : ""}</div>`;
  }
  function atualizarBusca() { const el = document.getElementById("buscaResultados"); if (el) el.innerHTML = resultadosBusca(); }

  /* ---------- REGISTRO ---------- */
  function telaRegistro() {
    const lista = S.historico;
    return `
    <section class="tela ativa">
      <p style="margin:0 0 16px;font-size:14px;color:var(--texto-2)">Tudo o que a equipe fez no painel, do mais recente ao mais antigo.</p>
      ${lista.length ? `<div class="painel-bloco"><ul class="tempo">${lista.map((x) => {
        const al = x.aluna ? S.alunas.find((y) => y.id === x.aluna) : undefined;
        return `<li><span class="quando">${dataHora(x.quando)} · ${h(x.quem)}</span><p>${h(x.texto)}${al ? ` · <button class="link" data-a="ficha" data-id="${al.id}">${h(al.nome)}</button>` : ""}</p></li>`;
      }).join("")}</ul></div>` : `<div class="vazio">Nenhuma ação registrada ainda.</div>`}
    </section>`;
  }

  /* ---------- seleção e menu ---------- */
  function barraLote() {
    const mods: [string, string][] = [];
    S.cursos.forEach((c) => c.modulos.forEach((m, i) => mods.push([m.id, c.nome + " · Módulo " + numModulo(c, i) + " — " + m.nome])));
    return `
    <form data-f="lote" class="lote">
      <b style="font-size:14px">${p(ui.sel.length, "aluna selecionada", "alunas selecionadas")}</b>
      <select class="campo" name="modulo" style="flex:1 1 260px;max-width:420px" aria-label="Módulo para liberar">
        <option value="">Escolha um módulo para liberar</option>
        ${mods.map(([id, n]) => `<option value="${id}">${h(n)}</option>`).join("")}
      </select>
      <button class="botao-neutro grande" name="acao" value="liberar">Liberar módulo</button>
      <button class="botao-neutro grande" name="acao" value="renovar">Renovar por 1 ano</button>
      <button type="button" class="botao-neutro grande" data-a="sel-limpar">Limpar seleção</button>
      <button type="button" class="botao-neutro grande botao-remover" data-a="lote-remover">Remover ${ui.sel.length === 1 ? "aluna" : "alunas"}</button>
    </form>`;
  }
  function menuAluna(a: Aluna) {
    return `
    <div class="menu-pop" role="menu">
      <button data-a="liberar" data-id="${a.id}" role="menuitem">Liberar conteúdo</button>
      <button data-a="cronograma" data-id="${a.id}" role="menuitem">Cronograma</button>
      <button data-a="renovar" data-id="${a.id}" role="menuitem">Renovar por 1 ano</button>
      <button data-a="copiar-acesso" data-id="${a.id}" role="menuitem">Copiar login e código</button>
      <button data-a="whatsapp" data-id="${a.id}" role="menuitem">Enviar acesso pelo WhatsApp</button>
      <button data-a="editar-aluna" data-id="${a.id}" role="menuitem">Editar dados</button>
      ${a.bloqueada
        ? `<button data-a="desbloquear-aluna" data-id="${a.id}" role="menuitem">Desbloquear</button>`
        : `<button class="perigo-txt" data-a="bloquear-aluna" data-id="${a.id}" role="menuitem">Bloquear</button>`}
    </div>`;
  }

  /* ---------- ALUNAS ---------- */
  const FILTROS_AL: [string, string, (a: Aluna) => boolean][] = [
    ["todas", "Todas", () => true],
    ["novas", "Recém-adicionadas", nova],
    ["ativas", "Ativas", (a) => { const s = situacao(a); return s === "ativa" || s === "vencendo"; }],
    ["vencendo", "Vencendo", (a) => situacao(a) === "vencendo"],
    ["vencidas", "Vencidas", (a) => situacao(a) === "vencida"],
    ["bloqueadas", "Bloqueadas", (a) => a.bloqueada],
    ["paradas", "Sem acesso recente", parada],
  ];
  const ORDENS: Record<string, (x: Aluna, y: Aluna) => number> = {
    // Pela hora do cadastro: a última aluna adicionada vem primeiro. Sem a
    // hora (acabou de entrar, antes de recarregar), conta como a mais nova.
    recentes: (x, y) => (y.criadaEm || "9999").localeCompare(x.criadaEm || "9999") || x.nome.localeCompare(y.nome, "pt"),
    antigas: (x, y) => (x.criadaEm || "9999").localeCompare(y.criadaEm || "9999") || x.nome.localeCompare(y.nome, "pt"),
    nome: (x, y) => x.nome.localeCompare(y.nome, "pt"),
    vence: (x, y) => (x.validade || "9999").localeCompare(y.validade || "9999"),
    acesso: (x, y) => (y.ultimoAcesso || "").localeCompare(x.ultimoAcesso || ""),
  };
  /** As alunas da busca e do filtro, na ordem escolhida — é também o que a planilha exporta. */
  function listaAlunas() {
    const q = norm(ui.busca).trim();
    const f = FILTROS_AL.find((x) => x[0] === ui.filtroAl) || FILTROS_AL[0];
    const soDigitos = q.replace(/\D/g, "");
    const pelosDigitos = (a: Aluna) => soDigitos.length >= 4 && /^[\d\s()+.\-]+$/.test(q) && a.celular.replace(/\D/g, "").includes(soDigitos);
    return { f, lista: S.alunas.filter((a) => (casa(q, a.nome + " " + a.login + " " + a.email, a.celular) || pelosDigitos(a)) && f[2](a)).sort(ORDENS[ui.ordemAl] || ORDENS.recentes) };
  }
  /*
   * Alunas, no desenho da referência: indicadores com ícone, barra de
   * busca e ações, filtros em pílula e a lista em tabela. "Abrir ficha"
   * (ou um clique na linha) abre o cadastro completo num painel por cima
   * da lista — o mesmo de "Alunas e acessos".
   */
  const ICONE_AL = {
    todas: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M6.2 19c.6-3.2 3-5 5.8-5s5.2 1.8 5.8 5"/><circle cx="5.6" cy="9.6" r="2.3"/><path d="M2.5 17.5c.4-2.2 1.8-3.4 3.6-3.6"/><circle cx="18.4" cy="9.6" r="2.3"/><path d="M21.5 17.5c-.4-2.2-1.8-3.4-3.6-3.6"/></svg>`,
    ativas: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/></svg>`,
    vencem: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M9 14h6M9 17h3"/></svg>`,
    parada: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/></svg>`,
    entrar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M4.5 12h10M11 8.5l3.5 3.5-3.5 3.5"/></svg>`,
    lupa: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>`,
    mais: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>`,
    planilha: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/></svg>`,
  };
  const cadastroDe = (a: Aluna) => (a.criadaEm ? diaDe(a.criadaEm) : a.entrada);
  const ultimoAcessoTxt = (a: Aluna) => (!a.ultimoAcesso ? "Nunca acessou" : a.ultimoAcesso === hoje() ? "Hoje" : br(a.ultimoAcesso));
  const POR_PAGINA = 20;
  // Progresso: aulas concluídas entre as liberadas para ela.
  const progressoDe = (a: Aluna) => { const libs = aulasDaLiberacao(a); return libs.length ? Math.round(libs.filter((id) => a.feitas.has(id)).length / libs.length * 100) : 0; };
  const categoriasDe = (a: Aluna) => {
    const libs = new Set(aulasDaLiberacao(a));
    const ids = new Set(S.cursos.filter((c) => c.modulos.some((m) => m.aulas.some((k) => libs.has(k.id)))).map((c) => c.cat));
    return S.cats.filter((k) => ids.has(k.id)).map((k) => k.nome).join(", ");
  };
  function telaAlunas() {
    const { lista } = listaAlunas();
    ui.sel = ui.sel.filter((id) => S.alunas.some((a) => a.id === id));
    const todas = lista.length > 0 && lista.every((a) => ui.sel.includes(a.id));
    const anima = ui.aaAnima; ui.aaAnima = "";
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    const pg = Math.min(Math.max(1, ui.paginaAl), paginas); ui.paginaAl = pg;
    const ini = (pg - 1) * POR_PAGINA; const pagina = lista.slice(ini, ini + POR_PAGINA);
    return `
    <section class="tela ativa al">
      <div class="al-barra">
        <label class="al-busca">${ICONE_AL.lupa}<input id="busca" placeholder="Procurar por nome, login ou celular" value="${h(ui.busca)}" data-i="busca" aria-label="Procurar aluna" /></label>
        <button class="al-botao" data-a="exportar">${ICONE_AL.planilha}Exportar planilha</button>
        <label class="al-ordenar"><span>Ordenar por</span>
          <select class="campo" data-ordem aria-label="Ordenar alunas">
            ${[["recentes", "Mais recentes primeiro"], ["antigas", "Mais antigas primeiro"], ["nome", "Nome (A–Z)"], ["vence", "Acesso que vence primeiro"], ["acesso", "Último acesso"]].map(([v, n]) => `<option value="${v}" ${ui.ordemAl === v ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="al-filtros">
        ${FILTROS_AL.map(([id, nome, fn]) => `<button class="al-filtro" data-a="al-filtro" data-v="${id}" aria-pressed="${ui.filtroAl === id}">${nome} (${S.alunas.filter(fn).length})</button>`).join("")}
      </div>
      ${ui.sel.length ? barraLote() : ""}
      ${lista.length ? `
      <div class="al-tabela" role="table" aria-label="Alunas">
        <div class="al-linha al-cab" role="row">
          <span role="columnheader"><input type="checkbox" class="selec" data-sel-todas="${lista.map((a) => a.id).join(",")}" ${todas ? "checked" : ""} aria-label="Selecionar ${lista.length === 1 ? "esta aluna" : "as " + lista.length + " da lista"}" /></span>
          <span role="columnheader">Aluna</span><span role="columnheader">Login</span><span role="columnheader">Telefone</span><span role="columnheader">Botão do app</span><span role="columnheader">Status</span><span role="columnheader">Último acesso</span><span role="columnheader">Progresso</span><span role="columnheader" class="al-acoes-cab">Ações</span>
        </div>
        ${pagina.map(linhaAluna).join("")}
        <div class="al-pag">
          <span>Mostrando ${ini + 1} a ${Math.min(ini + POR_PAGINA, lista.length)} de ${p(lista.length, "aluna", "alunas")}</span>
          ${paginas > 1 ? `<span class="al-pag-bts">
            <button class="al-botao pequeno quadrado" data-a="al-pag" data-v="1" ${pg === 1 ? "disabled" : ""} aria-label="Primeira página">«</button>
            <button class="al-botao pequeno quadrado" data-a="al-pag" data-v="${pg - 1}" ${pg === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
            ${Array.from({ length: paginas }, (_, i) => i + 1).map((n) => `<button class="al-botao pequeno quadrado${n === pg ? " atual" : ""}" data-a="al-pag" data-v="${n}" ${n === pg ? 'aria-current="page"' : ""}>${n}</button>`).join("")}
            <button class="al-botao pequeno quadrado" data-a="al-pag" data-v="${pg + 1}" ${pg === paginas ? "disabled" : ""} aria-label="Próxima página">›</button>
            <button class="al-botao pequeno quadrado" data-a="al-pag" data-v="${paginas}" ${pg === paginas ? "disabled" : ""} aria-label="Última página">»</button>
          </span>` : ""}
        </div>
      </div>` : `<div class="vazio">${S.alunas.length ? "Nenhuma aluna neste filtro." : "Nenhuma aluna cadastrada ainda."}</div>`}
      ${ui.acessoAluna ? cadastroAluna(anima === "aluna") : ""}
    </section>`;
  }
  function linhaAluna(a: Aluna) {
    const sit = situacao(a); const [rot] = sitInfo(sit);
    const cor = sit === "ativa" ? "verde" : sit === "vencendo" ? "ouro" : "vermelho";
    const marc = ui.sel.includes(a.id);
    const pct = progressoDe(a);
    return `
    <div class="al-linha${marc ? " marcada" : ""}${ui.acessoAluna === a.id ? " aberta" : ""}" role="row">
      <span role="cell"><input type="checkbox" class="selec" data-sel="${a.id}" ${marc ? "checked" : ""} aria-label="Selecionar ${h(a.nome)}" /></span>
      <button type="button" class="al-quem" role="cell" data-a="aa-aluna" data-id="${a.id}" aria-label="Abrir a ficha de ${h(a.nome)}">${aaAvatar(a)}<span><b>${h(a.nome)}</b><span>Cadastrada em ${br(cadastroDe(a))}</span></span></button>
      <span role="cell" class="al-cel" data-rot="Login">${h(a.login)}</span>
      <span role="cell" class="al-cel" data-rot="Telefone">${a.celular ? h(fone(a.celular)) : "—"}</span>
      <span role="cell" class="al-cel" data-rot="Categoria">${h(categoriasDe(a)) || "—"}</span>
      <span role="cell" class="al-cel" data-rot="Status"><span class="al-status ${cor}">${h(rot)}</span></span>
      <span role="cell" class="al-cel" data-rot="Último acesso">${ultimoAcessoTxt(a)}</span>
      <span role="cell" class="al-cel al-prog" data-rot="Progresso"><span class="al-prog-n">${pct}%</span><span class="al-barra-p"><i style="width:${pct}%"></i></span></span>
      <span role="cell" class="al-acoes">
        <button class="al-botao pequeno quadrado" data-a="aa-aluna" data-id="${a.id}" aria-label="Abrir a ficha de ${h(a.nome)}" title="Abrir ficha">${IC_CAT.olho}</button>
        <button class="al-botao pequeno quadrado" data-a="editar-aluna" data-id="${a.id}" aria-label="Editar dados de ${h(a.nome)}" title="Editar dados">${IC_CAT.lapis}</button>
        <span class="menu-acoes">
          <button class="al-botao pequeno quadrado" data-a="menu" data-id="${a.id}" aria-label="Mais ações para ${h(a.nome)}" aria-haspopup="menu" aria-expanded="${ui.menu === a.id}">⋮</button>
          ${ui.menu === a.id ? menuAluna(a) : ""}
        </span>
      </span>
    </div>`;
  }


  /* ---------- CATEGORIAS ---------- */
  /*
   * Categorias / Layout, no desenho da referência: uma linha por
   * categoria com imagem, chave Visível, Ver, Editar, ordem e Remover; e
   * o painel "Editar categoria" por cima. Desligar Visível usa
   * `bloqueada_geral`: some da área de membros e o banco nega o conteúdo.
   */
  const IC_CAT = {
    olho: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
    lapis: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4L15.8 5.2a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8.5 18.5z"/></svg>`,
    lixo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>`,
    alca: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>`,
    caixa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>`,
  };
  const dataLocal = (iso: string) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(+d)) return ""; const z = (n: number) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes()); };
  const capaSite = (c: string) => (c ? (c.startsWith("/") ? c : urlDaCapa(c)) : "");
  const capaCat = (k: Cat) => capaSite(k.capa);
  const catAba = (id: string | null | undefined) => S.catsAba.find((x) => x.id === id);
  /** O que está dentro de cada categoria (0077): cursos, módulos ou aulas; um item pode estar em várias. */
  const itensDe = (catId: string) => S.catItens.filter((x) => x.cat === catId);
  const todosModulos = () => S.cursos.flatMap((c) => c.modulos.map((m) => ({ c, m })));
  const todasAulas = () => S.cursos.flatMap((c) => c.modulos.flatMap((m) => m.aulas.map((a) => ({ c, m, a }))));
  const nomeItem = (tipo: string, id: string) => {
    if (tipo === "curso") return curso(id)?.nome || "";
    if (tipo === "modulo") { const x = todosModulos().find((y) => y.m.id === id); return x ? x.m.rot + " " + x.m.num + " — " + x.m.nome + " (" + x.c.nome + ")" : ""; }
    const x = todasAulas().find((y) => y.a.id === id); return x ? x.a.rot + " " + x.a.num + " — " + x.a.nome + " (" + x.m.rot + " " + x.m.num + ")" : "";
  };
  const resumoItens = (catId: string) => { const xs = itensDe(catId), n = (t: string) => xs.filter((x) => x.tipo === t).length; const partes = [n("curso") ? p(n("curso"), "curso", "cursos") : "", n("modulo") ? p(n("modulo"), "módulo", "módulos") : "", n("aula") ? p(n("aula"), "aula", "aulas") : ""].filter(Boolean); return partes.join(" · ") || "Vazia"; };
  /** Em quais categorias o item está (mostrado no curso, no módulo e na aula). */
  const naCategoria = (tipo: string, id: string) => { const cs = S.catItens.filter((x) => x.tipo === tipo && x.item === id).map((x) => catAba(x.cat)).filter((x): x is CatAba => !!x); return `<span class="na-cats">${cs.map((x) => `<span class="na-cat">${h(cat(x.aba)?.nome || "")} › ${h(x.nome)}</span>`).join("") || `<em>Em nenhuma categoria</em>`}</span>`; };
  /*
   * Onde o curso aparece: as abas (todas as que existirem, várias ao mesmo
   * tempo) e, em cada aba marcada, as categorias dela. Liga e desliga sem
   * redesenhar a página, para não perder o que já foi digitado.
   */
  const escolhaAbasCats = (cid: string) => {
    const tem = new Set(S.catItens.filter((x) => x.tipo === "curso" && x.item === cid).map((x) => x.cat));
    const abaOn = (k: Cat) => S.catsAba.some((x) => x.aba === k.id && tem.has(x.id));
    return `
          <div class="cs-campo onde-curso">
            <span>Botões do app ${dicaCampo("Em quais botões do menu do app o curso aparece. Pode marcar mais de um. Todo botão novo aparece aqui sozinho.")}</span>
            <div class="oc-abas">${S.cats.map((k) => `<button type="button" class="oc-aba" data-a="oc-aba" data-id="${k.id}" aria-pressed="${abaOn(k)}">${icDaAba(k)}${h(k.nome)}</button>`).join("") || `<em>Nenhum botão. Crie em Botões do app e Categorias.</em>`}</div>
            <span>Categorias ${dicaCampo(AJ.cat)}</span>
            <div class="oc-cats">${S.cats.map((k) => { const xs = S.catsAba.filter((x) => x.aba === k.id); return `<div class="oc-grupo" data-oc-aba="${k.id}" ${abaOn(k) ? "" : "hidden"}><b>Botão ${h(k.nome)}</b>${xs.map((x) => `<label class="oc-cat"><input type="checkbox" name="catx" value="${x.id}" ${tem.has(x.id) ? "checked" : ""} />${h(x.nome)}</label>`).join("") || `<em>Este botão ainda não tem categorias.</em>`}</div>`; }).join("")}<em class="oc-nada" ${S.cats.some(abaOn) ? "hidden" : ""}>Marque um botão acima para escolher as categorias.</em></div>
          </div>`;
  };
  /** Lista de categorias para escolher, agrupadas pela aba. */
  const opcoesCatAba = (sel: string) => S.cats.map((k) => { const xs = S.catsAba.filter((x) => x.aba === k.id); return xs.length ? `<optgroup label="Botão ${h(k.nome)}">${xs.map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${h(x.nome)}</option>`).join("")}</optgroup>` : ""; }).join("");


  /*
   * Configurações gerais (0052): o nome do cabeçalho da área de membros
   * e a lista de versículos do Início — um por dia, em sequência.
   */
  const versiculoDeHoje = () => { const n = S.versiculos.length; if (!n) return -1; const hj = new Date(); return Math.floor((hj.getTime() - new Date(hj.getFullYear(), 0, 0).getTime()) / 864e5) % n; };
  function telaConfig() {
    const vh = versiculoDeHoje();
    return `
    <section class="tela ativa cfg">
      <form data-f="cfg-marca" class="cfg-cartao">
        <h3>Nome no cabeçalho</h3>
        <p class="cfg-sub">O que aparece no alto de todas as telas da área de membros, à esquerda.</p>
        <div class="campos">
          <label class="grupo" style="flex:1 1 240px"><span class="rotulo">Título</span><input class="campo" name="marcaTitulo" value="${h(S.config.marcaTitulo)}" maxlength="30" required /></label>
          <label class="grupo" style="flex:1 1 240px"><span class="rotulo">Embaixo, pequeno</span><input class="campo" name="marcaSub" value="${h(S.config.marcaSub)}" maxlength="40" /></label>
        </div>
        <div style="margin-top:14px"><button class="al-botao-ouro">Salvar</button></div>
      </form>
      <form data-f="cfg-retorno" class="cfg-cartao">
        <h3>Frase de retorno do Início</h3>
        <p class="cfg-sub">Aparece no Início para a aluna que já começou as aulas, acima de "Continue de onde parou".</p>
        <label class="grupo"><span class="rotulo">Frase</span><textarea class="campo" name="fraseRetorno" rows="3" maxlength="200" required>${h(S.config.fraseRetorno)}</textarea></label>
        <div style="margin-top:14px"><button class="al-botao-ouro">Salvar</button></div>
      </form>
      <div class="cfg-cartao">
        <h3>Versículos</h3>
        <p class="cfg-sub">Aparece um por dia no Início, em sequência, e volta ao primeiro depois do último. ${vh >= 0 ? "Hoje aparece o nº " + (vh + 1) + "." : ""}</p>
        ${S.versiculos.map((x, i) => editando("vers", x.id) ? `
          <form data-f="vers-salvar" data-id="${x.id}" class="cfg-vers editando">
            <textarea id="editarCampo" class="campo" name="texto" rows="3" required>${h(x.texto)}</textarea>
            <input class="campo" name="ref" value="${h(x.ref)}" placeholder="Referência (ex.: Salmos 23:1)" required />
            <span style="display:flex;gap:8px">${botoesEdicao("Salvar")}</span>
          </form>` : `
          <div class="cfg-vers${i === vh ? " hoje" : ""}">
            <span class="cfg-vers-n">${i + 1}</span>
            <span class="cfg-vers-txt"><span>“${h(x.texto)}”</span><b>${h(x.ref)}</b>${i === vh ? `<em>Hoje</em>` : ""}</span>
            <span class="acoes">
              <button class="botao-neutro" data-a="vers-editar" data-id="${x.id}">Editar</button>
              <button class="botao-neutro" data-a="vers-sobe" data-id="${x.id}" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
              <button class="botao-neutro" data-a="vers-desce" data-id="${x.id}" ${i === S.versiculos.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
              <button class="botao-neutro botao-remover" data-a="vers-remover" data-id="${x.id}">Remover</button>
            </span>
          </div>`).join("") || `<p class="ini-vazio">Nenhum versículo. Sem nenhum, o Início não mostra o quadro.</p>`}
        <form data-f="vers-add" class="cfg-vers-add">
          <textarea class="campo" name="texto" rows="2" placeholder="Texto do versículo" required></textarea>
          <input class="campo" name="ref" placeholder="Referência (ex.: Salmos 23:1)" required />
          <button class="al-botao-ouro">+ Adicionar versículo</button>
        </form>
      </div>
    </section>`;
  }

  /*
   * Cursos e conteúdos (referência aprovada): um cartão por curso, com a
   * capa do próprio curso (editada dentro dele), a categoria, as alunas
   * ativas com acesso, os módulos, a data e o progresso médio delas.
   */
  const IC_CUR = {
    pasta: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`,
    pessoas: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19.5c.7-3.6 3.2-5.5 6.2-5.5s5.5 1.9 6.2 5.5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3c1.8.7 3 2.4 3.4 5.2"/></svg>`,
    camadas: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12L12 16.5 20.5 12M3.5 16L12 20.5 20.5 16"/></svg>`,
    cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
    seta: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    grade: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>`,
    lista: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/></svg>`,
    lupa: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/></svg>`,
  };
  // Alunas ativas com acesso ao curso e o progresso médio delas nas aulas dele.
  function numerosCurso(c: Curso) {
    const aulas = c.modulos.flatMap((m) => m.aulas.map((a) => a.id));
    const mods = new Set(c.modulos.map((m) => m.id)), setA = new Set(aulas);
    const comAcesso = S.alunas.filter((a) => !a.bloqueada && !vencida(a) && (a.acesso.cursos.includes(c.id) || a.acesso.modulos.some((m) => mods.has(m)) || a.acesso.aulas.some((x) => setA.has(x))));
    const pct = comAcesso.length && aulas.length ? Math.round((comAcesso.reduce((s, a) => s + aulas.filter((x) => a.feitas.has(x)).length / aulas.length, 0) / comAcesso.length) * 100) : 0;
    return { alunas: comAcesso.length, pct };
  }
  const IC_OLHO_C = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  /*
   * Botões do app e Categorias: as abas do app (Mentoria, Presentes…), as
   * categorias de cada aba (Mestres espirituais, E-books…) e os cursos e
   * conteúdos da categoria escolhida.
   */
  const IC_ABAC = {
    todas: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/></svg>`,
    olho: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
    presente: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/></svg>`,
    mais: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
    lapis: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/></svg>`,
    alca: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
    pontos: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/></svg>`,
  };
  const icDaAbaCurso = (c: Curso) => { const k = cat(c.cat); return k ? icDaAba(k) : IC_ABAC.presente; };
  const icDaAba = (k: Cat) => (k.id === curso(S.config.jornada)?.cat ? IC_ABAC.olho : IC_ABAC.presente);
  const COR_DEST: Record<string, string> = { dourado: "Dourado", violeta: "Violeta", verde: "Verde", azul: "Azul", vermelho: "Vermelho", turquesa: "Turquesa" };
  const ICONE_DEST: Record<string, string> = { estrela: "Estrela", presente: "Presente", filme: "Filme", video: "Vídeo", livro: "Livro", som: "Som", lupa: "Lupa" };
  function editarDestaque() {
    const novo = ui.destEditar === "novo";
    const d: Destaque = novo ? { id: "novo", imagem: "", rotulo: "", titulo: "", descricao: "", botao: "", destino: "presentes", categoriaId: "", categoriaNome: "", icone: "estrela", cor: "dourado", visivel: true } : S.destaques.find((x) => x.id === ui.destEditar)!;
    if (!d) { ui.destEditar = null; return ""; }
    const img = previas["dest-" + d.id] || capaSite(d.imagem);
    const valDest = d.destino === "presentes" ? "presentes" : d.categoriaId ? "cat:" + d.categoriaId : "nome:" + d.categoriaNome;
    const opcoes: [string, string][] = [["presentes", "Botão Presentes"], ...S.cats.map((k) => ["cat:" + k.id, "Botão " + k.nome] as [string, string])];
    if (valDest.startsWith("nome:")) opcoes.push([valDest, "Categoria " + d.categoriaNome + " (ainda não criada)"]);
    return `
      <div class="aa-fundo dois" data-a="dest-fechar"></div>
      <aside class="aa-painel largo cat-painel" role="dialog" aria-modal="true" aria-label="${novo ? "Novo destaque" : "Editar destaque"}">
        <header class="cat-painel-cab"><h2>${novo ? "Novo destaque" : "Editar destaque"}</h2><button type="button" class="aa-fechar" data-a="dest-fechar" aria-label="Fechar">${xis}</button></header>
        <form data-f="dest-salvar" data-id="${d.id}" class="aa-corpo cat-form" data-rolagem="dest-${d.id}">
          <div class="cat-capa" data-previa="dest-${d.id}">${img ? `<img src="${h(img)}" alt="" onerror="this.remove()" />` : ""}</div>
          <input type="hidden" name="imagem" value="${h(d.imagem)}" />
          <div class="capa-bts"><button type="button" class="al-botao" data-a="dest-imagem" data-id="${d.id}">${IC_IMG}${img ? "Alterar" : "Adicionar imagem"}</button>${img ? `<button type="button" class="al-botao" data-a="capa-editar" data-v="dest" data-id="${d.id}">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao perigo" data-a="capa-tirar" data-v="dest" data-id="${d.id}">${IC_MOD.lixo}Remover</button>` : ""}</div>
          <label class="cat-campo"><span>Rótulo (pequeno, com ícone)</span><input class="campo" name="rotulo" value="${h(d.rotulo)}" maxlength="40" required /></label>
          <label class="cat-campo"><span>Título</span><input class="campo" name="titulo" value="${h(d.titulo)}" maxlength="70" required /></label>
          <label class="cat-campo"><span>Descrição</span><textarea class="campo" name="descricao" rows="3" maxlength="200" data-conta="destConta">${h(d.descricao)}</textarea><small id="destConta" class="cat-conta">${d.descricao.length}/200</small></label>
          <label class="cat-campo"><span>Texto do botão</span><input class="campo" name="botao" value="${h(d.botao)}" maxlength="40" required /></label>
          <label class="cat-campo"><span>Leva para</span><select class="campo" name="destino">${opcoes.map(([v2, n]) => `<option value="${h(v2)}" ${v2 === valDest ? "selected" : ""}>${h(n)}</option>`).join("")}</select></label>
          <div class="campos">
            <label class="cat-campo" style="flex:1 1 140px"><span>Ícone</span><select class="campo" name="icone">${Object.entries(ICONE_DEST).map(([v2, n]) => `<option value="${v2}" ${v2 === d.icone ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            <label class="cat-campo" style="flex:1 1 140px"><span>Cor do cartão</span><select class="campo" name="cor">${Object.entries(COR_DEST).map(([v2, n]) => `<option value="${v2}" ${v2 === d.cor ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          </div>
          <label class="cat-vis-linha"><input type="checkbox" name="visivel" ${d.visivel ? "checked" : ""} style="width:20px;height:20px" /><span>Aparece no Início</span></label>
          <div class="cat-rodape">
            ${novo ? "<span></span>" : `<button type="button" class="al-botao cat-remover" data-a="dest-remover" data-id="${d.id}">${IC_CAT.lixo}Remover destaque</button>`}
            <button class="al-botao-ouro">Salvar</button>
          </div>
        </form>
      </aside>`;
  }
  const chaveL = (on: boolean, acao: string, id: string, rotulo: string) => `<button type="button" class="cat-chave" role="switch" aria-checked="${on}" data-a="${acao}" data-id="${id}" aria-label="${h(rotulo)}"><i></i></button>`;
  /*
   * Botões do app e Categorias: um guia dos três níveis (Aba → Categoria → Cursos),
   * a lista das abas do aplicativo à esquerda e, à direita, a aba
   * escolhida. Início mostra os destaques; as outras, as categorias. Os
   * cursos não aparecem aqui: só o botão de entrar na categoria.
   */
  function telaAbas() {
    const todas = !cat(ui.layAba);
    const ic = { seta: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`, estrela: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>`, camadas: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>`, copia: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>`, inicio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>` };
    const secao = (k: Cat) => {
      const xs = S.catsAba.filter((x) => x.aba === k.id), pub = k.pub;
      const corpo = !xs.length ? `<div class="ax-vazio">Nenhuma categoria neste botão ainda. Use Nova categoria.</div>`
        : `<div class="ax-grade" style="--n:${Math.min(xs.length, 3)}">${xs.map((x) => { const img = capaSite(x.capa), e = estado3(x.pub, x.bloq), n = resumoItens(x.id); return `
          <article class="ax-card${cls3(e)}" draggable="true" data-arrasta="${x.id}">
            <div class="ax-card-img"><button type="button" class="ax-card-capa" data-a="catx-entrar" data-id="${x.id}" aria-label="Entrar na categoria ${h(x.nome)}">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : `<span class="ax-sem-capa">Sem capa</span>`}</button><span class="ax-alca" title="Arraste para mudar a ordem">${IC_ABAC.alca}</span>${selo3(e, true)}</div>
            <button type="button" class="ax-nome" data-a="catx-entrar" data-id="${x.id}">${h(x.nome)}${ic.seta}</button>
            <span class="ax-info">${ic.camadas}${n}</span>
            ${seletorEstado("catx", x.id, e, false, true)}
            <div class="ax-acoes">
              <button type="button" class="al-botao ax-ed" data-a="catx-editar" data-id="${x.id}">${IC_ABAC.lapis}Editar</button>
              <button type="button" class="ax-ic" data-a="catx-duplicar" data-id="${x.id}" title="Duplicar" aria-label="Duplicar ${h(x.nome)}">${ic.copia}</button>
              <button type="button" class="ax-ic perigo" data-a="catx-remover" data-id="${x.id}" title="Excluir" aria-label="Excluir ${h(x.nome)}">${IC_CAT.lixo}</button>
              <button type="button" class="ax-ic" data-a="catx-entrar" data-id="${x.id}" title="Entrar na categoria" aria-label="Entrar na categoria ${h(x.nome)}">${ic.seta}</button>
            </div>
          </article>`; }).join("")}</div>`;
      return `
      <section class="ax-sec${pub ? "" : " oculta"}${pub && !k.visivel ? " bloq" : ""}" aria-label="Botão ${h(k.nome)}">
        <div class="ax-cab">
          <span class="ax-navapp" title="Assim o botão aparece no menu do app">${icDaAba(k)}<b>${h(k.nome)}</b></span>
          <div class="ax-cab-txt">
            ${ui.abaRen === k.id ? `<form data-f="aba-renomear" data-id="${k.id}" class="ac-ren"><input id="abaRenNome" class="campo" name="nome" value="${h(k.nome)}" maxlength="30" required aria-label="Nome do botão" /><button class="al-botao-ouro">Salvar</button><button type="button" class="al-botao" data-a="aba-ren" data-id="">Cancelar</button></form>`
              : `<h2>${!pub ? `<span class="ax-selo-cab" title="Oculta">${IC_OLHO_X}</span>` : !k.visivel ? `<span class="ax-selo-cab" title="Bloqueada">${IC_CAD}</span>` : ""}Botão: ${h(k.nome)}<button type="button" class="ab-lapis" data-a="cat-abrir-editar" data-id="${k.id}" aria-label="Editar o botão ${h(k.nome)}">${IC_ABAC.lapis}</button></h2>`}
          </div>
          <span class="ax-est">${seletorEstado("cat", k.id, estado3(k.pub, !k.visivel))}</span>
        </div>
        <div class="ax-corpo ax-arvore"><div class="ax-no-linha"><span class="ax-cats-no"><span class="ax-cats-tit">${IC_CUR.camadas}Categorias<b>${xs.length}</b></span><button type="button" class="ax-cats-add" data-a="catx-nova" data-id="${k.id}" title="Nova categoria neste botão" aria-label="Nova categoria no botão ${h(k.nome)}">${IC_ABAC.mais}</button></span></div>${corpo}</div>
      </section>`;
    };
    const visiveis = todas ? S.cats : S.cats.filter((k) => k.id === ui.layAba);
    // "Todos os botões": um resumo limpo, um cartão igual por aba, com as categorias em lista. Clicar abre a aba.
    const resumo = (k: Cat) => { const xs = S.catsAba.filter((x) => x.aba === k.id), e = estado3(k.pub, !k.visivel); return `
      <article class="ax-res${cls3(e)}">
        <div class="ax-res-cab"><span class="ax-navapp">${icDaAba(k)}<b>${h(k.nome)}</b></span><div class="ax-res-tit"><h3>Botão: ${h(k.nome)}</h3><span>${p(xs.length, "categoria", "categorias")}</span></div>${seletorEstado("cat", k.id, e)}</div>
        <ul class="ax-res-cats">${xs.map((x) => { const img = capaSite(x.capa), e2 = estado3(x.pub, x.bloq); return `<li class="ax-res-item${cls3(e2)}">
          <button type="button" class="ax-res-img" data-a="catx-entrar" data-id="${x.id}" aria-label="Entrar na categoria ${h(x.nome)}">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}${selo3(e2, true)}</button>
          <div class="ax-res-info">
            <button type="button" class="ax-nome" data-a="catx-entrar" data-id="${x.id}">${h(x.nome)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
            <div class="ax-res-l2"><span class="ax-info"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>${resumoItens(x.id)}</span>${seletorEstado("catx", x.id, e2, false, true)}</div>
            <div class="ax-acoes">
              <button type="button" class="al-botao ax-ed" data-a="catx-editar" data-id="${x.id}">${IC_ABAC.lapis}Editar</button>
              <button type="button" class="ax-ic" data-a="catx-duplicar" data-id="${x.id}" title="Duplicar" aria-label="Duplicar ${h(x.nome)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg></button>
              <button type="button" class="ax-ic perigo" data-a="catx-remover" data-id="${x.id}" title="Excluir" aria-label="Excluir ${h(x.nome)}">${IC_CAT.lixo}</button>
              <button type="button" class="ax-ic" data-a="catx-entrar" data-id="${x.id}" title="Entrar na categoria" aria-label="Entrar na categoria ${h(x.nome)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
            </div>
          </div></li>`; }).join("") || `<li class="ax-res-vazio">Nenhuma categoria ainda.</li>`}</ul>
        <button type="button" class="al-botao-ouro ax-res-abrir" data-a="lay-aba" data-v="${k.id}">Abrir botão ${h(k.nome)}</button>
      </article>`; };
    const on = S.config.exibirDestaques;
    return `
    <section class="tela ativa ax">
      <div class="ax-lado">
      <div class="ax-abas" role="group" aria-label="Botões do app">
        <button type="button" class="ax-aba" data-a="lay-aba" data-v="*" aria-pressed="${todas}">${IC_ABAC.todas}Todos<span>${S.cats.length}</span></button>
        ${S.cats.map((k) => `<button type="button" class="ax-aba" data-a="lay-aba" data-v="${k.id}" aria-pressed="${!todas && ui.layAba === k.id}" draggable="true" data-arrasta="${k.id}">${icDaAba(k)}${h(k.nome)}<span>${S.catsAba.filter((x) => x.aba === k.id).length}</span></button>`).join("")}
        ${ui.abaNova ? `<form data-f="cat-add" class="cur-aba-nova"><input id="abaNovaNome" class="campo" name="nome" placeholder="Nome do botão" maxlength="30" required aria-label="Nome do novo botão" /><button class="al-botao-ouro">Criar</button><button type="button" class="al-botao" data-a="aba-nova-fechar">Cancelar</button></form>`
          : `<button type="button" class="ax-aba ax-nova" data-a="aba-nova-abrir">${IC_ABAC.mais}Novo botão</button>`}
      </div>
      <div class="ax-secs">${todas ? `<div class="ax-res-grade">${S.cats.map(resumo).join("")}</div>` : visiveis.map(secao).join("") || `<div class="ax-vazio">Nenhum botão. Use Novo botão.</div>`}</div>
      </div>
      <div class="ax-dest">
        <span class="ax-dest-ic">${ic.estrela}</span>
        <div class="ax-dest-txt"><h2>Destaques do Início <span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="dest-inicio" aria-label="O que são os destaques" aria-expanded="${ui.ajuda === "dest-inicio"}">?</button>${ui.ajuda === "dest-inicio" ? `<span class="ajuda-pop esq aba-pop" role="tooltip"><b>Destaques do Início</b><span>Os cartões grandes da primeira tela da aluna. Cada um leva para um botão do app ou categoria.</span></span>` : ""}</span></h2><p>Defina quais conteúdos aparecem na página inicial da aluna.</p></div>
        <button type="button" class="al-botao-ouro" data-a="dest-gerenciar" aria-expanded="${!!ui.destAberto}">${ui.destAberto ? "Fechar destaques" : "Gerenciar destaques"}${ic.seta}</button>
      </div>
      ${ui.destAberto ? `
      <div class="ax-dest-lista">
        <div class="ax-dest-topo"><span class="cl-exibir">${chaveL(on, "dest-exibir", "", on ? "Esconder os destaques do Início" : "Exibir os destaques no Início")}<span>Exibir destaques no Início</span></span><button type="button" class="al-botao-ouro" data-a="dest-editar" data-id="novo">${IC_ABAC.mais}Novo destaque</button></div>
        <div class="ab-linhas">${S.destaques.map((d, i) => { const img = capaSite(d.imagem); const alvo = d.destino === "presentes" ? "Leva para o botão Presentes" : "Leva para " + (cat(d.categoriaId)?.nome || d.categoriaNome || "—"); return `
          <div class="ab-linha" draggable="true" data-arrasta="${d.id}">
            <span class="ac-cat-alca" title="Arraste para mudar a ordem">${IC_ABAC.alca}</span>
            <span class="cl2-dnum">${i + 1}</span>
            <span class="ab-linha-img larga">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</span>
            <span class="ab-linha-txt"><b>${h(d.titulo)}</b><em>${h(alvo)}</em></span>
            <button type="button" class="est3-pil ${d.visivel ? "verde" : "vermelho"}" data-a="dest-visivel" data-id="${d.id}" title="Clique para ${d.visivel ? "ocultar" : "mostrar"}">${d.visivel ? IC_ABAC.olho : IC_OLHO_X}${d.visivel ? "Ativa" : "Oculta"}</button>
            <button type="button" class="al-botao" data-a="dest-editar" data-id="${d.id}">${IC_ABAC.lapis}Editar</button>
          </div>`; }).join("") || `<div class="cl-vazio">Nenhum destaque. O Início fica só com a mentoria.</div>`}</div>
      </div>` : ""}
      ${ui.destEditar ? editarDestaque() : ""}
      ${ui.catEditar ? editarAba() : ""}
      ${ui.catxEditar ? editarCatAba() : ""}
    </section>`;
  }
  /*
   * Categorias: em cima, os botões (Todas e cada categoria) e Nova
   * categoria; embaixo, os cartões das categorias, lado a lado, como em
   * Cursos e conteúdos. O menu do app terá a sua própria tela.
   */
  function telaCategorias() {
    const sel = catAba(ui.catxFiltro) ? ui.catxFiltro : "";
    const q = norm(ui.catBusca || "").trim(), ordem = ui.catxOrdem || "posicao", vista = ui.catVista === "lista" ? "lista" : "grade";
    const lista = S.catsAba.filter((x) => (!sel || x.id === sel) && (!q || norm(x.nome).includes(q)))
      .sort((a, b) => ordem === "nome" ? a.nome.localeCompare(b.nome) : ordem === "recentes" ? (b.criado || "").localeCompare(a.criado || "") : S.catsAba.indexOf(a) - S.catsAba.indexOf(b));
    const seta = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    const copia = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>`;
    const livro = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3-1.3 6-1.3 9 .5v13c-3-1.8-6-1.8-9-.5zM21 5.5c-3-1.3-6-1.3-9 .5v13c3-1.8 6-1.8 9-.5z"/></svg>`;
    const ordenarIc = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5"/></svg>`;
    // Números reais: cursos da categoria e os módulos/aulas deles (mais módulos e aulas colocados soltos).
    const numeros = (x: CatAba) => {
      const its = itensDe(x.id), cs = its.filter((i) => i.tipo === "curso").map((i) => curso(i.item)).filter((c): c is Curso => !!c);
      const mods = cs.reduce((t, c) => t + c.modulos.length, 0) + its.filter((i) => i.tipo === "modulo").length;
      const aulas = cs.reduce((t, c) => t + totalAulas(c), 0) + its.filter((i) => i.tipo === "aula").length + its.filter((i) => i.tipo === "modulo").reduce((t, i) => t + (todosModulos().find((y) => y.m.id === i.item)?.m.aulas.length || 0), 0);
      return `<span>${IC_CUR.camadas}${p(cs.length, "curso", "cursos")}</span><span>${livro}${p(mods, "módulo", "módulos")}</span><span>${IC_CURSO.play}${p(aulas, "aula", "aulas")}</span>`;
    };
    const status = (x: CatAba, e: Estado3) => `<span class="kc-status">${seletorEstado("catx", x.id, e, false, true)}</span>`;
    const kb = (x: CatAba) => `<span class="est3 kb kc-kb"><button type="button" class="kc-pontos" data-a="estado-menu" data-v="kb-kc:${x.id}" aria-haspopup="menu" aria-expanded="${ui.estMenu === "kb-kc:" + x.id}" aria-label="Mais opções de ${h(x.nome)}">${IC_ABAC.pontos}</button>${ui.estMenu === "kb-kc:" + x.id ? `<span class="est3-menu kb-menu" role="menu">
        <button type="button" role="menuitem" data-a="catx-entrar" data-id="${x.id}">Entrar na categoria</button>
        <button type="button" role="menuitem" data-a="catx-editar" data-id="${x.id}">Editar</button>
        <button type="button" role="menuitem" data-a="catx-duplicar" data-id="${x.id}">Duplicar</button>
        <button type="button" role="menuitem" data-a="cs-ver-aluna">Ver na área da aluna</button>
        <span class="kb-sep"></span>
        <button type="button" role="menuitem" class="perigo" data-a="catx-remover" data-id="${x.id}">Excluir</button>
      </span>` : ""}</span>`;
    const acoes = (x: CatAba) => `
            <button type="button" class="al-botao ax-ed" data-a="catx-editar" data-id="${x.id}">${IC_ABAC.lapis}Editar</button>
            <button type="button" class="ax-ic" data-a="catx-duplicar" data-id="${x.id}" title="Duplicar" aria-label="Duplicar ${h(x.nome)}">${copia}</button>
            <button type="button" class="ax-ic perigo" data-a="catx-remover" data-id="${x.id}" title="Excluir" aria-label="Excluir ${h(x.nome)}">${IC_CAT.lixo}</button>
            <button type="button" class="ax-ic" data-a="catx-entrar" data-id="${x.id}" title="Entrar na categoria" aria-label="Entrar na categoria ${h(x.nome)}">${seta}</button>`;
    const cartao = (x: CatAba) => { const img = capaSite(x.capa), e = estado3(x.pub, x.bloq); return `
      <article class="kc-card${cls3(e)}" draggable="true" data-arrasta="${x.id}">
        <div class="kc-capa"><button type="button" class="kc-capa-btn" data-a="catx-entrar" data-id="${x.id}" aria-label="Entrar na categoria ${h(x.nome)}">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : `<span class="cur-sem-capa">Sem capa</span>`}</button>${selo3(e, true)}<span class="kc-alca" title="Arraste para mudar a ordem">${IC_ABAC.alca}</span>${kb(x)}</div>
        <button type="button" class="kc-nome" data-a="catx-entrar" data-id="${x.id}">${h(x.nome)}${seta}</button>
        <div class="kc-nums">${numeros(x)}</div>
        <div class="kc-pe">${status(x, e)}<span class="kc-bts">${acoes(x)}</span></div>
      </article>`; };
    const linha = (x: CatAba) => { const img = capaSite(x.capa), e = estado3(x.pub, x.bloq); return `
      <article class="kc-linha${cls3(e)}" draggable="true" data-arrasta="${x.id}">
        <span class="kc-alca" title="Arraste para mudar a ordem">${IC_ABAC.alca}</span>
        <button type="button" class="kc-mini" data-a="catx-entrar" data-id="${x.id}" aria-label="Entrar na categoria ${h(x.nome)}">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}${selo3(e, true)}</button>
        <div class="kc-linha-txt"><button type="button" class="kc-nome" data-a="catx-entrar" data-id="${x.id}">${h(x.nome)}${seta}</button><div class="kc-nums">${numeros(x)}</div></div>
        ${status(x, e)}<span class="kc-bts">${acoes(x)}</span>
      </article>`; };
    return `
    <section class="tela ativa ax kc">
      <div class="kc-filtros" role="group" aria-label="Categorias">
        <button type="button" class="ax-aba" data-a="catx-filtro" data-v="" aria-pressed="${!sel}">${IC_ABAC.todas}Todas as categorias<span>${S.catsAba.length}</span></button>
        ${S.catsAba.map((x) => `<button type="button" class="ax-aba" data-a="catx-filtro" data-v="${x.id}" aria-pressed="${sel === x.id}">${h(x.nome)}<span>${S.catItens.filter((y) => y.cat === x.id && y.tipo === "curso").length}</span></button>`).join("")}
      </div>
      <div class="kc-barra">
        <button type="button" class="ax-aba kc-nova" data-a="catx-nova-geral">${IC_ABAC.mais}Nova categoria</button>
        <span class="kc-dir">
          <label class="cur-busca kc-busca">${IC_CUR.lupa}<input class="campo" type="search" id="catBusca" data-cat-busca value="${h(ui.catBusca || "")}" placeholder="Buscar categoria..." aria-label="Buscar categoria" /></label>
          <label class="kc-ordem">${ordenarIc}<select class="campo" data-catx-ordem aria-label="Ordenar">${[["posicao", "Ordenar por posição"], ["nome", "Nome (A–Z)"], ["recentes", "Mais recentes"]].map(([v, t]) => `<option value="${v}" ${ordem === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <span class="kc-vista" role="group" aria-label="Forma de ver"><button type="button" data-a="cat-vista" data-v="cards" aria-pressed="${vista === "grade"}" aria-label="Em grade">${IC_CUR.grade}</button><button type="button" data-a="cat-vista" data-v="lista" aria-pressed="${vista === "lista"}" aria-label="Em lista">${IC_CUR.lista}</button></span>
        </span>
      </div>
      ${vista === "lista"
        ? `<div class="kc-lista">${lista.map(linha).join("") || `<div class="vazio">Nenhuma categoria encontrada.</div>`}</div>`
        : `<div class="kc-grade">${lista.map(cartao).join("")}<button type="button" class="kc-add" data-a="catx-nova-geral"><span>${IC_ABAC.mais}</span><b>Nova categoria</b><em>Crie uma categoria, coloque a capa e escolha os cursos.</em></button></div>`}
      ${ui.catxEditar ? editarCatAba() : ""}
    </section>`;
  }
  /** Editar categoria (dentro da aba): nome, capa, descrição e estado. */
  function editarCatAba() {
    const x = catAba(ui.catxEditar); if (!x) { ui.catxEditar = ""; return ""; }
    const img = previas["catx-" + x.id] || capaSite(x.capa);
    return `
      <div class="aa-fundo dois" data-a="catx-fechar"></div>
      <aside class="aa-painel largo cat-painel" role="dialog" aria-modal="true" aria-label="Editar categoria">
        <header class="cat-painel-cab"><h2>Editar categoria</h2><button type="button" class="aa-fechar" data-a="catx-fechar" aria-label="Fechar">${xis}</button></header>
        <form data-f="catx-salvar" data-id="${x.id}" class="aa-corpo cat-form" data-rolagem="catx-${x.id}">
          <div class="cat-capa" data-previa="catx-${x.id}">${img ? `<img src="${h(img)}" alt="" onerror="this.remove()" />` : ""}</div>
          <input type="hidden" name="capa" value="${h(x.capa)}" />
          <div class="capa-bts"><button type="button" class="al-botao" data-a="catx-imagem" data-id="${x.id}">${IC_IMG}${img ? "Alterar" : "Adicionar capa"}</button>${img ? `<button type="button" class="al-botao" data-a="capa-editar" data-v="catx" data-id="${x.id}">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao perigo" data-a="capa-tirar" data-v="catx" data-id="${x.id}">${IC_MOD.lixo}Remover</button>` : ""}</div>
          <label class="cat-campo"><span>Nome da categoria</span><input id="catxNome" class="campo" name="nome" value="${h(x.nome)}" required maxlength="80" /></label>
          <label class="cat-campo"><span>Descrição (opcional)</span><textarea class="campo" name="descricao" rows="2" maxlength="200">${h(x.descricao)}</textarea></label>
          <div class="cat-vis-linha"><span>Status</span>${seletorEstado("catx", x.id, estado3(x.pub, x.bloq), true, true)}</div>
          <div class="cat-rodape">
            <button type="button" class="al-botao cat-remover" data-a="catx-remover" data-id="${x.id}">${IC_CAT.lixo}Excluir categoria</button>
            <button class="al-botao-ouro">Salvar alterações</button>
          </div>
        </form>
        <section class="cx-cont">
          <h3>O que fica dentro desta categoria <small>(botão ${h(cat(x.aba)?.nome || "—")})</small></h3>
          <p>Pode ser um curso inteiro, um módulo ou uma aula. O mesmo item pode estar em várias categorias.</p>
          <div class="cx-itens">${itensDe(x.id).map((it) => `<div class="cx-item"><span class="cx-tipo">${it.tipo === "curso" ? "Curso" : it.tipo === "modulo" ? "Módulo" : "Aula"}</span><b>${h(nomeItem(it.tipo, it.item) || "(apagado)")}</b><button type="button" class="cx-tirar" data-a="catx-item-tirar" data-id="${it.id}" aria-label="Tirar desta categoria">×</button></div>`).join("") || `<div class="cat-vazio">Nada nesta categoria ainda.</div>`}</div>
          <div class="cx-add">
            <select class="campo" id="catxTipo" data-catx-tipo aria-label="Tipo">${[["curso", "Curso"], ["modulo", "Módulo"], ["aula", "Aula"]].map(([v2, t]) => `<option value="${v2}" ${ui.catxTipo === v2 ? "selected" : ""}>${t}</option>`).join("")}</select>
            <select class="campo" id="catxItem" aria-label="Escolha o item">${(ui.catxTipo === "modulo" ? todosModulos().map((y) => [y.m.id, nomeItem("modulo", y.m.id)]) : ui.catxTipo === "aula" ? todasAulas().map((y) => [y.a.id, nomeItem("aula", y.a.id)]) : S.cursos.map((c) => [c.id, c.nome])).filter(([id]) => !itensDe(x.id).some((it) => it.tipo === ui.catxTipo && it.item === id)).map(([id, t]) => `<option value="${id}">${h(t)}</option>`).join("")}</select>
            <button type="button" class="al-botao-ouro" data-a="catx-item-add" data-id="${x.id}">${IC_ABAC.mais}Adicionar</button>
          </div>
        </section>
      </aside>`;
  }
  /** Dentro da categoria: só os cursos dela, em cartões. */
  function telaCategoriaAba() {
    const x = catAba(ui.catxSel); if (!x) { ui.tab = "layout"; return telaAbas(); }
    const k = cat(x.aba), img = capaSite(x.capa), e = estado3(x.pub, x.bloq);
    return `
    <section class="tela ativa ax">
      <nav class="ax-trilha"><button type="button" data-a="aba" data-v="layout">Categorias</button><span>›</span><b>${h(x.nome)}</b></nav>
      <div class="ax-catcab${cls3(e)}">
        <span class="ax-catcab-img">${img ? `<img src="${h(img)}" alt="" />` : `<span class="ax-sem-capa">Sem capa</span>`}${selo3(e, true)}</span>
        <div class="ax-catcab-txt"><small class="ax-seq">Botão: ${h(k?.nome || "")}<i>›</i>Categoria: ${h(x.nome)}</small><h2>${h(x.nome)}</h2>${x.descricao ? `<p>${h(x.descricao)}</p>` : ""}${seletorEstado("catx", x.id, e, false, true)}</div>
        <div class="ax-catcab-acoes"><button type="button" class="al-botao" data-a="catx-editar" data-id="${x.id}">${IC_ABAC.lapis}Editar categoria</button><button type="button" class="al-botao-ouro" data-a="curso-novo-cat" data-id="${x.id}">${IC_ABAC.mais}Novo curso</button></div>
      </div>
      ${(() => { const n = S.catItens.filter((y) => y.cat === x.id && y.tipo === "curso").length; return `<div class="ax-cursos-rot"><span class="ax-cursos-chip">${IC_CUR.camadas}Cursos<b>${n}</b></span><span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="cursos-da-cat" aria-label="O que são estes cursos" aria-expanded="${ui.ajuda === "cursos-da-cat"}">?</button>${ui.ajuda === "cursos-da-cat" ? `<span class="ajuda-pop esq aba-pop" role="tooltip"><b>Cursos</b><span>Abaixo estão os cursos do botão ${h(k?.nome || "")}, categoria ${h(x.nome)}. Clique num curso para gerenciar os módulos e as aulas dele.</span></span>` : ""}</span></div>`; })()}
      ${telaCursos(false, x.id)}
      ${(() => { const soltos = itensDe(x.id).filter((it) => it.tipo !== "curso"); return soltos.length ? `<h3 class="ab-sub" style="margin-left:0">Módulos e aulas nesta categoria</h3><div class="cx-itens">${soltos.map((it) => `<div class="cx-item"><span class="cx-tipo">${it.tipo === "modulo" ? "Módulo" : "Aula"}</span><b>${h(nomeItem(it.tipo, it.item) || "(apagado)")}</b>${it.tipo === "aula" ? `<button type="button" class="al-botao" data-a="abrir-aula" data-id="${it.item}">Abrir</button>` : ""}</div>`).join("")}</div>` : ""; })()}
      ${ui.catxEditar ? editarCatAba() : ""}
    </section>`;
  }
  const ICONE_ABA: Record<string, string> = { presentes: "Presente", livro: "Livro", material: "Documento", modulos: "Grade", trofeu: "Troféu", coroa: "Coroa" };
  function editarAba() {
    const k = cat(ui.catEditar!); if (!k) { ui.catEditar = null; return ""; }
    const img = previas["cat-" + k.id] || capaCat(k), jor = curso(S.config.jornada)?.cat || "";
    return `
      <div class="aa-fundo dois" data-a="cat-fechar-editar"></div>
      <aside class="aa-painel largo cat-painel" role="dialog" aria-modal="true" aria-label="Editar botão">
        <header class="cat-painel-cab"><h2>Editar botão</h2><button type="button" class="aa-fechar" data-a="cat-fechar-editar" aria-label="Fechar">${xis}</button></header>
        <form data-f="cat-salvar" data-id="${k.id}" class="aa-corpo cat-form" data-rolagem="cat-${k.id}">
          <div class="cat-capa ab-capa-q">${img ? `<img src="${h(img)}" alt="" onerror="this.remove()" />` : ""}<button type="button" class="cat-capa-btn" data-a="cat-imagem">${img ? "Alterar imagem" : "Adicionar imagem"}</button></div>
          <label class="cat-campo"><span>Nome do botão</span><input id="catNome" class="campo" name="nome" value="${h(k.nome)}" required maxlength="60" /></label>
          <label class="cat-campo"><span>Descrição (opcional)</span><textarea class="campo" name="descricao" rows="2" maxlength="200">${h(k.descricao)}</textarea></label>
          <div class="cat-vis-linha"><span>Status</span>${seletorEstado("cat", k.id, estado3(k.pub, !k.visivel), true)}</div>
          ${k.id === jor ? `<p class="cat-aviso-aba">Botão da mentoria: no app, aparece como Início e Módulos.</p>` : `<label class="cat-campo"><span>Ícone no menu do app</span><select class="campo" name="icone">${Object.entries(ICONE_ABA).map(([v2, nm]) => `<option value="${v2}" ${v2 === k.icone ? "selected" : ""}>${nm}</option>`).join("")}</select></label>`}
          <div class="cat-rodape">
            <button type="button" class="al-botao cat-remover" data-a="cat-remover" data-id="${k.id}">${IC_CAT.lixo}Remover botão</button>
            <button class="al-botao-ouro">Salvar alterações</button>
          </div>
        </form>
      </aside>`;
  }
  function telaAbasCat(todas: boolean, filtroCat: string, daAba: Curso[], filtroProd: string, _lista: Curso[], _cartao: (c: Curso) => string, vista: string, ordem: string) {
    const aba = cat(filtroCat), prod = curso(filtroProd);
    const pub = !!aba && aba.pub, ajuda = (key: string, tit: string, txt: string) => `<span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="${key}" aria-label="${h(tit)}" aria-expanded="${ui.ajuda === key}">?</button>${ui.ajuda === key ? `<span class="ajuda-pop esq aba-pop" role="tooltip"><b>${h(tit)}</b>${txt}</span>` : ""}</span>`;
    const niveis = `<span class="aba-niveis"><i>1</i><b>Botão do app</b> no menu do app (ex.: Presentes)<br /><i>2</i><b>Categoria</b> dentro do botão (ex.: E-books)<br /><i>3</i><b>Cursos e conteúdos</b> dentro da categoria, com os módulos e as aulas</span>`;
    const kb = aba ? `<span class="est3 kb"><button type="button" class="ac-ic" data-a="estado-menu" data-v="kb-aba:${aba.id}" aria-haspopup="menu" aria-expanded="${ui.estMenu === "kb-aba:" + aba.id}" aria-label="Mais opções do botão">${IC_ABAC.pontos}</button>${ui.estMenu === "kb-aba:" + aba.id ? `<span class="est3-menu kb-menu" role="menu">
        <button type="button" role="menuitem" data-a="aba-ren" data-id="${aba.id}">Renomear aba</button>
        <button type="button" role="menuitem" data-a="estado-set" data-v="cat:${aba.id}:${!aba.visivel ? "ativo" : "bloqueado"}">${!aba.visivel ? "Desbloquear botão" : "Bloquear botão (aparece com cadeado)"}</button>
        <button type="button" role="menuitem" data-a="cs-ver-aluna">Ver na área da aluna</button>
        <span class="kb-sep"></span>
        <button type="button" role="menuitem" class="perigo" data-a="cat-remover" data-id="${aba.id}">Excluir botão</button>
      </span>` : ""}</span>` : "";
    return `
    <section class="tela ativa cur ac">
      <div class="ac-abas" role="group" aria-label="Botões do app">
        <span class="ac-rot">Botões do app:</span>
        <button type="button" class="ac-aba" data-a="lay-aba" data-v="*" aria-pressed="${todas}">${IC_ABAC.todas}Todos<span>${S.cursos.length}</span></button>
        ${S.cats.map((k) => `<button type="button" class="ac-aba" data-a="lay-aba" data-v="${k.id}" aria-pressed="${!todas && k.id === filtroCat}">${icDaAba(k)}${h(k.nome)}<span>${S.cursos.filter((c) => c.cat === k.id).length}</span></button>`).join("")}
        ${ui.abaNova ? `<form data-f="cat-add" class="cur-aba-nova"><input id="abaNovaNome" class="campo" name="nome" placeholder="Nome do botão" maxlength="30" required aria-label="Nome do novo botão" /><button class="al-botao-ouro">Criar</button><button type="button" class="al-botao" data-a="aba-nova-fechar">Cancelar</button></form>`
          : `<button type="button" class="ac-aba" data-a="aba-nova-abrir">${IC_ABAC.mais}Novo botão</button>`}
      </div>
      <div class="ac-painel">
        <div class="ac-topo">
          <span class="ac-topo-ic">${aba ? icDaAba(aba) : IC_ABAC.todas}</span>
          <div class="ac-topo-txt">
            ${aba && ui.abaRen === aba.id ? `<form data-f="aba-renomear" data-id="${aba.id}" class="ac-ren"><input id="abaRenNome" class="campo" name="nome" value="${h(aba.nome)}" maxlength="30" required aria-label="Nome do botão" /><button class="al-botao-ouro">Salvar</button><button type="button" class="al-botao" data-a="aba-ren" data-id="">Cancelar</button></form>`
              : `<h2>${aba ? "Botão: " + h(aba.nome) : "Todos os botões"}${aba ? `<button type="button" class="ac-lapis" data-a="aba-ren" data-id="${aba.id}" aria-label="Renomear o botão">${IC_ABAC.lapis}</button>` : ""}</h2>`}
            <p>${aba ? (aba.id === curso(S.config.jornada)?.cat ? "Este botão aparece no aplicativo como Início e Módulos, com a categoria abaixo." : "Este botão aparece no aplicativo com as categorias abaixo.") : "Todas as categorias, de todos os botões do app."}${aba && !aba.visivel ? " Está bloqueada: aparece com cadeado." : ""}</p>
          </div>
          ${aba ? `<button type="button" class="ac-chave" role="switch" aria-checked="${pub}" data-a="estado-set" data-v="cat:${aba.id}:${pub ? "desativado" : "ativo"}" title="${pub ? "Ocultar o botão do app" : "Mostrar o botão no app"}"><i></i>${pub ? "Ativa" : "Oculta"}</button>${kb}` : ""}
          <button type="button" class="al-botao-ouro" data-a="cat-criar" data-id="${aba ? aba.id : S.cats[0]?.id || ""}">${IC_ABAC.mais}Nova categoria</button>
        </div>
        <div class="ac-cats">
          <div class="ac-abas ac-catbtns" role="group" aria-label="Categorias deste botão">
            <span class="ac-rot">Categorias: ${ajuda("o-que-e-categoria", "O que é uma categoria", `<span>A categoria fica dentro de um botão do app. No app, aparece como um cartão dentro desse botão.</span>${niveis}<em>O que fazer: clique numa categoria para ver e editar; arraste o botão para mudar a ordem.</em>`)}</span>
            ${daAba.map((c) => { const img = capaSite(c.capa); return `<button type="button" class="ac-aba ac-catbtn" data-a="lay-cat" data-v="${c.id}" aria-pressed="${c.id === filtroProd}" draggable="true" data-arrasta="${c.id}"><span class="ac-catbtn-img">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</span>${h(c.nome)}${todas ? `<small>${h(cat(c.cat)?.nome || "")}</small>` : ""}</button>`; }).join("") || `<span class="ac-nada">Nenhuma categoria neste botão ainda.</span>`}
          </div>
        </div>
      </div>
      ${prod ? (() => { const c = prod; const img = capaSite(c.capa); const dias = c.criado ? diasEntre(diaDe(c.criado), hoje()) : -1; return `
      <div class="ac-sel">
        <div class="ac-sel-card">
          <p class="ac-sel-rot">Categoria</p>
          <article class="cur-card ac-catcard" draggable="true" data-arrasta="${c.id}">
              <button type="button" class="cur-capa" data-a="lay-cat" data-v="${c.id}" aria-label="Ver os cursos de ${h(c.nome)}">${img ? `<img src="${h(img)}" alt="" loading="lazy" onerror="this.remove()" />` : `<span class="cur-sem-capa">Sem imagem</span>`}<span class="ac-catcard-alca" title="Arraste para mudar a ordem">${IC_ABAC.alca}</span></button>
              <div class="cur-corpo">
                <button type="button" class="cur-tit" data-a="lay-cat" data-v="${c.id}" title="${h(c.nome)}">${h(c.nome)}</button>
                <div class="cur-linha cur-linha-est">${IC_CUR.pasta}<em>Botão do app:</em><b>${h(cat(c.cat)?.nome || "Sem botão")}</b>${seletorEstado("curso", c.id, estado3(c.visivel, c.bloq), false, true)}</div>
                <div class="cur-stats ac-catcard-stats">
                  <span>${IC_CUR.pasta}<b>0</b><em>cursos</em></span>
                  <span>${IC_CUR.camadas}<b>${c.modulos.length}</b><em>${c.modulos.length === 1 ? "módulo" : "módulos"}</em></span>
                  <span>${IC_CUR.cal}<b>${c.criado ? br(diaDe(c.criado)) : "—"}</b><em>${dias < 0 ? "" : dias === 0 ? "Criada hoje" : "Criada há " + dias + (dias === 1 ? " dia" : " dias")}</em></span>
                </div>
                <div class="cur-botoes"><button type="button" class="al-botao ac-catcard-ed" data-a="abrir-curso" data-id="${c.id}" data-v="config">${IC_ABAC.lapis}Editar</button></div>
              </div>
            </article>
        </div>
        <div class="ac-sel-cursos">
      <div class="ac-cursos-cab">
        <div><h2>Cursos e conteúdos da categoria: ${h(prod.nome)} ${ajuda("o-que-e-curso", "Cursos e conteúdos", `<span>O que a aluna abre dentro da categoria: os módulos e as aulas.</span>${niveis}`)}</h2><p>Gerencie os cursos e conteúdos que aparecem nesta categoria.</p></div>
        <label class="cur-busca">${IC_CUR.lupa}<input class="campo" id="cursoBusca" data-curso-busca value="${h(ui.cursoBusca || "")}" placeholder="Buscar curso..." aria-label="Buscar curso" /></label>
        <select class="campo cur-ordem" data-curso-ordem aria-label="Ordem">${[["categorias", "Ordem da área de membros"], ["recentes", "Mais recentes"], ["nome", "Nome (A–Z)"]].map(([v, t]) => `<option value="${v}" ${ordem === v ? "selected" : ""}>${t}</option>`).join("")}</select>
        <span class="cur-vista" role="group" aria-label="Forma de ver"><button type="button" data-a="cur-vista" data-v="grade" aria-pressed="${vista === "grade"}" aria-label="Em grade">${IC_CUR.grade}</button><button type="button" data-a="cur-vista" data-v="lista" aria-pressed="${vista === "lista"}" aria-label="Em lista">${IC_CUR.lista}</button></span>
      </div>
      <div class="vazio ac-sem-cursos">Nenhum curso nesta categoria ainda. Os cursos e conteúdos de ${h(prod.nome)} vão aparecer aqui.</div>
        </div>
      </div>`; })() : ""}
    </section>`;
  }
  /*
   * Cursos e conteúdos (todos os cursos) e Abas / Layout (as abas da área
   * de membros — Mentoria, Presentes… — cada uma com os cursos dela).
   */
  function telaCursos(abas = false, soCatAba = "") {
    const q = norm(ui.cursoBusca || "").trim();
    const ordem = ui.cursoOrdem || "categorias";
    // Botões do app e Categorias: "*" = todas as abas; os produtos da aba são as categorias dela (Mestres espirituais, E-books…).
    const todas = abas && ui.layAba === "*";
    const filtroCat = abas && !todas ? (cat(ui.layAba) ? ui.layAba : S.cats.find((k) => k.id !== curso(S.config.jornada)?.cat)?.id || S.cats[0]?.id || "") : "";
    const daAba = abas ? S.cursos.filter((c) => todas || c.cat === filtroCat).sort((x, y) => S.cats.findIndex((k) => k.id === x.cat) - S.cats.findIndex((k) => k.id === y.cat) || S.cursos.indexOf(x) - S.cursos.indexOf(y)) : [];
    const filtroProd = abas ? (daAba.some((c) => c.id === ui.layCat) ? ui.layCat : daAba[0]?.id || "-") : "";
    // Padrão: a mesma ordem que a aluna vê (categoria, depois o curso dentro dela).
    const posCat = (c: Curso) => { const i = S.cats.findIndex((k) => k.id === c.cat); return i < 0 ? 999 : i; };
    const lista = S.cursos.filter((c) => (!soCatAba || S.catItens.some((x) => x.cat === soCatAba && x.tipo === "curso" && x.item === c.id)) && (!filtroCat || c.cat === filtroCat) && (!filtroProd || c.id === filtroProd) && (!q || casa(q, c.nome + " " + (cat(c.cat)?.nome || ""))))
      .sort((x, y) => ordem === "nome" ? x.nome.localeCompare(y.nome) : ordem === "recentes" ? (y.criado || "").localeCompare(x.criado || "")
        : posCat(x) - posCat(y) || S.cursos.indexOf(x) - S.cursos.indexOf(y));
    const vista = ui.cursoVista || "grade";
    const cartao = (c: Curso) => {
      const n = numerosCurso(c), k = cat(c.cat);
      const capa = capaSite(c.capa);
      return `
        <article class="cur-card${cls3(estado3(c.visivel, c.bloq))}">
          <button type="button" class="cur-capa" data-a="abrir-curso" data-id="${c.id}" aria-label="Abrir ${h(c.nome)}">${capa ? `<img src="${h(capa)}" alt="" loading="lazy" onerror="this.remove()" />` : `<span class="cur-sem-capa">Sem imagem</span>`}${selo3(estado3(c.visivel, c.bloq))}</button>
          <span class="cur-menu"><button type="button" class="cur-mais" data-a="cur-menu" data-id="${c.id}" aria-label="Opções de ${h(c.nome)}" aria-expanded="${ui.curMenu === c.id}">⋮</button>${ui.curMenu === c.id ? `<span class="eng-menu-pop" role="menu">
            <button role="menuitem" data-a="abrir-curso" data-id="${c.id}" data-v="visao">Visão geral</button>
            <button role="menuitem" data-a="abrir-curso" data-id="${c.id}" data-v="modulos">Módulos e aulas</button>
            <button role="menuitem" data-a="abrir-curso" data-id="${c.id}" data-v="config">Editar</button>
          </span>` : ""}</span>
          <div class="cur-corpo">
            <button type="button" class="cur-tit" data-a="abrir-curso" data-id="${c.id}" title="${h(c.nome)}">${h(c.nome)}</button>
            <div class="cur-linha cur-linha-aba">${icDaAbaCurso(c)}<em>Botão do app:</em><b>${h([...new Set(S.catItens.filter((x) => x.tipo === "curso" && x.item === c.id).map((x) => cat(catAba(x.cat)?.aba ?? "")?.nome).filter(Boolean))].join(", ") || k?.nome || "Sem botão")}</b></div>
            <div class="cur-linha cur-linha-est">${IC_CUR.pasta}<em>Categoria:</em><b title="Botão ${h(k?.nome || "—")}">${h(S.catItens.filter((x) => x.tipo === "curso" && x.item === c.id).map((x) => catAba(x.cat)?.nome).filter(Boolean).join(", ") || "Sem categoria")}</b>${seletorEstado("curso", c.id, estado3(c.visivel, c.bloq))}</div>
            <div class="cur-stats">
              <span>${IC_CUR.pessoas}<b>${n.alunas}</b><em>${n.alunas === 1 ? "aluna ativa" : "alunas ativas"}</em></span>
              <span>${IC_CUR.camadas}<b>${c.modulos.length}</b><em>${c.modulos.length === 1 ? "módulo" : "módulos"}</em></span>
              <span>${IC_CURSO.play}<b>${totalAulas(c)}</b><em>${totalAulas(c) === 1 ? "aula" : "aulas"}</em></span>
              <span>${IC_CUR.cal}<b>${c.criado ? br(diaDe(c.criado)) : "—"}</b><em>${c.criado ? (diasEntre(diaDe(c.criado), hoje()) === 0 ? "Criado hoje" : "Criado há " + diasEntre(diaDe(c.criado), hoje()) + (diasEntre(diaDe(c.criado), hoje()) === 1 ? " dia" : " dias")) : ""}</em></span>
            </div>
            <div class="cur-botoes"><button type="button" class="al-botao-ouro" data-a="abrir-curso" data-id="${c.id}" data-v="visao">${IC_OLHO_C}Visão geral</button><button type="button" class="al-botao" data-a="abrir-curso" data-id="${c.id}" data-v="config">${IC_CURSO.lapis}Editar</button></div>
          </div>
        </article>`;
    };
    if (abas) return telaAbasCat(todas, filtroCat, daAba, filtroProd, lista, cartao, vista, ordem);
    return `
    <section class="tela ativa cur">
      <div class="cur-barra-topo">
        <p class="cur-sub">${soCatAba ? "" : abas ? "Escolha o botão e a categoria. Clique numa categoria para gerenciar o conteúdo dela." : "Todos os cursos cadastrados. Clique em um curso para gerenciar seus módulos e conteúdos."}</p>
        <label class="cur-busca">${IC_CUR.lupa}<input class="campo" id="cursoBusca" data-curso-busca value="${h(ui.cursoBusca || "")}" placeholder="${abas ? "Buscar categoria..." : "Buscar curso..."}" aria-label="${abas ? "Buscar categoria" : "Buscar curso"}" /></label>
        <select class="campo cur-ordem" data-curso-ordem aria-label="Ordem">${[["categorias", "Ordem da área de membros"], ["recentes", "Mais recentes"], ["nome", "Nome (A–Z)"]].map(([v, t]) => `<option value="${v}" ${ordem === v ? "selected" : ""}>${t}</option>`).join("")}</select>
        <span class="cur-vista" role="group" aria-label="Forma de ver"><button type="button" data-a="cur-vista" data-v="grade" aria-pressed="${vista === "grade"}" aria-label="Em grade">${IC_CUR.grade}</button><button type="button" data-a="cur-vista" data-v="lista" aria-pressed="${vista === "lista"}" aria-label="Em lista">${IC_CUR.lista}</button></span>
      </div>
      ${abas ? `<div class="cur-cats" role="group" aria-label="Botões do app">
        <span class="cur-cats-rot">Botões do app: <span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="o-que-e-aba" aria-label="O que é um botão do app" aria-expanded="${ui.ajuda === "o-que-e-aba"}">?</button>${ui.ajuda === "o-que-e-aba" ? `<span class="ajuda-pop esq aba-pop" role="tooltip"><b>O que é um botão do app</b><span>A aba é o primeiro nível da área de membros. Ela aparece no menu da aluna, ao lado de Início e Perfil: no celular, embaixo da tela; no computador, no alto.</span><span class="aba-niveis"><i>1</i><b>Botão do app</b> no menu da área de membros (ex.: Presentes)<br /><i>2</i><b>Categoria</b> dentro da aba<br /><i>3</i><b>Cursos</b> dentro da categoria, com os módulos e as aulas</span><em>O que fazer: clique numa aba para ver o que tem dentro dela, ou em Criar aba para colocar uma nova no menu.</em></span>` : ""}</span></span>
        ${S.cats.map((k) => [k.id, k.nome, S.cursos.filter((c) => c.cat === k.id).length] as [string, string, number]).map(([id, nome, n]) => `<button type="button" class="cur-cat" data-a="lay-aba" data-v="${id}" aria-pressed="${filtroCat === id}">${h(nome)}<span>${n}</span></button>`).join("")}
        ${ui.abaNova ? `<form data-f="cat-add" class="cur-aba-nova"><input id="abaNovaNome" class="campo" name="nome" placeholder="Nome do botão" maxlength="30" required aria-label="Nome do novo botão" /><button class="al-botao-ouro">Criar</button><button type="button" class="al-botao" data-a="aba-nova-fechar">Cancelar</button></form>`
          : `<button type="button" class="al-botao cur-aba-criar" data-a="aba-nova-abrir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Criar aba</button>`}
      </div>
      <div class="cur-cats cur-cats2" role="group" aria-label="Categorias do botão ${h(cat(filtroCat)?.nome || "")}">
        <span class="cur-cats-rot">Categorias: <span class="ajuda"><button type="button" class="ajuda-btn" data-a="ajuda" data-v="o-que-e-categoria" aria-label="O que é uma categoria" aria-expanded="${ui.ajuda === "o-que-e-categoria"}">?</button>${ui.ajuda === "o-que-e-categoria" ? `<span class="ajuda-pop esq aba-pop" role="tooltip"><b>O que é uma categoria</b><span>A categoria é o segundo nível: fica dentro de uma aba. Na área de membros, aparece como um botão e um cartão dentro do botão (ex.: na aba Presentes, as categorias Mestres espirituais, Documentários, E-books…).</span><span class="aba-niveis"><i>1</i><b>Botão do app</b> ${h(cat(filtroCat)?.nome || "")}<br /><i>2</i><b>Categoria</b> dentro da aba<br /><i>3</i><b>Cursos</b> dentro da categoria</span><em>O que fazer: clique numa categoria para ver só ela, ou em Criar categoria para colocar uma nova nesta aba.</em></span>` : ""}</span></span>
        <button type="button" class="cur-cat" data-a="lay-cat" data-v="" aria-pressed="${!filtroProd}">Todas<span>${daAba.length}</span></button>
        ${daAba.map((c) => `<button type="button" class="cur-cat" data-a="lay-cat" data-v="${c.id}" aria-pressed="${filtroProd === c.id}">${h(c.nome)}</button>`).join("")}
        <button type="button" class="al-botao cur-aba-criar" data-a="cat-criar" data-id="${filtroCat}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Criar categoria</button>
      </div>` : ""}
      ${lista.length ? `<div class="cur-grade${vista === "lista" ? " em-lista" : ""}">${lista.map(cartao).join("")}</div>` : `<div class="vazio">${q ? "Nenhum curso encontrado." : "Nenhum curso ainda. Crie o primeiro."}</div>`}
    </section>`;
  }


  /*
   * Uma frase direta para cada campo: o que vai ali e onde a aluna vê.
   * Fica dentro do "?" amarelo ao lado do nome do campo.
   */
  const AJ = {
    nome: "Aqui você coloca o nome do curso. É assim que a aluna vê o curso chamado na área de membros.",
    cat: "Escolha em qual categoria o curso fica. A categoria está dentro de um botão do app (ex.: botão Presentes › categoria E-books).",
    vis: "Visível: a aluna vê o curso. Oculto: fica escondido enquanto você monta.",
    desc: "Aqui você escreve uma ou duas frases apresentando o curso. A aluna lê isso na página do curso, embaixo do nome.",
    fund: "Anotação só da equipe: para quem é o curso e o que ele promete. A aluna não vê.",
    aviso: "Recado que aparece no fim de todas as aulas deste curso (ex.: \"Tenha caderno e caneta\"). Vazio, não aparece nada.",
    botoes: "Salvar grava as mudanças. Cancelar desfaz o que você digitou. Remover apaga o curso inteiro, com módulos e aulas, sem volta.",
    conteudo: "Aqui ficam os módulos e as aulas do curso, na ordem em que a aluna vê. ⌄ mostra as aulas · Editar muda o nome · Bloquear para todas fecha o módulo para todas as alunas · ↑ ↓ mudam a ordem.",
    aulas: "Abrir: coloca vídeo, capa e texto da aula · Liberar para todas: abre a aula para todo mundo · Bloquear: fecha para todo mundo · ↑ ↓ mudam a ordem.",
    addMod: "Escreva o nome do novo módulo. Ele entra no fim da lista.",
    rotIni: "Só no curso da mentoria: o texto pequeno em cima do bloco da mentoria, no Início da aluna (ex.: SUA MENTORIA). Vazio, não aparece.",
    nomeIni: "Só no curso da mentoria: o nome grande do bloco da mentoria, no Início da aluna (ex.: Bênçãos Ilimitadas). Vazio, não aparece.",
    numMod: "A aluna vê o nome antes do número (Módulo, Documentário, Frequência…), o número e o nome do módulo. O número vai de 0 a 999, não repete no mesmo curso, e a ordem segue o número. Para mudar, clique em Editar no módulo.",
    numAula: "A aluna vê o nome antes do número (Aula, Episódio…), o número e o nome da aula. O número vai de 0 a 999, não repete no mesmo módulo, e a ordem segue o número. Para mudar o nome antes do número ou o número, clique em Editar na aula.",
    nomeMod: "O nome do módulo que a aluna vê depois do número. Ex.: Boas-vindas e diagnóstico.",
    modCriado: "A data que aparece como criação do módulo. Deixe como está se não quiser mudar.",
    nomeAula: "O nome da aula que a aluna vê depois do número.",
    tipoAula: "Vídeo: o link do Cloudflare Stream. Áudio: a aluna ouve com a capa da aula parada na tela. PDF (e-book): a aluna lê o PDF dentro da área; abrir o PDF conclui a aula.",
    arquivoAula: "Escolha o arquivo do seu computador. Ele vai para o depósito fechado e só abre para quem tem acesso à aula.",
    extraNome: "O nome do botão que a aluna vê para abrir este conteúdo.",
    extraArquivo: "Escolha o arquivo do seu computador; ele vai para o depósito e o caminho aparece aqui.",
    liberaAula: "Antes desta data a aula fica fechada para todas as alunas (aparece \"Libera em breve\"). Vazio: vale só a liberação de cada aluna.",
    statusAula: "Ativa: aparece e abre para quem tem acesso. Bloqueada: aparece, mas não abre. Oculta: não aparece para a aluna. Muda na hora, ao escolher.",
    listaMods: "Cada linha mostra o nome antes do número (Módulo, Documentário…), o número e o nome do módulo; nas aulas, o mesmo (Aula, Episódio…). É assim que a aluna vê. Para mudar, clique no lápis do módulo ou em Editar na aula.",
    botaoEbook: "O texto do botão que abre o PDF completo dentro da área. Ex.: Ler ebook completo.",
    op2: "Mais botões na tela do e-book. Cada um tem nome e cor e abre o que você escolher: um texto escrito aqui, outro PDF, ou um vídeo ou áudio com a tela completa (capa, descrição, instruções e conteúdo extra).",
    statusCurso: "Ativo: aparece e abre para quem tem acesso. Bloqueado: aparece, mas não abre. Oculto: não aparece para a aluna. Muda na hora, ao escolher.",
    liberaCurso: "Antes desta data nenhuma aula do curso abre para ninguém (aparece \"Libera em breve\"). Vazio: vale a liberação dos módulos, das aulas e de cada aluna.",
    statusMod: "Ativo: aparece e abre para quem tem acesso. Bloqueado: aparece, mas não abre. Oculto: não aparece para a aluna. Muda na hora, ao escolher.",
    liberaMod: "Antes desta data nenhuma aula do módulo abre para ninguém (aparece \"Libera em breve\"). Vazio: vale a liberação de cada aula e de cada aluna.",
    rotMod: "A palavra que aparece antes do número para a aluna. Escreveu Módulo, ela vê \"Módulo 0\"; escreveu Documentário, vê \"Documentário 0\".",
    rotAula: "A palavra antes do número desta aula. Escreveu Aula, a aluna vê \"Aula 1\"; escreveu Episódio, vê \"Episódio 1\".",
    modDesc: "A descrição do módulo. Aparece no Início (\"Comece por aqui\", quando é o primeiro módulo) e na página do módulo.",
    capaCurso: "A capa do curso: aparece no cartão dele em Cursos e conteúdos e, nos presentes, no cartão da aba Presentes da aluna. Imagem deitada (16:9).",
    modCapa: "A capa em pé do módulo, que aparece no topo da página do módulo e na aba Módulos.",
    modCor: "A cor do contorno, do brilho e da linha na página do módulo. Os botões continuam dourados.",
    modVivo: "Marque se o módulo tem aula ao vivo. A data aparece na página do módulo; sem data, aparece \"data a confirmar\". Desmarcado, essa parte some.",
    modCapaH: "A capa deitada (16:9) do módulo, usada no \"Comece por aqui\" do Início quando ele é o primeiro módulo do curso. A capa em pé continua a mesma.",
    video: "Cole aqui o link do vídeo da aula (Cloudflare Stream). É o vídeo que a aluna assiste. Vazio, ela vê \"Aula será adicionada em breve\".",
    capa: "A imagem da aula que a aluna vê na lista de aulas e antes de dar o play. Clique em Escolher imagem e o caminho se preenche sozinho.",
    texto: "O texto que a aluna lê no botão \"Sobre a aula\", embaixo do vídeo. Linha em branco separa parágrafo; *asteriscos* deixam em negrito.",
    resumo: "Os pontos principais da aula, um por linha. A aluna vê na aba Resumo.",
    exercicio: "As instruções da aula. Primeira linha é o título, depois o texto. A aluna vê no botão Instruções, embaixo do vídeo.",
    extras: "Materiais a mais da aula. O primeiro do tipo \"PDF / e-book\" vira o botão PDF embaixo do vídeo e abre dentro do app; sem PDF, o botão não aparece. Os outros viram botões no fim de \"Sobre a aula\".",
  };
  // Bolinha amarela com "?" preto; a frase abre ao tocar. <details> nativo:
  // abre e fecha sem redesenhar a tela, então nada digitado se perde.
  const dicaCampo = (txt: string) => `<details class="ajuda-amarela" onclick="event.stopPropagation()"><summary aria-label="Ajuda">?</summary><span class="ajuda-amarela-txt">${txt}</span></details>`;

  /* ---------- CURSO ABERTO ---------- */
  /*
   * Página do curso (referência aprovada): capa e números no alto e as
   * abas Visão geral · Módulos e aulas · Alunas · Configurações ·
   * Relatórios. Tudo sai do que o painel já lê do banco.
   */
  const IC_EXTERNO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/></svg>`;
  const IC_IMG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/></svg>`;
  const mmssPainel = (s: number) => { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  type AlunaCurso = { a: Aluna; incluida: string; pct: number };
  function alunasDoCurso(c: Curso): AlunaCurso[] {
    const aulas = c.modulos.flatMap((m) => m.aulas.map((x) => x.id));
    const mods = new Set(c.modulos.map((m) => m.id)), setA = new Set(aulas);
    const out: AlunaCurso[] = [];
    for (const a of S.alunas) {
      const datas = a.concessoes.filter((k) => (k.escopo === "produto" && k.alvo === c.id) || (k.escopo === "modulo" && mods.has(k.alvo)) || (k.escopo === "aula" && setA.has(k.alvo))).map((k) => k.em).filter(Boolean).sort();
      if (!datas.length) continue;
      out.push({ a, incluida: datas[0], pct: aulas.length ? Math.round((aulas.filter((x) => a.feitas.has(x)).length / aulas.length) * 100) : 0 });
    }
    return out;
  }
  const dataHoraCurta = (iso: string) => { if (!iso) return "—"; const d = new Date(iso); const z = (n: number) => String(n).padStart(2, "0"); return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear() + " " + z(d.getHours()) + ":" + z(d.getMinutes()); };
  const statusAluna = (a: Aluna) => { const s = situacao(a); return pilula(sitInfo(s)[0], s === "ativa" ? "verde" : s === "vencendo" ? "ouro" : "vermelho"); };
  const IC_CURSO = {
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.8v6.4l5.2-3.2z"/></svg>`,
    lapis: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>`,
    voltar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`,
    mais: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  };
  const comentariosDoCurso = (c: Curso) => { const ids = new Set(c.modulos.flatMap((m) => m.aulas.map((x) => x.id))); return S.comentarios.filter((k) => ids.has(k.aula)).sort((x, y) => y.criado.localeCompare(x.criado)); };
  function comentariosCursoAba(c: Curso) {
    const todos = comentariosDoCurso(c);
    const f = (ui.csComFiltro || "moderar") as Estado;
    const n = (e: Estado) => todos.filter((k) => k.estado === e).length;
    const lista = todos.filter((k) => k.estado === f);
    return `
      <div class="cs-filtros">
        ${(["moderar", "publicado", "oculto"] as Estado[]).map((e) => `<button type="button" class="al-filtro cs-fil" data-a="cs-com-filtro" data-v="${e}" aria-pressed="${f === e}">${{ moderar: "Para moderar", publicado: "Publicados", oculto: "Ocultos" }[e]} (${n(e)})</button>`).join("")}
      </div>
      ${lista.map(cartaoComentario).join("") || `<div class="vazio">${{ moderar: "Nada esperando moderação neste curso.", publicado: "Nenhum comentário publicado neste curso.", oculto: "Nenhum comentário oculto neste curso." }[f]}</div>`}`;
  }
  function visaoGeralCurso(c: Curso, todas: AlunaCurso[]) {
    const ini = hoje().slice(0, 8) + "01";
    const ativas = todas.filter((x) => !x.a.bloqueada && !vencida(x.a));
    const antAlunas = ativas.filter((x) => diaDe(x.incluida) < ini).length;
    const aulas = c.modulos.flatMap((m, mi) => m.aulas.map((x) => ({ x, m, mi })));
    const antAulas = aulas.filter((o) => o.x.criado && diaDe(o.x.criado) < ini).length;
    const varMes = (cur: number, ant: number) => (ant && cur !== ant ? `<span class="eng-var ${cur > ant ? "bom" : "ruim"}">${cur > ant ? "▲" : "▼"} ${cur > ant ? "+" : "-"}${Math.abs(Math.round(((cur - ant) / ant) * 100))}%</span><em>em relação ao mês anterior</em>` : `<span class="eng-var neutro">–</span>`);
    const diasCriado = c.criado ? diasEntre(diaDe(c.criado), hoje()) : 0;
    const ind = (ic: string, n: string, rot: string, extra: string) => `<div class="cs-ind"><span class="eng-ind-ic">${ic}</span><span class="cs-ind-txt"><b>${n}</b><span>${rot}</span>${extra}</span></div>`;
    const ultimas = todas.slice().sort((x, y) => y.incluida.localeCompare(x.incluida)).slice(0, 5);
    const novasAulas = aulas.filter((o) => o.x.criado).sort((x, y) => y.x.criado.localeCompare(x.x.criado)).slice(0, 5);
    const agora = new Date().toISOString();
    const abriu = new Map<string, string>();
    for (const a of S.alunas) for (const k of a.concessoes) if (k.escopo === "aula") { const q = k.abre || k.em; if (q && q <= agora && (!abriu.has(k.alvo) || q > abriu.get(k.alvo)!)) abriu.set(k.alvo, q); }
    const liberadas = aulas.filter((o) => abriu.has(o.x.id)).sort((x, y) => abriu.get(y.x.id)!.localeCompare(abriu.get(x.x.id)!)).slice(0, 5);
    const linhaAula = (o: { x: Aula; m: Modulo; mi: number }, quando: string) => `
      <button type="button" class="cs-aula" data-a="abrir-aula" data-id="${o.x.id}"><span class="cs-mini">${capaSite(o.x.capa) ? `<img src="${h(capaSite(o.x.capa))}" alt="" loading="lazy" onerror="this.remove()" />` : ""}<i>${IC_CURSO.play}</i></span><span class="cs-aula-txt"><b>${h(o.x.nome)}</b><span>Módulo ${numModulo(c, o.mi)}${o.x.duracao ? " · " + mmssPainel(o.x.duracao) : ""}</span></span><span class="cs-quando">${dataHoraCurta(quando)}</span></button>`;
    const verTodas = (aba: string, t = "Ver todas") => `<button type="button" class="link cs-ver" data-a="curso-aba" data-v="${aba}">${t} ${IC_CUR.seta}</button>`;
    // Últimos comentários: período e módulo.
    const per = ui.csComPer || "hoje", modF = ui.csComMod || "";
    const hj = hoje(), menos = (n: number) => diaDe(new Date(Date.now() - n * 864e5));
    const aulaMod = new Map<string, string>(); c.modulos.forEach((m) => m.aulas.forEach((x) => aulaMod.set(x.id, m.id)));
    const coms = comentariosDoCurso(c).filter((k) => {
      const d = diaDe(k.criado);
      if (per === "hoje" && d !== hj) return false;
      if (per === "ontem" && d !== menos(1)) return false;
      if (per === "7" && d < menos(6)) return false;
      if (per === "30" && d < menos(29)) return false;
      return !modF || aulaMod.get(k.aula) === modF;
    });
    const IC_OK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`, IC_BAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z"/></svg>`, IC_OLHO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const estado = (k: Comentario) => k.estado === "moderar" ? pilula("Pendente", "ouro") : k.estado === "publicado" ? pilula("Aprovado", "verde") : pilula("Oculto", "neutro");
    return `
      <div class="cs-inds">
        ${ind(IC_CUR.pessoas, String(ativas.length), "Alunas ativas", varMes(ativas.length, antAlunas))}
        ${ind(IC_CUR.camadas, String(c.modulos.length), "Módulos", `<span class="eng-var neutro">–</span>`)}
        ${ind(IC_CURSO.play, String(aulas.length), "Aulas", varMes(aulas.length, antAulas))}
        ${ind(IC_CUR.cal, c.criado ? br(diaDe(c.criado)) : "—", "Data de criação", c.criado ? `<em>Criado há ${diasCriado} ${diasCriado === 1 ? "dia" : "dias"}</em>` : "")}
      </div>
      <div class="cs-tres">
        <section class="cs-cartao">
          <header><h3>Últimas alunas adicionadas</h3>${verTodas("alunas")}</header>
          <div class="cs-tabela-rola"><table class="cs-tabela cs-tabela-pq">
            <thead><tr><th>Aluna</th><th>Data de inclusão</th><th>Status</th><th></th></tr></thead>
            <tbody>${ultimas.map(({ a, incluida }) => `<tr><td><button type="button" class="cs-aluna" data-a="ficha" data-id="${a.id}">${aaAvatar(a)}<b>${h(a.nome)}</b></button></td><td>${dataHoraCurta(incluida)}</td><td>${statusAluna(a)}</td><td class="dir"><button type="button" class="eng-mais" data-a="ficha" data-id="${a.id}" aria-label="Abrir a ficha de ${h(a.nome)}">⋯</button></td></tr>`).join("") || `<tr><td colspan="4" class="cs-vazio">Nenhuma aluna neste curso ainda.</td></tr>`}</tbody>
          </table></div>
        </section>
        <section class="cs-cartao">
          <header><h3>Últimas aulas adicionadas</h3>${verTodas("modulos")}</header>
          ${novasAulas.map((o) => linhaAula(o, o.x.criado)).join("") || `<p class="ini-vazio">Nenhuma aula ainda.</p>`}
        </section>
        <section class="cs-cartao">
          <header><h3>Últimas aulas liberadas</h3>${verTodas("relatorios")}</header>
          ${liberadas.map((o) => linhaAula(o, abriu.get(o.x.id)!)).join("") || `<p class="ini-vazio">Nenhuma aula liberada ainda.</p>`}
        </section>
      </div>
      <section class="cs-cartao cs-coms">
        <header class="cs-coms-cab"><h3>Últimos comentários</h3>${verTodas("comentarios", "Ver todos")}<span style="flex:1"></span>
          <span class="cs-coms-fil">${[["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"]].map(([v, t]) => `<button type="button" class="al-filtro cs-fil" data-a="cs-com-per" data-v="${v}" aria-pressed="${per === v}">${t}</button>`).join("")}</span>
          <select class="campo cs-coms-mod" data-cs-com-mod aria-label="Módulo"><option value="">Todos os módulos</option>${c.modulos.map((m, mi) => `<option value="${m.id}" ${modF === m.id ? "selected" : ""}>Módulo ${numModulo(c, mi)}</option>`).join("")}</select>
        </header>
        <div class="cs-tabela-rola"><table class="cs-tabela">
          <thead><tr><th>Aluna</th><th>Aula</th><th>Comentário</th><th>Data</th><th>Status</th><th class="dir">Ações</th></tr></thead>
          <tbody>${coms.slice(0, 10).map((k) => `
            <tr${ui.comAlvo === k.id ? ' class="cs-alvo"' : ""}>
              <td><span class="cs-aluna">${avatarDe(k.autoraId, k.autora)}<b>${h(k.autora)}</b></span></td>
              <td class="cs-cinza">${h(localAula(k.aula))}</td>
              <td class="cs-com-prev" title="${h(k.texto)}">${h(k.texto)}</td>
              <td>${dataHoraCurta(k.criado)}</td>
              <td>${estado(k)}</td>
              <td class="dir cs-com-ic">
                <button type="button" data-a="com-publicar" data-id="${k.id}" ${k.estado === "publicado" ? "disabled" : ""} aria-label="Aprovar" title="Aprovar">${IC_OK}</button>
                <button type="button" data-a="com-responder" data-id="${k.id}" aria-label="Responder" title="Responder">${IC_BAL}</button>
                <button type="button" data-a="cs-com-ver" data-id="${k.id}" aria-label="Ver o comentário completo" title="Ver">${IC_OLHO}</button>
              </td>
            </tr>
            ${ui.respondendo === k.id ? `<tr><td colspan="6"><form data-f="com-resposta" data-id="${k.id}" class="cs-com-form">
              <textarea id="respostaCampo" class="campo" name="resposta" rows="3" placeholder="Escreva a resposta. Ela aparece para as alunas como Equipe AION." required>${h(k.resposta)}</textarea>
              <div class="acoes"><button class="al-botao-ouro">Enviar resposta</button><button type="button" class="al-botao" data-a="com-responder-cancelar">Cancelar</button></div>
            </form></td></tr>` : ""}`).join("") || `<tr><td colspan="6" class="cs-vazio">Nenhum comentário neste período.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  /* --- Módulos e aulas: uma linha por módulo; a seta abre as aulas --- */
  const IC_MOD = {
    alca: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6.5" r="1.3"/><circle cx="15" cy="6.5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17.5" r="1.3"/><circle cx="15" cy="17.5" r="1.3"/></svg>`,
    copiar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>`,
    lixo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 11v5.5M13.5 11v5.5"/></svg>`,
    seta: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  };
  /* --- Página do módulo (referência aprovada): informações e capas no alto, aulas embaixo --- */
  const IC_INFO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14.5h8"/></svg>`;
  const IC_SALVAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11.5l3 3V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z"/><path d="M8 4.5v5h7v-5M8 19.5v-6h8v6"/></svg>`;
  const IC_PLAY_C = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/></svg>`;
  const IC_EXPANDIR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/></svg>`;
  const IC_RECOLHER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 12h7M4 17h10M17 9l3 3-3 3"/></svg>`;
  function linhaAulaNova(m: Modulo, a: Aula, j: number) {
      if (editando("aula", a.id)) return `<div class="mp-aula editando">${linhaAula(m, a, j)}</div>`;
      const capa = capaSite(a.capa), mais = ui.aulaMais === a.id;
      const quando = a.criado ? dataHoraCurta(a.criado).split(" ") : ["—", ""];
      return `
        <div class="mp-aula${mais ? " aberta" : ""}${a.pub ? "" : " desativada"}${cls3(estado3(a.pub, a.acesso === "bloqueada"))}" draggable="true" data-arrasta="${a.id}">
          <div class="mp-aula-linha">
            <span class="cs-alca" title="Arraste para mudar a ordem">${IC_MOD.alca}</span>
            <button type="button" class="mp-aula-capa" data-a="abrir-aula" data-id="${a.id}" aria-label="Abrir ${h(a.nome)}">${capa ? `<img src="${h(capa)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}${selo3(estado3(a.pub, a.acesso === "bloqueada"), true)}<i>${IC_PLAY_C}</i></button>
            <span class="mp-aula-txt"><b>${h(a.rot)} ${a.num} — ${h(a.nome)}</b><span>${a.tipo === "audio" ? (a.arquivo ? "Áudio" : "Sem áudio") : a.tipo === "pdf" ? (a.arquivo ? "PDF (e-book)" : "Sem PDF") : a.video ? "Vídeo" : "Sem vídeo"}${a.duracao ? ` <i>·</i> ${Math.max(1, Math.round(a.duracao / 60))} min` : ""}</span></span>
            <span class="mp-aula-data">${IC_CUR.cal}<span>${quando[0]}<br />${quando[1] || ""}</span></span>
            ${seletorEstado("aula", a.id, estado3(a.pub, a.acesso === "bloqueada"), false, true)}
            <span class="mp-aula-acoes">
              <button type="button" class="al-botao" data-a="abrir-aula" data-id="${a.id}">${IC_CURSO.lapis}Editar</button>
              <button type="button" class="mp-ic" data-a="aula-duplicar" data-id="${a.id}" aria-label="Duplicar a aula" title="Duplicar">${IC_MOD.copiar}</button>
              <button type="button" class="mp-ic perigo" data-a="aula-remover" data-id="${a.id}" aria-label="Remover a aula" title="Remover">${IC_MOD.lixo}</button>
              <button type="button" class="mp-ic mp-seta" data-a="aula-mais" data-id="${a.id}" aria-label="${mais ? "Esconder opções" : "Mais opções"}" aria-expanded="${mais}">${IC_MOD.seta}</button>
            </span>
          </div>
          ${mais ? `<div class="mp-aula-mais">
            <button type="button" class="al-botao" data-a="abrir-aula" data-id="${a.id}">Abrir</button>
            ${botaoLiberacao(a)}
          </div>` : ""}
        </div>`;
  }
  function paginaModulo(c: Curso, m: Modulo, i: number) {
    const capaH = previas["modh-" + m.id] || capaSite(m.capaH), capaV = previas["modv-" + m.id] || capaSite(m.capa);
    const ident = h(m.rot) + " " + numModulo(c, i);
    return `
    <section class="tela ativa cs mp" data-form-de="formMod">
      <div class="mp-topo">
        <nav class="mp-trilha" aria-label="Você está em">
          <button type="button" data-a="aba" data-v="cursos">Cursos e conteúdos</button><i>›</i>
          <button type="button" data-a="mod-pagina-voltar">${h(c.nome)}</button><i>›</i>
          <b>${ident}</b>
        </nav>
        <button type="button" class="al-botao" data-a="mod-pagina-voltar">${IC_CURSO.voltar}Voltar para o curso</button>
      </div>
      <div class="mp-tit"><h2>${ident}</h2></div>
      <p class="mp-sub">${h(m.nome)}</p>

      <div class="mp-dupla">
      <form id="formMod" data-f="mod-renomear" data-id="${m.id}" class="cs-cartao mp-info">
        <div class="mp-cab"><span class="mp-cab-ic">${IC_INFO}</span><div><h3>Informações do módulo</h3><p>Edite as informações e as capas do módulo.</p></div></div>
        <div class="mp-grade">
          <div class="mp-capas">
            <span class="rotulo-ajuda mp-rot">Capa deitada (16:9) ${dicaCampo(AJ.modCapaH)}</span>
            <span class="e3-caixa${cls3(estado3(m.pub, !m.ativo))}"><span class="mp-capa-h" data-previa="modh-${m.id}">${capaH ? `<img src="${h(capaH)}" alt="" />` : ""}</span>${selo3(estado3(m.pub, !m.ativo))}</span>
            <input type="hidden" name="capaH" value="${h(m.capaH)}" />
            <span class="mp-capa-bts"><button type="button" class="al-botao" data-a="mod-capa-h" data-id="${m.id}">${IC_IMG}Alterar</button><button type="button" class="al-botao" data-a="capa-editar" data-v="modh" data-id="${m.id}">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao perigo" data-a="mod-capa-h-tirar" data-id="${m.id}">${IC_MOD.lixo}Remover</button></span>
            <span class="mp-dica">Tamanho recomendado: 1920 × 1080 px (16:9)</span>
            <span class="rotulo-ajuda mp-rot">Capa em pé (2:3) ${dicaCampo(AJ.modCapa)}</span>
            <span class="mp-pe">
              <span class="e3-caixa${cls3(estado3(m.pub, !m.ativo))}"><span class="mp-capa-v" data-previa="modv-${m.id}">${capaV ? `<img src="${h(capaV)}" alt="" />` : ""}</span>${selo3(estado3(m.pub, !m.ativo))}</span>
              <input type="hidden" name="capa" value="${h(m.capa)}" />
              <span class="mp-pe-bts"><button type="button" class="al-botao" data-a="mod-capa-v" data-id="${m.id}">${IC_IMG}Alterar</button><button type="button" class="al-botao" data-a="capa-editar" data-v="modv" data-id="${m.id}">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao perigo" data-a="mod-capa-v-tirar" data-id="${m.id}">${IC_MOD.lixo}Remover</button><span class="mp-dica">Tamanho recomendado:<br />1024 × 1536 px (2:3)</span></span>
            </span>
          </div>
          <div class="mp-campos">
            <div class="mp-linha3">
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Nome antes do número ${dicaCampo(AJ.rotMod)}</span><input class="campo" name="rotulo" value="${h(m.rot)}" maxlength="40" required /></label>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Número do módulo ${dicaCampo(AJ.numMod)}</span>${campoNumero(m.num, "Número do módulo")}</label>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Nome do módulo ${dicaCampo(AJ.nomeMod)}</span><input id="editarCampo" class="campo" name="nome" value="${ui.novoMod === m.id ? "" : h(m.nome)}" placeholder="Nome do novo módulo" required /></label>
            </div>
            <label class="grupo"><span class="rotulo-ajuda mp-rot">Descrição ${dicaCampo(AJ.modDesc)}</span><textarea class="campo" name="intro" rows="4">${h(m.intro)}</textarea></label>
            <div class="mp-linha-cor">
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Cor do módulo ${dicaCampo(AJ.modCor)}</span><input type="color" class="campo-cor" name="cor" value="${h(/^#[0-9a-f]{6}$/i.test(m.cor) ? m.cor : "#e6b85a")}" /></label>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Data de criação (opcional) ${dicaCampo(AJ.modCriado)}</span><input type="datetime-local" class="campo" name="criado" value="${h(dataLocal(m.criado))}" /></label>
            </div>
            <div class="mp-bts"><button type="button" class="al-botao" data-a="mod-pagina-voltar">Cancelar</button><button class="al-botao-ouro">${IC_SALVAR}Salvar módulo</button></div>
          </div>
        </div>
      </form>
      <div class="mp-lado">
        <section class="cs-cartao ea-config">
          <div class="mp-cab"><span class="mp-cab-ic">${IC_ENGR_M}</span><div><h3>Configurações</h3></div></div>
          <div class="mp-config">
            <div class="grupo"><span class="rotulo-ajuda mp-rot">Status do módulo ${dicaCampo(AJ.statusMod)}</span>${seletorEstado("mod", m.id, estado3(m.pub, !m.ativo), true)}</div>
            <div class="grupo"><span class="rotulo-ajuda mp-rot">Também nas categorias</span>${naCategoria("modulo", m.id)}</div>
            <label class="grupo"><span class="rotulo-ajuda mp-rot">${IC_CUR.cal}Data de liberação (opcional) ${dicaCampo(AJ.liberaMod)}</span><input type="datetime-local" class="campo" name="libera" form="formMod" value="${h(dataLocal(m.libera))}" /></label>
          </div>
          <div class="ea-lib"><span class="rotulo-ajuda mp-rot">Liberação</span>${situacaoModulo(m)}</div>
        </section>
        <section class="cs-cartao cs-rapidas">
          <h3>Ações rápidas</h3>
          <button type="button" data-a="cs-ver-aluna">${IC_OLHO_C}Ver na área da aluna</button>
          <button type="button" data-a="mod-duplicar" data-id="${m.id}">${IC_MOD.copiar}Duplicar módulo</button>
          <button type="button" data-a="cs-exportar-conteudo" data-id="${c.id}" data-mod="${m.id}">${IC_EXP_M}Exportar conteúdo</button>
          <button type="button" class="perigo" data-a="mod-remover" data-id="${m.id}">${IC_MOD.lixo}Apagar módulo</button>
        </section>
      </div>
      </div>

      <section class="cs-cartao mp-aulas">
        <div class="mp-aulas-topo">
          <div class="mp-cab"><span class="mp-cab-ic">${IC_PLAY_C}</span><div><h3>Aulas deste módulo (${m.aulas.length})</h3><p>Gerencie as aulas do ${ident}. Arraste para mudar a ordem.</p></div></div>
          <button type="button" class="al-botao-ouro" data-a="aula-add-abrir" data-id="${m.id}">${IC_CURSO.mais}Adicionar aula</button>
        </div>
        ${ui.addAula === m.id ? `
        <form data-f="aula-add" data-id="${m.id}" class="mp-add">
          <label class="cs-add-num"><span>Número</span>${campoNumero(proxNumAula(m), "Número da aula")}</label>
          <input id="novaAula" class="campo" name="nome" placeholder="Nome da nova aula" required />
          <button class="al-botao-ouro">Adicionar</button><button type="button" class="al-botao" data-a="aula-add-cancelar">Cancelar</button>
        </form>` : ""}
        <div class="mp-lista">${m.aulas.map((a, j) => linhaAulaNova(m, a, j)).join("") || `<p class="ini-vazio">Nenhuma aula neste módulo.</p>`}</div>
      </section>
    </section>`;
  }
  function modulosCurso(c: Curso) {
    const q = norm(ui.modBusca || "").trim();
    return `
      <div class="cs-mods-barra">
        <label class="cs-mods-busca">${IC_CUR.lupa}<input class="campo" type="search" id="modBusca" data-mod-busca value="${h(ui.modBusca || "")}" placeholder="Buscar módulo ou aula..." aria-label="Buscar módulo ou aula" /></label>
        <button type="button" class="al-botao" data-a="mods-expandir" data-id="${c.id}">${IC_EXPANDIR}Expandir todos</button>
        <button type="button" class="al-botao" data-a="mods-recolher">${IC_RECOLHER}Recolher todos</button>
        <span style="flex:1"></span>
        <button type="button" class="al-botao-ouro" data-a="cs-add-mod">${IC_CURSO.mais}Adicionar módulo</button>
      </div>
      <div class="cs-mods-topo"><span class="cs-nota">${p(c.modulos.length, "módulo", "módulos")} · ${p(totalAulas(c), "aula", "aulas")} · arraste pela alça para mudar a ordem ${dicaCampo(AJ.listaMods)}</span></div>
      ${ui.csAddMod ? `
      <form data-f="mod-add" data-id="${c.id}" class="cs-cartao cs-add-mod">
        <label class="cs-add-num"><span>Número</span>${campoNumero(proxNumModulo(c), "Número do módulo")}</label>
        <input id="novoModulo" class="campo" name="nome" placeholder="Nome do novo módulo" required />
        <button class="al-botao-ouro">Adicionar</button><button type="button" class="al-botao" data-a="cs-add-mod">Cancelar</button>
      </form>` : ""}
      <div class="cs-cartao cs-mods">
        ${c.modulos.map((m, i) => {
          const casaMod = !q || norm(m.nome).includes(q) || norm(m.rot + " " + m.num).includes(q);
          const aulasVis = q && !casaMod ? m.aulas.filter((a) => norm(a.nome).includes(q) || norm(a.rot + " " + a.num).includes(q)) : m.aulas;
          if (q && !casaMod && !aulasVis.length) return "";
          const aberto = ui.abertos.has(m.id) || (!!q && !casaMod);
          if (editando("mod", m.id)) return `<div class="cs-mod-edita">${blocoModulo(c, m, i)}</div>`;
          const capa = capaSite(m.capaH) || capaSite(m.capa);
          return `
          <div class="cs-mod${aberto ? " aberto" : ""}${cls3(estado3(m.pub, !m.ativo))}" draggable="true" data-arrasta="${m.id}">
            <div class="cs-mod-linha">
              <span class="cs-alca" title="Arraste para mudar a ordem">${IC_MOD.alca}</span>
              <span class="cs-mod-capa">${capa ? `<img src="${h(capa)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}${selo3(estado3(m.pub, !m.ativo))}</span>
              <span class="cs-mod-nome"><button type="button" class="cs-mod-txt" data-a="mod-abrir-fechar" data-id="${m.id}"><b>${h(m.rot)} ${numModulo(c, i)} — ${h(m.nome.charAt(0) + m.nome.slice(1).toLowerCase())}</b><span>${p(m.aulas.length, "aula", "aulas")}</span></button></span>
              ${seletorEstado("mod", m.id, estado3(m.pub, !m.ativo), true)}
              <span class="cs-mod-acoes">
                <button type="button" data-a="mod-editar" data-id="${m.id}" aria-label="Editar o módulo" title="Editar">${IC_CURSO.lapis}</button>
                <button type="button" data-a="mod-duplicar" data-id="${m.id}" aria-label="Duplicar o módulo" title="Duplicar">${IC_MOD.copiar}</button>
                <button type="button" class="perigo" data-a="mod-remover" data-id="${m.id}" aria-label="Remover o módulo" title="Remover">${IC_MOD.lixo}</button>
                <button type="button" class="cs-mod-abre" data-a="mod-abrir-fechar" data-id="${m.id}" aria-label="${aberto ? "Esconder as aulas" : "Mostrar as aulas"}" aria-expanded="${aberto}">${IC_MOD.seta}</button>
              </span>
            </div>
            ${aberto ? `<div class="cs-mod-aulas">
              <div class="mp-lista">${aulasVis.map((a) => linhaAulaNova(m, a, m.aulas.indexOf(a))).join("") || `<p class="ini-vazio">${q ? "Nenhuma aula com esse nome neste módulo." : "Nenhuma aula neste módulo."}</p>`}</div>
              ${ui.addAula === m.id ? `
                <form data-f="aula-add" data-id="${m.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
                  <label class="cs-add-num"><span>Número</span>${campoNumero(proxNumAula(m), "Número da aula")}</label>
                  <input id="novaAula" class="campo" style="flex:1 1 260px;max-width:520px" name="nome" placeholder="Nome da nova aula" required />
                  <button class="botao-neutro grande">Adicionar</button>
                  <button type="button" class="botao-neutro grande" data-a="aula-add-cancelar">Cancelar</button>
                </form>` : `<button type="button" class="al-botao cs-add-aula" data-a="aula-add-abrir" data-id="${m.id}">${IC_CURSO.mais}Adicionar aula</button>`}
            </div>` : ""}
          </div>`;
        }).join("") || `<p class="ini-vazio">${q ? "Nenhum módulo ou aula com esse nome." : "Este curso ainda não tem módulos. Clique em Adicionar módulo."}</p>`}
      </div>`;
  }

  /* --- Alunas: abas por situação, busca, exportar e páginas de 10 --- */
  const SIT_CURSO: Record<string, [string, (a: Aluna) => boolean]> = {
    todas: ["Todas", () => true],
    ativas: ["Ativas", (a) => !a.bloqueada && !vencida(a)],
    inativas: ["Inativas", (a) => a.bloqueada],
    canceladas: ["Canceladas", (a) => !a.bloqueada && vencida(a)],
  };
  function alunasCursoAba(c: Curso, todas: AlunaCurso[]) {
    const sit = ui.csSit || "todas";
    const q = norm(ui.curAlBusca || "").trim();
    const lista = todas.filter(({ a }) => SIT_CURSO[sit][1](a) && (!q || casa(q, a.nome + " " + a.login + " " + a.email, a.celular))).sort((x, y) => y.incluida.localeCompare(x.incluida));
    const porPag = ui.csPorPag || 10, pags = Math.max(1, Math.ceil(lista.length / porPag)), pag = Math.min(ui.csPag || 1, pags);
    const vis = lista.slice((pag - 1) * porPag, pag * porPag);
    const nums: (number | string)[] = []; for (let k = 1; k <= pags; k++) if (k <= 5 || k === pags || Math.abs(k - pag) <= 1) nums.push(k); else if (nums[nums.length - 1] !== "…") nums.push("…");
    return `
      <section class="cs-cartao">
        <div class="cs-filtros">
          <label class="cur-busca">${IC_CUR.lupa}<input class="campo" data-cur-al-busca value="${h(ui.curAlBusca || "")}" placeholder="Buscar aluna por nome, e-mail ou celular" aria-label="Buscar aluna" /></label>
          <span style="flex:1"></span>
          <button type="button" class="al-botao-ouro" data-a="cs-add-aluna">${IC_CURSO.mais}Adicionar aluna</button>
        </div>
        <div class="cs-filtros">
          ${Object.entries(SIT_CURSO).map(([k, [nome, f]]) => `<button type="button" class="al-filtro cs-fil" data-a="cs-sit" data-v="${k}" aria-pressed="${sit === k}">${nome} (${todas.filter((t) => f(t.a)).length})</button>`).join("")}
          <span style="flex:1"></span>
          <button type="button" class="al-botao" data-a="cur-exportar">${IC_CURSO.mais}Exportar lista</button>
        </div>
        <div class="cs-tabela-rola"><table class="cs-tabela">
          <thead><tr><th>Nome</th><th>E-mail / contato</th><th>Data de inclusão</th><th>Status</th><th class="dir">Ações</th></tr></thead>
          <tbody>${vis.map(({ a, incluida }) => `
            <tr>
              <td><button type="button" class="cs-aluna" data-a="ficha" data-id="${a.id}">${aaAvatar(a)}<b>${h(a.nome)}</b></button></td>
              <td>${h(a.email || (a.celular ? fone(a.celular) : "—"))}</td>
              <td>${dataHoraCurta(incluida)}</td>
              <td>${statusAluna(a)}</td>
              <td class="dir"><span class="eng-menu"><button type="button" class="eng-mais" data-a="cur-al-menu" data-id="${a.id}" aria-label="Opções de ${h(a.nome)}" aria-expanded="${ui.curAlMenu === a.id}">⋯</button>${ui.curAlMenu === a.id ? `<span class="eng-menu-pop" role="menu">
                <button role="menuitem" data-a="ficha" data-id="${a.id}">Abrir ficha</button>
                <button role="menuitem" data-a="liberar" data-id="${a.id}">Liberar conteúdo</button>
                <button role="menuitem" data-a="contato" data-id="${a.id}">Registrar contato</button>
              </span>` : ""}</span></td>
            </tr>`).join("") || `<tr><td colspan="5" class="cs-vazio">Nenhuma aluna encontrada.</td></tr>`}</tbody>
        </table></div>
        <div class="cs-pags">
          <span class="cs-pag-nums"><button type="button" data-a="cs-pag" data-v="${pag - 1}" ${pag <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>${nums.map((n) => n === "…" ? `<span>…</span>` : `<button type="button" data-a="cs-pag" data-v="${n}" aria-current="${n === pag ? "page" : "false"}">${n}</button>`).join("")}<button type="button" data-a="cs-pag" data-v="${pag + 1}" ${pag >= pags ? "disabled" : ""} aria-label="Próxima página">›</button></span>
          <span style="flex:1"></span>
          <select class="campo cs-porpag" data-cs-porpag aria-label="Alunas por página">${[10, 25, 50].map((n) => `<option value="${n}" ${porPag === n ? "selected" : ""}>${n} por página</option>`).join("")}</select>
          <span class="cs-nota">${lista.length ? (pag - 1) * porPag + 1 : 0}–${Math.min(pag * porPag, lista.length)} de ${lista.length}</span>
        </div>
      </section>
      ${ui.csAddAluna ? (() => { const fora = S.alunas.filter((a) => !todas.some((t) => t.a.id === a.id)).sort((x, y) => x.nome.localeCompare(y.nome)); return `
      <div class="modal-fundo" data-a="cs-add-aluna-fundo"><div class="modal" role="dialog" aria-modal="true" aria-label="Adicionar aluna ao curso">
        <h2>Adicionar aluna a ${h(c.nome)}</h2>
        ${fora.length ? `<p>Escolha a aluna. Em seguida abre a liberação dela, para marcar o que fica aberto deste curso.</p>
        <select class="campo" id="csAlunaNova" aria-label="Aluna">${fora.map((a) => `<option value="${a.id}">${h(a.nome)}${a.celular ? " · " + fone(a.celular) : ""}</option>`).join("")}</select>
        <div class="acoes" style="margin-top:16px"><button class="al-botao-ouro" data-a="cs-add-aluna-ir">Continuar</button><button class="al-botao" data-a="cs-add-aluna">Cancelar</button></div>`
        : `<p>Todas as alunas cadastradas já estão neste curso. Para uma aluna nova, use Cadastrar aluna na aba Alunas.</p><div class="acoes" style="margin-top:16px"><button class="al-botao" data-a="cs-add-aluna">Fechar</button></div>`}
      </div>`; })() : ""}`;
  }

  /* --- Configurações: informações à esquerda; capa e ações rápidas à direita --- */
  function configCurso(c: Curso) {
    const capa = previas["cur-" + c.id] || capaSite(c.capa);
    const IC_V = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const IC_EXP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>`;
    return `
      <div class="cs-config" data-form-de="formCurso">
        <form id="formCurso" data-f="curso-config" class="cs-cartao cs-form">
          <h3>Informações do curso</h3>
          <label class="cs-campo"><span>Nome do curso</span><input class="campo" name="nome" value="${h(c.nome)}" required /></label>
          ${escolhaAbasCats(c.id)}
          <div class="cs-duas">
            <label class="cs-campo"><span>Rótulo no Início (opcional) ${dicaCampo(AJ.rotIni)}</span><input class="campo" name="rotuloInicio" value="${h(c.rotuloInicio)}" maxlength="40" placeholder="Sua mentoria" /></label>
            <label class="cs-campo"><span>Nome curto no Início (opcional) ${dicaCampo(AJ.nomeIni)}</span><input class="campo" name="nomeCurto" value="${h(c.nomeCurto)}" maxlength="60" placeholder="Bênçãos Ilimitadas" /></label>
          </div>
          <label class="cs-campo"><span>Descrição ${dicaCampo(AJ.desc)}</span><textarea class="campo" name="descricao" rows="3" maxlength="500" data-conta-max="500">${h(c.descricao)}</textarea><em class="cs-conta">${c.descricao.length}/500</em></label>
          <label class="cs-campo"><span>Fundação — o que é este curso? ${dicaCampo(AJ.fund)}</span><textarea class="campo" name="fundacao" rows="4" maxlength="1000" data-conta-max="1000" placeholder="Para quem é, o que promete, com que voz se fala aqui.">${h(c.fundacao)}</textarea><em class="cs-conta">${c.fundacao.length}/1000</em></label>
          <label class="cs-campo"><span>Aviso de material — aparece em toda aula ${dicaCampo(AJ.aviso)}</span><textarea class="campo" name="aviso" rows="3" placeholder="Orientações, avisos importantes e materiais complementares.">${h(c.aviso)}</textarea></label>
          <input type="hidden" name="capa" value="${h(c.capa)}" />
          <div class="cs-salvar"><button class="al-botao-ouro">Salvar alterações</button></div>
        </form>
        <div class="cs-col">
          <section class="cs-cartao">
            <h3>Capa do curso ${dicaCampo(AJ.capaCurso)}</h3>
            <span class="e3-caixa${cls3(estado3(c.visivel, c.bloq))}"><span class="cs-capa-ed" data-previa="cur-${c.id}">${capa ? `<img src="${h(capa)}" alt="" />` : `<span class="cur-sem-capa">Sem imagem</span>`}</span>${selo3(estado3(c.visivel, c.bloq))}</span>
            <div class="cs-duas"><button type="button" class="al-botao" data-a="curso-capa" data-id="${c.id}">${IC_IMG}Alterar</button><button type="button" class="al-botao" data-a="capa-editar" data-v="curso" data-id="${c.id}">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao botao-remover" data-a="curso-capa-tirar" data-id="${c.id}">${IC_MOD.lixo}Remover</button></div>
            <p class="cs-nota" style="margin:10px 0 0">Depois de trocar a imagem, clique em Salvar alterações.</p>
          </section>
          <section class="cs-cartao ea-config cs-config-est">
            <h3>Configurações</h3>
            <div class="mp-config">
              <div class="grupo"><span class="rotulo-ajuda mp-rot">Status do curso ${dicaCampo(AJ.statusCurso)}</span>${seletorEstado("curso", c.id, estado3(c.visivel, c.bloq), true)}</div>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">${IC_CUR.cal}Data de liberação (opcional) ${dicaCampo(AJ.liberaCurso)}</span><input type="datetime-local" class="campo" name="libera" form="formCurso" value="${h(dataLocal(c.libera))}" /></label>
            </div>
            <div class="ea-lib"><span class="rotulo-ajuda mp-rot">Liberação</span>${situacaoModulo({ libera: c.libera, aulas: c.modulos.flatMap((m) => m.aulas) } as Modulo)}</div>
          </section>
          <section class="cs-cartao cs-rapidas">
            <h3>Ações rápidas</h3>
            <button type="button" data-a="cs-ver-aluna">${IC_V}Ver na área da aluna</button>
            <button type="button" data-a="cs-duplicar" data-id="${c.id}">${IC_MOD.copiar}Duplicar curso</button>
            <button type="button" data-a="cs-exportar-conteudo" data-id="${c.id}">${IC_EXP}Exportar conteúdo</button>
            <button type="button" class="perigo" data-a="curso-remover" data-id="${c.id}">${IC_MOD.lixo}Apagar curso</button>
          </section>
        </div>
      </div>`;
  }

  /* --- Relatórios: período, números com a variação, gráficos e os mais vistos --- */
  type RelCurso = { dias: { dia: string; novas: number; assistidas: number }[]; totais: Record<string, number>; modulos: { id: string; titulo: string; n: number }[]; aulas: { id: string; titulo: string; n: number }[] };
  let relCurso: { chave: string; r: RelCurso | null } | null = null;
  let relCarregando = "";
  function periodoRel() {
    const hj = hoje(), menos = (n: number) => diaDe(new Date(Date.now() - n * 864e5));
    const f = ui.relPer || "7";
    if (f === "hoje") return { de: hj, ate: hj };
    if (f === "ontem") return { de: menos(1), ate: menos(1) };
    if (f === "30") return { de: menos(29), ate: hj };
    if (f === "perso" && ui.relDe && ui.relAte) return { de: ui.relDe, ate: ui.relAte };
    return { de: menos(6), ate: hj };
  }
  function relatoriosCurso(c: Curso, todas: AlunaCurso[]) {
    const { de, ate } = periodoRel(), chave = c.id + "|" + de + "|" + ate;
    if ((!relCurso || relCurso.chave !== chave) && relCarregando !== chave) {
      relCarregando = chave;
      void (async () => { const r = await supabase.rpc("relatorio_curso", { p_produto: c.id, p_de: de, p_ate: ate }); relCarregando = ""; relCurso = { chave, r: r.error ? null : (r.data as RelCurso) }; if (ui.tab === "curso") render(); })();
    }
    const r = relCurso && relCurso.chave === chave ? relCurso.r : null;
    const t = r ? r.totais : {};
    const ativas = todas.filter((x) => !x.a.bloqueada && !vencida(x.a)).length;
    const inativas = todas.filter((x) => x.a.bloqueada).length, canceladas = todas.filter((x) => !x.a.bloqueada && vencida(x.a)).length;
    const varP = (cur: number, ant: number) => (ant && cur !== ant ? `<span class="eng-var ${cur > ant ? "bom" : "ruim"}">${cur > ant ? "↑" : "↓"} ${Math.abs(Math.round(((cur - ant) / ant) * 100))}%</span>` : "");
    const mil = (n: number) => (n >= 1000 ? (Math.round(n / 100) / 10).toString().replace(".", ",") + " mil" : String(n));
    const card = (ic: string, n: number | string, rot: string, v: string) => `<div class="cs-ind"><span class="eng-ind-ic">${ic}</span><span class="cs-ind-txt"><b>${n}</b><span>${rot}</span>${v}</span></div>`;
    const dias = r ? r.dias : [];
    const maxN = Math.max(1, ...dias.map((d) => d.novas)), maxA = Math.max(1, ...dias.map((d) => d.assistidas));
    const barras = dias.map((d) => `<span class="eng-barra" title="${br(d.dia)}: ${p(d.novas, "nova aluna", "novas alunas")}"><i style="height:${(d.novas / maxN) * 100}%"></i><em>${br(d.dia).slice(0, 5)}</em></span>`).join("");
    const W = 300, H = 120, nD = Math.max(1, dias.length - 1);
    const pts = dias.map((d, k) => `${((k / nD) * W).toFixed(1)},${(H - (d.assistidas / maxA) * (H - 10)).toFixed(1)}`).join(" ");
    const soma = ativas + inativas + canceladas, fat = (n: number) => (soma ? (n / soma) * 100 : 0);
    const IC_B = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z"/></svg>`, IC_C = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>`, IC_N = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8.5" r="3.8"/><path d="M3 20c.8-4 3.5-6 7-6 1.6 0 3 .4 4.1 1.2M18 13.5v6M15 16.5h6"/></svg>`;
    return `
      <div class="cs-filtros cs-rel-per">
        <b>Período</b>
        ${[["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["perso", "Personalizado"]].map(([v, n]) => `<button type="button" class="al-filtro cs-fil" data-a="rel-per" data-v="${v}" aria-pressed="${(ui.relPer || "7") === v}">${n}</button>`).join("")}
        ${(ui.relPer || "7") === "perso" ? `<span class="cs-datas">${IC_CUR.cal}<input type="date" class="campo" data-rel-de value="${h(ui.relDe || de)}" aria-label="De" /><span aria-hidden="true">→</span><input type="date" class="campo" data-rel-ate value="${h(ui.relAte || ate)}" aria-label="Até" /></span>` : ""}
        <span style="flex:1"></span>
        <button type="button" class="al-botao-ouro" data-a="rel-exportar">${IC_CURSO.mais}Exportar relatório</button>
      </div>
      ${r ? `
      <div class="cs-inds cs-inds5">
        ${card(IC_CUR.pessoas, ativas, "Alunas ativas", varP(ativas, ativas - (t.novas || 0)))}
        ${card(IC_N, t.novas || 0, "Novas alunas", varP(t.novas || 0, t.novas_ant || 0))}
        ${card(IC_CURSO.play, mil(t.assistidas || 0), "Aulas assistidas", varP(t.assistidas || 0, t.assistidas_ant || 0))}
        ${card(IC_B, t.comentarios || 0, "Comentários", varP(t.comentarios || 0, t.comentarios_ant || 0))}
        ${card(IC_C, t.curtidas || 0, "Curtidas", varP(t.curtidas || 0, t.curtidas_ant || 0))}
      </div>
      <div class="cs-rel-graf">
        <section class="cs-cartao"><h3>Novas alunas no período</h3><div class="eng-graf"><div class="eng-barras">${barras}</div></div></section>
        <section class="cs-cartao"><h3>Aulas assistidas no período</h3>
          <svg class="cs-linha" viewBox="-6 -6 ${W + 12} ${H + 12}" preserveAspectRatio="none" aria-label="Aulas assistidas por dia">${dias.length > 1 ? `<polygon points="0,${H} ${pts} ${W},${H}" class="area"/><polyline points="${pts}" class="traco"/>` : ""}${dias.map((d, k) => `<circle cx="${((k / nD) * W).toFixed(1)}" cy="${(H - (d.assistidas / maxA) * (H - 10)).toFixed(1)}" r="3"><title>${br(d.dia)}: ${d.assistidas}</title></circle>`).join("")}</svg>
          <div class="cs-linha-dias">${dias.map((d) => `<em>${br(d.dia).slice(0, 5)}</em>`).join("")}</div>
        </section>
        <section class="cs-cartao"><h3>Status das alunas ${ajudaQuadro("status-curso", ["Status das alunas", "Ativas: com acesso em dia. Inativas: bloqueadas no painel. Canceladas: o acesso venceu.", ""])}</h3>
          <div class="eng-dist-corpo"><span class="eng-rosca" style="background:${soma ? `conic-gradient(var(--eng-verde) 0 ${fat(ativas)}%, var(--eng-ouro) ${fat(ativas)}% ${fat(ativas) + fat(inativas)}%, var(--eng-rosa) ${fat(ativas) + fat(inativas)}% 100%)` : "var(--aa-cinza)"}"><span><b>${soma}</b>Total</span></span>
          <ul class="cs-leg"><li><span class="eng-ponto verde"></span><span>Ativas</span><b>${ativas} (${Math.round(fat(ativas))}%)</b></li><li><span class="eng-ponto ouro"></span><span>Inativas</span><b>${inativas} (${Math.round(fat(inativas))}%)</b></li><li><span class="eng-ponto rosa"></span><span>Canceladas</span><b>${canceladas} (${Math.round(fat(canceladas))}%)</b></li></ul></div>
        </section>
      </div>
      <div class="cs-rel-graf">
        <section class="cs-cartao"><h3>Módulos mais acessados</h3>${r.modulos.map((m, k) => { const mi = c.modulos.findIndex((x) => x.id === m.id); return `<div class="cs-top"><span>${k + 1}.</span><b>Módulo ${mi >= 0 ? numModulo(c, mi) : ""} — ${h(m.titulo.charAt(0) + m.titulo.slice(1).toLowerCase())}</b><em>${p(m.n, "acesso", "acessos")}</em></div>`; }).join("") || `<p class="ini-vazio">Nenhum acesso no período.</p>`}</section>
        <section class="cs-cartao"><h3>Aulas mais assistidas</h3>${r.aulas.map((a) => `<div class="cs-top"><i>${IC_CURSO.play}</i><b>${h(a.titulo)}</b><em>${p(a.n, "acesso", "acessos")}</em></div>`).join("") || `<p class="ini-vazio">Nenhuma aula assistida no período.</p>`}</section>
        <section class="cs-cartao"><h3>Engajamento no período</h3><div class="cs-eng3">
          <span><b>${t.comentarios || 0}</b><em>comentários</em>${varP(t.comentarios || 0, t.comentarios_ant || 0)}</span>
          <span><b>${t.curtidas || 0}</b><em>curtidas</em>${varP(t.curtidas || 0, t.curtidas_ant || 0)}</span>
          <span><b>${mil(t.minutos || 0)}</b><em>minutos assistidos</em>${varP(t.minutos || 0, t.minutos_ant || 0)}</span>
        </div></section>
      </div>` : `<p class="ini-vazio">Carregando…</p>`}`;
  }

  function telaCurso() {
    const c = curso(ui.curso);
    if (!c) return `<section class="tela ativa"><div class="vazio">Nenhum curso aberto. Escolha um em Cursos e conteúdos.</div></section>`;
    const mp = ui.modPagina ? acharModulo(ui.modPagina) : null;
    if (mp && mp.c.id === c.id) return paginaModulo(c, mp.m, mp.i);
    const aba = ui.cursoAba || "visao";
    const todas = alunasDoCurso(c);
    const capa = capaSite(c.capa);
    const ABAS_C: [string, string][] = [["visao", "Visão geral"], ["config", "Sobre o curso"], ["modulos", "Módulos e aulas"], ["alunas", "Alunas"], ["comentarios", "Comentários" + (comentariosDoCurso(c).some((k) => k.estado === "moderar") ? " (" + comentariosDoCurso(c).filter((k) => k.estado === "moderar").length + ")" : "")], ["relatorios", "Relatórios"]];
    const conteudo = aba === "modulos" ? modulosCurso(c)
      : aba === "alunas" ? alunasCursoAba(c, todas)
      : aba === "comentarios" ? comentariosCursoAba(c)
      : aba === "config" ? configCurso(c)
      : aba === "relatorios" ? relatoriosCurso(c, todas)
      : visaoGeralCurso(c, todas);
    return `
    <section class="tela ativa cs">
      <div class="cs-trilha">
        <button type="button" class="cs-volta-ic" data-a="aba" data-v="cursos" aria-label="Voltar para Cursos e conteúdos">${IC_CURSO.voltar}</button>
        <span><button type="button" class="link cs-link-trilha" data-a="aba" data-v="cursos">Cursos e conteúdos</button><span aria-hidden="true" class="cs-sep">›</span><b>${h(c.nome)}</b></span>
        <span style="flex:1"></span>
        <button type="button" class="al-botao" data-a="cs-ver-aluna">Ver na área da aluna ${IC_EXTERNO}</button>
        <button type="button" class="al-botao" data-a="cs-duplicar" data-id="${c.id}">${IC_MOD.copiar}Duplicar curso</button>
        <button type="button" class="al-botao-ouro" data-a="curso-aba" data-v="config">${IC_CURSO.lapis}Editar curso</button>
      </div>
      <div class="cs-heroi${cls3(estado3(c.visivel, c.bloq))}">
        <span class="cs-capa">${capa ? `<img src="${h(capa)}" alt="" />` : `<span class="cur-sem-capa">Sem imagem</span>`}${selo3(estado3(c.visivel, c.bloq))}<button type="button" class="cs-alterar-capa" data-a="cs-capa-direto" data-id="${c.id}">${IC_IMG}Alterar capa</button></span>
        <div class="cs-heroi-txt">
          <span class="cs-etq">Curso</span>
          <h1>${h(c.nome)}</h1>
          <div class="cs-heroi-est">${seletorEstado("curso", c.id, estado3(c.visivel, c.bloq), true)}</div>
          <div class="cs-heroi-cats"><span>Categorias:</span>${naCategoria("curso", c.id)}</div>
          ${c.descricao ? `<p>${h(c.descricao)}</p>` : ""}
        </div>
        <div class="cs-heroi-acoes">
          <span class="eng-menu"><button type="button" class="cur-mais" data-a="cur-menu" data-id="${c.id}" aria-label="Mais opções" aria-expanded="${ui.curMenu === c.id}">⋮</button>${ui.curMenu === c.id ? `<span class="eng-menu-pop" role="menu">
            <button role="menuitem" data-a="curso-aba" data-v="modulos">Módulos e aulas</button>
            <button role="menuitem" data-a="cs-exportar-conteudo" data-id="${c.id}">Exportar conteúdo</button>

          </span>` : ""}</span>
        </div>
      </div>
      <nav class="cs-abas" aria-label="Partes do curso">${ABAS_C.map(([v, t]) => `<button type="button" data-a="curso-aba" data-v="${v}" aria-current="${aba === v ? "page" : "false"}">${t}</button>`).join("")}</nav>
      ${conteudo}
    </section>`;
  }

  function blocoModulo(c: Curso, m: Modulo, i: number) {
    const aberto = ui.abertos.has(m.id);
    const cab = editando("mod", m.id) ? `
      <form data-f="mod-renomear" data-id="${m.id}" class="mod-form">
        <label class="grupo"><span class="rotulo rotulo-ajuda">Nome antes do número ${dicaCampo(AJ.rotMod)}</span><input class="campo" name="rotulo" value="${h(m.rot)}" maxlength="40" required style="max-width:220px" /></label>
        <label class="grupo"><span class="rotulo rotulo-ajuda">Número do módulo ${dicaCampo(AJ.numMod)}</span>${campoNumero(m.num, "Número do módulo")}</label>
        <label class="grupo largo"><span class="rotulo">Nome do módulo</span><input id="editarCampo" class="campo" name="nome" value="${h(m.nome)}" required /></label>
        <div class="grupo largo"><span class="rotulo rotulo-ajuda">Descrição ${dicaCampo(AJ.modDesc)}</span><textarea class="campo" name="intro" rows="3" aria-label="Descrição do módulo">${h(m.intro)}</textarea></div>
        <div class="grupo largo"><span class="rotulo rotulo-ajuda">Capa deitada (16:9) ${dicaCampo(AJ.modCapaH)}</span>
          <span class="mod-capa" data-previa="modh-${m.id}">${(previas["modh-" + m.id] || capaSite(m.capaH)) ? `<img src="${h(previas["modh-" + m.id] || capaSite(m.capaH))}" alt="" />` : ""}</span>
          <input type="hidden" name="capaH" value="${h(m.capaH)}" />
          <span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="botao-neutro grande" data-a="mod-capa-h" data-id="${m.id}">Escolher imagem</button>${m.capaH ? `<button type="button" class="botao-neutro grande botao-remover" data-a="mod-capa-h-tirar" data-id="${m.id}">Tirar capa</button>` : ""}</span>
        </div>
        <div class="grupo largo"><span class="rotulo rotulo-ajuda">Capa em pé (2:3) ${dicaCampo(AJ.modCapa)}</span>
          <span class="mod-capa mod-capa-pe" data-previa="modv-${m.id}">${(previas["modv-" + m.id] || capaSite(m.capa)) ? `<img src="${h(previas["modv-" + m.id] || capaSite(m.capa))}" alt="" />` : ""}</span>
          <input type="hidden" name="capa" value="${h(m.capa)}" />
          <span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="botao-neutro grande" data-a="mod-capa-v" data-id="${m.id}">Escolher imagem</button></span>
        </div>
        <label class="grupo"><span class="rotulo rotulo-ajuda">Cor do módulo ${dicaCampo(AJ.modCor)}</span><input type="color" class="campo-cor" name="cor" value="${h(/^#[0-9a-f]{6}$/i.test(m.cor) ? m.cor : "#e6b85a")}" /></label>
        <div class="grupo largo"><span class="rotulo rotulo-ajuda">Aula ao vivo ${dicaCampo(AJ.modVivo)}</span>
          <label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" name="temVivo" value="1" ${m.vivo ? "checked" : ""} /> Este módulo tem aula ao vivo</label>
          <label style="display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:13px;color:var(--texto-3)">Data e hora (vazio = "data a confirmar")<input type="datetime-local" class="campo" name="vivoData" value="${h(dataLocal(m.vivo?.data || ""))}" style="max-width:260px" /></label>
        </div>
        <div style="display:flex;gap:8px">${botoesEdicao("Salvar módulo")}</div>
      </form>` : `
      <div class="cabecalho-modulo">
        <span class="nome"><b>${h(m.rot)} ${numModulo(c, i)} — ${h(m.nome)}</b><br /><span style="font-size:13px;color:var(--texto-3)">${p(m.aulas.length, "aula", "aulas")}</span></span>
        <span class="acoes">
          ${m.ativo ? etiqueta("Ativo", VERDE) : etiqueta("Bloqueado", VERMELHO)}
          <button class="botao-neutro" data-a="mod-editar" data-id="${m.id}">Editar</button>
          <button class="botao-neutro" data-a="mod-bloquear" data-id="${m.id}">${m.ativo ? "Bloquear para todas" : "Desbloquear"}</button>
          <button class="botao-neutro" data-a="mod-sobe" data-id="${m.id}" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button class="botao-neutro" data-a="mod-desce" data-id="${m.id}" ${i === c.modulos.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
          <button class="botao-neutro botao-remover" data-a="mod-remover" data-id="${m.id}">Remover módulo</button>
          <button class="botao-neutro" data-a="mod-abrir-fechar" data-id="${m.id}" aria-label="${aberto ? "Recolher" : "Mostrar aulas"}">${aberto ? "⌃" : "⌄"}</button>
        </span>
      </div>`;
    if (!aberto) return `<div class="bloco-modulo">${cab}</div>`;
    return `
    <div class="bloco-modulo">
      ${cab}
      <div style="margin-top:12px">
        ${m.aulas.length ? `<p class="rotulo rotulo-ajuda" style="margin:0 0 6px">Aulas ${dicaCampo(AJ.aulas)}</p>` : ""}
        ${m.aulas.map((a, j) => linhaAula(m, a, j)).join("") || `<p style="margin:0;padding:10px 0;font-size:13px;color:var(--texto-3)">Nenhuma aula neste módulo.</p>`}
      </div>
      ${ui.addAula === m.id ? `
        <form data-f="aula-add" data-id="${m.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
                  <label class="cs-add-num"><span>Número</span>${campoNumero(proxNumAula(m), "Número da aula")}</label>
          <input id="novaAula" class="campo" style="flex:1 1 260px;max-width:520px" name="nome" placeholder="Nome da nova aula" required />
          <button class="botao-neutro grande">Adicionar</button>
          <button type="button" class="botao-neutro grande" data-a="aula-add-cancelar">Cancelar</button>
        </form>` : `<button class="botao-neutro grande" style="margin-top:12px" data-a="aula-add-abrir" data-id="${m.id}">+ Adicionar aula</button>`}
    </div>`;
  }

  function linhaAula(m: Modulo, a: Aula, j: number) {
    if (editando("aula", a.id)) return `
      <div class="linha">
        <form data-f="aula-renomear" data-id="${a.id}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1 1 100%">
          <label class="cs-add-num"><span>Nome antes do número ${dicaCampo(AJ.rotAula)}</span><input class="campo" name="rotulo" value="${h(a.rot)}" maxlength="40" required style="width:150px" aria-label="Nome antes do número" /></label>
          <label class="cs-add-num"><span>Número ${dicaCampo(AJ.numAula)}</span>${campoNumero(a.num, "Número da aula")}</label>
          <input id="editarCampo" class="campo" style="flex:1 1 280px;max-width:560px" name="nome" value="${h(a.nome)}" required />
          ${botoesEdicao("Salvar")}
        </form>
      </div>`;
    const info = [a.video ? "com vídeo" : "sem vídeo", a.texto ? "com texto" : null, a.extras.length ? p(a.extras.length, "extra", "extras") : null].filter(Boolean).join(" · ");
    const est = a.acesso === "liberada" ? etiqueta("Liberada para todas", OURO) : a.acesso === "bloqueada" ? etiqueta("Bloqueada", VERMELHO) : "";
    return `
      <div class="linha">
        <span class="nome"><b>${h(a.rot)} ${a.num} — ${h(a.nome)}</b><span>${info}</span></span>
        ${est}
        ${a.criado ? `<span class="aula-criada" title="Data de criação da aula">${IC_CUR.cal}${br(diaDe(a.criado))}</span>` : ""}
        <span class="acoes">
          <button class="botao-neutro" data-a="aula-sobe" data-id="${a.id}" ${j === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button class="botao-neutro" data-a="aula-desce" data-id="${a.id}" ${j === m.aulas.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
          <button class="botao-neutro" data-a="abrir-aula" data-id="${a.id}">Abrir</button>
          ${botaoLiberacao(a)}
          <button class="botao-neutro" data-a="abrir-aula" data-id="${a.id}">Editar</button>
          ${a.acesso === "bloqueada"
            ? `<button class="botao-neutro" data-a="aula-bloquear" data-id="${a.id}">Desbloquear</button>`
            : `<button class="botao-neutro botao-remover" data-a="aula-bloquear" data-id="${a.id}">Bloquear</button>`}
          <button class="botao-neutro botao-remover" data-a="aula-remover" data-id="${a.id}">Remover</button>
        </span>
      </div>`;
  }

  /* ---------- AULA ABERTA ---------- */
  /*
   * Editor de botão: nome, cor e a prévia de como o botão aparece para a
   * aluna (mesmo desenho dourado da área). A prévia acompanha o que se
   * digita e a cor escolhida, sem salvar.
   */
  const COR_BOTAO = "#c9a15c";
  const IC_LIVRO_BT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg>`;
  const IC_ORAR_BT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M10 5h4M7 21v-7l5-4 5 4v7M10 21v-4h4v4"/></svg>`;
  const textoSobre = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#1a1206" : "#fff"; };
  const estiloBotao = (cor: string) => `--bt:${cor};color:${textoSobre(cor)}`;
  const editorBotao = (campo: string, rotulo: string, nome: string, cor: string, icone = "", form = "") => `
    <div class="eb" data-eb="${campo}">
      <label class="grupo"><span class="rotulo-ajuda mp-rot">${rotulo}</span><input class="campo" name="${campo}"${form ? ` form="${form}"` : ""} value="${h(nome)}" maxlength="40" data-eb-nome /></label>
      <label class="grupo eb-cor"><span class="rotulo-ajuda mp-rot">Cor</span><span class="eb-cor-linha"><input type="color" class="campo-cor" name="${campo}Cor"${form ? ` form="${form}"` : ""} value="${h(cor)}" data-eb-cor /><button type="button" class="eb-padrao" data-a="eb-padrao" data-v="${campo}">Cor padrão</button></span></label>
      <div class="grupo eb-previa"><span class="rotulo-ajuda mp-rot">Como a aluna vê</span><span class="eb-fundo"><span class="eb-botao" style="${estiloBotao(cor)}">${icone}<b>${h(nome)}</b></span></span></div>
    </div>`;
  // Ordinal do título de cada opção extra do e-book (a 1ª opção é o próprio PDF).
  const ORDINAL = ["Segunda", "Terceira", "Quarta", "Quinta", "Sexta", "Sétima", "Oitava", "Nona", "Décima"];
  const OPCAO_NOVA = (rotulo = ""): Opcao => ({ id: "", rotulo, cor: COR_BOTAO, tipo: "texto", texto: "", arquivo: "", video: "", capa: "", tituloTela: "", instrucoes: "", extras: [] });
  function blocoOpcao(k: number, op: Opcao) {
    const t = op.tipo, f = ` form="formAula"`;
    const grupo = t === "video" || t === "audio" ? "midia" : t;
    const midia = grupo === "midia";
    const capa = op.capa ? urlDaCapa(op.capa) : "";
    const tipoEx = TIPOS[3].tela;
    return `
              <div class="ea-op2" data-op-bloco data-op-id="${op.id}" data-op-extra-tipo="${tipoEx}">
                <div class="ea-op2-tit"><span data-op-tit>${ORDINAL[k] || k + 2 + "ª"} opção</span>${k > 0 ? `<button type="button" class="ea-op-tirar" data-a="op-tirar">${IC_MOD.lixo}Tirar esta opção</button>` : ""}</div>
                <input type="hidden" name="op${k}Capa"${f} value="${h(op.capa)}" data-op-capa />
                <div class="ea-op-topo">
                  ${editorBotao("op" + k + "Rotulo", "Nome do botão", op.rotulo, op.cor || COR_BOTAO, IC_ORAR_BT, "formAula")}
                  <label class="grupo"><span class="rotulo-ajuda mp-rot">O que abre neste botão</span>
                    <select class="campo" name="op${k}Tipo"${f} data-op2-tipo>${([["texto", "Texto"], ["audio", "Áudio"], ["video", "Vídeo"], ["pdf", "PDF"]] as const).map(([v, n]) => `<option value="${v}"${t === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>
                </div>
                <label class="grupo" data-op2="texto"${grupo === "texto" ? "" : " hidden"}><span class="rotulo-ajuda mp-rot">Texto (o que a aluna lê ao tocar no botão)</span><textarea class="campo" name="op${k}Texto"${f} rows="6" placeholder="Escreva aqui o texto deste botão. Uma linha em branco separa parágrafo.">${t === "texto" ? h(op.texto) : ""}</textarea></label>
                <label class="grupo" data-op2="pdf"${grupo === "pdf" ? "" : " hidden"}><span class="rotulo-ajuda mp-rot">Arquivo PDF</span><span class="ea-arq"><input class="campo" name="op${k}Pdf"${f} value="${t === "pdf" ? h(op.arquivo) : ""}" placeholder="Nenhum arquivo selecionado" readonly data-op-arq="pdf" /><button type="button" class="al-botao" data-a="op-arquivo" data-v="pdf">Escolher arquivo</button></span></label>
                <div class="ea-op-midia" data-op2="midia"${midia ? "" : " hidden"}>
                  <div class="ea-op-esq">
                    <label class="grupo" data-midia="video"${t === "video" ? "" : " hidden"}><span class="rotulo-ajuda mp-rot">Link do vídeo (URL ou ID do Cloudflare Stream) ${dicaCampo(AJ.video)}</span><input class="campo" name="op${k}Video"${f} value="${h(op.video)}" placeholder="https://iframe.videodelivery.net/&lt;uid&gt; ou só o uid" /></label>
                    <label class="grupo" data-midia="audio"${t === "audio" ? "" : " hidden"}><span class="rotulo-ajuda mp-rot">Arquivo de áudio ${dicaCampo(AJ.arquivoAula)}</span><span class="ea-arq"><input class="campo" name="op${k}Audio"${f} value="${t === "audio" ? h(op.arquivo) : ""}" placeholder="Nenhum arquivo selecionado" readonly data-op-arq="audio" /><button type="button" class="al-botao" data-a="op-arquivo" data-v="audio">Escolher arquivo</button></span></label>
                    <label class="grupo"><span class="rotulo-ajuda mp-rot">Título (aparece na tela)</span><input class="campo" name="op${k}Titulo"${f} value="${h(op.tituloTela)}" placeholder="Ex.: Resumo do e-book em vídeo" /></label>
                    <label class="grupo"><span class="rotulo-ajuda mp-rot">Descrição (o que a aluna verá)</span><textarea class="campo" name="op${k}Desc"${f} rows="4" placeholder="Uma linha em branco separa parágrafo.">${midia ? h(op.texto) : ""}</textarea></label>
                    <label class="grupo"><span class="rotulo-ajuda mp-rot">Instruções (botão “Instruções”)</span><textarea class="campo" name="op${k}Instr"${f} rows="3" placeholder="Título das instruções na primeira linha. Depois, o texto.">${h(op.instrucoes)}</textarea></label>
                  </div>
                  <div class="ea-op-dir">
                    <div class="ea-op-caixa">
                      <span class="rotulo-ajuda mp-rot ea-op-caixa-tit">${IC_IMG}Capa ${dicaCampo(AJ.capa)}</span>
                      <span class="ea-op-capa" data-op-capa-previa${capa ? ` style="background:url('${h(capa)}') center/cover no-repeat"` : ""}></span>
                      <span class="mp-capa-bts"><button type="button" class="al-botao" data-a="op-capa">${IC_IMG}Alterar imagem</button><button type="button" class="al-botao perigo" data-a="op-capa-tirar">${IC_MOD.lixo}Remover</button></span>
                      <span class="mp-dica">Tamanho recomendado: 1920 × 1080 px (16:9)</span>
                    </div>
                    <div class="ea-op-caixa">
                      <span class="rotulo-ajuda mp-rot ea-op-caixa-tit">${IC_LIVRO_BT}Conteúdo extra ${dicaCampo(AJ.extras)}</span>
                      ${op.id ? `
                      ${op.extras.length ? `<div class="ea-extras" style="margin:0;padding:0;border:0">${op.extras.map((e) => `<div class="ea-extra-linha"><span><b>${h(e.nome)}</b><em>${h(e.tipo)}${e.arquivo ? " · " + h(e.arquivo) : ""}</em></span><button type="button" class="mp-ic perigo" data-a="op-extra-remover" data-id="${e.id}" aria-label="Remover ${h(e.nome)}">${IC_MOD.lixo}</button></div>`).join("")}</div>` : ""}
                      <div class="ea-chips">${TIPOS.map((x) => x.tela).map((x) => `<button type="button" data-a="op-extra-tipo" data-v="${x}" aria-pressed="${x === tipoEx}">${x}</button>`).join("")}</div>
                      <input class="campo" data-op-extra-nome placeholder="Nome do conteúdo" />
                      <span class="ea-arq"><input class="campo" data-op-extra-arq placeholder="Nenhum arquivo selecionado" /><button type="button" class="al-botao" data-a="op-extra-arquivo" data-op-extra-bt>Escolher arquivo</button></span>
                      <div><button type="button" class="al-botao-ouro" data-a="op-extra-add" data-id="${op.id}">Adicionar</button></div>` : `<p class="mp-dica" style="margin:0">Salve a aula uma vez e depois adicione aqui o conteúdo extra desta opção.</p>`}
                    </div>
                  </div>
                </div>
              </div>`;
  }
  function telaAula() {
    const x = ui.aula ? acharAula(ui.aula) : null;
    if (!x) return `<section class="tela ativa"><div class="vazio">Nenhuma aula aberta. Abra uma pela lista do curso.</div></section>`;
    const a = x.a, m = x.m, c = x.c;
    const previa = previas[a.id] || (a.capa ? urlDaCapa(a.capa) : "");
    const tipo = ui.extraTipo;
    const semArquivo = tipo === "Link" || tipo === "Texto" || tipo === "Vídeo";
    const ident = h(m.rot) + " " + numModulo(c, x.mi);
    const IC_DOC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/></svg>`;
    const IC_ENGR = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>`;
    const tipoA = (ui.aulaTipo || a.tipo) as Aula["tipo"];
    return `
    <section class="tela ativa cs mp ea" data-form-de="formAula">
      <div class="mp-topo">
        <nav class="mp-trilha" aria-label="Você está em">
          <button type="button" data-a="aba" data-v="cursos">Cursos e conteúdos</button><i>›</i>
          <button type="button" data-a="abrir-curso" data-id="${c.id}">${h(c.nome)}</button><i>›</i>
          <button type="button" data-a="aula-voltar-modulo" data-id="${m.id}">${ident}</button><i>›</i>
          <b>Editar aula</b>
        </nav>
        <button type="button" class="al-botao" data-a="aula-voltar-modulo" data-id="${m.id}">${IC_CURSO.voltar}Voltar para o módulo</button>
      </div>
      <div class="ea-tit">
        <div><h2 class="mp-h2">${ui.novaAula === a.id ? "Nova aula" : "Editar aula"}</h2><p class="ea-sub">${ident} — ${h(m.nome)}</p></div>
        <button type="button" class="al-botao perigo" data-a="aula-remover" data-id="${a.id}">${IC_MOD.lixo}Excluir aula</button>
      </div>

      <div class="ea-grade">
        <form id="formAula" data-f="aula" data-id="${a.id}" class="cs-cartao ea-info">
          <div class="mp-cab"><span class="mp-cab-ic">${IC_DOC}</span><div><h3>Informações da aula</h3><p>Edite o conteúdo e as configurações da aula.</p></div></div>
          <div class="ea-linha3">
            <label class="grupo"><span class="rotulo-ajuda mp-rot">Nome antes do número ${dicaCampo(AJ.rotAula)}</span><input class="campo" name="rotulo" value="${h(a.rot)}" maxlength="40" required /></label>
            <label class="grupo"><span class="rotulo-ajuda mp-rot">Número da aula ${dicaCampo(AJ.numAula)}</span>${campoNumero(a.num, "Número da aula")}</label>
            <label class="grupo"><span class="rotulo-ajuda mp-rot">Nome da aula ${dicaCampo(AJ.nomeAula)}</span><input id="nomeAula" class="campo" name="nome" value="${ui.novaAula === a.id ? "" : h(a.nome)}" placeholder="Nome da nova aula" required /></label>
          </div>
          <label class="grupo"><span class="rotulo-ajuda mp-rot">Tipo de conteúdo ${dicaCampo(AJ.tipoAula)}</span>
            <select class="campo" name="tipo" data-aula-tipo>${([["video", "Vídeo"], ["audio", "Áudio"], ["pdf", "PDF (e-book)"]] as const).map(([v, t]) => `<option value="${v}"${tipoA === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="grupo" data-campo-video${tipoA === "video" ? "" : " hidden"}><span class="rotulo-ajuda mp-rot">Link do vídeo (URL ou ID do Cloudflare Stream) ${dicaCampo(AJ.video)}</span>
            <input class="campo" name="video" value="${h(a.video)}" placeholder="https://iframe.videodelivery.net/&lt;uid&gt; ou só o uid" /></label>
          <label class="grupo" data-campo-arquivo${tipoA === "video" ? " hidden" : ""}><span class="rotulo-ajuda mp-rot"><span data-rot-arquivo>${tipoA === "pdf" ? "Arquivo PDF (e-book)" : "Arquivo de áudio"}</span> ${dicaCampo(AJ.arquivoAula)}</span>
            <span class="ea-arq"><input class="campo" name="arquivoAula" value="${h(tipoA === a.tipo ? a.arquivo : "")}" placeholder="Nenhum arquivo selecionado" readonly /><button type="button" class="al-botao" data-a="aula-arquivo">Escolher arquivo</button></span></label>
          <div class="ea-ebook" data-campo-pdf${tipoA === "pdf" ? "" : " hidden"}>
            ${editorBotao("botaoEbook", "Nome do botão do e-book " + dicaCampo(AJ.botaoEbook), a.botaoEbook || "Ler ebook completo", a.botaoEbookCor || COR_BOTAO, IC_LIVRO_BT)}
          </div>
          <label class="grupo"><span class="rotulo-ajuda mp-rot"><span data-rot-desc>${tipoA === "pdf" ? "Resumo do e-book (aparece embaixo do título)" : "Descrição da aula (o que a aluna verá)"}</span> ${dicaCampo(AJ.texto)}</span>
            <textarea class="campo" name="texto" rows="5" placeholder="Uma linha em branco separa parágrafo. Para destacar, use *asteriscos*.">${h(a.texto)}</textarea></label>
          ${a.resumo === null ? "" : `
          <label class="grupo"><span class="rotulo-ajuda mp-rot">Instruções (botão “Instruções” da aula) ${dicaCampo(AJ.exercicio)}</span>
            <textarea class="campo" name="exercicio" rows="4" placeholder="Título das instruções na primeira linha. Depois, o texto.">${h(a.exercicio || "")}</textarea></label>`}
          <input type="hidden" id="campoCapa" name="capa" value="${h(a.capa)}" />
          <div class="ea-bts"><button class="al-botao-ouro">${IC_SALVAR}Salvar aula</button><button type="button" class="al-botao" data-a="voltar-sem-salvar">Voltar sem salvar</button></div>
        </form>

        <div class="ea-lado">
          <section class="cs-cartao ea-capa${tipoA === "pdf" ? " em-pe" : ""}" data-capa-aula>
            <div class="mp-cab"><span class="mp-cab-ic">${IC_IMG}</span><div><h3 class="rotulo-ajuda"><span data-capa-tit>${tipoA === "pdf" ? "Capa do e-book" : "Capa da aula"}</span> ${dicaCampo(AJ.capa)}</h3></div></div>
            <div id="previaCapa" class="ea-capa-img${cls3(estado3(a.pub, a.acesso === "bloqueada"))}" style="background:${previa ? `url('${h(previa)}') center/cover no-repeat, ` : ""}linear-gradient(160deg,#2a2116,#0c0a07 65%)">${selo3(estado3(a.pub, a.acesso === "bloqueada"), true)}</div>
            <span class="mp-capa-bts"><button type="button" class="al-botao" data-a="escolher-capa">${IC_IMG}Alterar</button><button type="button" class="al-botao" data-a="capa-editar" data-v="aula" data-id="">${IC_CURSO.lapis}Editar</button><button type="button" class="al-botao perigo" data-a="aula-capa-tirar">${IC_MOD.lixo}Remover</button></span>
            <span class="mp-dica" data-capa-dica>${tipoA === "pdf" ? "Capa em pé. Tamanho recomendado: 1024 × 1536 px (2:3)" : "Tamanho recomendado: 1920 × 1080 px (16:9)"}</span>
          </section>

          <section class="cs-cartao ea-extra" data-extra-aula${tipoA === "pdf" ? " hidden" : ""}>
            <div class="mp-cab"><span class="mp-cab-ic">${IC_DOC}</span><div><h3 class="rotulo-ajuda">Conteúdo extra da aula ${dicaCampo(AJ.extras)}</h3></div></div>
            <div class="ea-chips">${TIPOS.map((t) => t.tela).map((t) => `<button type="button" data-a="extra-tipo" data-v="${t}" aria-pressed="${t === tipo}">${t}</button>`).join("")}</div>
            <form data-f="extra-add" data-id="${a.id}" class="ea-extra-form">
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Nome do conteúdo ${dicaCampo(AJ.extraNome)}</span><input class="campo" name="nome" placeholder="Ex: Material da aula" required /></label>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">${tipo === "Link" ? "Endereço do link" : tipo === "Texto" ? "Texto" : tipo === "Vídeo" ? "Link ou identificador do vídeo" : "Arquivo no depósito de " + tipoDaTela(tipo).deposito} ${dicaCampo(AJ.extraArquivo)}</span>
                <span class="ea-arq"><input class="campo" name="arquivo" placeholder="${tipo === "Link" ? "https://" : tipo === "Texto" ? "Escreva aqui" : tipo === "Vídeo" ? "uid do Cloudflare Stream" : "Nenhum arquivo selecionado"}" required />${semArquivo ? "" : `<button type="button" class="al-botao" data-a="enviar-arquivo">Escolher arquivo</button>`}</span></label>
              <div><button class="al-botao-ouro">Adicionar</button></div>
            </form>
            ${a.extras.length ? `<div class="ea-extras">${a.extras.map((e) => `
              <div class="ea-extra-linha"><span><b>${h(e.nome)}</b><em>${h(e.tipo)}${e.arquivo ? " · " + h(e.arquivo) : ""}</em></span><button type="button" class="mp-ic perigo" data-a="extra-remover" data-id="${e.id}" aria-label="Remover ${h(e.nome)}" title="Remover">${IC_MOD.lixo}</button></div>`).join("")}</div>` : ""}
          </section>

          <section class="cs-cartao ea-config">
            <div class="mp-cab"><span class="mp-cab-ic">${IC_ENGR}</span><div><h3>Configurações</h3></div></div>
            <div class="ea-config-grade">
              <label class="grupo"><span class="rotulo-ajuda mp-rot">${IC_CUR.cal}Data de liberação (opcional) ${dicaCampo(AJ.liberaAula)}</span><input type="datetime-local" class="campo" name="libera" form="formAula" value="${h(dataLocal(a.libera))}" /></label>
              <label class="grupo"><span class="rotulo-ajuda mp-rot">Status da aula ${dicaCampo(AJ.statusAula)}</span>
                ${seletorEstado("aula", a.id, estado3(a.pub, a.acesso === "bloqueada"), true, true)}</label>
            </div>
            <div class="ea-lib"><span class="rotulo-ajuda mp-rot">Liberação</span>${botaoLiberacao(a)}</div>
            <div class="ea-lib"><span class="rotulo-ajuda mp-rot">Também nas categorias</span>${naCategoria("aula", a.id)}</div>
            
          </section>
        </div>
      </div>

      <section class="cs-cartao ea-opcoes" data-campo-pdf${tipoA === "pdf" ? "" : " hidden"}>
        <div class="mp-cab"><span class="mp-cab-ic">${IC_LIVRO_BT}</span><div><h3 class="rotulo-ajuda">Outras opções do e-book ${dicaCampo(AJ.op2)}</h3><p>Cada opção vira um botão na tela do e-book, embaixo do “${"Ler ebook completo"}”.</p></div></div>
        <div class="ea-ops" data-ops>${(a.opcoes.length ? a.opcoes : [OPCAO_NOVA("Ler apenas as orações")]).map((op, k) => blocoOpcao(k, op)).join("")}</div>
        <button type="button" class="al-botao ea-op-add" data-a="op-add">${IC_CURSO.mais}Adicionar outra opção</button>
      </section>
    </section>`;
  }

  /* ---------- COMENTÁRIOS ---------- */
  // Um comentário com as ações de moderação (aba Comentários e página do curso).
  const cartaoComentario = (k: Comentario) => `
      <div class="cartao${ui.comAlvo === k.id ? " com-alvo" : ""}${k.estado !== "oculto" && !k.resposta ? " a-responder" : ""}" id="com-${k.id}" style="padding:16px;margin-bottom:12px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:baseline">
          <b style="flex:1 1 220px">${h(k.autora)}${k.estado !== "oculto" && !k.resposta ? ` <span class="tag-responder">Aguardando resposta</span>` : ""}</b>
          <span style="font-size:13px;color:var(--texto-3)">${localAula(k.aula)} · ${h(k.quando)}</span>
        </div>
        <p style="margin:10px 0 14px;color:var(--comentario)">${h(k.texto)}</p>
        ${k.resposta ? `<div class="resposta"><span class="rotulo">Resposta da equipe</span><p style="margin:4px 0 0">${h(k.resposta)}</p></div>` : ""}
        ${ui.respondendo === k.id ? `
          <form data-f="com-resposta" data-id="${k.id}" style="display:flex;flex-direction:column;gap:10px">
            <textarea id="respostaCampo" class="campo" name="resposta" rows="3" placeholder="Escreva a resposta" required>${h(k.resposta)}</textarea>
            <div class="acoes"><button class="botao">Enviar resposta</button><button type="button" class="botao-neutro grande" data-a="com-responder-cancelar">Cancelar</button></div>
          </form>` : `
          <div class="acoes">
            ${k.estado !== "publicado" ? `<button class="botao-neutro" data-a="com-publicar" data-id="${k.id}">Aprovar</button>` : ""}
            ${k.estado !== "oculto" ? `<button class="botao-neutro" data-a="com-ocultar" data-id="${k.id}">Ocultar</button>` : ""}
            <button class="botao-neutro" data-a="com-responder" data-id="${k.id}">${k.resposta ? "Editar resposta" : "Responder"}</button>
            <button class="botao-neutro botao-remover" data-a="com-remover" data-id="${k.id}">Remover</button>
          </div>`}
      </div>`;
  function telaComentarios() {
    const n = (e: Estado) => S.comentarios.filter((k) => k.estado === e).length;
    const lista = ui.filtroCom === "responder" ? paraResponder() : S.comentarios.filter((k) => k.estado === ui.filtroCom);
    const vazio = { responder: "Tudo respondido. Nenhum comentário esperando resposta.", moderar: "Nada esperando moderação.", publicado: "Nenhum comentário publicado.", oculto: "Nenhum comentário oculto." }[ui.filtroCom];
    return `
    <section class="tela ativa">
      <div class="chips" style="margin-bottom:20px">
        <button class="chip chip-alerta" style="cursor:pointer" data-a="com-filtro" data-v="responder" aria-pressed="${ui.filtroCom === "responder"}">Para responder ${paraResponder().length ? `<span class="badge-alerta">${paraResponder().length}</span>` : "(0)"}</button>
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="moderar" aria-pressed="${ui.filtroCom === "moderar"}">Para moderar (${n("moderar")})</button>
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="publicado" aria-pressed="${ui.filtroCom === "publicado"}">Publicados (${n("publicado")})</button>
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="oculto" aria-pressed="${ui.filtroCom === "oculto"}">Ocultos (${n("oculto")})</button>
      </div>
      ${lista.map(cartaoComentario).join("") || `<div class="vazio">${vazio}</div>`}
    </section>`;
  }

  /* ---------- EQUIPE ---------- */
  function telaEquipe() {
    return `
    <section class="tela ativa">
      ${S.equipe.map((e) => `
      <div class="linha">
        <span class="nome"><b>${h(e.nome)}</b><span>${h(e.login)} · ${h(e.papel.toLowerCase())}</span></span>
        ${e.bloqueada ? etiqueta("Bloqueada", VERMELHO) : ""}
        <span class="acoes">
          ${gere(e) || e.souEu ? `<button class="botao-neutro" data-a="equipe-editar" data-id="${e.id}">Editar</button>` : ""}
          ${e.codigo ? `<button class="botao-neutro" data-a="copiar-acesso-equipe" data-id="${e.id}">Copiar acesso</button><button class="botao-neutro" data-a="ver-codigo" data-id="${e.id}">Ver código</button>` : ""}
          ${!gere(e) ? "" : e.bloqueada
            ? `<button class="botao-neutro" data-a="equipe-desbloquear" data-id="${e.id}">Desbloquear</button>`
            : `<button class="botao-neutro botao-remover" data-a="equipe-bloquear" data-id="${e.id}">Bloquear</button>`}
          ${!gere(e) ? "" : `<button class="botao-neutro botao-remover" data-a="equipe-remover" data-id="${e.id}">Remover</button>`}
        </span>
      </div>`).join("")}
      <form data-f="equipe-add" class="cartao" style="padding:16px;margin-top:20px;max-width:780px">
        <p class="rotulo" style="margin:0 0 12px">Adicionar alguém à equipe</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input class="campo" name="nome" required /></label>
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Login</span><input class="campo" name="login" placeholder="ex.: joana" autocomplete="off" required /></label>
          <label class="grupo" style="flex:0 0 150px"><span class="rotulo">Código</span><input class="campo" name="codigo" inputmode="numeric" maxlength="6" placeholder="4 a 6 números" autocomplete="off" required /></label>
          <label class="grupo" style="flex:0 0 150px"><span class="rotulo">Papel</span>
            <select class="campo" name="papel"><option>Suporte</option>${eu?.papel === "Dono" ? "<option>Administrador</option>" : ""}</select>
          </label>
        </div>
        <div style="margin-top:16px"><button class="botao">Adicionar</button></div>
      </form>
    </section>`;
  }

  /* ---------- JANELAS ---------- */
  function modal() {
    const m = ui.modal;
    if (!m) return "";
    let corpo = "";
    if (m.tipo === "aluna") {
      const a = m.id ? aluna(m.id) : null;
      const d = hoje();
      corpo = `
      <form data-f="aluna" data-id="${a ? a.id : ""}">
        <h2 class="titulo">${a ? h(a.nome) : "Cadastrar aluna"}</h2>
        <p class="explica">${a ? "Editar dados. " + p(a.liberadas, "aula liberada", "aulas liberadas") + (a.bloqueada ? " · bloqueada" : "") : "Ela entra com o login e o código de 4 números."}</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input id="alunaNome" class="campo" name="nome" value="${h(a ? a.nome : "")}" required /></label>
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Login</span><input class="campo" name="login" value="${h(a ? a.login : "")}" placeholder="gerado pelo nome" /></label>
          <label class="grupo" style="flex:1 1 220px"><span class="rotulo">Código</span>
            <span style="display:flex;gap:8px"><input class="campo" name="codigo" inputmode="numeric" maxlength="4" value="${h(a ? a.codigo : m.codigo || novoCodigo())}" required /><button type="button" class="botao-neutro grande" data-a="gerar-codigo">Gerar</button></span>
          </label>
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Celular (WhatsApp)</span><input class="campo" name="celular" data-i="celular" type="tel" inputmode="numeric" autocomplete="off" maxlength="15" placeholder="(11) 98765-4321" value="${h(a ? formatarCelular(a.celular) : "")}" required /></label>
          <label class="grupo" style="flex:1 1 220px"><span class="rotulo">E-mail</span><input class="campo" name="email" type="email" inputmode="email" autocomplete="off" placeholder="opcional" value="${h(a ? a.email : "")}" /></label>
          <label class="grupo" style="flex:1 1 180px"><span class="rotulo">Entrada</span><input class="campo" type="date" name="entrada" value="${a ? a.entrada : d}" required /></label>
          <label class="grupo" style="flex:1 1 180px"><span class="rotulo">Acesso até</span><input class="campo" type="date" name="validade" value="${a ? a.validade || maisAno(a.entrada) : maisAno(d)}" required /></label>
        </div>
        <div class="rodape-modal">
          <button class="botao">${a ? "Salvar" : "Cadastrar"}</button>
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
          ${a ? `<span style="flex:1"></span><button type="button" class="botao-neutro grande botao-remover" data-a="remover-aluna" data-id="${a.id}">Remover aluna</button>` : ""}
        </div>
      </form>`;
      if (!ui.focar) ui.focar = a ? null : "alunaNome";
    } else if (m.tipo === "liberar") {
      const a = aluna(m.id); const ac = a.acesso;
      corpo = `
      <form data-f="liberar" data-id="${a.id}">
        <h2 class="titulo">Liberar conteúdo</h2>
        <p class="explica">${h(a.nome)}. Marque o curso inteiro, módulos inteiros ou aulas avulsas.</p>
        ${copiarDe(a, "liberacao")}
        ${S.cursos.map((c) => {
          const cOn = ac.cursos.includes(c.id);
          return `
          <div class="cartao" style="padding:10px 14px;margin-bottom:10px;background:var(--superficie)" data-caixa="curso">
            <label class="marcar"><input type="checkbox" name="c" value="${c.id}" data-cascata ${cOn ? "checked" : ""} /> <b>${h(c.nome)}</b> <span style="font-size:12px;color:var(--texto-3)">curso inteiro</span></label>
            ${c.modulos.map((mo, i) => {
              const mOn = cOn || ac.modulos.includes(mo.id);
              return `
              <div data-caixa="modulo" style="padding-left:26px">
                <label class="marcar"><input type="checkbox" name="m" value="${mo.id}" data-cascata ${mOn ? "checked" : ""} /> Módulo ${numModulo(c, i)} — ${h(mo.nome)}</label>
                ${mo.aulas.length ? `<details style="padding-left:28px"><summary style="cursor:pointer;padding:2px 0 6px;font-size:13px;color:var(--texto-3)">Selecionar aulas (${mo.aulas.length})</summary>
                  ${mo.aulas.map((au, j) => `<label class="marcar"><input type="checkbox" name="a" value="${au.id}" ${mOn || ac.aulas.includes(au.id) ? "checked" : ""} /> ${j + 1}. ${h(au.nome)}</label>`).join("")}
                </details>` : ""}
              </div>`;
            }).join("")}
          </div>`;
        }).join("")}
        <div class="rodape-modal">
          <button class="botao">Salvar liberação</button>
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
        </div>
      </form>`;
    } else if (m.tipo === "cronograma") {
      const a = aluna(m.id);
      corpo = `
      <form data-f="cronograma" data-id="${a.id}">
        <h2 class="titulo">Cronograma</h2>
        <p class="explica">${h(a.nome)} entrou em ${br(a.entrada)}. Diga quantos dias depois da entrada cada módulo abre para ela. Vazio segue a liberação normal.</p>
        ${manualCronograma(a)}
        ${copiarDe(a, "cronograma")}
        <div class="linha" style="padding:8px 0">
          <span class="nome" style="font-size:14px">Ou uma aula a cada tantos dias, nas aulas liberadas para ela</span>
          <span style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;color:var(--texto-3)">
            a cada <input class="campo" type="number" min="1" id="intervaloDias" value="5" style="width:80px" /> dias, de
            <input class="campo" type="date" id="intervaloInicio" value="${a.entrada}" style="width:170px" />
            <button type="button" class="botao-neutro" data-a="preencher-datas" data-id="${a.id}">Preencher datas</button>
          </span>
        </div>
        ${S.cursos.filter((c) => c.modulos.length).map((c) => `
          <p class="rotulo" style="margin:14px 0 6px">${h(c.nome)}</p>
          ${c.modulos.map((mo, i) => `
            <div class="linha" style="padding:8px 0">
              <span class="nome" style="font-size:14px">Módulo ${numModulo(c, i)} — ${h(mo.nome)}</span>
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--texto-3)">
                <input class="campo" type="number" min="0" name="d_${mo.id}" value="${a.cronograma[mo.id] != null ? a.cronograma[mo.id] : ""}" style="width:90px" placeholder="—" /> dias
              </span>
              ${mo.aulas.length ? `<details style="flex:1 1 100%;padding-left:28px"><summary style="cursor:pointer;padding:2px 0 6px;font-size:13px;color:var(--texto-3)">Data fixa por aula (${mo.aulas.length})</summary>
                ${mo.aulas.map((au, j) => `
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:36px;font-size:14px">
                    <span style="flex:1 1 240px">${j + 1}. ${h(au.nome)}</span>
                    <input class="campo" type="date" name="dt_${au.id}" value="${a.datas[au.id] || ""}" style="width:170px" />
                  </div>`).join("")}
              </details>` : ""}
            </div>`).join("")}`).join("")}
        <div class="rodape-modal">
          <button class="botao">Salvar cronograma</button>
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
        </div>
      </form>`;
    } else if (m.tipo === "catx") {
      corpo = `
      <form data-f="catx-criar" data-id="${m.aba}">
        <h2 class="titulo">Nova categoria</h2>
        <p class="explica">Depois de criar, coloque a capa e escolha os cursos que ficam dentro dela.</p>
        <div class="campos"><label class="grupo nome"><span class="rotulo">Nome da categoria</span><input id="catxNovaNome" class="campo" name="nome" maxlength="80" required /></label></div>
        <div class="rodape-modal"><button class="botao">Criar</button><button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button></div>
      </form>`;
      if (!ui.focar) ui.focar = "catxNovaNome";
    } else if (m.tipo === "curso") {
      corpo = `
      <form data-f="curso-novo">
        <h2 class="titulo">Criar novo curso</h2>
        <p class="explica">O curso fica dentro da categoria escolhida. Depois de criar, ele abre para você montar módulos e aulas.</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input id="cursoNome" class="campo" name="nome" required /></label>
          <label class="grupo" style="flex:1 1 220px"><span class="rotulo">Categoria</span>
            <select class="campo" name="cat" required>${opcoesCatAba(m.catAba || "")}</select>
          </label>
        </div>
        <div class="rodape-modal"><button class="botao">Criar</button><button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button></div>
      </form>`;
      if (!ui.focar) ui.focar = "cursoNome";
    } else if (m.tipo === "confirmar") {
      corpo = `
      <form data-f="confirmar">
        <h2 class="titulo">${h(m.titulo)}</h2>
        <p class="explica">${h(m.texto)}</p>
        <label class="grupo"><span class="rotulo">Para confirmar, escreva ${h(m.palavra)}</span><input id="confirmaPalavra" class="campo" autocomplete="off" data-palavra="${h(m.palavra)}" /></label>
        <div class="rodape-modal">
          <button id="confirmaBotao" class="botao perigo" disabled>${h(m.rotulo || "Confirmar")}</button>
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
        </div>
      </form>`;
    } else if (m.tipo === "desfazer") {
      corpo = `
        <h2 class="titulo">Desfazer alterações</h2>
        <p class="explica">As últimas ${p(pilha.length, "alteração", "alterações")} desta sessão, da mais recente para a mais antiga. Volta uma de cada vez, sempre a mais recente. Remoções não voltam.</p>
        ${pilha.map((x, i) => `<div class="mini"><span class="nome"><b class="${i ? "leve" : ""}">${i ? "" : "→ "}${h(x.texto)}</b><span>${dataHora(x.quando)}</span></span></div>`).join("") || semNada("Nada para desfazer.")}
        <div class="rodape-modal">
          ${pilha.length ? `<button type="button" class="botao" data-a="desfazer-confirmar">Desfazer: ${h(pilha[0].texto)}</button>` : ""}
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
        </div>`;
    } else if (m.tipo === "sugestoes") {
      corpo = `
      <form data-f="sugestao">
        <h2 class="titulo">Sugestões da equipe</h2>
        <p class="explica">Viu algo que poderia funcionar melhor? Escreva aqui — a coordenação lê tudo.</p>
        <textarea id="sugestaoCampo" class="campo" name="texto" rows="3" style="width:100%" placeholder="Ex.: muitas alunas não sabem abrir o vídeo pelo celular" required></textarea>
        <div class="rodape-modal" style="margin-top:12px"><button class="botao">Enviar sugestão</button><button type="button" class="botao-neutro grande" data-a="fechar">Fechar</button></div>
      </form>
      <div style="margin-top:18px">
        ${S.sugestoes.map((x) => `<div class="mini"><span class="nome"><b class="leve">${h(x.texto)}</b><span>${h(x.quem)} · ${dataHora(x.quando)}</span></span>${eu!.papel === "Dono" || x.autorId === eu!.id ? `<span class="acoes"><button class="botao-neutro botao-remover" data-a="sugestao-remover" data-id="${x.id}">Remover</button></span>` : ""}</div>`).join("") || semNada("Nenhuma sugestão ainda.")}
      </div>`;
      if (!ui.focar) ui.focar = "sugestaoCampo";
    } else if (m.tipo === "contato") {
      const a = aluna(m.id);
      const ant = a.contatos.slice().reverse();
      corpo = `
      <form data-f="contato" data-id="${a.id}">
        <h2 class="titulo">Registrar contato</h2>
        <p class="explica">${h(a.nome)}${a.celular ? " · " + h(fone(a.celular)) : ""}. Anote como foi para ninguém da equipe ligar duas vezes.</p>
        <p class="rotulo" style="margin:0 0 6px">Como foi</p>
        ${["Atendeu e vai voltar", "Não atendeu", "Pediu ajuda para entrar", "Mandei recado no WhatsApp", "Não quer continuar"].map((x, i) => `<label class="marcar"><input type="radio" name="resultado" value="${x}" ${i === 0 ? "checked" : ""} /> ${x}</label>`).join("")}
        <label class="grupo largo" style="margin-top:14px"><span class="rotulo">Observação (opcional)</span><textarea class="campo" name="obs" rows="2" placeholder="Ex.: ligar de novo na quinta à tarde"></textarea></label>
        ${ant.length ? `<p class="rotulo" style="margin:18px 0 2px">Contatos anteriores</p>${ant.slice(0, 4).map((c) => `<div class="mini"><span class="nome"><b class="leve">${h(c.resultado)}${c.obs ? " — " + h(c.obs) : ""}</b><span>${h(c.quem)} · ${dataHora(c.quando)}</span></span></div>`).join("")}` : ""}
        <div class="rodape-modal"><button class="botao">Salvar contato</button><button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button></div>
      </form>`;
    } else if (m.tipo === "equipe-editar") {
      const e = pessoa(m.id);
      const papeis: Papel[] = eu?.papel === "Dono" ? ["Suporte", "Administrador"] : ["Suporte"];
      corpo = `
      <form data-f="equipe-editar" data-id="${e.id}">
        <h2 class="titulo">Editar ${h(e.nome)}</h2>
        <p class="explica">O login e o código são o que ${h(primeiroNome(e.nome))} digita para entrar no painel. Código vazio continua o mesmo.</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input class="campo" name="nome" value="${h(e.nome)}" autocomplete="off" required /></label>
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Login</span><input class="campo" name="login" value="${h(e.login)}" autocomplete="off" required /></label>
          ${gere(e) ? `<label class="grupo" style="flex:1 1 200px"><span class="rotulo">Papel</span><select class="campo" name="papel">${papeis.map((x) => `<option ${x === e.papel ? "selected" : ""}>${x}</option>`).join("")}</select></label>` : ""}
          <label class="grupo" style="flex:1 1 160px"><span class="rotulo">Código</span><input class="campo" name="codigo" inputmode="numeric" maxlength="6" value="${h(e.codigo ?? "")}" placeholder="${e.codigo != null ? "4 a 6 números" : "vazio mantém o atual"}" autocomplete="off" /></label>
        </div>
        <div class="rodape-modal">
          <button class="botao">Salvar</button>
          <button type="button" class="botao-neutro grande" data-a="fechar">Cancelar</button>
        </div>
      </form>`;
    } else if (m.tipo === "info") {
      corpo = `
        <h2 class="titulo">${h(m.titulo)}</h2>
        <p class="explica">${h(m.texto)}</p>
        ${m.destaque ? `<p style="margin:0 0 6px;font-size:40px;font-weight:700;letter-spacing:.3em">${h(m.destaque)}</p>` : ""}
        <div class="rodape-modal"><button type="button" class="botao" data-a="fechar">Fechar</button></div>`;
    }
    return `<div class="modal-fundo" data-a="fechar-fundo"><div class="modal" role="dialog" aria-modal="true">${corpo}</div></div>`;
  }

  /* ---------- AÇÕES ---------- */
  const rpc = async (nome: string, args: Record<string, unknown>) => falhou(await supabase.rpc(nome, args)).data;

  function acao(a: string, d: Record<string, string>, el: HTMLElement, alvo: EventTarget | null) {
    const al = d.id ? S.alunas.find((x) => x.id === d.id) : undefined;
    if (a !== "menu") ui.menu = null;
    if (a !== "ajuda") ui.ajuda = null;
    if (a !== "eng-menu") ui.engMenu = "";
    if (a !== "cur-menu") ui.curMenu = "";
    if (a !== "cur-al-menu") ui.curAlMenu = "";
    switch (a) {
      case "inicio-acessos": ui.inicioVista = "acessos"; ui.acessoLista = ""; ui.acessoAluna = null; window.scrollTo(0, 0); break;
      case "inicio-voltar": ui.inicioVista = ""; ui.acessoLista = ""; ui.acessoAluna = null; window.scrollTo(0, 0); break;
      case "aa-lista": if (ui.acessoLista !== d.v) ui.aaAnima = "lista"; ui.acessoLista = d.v; ui.acessoAluna = null; break;
      case "aa-fechar-lista": if (a === "aa-fechar-lista" && alvo !== el && el.classList.contains("aa-fundo")) return; ui.acessoLista = ""; ui.acessoAluna = null; break;
      case "aa-aluna": ui.acessoAluna = d.id; ui.acessoAba = d.v || "geral"; ui.aaAnima = "aluna"; break;
      case "aa-fechar-aluna": if (alvo !== el && el.classList.contains("aa-fundo")) return; ui.acessoAluna = null; break;
      case "aa-aba": ui.acessoAba = d.v; break;
      case "aba":
        ui.inicioVista = ""; ui.acessoLista = ""; ui.acessoAluna = null;
        ui.tab = d.v; ui.editando = null; ui.addAula = null; ui.respondendo = null;
        if (d.v === "curso" && !curso(ui.curso)) ui.curso = S.cursos[0] ? S.cursos[0].id : null;
        window.scrollTo(0, 0);
        break;
      case "tema": tema = tema === "claro" ? "escuro" : "claro"; try { localStorage.setItem(KT, tema); } catch { /* sem armazenamento */ } aplicarTema(); break;
      case "sair":
        void api.sair().finally(() => { eu = null; ui.focar = loginSalvo() ? "codigoCampo" : "loginCampo"; render(); });
        return;
      case "fechar": case "fechar-esc": ui.modal = null; pend = null; break;
      case "fechar-fundo": if (alvo !== el) return; ui.modal = null; pend = null; break;

      case "aluna-nova": ui.modal = { tipo: "aluna", codigo: novoCodigo() }; break;
      case "ficha": ui.tab = "ficha"; ui.ficha = d.id; ui.modal = null; ui.verCodigo = null; window.scrollTo(0, 0); break;
      case "editar-aluna": ui.modal = { tipo: "aluna", id: d.id }; break;
      case "desfazer-abrir": ui.modal = { tipo: "desfazer" }; break;
      case "desfazer-confirmar": {
        const x = pilha.shift(); ui.modal = null;
        if (x) void executar(async () => { await x.fn(); await registrar(null, "Desfez: " + x.texto); return "Desfeito: " + x.texto + "."; });
        return;
      }
      case "ver-codigo-aluna": ui.verCodigo = ui.verCodigo === d.id ? null : d.id; break;
      case "ir-moderar": ui.tab = "comentarios"; ui.filtroCom = "moderar"; window.scrollTo(0, 0); break;
      case "menu": ui.menu = ui.menu === d.id ? null : d.id; break;
      case "al-filtro": ui.filtroAl = d.v; ui.paginaAl = 1; break;
      case "sel-limpar": ui.sel = []; break;
      case "lote-remover": {
        const ids = ui.sel.filter((id) => S.alunas.some((x) => x.id === id));
        if (!ids.length) break;
        const todas = ids.length === S.alunas.length;
        const qtd = p(ids.length, "aluna", "alunas");
        confirmar({
          titulo: todas ? "Remover todas as " + qtd + "?" : ids.length === 1 ? "Remover " + aluna(ids[0]).nome + "?" : "Remover as " + qtd + " selecionadas?",
          texto: "As fichas, as liberações e os cronogramas são apagados. Não dá para desfazer.",
          palavra: "REMOVER",
          rotulo: todas ? "Remover todas" : "Remover " + qtd,
        }, async () => {
          // Uma por vez, pela mesma função da remoção individual: o banco
          // confere a permissão em cada uma, e uma recusa não leva as outras.
          const removidas: string[] = []; const falhas: string[] = [];
          for (const id of ids) {
            const nome = aluna(id).nome;
            try { await rpc("remover_aluna", { p_aluna: id }); removidas.push(id); } catch { falhas.push(nome); }
          }
          ui.sel = ui.sel.filter((x) => !removidas.includes(x));
          if (removidas.length) await registrar(null, "Removeu em lote " + p(removidas.length, "aluna", "alunas"));
          return p(removidas.length, "aluna removida", "alunas removidas") + "." + (falhas.length ? " Não removidas: " + falhas.join(", ") + "." : "");
        });
        break;
      }
      case "eng-filtro": ui.filtroEng = d.v; break;
      case "guia-eng": ui.guiaEng = !ui.guiaEng; break;
      case "ajuda": ui.ajuda = ui.ajuda === d.v ? null : d.v; break;
      case "contato": ui.modal = { tipo: "contato", id: d.id }; break;
      case "sugestoes": ui.modal = { tipo: "sugestoes" }; break;
      case "sugestao-remover":
        confirmar({ titulo: "Remover esta sugestão?", texto: "Ela sai da lista da equipe.", palavra: "REMOVER", rotulo: "Remover sugestão" }, async () => {
          falhou(await supabase.from("sugestoes").delete().eq("id", d.id).select("id").single());
          ui.modal = { tipo: "sugestoes" }; return "Sugestão removida.";
        });
        break;
      case "busca-ir": {
        ui.buscaGeral = ""; ui.buscaAberta = false; ui.modal = null; ui.editando = null;
        if (d.k === "aluna") { ui.tab = "ficha"; ui.ficha = d.id; ui.verCodigo = null; }
        else if (d.k === "curso") { ui.curso = d.id; ui.tab = "curso"; }
        else if (d.k === "aula") { const x = acharAula(d.id); if (x) { ui.aula = d.id; ui.curso = x.c.id; ui.tab = "aula"; } }
        else if (d.k === "comentario") { const k = S.comentarios.find((x) => x.id === d.id); ui.tab = "comentarios"; ui.respondendo = null; if (k) ui.filtroCom = k.estado; }
        window.scrollTo(0, 0);
        break;
      }
      case "equipe-editar": ui.modal = { tipo: "equipe-editar", id: d.id }; break;
      case "copiar-acesso-equipe": {
        const e = pessoa(d.id);
        const txt = "Nome: " + e.nome + "\nLogin: " + e.login + "\nCódigo: " + (e.codigo ?? "");
        const falha = () => toast("Login " + e.login + " · código " + (e.codigo ?? ""));
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast("Nome, login e código de " + primeiroNome(e.nome) + " copiados."), falha); else falha();
        return;
      }
      case "copiar-acesso": {
        const txt = "Login: " + al!.login + "\nCódigo: " + al!.codigo;
        const ok = () => toast("Login e código de " + primeiroNome(al!.nome) + " copiados.");
        const falha = () => toast("Login " + al!.login + " · código " + al!.codigo);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, falha); else falha();
        return;
      }
      case "whatsapp": case "whatsapp-volta": {
        if (!al!.celular) { toast("Cadastre o WhatsApp dela em Editar dados."); return; }
        const nome = primeiroNome(al!.nome);
        const ult = al!.ultimaAula ? acharAula(al!.ultimaAula) : null;
        const msg = a === "whatsapp"
          ? "Olá, " + nome + "! Este é o seu acesso à área de membros da mentoria.\n\nLogin: " + al!.login + "\nCódigo: " + al!.codigo + "\n\nQualquer dúvida, é só me chamar por aqui."
          : "Olá, " + nome + "! Sentimos sua falta na mentoria." + (ult ? " Sua próxima aula está esperando: " + ult.a.nome + "." : "") + "\n\nSe tiver qualquer dificuldade para entrar, me chame por aqui.";
        // Abre antes de qualquer espera: o navegador só deixa abrir janela no clique.
        window.open("https://wa.me/55" + al!.celular.replace(/\D/g, "") + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
        void executar(async () => {
          if (a === "whatsapp") await registrar(al!.id, "Acesso enviado pelo WhatsApp");
          else {
            falhou(await supabase.from("contatos_aluna").insert({ aluna_id: al!.id, canal: "whatsapp", resultado: "Mandei recado no WhatsApp" }));
            await registrar(al!.id, "Recado de retorno enviado pelo WhatsApp");
          }
        });
        return;
      }
      case "nota-remover":
        confirmar({ titulo: "Remover esta anotação?", texto: "Ela sai da ficha de " + al!.nome + ".", palavra: "REMOVER", rotulo: "Remover anotação" }, async () => {
          falhou(await supabase.from("anotacoes_aluna").delete().eq("id", d.v).select("id").single());
          await registrar(al!.id, "Anotação removida"); return "Anotação removida.";
        });
        break;
      case "exportar": {
        const { f, lista } = listaAlunas();
        if (!lista.length) { toast("Não há alunas na lista para exportar."); return; }
        const cab = ["Nome", "Login", "Código", "WhatsApp", "Situação", "Entrada", "Acesso até", "Aulas liberadas", "Aulas concluídas", "Último acesso", "Engajamento"];
        const cel = (x: unknown) => { const t = String(x == null ? "" : x); return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const linhas = lista.map((x) => [x.nome, x.login, x.codigo, fone(x.celular), sitInfo(situacao(x))[0], br(x.entrada), br(x.validade), x.liberadas, x.concluidas, x.ultimoAcesso ? br(x.ultimoAcesso) : "nunca", x.nota].map(cel).join(";"));
        const csv = "\ufeff" + [cab.join(";")].concat(linhas).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const l = document.createElement("a");
        l.href = url; l.download = "alunas-" + f[0] + "-" + hoje() + ".csv";
        document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
        void executar(async () => {
          await registrar(null, "Exportou a lista de alunas (" + p(linhas.length, "aluna", "alunas") + ")");
          return "Planilha com " + p(linhas.length, "aluna", "alunas") + " baixada.";
        });
        return;
      }
      case "gerar-codigo": ((el.closest("form") as HTMLFormElement).elements.namedItem("codigo") as HTMLInputElement).value = novoCodigo(); return;
      case "liberar": ui.modal = { tipo: "liberar", id: d.id }; break;
      case "cronograma": ui.modal = { tipo: "cronograma", id: d.id }; break;
      case "preencher-datas": {
        const form = el.closest("form") as HTMLFormElement;
        const n = Math.max(1, parseInt((document.getElementById("intervaloDias") as HTMLInputElement).value, 10) || 1);
        const inicio = (document.getElementById("intervaloInicio") as HTMLInputElement).value || hoje();
        const ids = aulasDaLiberacao(aluna(d.id));
        ids.forEach((id, i) => { const c = form.elements.namedItem("dt_" + id) as HTMLInputElement | null; if (c) c.value = maisDias(inicio, i * n); });
        form.querySelectorAll("details").forEach((x) => { x.open = true; });
        toast(ids.length ? p(ids.length, "data preenchida", "datas preenchidas") + ". Confira e salve." : "Ela ainda não tem aulas liberadas.");
        return;
      }
      case "copiar-liberacao": {
        const form = el.closest("form") as HTMLFormElement;
        const mod = aluna((document.getElementById("copiarDe") as HTMLSelectElement).value); if (!mod) return;
        const ac = mod.acesso;
        S.cursos.forEach((c) => {
          const cOn = ac.cursos.includes(c.id);
          const cx = form.querySelector<HTMLInputElement>('input[name="c"][value="' + c.id + '"]'); if (cx) cx.checked = cOn;
          c.modulos.forEach((mo) => {
            const mOn = cOn || ac.modulos.includes(mo.id);
            const mx = form.querySelector<HTMLInputElement>('input[name="m"][value="' + mo.id + '"]'); if (mx) mx.checked = mOn;
            mo.aulas.forEach((au) => {
              const ax = form.querySelector<HTMLInputElement>('input[name="a"][value="' + au.id + '"]'); if (ax) ax.checked = mOn || ac.aulas.includes(au.id);
            });
          });
        });
        toast("Liberação de " + mod.nome + " copiada. Confira e clique em Salvar liberação.");
        return;
      }
      case "copiar-cronograma": {
        const form = el.closest("form") as HTMLFormElement;
        const mod = aluna((document.getElementById("copiarDe") as HTMLSelectElement).value); if (!mod) return;
        // Os dias do módulo já contam da entrada de cada uma; as datas
        // fixas andam junto com a diferença entre as duas entradas.
        const desloca = mod.entrada && al!.entrada ? diasEntre(mod.entrada, al!.entrada) : 0;
        form.querySelectorAll<HTMLInputElement>('input[name^="d_"]').forEach((x) => {
          const n = mod.cronograma[x.name.slice(2)]; x.value = n != null ? String(n) : "";
        });
        form.querySelectorAll<HTMLInputElement>('input[name^="dt_"]').forEach((x) => {
          const dt = mod.datas[x.name.slice(3)]; x.value = dt ? maisDias(dt, desloca) : "";
        });
        form.querySelectorAll("details:not(.manual)").forEach((x) => { (x as HTMLDetailsElement).open = Object.keys(mod.datas).length > 0; });
        toast("Cronograma de " + mod.nome + " copiado" + (desloca && Object.keys(mod.datas).length ? ", com as datas ajustadas à entrada de " + al!.nome : "") + ". Confira e clique em Salvar cronograma.");
        return;
      }
      case "renovar": {
        const antes = al!.validade;
        void executar(async () => {
          const nova = br(diaDe(String(await rpc("renovar_acesso", { p_aluna: al!.id, p_dias: 0, p_meses: 0, p_anos: 1 }))));
          await registrar(al!.id, "Acesso renovado até " + nova);
          return {
            msg: "Acesso de " + al!.nome + " renovado até " + nova + ".", texto: "renovação de " + al!.nome,
            desfazer: antes ? async () => { await rpc("definir_validade", { p_aluna: al!.id, p_validade: fimDoDia(antes) }); } : undefined,
          };
        });
        return;
      }
      case "bloquear-aluna":
        confirmar({ titulo: "Bloquear " + al!.nome + "?", texto: "Ela perde o acesso na hora, em qualquer aparelho. Dá para desbloquear depois.", palavra: "BLOQUEAR", rotulo: "Bloquear aluna" }, async () => {
          await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "bloqueada" });
          await registrar(al!.id, "Aluna bloqueada");
          return { msg: al!.nome + " foi bloqueada.", texto: "bloqueio de " + al!.nome, desfazer: async () => { await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "ativa" }); } };
        });
        break;
      case "desbloquear-aluna":
        void executar(async () => {
          await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "ativa" });
          await registrar(al!.id, "Aluna desbloqueada");
          return { msg: al!.nome + " foi desbloqueada.", texto: "desbloqueio de " + al!.nome, desfazer: async () => { await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "bloqueada" }); } };
        });
        return;
      case "remover-aluna":
        confirmar({ titulo: "Remover " + al!.nome + "?", texto: "A ficha, as liberações e o cronograma dela são apagados. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover aluna" }, async () => {
          await rpc("remover_aluna", { p_aluna: al!.id });
          await registrar(null, "Aluna removida: " + al!.nome);
          ui.sel = ui.sel.filter((x) => x !== al!.id); if (ui.tab === "ficha") ui.tab = "alunas";
          return al!.nome + " foi removida.";
        });
        break;

      case "cat-editar": ui.editando = { tipo: "cat", id: d.id }; ui.focar = "editarCampo"; break;
      case "mod-editar": ui.modPagina = d.id; ui.editando = null; ui.aulaMais = null; ui.addAula = null; window.scrollTo(0, 0); break;
      case "mod-pagina-voltar": {
        // Módulo novo que nunca foi salvo: sai sem deixar rascunho.
        const rasc = ui.novoMod && ui.novoMod === ui.modPagina ? ui.novoMod : ""; ui.novoMod = "";
        ui.modPagina = null; ui.editando = null; ui.cursoAba = "modulos"; window.scrollTo(0, 0);
        if (rasc) { void executar(async () => { falhou(await supabase.from("modulos").delete().eq("id", rasc).select("id")); return "Módulo novo descartado."; }); return; }
        break;
      }
      case "aula-mais": ui.aulaMais = ui.aulaMais === d.id ? null : d.id; break;
      case "aula-duplicar": { const x = acharAula(d.id)!; void executar(async () => { const novo = await rpc("duplicar_aula", { p_aula: x.a.id }) as string; return { msg: "Aula duplicada.", texto: "cópia da aula " + x.a.nome, desfazer: async () => { falhou(await supabase.from("aulas").delete().eq("id", novo).select("id").single()); } }; }); return; }
      case "aula-editar": ui.editando = { tipo: "aula", id: d.id }; ui.focar = "editarCampo"; break;
      case "cancelar-edicao": ui.editando = null; break;
      case "cat-sobe": case "cat-desce": {
        const nova = trocado(S.cats, S.cats.findIndex((k) => k.id === d.id), a === "cat-sobe" ? -1 : 1);
        const velha = S.cats.map((k) => k.id);
        if (nova) void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: nova.map((k) => k.id) }); return { msg: "Ordem das categorias salva.", texto: "ordem das categorias", desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: velha }); } }; });
        return;
      }
      case "cat-remover": {
        const k = cat(d.id)!; const n = S.cursos.filter((c) => c.cat === k.id).length;
        if (n) { toast("O botão " + k.nome + " tem " + p(n, "categoria", "categorias") + ". Mude-as de botão antes de remover."); return; }
        confirmar({ titulo: "Remover o botão " + k.nome + "?", texto: "Ela está vazia.", palavra: "REMOVER", rotulo: "Remover botão" }, async () => {
          falhou(await supabase.from("categorias").delete().eq("id", k.id)); toast("Botão removido.");
        });
        break;
      }

      case "foto-aluna-escolher": fotoPara = d.id; arquivoFoto.click(); return;
      case "foto-aluna-ajustar": {
        const al = S.alunas.find((x) => x.id === d.id); if (!al) return;
        void (async () => {
          const r = await supabase.from("fotos_aluna").select("original, ajuste").eq("aluna_id", al.id).maybeSingle();
          if (!r.data?.original || !r.data.ajuste) { fotoPara = al.id; arquivoFoto.click(); return; }
          await abrirEditorFoto(al, r.data.original, r.data.ajuste as Ajuste);
        })();
        return;
      }
      case "foto-aluna-remover": {
        const al = S.alunas.find((x) => x.id === d.id)!;
        confirmar({ titulo: "Remover a foto de " + al.nome + "?", texto: "No lugar dela volta a aparecer a inicial do nome, aqui e na área de membros.", palavra: "REMOVER", rotulo: "Remover foto" }, async () => {
          await rpc("salvar_foto_aluna", { p_aluna: al.id, p_foto: null, p_original: null, p_ajuste: null });
          delete fotosCache[al.id];
          await registrar(al.id, "Removeu a foto");
          return { msg: "Foto removida.", texto: "foto de " + al.nome };
        });
        break;
      }
      case "ini-periodo": ui.periodoAberto = !ui.periodoAberto; break;
      case "eng-menu": ui.engMenu = ui.engMenu === d.id ? "" : d.id; break;
      case "cur-menu": ui.curMenu = ui.curMenu === d.id ? "" : d.id; break;
      case "cur-vista": ui.cursoVista = d.v; break;
      case "curso-aba": ui.cursoAba = d.v; ui.csAddMod = false; window.scrollTo(0, 0); break;
      case "cs-add-mod": {
        // Cria o módulo (ainda desativado) e abre a página completa; salvar ativa, cancelar descarta.
        const c = curso(ui.curso); if (!c) return; const ult = c.modulos[c.modulos.length - 1];
        void executar(async () => {
          const r = falhou(await supabase.from("modulos").insert({ produto_id: c.id, numero: proxNumModulo(c), titulo: "NOVO MÓDULO", rotulo: ult?.rot || "Módulo", publicado: false }).select("id").single());
          ui.novoMod = r.data!.id; ui.modPagina = r.data!.id; ui.focar = "editarCampo"; window.scrollTo(0, 0);
          return "Preencha o módulo e clique em Salvar módulo.";
        });
        return;
      }
      case "cs-sit": ui.csSit = d.v; ui.csPag = 1; break;
      case "cs-com-filtro": ui.csComFiltro = d.v; break;
      case "cs-com-per": ui.csComPer = d.v; break;
      case "cs-com-ver": { const k = S.comentarios.find((x) => x.id === d.id); if (!k) return; ui.cursoAba = "comentarios"; ui.csComFiltro = k.estado; ui.comAlvo = k.id; render(); document.getElementById("com-" + k.id)?.scrollIntoView({ block: "center" }); return; }
      case "cs-capa-direto": {
        const cid = d.id; const inp = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
        inp.onchange = async () => { const f0 = inp.files?.[0]; if (!f0) return; const f = await editarCapa(f0, 16 / 9, f0.name); if (!f) return; toast("Enviando a capa…");
          void executar(async () => { const caminho = await enviarArquivo("capas", "cursos", f); const c = curso(cid)!; const velha = c.capa || null; falhou(await supabase.from("produtos").update({ capa_path: caminho }).eq("id", cid).select("id").single()); return { msg: "Capa do curso trocada.", texto: "capa de " + c.nome, desfazer: async () => { falhou(await supabase.from("produtos").update({ capa_path: velha }).eq("id", cid).select("id").single()); } }; }); };
        inp.click(); return;
      }
      case "cs-pag": ui.csPag = Math.max(1, Number(d.v) || 1); break;
      case "cs-add-aluna": ui.csAddAluna = !ui.csAddAluna; break;
      case "cs-add-aluna-fundo": if (alvo !== el) return; ui.csAddAluna = false; break;
      case "cs-add-aluna-ir": { const sel = document.getElementById("csAlunaNova") as HTMLSelectElement | null; ui.csAddAluna = false; if (sel && sel.value) { render(); acao("liberar", { id: sel.value }, el, alvo); return; } break; }
      case "cs-ver-aluna": window.open("/", "_blank", "noopener"); return;
      case "rel-per": ui.relPer = d.v; if (d.v === "perso" && !ui.relDe) { ui.relDe = diaDe(new Date(Date.now() - 6 * 864e5)); ui.relAte = hoje(); } break;
      case "rel-exportar": {
        const c = curso(ui.curso); const rr = relCurso && relCurso.r; if (!c || !rr) return;
        const { de, ate } = periodoRel(); const t = rr.totais;
        const linhas = ["Relatório;" + c.nome, "Período;" + br(de) + " a " + br(ate), "", "Novas alunas;" + (t.novas || 0), "Aulas assistidas;" + (t.assistidas || 0), "Comentários;" + (t.comentarios || 0), "Curtidas;" + (t.curtidas || 0), "Minutos assistidos;" + (t.minutos || 0), "", "Dia;Novas alunas;Aulas assistidas"].concat(rr.dias.map((x) => br(x.dia) + ";" + x.novas + ";" + x.assistidas));
        const url = URL.createObjectURL(new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }));
        const el2 = Object.assign(document.createElement("a"), { href: url, download: "relatório - " + c.nome + ".csv" }); document.body.append(el2); el2.click(); el2.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast("Relatório exportado."); return;
      }
      case "cs-exportar-conteudo": {
        const c = curso(d.id || ui.curso); if (!c) return;
        const q = (x: string) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
        const linhas = ["Módulo;Aula;Vídeo;Capa;Tem texto;Instruções;Extras"].concat(c.modulos.filter((m) => !d.mod || m.id === d.mod).flatMap((m) => m.aulas.map((a) => [ "Módulo " + numModulo(c, c.modulos.indexOf(m)) + " — " + m.nome, a.nome, a.video, a.capa, a.texto ? "sim" : "não", a.exercicio ? "sim" : "não", String(a.extras.length)].map(q).join(";"))));
        const url = URL.createObjectURL(new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }));
        const el2 = Object.assign(document.createElement("a"), { href: url, download: "conteúdo - " + c.nome + (d.mod ? " - " + (acharModulo(d.mod)?.m.nome || "módulo") : "") + ".csv" }); document.body.append(el2); el2.click(); el2.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast("Conteúdo exportado."); return;
      }
      case "cs-duplicar": {
        const c = curso(d.id); if (!c) return;
        void executar(async () => { const novo = String(await rpc("duplicar_produto", { p_produto: c.id })); return { msg: "Curso duplicado. A cópia está oculta para as alunas.", texto: "cópia de " + c.nome, desfazer: async () => { await rpc("remover_produto", { p_produto: novo }); } }; });
        return;
      }
      case "mod-duplicar": {
        const x = acharModulo(d.id); if (!x) return;
        void executar(async () => { await rpc("duplicar_modulo", { p_modulo: x.m.id }); return "Módulo duplicado. A cópia foi para o fim da lista."; });
        return;
      }
      case "cur-al-menu": ui.curAlMenu = ui.curAlMenu === d.id ? "" : d.id; break;
      case "cur-al-filtro": ui.curAlFiltro = ui.curAlFiltro === d.v ? "" : d.v; ui.curAlDe = ""; ui.curAlAte = ""; break;
      case "cur-exportar": {
        const c = curso(ui.curso); if (!c) return;
        const qb = norm(ui.curAlBusca || "").trim(), fs = SIT_CURSO[ui.csSit || "todas"][1];
        const linhas = alunasDoCurso(c).filter(({ a }) => fs(a) && (!qb || casa(qb, a.nome + " " + a.login + " " + a.email, a.celular))).sort((x, y) => y.incluida.localeCompare(x.incluida));
        const q = (x: string) => '"' + String(x).replace(/"/g, '""') + '"';
        const csv = ["Aluna;E-mail;Celular;Data de inclusão;Último acesso;Status;Progresso"].concat(linhas.map(({ a, incluida, pct }) => [a.nome, a.email, a.celular ? fone(a.celular) : "", dataHoraCurta(incluida), a.ultimoAcessoEm ? dataHoraCurta(a.ultimoAcessoEm) : "", sitInfo(situacao(a))[0], pct + "%"].map(q).join(";"))).join("\n");
        const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
        const el2 = Object.assign(document.createElement("a"), { href: url, download: "alunas - " + c.nome + ".csv" }); document.body.append(el2); el2.click(); el2.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast("Lista exportada."); return;
      }
      case "cur-cat": ui.cursoCat = d.v || ""; break;
      case "lay-aba": ui.layAba = d.v || ""; ui.layCat = ""; break;
      case "lay-cat": ui.layCat = d.v || ""; break;
      case "dest-gerenciar": ui.destAberto = !ui.destAberto; break;
      case "catx-nova": ui.modal = { tipo: "catx", aba: d.id }; break;
      case "catx-nova-geral": { const jor = curso(S.config.jornada)?.cat || ""; const aba = (S.cats.find((k) => k.id !== jor) || S.cats[0])?.id || ""; if (!aba) { toast("Não há onde guardar a categoria."); return; } ui.modal = { tipo: "catx", aba }; break; }
      case "catx-filtro": ui.catxFiltro = d.v || ""; break;
      case "catx-entrar": ui.catxSel = d.id; ui.tab = "catAba"; ui.estMenu = ""; window.scrollTo(0, 0); break;
      case "lay-aba-ir": ui.layAba = d.v; ui.tab = "layout"; window.scrollTo(0, 0); break;
      case "catx-editar": ui.catxEditar = d.id; break;
      case "oc-aba": {
        const on = el.getAttribute("aria-pressed") !== "true"; el.setAttribute("aria-pressed", String(on));
        const g = document.querySelector<HTMLElement>('[data-oc-aba="' + d.id + '"]'); if (g) g.hidden = !on;
        const algum = !!document.querySelector('.oc-aba[aria-pressed="true"]'); const nada = document.querySelector<HTMLElement>(".oc-nada"); if (nada) nada.hidden = algum;
        const f = el.closest("form"); if (f) ui.sujo = { f: "curso-config", id: ui.curso || "" };
        return;
      }
      case "catx-item-add": {
        const x = catAba(d.id)!; const tipo = ui.catxTipo as "curso" | "modulo" | "aula"; const item = (document.getElementById("catxItem") as HTMLSelectElement | null)?.value || "";
        if (!item) { toast("Escolha o que vai entrar na categoria."); return; }
        const nome = nomeItem(tipo, item);
        void executar(async () => {
          const r = falhou(await supabase.from("categoria_itens").insert({ categoria_aba_id: x.id, tipo, item_id: item, ordem: itensDe(x.id).length }).select("id").single());
          await registrar(null, "Colocou " + nome + " na categoria " + x.nome);
          return { msg: nome + " agora está na categoria " + x.nome + ".", texto: "item da categoria " + x.nome, desfazer: async () => { falhou(await supabase.from("categoria_itens").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "catx-item-tirar": {
        const it = S.catItens.find((y) => y.id === d.id)!; const x = catAba(it.cat); const nome = nomeItem(it.tipo, it.item);
        void executar(async () => {
          falhou(await supabase.from("categoria_itens").delete().eq("id", it.id).select("id").single());
          await registrar(null, "Tirou " + nome + " da categoria " + (x?.nome || ""));
          return { msg: nome + " saiu da categoria " + (x?.nome || "") + ". Nas outras categorias, continua.", texto: "item da categoria " + (x?.nome || ""), desfazer: async () => { falhou(await supabase.from("categoria_itens").insert({ categoria_aba_id: it.cat, tipo: it.tipo, item_id: it.item }).select("id").single()); } };
        });
        return;
      }
      case "catx-fechar": if (alvo !== el && el.classList.contains("aa-fundo")) return; delete previas["catx-" + ui.catxEditar]; ui.catxEditar = ""; ui.sujo = null; break;
      case "catx-imagem": imgPara = alvoCapa("catx", d.id); arquivoImg.click(); return;
      case "capa-editar": {
        // Editar a capa atual: arrastar, aproximar e salvar o recorte.
        if (d.v === "aula") { const x = ui.aula ? acharAula(ui.aula) : null; if (!x) return; const src = previas[x.a.id] || capaSite(x.a.capa); if (!src) { toast("Ainda não há capa. Use Alterar imagem."); return; } void (async () => { const pdf = document.querySelector<HTMLSelectElement>('select[name="tipo"]')?.value === "pdf"; const f = await editarCapa(src, pdf ? 2 / 3 : 16 / 9, "capa-aula"); if (f) enviarCapaAula(f); })(); return; }
        const alvoE = alvoCapa(d.v, d.id); if (!alvoE) return;
        const src = previas[alvoE.previa] || document.querySelector<HTMLImageElement>('[data-previa="' + alvoE.previa + '"] img')?.src || "";
        if (!src) { toast("Ainda não há capa. Use Alterar imagem."); return; }
        void (async () => { const f = await editarCapa(src, alvoE.prop || 16 / 9, alvoE.previa); if (f) enviarCapa(alvoE, f); })();
        return;
      }
      case "capa-tirar": {
        const alvoT = alvoCapa(d.v, d.id); if (!alvoT) return;
        const c = document.querySelector<HTMLInputElement>(alvoT.form + ' input[name="' + alvoT.campo + '"]'); if (c) c.value = "";
        delete previas[alvoT.previa]; const pv = document.querySelector<HTMLElement>('[data-previa="' + alvoT.previa + '"]'); if (pv) pv.innerHTML = "";
        toast("Capa tirada. Clique em Salvar para guardar."); return;
      }
      case "curso-novo-cat": ui.modal = { tipo: "curso", catAba: d.id }; ui.focar = "cursoNome"; break;
      case "catx-duplicar": {
        const x = catAba(d.id)!; const irmas = S.catsAba.filter((y) => y.aba === x.aba);
        void executar(async () => {
          const r = falhou(await supabase.from("categorias_aba").insert({ aba_id: x.aba, titulo: x.nome + " (cópia)", descricao: x.descricao || null, capa_path: x.capa || null, ordem: irmas.length, publicado: false }).select("id").single());
          const ids = irmas.map((y) => y.id); ids.splice(irmas.indexOf(x) + 1, 0, r.data!.id);
          await rpc("ordenar_lista", { p_tabela: "categorias_aba", p_ids: ids });
          await registrar(null, "Duplicou a categoria " + x.nome);
          return { msg: "Categoria duplicada. A cópia está oculta, sem cursos.", texto: "cópia da categoria " + x.nome, desfazer: async () => { falhou(await supabase.from("categorias_aba").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "catx-remover": {
        const x = catAba(d.id)!; const n = S.cursos.filter((c) => c.catAba === x.id).length;
        if (n) { toast("A categoria " + x.nome + " tem " + p(n, "curso", "cursos") + ". Mude-os de categoria antes de excluir."); return; }
        confirmar({ titulo: "Excluir a categoria " + x.nome + "?", texto: "Ela está vazia e sai do botão " + (cat(x.aba)?.nome || "") + ".", palavra: "EXCLUIR", rotulo: "Excluir categoria" }, async () => {
          falhou(await supabase.from("categorias_aba").delete().eq("id", x.id).select("id").single()); ui.catxEditar = ""; if (ui.catxSel === x.id) { ui.catxSel = ""; ui.tab = "layout"; } await registrar(null, "Excluiu a categoria " + x.nome); return "Categoria excluída.";
        });
        break;
      }
      case "aba-ren": ui.estMenu = ""; ui.abaRen = d.id || ""; if (d.id) ui.focar = "abaRenNome"; break;
      case "cat-criar": ui.modal = { tipo: "curso", cat: d.id, rotulo: "categoria" }; ui.focar = "cursoNome"; break;
      case "aba-nova-abrir": ui.abaNova = true; ui.focar = "abaNovaNome"; break;
      case "aba-nova-fechar": ui.abaNova = false; break;
      case "ini-periodo-rapido": {
        const hj = hoje(); const menos = (n: number) => diaDe(new Date(Date.now() - n * 864e5));
        ui.iniAte = hj; ui.iniDe = d.v === "hoje" ? hj : d.v === "7" ? menos(6) : d.v === "30" ? menos(29) : hj.slice(0, 8) + "01";
        ui.periodoAberto = false; break;
      }
      case "ini-periodo-aplicar": {
        const de = (document.getElementById("iniDe") as HTMLInputElement).value, ate = (document.getElementById("iniAte") as HTMLInputElement).value;
        if (!de || !ate || de > ate) { toast("Confira as datas: o início vem antes do fim."); return; }
        ui.iniDe = de; ui.iniAte = ate; ui.periodoAberto = false; break;
      }
      case "ini-lista": ui.iniLista = d.v; break;
      case "ini-lib": ui.iniLib = d.v; ui.iniLibTodas = false; break;
      case "ini-lib-todas": ui.iniLibTodas = !ui.iniLibTodas; break;
      case "ini-abrir-cat": ui.tab = "layout"; ui.catEditar = d.id; ui.catAnima = true; window.scrollTo(0, 0); break;
      case "ini-lista-fechar": if (alvo !== el && el.classList.contains("aa-fundo")) return; ui.iniLista = ""; break;
      case "ini-ativ-todas": ui.ativTodas = true; break;
      case "ini-ativ-fechar": if (alvo !== el && el.classList.contains("aa-fundo")) return; ui.ativTodas = false; break;
      case "ini-moderar": {
        const k = S.comentarios.find((x) => x.id === d.id); if (!k) return;
        ui.tab = "comentarios"; ui.filtroCom = k.estado; ui.comAlvo = k.id; ui.respondendo = null;
        render();
        const el2 = document.getElementById("com-" + k.id); if (el2) el2.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      case "ir-comentarios": ui.tab = "comentarios"; if (paraResponder().length) ui.filtroCom = "responder"; window.scrollTo(0, 0); break;
      case "ir-alunas-recentes": ui.tab = "alunas"; ui.filtroAl = "recentes"; ui.paginaAl = 1; window.scrollTo(0, 0); break;
      case "ini-abrir-aluna": ui.acessoAluna = d.id; ui.acessoAba = "geral"; break;
      case "vers-editar": ui.editando = { tipo: "vers", id: d.id }; ui.focar = "editarCampo"; break;
      case "vers-sobe": case "vers-desce": {
        const i = S.versiculos.findIndex((x) => x.id === d.id); const j = a === "vers-sobe" ? i - 1 : i + 1; if (j < 0 || j >= S.versiculos.length) return;
        const nova = S.versiculos.slice(); [nova[i], nova[j]] = [nova[j], nova[i]];
        void executar(async () => { for (let k = 0; k < nova.length; k++) falhou(await supabase.from("versiculos").update({ ordem: k + 1 }).eq("id", nova[k].id).select("id").single()); return "Ordem dos versículos salva."; });
        return;
      }
      case "vers-remover": {
        const x = S.versiculos.find((k) => k.id === d.id)!;
        confirmar({ titulo: "Remover este versículo?", texto: "“" + x.texto.slice(0, 120) + "” — " + x.ref, palavra: "REMOVER", rotulo: "Remover" }, async () => {
          falhou(await supabase.from("versiculos").delete().eq("id", x.id)); await registrar(null, "Removeu o versículo " + x.ref); return "Versículo removido.";
        });
        break;
      }
      case "dest-editar": ui.destEditar = d.id; break;
      case "dest-exibir": {
        const on = !S.config.exibirDestaques;
        void executar(async () => { falhou(await supabase.from("configuracoes").update({ exibir_destaques: on }).not("id", "is", null).select("id")); await registrar(null, (on ? "Exibiu" : "Escondeu") + " os destaques do Início"); return { msg: on ? "Os destaques aparecem no Início." : "Os destaques foram escondidos do Início.", texto: "exibição dos destaques", desfazer: async () => { falhou(await supabase.from("configuracoes").update({ exibir_destaques: !on }).not("id", "is", null).select("id")); } }; });
        return;
      }
      case "dest-duplicar": {
        const x = S.destaques.find((k) => k.id === d.id)!; const pos = S.destaques.indexOf(x);
        void executar(async () => {
          const r = falhou(await supabase.from("destaques_inicio").insert({ imagem_path: x.imagem || null, rotulo: x.rotulo, titulo: x.titulo + " (cópia)", descricao: x.descricao || null, botao: x.botao, destino: x.destino, categoria_id: x.destino === "categoria" && x.categoriaId ? x.categoriaId : null, categoria_nome: x.categoriaNome || null, icone: x.icone, cor: x.cor, visivel: false, ordem: S.destaques.length + 1 }).select("id").single());
          const ids = S.destaques.map((k) => k.id); ids.splice(pos + 1, 0, r.data!.id);
          for (let k = 0; k < ids.length; k++) falhou(await supabase.from("destaques_inicio").update({ ordem: k + 1 }).eq("id", ids[k]).select("id").single());
          await registrar(null, "Duplicou o destaque " + x.titulo);
          return { msg: "Destaque duplicado. A cópia está oculta.", texto: "cópia do destaque " + x.titulo, desfazer: async () => { falhou(await supabase.from("destaques_inicio").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "dest-fechar": if (alvo !== el && el.classList.contains("aa-fundo")) return; delete previas["dest-" + ui.destEditar]; ui.destEditar = null; ui.sujo = null; break;
      case "dest-imagem": imgPara = alvoCapa("dest", d.id); arquivoImg.click(); return;
      case "dest-estado": case "dest-visivel": {
        if (a === "dest-estado") { ui.estMenu = ""; const [id2, est] = d.v.split(":"); d.id = id2; if (S.destaques.find((k) => k.id === id2)?.visivel === (est === "ativa")) break; }
        const x = S.destaques.find((k) => k.id === d.id)!; const on = !x.visivel;
        void executar(async () => { falhou(await supabase.from("destaques_inicio").update({ visivel: on }).eq("id", x.id).select("id").single()); return { msg: on ? x.titulo + " aparece no Início." : x.titulo + " foi escondido do Início.", texto: "destaque " + x.titulo, desfazer: async () => { falhou(await supabase.from("destaques_inicio").update({ visivel: !on }).eq("id", x.id).select("id").single()); } }; });
        return;
      }
      case "dest-sobe": case "dest-desce": {
        const i = S.destaques.findIndex((x) => x.id === d.id); const j = a === "dest-sobe" ? i - 1 : i + 1; if (j < 0 || j >= S.destaques.length) return;
        const nova = S.destaques.slice(); [nova[i], nova[j]] = [nova[j], nova[i]];
        void executar(async () => { for (let k = 0; k < nova.length; k++) falhou(await supabase.from("destaques_inicio").update({ ordem: k + 1 }).eq("id", nova[k].id).select("id").single()); return "Ordem dos destaques salva."; });
        return;
      }
      case "dest-remover": {
        const x = S.destaques.find((k) => k.id === d.id)!;
        confirmar({ titulo: "Remover o destaque " + x.titulo + "?", texto: "O cartão sai do Início da área de membros. Se só quiser tirar por um tempo, use a chave Visível.", palavra: "REMOVER", rotulo: "Remover destaque" }, async () => {
          falhou(await supabase.from("destaques_inicio").delete().eq("id", x.id)); ui.destEditar = null; await registrar(null, "Removeu o destaque " + x.titulo); return "Destaque removido.";
        });
        break;
      }
      case "curso-capa": imgPara = alvoCapa("curso", d.id); arquivoImg.click(); return;
      case "curso-capa-tirar": { const f = document.querySelector<HTMLFormElement>('form[data-f="curso-config"]'); const c2 = f?.querySelector<HTMLInputElement>('input[name="capa"]'); if (c2) c2.value = ""; delete previas["cur-" + d.id]; const pv = document.querySelector<HTMLElement>('[data-previa="cur-' + d.id + '"]'); if (pv) pv.innerHTML = ""; toast("Capa tirada. Clique em Salvar para guardar."); return; }
      case "mod-capa-v": imgPara = alvoCapa("modv", d.id); arquivoImg.click(); return;
      case "mod-capa-h": imgPara = alvoCapa("modh", d.id); arquivoImg.click(); return;
      case "mod-capa-v-tirar": { const f = document.querySelector<HTMLFormElement>('form[data-f="mod-renomear"][data-id="' + d.id + '"]'); const c = f?.querySelector<HTMLInputElement>('input[name="capa"]'); if (c) c.value = ""; delete previas["modv-" + d.id]; const pv = document.querySelector<HTMLElement>('[data-previa="modv-' + d.id + '"]'); if (pv) pv.innerHTML = ""; toast("Capa tirada. Clique em Salvar módulo para guardar."); return; }
      case "mod-capa-h-tirar": { const f = document.querySelector<HTMLFormElement>('form[data-f="mod-renomear"][data-id="' + d.id + '"]'); const c = f?.querySelector<HTMLInputElement>('input[name="capaH"]'); if (c) c.value = ""; delete previas["modh-" + d.id]; const pv = document.querySelector<HTMLElement>('[data-previa="modh-' + d.id + '"]'); if (pv) pv.innerHTML = ""; toast("Capa tirada. Clique em Salvar módulo para guardar."); return; }
      case "al-pag": ui.paginaAl = Number(d.v) || 1; window.scrollTo(0, 0); break;
      case "cat-ver": if (ui.catVer.has(d.id)) ui.catVer.delete(d.id); else ui.catVer.add(d.id); break;
      case "cat-abrir-editar": ui.catEditar = d.id; ui.catAnima = true; break;
      case "cat-fechar-editar": {
        if (alvo !== el && el.classList.contains("aa-fundo")) return;
        const rascunho = ui.catNova && ui.catNova === ui.catEditar ? ui.catNova : "";
        delete previas["cat-" + ui.catEditar]; ui.catEditar = null; ui.sujo = null; ui.catNova = "";
        if (rascunho) { void executar(async () => { falhou(await supabase.from("categorias").delete().eq("id", rascunho).select("id").single()); return "Novo botão descartado."; }); return; }
        break;
      }
      case "cat-nova-foco": ui.focar = "catNova"; break;
      case "cat-vista": ui.catVista = d.v === "lista" ? "lista" : "cards"; break;
      case "cat-ordenar": ui.catOrdenar = !ui.catOrdenar; break;
      case "dest-ordenar": ui.destOrdenar = !ui.destOrdenar; break;
      case "previa-modo": ui.previa = d.v === "desktop" ? "desktop" : "mobile"; break;
      case "cat-nova": {
        // Nasce desativada; ao salvar, fica ativa. Fechar sem salvar apaga.
        void executar(async () => {
          const r = falhou(await supabase.from("categorias").insert({ titulo: "Novo botão", ordem: S.cats.length, publicado: false }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: [...S.cats.map((k) => k.id), r.data!.id] });
          ui.catNova = r.data!.id; ui.catEditar = r.data!.id; ui.catAnima = true; ui.focar = "catNome";
          return "Preencha a nova aba e salve.";
        });
        return;
      }
      case "cat-duplicar": {
        const k = cat(d.id)!; const pos = S.cats.indexOf(k);
        void executar(async () => {
          const r = falhou(await supabase.from("categorias").insert({ titulo: k.nome + " (cópia)", descricao: k.descricao || null, capa_path: k.capa || null, ordem: S.cats.length, publicado: false }).select("id").single());
          const ids = S.cats.map((x) => x.id); ids.splice(pos + 1, 0, r.data!.id);
          await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: ids });
          await registrar(null, "Duplicou o botão " + k.nome);
          return { msg: "Botão duplicado. A cópia está oculta, sem categorias.", texto: "cópia da aba " + k.nome, desfazer: async () => { falhou(await supabase.from("categorias").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "cat-imagem": arquivoCat.click(); return;
      case "cat-add-curso": ui.modal = { tipo: "curso", cat: d.id }; ui.focar = "cursoNome"; break;
      case "cat-visivel": {
        const k = cat(d.id)!; const mostrar = !k.visivel;
        const trabalho = async () => {
          falhou(await supabase.from("categorias").update({ bloqueada_geral: !mostrar }).eq("id", k.id).select("id").single());
          await registrar(null, (mostrar ? "Mostrou" : "Ocultou") + " a categoria " + k.nome);
          return { msg: mostrar ? k.nome + " está visível na área de membros." : k.nome + " foi ocultada da área de membros.", texto: "visibilidade da categoria " + k.nome, desfazer: async () => { falhou(await supabase.from("categorias").update({ bloqueada_geral: mostrar }).eq("id", k.id).select("id").single()); } };
        };
        if (mostrar) { void executar(trabalho); return; }
        confirmar({ titulo: "Ocultar " + k.nome + "?", texto: "A categoria e tudo o que está dentro dela somem da área de membros para todas as alunas, até você ligar de novo.", palavra: "OCULTAR", rotulo: "Ocultar categoria" }, trabalho);
        break;
      }
      case "abrir-curso": {
        ui.curso = d.id; ui.tab = "curso"; ui.editando = null; ui.modPagina = null; ui.cursoAba = d.v || "visao"; ui.curAlBusca = ""; ui.curAlFiltro = ""; ui.curAlDe = ""; ui.curAlAte = "";
        ui.abertos.clear(); // os módulos começam todos fechados
        window.scrollTo(0, 0); break;
      }
      case "curso-novo": ui.modal = { tipo: "curso" }; break;
      case "curso-cancelar": toast("Alterações descartadas."); break;
      case "curso-remover": {
        const c = curso(d.id)!;
        confirmar({ titulo: "Apagar o curso " + c.nome + "?", texto: "O curso, com " + p(c.modulos.length, "módulo", "módulos") + " e " + p(totalAulas(c), "aula", "aulas") + ", é apagado de vez, junto com as liberações, o progresso e os comentários das alunas nele. Não dá para desfazer. Para confirmar, escreva APAGAR.", palavra: "APAGAR", rotulo: "Apagar curso" }, async () => {
          await rpc("remover_produto", { p_produto: c.id }); ui.curso = null; ui.aula = null; ui.tab = "cursos"; toast("Curso apagado.");
        });
        break;
      }
      case "mod-bloquear": {
        const x = acharModulo(d.id)!;
        if (x.m.ativo) confirmar({ titulo: "Bloquear o módulo para todas?", texto: "Nenhuma aluna vê " + x.m.nome + " até você desbloquear.", palavra: "BLOQUEAR", rotulo: "Bloquear módulo" }, async () => {
          falhou(await supabase.from("modulos").update({ bloqueado_geral: true }).eq("id", x.m.id).select("id").single());
          return { msg: "Módulo bloqueado para todas.", texto: "bloqueio do módulo " + x.m.nome, desfazer: async () => { falhou(await supabase.from("modulos").update({ bloqueado_geral: false }).eq("id", x.m.id).select("id").single()); } };
        });
        else { void executar(async () => { falhou(await supabase.from("modulos").update({ bloqueado_geral: false }).eq("id", x.m.id).select("id").single()); return { msg: "Módulo desbloqueado.", texto: "desbloqueio do módulo " + x.m.nome, desfazer: async () => { falhou(await supabase.from("modulos").update({ bloqueado_geral: true }).eq("id", x.m.id).select("id").single()); } }; }); return; }
        break;
      }
      case "mod-sobe": case "mod-desce": {
        const x = acharModulo(d.id)!; const nova = trocado(x.c.modulos, x.i, a === "mod-sobe" ? -1 : 1);
        const velha = x.c.modulos.map((k) => k.id);
        if (nova) void executar(async () => { await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: nova.map((k) => k.id) }); return { msg: "Ordem dos módulos salva.", texto: "ordem dos módulos de " + x.c.nome, desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: velha }); } }; });
        return;
      }
      case "mod-remover": {
        const x = acharModulo(d.id)!;
        confirmar({ titulo: "Remover o módulo " + x.m.nome + "?", texto: "As " + p(x.m.aulas.length, "aula dele é apagada", "aulas dele são apagadas") + " junto. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover módulo" }, async () => {
          falhou(await supabase.from("modulos").delete().eq("id", x.m.id).select("id").single()); if (ui.modPagina === x.m.id) ui.modPagina = null; toast("Módulo removido.");
        });
        break;
      }
      case "mod-abrir-fechar": if (ui.abertos.has(d.id)) ui.abertos.delete(d.id); else ui.abertos.add(d.id); break;
      case "aula-add-abrir": {
        // Cria a aula (ainda desativada) e abre Editar aula completo; salvar ativa, voltar sem salvar descarta.
        const x = acharModulo(d.id); if (!x) return; const ult = x.m.aulas[x.m.aulas.length - 1];
        void executar(async () => {
          const r = falhou(await supabase.from("aulas").insert({ modulo_id: x.m.id, numero: proxNumAula(x.m), titulo: "Nova aula", rotulo: ult?.rot || "Aula", publicado: false }).select("id").single());
          ui.novaAula = r.data!.id; ui.aula = r.data!.id; ui.curso = x.c.id; ui.modPagina = x.m.id; ui.tab = "aula"; ui.aulaTipo = ""; ui.focar = "nomeAula"; window.scrollTo(0, 0);
          return "Preencha a aula e clique em Salvar aula.";
        });
        return;
      }
      case "aula-add-cancelar": ui.addAula = null; break;
      case "aula-sobe": case "aula-desce": {
        const x = acharAula(d.id)!; const nova = trocado(x.m.aulas, x.ai, a === "aula-sobe" ? -1 : 1);
        const velha = x.m.aulas.map((k) => k.id);
        if (nova) void executar(async () => { await rpc("ordenar_aulas", { p_modulo: x.m.id, p_ids: nova.map((k) => k.id) }); return { msg: "Ordem das aulas salva.", texto: "ordem das aulas de " + x.m.nome, desfazer: async () => { await rpc("ordenar_aulas", { p_modulo: x.m.id, p_ids: velha }); } }; });
        return;
      }
      case "abrir-aula": { const x = acharAula(d.id)!; ui.aula = d.id; ui.curso = x.c.id; ui.modPagina = x.m.id; ui.tab = "aula"; ui.aulaTipo = ""; window.scrollTo(0, 0); break; }
      case "aula-voltar-modulo": {
        const rasc = ui.novaAula && ui.novaAula === ui.aula ? ui.novaAula : ""; ui.novaAula = "";
        ui.modPagina = d.id; ui.tab = "curso"; ui.aula = null; window.scrollTo(0, 0);
        if (rasc) { void executar(async () => { falhou(await supabase.from("aulas").delete().eq("id", rasc).select("id")); return "Aula nova descartada."; }); return; }
        break;
      }
      case "aula-capa-tirar": { const cp = document.getElementById("campoCapa") as HTMLInputElement | null; if (cp) cp.value = ""; if (ui.aula) delete previas[ui.aula]; const pv = document.getElementById("previaCapa"); if (pv) pv.style.background = "linear-gradient(160deg,#2a2116,#0c0a07 65%)"; if (ui.aula) ui.sujo = { f: "aula", id: ui.aula }; toast("Capa tirada. Clique em Salvar aula para guardar."); return; }
      case "aula-liberar": {
        const x = acharAula(d.id)!; const liberar = x.a.acesso !== "liberada";
        void executar(async () => { await rpc("definir_liberada_geral", { p_aula: x.a.id, p_liberada: liberar }); return { msg: liberar ? "Aula liberada para todas." : "Liberação retirada.", texto: "liberação da aula " + x.a.nome, desfazer: async () => { await rpc("definir_liberada_geral", { p_aula: x.a.id, p_liberada: !liberar }); } }; });
        return;
      }
      case "aula-bloquear": {
        const x = acharAula(d.id)!;
        if (x.a.acesso === "bloqueada") { void executar(async () => { await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: false }); return { msg: "Aula desbloqueada.", texto: "desbloqueio da aula " + x.a.nome, desfazer: async () => { await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: true }); } }; }); return; }
        confirmar({ titulo: "Bloquear esta aula?", texto: "Nenhuma aluna vê " + x.a.nome + " até você desbloquear.", palavra: "BLOQUEAR", rotulo: "Bloquear aula" }, async () => {
          await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: true });
          return { msg: "Aula bloqueada.", texto: "bloqueio da aula " + x.a.nome, desfazer: async () => { await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: false }); } };
        });
        break;
      }
      case "aula-remover": {
        const x = acharAula(d.id)!;
        confirmar({ titulo: "Remover a aula " + x.a.nome + "?", texto: "O texto, o vídeo e os extras dela são apagados. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover aula" }, async () => {
          falhou(await supabase.from("aulas").delete().eq("id", x.a.id).select("id").single()); if (ui.aula === x.a.id) { ui.aula = null; ui.modPagina = x.m.id; if (ui.tab === "aula") ui.tab = "curso"; } toast("Aula removida.");
        });
        break;
      }

      case "voltar-sem-salvar": {
        const rasc = ui.novaAula && ui.novaAula === ui.aula ? ui.novaAula : ""; ui.novaAula = "";
        if (ui.aula) { delete previas[ui.aula]; const x = acharAula(ui.aula); if (x) ui.modPagina = x.m.id; } ui.tab = "curso"; ui.aula = null; window.scrollTo(0, 0);
        if (rasc) { void executar(async () => { falhou(await supabase.from("aulas").delete().eq("id", rasc).select("id")); return "Aula nova descartada."; }); return; }
        toast("Voltou sem salvar."); break;
      }
      case "escolher-capa": arquivoCapa.click(); return;
      case "enviar-arquivo": arquivoExtra.click(); return;
      case "op-add": {
        const box = document.querySelector<HTMLElement>("[data-ops]"); if (!box) return;
        const n = box.querySelectorAll("[data-op-bloco]").length;
        box.insertAdjacentHTML("beforeend", blocoOpcao(n + Date.now() % 100000, OPCAO_NOVA()));
        if (ui.aula) ui.sujo = { f: "aula", id: ui.aula };
        document.querySelectorAll<HTMLElement>("[data-ops] [data-op-tit]").forEach((x, k) => { x.textContent = (ORDINAL[k] || k + 2 + "ª") + " opção"; });
        box.querySelectorAll<HTMLInputElement>("[data-op-bloco]")[n]?.querySelector<HTMLInputElement>("[data-eb-nome]")?.focus();
        return;
      }
      case "mods-expandir": { const c = curso(d.id); if (c) c.modulos.forEach((m) => ui.abertos.add(m.id)); break; }
      case "mods-recolher": ui.abertos.clear(); break;
      case "estado-menu": {
        ui.estMenu = ui.estMenu === d.v ? "" : d.v; render();
        // As opções abrem sempre à vista: rola até elas se ficaram abaixo da tela.
        const mn = app.querySelector<HTMLElement>(".est3-menu");
        if (mn) { if (mn.getBoundingClientRect().right > window.innerWidth - 8) { mn.style.left = "auto"; mn.style.right = "0"; } mn.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        return;
      }
      case "estado-set": {
        const [tipo, id, novo] = d.v.split(":") as ["curso" | "mod" | "aula" | "cat" | "catx", string, Estado3]; ui.estMenu = "";
        const pub = novo !== "desativado", bloq = novo === "bloqueado";
        if (tipo === "catx") {
          const x = catAba(id); if (!x) break; const antes = { publicado: x.pub, bloqueada_geral: x.bloq };
          if (estado3(antes.publicado, antes.bloqueada_geral) === novo) break;
          const nome = novo === "ativo" ? "ativa" : novo === "bloqueado" ? "bloqueada" : "oculta";
          void executar(async () => { falhou(await supabase.from("categorias_aba").update({ publicado: pub, bloqueada_geral: bloq }).eq("id", id).select("id").single()); await registrar(null, "Deixou a categoria " + x.nome + " " + nome); return { msg: x.nome + ": " + nome + ".", texto: "estado da categoria " + x.nome, desfazer: async () => { falhou(await supabase.from("categorias_aba").update(antes).eq("id", id).select("id").single()); } }; });
          return;
        }
        if (tipo === "cat") {
          const k = cat(id); if (!k) break; const antes = { publicado: k.pub, bloqueada_geral: !k.visivel };
          if (estado3(antes.publicado, antes.bloqueada_geral) === novo) break;
          const nome = novo === "ativo" ? "ativa" : novo === "bloqueado" ? "bloqueada" : "oculta";
          void executar(async () => { falhou(await supabase.from("categorias").update({ publicado: pub, bloqueada_geral: bloq }).eq("id", id).select("id").single()); await registrar(null, "Deixou o botão " + k.nome + " " + nome); return { msg: k.nome + ": " + nome + ".", texto: "estado da aba " + k.nome, desfazer: async () => { falhou(await supabase.from("categorias").update(antes).eq("id", id).select("id").single()); } }; });
          return;
        }
        if (tipo === "curso") {
          const c = curso(id); if (!c) break; const antes = { publicado: c.visivel, bloqueado_geral: c.bloq };
          if (estado3(antes.publicado, antes.bloqueado_geral) === novo) break;
          void executar(async () => { falhou(await supabase.from("produtos").update({ publicado: pub, bloqueado_geral: bloq }).eq("id", id).select("id").single()); return { msg: c.nome + ": " + EST3[novo][0].toLowerCase() + ".", texto: "estado do curso " + c.nome, desfazer: async () => { falhou(await supabase.from("produtos").update(antes).eq("id", id).select("id").single()); } }; });
          return;
        }
        if (tipo === "mod") {
          const x = acharModulo(id); if (!x) break; const antes = { publicado: x.m.pub, bloqueado_geral: !x.m.ativo };
          if (estado3(antes.publicado, antes.bloqueado_geral) === novo) break;
          void executar(async () => { falhou(await supabase.from("modulos").update({ publicado: pub, bloqueado_geral: bloq }).eq("id", id).select("id").single()); return { msg: x.m.rot + " " + x.m.num + ": " + EST3[novo][0].toLowerCase() + ".", texto: "estado do módulo " + x.m.nome, desfazer: async () => { falhou(await supabase.from("modulos").update(antes).eq("id", id).select("id").single()); } }; });
          return;
        }
        const x = acharAula(id); if (!x) break; const bloqAntes = x.a.acesso === "bloqueada", pubAntes = x.a.pub;
        if (estado3(pubAntes, bloqAntes) === novo) break;
        void executar(async () => {
          if (bloq !== bloqAntes) await rpc("definir_bloqueio_aula", { p_aula: id, p_bloqueada: bloq });
          if (pub !== pubAntes) falhou(await supabase.from("aulas").update({ publicado: pub }).eq("id", id).select("id").single());
          return { msg: x.a.rot + " " + x.a.num + ": " + (novo === "ativo" ? "ativa" : novo === "bloqueado" ? "bloqueada" : "oculta") + ".", texto: "estado da aula " + x.a.nome, desfazer: async () => {
            if (bloq !== bloqAntes) await rpc("definir_bloqueio_aula", { p_aula: id, p_bloqueada: bloqAntes });
            if (pub !== pubAntes) falhou(await supabase.from("aulas").update({ publicado: pubAntes }).eq("id", id).select("id").single());
          } };
        });
        return;
      }
      case "op-arquivo": {
        const bl = el.closest<HTMLElement>("[data-op-bloco]"); const pdf = d.v === "pdf"; if (!bl) return;
        arquivoOp.accept = pdf ? "application/pdf,.pdf" : "audio/*";
        paraOp = { deposito: pdf ? "materiais" : "audios", pronto: (c) => { const i = bl.querySelector<HTMLInputElement>(`[data-op-arq="${d.v}"]`); if (i) i.value = c; } };
        arquivoOp.click(); return;
      }
      case "op-capa": {
        const bl = el.closest<HTMLElement>("[data-op-bloco]"); if (!bl) return;
        arquivoOp.accept = "image/*";
        paraOp = { deposito: "capas", pronto: (c) => { const i = bl.querySelector<HTMLInputElement>("[data-op-capa]"); if (i) i.value = c; const pv = bl.querySelector<HTMLElement>("[data-op-capa-previa]"); if (pv) pv.style.background = "url('" + urlDaCapa(c) + "') center/cover no-repeat"; } };
        arquivoOp.click(); return;
      }
      case "op-capa-tirar": { const bl = el.closest<HTMLElement>("[data-op-bloco]"); if (!bl) return; const i = bl.querySelector<HTMLInputElement>("[data-op-capa]"); if (i) i.value = ""; const pv = bl.querySelector<HTMLElement>("[data-op-capa-previa]"); if (pv) pv.style.background = ""; if (ui.aula) ui.sujo = { f: "aula", id: ui.aula }; toast("Capa tirada. Clique em Salvar aula para guardar."); return; }
      case "op-extra-tipo": {
        const bl = el.closest<HTMLElement>("[data-op-bloco]"); if (!bl) return; bl.dataset.opExtraTipo = d.v;
        bl.querySelectorAll<HTMLElement>('[data-a="op-extra-tipo"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === d.v)));
        const t = tipoDaTela(d.v as TipoExtra); const bt = bl.querySelector<HTMLElement>("[data-op-extra-bt]"); if (bt) bt.hidden = !t.deposito;
        const arq = bl.querySelector<HTMLInputElement>("[data-op-extra-arq]"); if (arq) arq.placeholder = t.banco === "link" ? "https://" : t.banco === "texto" ? "Escreva aqui" : t.banco === "video" ? "uid do Cloudflare Stream" : "Nenhum arquivo selecionado";
        return;
      }
      case "op-extra-arquivo": {
        const bl = el.closest<HTMLElement>("[data-op-bloco]"); if (!bl) return; const t = tipoDaTela((bl.dataset.opExtraTipo || TIPOS[3].tela) as TipoExtra); if (!t.deposito) return;
        arquivoOp.accept = "";
        paraOp = { deposito: t.deposito, pronto: (c, nome) => { const i = bl.querySelector<HTMLInputElement>("[data-op-extra-arq]"); if (i) i.value = c; const n = bl.querySelector<HTMLInputElement>("[data-op-extra-nome]"); if (n && !n.value) n.value = nome; } };
        arquivoOp.click(); return;
      }
      case "op-extra-add": {
        const bl = el.closest<HTMLElement>("[data-op-bloco]"); const x = ui.aula ? acharAula(ui.aula) : null; if (!bl || !x) return;
        const t = tipoDaTela((bl.dataset.opExtraTipo || TIPOS[3].tela) as TipoExtra);
        const nome = bl.querySelector<HTMLInputElement>("[data-op-extra-nome]")?.value.trim() || "", arq = bl.querySelector<HTMLInputElement>("[data-op-extra-arq]")?.value.trim() || "";
        if (!nome || !arq) { toast("Preencha o nome e o arquivo (ou o link) do conteúdo."); return; }
        const linha: Record<string, unknown> = { produto_id: x.c.id, aula_id: x.a.id, pai_id: d.id, tipo: t.banco, titulo: nome, ordem: 0, publicado: true };
        if (t.banco === "link") linha.url = arq; else if (t.banco === "texto") linha.texto = arq;
        else if (t.banco === "video") { const r = idDoVideo(arq); if (!r) { toast("Não reconheci o vídeo. Cole o link ou só o identificador."); return; } linha.video_ref = r; linha.video_provider = provedorDoLink(arq); }
        else linha.arquivo_path = arq;
        void executar(async () => { const r = falhou(await supabase.from("conteudos").insert(linha).select("id").single()); return { msg: "Conteúdo adicionado à opção.", texto: "conteúdo extra " + nome, desfazer: async () => { falhou(await supabase.from("conteudos").delete().eq("id", r.data!.id).select("id").single()); } }; });
        return;
      }
      case "op-extra-remover": {
        confirmar({ titulo: "Remover este conteúdo?", texto: "O conteúdo extra sai desta opção.", palavra: "REMOVER", rotulo: "Remover" }, async () => {
          falhou(await supabase.from("conteudos").delete().eq("id", d.id).select("id").single()); toast("Conteúdo removido.");
        });
        break;
      }
      case "op-tirar": {
        el.closest("[data-op-bloco]")?.remove();
        document.querySelectorAll<HTMLElement>("[data-ops] [data-op-tit]").forEach((x, k) => { x.textContent = (ORDINAL[k] || k + 2 + "ª") + " opção"; });
        if (ui.aula) ui.sujo = { f: "aula", id: ui.aula };
        return;
      }
      case "eb-padrao": { const c = document.querySelector<HTMLInputElement>('[data-eb="' + d.v + '"] [data-eb-cor]'); if (c) { c.value = COR_BOTAO; c.dispatchEvent(new Event("input", { bubbles: true })); } return; }
      case "aula-arquivo": arquivoAula.accept = (document.querySelector<HTMLSelectElement>('select[name="tipo"]')?.value === "pdf") ? "application/pdf,.pdf" : "audio/*"; arquivoAula.click(); return;
      case "extra-tipo": ui.extraTipo = d.v as TipoExtra; break;
      case "extra-remover": {
        const x = acharAula(ui.aula!)!; const e = x.a.extras.find((k) => k.id === d.id)!;
        confirmar({ titulo: "Remover " + e.nome + "?", texto: "O conteúdo extra sai desta aula.", palavra: "REMOVER", rotulo: "Remover" }, async () => {
          falhou(await supabase.from("conteudos").delete().eq("id", e.id).select("id").single()); toast("Conteúdo removido.");
        });
        break;
      }

      case "com-filtro": ui.filtroCom = d.v as Estado | "responder"; ui.respondendo = null; break;
      case "com-publicar": case "com-ocultar": {
        const k = S.comentarios.find((x) => x.id === d.id)!;
        const novo = a === "com-publicar" ? "publicado" : "oculto";
        const antes = k.estado === "moderar" ? "pendente" : k.estado;
        void executar(async () => {
          await rpc("moderar_comentario", { p_comentario: k.id, p_status: novo });
          await registrar(k.autoraId || null, (novo === "publicado" ? "Publicou" : "Ocultou") + " um comentário de " + k.autora);
          return { msg: novo === "publicado" ? "Comentário publicado." : "Comentário ocultado.", texto: "moderação de um comentário de " + k.autora, desfazer: async () => { await rpc("moderar_comentario", { p_comentario: k.id, p_status: antes }); } };
        });
        return;
      }
      case "com-responder": ui.respondendo = d.id; ui.focar = "respostaCampo"; break;
      case "com-responder-cancelar": ui.respondendo = null; break;
      case "com-remover":
        confirmar({ titulo: "Remover este comentário?", texto: "Ele some para todas as alunas. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover comentário" }, async () => {
          const k = S.comentarios.find((x) => x.id === d.id);
          await rpc("moderar_comentario", { p_comentario: d.id, p_status: "removido" });
          await registrar(k?.autoraId || null, "Removeu um comentário de " + (k?.autora ?? "uma aluna"));
          return "Comentário removido.";
        });
        break;

      case "ver-codigo": { const e = pessoa(d.id); ui.modal = { tipo: "info", titulo: "Código de " + e.nome, texto: "Login " + e.login + ". É o que ela digita para entrar no painel.", destaque: e.codigo ?? "" }; break; }
      case "trocar-codigo": {
        const e = pessoa(d.id);
        void executar(async () => {
          const velho = e.codigo;
          const codigo = String(await rpc("trocar_codigo", { p_id: e.id }));
          await registrar(null, "Trocou o código de " + e.nome);
          if (velho) pilha = [{ texto: "troca do código de " + e.nome, quando: new Date().toISOString(), fn: async () => { await rpc("mudar_codigo", { p_id: e.id, p_codigo: velho }); } }, ...pilha].slice(0, LIMITE_DESFAZER);
          ui.modal = { tipo: "info", titulo: "Novo código de " + e.nome, texto: "O código antigo deixou de funcionar. Passe este para ela.", destaque: codigo };
        });
        return;
      }
      case "equipe-bloquear": { const e = pessoa(d.id); confirmar({ titulo: "Bloquear " + e.nome + "?", texto: "Ela deixa de entrar no painel até você desbloquear.", palavra: "BLOQUEAR", rotulo: "Bloquear" }, async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "bloqueada" }); await registrar(null, "Bloqueou " + e.nome + " na equipe"); return { msg: e.nome + " foi bloqueada.", texto: "bloqueio de " + e.nome, desfazer: async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "ativa" }); } }; }); break; }
      case "equipe-desbloquear": { const e = pessoa(d.id); void executar(async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "ativa" }); await registrar(null, "Desbloqueou " + e.nome + " na equipe"); return { msg: e.nome + " foi desbloqueada.", texto: "desbloqueio de " + e.nome, desfazer: async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "bloqueada" }); } }; }); return; }
      case "equipe-remover": { const e = pessoa(d.id); confirmar({ titulo: "Remover " + e.nome + " da equipe?", texto: "Ela perde o acesso ao painel. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover" }, async () => { await rpc("remover_colaborador", { p_id: e.id }); await registrar(null, "Removeu " + e.nome + " da equipe"); return e.nome + " saiu da equipe."; }); break; }
      default: return;
    }
    render();
  }

  function enviar(f: string, form: HTMLFormElement, quem?: HTMLButtonElement | null) {
    const v = (n: string) => { const el = form.elements.namedItem(n) as HTMLInputElement | null; return el ? el.value.trim() : ""; };
    const id = form.dataset.id ?? "";
    switch (f) {
      case "entrar": {
        if (ocupado) return;
        ocupado = true; ui.erroLogin = ""; render();
        void (async () => {
          const r = await api.entrar(v("login").toLowerCase(), v("codigo"));
          if (!r.ok) { ui.erroLogin = r.falha.mensagem; ocupado = false; render(); return; }
          const salvar = (form.elements.namedItem("salvar") as HTMLInputElement | null)?.checked;
          gravarLocal("aion-painel-login", salvar ? v("login") : null);
          gravarLocal("aion-painel-login-off", salvar ? null : "1");
          await abrirSessao(true);
          ocupado = false; render();
        })();
        return;
      }
      case "aluna": {
        const cod = v("codigo");
        if (!/^\d{4}$/.test(cod)) { toast("O código precisa ter 4 números."); return; }
        const nome = v("nome");
        const loginNovo = (v("login") || nome.split(/\s+/)[0]).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.]/g, "");
        if (S.alunas.some((x) => x.login === loginNovo && x.id !== id)) { toast("Já existe uma aluna com o login " + loginNovo + "."); return; }
        const celular = v("celular").replace(/\D/g, "");
        if (celular.length !== 11) { toast("Preencha o celular com DDD: (11) 98765-4321."); return; }
        const email = v("email").toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Confira o e-mail."); return; }
        void executar(async () => {
          if (id) {
            const o = { ...aluna(id) };
            await rpc("salvar_ficha_aluna", { p_aluna: id, p_nome: nome, p_login: loginNovo, p_codigo: cod, p_entrada: v("entrada"), p_validade: v("validade"), p_celular: celular, p_email: email });
            await registrar(id, o.codigo !== cod ? "Dados atualizados · código trocado" : "Dados atualizados");
            ui.modal = null;
            return {
              msg: "Dados de " + nome + " salvos.", texto: "edição dos dados de " + nome,
              desfazer: async () => { await rpc("restaurar_ficha_aluna", { p_aluna: id, p_nome: o.nome, p_login: o.login, p_codigo: o.codigo, p_entrada: o.entrada, p_acesso_ate: fimDoDia(o.validade), p_celular: o.celular, p_email: o.email }); },
            };
          }
          const r = await chamarFuncao("cadastrar-aluna", { nome, login: loginNovo, codigo: cod, celular, email, entrada: v("entrada"), validade: v("validade") });
          if (r.id) await registrar(String(r.id), "Aluna cadastrada");
          ui.modal = null;
          const msg = nome + " cadastrada. Login " + loginNovo + ", código " + cod + ".";
          return r.id ? { msg, texto: "cadastro de " + nome, desfazer: async () => { await rpc("remover_aluna", { p_aluna: String(r.id) }); } } : msg;
        });
        return;
      }
      case "liberar": {
        const marcados = (n: string) => [...form.querySelectorAll<HTMLInputElement>('input[name="' + n + '"]:checked')].map((x) => x.value);
        const cs = marcados("c");
        const ms = marcados("m").filter((mid) => { const x = acharModulo(mid); return x && !cs.includes(x.c.id); });
        const as = marcados("a").filter((aid) => { const x = acharAula(aid); return x && !cs.includes(x.c.id) && !ms.includes(x.m.id); });
        const al = aluna(id); const antes = { ...al.acesso };
        void executar(async () => {
          const n = Number(await rpc("salvar_liberacao", { p_aluna: id, p_produtos: cs, p_modulos: ms, p_aulas: as }));
          await registrar(id, "Liberação atualizada: " + p(n, "aula", "aulas"));
          ui.modal = null;
          return { msg: "Liberação salva: " + p(n, "aula", "aulas") + " para " + al.nome + ".", texto: "liberação de " + al.nome, desfazer: async () => { await rpc("salvar_liberacao", { p_aluna: id, p_produtos: antes.cursos, p_modulos: antes.modulos, p_aulas: antes.aulas }); } };
        });
        return;
      }
      case "cronograma": {
        const al = aluna(id);
        const mods: string[] = [], dias: number[] = [], aulas: string[] = [], datas: (string | null)[] = [];
        [...form.querySelectorAll<HTMLInputElement>('input[type="number"][name^="d_"]')].forEach((x) => {
          if (x.value !== "") { mods.push(x.name.slice(2)); dias.push(Math.max(0, parseInt(x.value, 10) || 0)); }
        });
        [...form.querySelectorAll<HTMLInputElement>('input[type="date"][name^="dt_"]')].forEach((x) => {
          const aid = x.name.slice(3);
          if (x.value !== (al.datas[aid] || "")) { aulas.push(aid); datas.push(x.value || null); }
        });
        const cAntes = Object.entries(al.cronograma);
        const dAntes = aulas.map((aid) => al.datas[aid] || null);
        void executar(async () => {
          await rpc("salvar_cronograma", { p_aluna: id, p_modulos: mods, p_dias: dias, p_aulas: aulas, p_datas: datas });
          await registrar(id, "Cronograma atualizado");
          ui.modal = null;
          return { msg: "Cronograma de " + al.nome + " salvo.", texto: "cronograma de " + al.nome, desfazer: async () => { await rpc("salvar_cronograma", { p_aluna: id, p_modulos: cAntes.map((x) => x[0]), p_dias: cAntes.map((x) => x[1]), p_aulas: aulas, p_datas: dAntes }); } };
        });
        return;
      }
      case "confirmar": {
        const inp = document.getElementById("confirmaPalavra") as HTMLInputElement;
        if (inp.value.trim().toUpperCase() !== inp.dataset.palavra) return;
        const fn = pend; pend = null; ui.modal = null;
        if (fn) void executar(fn); else render();
        return;
      }
      case "curso-novo": {
        const xa = catAba(v("cat"));
        if (!xa) { toast("Crie uma categoria antes, em Botões do app e Categorias."); return; }
        void executar(async () => {
          const r = falhou(await supabase.from("produtos").insert({ titulo: v("nome"), categoria_id: xa.aba, categoria_aba_id: xa.id, inicio: 1, ordem: S.cursos.length }).select("id").single());
          falhou(await supabase.from("categoria_itens").insert({ categoria_aba_id: xa.id, tipo: "curso", item_id: r.data!.id, ordem: itensDe(xa.id).length }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "produtos", p_ids: [...S.cursos.map((c) => c.id), r.data!.id] });
          await registrar(null, "Criou o produto " + v("nome"));
          ui.modal = null; ui.curso = r.data!.id; ui.tab = "curso";
          return { msg: "Produto criado. Agora monte os módulos.", texto: "criação do produto " + v("nome"), desfazer: async () => { await rpc("remover_produto", { p_produto: r.data!.id }); if (ui.curso === r.data!.id) { ui.curso = null; ui.tab = "cursos"; } } };
        });
        return;
      }
      case "catx-criar": {
        const aba = form.dataset.id || ""; const irmas = S.catsAba.filter((y) => y.aba === aba);
        void executar(async () => {
          const r = falhou(await supabase.from("categorias_aba").insert({ aba_id: aba, titulo: v("nome"), ordem: irmas.length }).select("id").single());
          await registrar(null, "Criou a categoria " + v("nome")); ui.modal = null; ui.catxEditar = r.data!.id;
          return { msg: "Categoria criada. Coloque a capa e salve.", texto: "criação da categoria " + v("nome"), desfazer: async () => { falhou(await supabase.from("categorias_aba").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "catx-salvar": {
        const x = catAba(id)!; const velho = { titulo: x.nome, descricao: x.descricao || null, capa_path: x.capa || null };
        const desc = (form.elements.namedItem("descricao") as HTMLTextAreaElement).value.trim();
        void executar(async () => {
          falhou(await supabase.from("categorias_aba").update({ titulo: v("nome"), descricao: desc || null, capa_path: v("capa") || null }).eq("id", id).select("id").single());
          await registrar(null, "Editou a categoria " + v("nome")); ui.catxEditar = ""; delete previas["catx-" + id];
          return { msg: "Categoria salva.", texto: "edição da categoria " + x.nome, desfazer: async () => { falhou(await supabase.from("categorias_aba").update(velho).eq("id", id).select("id").single()); } };
        });
        return;
      }
      case "aba-renomear": {
        const k = cat(id)!; const velho = k.nome;
        void executar(async () => { falhou(await supabase.from("categorias").update({ titulo: v("nome") }).eq("id", id).select("id").single()); await registrar(null, "Renomeou o botão " + velho + " para " + v("nome")); ui.abaRen = ""; return { msg: "Botão renomeado.", texto: "nome da aba " + velho, desfazer: async () => { falhou(await supabase.from("categorias").update({ titulo: velho }).eq("id", id).select("id").single()); } }; });
        return;
      }
      case "cat-add":
        void executar(async () => {
          const r = falhou(await supabase.from("categorias").insert({ titulo: v("nome"), ordem: S.cats.length }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: [...S.cats.map((k) => k.id), r.data!.id] });
          await registrar(null, "Criou o botão " + v("nome"));
          ui.abaNova = false; ui.layAba = r.data!.id;
          return { msg: "Botão criado. Ele já aparece no menu do app.", texto: "criação da aba " + v("nome"), desfazer: async () => { falhou(await supabase.from("categorias").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      case "cfg-retorno": {
        void executar(async () => {
          falhou(await supabase.from("configuracoes").update({ frase_retorno: v("fraseRetorno") }).not("id", "is", null).select("id"));
          await registrar(null, "Mudou a frase de retorno do Início"); return "Frase de retorno salva.";
        });
        return;
      }
      case "cfg-marca": {
        void executar(async () => {
          falhou(await supabase.from("configuracoes").update({ marca_titulo: v("marcaTitulo"), marca_sub: v("marcaSub") }).not("id", "is", null).select("id"));
          await registrar(null, "Mudou o nome do cabeçalho da área de membros"); return "Nome do cabeçalho salvo.";
        });
        return;
      }
      case "vers-add": {
        void executar(async () => {
          falhou(await supabase.from("versiculos").insert({ texto: v("texto"), referencia: v("ref"), ordem: S.versiculos.length + 1 }).select("id").single());
          await registrar(null, "Adicionou o versículo " + v("ref")); return "Versículo adicionado.";
        });
        return;
      }
      case "vers-salvar": {
        void executar(async () => {
          falhou(await supabase.from("versiculos").update({ texto: v("texto"), referencia: v("ref") }).eq("id", id).select("id").single());
          ui.editando = null; await registrar(null, "Editou o versículo " + v("ref")); return "Versículo salvo.";
        });
        return;
      }
      case "dest-salvar": {
        const dest = v("destino");
        const linha: Record<string, unknown> = {
          imagem_path: v("imagem") || null, rotulo: v("rotulo"), titulo: v("titulo"), descricao: (form.elements.namedItem("descricao") as HTMLTextAreaElement).value.trim(),
          botao: v("botao"), icone: v("icone"), cor: v("cor"), visivel: (form.elements.namedItem("visivel") as HTMLInputElement).checked,
          destino: dest === "presentes" ? "presentes" : "categoria",
          categoria_id: dest.startsWith("cat:") ? dest.slice(4) : null,
          categoria_nome: dest.startsWith("cat:") ? cat(dest.slice(4))?.nome ?? null : dest.startsWith("nome:") ? dest.slice(5) : null,
        };
        void executar(async () => {
          if (id === "novo") falhou(await supabase.from("destaques_inicio").insert({ ...linha, ordem: S.destaques.length + 1 }).select("id").single());
          else falhou(await supabase.from("destaques_inicio").update(linha).eq("id", id).select("id").single());
          delete previas["dest-" + id]; ui.destEditar = null;
          await registrar(null, (id === "novo" ? "Criou" : "Editou") + " o destaque " + v("titulo")); return "Destaque salvo.";
        });
        return;
      }
      case "cat-salvar": {
        const k = cat(id)!; const velho = { titulo: k.nome, descricao: k.descricao || null, capa_path: k.capa || null, icone: k.icone };
        const icSel = form.elements.namedItem("icone") as HTMLSelectElement | null;
        const novaCapa = (form.querySelector<HTMLInputElement>('input[name="capa"]')?.value) || k.capa || null;
        const desc = (form.elements.namedItem("descricao") as HTMLTextAreaElement).value.trim();
        void executar(async () => {
          const nova = ui.catNova === id;
          falhou(await supabase.from("categorias").update({ titulo: v("nome"), descricao: desc || null, capa_path: novaCapa, ...(icSel ? { icone: icSel.value } : {}), ...(nova ? { publicado: true } : {}) }).eq("id", id).select("id").single());
          if (nova) ui.catNova = "";
          await registrar(null, "Editou o botão " + v("nome"));
          ui.catEditar = null; delete previas["cat-" + id];
          return { msg: "Botão salvo.", texto: "edição da aba " + k.nome, desfazer: async () => { falhou(await supabase.from("categorias").update(velho).eq("id", id).select("id").single()); } };
        });
        return;
      }
      case "cat-renomear":
        { const velho = cat(id)!.nome;
          void executar(async () => { falhou(await supabase.from("categorias").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return { msg: "Categoria renomeada.", texto: "nome da categoria " + velho, desfazer: async () => { falhou(await supabase.from("categorias").update({ titulo: velho }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "curso-config": {
        const c = curso(ui.curso)!; const cid = c.id;
        // Categorias marcadas, só das abas ligadas.
        const marcadas = [...form.querySelectorAll<HTMLInputElement>('input[name="catx"]:checked')].filter((i) => !i.closest<HTMLElement>("[data-oc-aba]")?.hidden).map((i) => i.value);
        if (!marcadas.length) { toast("Marque pelo menos um botão do app e uma categoria para o curso."); return; }
        // A categoria principal (a que o app usa hoje) só muda se ela foi desmarcada.
        const xa = catAba(marcadas.includes(c.catAba) ? c.catAba : marcadas[0]);
        const antes = S.catItens.filter((x) => x.tipo === "curso" && x.item === cid);
        const velho = { titulo: c.nome, capa_path: c.capa || null, categoria_id: c.cat || null, categoria_aba_id: c.catAba || null, libera_em: c.libera || null, descricao: c.descricao || null, fundacao: c.fundacao || null, aviso_material: c.aviso || null, rotulo_inicio: c.rotuloInicio || null, nome_curto: c.nomeCurto || null };
        void executar(async () => {
          falhou(await supabase.from("produtos").update({
            titulo: v("nome"), capa_path: v("capa") || null, ...(xa ? { categoria_id: xa.aba, categoria_aba_id: xa.id } : {}),
            libera_em: v("libera") && !isNaN(+new Date(v("libera"))) ? new Date(v("libera")).toISOString() : null,
            descricao: v("descricao") || null, fundacao: v("fundacao") || null, aviso_material: v("aviso") || null,
            rotulo_inicio: v("rotuloInicio") || null, nome_curto: v("nomeCurto") || null,
          }).eq("id", cid).select("id").single());
          for (const x of antes) if (!marcadas.includes(x.cat)) falhou(await supabase.from("categoria_itens").delete().eq("id", x.id).select("id").single());
          for (const m of marcadas) if (!antes.some((x) => x.cat === m)) falhou(await supabase.from("categoria_itens").insert({ categoria_aba_id: m, tipo: "curso", item_id: cid }).select("id").single());
          return { msg: "Sobre o curso salvo.", texto: "configurações de " + c.nome, desfazer: async () => { falhou(await supabase.from("produtos").update(velho).eq("id", cid).select("id").single()); } };
        });
        return;
      }
      case "mod-add": {
        const c = curso(id)!; const num = Number(v("numero"));
        const erro = erroNumero(num, c.modulos.map((m) => m.num), "módulo"); if (erro) { toast(erro); return; }
        const ult = c.modulos[c.modulos.length - 1];
        void executar(async () => {
          // A ordem segue o número (gatilho da 0063).
          const r = falhou(await supabase.from("modulos").insert({ produto_id: id, numero: num, titulo: v("nome").toUpperCase(), rotulo: ult?.rot || "Módulo" }).select("id").single());
          ui.abertos.add(r.data!.id);
          return { msg: "Módulo adicionado.", texto: "novo módulo " + v("nome").toUpperCase(), desfazer: async () => { falhou(await supabase.from("modulos").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "mod-renomear":
        { const xm = acharModulo(id)!, mm = xm.m; const velho = mm.nome, numVelho = mm.num, num = Number(v("numero"));
          const erro = erroNumero(num, xm.c.modulos.filter((k) => k.id !== id).map((k) => k.num), "módulo"); if (erro) { toast(erro); return; }
          const capaH = (form.elements.namedItem("capaH") as HTMLInputElement).value || null; const intro = (form.elements.namedItem("intro") as HTMLTextAreaElement).value.trim() || null;
          const libMod = v("libera"), liberaMod = libMod && !isNaN(+new Date(libMod)) ? new Date(libMod).toISOString() : null, liberaVelha = mm.libera || null;
          const criado = v("criado"), mudouCriado = !!criado && criado !== dataLocal(mm.criado) && !isNaN(+new Date(criado));
          const capa = v("capa") || null, cor = v("cor") || null, campoVivo = form.elements.namedItem("temVivo") as HTMLInputElement | null, temVivo = !!campoVivo?.checked, vivoData = v("vivoData");
          void executar(async () => {
            const novoM = ui.novoMod === id; if (novoM) ui.novoMod = "";
            falhou(await supabase.from("modulos").update({ ...(novoM ? { publicado: true } : {}), numero: num, titulo: v("nome"), rotulo: v("rotulo") || "Módulo", intro, capa_horizontal_path: capaH, capa_path: capa, cor_destaque: cor, ...(form.elements.namedItem("libera") ? { libera_em: liberaMod } : {}), ...(mudouCriado ? { criado_em: new Date(criado).toISOString() } : {}) }).eq("id", id).select("id").single());
            const dataHora = vivoData ? new Date(vivoData).toISOString() : null;
            // A página do módulo não tem mais o campo da aula ao vivo: sem o campo, não mexe nela.
            if (!campoVivo) { /* mantém como está */ }
            else if (temVivo && mm.vivo) falhou(await supabase.from("aulas_ao_vivo").update({ data_hora: dataHora }).eq("modulo_id", id).select("id"));
            else if (temVivo) falhou(await supabase.from("aulas_ao_vivo").insert({ modulo_id: id, titulo: "Encontro ao vivo do " + (v("rotulo") || "Módulo") + " " + num, data_hora: dataHora }).select("id"));
            else if (mm.vivo) falhou(await supabase.from("aulas_ao_vivo").delete().eq("modulo_id", id).select("id"));
            ui.editando = null; delete previas["modh-" + id]; delete previas["modv-" + id]; return { msg: "Módulo salvo.", texto: "nome do módulo " + velho, desfazer: async () => { falhou(await supabase.from("modulos").update({ titulo: velho, numero: numVelho, libera_em: liberaVelha }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "aula-add": {
        const x = acharModulo(id)!; const num = Number(v("numero"));
        const erro = erroNumero(num, x.m.aulas.map((a) => a.num), "aula"); if (erro) { toast(erro); return; }
        void executar(async () => {
          const r = falhou(await supabase.from("aulas").insert({ modulo_id: id, numero: num, titulo: v("nome"), rotulo: x.m.aulas[x.m.aulas.length - 1]?.rot || "Aula" }).select("id").single());
          ui.addAula = null;
          return { msg: "Aula adicionada.", texto: "nova aula " + v("nome"), desfazer: async () => { falhou(await supabase.from("aulas").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "aula-renomear":
        { const xa = acharAula(id)!; const velho = xa.a.nome, numVelho = xa.a.num, rotVelho = xa.a.rot, num = Number(v("numero"));
          const erro = erroNumero(num, xa.m.aulas.filter((k) => k.id !== id).map((k) => k.num), "aula"); if (erro) { toast(erro); return; }
          void executar(async () => {
            falhou(await supabase.from("aulas").update({ titulo: v("nome"), numero: num, rotulo: v("rotulo") || "Aula" }).eq("id", id).select("id").single());
            ui.editando = null;
            return { msg: "Aula salva.", texto: "nome da aula " + velho, desfazer: async () => { falhou(await supabase.from("aulas").update({ titulo: velho, numero: numVelho, rotulo: rotVelho }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "aula": {
        const xa = acharAula(id)!; const num = Number(v("numero"));
        const erro = erroNumero(num, xa.m.aulas.filter((k) => k.id !== id).map((k) => k.num), "aula"); if (erro) { toast(erro); return; }
        const tipo = (["video", "audio", "pdf"].includes(v("tipo")) ? v("tipo") : "video") as Aula["tipo"];
        const video = tipo === "video" ? v("video") : ""; const ref = idDoVideo(video);
        const arquivo = tipo === "video" ? null : v("arquivoAula") || null;
        const libera = v("libera"), liberaIso = libera && !isNaN(+new Date(libera)) ? new Date(libera).toISOString() : null;
        // O estado da aula (ativa, bloqueada, desativada) muda na hora, pelo seletor; não passa por aqui.
        const ativa = true, mudouStatus = false;
        const mudouMidia = tipo !== xa.a.tipo || (arquivo || "") !== (xa.a.tipo === "video" ? "" : xa.a.arquivo);
        const nova = ui.novaAula === id;
        const base = { ...(nova ? { publicado: true } : {}), titulo: v("nome") || xa.a.nome, rotulo: v("rotulo") || "Aula", numero: num, libera_em: liberaIso, tipo, arquivo_path: arquivo, ...(mudouMidia ? { duracao_segundos: null } : {}) };
        const baseVelha = { titulo: xa.a.nome, rotulo: xa.a.rot, numero: xa.a.num, libera_em: xa.a.libera || null, tipo: xa.a.tipo, arquivo_path: xa.a.arquivo || null, ...(mudouMidia ? { duracao_segundos: xa.a.duracao || null } : {}) };
        if (video && !ref) { toast("Não reconheci o vídeo. Cole o link do Cloudflare Stream ou só o identificador."); return; }
        const texto = (form.elements.namedItem("texto") as HTMLTextAreaElement).value;
        const x0 = acharAula(id)!.a; const velho = { capa: x0.capa, texto: x0.texto, video: x0.video, resumo: x0.resumo, exercicio: x0.exercicio };
        // E-book: o botão do PDF e as outras opções, lidas de cada bloco na tela.
        type LinhaOp = { id: string; dados: Record<string, unknown> };
        const opcoes: LinhaOp[] = [];
        if (tipo === "pdf") {
          let erroOp = "";
          document.querySelectorAll<HTMLElement>("[data-ops] [data-op-bloco]").forEach((bl, ordem) => {
            const campo = (sufixo: string) => (bl.querySelector<HTMLInputElement>(`[name$="${sufixo}"]`)?.value ?? "").trim();
            const rot = campo("Rotulo"); const t = (bl.querySelector<HTMLSelectElement>("[data-op2-tipo]")?.value || "texto") as Opcao["tipo"];
            const vid = t === "video" ? campo("Video") : ""; const vref = vid ? idDoVideo(vid) : null;
            if (vid && !vref) erroOp = "Não reconheci o vídeo da opção " + (ordem + 2) + ". Cole o link do Cloudflare Stream ou só o identificador.";
            if (!rot && !campo("Texto") && !campo("Pdf") && !vid && !campo("Audio")) return; // bloco vazio: não guarda
            opcoes.push({ id: bl.dataset.opId || "", dados: {
              titulo: rot || "Opção", cor: campo("RotuloCor") || null, tipo: t, ordem,
              texto: (t === "texto" ? campo("Texto") : t === "pdf" ? "" : campo("Desc")) || null,
              arquivo_path: (t === "pdf" ? campo("Pdf") : t === "audio" ? campo("Audio") : "") || null,
              video_ref: vref, video_provider: vref ? provedorDoLink(vid) : null,
              capa_path: t === "video" || t === "audio" ? campo("Capa") || null : null,
              titulo_tela: t === "video" || t === "audio" ? campo("Titulo") || null : null,
              instrucoes: t === "video" || t === "audio" ? campo("Instr") || null : null,
            } });
          });
          if (erroOp) { toast(erroOp); return; }
        }
        const idsOp = new Set(opcoes.map((o) => o.id).filter(Boolean));
        const opApagar = tipo === "pdf" ? xa.a.opcoes.filter((o) => !idsOp.has(o.id)).map((o) => o.id) : [];
        const botaoEb = tipo === "pdf" ? { botao_ebook: v("botaoEbook") || null, botao_ebook_cor: v("botaoEbookCor") || null } : {};
        const extrasAula: Record<string, string | null> = {};
        if (x0.resumo !== null) {
          const e = (form.elements.namedItem("exercicio") as HTMLTextAreaElement).value;
          extrasAula.exercicio = e.trim() ? e : null;
        }
        void executar(async () => {
          falhou(await supabase.from("aulas").update({ ...base, ...botaoEb, capa_path: v("capa") || null, texto: texto.trim() ? texto : null, ...extrasAula }).eq("id", id).select("id").single());
          for (const o of opcoes) {
            if (o.id) falhou(await supabase.from("conteudos").update(o.dados).eq("id", o.id).select("id").single());
            else falhou(await supabase.from("conteudos").insert({ ...o.dados, produto_id: xa.c.id, aula_id: id, opcao: true, publicado: true }).select("id").single());
          }
          if (opApagar.length) falhou(await supabase.from("conteudos").delete().in("id", opApagar).select("id"));
          if (mudouStatus) await rpc("definir_bloqueio_aula", { p_aula: id, p_bloqueada: !ativa });
          if (nova) ui.novaAula = "";
          if (ref) falhou(await supabase.from("aula_midia").upsert({ aula_id: id, video_provider: provedorDoLink(video), video_ref: ref }));
          else falhou(await supabase.from("aula_midia").delete().eq("aula_id", id));
          delete previas[id];
          return {
            msg: "Aula salva.", texto: "conteúdo da aula " + x0.nome,
            desfazer: async () => {
              if (mudouStatus) await rpc("definir_bloqueio_aula", { p_aula: id, p_bloqueada: ativa });
              falhou(await supabase.from("aulas").update({ ...baseVelha, capa_path: velho.capa || null, texto: velho.texto || null, ...(velho.resumo === null ? {} : { resumo: velho.resumo || null, exercicio: velho.exercicio || null }) }).eq("id", id).select("id").single());
              const vref = velho.video ? idDoVideo(velho.video) : null;
              if (vref) falhou(await supabase.from("aula_midia").upsert({ aula_id: id, video_provider: provedorDoLink(velho.video), video_ref: vref }));
              else falhou(await supabase.from("aula_midia").delete().eq("aula_id", id));
            },
          };
        });
        return;
      }
      case "extra-add": {
        const x = acharAula(id)!; const t = tipoDaTela(ui.extraTipo); const arq = v("arquivo");
        const linha: Record<string, unknown> = { produto_id: x.c.id, aula_id: id, tipo: t.banco, titulo: v("nome"), ordem: x.a.extras.length };
        if (t.banco === "link") linha.url = arq;
        else if (t.banco === "texto") linha.texto = arq;
        else if (t.banco === "video") {
          const ref = idDoVideo(arq);
          if (!ref) { toast("Não reconheci o vídeo. Cole o link ou só o identificador."); return; }
          linha.video_ref = ref; linha.video_provider = provedorDoLink(arq);
        } else linha.arquivo_path = arq;
        void executar(async () => {
          const r = falhou(await supabase.from("conteudos").insert(linha).select("id").single());
          return { msg: "Conteúdo adicionado à aula.", texto: "conteúdo extra " + v("nome"), desfazer: async () => { falhou(await supabase.from("conteudos").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "com-resposta":
        void executar(async () => {
          const k = S.comentarios.find((x) => x.id === id);
          const antes = k?.resposta ?? ""; const estadoAntes = k?.estado === "moderar" ? "pendente" : k?.estado;
          const rid = String(await rpc("responder_comentario", { p_comentario: id, p_texto: v("resposta") }));
          await registrar(k?.autoraId || null, "Respondeu um comentário de " + (k?.autora ?? "uma aluna"));
          ui.respondendo = null;
          return {
            msg: "Resposta enviada.", texto: "resposta a " + (k?.autora ?? "uma aluna"),
            desfazer: async () => {
              if (antes) await rpc("responder_comentario", { p_comentario: id, p_texto: antes });
              else await rpc("moderar_comentario", { p_comentario: rid, p_status: "removido" });
              if (estadoAntes === "pendente") await rpc("moderar_comentario", { p_comentario: id, p_status: "pendente" });
            },
          };
        });
        return;
      case "equipe-editar": {
        const e = pessoa(id);
        const nome = v("nome").trim(); const login = v("login").trim().toLowerCase().replace(/\s+/g, " ");
        const papelTxt = form.elements.namedItem("papel") ? v("papel") : e.papel;
        const papel = papelTxt === "Administrador" ? "admin" : papelTxt === "Dono" ? "dono" : "suporte";
        const codigo = v("codigo").trim();
        if (nome.length < 2) { toast("Preencha o nome."); return; }
        if (codigo && !/^\d{4,6}$/.test(codigo)) { toast("O código tem de 4 a 6 números."); return; }
        if (S.equipe.some((x) => x.login === login && x.id !== e.id)) { toast("Esse login já está na equipe."); return; }
        const antes = { nome: e.nome, login: e.login, papel: e.papel === "Administrador" ? "admin" : e.papel === "Dono" ? "dono" : "suporte", codigo: e.codigo ?? "" };
        void executar(async () => {
          await rpc("editar_colaborador", { p_id: e.id, p_nome: nome, p_login: login, p_papel: papel, p_codigo: codigo });
          await registrar(null, "Editou " + nome + " na equipe");
          ui.modal = null;
          return { msg: "Dados de " + nome + " salvos.", texto: "edição de " + nome + " na equipe", desfazer: async () => { await rpc("editar_colaborador", { p_id: e.id, p_nome: antes.nome, p_login: antes.login, p_papel: antes.papel, p_codigo: antes.codigo }); } };
        });
        return;
      }
      case "equipe-add": {
        const login = v("login").trim().toLowerCase();
        if (S.equipe.some((x) => x.login === login)) { toast("Esse login já está na equipe."); return; }
        if (!/^[a-z0-9._-]{2,40}$/.test(login)) { toast("O login aceita letras sem acento, números, ponto e hífen, sem espaço."); return; }
        // O código é quem cadastra que escolhe — nunca sorteado.
        const codigo = v("codigo").trim();
        if (!/^\d{4,6}$/.test(codigo)) { toast("Escolha um código de 4 a 6 números."); return; }
        const papel = v("papel") === "Administrador" ? "admin" : "suporte";
        void executar(async () => {
          const r = await chamarFuncao("cadastrar-colaborador", { nome: v("nome"), login, papel, codigo });
          await registrar(null, "Adicionou " + v("nome") + " à equipe");
          if (r.id) pilha = [{ texto: "entrada de " + v("nome") + " na equipe", quando: new Date().toISOString(), fn: async () => { await rpc("remover_colaborador", { p_id: String(r.id) }); } }, ...pilha].slice(0, LIMITE_DESFAZER);
          ui.modal = { tipo: "info", titulo: v("nome") + " entrou na equipe", texto: "Login " + login + ". Passe este código para ela entrar no painel.", destaque: String(r.codigo ?? "") };
        });
        return;
      }
      case "nota": {
        const t = (form.elements.namedItem("texto") as HTMLTextAreaElement).value.trim(); if (!t) return;
        void executar(async () => {
          const r = falhou(await supabase.from("anotacoes_aluna").insert({ aluna_id: id, texto: t }).select("id").single());
          await registrar(id, "Anotação adicionada");
          return { msg: "Anotação salva.", texto: "anotação", desfazer: async () => { falhou(await supabase.from("anotacoes_aluna").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "contato": {
        const al = aluna(id);
        const res = form.querySelector<HTMLInputElement>('input[name="resultado"]:checked')?.value || "Contato feito";
        const obs = (form.elements.namedItem("obs") as HTMLTextAreaElement).value.trim();
        void executar(async () => {
          const r = falhou(await supabase.from("contatos_aluna").insert({ aluna_id: id, canal: "telefone", resultado: res, observacao: obs || null }).select("id").single());
          await registrar(id, "Contato registrado: " + res + (obs ? " — " + obs : ""));
          ui.modal = null;
          return { msg: "Contato com " + primeiroNome(al.nome) + " registrado.", texto: "contato com " + al.nome, desfazer: async () => { falhou(await supabase.from("contatos_aluna").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "sugestao": {
        const t = (form.elements.namedItem("texto") as HTMLTextAreaElement).value.trim(); if (!t) return;
        void executar(async () => {
          const r = falhou(await supabase.from("sugestoes").insert({ texto: t }).select("id").single());
          await registrar(null, "Deixou uma sugestão");
          ui.modal = { tipo: "sugestoes" }; ui.focar = "sugestaoCampo";
          return { msg: "Sugestão enviada. Obrigada!", texto: "envio de uma sugestão", desfazer: async () => { falhou(await supabase.from("sugestoes").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "lote": {
        const acaoL = quem?.value; const ids = ui.sel.slice();
        if (acaoL === "liberar") {
          const mid = v("modulo"); if (!mid) { toast("Escolha o módulo que quer liberar."); return; }
          const x = acharModulo(mid)!;
          const antes = ids.map((sid) => ({ sid, ac: { ...aluna(sid).acesso } }));
          void executar(async () => {
            const n = Number(await rpc("lote_liberar_modulo", { p_alunas: ids, p_modulo: mid }));
            ui.sel = [];
            return { msg: x.m.nome + " liberado para " + p(n, "aluna", "alunas") + ".", texto: "liberação em lote de " + x.m.nome, desfazer: async () => { for (const z of antes) await rpc("salvar_liberacao", { p_aluna: z.sid, p_produtos: z.ac.cursos, p_modulos: z.ac.modulos, p_aulas: z.ac.aulas }); } };
          });
        } else if (acaoL === "renovar") {
          const antes = ids.map((sid) => ({ sid, v: aluna(sid).validade }));
          void executar(async () => {
            const n = Number(await rpc("lote_renovar", { p_alunas: ids }));
            ui.sel = [];
            return { msg: "Acesso renovado para " + p(n, "aluna", "alunas") + ".", texto: "renovação em lote", desfazer: async () => { for (const z of antes) if (z.v) await rpc("definir_validade", { p_aluna: z.sid, p_validade: fimDoDia(z.v) }); } };
          });
        }
        return;
      }
      default: return;
    }
    render();
  }

  /* ---------- alterações não salvas ---------- */
  const NAO_RASTREIA = new Set(["entrar", "confirmar", "lote"]);
  const CANCELA = new Set(["fechar", "cancelar-edicao", "curso-cancelar", "aula-add-cancelar", "com-responder-cancelar", "voltar-sem-salvar"]);
  const LIVRE = new Set(["escolher-capa", "enviar-arquivo", "gerar-codigo", "tema", "ajuda", "extra-tipo", "preencher-datas"]);
  function marcarSujo(t: HTMLElement) {
    const fm = t.closest?.<HTMLFormElement>("form[data-f]");
    if (fm && !NAO_RASTREIA.has(fm.dataset.f!)) ui.sujo = { f: fm.dataset.f!, id: fm.dataset.id || "" };
  }
  function formSujo(): HTMLFormElement | null {
    if (!ui.sujo) return null;
    return document.querySelector<HTMLFormElement>('form[data-f="' + ui.sujo.f + '"]' + (ui.sujo.id ? '[data-id="' + ui.sujo.id + '"]' : ""));
  }
  function mostrarAviso(seguir: () => void) {
    if (document.getElementById("avisoSujo")) return;
    const div = document.createElement("div");
    div.className = "modal-fundo topo"; div.id = "avisoSujo";
    div.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="avisoTitulo" style="max-width:460px">
      <h2 class="titulo" id="avisoTitulo">Sair sem salvar?</h2>
      <p class="explica">Você começou a editar e ainda não salvou. Se sair agora, o que mudou se perde.</p>
      <div class="rodape-modal">
        <button type="button" class="botao" data-sujo="ficar">Continuar editando</button>
        <button type="button" class="botao-neutro grande botao-remover" data-sujo="sair">Sair sem salvar</button>
      </div>
    </div>`;
    div.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-sujo]");
      ev.stopPropagation();
      if (!b) { if (ev.target === div) div.remove(); return; }
      div.remove();
      if (b.dataset.sujo === "sair") { ui.sujo = null; seguir(); }
      else { const c = formSujo()?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select"); c?.focus(); }
    });
    document.body.appendChild(div);
    div.querySelector<HTMLElement>('[data-sujo="ficar"]')!.focus();
  }
  /** Antes de cada clique: se há um formulário mexido e o clique sai dele, pergunta. */
  function guardado(a: string, d: Record<string, string>, el: HTMLElement | null, alvo: EventTarget | null) {
    if (a === "fechar-fundo" && alvo !== el) return;
    if (ui.sujo && !LIVRE.has(a)) {
      const fd = formSujo();
      if (!fd || CANCELA.has(a)) ui.sujo = null;
      // A tela Editar aula tem campos fora do <form> (capa, opções, configurações), ligados a ele.
      else if (!(el && (fd.contains(el) || (fd.id && el.closest('[data-form-de="' + fd.id + '"]') && !["aula-voltar-modulo", "abrir-curso", "aba", "mod-pagina-voltar", "abrir-aula", "mod-remover", "curso-aba", "curso-remover"].includes(a))))) { mostrarAviso(() => acao(a, d, el!, alvo)); return; }
    }
    acao(a, d, el!, alvo);
  }

  /* ---------- eventos ---------- */
  let apertou = { x: 0, y: 0 };
  app.addEventListener("mousedown", (e) => {
    apertou = { x: e.clientX, y: e.clientY };
    const alca = (e.target as HTMLElement).closest?.('[class*="alca"]');
    const item = alca?.closest<HTMLElement>("[data-arrasta]"); if (item) item.draggable = true;
  });
  app.addEventListener("click", (e) => {
    const alvo = e.target as HTMLElement;
    // Terminou de selecionar texto: não é um clique (não abre nada nem redesenha).
    const arrastou = Math.abs(e.clientX - apertou.x) + Math.abs(e.clientY - apertou.y) > 6;
    const sel = getSelection(); if (arrastou && sel && !sel.isCollapsed && String(sel).trim() && !alvo.closest("input, textarea, select")) return;
    if (ui.buscaAberta && !alvo.closest(".busca-geral")) { ui.buscaAberta = false; atualizarBusca(); }
    const b = alvo.closest<HTMLElement>("[data-a]");
    const solto = !b || (b as HTMLButtonElement).disabled;
    if (ui.estMenu && !alvo.closest(".est3")) { ui.estMenu = ""; render(); if (solto) return; }
    if (solto && ui.menu && !alvo.closest(".menu-pop")) { ui.menu = null; render(); return; }
    if (solto && ui.ajuda && !alvo.closest(".ajuda-pop")) { ui.ajuda = null; render(); return; }
    if (solto) return;
    guardado(b.dataset.a!, Object.assign({}, b.dataset) as Record<string, string>, b, e.target);
  });
  // "toggle" não sobe pela árvore: só na captura dá para ouvir de cima.
  app.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    const id = d.dataset?.bloco; if (!id) return;
    if (d.open) inicioAberto.add(id); else inicioAberto.delete(id);
  }, true);
  app.addEventListener("submit", (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>("form[data-f]");
    if (!f) return;
    e.preventDefault();
    if (ui.sujo && ui.sujo.f === f.dataset.f) ui.sujo = null;
    enviar(f.dataset.f!, f, (e as SubmitEvent).submitter as HTMLButtonElement | null);
  });
  app.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.hasAttribute("data-eb-nome") || t.hasAttribute("data-eb-cor")) {
      const eb = t.closest<HTMLElement>("[data-eb]"); const bt = eb?.querySelector<HTMLElement>(".eb-botao");
      if (eb && bt) {
        const nome = eb.querySelector<HTMLInputElement>("[data-eb-nome]")!.value, cor = eb.querySelector<HTMLInputElement>("[data-eb-cor]")!.value;
        bt.querySelector("b")!.textContent = nome || " "; bt.setAttribute("style", estiloBotao(cor));
      }
    }
    if (t.dataset.i === "buscaGeral") { ui.buscaGeral = t.value; ui.buscaAberta = true; atualizarBusca(); return; }
    marcarSujo(t);
    if (t.dataset.conta) { const c = document.getElementById(t.dataset.conta); if (c) c.textContent = t.value.length + "/200"; }
    if (t.dataset.i === "busca") { ui.busca = t.value; ui.paginaAl = 1; render(); return; }
    if (t.hasAttribute("data-curso-busca")) { ui.cursoBusca = t.value; render(); return; }
    if (t.hasAttribute("data-mod-busca")) { ui.modBusca = t.value; render(); return; }
    if (t.hasAttribute("data-cat-busca")) { ui.catBusca = t.value; render(); return; }
    if (t.hasAttribute("data-cur-al-busca")) { ui.curAlBusca = t.value; ui.csPag = 1; render(); return; }
    if (t.dataset.contaMax) { const em = t.parentElement?.querySelector(".cs-conta"); if (em) em.textContent = t.value.length + "/" + t.dataset.contaMax; }
    if (t.dataset.i === "celular") { t.value = formatarCelular(t.value); return; }
    if (t.id === "confirmaPalavra") (document.getElementById("confirmaBotao") as HTMLButtonElement).disabled = t.value.trim().toUpperCase() !== t.dataset.palavra;
  });
  app.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.hasAttribute("data-catx-tipo")) { ui.catxTipo = t.value; render(); return; }
    marcarSujo(t);
    if (t.hasAttribute("data-cs-com-mod")) { ui.csComMod = t.value; render(); return; }
    if (t.hasAttribute("data-cs-porpag")) { ui.csPorPag = Number(t.value) || 10; ui.csPag = 1; render(); return; }
    if (t.hasAttribute("data-rel-de")) { ui.relDe = t.value; render(); return; }
    if (t.hasAttribute("data-rel-ate")) { ui.relAte = t.value; render(); return; }
    if (t.hasAttribute("data-cur-al-de")) { ui.curAlDe = t.value; ui.curAlFiltro = ""; render(); return; }
    if (t.hasAttribute("data-cur-al-ate")) { ui.curAlAte = t.value; ui.curAlFiltro = ""; render(); return; }
    if (t.hasAttribute("data-op2-tipo")) {
      const bl = t.closest<HTMLElement>("[data-op-bloco]"); if (!bl) return;
      const gr = t.value === "video" || t.value === "audio" ? "midia" : t.value;
      bl.querySelectorAll<HTMLElement>("[data-op2]").forEach((g) => { g.hidden = g.dataset.op2 !== gr; });
      bl.querySelectorAll<HTMLElement>("[data-midia]").forEach((g) => { g.hidden = g.dataset.midia !== t.value; });
      return;
    }
    if (t.hasAttribute("data-aula-tipo")) {
      ui.aulaTipo = t.value;
      const gv = document.querySelector<HTMLElement>("[data-campo-video]"), ga = document.querySelector<HTMLElement>("[data-campo-arquivo]"), ra = document.querySelector<HTMLElement>("[data-rot-arquivo]");
      if (gv) gv.hidden = t.value !== "video"; if (ga) ga.hidden = t.value === "video";
      document.querySelectorAll<HTMLElement>("[data-campo-pdf]").forEach((gp) => { gp.hidden = t.value !== "pdf"; });
      const pdf = t.value === "pdf";
      document.querySelector("[data-capa-aula]")?.classList.toggle("em-pe", pdf);
      const ct = document.querySelector("[data-capa-tit]"); if (ct) ct.textContent = pdf ? "Capa do e-book" : "Capa da aula";
      const cd = document.querySelector("[data-capa-dica]"); if (cd) cd.textContent = pdf ? "Capa em pé. Tamanho recomendado: 1024 × 1536 px (2:3)" : "Tamanho recomendado: 1920 × 1080 px (16:9)";
      const ex = document.querySelector<HTMLElement>("[data-extra-aula]"); if (ex) ex.hidden = pdf;
      const rd = document.querySelector<HTMLElement>("[data-rot-desc]"); if (rd) rd.textContent = t.value === "pdf" ? "Resumo do e-book (aparece embaixo do título)" : "Descrição da aula (o que a aluna verá)";
      if (ra) ra.textContent = t.value === "pdf" ? "Arquivo PDF (e-book)" : "Arquivo de áudio";
      const ca = document.querySelector<HTMLInputElement>('input[name="arquivoAula"]'); if (ca) ca.value = "";
      return;
    }
    if (t.hasAttribute("data-chave-status")) { const b = t.parentElement?.querySelector("b"); if (b) b.textContent = t.checked ? "Ativa" : "Bloqueada"; return; }
    if (t.hasAttribute("data-curso-ordem")) { ui.cursoOrdem = t.value; render(); return; }
    if (t.hasAttribute("data-catx-ordem")) { ui.catxOrdem = t.value; render(); return; }
    if (t.hasAttribute("data-eng-dias")) { ui.engDias = Number(t.value) || 7; render(); return; }
    if (t.hasAttribute("data-ordem")) { ui.ordemAl = t.value; ui.paginaAl = 1; render(); return; }
    if (t.dataset.sel) { ui.sel = t.checked ? [...new Set(ui.sel.concat(t.dataset.sel))] : ui.sel.filter((x) => x !== t.dataset.sel); render(); return; }
    if (t.dataset.selTodas !== undefined) { const ids = t.dataset.selTodas.split(",").filter(Boolean); ui.sel = t.checked ? [...new Set(ui.sel.concat(ids))] : ui.sel.filter((x) => !ids.includes(x)); render(); return; }
    if (t.matches("input[type=checkbox]")) {
      const form = t.closest('form[data-f="liberar"]');
      if (!form) return;
      if (t.hasAttribute("data-cascata")) t.closest("[data-caixa]")!.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((x) => { x.checked = t.checked; });
      form.querySelectorAll('[data-caixa="curso"]').forEach((cx) => {
        cx.querySelectorAll('[data-caixa="modulo"]').forEach((mx) => {
          const aulas = mx.querySelectorAll<HTMLInputElement>('input[name="a"]');
          if (aulas.length) mx.querySelector<HTMLInputElement>('input[name="m"]')!.checked = [...aulas].every((x) => x.checked);
        });
        const mods = cx.querySelectorAll<HTMLInputElement>('input[name="m"]');
        if (mods.length) cx.querySelector<HTMLInputElement>('input[name="c"]')!.checked = [...mods].every((x) => x.checked);
      });
    }
  });
  async function abrirEditorFoto(al: Aluna, src: string, aj: Ajuste) {
    const pronta = await editarFoto(src, aj, al.nome, () => { fotoPara = al.id; arquivoFoto.click(); });
    if (!pronta) return;
    void executar(async () => {
      await rpc("salvar_foto_aluna", { p_aluna: al.id, p_foto: pronta.foto, p_original: pronta.original, p_ajuste: pronta.ajuste });
      fotosCache[al.id] = pronta.foto;
      await registrar(al.id, "Colocou a foto");
      return { msg: "Foto salva. Ela já aparece na área de membros de " + primeiroNome(al.nome) + ".", texto: "foto de " + al.nome };
    });
  }
  /** Onde cada capa fica (formulário, campo, prévia, pasta) e o formato dela. */
  function alvoCapa(tipo: string, id: string): { form: string; campo: string; previa: string; pasta: string; prop: number } | null {
    switch (tipo) {
      case "catx": return { form: 'form[data-f="catx-salvar"]', campo: "capa", previa: "catx-" + id, pasta: "categorias", prop: 16 / 9 };
      case "dest": return { form: 'form[data-f="dest-salvar"]', campo: "imagem", previa: "dest-" + id, pasta: "destaques", prop: 16 / 9 };
      case "curso": return { form: 'form[data-f="curso-config"]', campo: "capa", previa: "cur-" + id, pasta: "cursos", prop: 16 / 9 };
      case "modv": return { form: 'form[data-f="mod-renomear"][data-id="' + id + '"]', campo: "capa", previa: "modv-" + id, pasta: "modulos", prop: 2 / 3 };
      case "modh": return { form: 'form[data-f="mod-renomear"][data-id="' + id + '"]', campo: "capaH", previa: "modh-" + id, pasta: "modulos", prop: 16 / 9 };
    }
    return null;
  }
  function enviarCapa(alvo: { form: string; campo: string; previa: string; pasta: string }, file: File) {
    toast("Enviando a imagem…");
    void (async () => {
      try {
        const caminho = await enviarArquivo("capas", alvo.pasta, file);
        previas[alvo.previa] = URL.createObjectURL(file);
        const campo = document.querySelector<HTMLInputElement>(alvo.form + ' input[name="' + alvo.campo + '"]');
        if (campo) campo.value = caminho;
        const pv = document.querySelector<HTMLElement>('[data-previa="' + alvo.previa + '"]');
        if (pv) pv.innerHTML = '<img src="' + previas[alvo.previa] + '" alt="" />';
        toast("Imagem pronta. Clique em Salvar para guardar.");
      } catch (e) { toast(motivo(e)); }
    })();
  }
  function enviarCapaAula(file: File) {
    if (!ui.aula) return; const x = acharAula(ui.aula); if (!x) return; const aulaId = ui.aula;
    toast("Enviando a imagem…");
    void (async () => {
      try {
        const caminho = await enviarArquivo("capas", x.c.id, file);
        const campo = document.getElementById("campoCapa") as HTMLInputElement | null; if (campo) campo.value = caminho;
        ui.sujo = { f: "aula", id: aulaId };
        previas[aulaId] = URL.createObjectURL(file);
        const pv = document.getElementById("previaCapa");
        if (pv) pv.style.background = "url('" + previas[aulaId] + "') center/cover no-repeat, linear-gradient(160deg,#131c33,#060911 60%,#101830)";
        toast("Imagem pronta. Clique em Salvar aula para guardar.");
      } catch (e) { toast(motivo(e)); }
    })();
  }
  // Escolheu a imagem: abre o editor (arrastar e aproximar) antes de enviar.
  arquivoImg.addEventListener("change", () => {
    const file = arquivoImg.files?.[0]; arquivoImg.value = ""; const alvo = imgPara; if (!file || !alvo) return;
    void editarCapa(file, alvo.prop || 16 / 9, file.name).then((f) => { if (f) enviarCapa(alvo, f); });
  });
  arquivoFoto.addEventListener("change", () => {
    const file = arquivoFoto.files?.[0]; arquivoFoto.value = ""; const al = S.alunas.find((x) => x.id === fotoPara); if (!file || !al) return;
    void lerImagem(file).then((im) => abrirEditorFoto(al, im.src, { w: im.w, h: im.h, z: 1, x: 0, y: 0 })).catch((e) => toast(motivo(e)));
  });
  arquivoCat.addEventListener("change", () => {
    const file = arquivoCat.files?.[0]; arquivoCat.value = ""; const id = ui.catEditar; if (!file || !id) return;
    toast("Enviando a imagem…");
    void (async () => {
      try {
        const caminho = await enviarArquivo("capas", "categorias", file);
        previas["cat-" + id] = URL.createObjectURL(file);
        render();
        const f = document.querySelector<HTMLFormElement>('form[data-f="cat-salvar"]');
        if (f) { const x = Object.assign(document.createElement("input"), { type: "hidden", name: "capa", value: caminho }); f.append(x); }
        ui.sujo = { f: "cat-salvar", id };
        toast("Imagem enviada. Clique em Salvar alterações para guardar.");
      } catch (e) { toast(motivo(e)); }
    })();
  });
  arquivoCapa.addEventListener("change", () => {
    const file = arquivoCapa.files?.[0]; arquivoCapa.value = ""; if (!file || !ui.aula) return;
    const pdf = document.querySelector<HTMLSelectElement>('select[name="tipo"]')?.value === "pdf";
    void editarCapa(file, pdf ? 2 / 3 : 16 / 9, file.name).then((f) => { if (f) enviarCapaAula(f); });
  });
  arquivoAula.addEventListener("change", () => {
    const file = arquivoAula.files?.[0]; arquivoAula.value = ""; if (!file || !ui.aula) return;
    const x = acharAula(ui.aula); if (!x) return; const aulaId = ui.aula;
    const pdf = document.querySelector<HTMLSelectElement>('select[name="tipo"]')?.value === "pdf";
    toast("Enviando o arquivo…");
    void (async () => {
      try {
        const caminho = await enviarArquivo(pdf ? "materiais" : "audios", x.c.id, file);
        const campo = document.querySelector<HTMLInputElement>('input[name="arquivoAula"]'); if (campo) campo.value = caminho;
        ui.sujo = { f: "aula", id: aulaId };
        toast("Arquivo enviado. Clique em Salvar aula para guardar.");
      } catch (e) { toast(motivo(e)); }
    })();
  });
  arquivoExtra.addEventListener("change", () => {
    const file = arquivoExtra.files?.[0]; arquivoExtra.value = ""; if (!file || !ui.aula) return;
    const x = acharAula(ui.aula); const t = tipoDaTela(ui.extraTipo); if (!x || !t.deposito) return;
    toast("Enviando o arquivo…");
    void (async () => {
      try {
        const caminho = await enviarArquivo(t.deposito!, x.c.id, file);
        const form = document.querySelector<HTMLFormElement>('form[data-f="extra-add"]');
        if (form) {
          ui.sujo = { f: "extra-add", id: form.dataset.id || "" };
          (form.elements.namedItem("arquivo") as HTMLInputElement).value = caminho;
          const nome = form.elements.namedItem("nome") as HTMLInputElement;
          if (!nome.value) nome.value = file.name.replace(/\.[^.]+$/, "");
        }
        toast("Arquivo enviado. Clique em Adicionar para pôr na aula.");
      } catch (e) { toast(motivo(e)); }
    })();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const av = document.getElementById("avisoSujo"); if (av) { av.remove(); return; }
    if (ui.buscaAberta) { ui.buscaAberta = false; atualizarBusca(); return; }
    if (ui.menu || ui.ajuda) { ui.menu = null; ui.ajuda = null; render(); return; }
    if (ui.modal) { guardado("fechar-esc", {}, null, null); return; }
    if (ui.acessoAluna || ui.acessoLista) {
      if (ui.acessoAluna) ui.acessoAluna = null; else ui.acessoLista = "";
      render();
    }
  });
  window.addEventListener("resize", () => { ajustarListaLateral(); ajustarArvore(); });
  document.addEventListener("focusin", (e) => { if ((e.target as HTMLElement).id === "buscaGeral" && ui.buscaGeral.trim()) { ui.buscaAberta = true; atualizarBusca(); } });
  window.addEventListener("beforeunload", (e) => { if (ui.sujo && formSujo()) { e.preventDefault(); e.returnValue = ""; } });

  /* arrastar as categorias */
  app.addEventListener("dragstart", (e) => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>("[data-arrasta]"); if (!t) return;
    ui.arrasto = t.dataset.arrasta!; t.classList.add("arrastando");
    e.dataTransfer!.effectAllowed = "move"; e.dataTransfer!.setData("text/plain", ui.arrasto);
  });
  app.addEventListener("dragover", (e) => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>("[data-arrasta]"); if (!t || !ui.arrasto) return;
    e.preventDefault();
    document.querySelectorAll("[data-arrasta].alvo").forEach((x) => x.classList.remove("alvo"));
    if (t.dataset.arrasta !== ui.arrasto) t.classList.add("alvo");
  });
  app.addEventListener("drop", (e) => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>("[data-arrasta]"); if (!t || !ui.arrasto) return;
    e.preventDefault();
    const ax = acharAula(ui.arrasto), ay = acharAula(t.dataset.arrasta!);
    if (ax && ay && ax.m.id === ay.m.id) {
      ui.arrasto = null;
      if (ax.ai !== ay.ai) {
        const nova = ax.m.aulas.slice(); const [k] = nova.splice(ax.ai, 1); nova.splice(ay.ai, 0, k);
        const velha = ax.m.aulas.map((x) => x.id);
        void executar(async () => { await rpc("ordenar_aulas", { p_modulo: ax.m.id, p_ids: nova.map((x) => x.id) }); return { msg: "Ordem das aulas salva.", texto: "ordem das aulas de " + ax.m.nome, desfazer: async () => { await rpc("ordenar_aulas", { p_modulo: ax.m.id, p_ids: velha }); } }; });
      } else render();
      return;
    }
    const mx = acharModulo(ui.arrasto), my = acharModulo(t.dataset.arrasta!);
    if (mx && my && mx.c.id === my.c.id) {
      ui.arrasto = null;
      if (mx.i !== my.i) {
        const nova = mx.c.modulos.slice(); const [k] = nova.splice(mx.i, 1); nova.splice(my.i, 0, k);
        const velha = mx.c.modulos.map((x) => x.id);
        void executar(async () => { await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: nova.map((x) => x.id) }); return { msg: "Ordem dos módulos salva.", texto: "ordem dos módulos de " + mx.c.nome, desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: velha }); } }; });
      } else render();
      return;
    }
    const qx = S.catsAba.findIndex((k) => k.id === ui.arrasto);
    if (qx >= 0) {
      const qy = S.catsAba.findIndex((k) => k.id === t.dataset.arrasta); ui.arrasto = null;
      if (qy >= 0 && qy !== qx && S.catsAba[qx].aba === S.catsAba[qy].aba) {
        const aba = S.catsAba[qx].aba; const nova = S.catsAba.filter((k) => k.aba === aba).map((k) => k.id); const velha = nova.slice();
        const a1 = nova.indexOf(S.catsAba[qx].id), b1 = nova.indexOf(S.catsAba[qy].id); const [m1] = nova.splice(a1, 1); nova.splice(b1, 0, m1);
        void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias_aba", p_ids: nova }); return { msg: "Ordem das categorias salva.", texto: "ordem das categorias", desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "categorias_aba", p_ids: velha }); } }; });
      } else render();
      return;
    }
    const px = S.cursos.findIndex((k) => k.id === ui.arrasto);
    if (px >= 0) {
      const py = S.cursos.findIndex((k) => k.id === t.dataset.arrasta); ui.arrasto = null;
      if (py >= 0 && py !== px && S.cursos[px].cat === S.cursos[py].cat) {
        const nova = S.cursos.slice(); const [k] = nova.splice(px, 1); nova.splice(py, 0, k); const velha = S.cursos.map((x) => x.id);
        void executar(async () => { await rpc("ordenar_lista", { p_tabela: "produtos", p_ids: nova.map((x) => x.id) }); return { msg: "Ordem das categorias salva.", texto: "ordem das categorias", desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "produtos", p_ids: velha }); } }; });
      } else render();
      return;
    }
    const dx = S.destaques.findIndex((k) => k.id === ui.arrasto);
    if (dx >= 0) {
      const dy = S.destaques.findIndex((k) => k.id === t.dataset.arrasta); ui.arrasto = null;
      if (dy >= 0 && dy !== dx) {
        const nova = S.destaques.slice(); const [k] = nova.splice(dx, 1); nova.splice(dy, 0, k);
        void executar(async () => { for (let n = 0; n < nova.length; n++) falhou(await supabase.from("destaques_inicio").update({ ordem: n + 1 }).eq("id", nova[n].id).select("id").single()); return "Ordem dos destaques salva."; });
      } else render();
      return;
    }
    const de = S.cats.findIndex((k) => k.id === ui.arrasto), para = S.cats.findIndex((k) => k.id === t.dataset.arrasta);
    ui.arrasto = null;
    if (de >= 0 && para >= 0 && de !== para) {
      const nova = S.cats.slice(); const [k] = nova.splice(de, 1); nova.splice(para, 0, k);
      const velha = S.cats.map((x) => x.id);
      void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: nova.map((x) => x.id) }); return { msg: "Ordem das categorias salva.", texto: "ordem das categorias", desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: velha }); } }; });
    } else render();
  });
  app.addEventListener("dragend", () => { ui.arrasto = null; soltarTexto(); document.querySelectorAll("[data-arrasta].arrastando, [data-arrasta].alvo").forEach((x) => x.classList.remove("arrastando", "alvo")); });

  /* ---------- sessão ---------- */
  async function abrirSessao(acabouDeEntrar: boolean) {
    try {
      // Quem é e os dados saem juntos; se não for da equipe, os dados são descartados.
      const euP = quemSouEu();
      const dadosP = lerTudo(euP);
      dadosP.catch(() => {});
      eu = await euP;
      if (!eu) {
        if (acabouDeEntrar) ui.erroLogin = "Este acesso não é da equipe do painel.";
        await api.sair();
        return;
      }
      S = await dadosP;
      void carregarFotos().then((ok) => { if (ok && eu) { S.fotos = fotosCache; render(); } });
      if (ui.primeiraVez) {
        ui.primeiraVez = false;
      }
    } catch (e) {
      eu = null;
      ui.erroLogin = motivo(e);
    }
  }

  render();
  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await abrirSessao(false);
    carregando = false;
    ui.focar = eu ? null : "loginCampo";
    render();
  })();
}
