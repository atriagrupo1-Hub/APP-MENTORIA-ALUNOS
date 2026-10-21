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

/* ---------- tipos ---------- */

type Papel = "Dono" | "Administrador" | "Suporte";
type AcessoAula = "padrao" | "liberada" | "bloqueada";
type TipoExtra = "Vídeo" | "Áudio" | "Texto" | "PDF / e-book" | "Link" | "Imagem / capa";

type Extra = { id: string; tipo: TipoExtra; nome: string; arquivo: string };
type Aula = {
  id: string; nome: string; video: string; capa: string; texto: string;
  // Nulos enquanto a 0047 não estiver no banco: aí os campos não aparecem.
  resumo: string | null; exercicio: string | null;
  acesso: AcessoAula; extras: Extra[];
};
type Modulo = { id: string; nome: string; ativo: boolean; aulas: Aula[] };
type Curso = {
  id: string; nome: string; cat: string; visivel: boolean; inicio: number;
  descricao: string; fundacao: string; aviso: string; modulos: Modulo[];
};
type Cat = { id: string; nome: string };
type Aluna = {
  id: string; nome: string; login: string; codigo: string;
  celular: string; email: string;
  entrada: string; validade: string; bloqueada: boolean; liberadas: number;
  acesso: { cursos: string[]; modulos: string[]; aulas: string[] };
  datas: Record<string, string>;
  cronograma: Record<string, number>;
  /** Do banco (0043): último acesso (AAAA-MM-DD), última aula, concluídas e nota. */
  ultimoAcesso: string; ultimaAula: string; concluidas: number; nota: number; nComentarios: number;
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
};
type Pessoa = {
  id: string; nome: string; login: string; codigo: string | null;
  papel: Papel; bloqueada: boolean; souEu: boolean;
};
type Eu = { id: string; nome: string; papel: Papel };

type Dados = {
  cats: Cat[]; cursos: Curso[]; alunas: Aluna[];
  comentarios: Comentario[]; equipe: Pessoa[];
  historico: Hist[]; sugestoes: Sugestao[];
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
  produtos_categoria_id_fkey: "Esta categoria tem produtos. Mude-os de categoria antes de remover.",
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

async function lerTudo(eu: Eu): Promise<Dados> {
  const [cats, prods, mods, aulas, midias, extras, alunas, acessos, crono, coms, contatos] = await Promise.all([
    supabase.from("categorias").select("id, titulo, ordem").order("ordem"),
    supabase.from("produtos").select("id, titulo, categoria_id, publicado, inicio, descricao, fundacao, aviso_material, ordem").order("ordem"),
    supabase.from("modulos").select("id, produto_id, titulo, ordem, bloqueado_geral").not("produto_id", "is", null).order("ordem"),
    supabase.from("aulas").select("*").order("ordem").order("numero"),
    supabase.from("aula_midia").select("aula_id, video_ref"),
    supabase.from("conteudos").select("id, aula_id, tipo, titulo, texto, arquivo_path, url, video_ref, ordem").not("aula_id", "is", null).order("ordem"),
    supabase.rpc("alunas_do_painel"),
    emPaginas((de, ate) => supabase.from("acessos").select("aluna_id, escopo, produto_id, modulo_id, aula_id, abre_em").order("id").range(de, ate)),
    supabase.from("cronograma_modulo").select("aluna_id, modulo_id, dias"),
    supabase.rpc("comentarios_para_moderacao", { p_aula: null }),
    supabase.rpc("contatos_das_alunas"),
  ]);
  // Rodada 2 (0043). Se alguma leitura destas falhar, o painel abre do mesmo jeito, sem ela.
  const [eng, feitas, notas, contatosAl, sugs, hist, cadastro] = await Promise.all([
    supabase.rpc("engajamento_alunas"),
    emPaginas((de, ate) => supabase.rpc("aulas_concluidas_alunas").order("aluna_id").order("aula_id").range(de, ate)),
    supabase.from("anotacoes_aluna").select("id, aluna_id, texto, autor_nome, quando").order("quando"),
    supabase.from("contatos_aluna").select("id, aluna_id, resultado, observacao, autor_nome, quando").order("quando"),
    supabase.from("sugestoes").select("id, texto, autor_id, autor_nome, quando").order("quando", { ascending: false }),
    supabase.from("historico_acoes").select("id, aluna_id, autor_nome, quando, texto").order("quando", { ascending: false }).limit(1000),
    supabase.from("profiles").select("id, criada_em").eq("papel", "aluna"),
  ]);
  const criadaEm = new Map<string, string>(((cadastro.data ?? []) as Array<{ id: string; criada_em: string }>).map((x) => [x.id, x.criada_em]));
  for (const r of [cats, prods, mods, aulas, extras, alunas, acessos, crono, coms]) falhou(r);

  const video = new Map<string, string>();
  for (const m of midias.data ?? []) video.set(m.aula_id, m.video_ref ?? "");

  const extrasDa = new Map<string, Extra[]>();
  for (const k of extras.data ?? []) {
    const lista = extrasDa.get(k.aula_id) ?? [];
    lista.push({
      id: k.id, tipo: tipoDoBanco(k.tipo), nome: k.titulo ?? "",
      arquivo: k.arquivo_path ?? k.url ?? k.video_ref ?? k.texto ?? "",
    });
    extrasDa.set(k.aula_id, lista);
  }

  const aulasDo = new Map<string, Aula[]>();
  for (const a of aulas.data ?? []) {
    const lista = aulasDo.get(a.modulo_id) ?? [];
    lista.push({
      id: a.id, nome: a.titulo, video: video.get(a.id) ?? "", capa: a.capa_path ?? "",
      texto: a.texto ?? "",
      resumo: "resumo" in a ? a.resumo ?? "" : null, exercicio: "exercicio" in a ? a.exercicio ?? "" : null,
      acesso: a.bloqueado_geral ? "bloqueada" : a.liberada_geral ? "liberada" : "padrao",
      extras: extrasDa.get(a.id) ?? [],
    });
    aulasDo.set(a.modulo_id, lista);
  }

  const modsDo = new Map<string, Modulo[]>();
  for (const m of mods.data ?? []) {
    const lista = modsDo.get(m.produto_id) ?? [];
    lista.push({ id: m.id, nome: m.titulo, ativo: !m.bloqueado_geral, aulas: aulasDo.get(m.id) ?? [] });
    modsDo.set(m.produto_id, lista);
  }

  const cursos: Curso[] = (prods.data ?? []).map((c) => ({
    id: c.id, nome: c.titulo, cat: c.categoria_id ?? "", visivel: !!c.publicado,
    inicio: c.inicio ?? 1, descricao: c.descricao ?? "", fundacao: c.fundacao ?? "",
    aviso: c.aviso_material ?? "", modulos: modsDo.get(c.id) ?? [],
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
    feitas: new Set<string>(), notas: [], contatos: [],
  }));
  const porId = new Map(listaAlunas.map((a) => [a.id, a]));
  for (const e of (eng.data ?? []) as Record<string, unknown>[]) {
    const al = porId.get(String(e.aluna_id));
    if (!al) continue;
    al.ultimoAcesso = e.ultimo_acesso ? diaDe(String(e.ultimo_acesso)) : "";
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
    if (ac.escopo === "produto" && ac.produto_id) al.acesso.cursos.push(ac.produto_id);
    if (ac.escopo === "modulo" && ac.modulo_id) al.acesso.modulos.push(ac.modulo_id);
    if (ac.escopo === "aula" && ac.aula_id) {
      al.acesso.aulas.push(ac.aula_id);
      if (ac.abre_em) al.datas[ac.aula_id] = diaDe(ac.abre_em);
    }
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
      id: c.id, autora: c.autora_nome, autoraId: c.autora_id ?? "", aula: c.aula_id, quando: quando(c.criado_em), texto: c.texto,
      estado: c.status === "pendente" ? "moderar" : (c.status as Estado),
      resposta: resposta.get(c.id) ?? "",
    }));

  let equipe: Pessoa[] = [];
  if (eu.papel !== "Suporte") {
    const r = falhou(await supabase.rpc("equipe_do_painel"));
    equipe = ((r.data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: String(e.id), nome: String(e.nome), login: String(e.login),
      codigo: e.codigo ? String(e.codigo) : null, papel: PAPEL[String(e.papel)] ?? "Suporte",
      bloqueada: e.status === "bloqueada", souEu: !!e.sou_eu,
    }));
  }

  return {
    cats: (cats.data ?? []).map((k) => ({ id: k.id, nome: k.titulo })),
    cursos, alunas: listaAlunas, comentarios, equipe,
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
  let S: Dados = { cats: [], cursos: [], alunas: [], comentarios: [], equipe: [], historico: [], sugestoes: [] };
  let carregando = true;
  let ocupado = false;
  /** Os quadros do Início que a pessoa abriu. Começam todos fechados. */
  const inicioAberto = new Set<string>();
  const ui = {
    tab: "inicio", curso: null as string | null, aula: null as string | null, busca: "",
    filtroCom: "moderar" as Estado, modal: null as null | Record<string, string>,
    editando: null as null | { tipo: string; id: string }, addAula: null as string | null,
    respondendo: null as string | null, extraTipo: "PDF / e-book" as TipoExtra, erroLogin: "",
    focar: null as string | null, arrasto: null as string | null,
    abertos: new Set<string>(), primeiraVez: true,
    filtroAl: "todas", ordemAl: "recentes", sel: [] as string[], menu: null as string | null,
    ficha: null as string | null, verCodigo: null as string | null,
    buscaGeral: "", buscaAberta: false, inicioVista: "",
    acessoLista: "", acessoAluna: null as string | null, acessoAba: "geral", aaAnima: "", filtroEng: "todas", guiaEng: true, ajuda: null as string | null,
    sujo: null as null | { f: string; id: string },
  };
  const previas: Record<string, string> = {};
  let pend: null | (() => Promise<Resultado>) = null;

  const toastEl = document.createElement("div");
  toastEl.id = "toast"; toastEl.className = "toast"; toastEl.setAttribute("role", "status"); toastEl.hidden = true;
  const arquivoCapa = Object.assign(document.createElement("input"), { type: "file", id: "arquivoCapa", accept: "image/*", hidden: true });
  const arquivoExtra = Object.assign(document.createElement("input"), { type: "file", id: "arquivoExtra", hidden: true });
  document.body.append(toastEl, arquivoCapa, arquivoExtra);

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
  const numModulo = (c: Curso, i: number) => i + (c.inicio == null ? 1 : c.inicio);
  const localAula = (aid: string) => { const x = acharAula(aid); return x ? "Módulo " + numModulo(x.c, x.mi) + " · Aula " + (x.ai + 1) : "Aula removida"; };
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
  const ABAS = [["inicio", "Início"], ["alunas", "Alunas"], ["engajamento", "Engajamento"], ["cursos", "Cursos e conteúdos"], ["layout", "Categorias / Layout"], ["comentarios", "Comentários"], ["equipe", "Equipe"], ["registro", "Registro"]];

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
      case "layout": return ["Categorias / Layout", p(S.cats.length, "categoria", "categorias")];
      case "cursos": return ["Cursos e conteúdos", p(S.cursos.length, "produto", "produtos") + " · " + p(totalModulos(), "módulo", "módulos") + " · " + p(S.cursos.reduce((s, k) => s + totalAulas(k), 0), "aula", "aulas")];
      case "curso": return c ? [c.nome, p(c.modulos.length, "módulo", "módulos") + " · " + p(totalAulas(c), "aula", "aulas")] : ["Curso aberto", "nenhum curso aberto"];
      case "aula": return x ? [x.a.nome, localAula(x.a.id)] : ["Aula aberta", "nenhuma aula aberta"];
      case "comentarios": return ["Comentários", p(moderar, "para moderar", "para moderar")];
      case "equipe": return ["Equipe", p(S.equipe.length, "pessoa", "pessoas")];
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
    const abas = ABAS.filter(([id]) => !restrita(id));
    const telas: Record<string, () => string> = { inicio: telaInicio, alunas: telaAlunas, ficha: telaFicha, engajamento: telaEngajamento, layout: telaLayout, cursos: telaCursos, curso: telaCurso, aula: telaAula, comentarios: telaComentarios, equipe: telaEquipe, registro: telaRegistro };
    if (restrita(ui.tab)) ui.tab = "inicio";
    return `
    <div class="marca">
      ${selo}
      <div class="busca-geral">
        <input id="buscaGeral" class="campo" type="search" placeholder="Buscar aluna, celular, aula ou comentário" value="${h(ui.buscaGeral)}" data-i="buscaGeral" autocomplete="off" aria-label="Busca geral" />
        <div id="buscaResultados">${resultadosBusca()}</div>
      </div>
      <span class="quem" style="font-size:13px;color:var(--texto-2)">${h(eu!.nome)} · ${h(eu!.papel)}</span>
      <button class="botao-neutro" data-a="sugestoes">Sugestões${S.sugestoes.length ? ` <span class="bolinha">${S.sugestoes.length}</span>` : ""}</button>
      ${botaoTema()}
      <button class="botao-neutro" data-a="sair">Sair</button>
    </div>
    <div class="conteudo">
      <div class="cabecalho"><h1>${h(t)}</h1>${ajudaAba()}<span class="contagem">${h(cont)}</span>${pilha.length ? `<span style="flex:1"></span><button class="botao-neutro" data-a="desfazer-abrir" title="Voltar as últimas alterações">↶ Desfazer (${pilha.length})</button>` : ""}</div>
      <div class="abas" role="tablist">
        ${abas.map(([id, nome]) => { const on = ui.tab === id || (id === "cursos" && (ui.tab === "curso" || ui.tab === "aula")) || (id === "alunas" && ui.tab === "ficha"); return `<button class="aba" role="tab" data-a="aba" data-v="${id}" ${on ? 'aria-selected="true"' : ""}>${nome}</button>`; }).join("")}
      </div>
      ${(telas[ui.tab] || telaInicio)()}
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
  const naoEntrou = (a: Aluna) => !a.bloqueada && !vencida(a) && !a.ultimoAcesso;
  const cadastrada = (a: Aluna) => "cadastrada " + (a.entrada ? haQuanto(a.entrada) + " (" + br(a.entrada) + ")" : "sem data");
  const sitInfo = (s: Sit): [string, string] => ({ ativa: ["Ativa", "var(--verde)"], vencendo: ["Vence em breve", "var(--ouro-txt)"], vencida: ["Vencida", VERMELHO], bloqueada: ["Bloqueada", VERMELHO] } as Record<Sit, [string, string]>)[s];
  const avatar = (a: Aluna, grande = false) => `<span class="avatar${grande ? " grande" : ""}" style="--cor:${sitInfo(situacao(a))[1]}" aria-hidden="true">${h(iniciais(a.nome))}</span>`;
  const numero = (n: number, rotulo: string, atencao = false) => `<div class="numero${atencao && n ? " atencao" : ""}"><b>${n}</b><span>${h(rotulo)}</span></div>`;
  const numeroTxt = (txt: string, rotulo: string, sub = "") => `<div class="numero"><b class="txt">${h(txt)}</b><span>${h(rotulo)}</span>${sub ? `<em>${h(sub)}</em>` : ""}</div>`;
  const vaiVencer = (a: Aluna) => { const n = diasEntre(hoje(), a.validade); return n <= 0 ? "vence hoje" : n === 1 ? "vence amanhã" : "vence em " + n + " dias"; };
  const semNada = (t: string) => `<p class="nada">${t}</p>`;
  const nova = (a: Aluna) => !!a.entrada && diasEntre(a.entrada, hoje()) >= 0 && diasEntre(a.entrada, hoje()) <= 7;
  const comentariosDe = (a: Aluna) => S.comentarios.filter((k) => k.autoraId === a.id);

  /* ---------- INÍCIO ---------- */
  function telaInicio() {
    const moder = S.comentarios.filter((k) => k.estado === "moderar");
    const venc = S.alunas.filter((a) => situacao(a) === "vencendo").sort((x, y) => x.validade.localeCompare(y.validade));
    const par = S.alunas.filter(parada);
    const comecar = S.alunas.filter(naoEntrou).sort((x, y) => (x.entrada || "").localeCompare(y.entrada || ""));
    const novas = S.alunas.filter(nova);
    const hora = Number(new Date().toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", hour12: false }).slice(0, 2));
    const saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const pendencias = moder.length + venc.length + par.length;
    /*
     * Cada quadro do Início nasce fechado, mostrando só o título, o
     * número e um resumo de uma linha (quantas e de quando). "Ver" abre
     * a lista para baixo. É <details>: abrir não redesenha a tela, e o
     * que ficou aberto continua aberto depois de uma ação (inicioAberto).
     */
    const bloco = (id: string, titulo: string, n: number, resumo: string, sub: string, corpo: string) => `
        <details class="painel-bloco sanfona" data-bloco="${id}" ${inicioAberto.has(id) ? "open" : ""}>
          <summary>
            <span class="sanfona-topo"><h3>${titulo}</h3><span class="conta${n ? " tem" : ""}">${n}</span></span>
            <span class="sanfona-resumo">${h(resumo)}</span>
            <span class="sanfona-ver" aria-hidden="true"></span>
          </summary>
          <div class="sanfona-corpo"><p class="sub">${sub}</p>${corpo}</div>
        </details>`;
    const periodo = (l: Aluna[]) => {
      const ds = l.map((a) => a.entrada).filter(Boolean).sort();
      if (!ds.length) return "sem data";
      return ds[0] === ds[ds.length - 1] ? "cadastro em " + br(ds[0]) : "cadastros de " + br(ds[0]) + " a " + br(ds[ds.length - 1]);
    };
    // "Alunas e acessos" abre numa tela só dela (telaAcessos, logo abaixo).
    if (ui.inicioVista === "acessos") return telaAcessos({ vencem: venc, parada: par, comecar, novas }, periodo);

    const linhaResumo = (n: number, txt: string, atencao = false) => `<li><b class="${atencao && n ? "atencao" : ""}">${n}</b> ${txt}</li>`;
    return `
    <section class="tela ativa">
      <p class="saudacao">${saud}, ${h(primeiroNome(eu!.nome))}. ${pendencias ? "Isto pede sua atenção hoje." : "Tudo em dia por aqui."}</p>
      <div class="grade-2">
        ${bloco("comentarios", "Comentários esperando", moder.length, moder.length ? p(moder.length, "comentário esperando", "comentários esperando") : "Nenhum esperando", "Publique, oculte ou responda.",
          (moder.slice(0, 3).map((k) => `<div class="mini"><span class="nome"><b class="leve">${h(k.texto)}</b><span>${h(k.autora)} · ${localAula(k.aula)} · ${h(k.quando)}</span></span></div>`).join("") || semNada("Nenhum comentário esperando."))
          + (moder.length ? `<button class="botao-neutro grande" style="margin-top:12px" data-a="ir-moderar">${moder.length > 3 ? "Ver os " + moder.length + " comentários" : "Moderar agora"}</button>` : ""))}
        <button type="button" class="painel-bloco cartao-acessos" data-a="inicio-acessos">
          <span class="sanfona-topo"><h3>Alunas e acessos</h3></span>
          <ul class="resumo-acessos">
            ${linhaResumo(comecar.length, "ainda não fizeram o primeiro acesso")}
            ${linhaResumo(novas.length, "novas nesta semana")}
            ${linhaResumo(venc.length, "acessos vencem em 15 dias", true)}
            ${linhaResumo(par.length, "sem acesso há mais de 14 dias", true)}
          </ul>
          <span class="sanfona-ver" aria-hidden="true"></span>
        </button>
      </div>
    </section>`;
  }

  /* ---------- ALUNAS E ACESSOS ----------
   *
   * Indicadores → lista lateral → cadastro da aluna. Os quatro quadros
   * nunca mudam de tamanho: a lista abre num painel à direita, por cima
   * da página, e o cadastro abre por cima da lista. Fechar o cadastro
   * volta à lista; fechar a lista volta aos quadros. As listas e o
   * cálculo de cada uma são os mesmos de antes — só a apresentação muda.
   */
  type Lista = "vencem" | "parada" | "comecar" | "novas";
  const ICONE: Record<Lista, string> = {
    vencem: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="16.5" cy="16" r="2.6"/><path d="M16.5 14.9v1.2l.8.6"/></svg>`,
    parada: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.2" height="14" rx="1"/><rect x="13.8" y="5" width="3.2" height="14" rx="1"/></svg>`,
    comecar: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/></svg>`,
    novas: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  };
  /** Avatar da seção: uma cor suave por pessoa, como na referência (a cor não quer dizer nada). */
  const AA_CORES = ["#4f8a43", "#b4465f", "#3f6fa8", "#5c8a5a", "#b07a2a", "#7a52a8", "#2f8a8a"];
  const aaAvatar = (a: Aluna, grande = false) => {
    let n = 0; for (const c of a.id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return `<span class="avatar${grande ? " grande" : ""}" style="--cor:${AA_CORES[n % AA_CORES.length]}" aria-hidden="true">${h(iniciais(a.nome))}</span>`;
  };
  const pilula = (txt: string, tipo: "ouro" | "verde" | "vermelho" | "neutro") => `<span class="aa-pilula ${tipo}"><i></i>${h(txt)}</span>`;
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
  function quadrosComLista(defs: Record<string, Quadro>, ordem: string[]) {
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
      <div class="aa-grade">${ordem.map(cartao).join("")}</div>
      ${lista}
      ${aberta && ui.acessoAluna ? cadastroAluna(anima === "aluna") : ""}`;
  }

  function telaAcessos(listas: Record<Lista, Aluna[]>, periodo: (l: Aluna[]) => string) {
    const lib = (a: Aluna) => " · " + p(a.liberadas, "aula liberada", "aulas liberadas");
    const DEF: Record<Lista, Quadro> = {
      vencem: {
        titulo: "Acessos que vencem em 15 dias", lista: listas.vencem, icone: ICONE.vencem,
        resumo: listas.vencem.length ? "o primeiro " + vaiVencer(listas.vencem[0]) + " · " + br(listas.vencem[0].validade) : "Nenhum vencendo",
        sub: "Abra o acesso dela e renove por lá antes que vença.", vazio: "Nenhum acesso vencendo.",
        meta: (a) => vaiVencer(a) + " · " + br(a.validade) + lib(a),
        acao: (a) => `<button class="botao-verde" data-a="aa-aluna" data-id="${a.id}" data-v="acessos">Ver acesso</button>`,
      },
      parada: {
        titulo: "Sem acesso há mais de 14 dias", lista: listas.parada, icone: ICONE.parada,
        resumo: listas.parada.length ? p(listas.parada.length, "aluna parou de entrar", "alunas pararam de entrar") : "Ninguém parou de entrar",
        sub: "Um recado pode trazê-la de volta.", vazio: "Ninguém parou de entrar.",
        meta: (a) => "último acesso " + haQuanto(a.ultimoAcesso) + lib(a),
        acao: (a) => a.celular ? `<button class="botao-neutro" data-a="whatsapp-volta" data-id="${a.id}">WhatsApp</button>` : "",
      },
      comecar: {
        titulo: "Ainda não fizeram o primeiro acesso", lista: listas.comecar, icone: ICONE.comecar,
        resumo: listas.comecar.length ? p(listas.comecar.length, "aluna", "alunas") + " · " + periodo(listas.comecar) : "Todas já entraram",
        sub: "Cadastradas que ainda não entraram, das mais antigas para as mais novas. Confira se receberam o login e o código.", vazio: "Todas já entraram pelo menos uma vez.",
        meta: (a) => cadastrada(a) + lib(a),
        acao: (a) => a.celular ? `<button class="botao-neutro" data-a="whatsapp" data-id="${a.id}">Enviar acesso</button>` : "",
      },
      novas: {
        titulo: "Novas nesta semana", lista: listas.novas, icone: ICONE.novas,
        resumo: listas.novas.length ? p(listas.novas.length, "cadastrada", "cadastradas") + " · " + periodo(listas.novas) : "Nenhum cadastro nos últimos 7 dias",
        sub: "Cadastradas nos últimos 7 dias.", vazio: "Nenhum cadastro nos últimos 7 dias.",
        meta: (a) => "entrou em " + br(a.entrada) + lib(a),
        acao: () => "",
      },
    };
    return `
    <section class="tela ativa aa">
      <button type="button" class="botao-neutro grande" data-a="inicio-voltar" style="margin-bottom:18px">← Voltar ao início</button>
      <h2 class="aa-titulo">Alunas e acessos</h2>
      <p class="aa-intro">Clique em um dos quadros para ver a lista.</p>
      ${quadrosComLista(DEF, ["vencem", "parada", "comecar", "novas"])}
    </section>`;
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
          <div class="aa-quem">${aaAvatar(a, true)}<div><h2>${h(a.nome)}</h2><p>Cadastrada em ${br(a.criadaEm ? diaDe(a.criadaEm) : a.entrada)} • ${p(a.liberadas, "aula liberada", "aulas liberadas")}</p></div></div>
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
    layout: ["Categorias / Layout", "As seções que a aluna vê na área de membros, como Mentoria, Ebooks e Documentários.", "arraste para mudar a ordem em que aparecem. Renomeie ou crie uma categoria nova quando precisar."],
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
  function telaEngajamento() {
    const base = S.alunas.filter((a) => !a.bloqueada && !vencida(a)).sort((x, y) => y.nota - x.nota);
    const media = base.length ? Math.round(base.reduce((s, x) => s + x.nota, 0) / base.length) : 0;
    const semContato = (x: Aluna) => !x.contatos.some((c) => diasEntre(diaDe(c.quando), hoje()) <= 7);
    const grupo = (g: string) => (x: Aluna) => nivel(x)[2] === g;
    const FIL: [string, string, (x: Aluna) => boolean][] = [["todas", "Todas", () => true], ["avancando", "Avançando", grupo("avancando")], ["ritmo", "No ritmo", grupo("ritmo")], ["empurrao", "Precisa de um empurrão", grupo("empurrao")], ["recem", "Recém-chegadas", grupo("recem")], ["semcontato", "Sem contato há 7 dias", semContato]];
    return `
    <section class="tela ativa aa">
      ${quadrosComLista(quadrosEng(base, FIL, media), ["empurrao", "ritmo", "avancando", "recem", "semcontato", "todas"])}
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
  function telaAlunas() {
    const { lista } = listaAlunas();
    ui.sel = ui.sel.filter((id) => S.alunas.some((a) => a.id === id));
    const todas = lista.length > 0 && lista.every((a) => ui.sel.includes(a.id));
    const anima = ui.aaAnima; ui.aaAnima = "";
    return `
    <section class="tela ativa al">
      <h2 class="al-titulo">Alunas</h2>
      <p class="al-sub">Gerencie todas as alunas da mentoria.</p>
      <div class="al-barra">
        <label class="al-busca">${ICONE_AL.lupa}<input id="busca" placeholder="Procurar por nome, login ou celular" value="${h(ui.busca)}" data-i="busca" aria-label="Procurar aluna" /></label>
        <button class="al-botao-ouro" data-a="aluna-nova">${ICONE_AL.mais}Cadastrar aluna</button>
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
          <span role="columnheader">Aluna</span><span role="columnheader">Login</span><span role="columnheader">Situação</span><span role="columnheader">Acesso até</span><span role="columnheader">Aulas liberadas</span><span role="columnheader">Último acesso</span><span role="columnheader" class="al-acoes-cab">Ações</span>
        </div>
        ${lista.map(linhaAluna).join("")}
      </div>` : `<div class="vazio">${S.alunas.length ? "Nenhuma aluna neste filtro." : "Nenhuma aluna cadastrada ainda."}</div>`}
      ${ui.acessoAluna ? cadastroAluna(anima === "aluna") : ""}
    </section>`;
  }
  function linhaAluna(a: Aluna) {
    const sit = situacao(a); const [rot] = sitInfo(sit);
    const cor = sit === "ativa" ? "verde" : sit === "vencendo" ? "ouro" : "vermelho";
    const sub = naoEntrou(a) ? "Ainda não entrou" : parada(a) ? "Sem acesso há " + diasEntre(a.ultimoAcesso, hoje()) + " dias" : "";
    const marc = ui.sel.includes(a.id);
    return `
    <div class="al-linha${marc ? " marcada" : ""}${ui.acessoAluna === a.id ? " aberta" : ""}" role="row">
      <span role="cell"><input type="checkbox" class="selec" data-sel="${a.id}" ${marc ? "checked" : ""} aria-label="Selecionar ${h(a.nome)}" /></span>
      <button type="button" class="al-quem" role="cell" data-a="aa-aluna" data-id="${a.id}" aria-label="Abrir a ficha de ${h(a.nome)}">${aaAvatar(a)}<span><b>${h(a.nome)}</b><span>Cadastrada em ${br(cadastroDe(a))}</span></span></button>
      <span role="cell" class="al-cel" data-rot="Login">${h(a.login)}</span>
      <span role="cell" class="al-cel al-sit" data-rot="Situação"><span class="al-sit-${cor}"><i></i>${h(rot)}</span>${sub ? `<small>${sub}</small>` : ""}</span>
      <span role="cell" class="al-cel" data-rot="Acesso até">${a.validade ? br(a.validade) : "—"}</span>
      <span role="cell" class="al-cel" data-rot="Aulas liberadas">${p(a.liberadas, "aula", "aulas")}</span>
      <span role="cell" class="al-cel" data-rot="Último acesso">${ultimoAcessoTxt(a)}</span>
      <span role="cell" class="al-acoes">
        <button class="al-botao pequeno" data-a="aa-aluna" data-id="${a.id}">Abrir ficha</button>
        <span class="menu-acoes">
          <button class="al-botao pequeno quadrado" data-a="menu" data-id="${a.id}" aria-label="Mais ações para ${h(a.nome)}" aria-haspopup="menu" aria-expanded="${ui.menu === a.id}">⋯</button>
          ${ui.menu === a.id ? menuAluna(a) : ""}
        </span>
      </span>
    </div>`;
  }

  /* ---------- CATEGORIAS ---------- */
  function telaLayout() {
    return `
    <section class="tela ativa">
      <p class="rotulo" style="margin:0 0 10px">A ordem em que a aluna vê — arraste para reordenar</p>
      <div class="chips" style="margin-bottom:22px">
        ${S.cats.map((k) => `<button class="chip" draggable="true" data-arrasta="${k.id}">${h(k.nome)}</button>`).join("") || `<span style="font-size:13px;color:var(--texto-3)">Nenhuma categoria.</span>`}
      </div>
      ${S.cats.map((k, i) => {
        const n = S.cursos.filter((c) => c.cat === k.id).length;
        if (editando("cat", k.id)) return `
        <div class="bloco-modulo">
          <form data-f="cat-renomear" data-id="${k.id}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <input id="editarCampo" class="campo" style="flex:1 1 260px;max-width:520px" name="nome" value="${h(k.nome)}" required />
            ${botoesEdicao("Salvar")}
          </form>
        </div>`;
        return `
        <div class="bloco-modulo">
          <div class="cabecalho-modulo">
            <span class="nome"><b>${h(k.nome)}</b><br /><span style="font-size:13px;color:var(--texto-3)">${p(n, "curso", "cursos")}</span></span>
            <span class="acoes">
              <button class="botao-neutro" data-a="cat-editar" data-id="${k.id}">Editar</button>
              <button class="botao-neutro" data-a="cat-sobe" data-id="${k.id}" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
              <button class="botao-neutro" data-a="cat-desce" data-id="${k.id}" ${i === S.cats.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
              <button class="botao-neutro botao-remover" data-a="cat-remover" data-id="${k.id}">Remover</button>
            </span>
          </div>
        </div>`;
      }).join("")}
      <form data-f="cat-add" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
        <input class="campo" name="nome" style="flex:1 1 260px;max-width:520px" placeholder="Nome da nova categoria" required />
        <button class="botao-neutro grande">+ Adicionar categoria</button>
      </form>
    </section>`;
  }

  /* ---------- CURSOS ---------- */
  function telaCursos() {
    return `
    <section class="tela ativa">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px">
        <span style="flex:1;color:var(--texto-2);font-size:14px">Todos os produtos. Clique num deles para montar o conteúdo.</span>
        <button class="botao" data-a="curso-novo">+ Criar novo</button>
      </div>
      ${S.cursos.length ? `<div class="cartoes">
        ${S.cursos.map((c) => `<button class="cartao-curso" data-a="abrir-curso" data-id="${c.id}"><b>${h(c.nome)}</b><span>${h((cat(c.cat) || { nome: "" }).nome || "Sem categoria")}${c.visivel ? "" : " · oculto"}</span></button>`).join("")}
      </div>` : `<div class="vazio">Nenhum produto ainda. Crie o primeiro.</div>`}
    </section>`;
  }

  /*
   * Uma frase direta para cada campo: o que vai ali e onde a aluna vê.
   * Fica dentro do "?" amarelo ao lado do nome do campo.
   */
  const AJ = {
    nome: "Aqui você coloca o nome do curso. É assim que a aluna vê o curso chamado na área de membros.",
    cat: "Escolha em qual seção de Presentes o curso aparece para a aluna (Ebooks, Frequências…). O curso principal da mentoria fica sempre na aba Módulos.",
    vis: "Visível: a aluna vê o curso. Oculto: fica escondido enquanto você monta.",
    desc: "Aqui você escreve uma ou duas frases apresentando o curso. A aluna lê isso na página do curso, embaixo do nome.",
    fund: "Anotação só da equipe: para quem é o curso e o que ele promete. A aluna não vê.",
    aviso: "Recado que aparece no fim de todas as aulas deste curso (ex.: \"Tenha caderno e caneta\"). Vazio, não aparece nada.",
    botoes: "Salvar grava as mudanças. Cancelar desfaz o que você digitou. Remover apaga o curso inteiro, com módulos e aulas, sem volta.",
    conteudo: "Aqui ficam os módulos e as aulas do curso, na ordem em que a aluna vê. ⌄ mostra as aulas · Editar muda o nome · Bloquear para todas fecha o módulo para todas as alunas · ↑ ↓ mudam a ordem.",
    aulas: "Abrir: coloca vídeo, capa e texto da aula · Liberar para todas: abre a aula para todo mundo · Bloquear: fecha para todo mundo · ↑ ↓ mudam a ordem.",
    addMod: "Escreva o nome do novo módulo. Ele entra no fim da lista.",
    video: "Cole aqui o link do vídeo da aula (Cloudflare Stream). É o vídeo que a aluna assiste. Vazio, ela vê \"Aula será adicionada em breve\".",
    capa: "A imagem da aula que a aluna vê na lista de aulas e antes de dar o play. Clique em Escolher imagem e o caminho se preenche sozinho.",
    texto: "O texto que a aluna lê embaixo do vídeo, em \"Sobre a aula\". Linha em branco separa parágrafo; *asteriscos* deixam em negrito.",
    resumo: "Os pontos principais da aula, um por linha. A aluna vê na aba Resumo.",
    exercicio: "A tarefa da aula. Primeira linha é o título, depois o texto. A aluna vê na aba Exercícios.",
    extras: "Materiais a mais da aula (PDF, link, áudio…). Viram botões no fim de \"Sobre a aula\".",
  };
  // Bolinha amarela com "?" preto; a frase abre ao tocar. <details> nativo:
  // abre e fecha sem redesenhar a tela, então nada digitado se perde.
  const dicaCampo = (txt: string) => `<details class="ajuda-amarela" onclick="event.stopPropagation()"><summary aria-label="Ajuda">?</summary><span class="ajuda-amarela-txt">${txt}</span></details>`;

  /* ---------- CURSO ABERTO ---------- */
  function telaCurso() {
    const c = curso(ui.curso);
    if (!c) return `<section class="tela ativa"><div class="vazio">Nenhum curso aberto. Escolha um em Cursos e conteúdos.</div></section>`;
    return `
    <section class="tela ativa">
      <div style="display:flex;flex-wrap:wrap;align-items:start;gap:14px;margin-bottom:18px">
        <span style="flex:1 1 320px"><span class="rotulo">Curso</span><div class="titulo" style="font-size:22px">${h(c.nome)}</div></span>
        <button class="botao-neutro grande" data-a="aba" data-v="cursos">← Voltar</button>
      </div>

      <p class="rotulo" style="margin:0 0 10px">Configurações</p>
      <form data-f="curso-config" class="cartao" style="padding:16px;margin-bottom:26px">
        <div class="campos">
          <div class="grupo nome"><span class="rotulo rotulo-ajuda">Nome ${dicaCampo(AJ.nome)}</span><input class="campo" name="nome" value="${h(c.nome)}" required aria-label="Nome" /></div>
          <div class="grupo" style="flex:1 1 240px"><span class="rotulo rotulo-ajuda">Categoria onde aparece ${dicaCampo(AJ.cat)}</span>
            <select class="campo" name="cat" required aria-label="Categoria onde aparece">
              ${S.cats.map((k) => `<option value="${k.id}" ${k.id === c.cat ? "selected" : ""}>${h(k.nome)}</option>`).join("")}
            </select>
          </div>
          <div class="grupo" style="flex:0 0 150px"><span class="rotulo rotulo-ajuda">Visibilidade ${dicaCampo(AJ.vis)}</span>
            <select class="campo" name="visivel" aria-label="Visibilidade"><option value="1" ${c.visivel ? "selected" : ""}>Visível</option><option value="0" ${c.visivel ? "" : "selected"}>Oculto</option></select>
          </div>
        </div>
        <div class="grupo largo" style="margin-top:14px"><span class="rotulo rotulo-ajuda">Descrição ${dicaCampo(AJ.desc)}</span><textarea class="campo" name="descricao" rows="2" aria-label="Descrição">${h(c.descricao)}</textarea></div>
        <div class="grupo largo" style="margin-top:14px"><span class="rotulo rotulo-ajuda">Fundação — o que é este curso ${dicaCampo(AJ.fund)}</span><textarea class="campo" name="fundacao" rows="5" placeholder="Para quem é, o que promete, com que voz se fala aqui." aria-label="Fundação">${h(c.fundacao)}</textarea></div>
        <div class="grupo largo" style="margin-top:14px"><span class="rotulo rotulo-ajuda">Aviso de material — aparece em toda aula ${dicaCampo(AJ.aviso)}</span><textarea class="campo" name="aviso" rows="2" aria-label="Aviso de material">${h(c.aviso)}</textarea></div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">
          <button class="botao">Salvar</button>
          <button type="button" class="botao-neutro grande" data-a="curso-cancelar">Cancelar</button>
          <button type="button" class="botao-neutro grande botao-remover" data-a="curso-remover" data-id="${c.id}">Remover</button>
          <span style="align-self:center">${dicaCampo(AJ.botoes)}</span>
        </div>
      </form>

      <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:12px">
        <span class="rotulo rotulo-ajuda">Conteúdo do produto ${dicaCampo(AJ.conteudo)}</span>
        <span style="font-size:13px;color:var(--texto-2)">${p(c.modulos.length, "módulo", "módulos")} · ${p(totalAulas(c), "aula", "aulas")}</span>
      </div>

      ${c.modulos.map((m, i) => blocoModulo(c, m, i)).join("") || `<div class="vazio" style="margin-bottom:14px">Este produto ainda não tem módulos.</div>`}

      <form data-f="mod-add" data-id="${c.id}" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;padding:16px;border:1px dashed rgba(255,255,255,.16);border-radius:14px">
        <input class="campo" name="nome" style="flex:1 1 260px;max-width:520px" placeholder="Nome do novo módulo" required />
        <button class="botao-neutro grande">+ Adicionar módulo</button>
        <span style="align-self:center">${dicaCampo(AJ.addMod)}</span>
      </form>
    </section>`;
  }

  function blocoModulo(c: Curso, m: Modulo, i: number) {
    const aberto = ui.abertos.has(m.id);
    const cab = editando("mod", m.id) ? `
      <form data-f="mod-renomear" data-id="${m.id}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <input id="editarCampo" class="campo" style="flex:1 1 280px;max-width:560px" name="nome" value="${h(m.nome)}" required />
        ${botoesEdicao("Salvar")}
      </form>` : `
      <div class="cabecalho-modulo">
        <span class="nome"><b>Módulo ${numModulo(c, i)} — ${h(m.nome)}</b><br /><span style="font-size:13px;color:var(--texto-3)">${p(m.aulas.length, "aula", "aulas")}</span></span>
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
          <input id="editarCampo" class="campo" style="flex:1 1 280px;max-width:560px" name="nome" value="${h(a.nome)}" required />
          ${botoesEdicao("Salvar")}
        </form>
      </div>`;
    const info = [a.video ? "com vídeo" : "sem vídeo", a.texto ? "com texto" : null, a.extras.length ? p(a.extras.length, "extra", "extras") : null].filter(Boolean).join(" · ");
    const est = a.acesso === "liberada" ? etiqueta("Liberada para todas", OURO) : a.acesso === "bloqueada" ? etiqueta("Bloqueada", VERMELHO) : "";
    return `
      <div class="linha">
        <span class="nome"><b>${j + 1}. ${h(a.nome)}</b><span>${info}</span></span>
        ${est}
        <span class="acoes">
          <button class="botao-neutro" data-a="aula-sobe" data-id="${a.id}" ${j === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button class="botao-neutro" data-a="aula-desce" data-id="${a.id}" ${j === m.aulas.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
          <button class="botao-neutro" data-a="abrir-aula" data-id="${a.id}">Abrir</button>
          <button class="botao-neutro" data-a="aula-liberar" data-id="${a.id}">${a.acesso === "liberada" ? "Tirar liberação" : "Liberar para todas"}</button>
          <button class="botao-neutro" data-a="aula-editar" data-id="${a.id}">Editar</button>
          ${a.acesso === "bloqueada"
            ? `<button class="botao-neutro" data-a="aula-bloquear" data-id="${a.id}">Desbloquear</button>`
            : `<button class="botao-neutro botao-remover" data-a="aula-bloquear" data-id="${a.id}">Bloquear</button>`}
          <button class="botao-neutro botao-remover" data-a="aula-remover" data-id="${a.id}">Remover</button>
        </span>
      </div>`;
  }

  /* ---------- AULA ABERTA ---------- */
  function telaAula() {
    const x = ui.aula ? acharAula(ui.aula) : null;
    if (!x) return `<section class="tela ativa"><div class="vazio">Nenhuma aula aberta. Abra uma pela lista do curso.</div></section>`;
    const a = x.a;
    const previa = previas[a.id] || (a.capa ? urlDaCapa(a.capa) : "");
    const tipo = ui.extraTipo;
    const semArquivo = tipo === "Link" || tipo === "Texto" || tipo === "Vídeo";
    return `
    <section class="tela ativa">
      <div style="display:flex;flex-wrap:wrap;align-items:start;gap:14px;margin-bottom:22px">
        <span style="flex:1 1 320px"><span class="rotulo">${localAula(a.id)}</span><div class="titulo" style="font-size:22px">${h(a.nome)}</div></span>
        <button class="botao-neutro grande" data-a="aba" data-v="curso">← Voltar</button>
      </div>

      <form data-f="aula" data-id="${a.id}">
        <label class="grupo largo" style="margin-bottom:16px">
          <span class="rotulo rotulo-ajuda">Vídeo — link ou identificador (Cloudflare Stream) ${dicaCampo(AJ.video)}</span>
          <input class="campo" name="video" value="${h(a.video)}" placeholder="https://iframe.videodelivery.net/&lt;uid&gt;  ou só o uid" />
        </label>

        <div class="grupo largo" style="margin-bottom:16px">
          <span class="rotulo rotulo-ajuda">Capa da aula ${dicaCampo(AJ.capa)}</span>
          <span style="display:flex;flex-wrap:wrap;gap:8px">
            <input id="campoCapa" class="campo" name="capa" style="flex:1 1 240px" value="${h(a.capa)}" placeholder="modulo-1-aula-1.webp" />
            <button type="button" class="botao-neutro grande" data-a="escolher-capa">Escolher imagem</button>
          </span>
          <div id="previaCapa" style="width:220px;max-width:100%;aspect-ratio:16/9;margin-top:6px;border-radius:8px;border:1px solid var(--linha-suave);background:${previa ? `url('${h(previa)}') center/cover no-repeat, ` : ""}linear-gradient(160deg,#131c33,#060911 60%,#101830)"></div>
        </div>

        <label class="grupo largo" style="margin-bottom:18px">
          <span class="rotulo rotulo-ajuda">O texto desta aula — é o que a aluna lê ${dicaCampo(AJ.texto)}</span>
          <textarea class="campo" name="texto" rows="16" style="min-height:420px" placeholder="Escreva a aula como você quiser.

Uma linha em branco separa parágrafo.

Para destacar, use *asteriscos* — igual ao WhatsApp.">${h(a.texto)}</textarea>
        </label>
        ${a.resumo === null ? "" : `
        <label class="grupo largo" style="margin-bottom:18px">
          <span class="rotulo rotulo-ajuda">Resumo — aba "Resumo" da aula ${dicaCampo(AJ.resumo)}</span>
          <textarea class="campo" name="resumo" rows="5" placeholder="Um ponto por linha.">${h(a.resumo)}</textarea>
        </label>
        <label class="grupo largo" style="margin-bottom:18px">
          <span class="rotulo rotulo-ajuda">Exercício — aba "Exercícios" da aula ${dicaCampo(AJ.exercicio)}</span>
          <textarea class="campo" name="exercicio" rows="7" placeholder="Título do exercício na primeira linha.

Depois, o texto. Uma linha em branco separa parágrafo.">${h(a.exercicio || "")}</textarea>
        </label>`}

        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:34px">
          <button class="botao">Salvar aula</button>
          <button type="button" class="botao-neutro grande" data-a="voltar-sem-salvar">Voltar sem salvar</button>
        </div>
      </form>

      <p class="rotulo rotulo-ajuda" style="margin:0 0 10px">Conteúdo extra desta aula ${dicaCampo(AJ.extras)}</p>
      <div class="cartao" style="padding:16px">
        ${a.extras.length ? `<div style="margin:-4px 0 16px">${a.extras.map((e) => `
          <div class="linha">
            <span class="nome"><b>${h(e.nome)}</b><span>${h(e.tipo)}${e.arquivo ? " · " + h(e.arquivo) : ""}</span></span>
            <span class="acoes"><button class="botao-neutro botao-remover" data-a="extra-remover" data-id="${e.id}">Remover</button></span>
          </div>`).join("")}</div>` : ""}
        <div class="chips" style="margin-bottom:14px">
          ${TIPOS.map((t) => t.tela).map((t) => `<button type="button" class="chip" style="cursor:pointer" data-a="extra-tipo" data-v="${t}" aria-pressed="${t === tipo}">${t}</button>`).join("")}
        </div>
        <form data-f="extra-add" data-id="${a.id}">
          <div class="campos">
            <label class="grupo nome"><span class="rotulo">Nome do conteúdo</span><input class="campo" name="nome" placeholder="Baixar o PDF" required /></label>
            <label class="grupo" style="flex:1 1 240px">
              <span class="rotulo">${tipo === "Link" ? "Endereço do link" : tipo === "Texto" ? "Texto" : tipo === "Vídeo" ? "Link ou identificador do vídeo" : "Arquivo no depósito " + tipoDaTela(tipo).deposito}</span>
              <span style="display:flex;gap:8px">
                <input class="campo" name="arquivo" placeholder="${tipo === "Link" ? "https://" : tipo === "Texto" ? "Escreva aqui" : tipo === "Vídeo" ? "uid do Cloudflare Stream" : "livro.pdf"}" required />
                ${semArquivo ? "" : `<button type="button" class="botao-neutro grande" data-a="enviar-arquivo">Enviar arquivo</button>`}
              </span>
            </label>
          </div>
          <div style="margin-top:14px"><button class="botao">Adicionar</button></div>
        </form>
      </div>
    </section>`;
  }

  /* ---------- COMENTÁRIOS ---------- */
  function telaComentarios() {
    const n = (e: Estado) => S.comentarios.filter((k) => k.estado === e).length;
    const lista = S.comentarios.filter((k) => k.estado === ui.filtroCom);
    const vazio = { moderar: "Nada esperando moderação.", publicado: "Nenhum comentário publicado.", oculto: "Nenhum comentário oculto." }[ui.filtroCom];
    return `
    <section class="tela ativa">
      <div class="chips" style="margin-bottom:20px">
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="moderar" aria-pressed="${ui.filtroCom === "moderar"}">Para moderar (${n("moderar")})</button>
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="publicado" aria-pressed="${ui.filtroCom === "publicado"}">Publicados (${n("publicado")})</button>
        <button class="chip" style="cursor:pointer" data-a="com-filtro" data-v="oculto" aria-pressed="${ui.filtroCom === "oculto"}">Ocultos (${n("oculto")})</button>
      </div>
      ${lista.map((k) => `
      <div class="cartao" style="padding:16px;margin-bottom:12px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:baseline">
          <b style="flex:1 1 220px">${h(k.autora)}</b>
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
            ${k.estado !== "publicado" ? `<button class="botao-neutro" data-a="com-publicar" data-id="${k.id}">Publicar</button>` : ""}
            ${k.estado !== "oculto" ? `<button class="botao-neutro" data-a="com-ocultar" data-id="${k.id}">Ocultar</button>` : ""}
            <button class="botao-neutro" data-a="com-responder" data-id="${k.id}">${k.resposta ? "Editar resposta" : "Responder"}</button>
            <button class="botao-neutro botao-remover" data-a="com-remover" data-id="${k.id}">Remover</button>
          </div>`}
      </div>`).join("") || `<div class="vazio">${vazio}</div>`}
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
    } else if (m.tipo === "curso") {
      corpo = `
      <form data-f="curso-novo">
        <h2 class="titulo">Criar novo produto</h2>
        <p class="explica">Depois de criar, ele abre para você montar módulos e aulas.</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input id="cursoNome" class="campo" name="nome" required /></label>
          <label class="grupo" style="flex:1 1 220px"><span class="rotulo">Categoria</span>
            <select class="campo" name="cat" required>${S.cats.map((k) => `<option value="${k.id}">${h(k.nome)}</option>`).join("")}</select>
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
      case "al-filtro": ui.filtroAl = d.v; break;
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
      case "mod-editar": ui.editando = { tipo: "mod", id: d.id }; ui.focar = "editarCampo"; break;
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
        if (n) { toast("A categoria " + k.nome + " tem " + p(n, "produto", "produtos") + ". Mude de categoria antes de remover."); return; }
        confirmar({ titulo: "Remover a categoria " + k.nome + "?", texto: "Ela está vazia.", palavra: "REMOVER", rotulo: "Remover categoria" }, async () => {
          falhou(await supabase.from("categorias").delete().eq("id", k.id)); toast("Categoria removida.");
        });
        break;
      }

      case "abrir-curso": {
        ui.curso = d.id; ui.tab = "curso"; ui.editando = null;
        const c = curso(d.id); if (c && c.modulos[0]) ui.abertos.add(c.modulos[0].id);
        window.scrollTo(0, 0); break;
      }
      case "curso-novo": ui.modal = { tipo: "curso" }; break;
      case "curso-cancelar": toast("Alterações descartadas."); break;
      case "curso-remover": {
        const c = curso(d.id)!;
        confirmar({ titulo: "Remover " + c.nome + "?", texto: "O produto, com " + p(c.modulos.length, "módulo", "módulos") + " e " + p(totalAulas(c), "aula", "aulas") + ", é apagado. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover produto" }, async () => {
          await rpc("remover_produto", { p_produto: c.id }); ui.curso = null; ui.aula = null; ui.tab = "cursos"; toast("Produto removido.");
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
          falhou(await supabase.from("modulos").delete().eq("id", x.m.id).select("id").single()); toast("Módulo removido.");
        });
        break;
      }
      case "mod-abrir-fechar": if (ui.abertos.has(d.id)) ui.abertos.delete(d.id); else ui.abertos.add(d.id); break;
      case "aula-add-abrir": ui.addAula = d.id; ui.focar = "novaAula"; break;
      case "aula-add-cancelar": ui.addAula = null; break;
      case "aula-sobe": case "aula-desce": {
        const x = acharAula(d.id)!; const nova = trocado(x.m.aulas, x.ai, a === "aula-sobe" ? -1 : 1);
        const velha = x.m.aulas.map((k) => k.id);
        if (nova) void executar(async () => { await rpc("ordenar_aulas", { p_modulo: x.m.id, p_ids: nova.map((k) => k.id) }); return { msg: "Ordem das aulas salva.", texto: "ordem das aulas de " + x.m.nome, desfazer: async () => { await rpc("ordenar_aulas", { p_modulo: x.m.id, p_ids: velha }); } }; });
        return;
      }
      case "abrir-aula": { const x = acharAula(d.id)!; ui.aula = d.id; ui.curso = x.c.id; ui.tab = "aula"; window.scrollTo(0, 0); break; }
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
          falhou(await supabase.from("aulas").delete().eq("id", x.a.id).select("id").single()); if (ui.aula === x.a.id) ui.aula = null; toast("Aula removida.");
        });
        break;
      }

      case "voltar-sem-salvar": if (ui.aula) delete previas[ui.aula]; ui.tab = "curso"; toast("Voltou sem salvar."); break;
      case "escolher-capa": arquivoCapa.click(); return;
      case "enviar-arquivo": arquivoExtra.click(); return;
      case "extra-tipo": ui.extraTipo = d.v as TipoExtra; break;
      case "extra-remover": {
        const x = acharAula(ui.aula!)!; const e = x.a.extras.find((k) => k.id === d.id)!;
        confirmar({ titulo: "Remover " + e.nome + "?", texto: "O conteúdo extra sai desta aula.", palavra: "REMOVER", rotulo: "Remover" }, async () => {
          falhou(await supabase.from("conteudos").delete().eq("id", e.id).select("id").single()); toast("Conteúdo removido.");
        });
        break;
      }

      case "com-filtro": ui.filtroCom = d.v as Estado; ui.respondendo = null; break;
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
        if (!v("cat")) { toast("Crie uma categoria antes, em Categorias / Layout."); return; }
        void executar(async () => {
          const r = falhou(await supabase.from("produtos").insert({ titulo: v("nome"), categoria_id: v("cat"), inicio: 1, ordem: S.cursos.length }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "produtos", p_ids: [...S.cursos.map((c) => c.id), r.data!.id] });
          await registrar(null, "Criou o produto " + v("nome"));
          ui.modal = null; ui.curso = r.data!.id; ui.tab = "curso";
          return { msg: "Produto criado. Agora monte os módulos.", texto: "criação do produto " + v("nome"), desfazer: async () => { await rpc("remover_produto", { p_produto: r.data!.id }); if (ui.curso === r.data!.id) { ui.curso = null; ui.tab = "cursos"; } } };
        });
        return;
      }
      case "cat-add":
        void executar(async () => {
          const r = falhou(await supabase.from("categorias").insert({ titulo: v("nome"), ordem: S.cats.length }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: [...S.cats.map((k) => k.id), r.data!.id] });
          await registrar(null, "Criou a categoria " + v("nome"));
          return { msg: "Categoria adicionada.", texto: "criação da categoria " + v("nome"), desfazer: async () => { falhou(await supabase.from("categorias").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      case "cat-renomear":
        { const velho = cat(id)!.nome;
          void executar(async () => { falhou(await supabase.from("categorias").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return { msg: "Categoria renomeada.", texto: "nome da categoria " + velho, desfazer: async () => { falhou(await supabase.from("categorias").update({ titulo: velho }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "curso-config": {
        const c = curso(ui.curso)!; const cid = c.id;
        const velho = { titulo: c.nome, categoria_id: c.cat || null, publicado: c.visivel, descricao: c.descricao || null, fundacao: c.fundacao || null, aviso_material: c.aviso || null };
        void executar(async () => {
          falhou(await supabase.from("produtos").update({
            titulo: v("nome"), categoria_id: v("cat"), publicado: v("visivel") === "1",
            descricao: v("descricao") || null, fundacao: v("fundacao") || null, aviso_material: v("aviso") || null,
          }).eq("id", cid).select("id").single());
          return { msg: "Configurações salvas.", texto: "configurações de " + c.nome, desfazer: async () => { falhou(await supabase.from("produtos").update(velho).eq("id", cid).select("id").single()); } };
        });
        return;
      }
      case "mod-add": {
        const c = curso(id)!;
        void executar(async () => {
          const r = falhou(await supabase.from("modulos").insert({ produto_id: id, titulo: v("nome").toUpperCase(), ordem: c.modulos.length }).select("id").single());
          // A posição é a última da lista, qualquer que seja a `ordem` dos outros.
          await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: [...c.modulos.map((m) => m.id), r.data!.id] });
          ui.abertos.add(r.data!.id);
          return { msg: "Módulo adicionado.", texto: "novo módulo " + v("nome").toUpperCase(), desfazer: async () => { falhou(await supabase.from("modulos").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "mod-renomear":
        { const velho = acharModulo(id)!.m.nome;
          void executar(async () => { falhou(await supabase.from("modulos").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return { msg: "Módulo renomeado.", texto: "nome do módulo " + velho, desfazer: async () => { falhou(await supabase.from("modulos").update({ titulo: velho }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "aula-add": {
        const x = acharModulo(id)!;
        void executar(async () => {
          const r = falhou(await supabase.from("aulas").insert({ modulo_id: id, titulo: v("nome"), ordem: x.m.aulas.length }).select("id").single());
          await rpc("ordenar_aulas", { p_modulo: id, p_ids: [...x.m.aulas.map((a) => a.id), r.data!.id] });
          ui.addAula = null;
          return { msg: "Aula adicionada.", texto: "nova aula " + v("nome"), desfazer: async () => { falhou(await supabase.from("aulas").delete().eq("id", r.data!.id).select("id").single()); } };
        });
        return;
      }
      case "aula-renomear":
        { const velho = acharAula(id)!.a.nome;
          void executar(async () => { falhou(await supabase.from("aulas").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return { msg: "Aula renomeada.", texto: "nome da aula " + velho, desfazer: async () => { falhou(await supabase.from("aulas").update({ titulo: velho }).eq("id", id).select("id").single()); } }; }); }
        return;
      case "aula": {
        const video = v("video"); const ref = idDoVideo(video);
        if (video && !ref) { toast("Não reconheci o vídeo. Cole o link do Cloudflare Stream ou só o identificador."); return; }
        const texto = (form.elements.namedItem("texto") as HTMLTextAreaElement).value;
        const x0 = acharAula(id)!.a; const velho = { capa: x0.capa, texto: x0.texto, video: x0.video, resumo: x0.resumo, exercicio: x0.exercicio };
        const extrasAula: Record<string, string | null> = {};
        if (x0.resumo !== null) {
          const r = (form.elements.namedItem("resumo") as HTMLTextAreaElement).value, e = (form.elements.namedItem("exercicio") as HTMLTextAreaElement).value;
          extrasAula.resumo = r.trim() ? r : null; extrasAula.exercicio = e.trim() ? e : null;
        }
        void executar(async () => {
          falhou(await supabase.from("aulas").update({ capa_path: v("capa") || null, texto: texto.trim() ? texto : null, ...extrasAula }).eq("id", id).select("id").single());
          if (ref) falhou(await supabase.from("aula_midia").upsert({ aula_id: id, video_provider: provedorDoLink(video), video_ref: ref }));
          else falhou(await supabase.from("aula_midia").delete().eq("aula_id", id));
          delete previas[id];
          return {
            msg: "Aula salva.", texto: "conteúdo da aula " + x0.nome,
            desfazer: async () => {
              falhou(await supabase.from("aulas").update({ capa_path: velho.capa || null, texto: velho.texto || null, ...(velho.resumo === null ? {} : { resumo: velho.resumo || null, exercicio: velho.exercicio || null }) }).eq("id", id).select("id").single());
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
      else if (!(el && fd.contains(el))) { mostrarAviso(() => acao(a, d, el!, alvo)); return; }
    }
    acao(a, d, el!, alvo);
  }

  /* ---------- eventos ---------- */
  app.addEventListener("click", (e) => {
    const alvo = e.target as HTMLElement;
    if (ui.buscaAberta && !alvo.closest(".busca-geral")) { ui.buscaAberta = false; atualizarBusca(); }
    const b = alvo.closest<HTMLElement>("[data-a]");
    const solto = !b || (b as HTMLButtonElement).disabled;
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
    if (t.dataset.i === "buscaGeral") { ui.buscaGeral = t.value; ui.buscaAberta = true; atualizarBusca(); return; }
    marcarSujo(t);
    if (t.dataset.i === "busca") { ui.busca = t.value; render(); return; }
    if (t.dataset.i === "celular") { t.value = formatarCelular(t.value); return; }
    if (t.id === "confirmaPalavra") (document.getElementById("confirmaBotao") as HTMLButtonElement).disabled = t.value.trim().toUpperCase() !== t.dataset.palavra;
  });
  app.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    marcarSujo(t);
    if (t.hasAttribute("data-ordem")) { ui.ordemAl = t.value; render(); return; }
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
  arquivoCapa.addEventListener("change", () => {
    const file = arquivoCapa.files?.[0]; arquivoCapa.value = ""; if (!file || !ui.aula) return;
    const x = acharAula(ui.aula); if (!x) return;
    const aulaId = ui.aula;
    toast("Enviando a imagem…");
    void (async () => {
      try {
        const caminho = await enviarArquivo("capas", x.c.id, file);
        const campo = document.getElementById("campoCapa") as HTMLInputElement | null; if (campo) campo.value = caminho;
        ui.sujo = { f: "aula", id: aulaId };
        previas[aulaId] = URL.createObjectURL(file);
        const pv = document.getElementById("previaCapa");
        if (pv) pv.style.background = "url('" + previas[aulaId] + "') center/cover no-repeat, linear-gradient(160deg,#131c33,#060911 60%,#101830)";
        toast("Imagem enviada. Clique em Salvar aula para guardar.");
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
  window.addEventListener("resize", ajustarListaLateral);
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
    document.querySelectorAll(".chip.alvo").forEach((x) => x.classList.remove("alvo"));
    if (t.dataset.arrasta !== ui.arrasto) t.classList.add("alvo");
  });
  app.addEventListener("drop", (e) => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>("[data-arrasta]"); if (!t || !ui.arrasto) return;
    e.preventDefault();
    const de = S.cats.findIndex((k) => k.id === ui.arrasto), para = S.cats.findIndex((k) => k.id === t.dataset.arrasta);
    ui.arrasto = null;
    if (de >= 0 && para >= 0 && de !== para) {
      const nova = S.cats.slice(); const [k] = nova.splice(de, 1); nova.splice(para, 0, k);
      const velha = S.cats.map((x) => x.id);
      void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: nova.map((x) => x.id) }); return { msg: "Ordem das categorias salva.", texto: "ordem das categorias", desfazer: async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: velha }); } }; });
    } else render();
  });
  app.addEventListener("dragend", () => { ui.arrasto = null; document.querySelectorAll(".chip.arrastando, .chip.alvo").forEach((x) => x.classList.remove("arrastando", "alvo")); });

  /* ---------- sessão ---------- */
  async function abrirSessao(acabouDeEntrar: boolean) {
    try {
      eu = await quemSouEu();
      if (!eu) {
        if (acabouDeEntrar) ui.erroLogin = "Este acesso não é da equipe do painel.";
        await api.sair();
        return;
      }
      S = await lerTudo(eu);
      if (ui.primeiraVez) {
        ui.primeiraVez = false;
        const c = S.cursos[0]; if (c && c.modulos[0]) ui.abertos.add(c.modulos[0].id);
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
