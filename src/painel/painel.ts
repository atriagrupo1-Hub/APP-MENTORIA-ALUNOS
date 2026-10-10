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
  entrada: string; validade: string; bloqueada: boolean; liberadas: number;
  acesso: { cursos: string[]; modulos: string[]; aulas: string[] };
  datas: Record<string, string>;
  cronograma: Record<string, number>;
};
type Estado = "moderar" | "publicado" | "oculto";
type Comentario = {
  id: string; autora: string; aula: string; quando: string;
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
  codigo_invalido: "O código precisa ter 4 números.",
  nome_invalido: "Confira o nome.",
  validade_antes_da_entrada: "A validade não pode ser antes da entrada.",
  data_vazia: "Preencha a entrada e a validade.",
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

async function lerTudo(eu: Eu): Promise<Dados> {
  const [cats, prods, mods, aulas, midias, extras, alunas, acessos, crono, coms] = await Promise.all([
    supabase.from("categorias").select("id, titulo, ordem").order("ordem"),
    supabase.from("produtos").select("id, titulo, categoria_id, publicado, inicio, descricao, fundacao, aviso_material, ordem").order("ordem"),
    supabase.from("modulos").select("id, produto_id, titulo, ordem, bloqueado_geral").not("produto_id", "is", null).order("ordem"),
    supabase.from("aulas").select("id, modulo_id, titulo, ordem, numero, capa_path, texto, liberada_geral, bloqueado_geral").order("ordem").order("numero"),
    supabase.from("aula_midia").select("aula_id, video_ref"),
    supabase.from("conteudos").select("id, aula_id, tipo, titulo, texto, arquivo_path, url, video_ref, ordem").not("aula_id", "is", null).order("ordem"),
    supabase.rpc("alunas_do_painel"),
    supabase.from("acessos").select("aluna_id, escopo, produto_id, modulo_id, aula_id, abre_em"),
    supabase.from("cronograma_modulo").select("aluna_id, modulo_id, dias"),
    supabase.rpc("comentarios_para_moderacao", { p_aula: null }),
  ]);
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

  const listaAlunas: Aluna[] = (alunas.data ?? []).map((a: Record<string, unknown>) => ({
    id: String(a.id), nome: String(a.nome), login: String(a.login), codigo: String(a.codigo ?? ""),
    entrada: String(a.entrada ?? ""), validade: a.validade ? String(a.validade) : "",
    bloqueada: a.status === "bloqueada", liberadas: Number(a.aulas_liberadas ?? 0),
    acesso: { cursos: [], modulos: [], aulas: [] }, datas: {}, cronograma: {},
  }));
  const porId = new Map(listaAlunas.map((a) => [a.id, a]));
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
  type Linha = { id: string; aula_id: string; autora_nome: string; texto: string; status: string; criado_em: string; resposta_a: string | null; eh_instrutor: boolean };
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
      id: c.id, autora: c.autora_nome, aula: c.aula_id, quando: quando(c.criado_em), texto: c.texto,
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
  let S: Dados = { cats: [], cursos: [], alunas: [], comentarios: [], equipe: [] };
  let carregando = true;
  let ocupado = false;
  const ui = {
    tab: "cursos", curso: null as string | null, aula: null as string | null, busca: "",
    filtroCom: "moderar" as Estado, modal: null as null | Record<string, string>,
    editando: null as null | { tipo: string; id: string }, addAula: null as string | null,
    respondendo: null as string | null, extraTipo: "PDF / e-book" as TipoExtra, erroLogin: "",
    focar: null as string | null, arrasto: null as string | null,
    abertos: new Set<string>(), primeiraVez: true,
  };
  const previas: Record<string, string> = {};
  let pend: null | (() => Promise<void>) = null;

  const toastEl = document.createElement("div");
  toastEl.id = "toast"; toastEl.className = "toast"; toastEl.setAttribute("role", "status"); toastEl.hidden = true;
  const arquivoCapa = Object.assign(document.createElement("input"), { type: "file", id: "arquivoCapa", accept: "image/*", hidden: true });
  const arquivoExtra = Object.assign(document.createElement("input"), { type: "file", id: "arquivoExtra", hidden: true });
  document.body.append(toastEl, arquivoCapa, arquivoExtra);

  const KT = "aion-painel-tema";
  let tema = (() => { try { return localStorage.getItem(KT) || "escuro"; } catch { return "escuro"; } })();
  const aplicarTema = () => { document.documentElement.setAttribute("data-tema", tema); };
  aplicarTema();
  const botaoTema = () => `<button class="botao-neutro tema" data-a="tema" aria-label="Trocar para tema ${tema === "claro" ? "escuro" : "claro"}"><span class="bola"></span>${tema === "claro" ? "Tema escuro" : "Tema claro"}</button>`;

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
  function confirmar(opts: Record<string, string>, fn: () => Promise<void>) {
    pend = fn; ui.modal = Object.assign({ tipo: "confirmar" }, opts); ui.focar = "confirmaPalavra";
  }

  /**
   * Toda escrita passa por aqui: chama o banco, avisa, relê e redesenha.
   * Se o banco recusar, a tela diz por quê e mostra o que o banco tem.
   */
  async function executar(fn: () => Promise<string | void>) {
    if (ocupado) return;
    ocupado = true;
    try {
      const msg = await fn();
      if (msg) toast(msg);
    } catch (e) {
      toast(motivo(e));
    }
    try { if (eu) S = await lerTudo(eu); } catch (e) { toast(motivo(e)); }
    ocupado = false;
    render();
  }

  /* ---------- moldura ---------- */
  const ABAS = [["alunas", "Alunas"], ["layout", "Categorias / Layout"], ["cursos", "Cursos e conteúdos"], ["comentarios", "Comentários"], ["equipe", "Equipe"]];

  function titulo(): [string, string] {
    const ativas = S.alunas.filter((a) => !a.bloqueada && !vencida(a)).length;
    const c = curso(ui.curso); const x = ui.aula ? acharAula(ui.aula) : null;
    const moderar = S.comentarios.filter((k) => k.estado === "moderar").length;
    switch (ui.tab) {
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
    app.innerHTML = carregando ? carregandoTela() : eu ? painel() : login();
    const alvo = ui.focar || fid; const veioDeFora = !!ui.focar; ui.focar = null;
    if (alvo) {
      const el = document.getElementById(alvo) as HTMLInputElement | null;
      if (el) { el.focus(); if (sel && !veioDeFora) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* campo sem seleção */ } } }
    }
  }

  const marca = (resto = "") => `<div class="marca"><span class="selo">AION</span><span class="rotulo">Painel administrativo</span><span style="flex:1"></span>${resto}</div>`;

  function carregandoTela() {
    return `${marca(botaoTema())}<div class="conteudo"><div class="vazio">Carregando…</div></div>`;
  }

  function login() {
    return `
    ${marca(botaoTema())}
    <div class="conteudo" style="max-width:460px;margin:48px auto 0">
      <form data-f="entrar" class="cartao" style="padding:22px">
        <h1 style="margin:0 0 4px;font-size:24px;font-weight:700">Entrar no painel</h1>
        <p style="margin:0 0 20px;font-size:14px;color:var(--texto-2)">Use seu login e o código de 4 números.</p>
        <label class="grupo" style="margin-bottom:14px"><span class="rotulo">Login</span><input id="loginCampo" class="campo" name="login" autocomplete="username" required /></label>
        <label class="grupo"><span class="rotulo">Código</span><input class="campo" name="codigo" inputmode="numeric" maxlength="4" autocomplete="off" required /></label>
        ${ui.erroLogin ? `<p class="erro">${h(ui.erroLogin)}</p>` : ""}
        <button class="botao" style="width:100%;margin-top:20px" ${ocupado ? "disabled" : ""}>Entrar</button>
      </form>
    </div>`;
  }

  function painel() {
    const [t, cont] = titulo();
    const abas = ABAS.filter(([id]) => !(id === "equipe" && !podeEquipe()));
    const telas: Record<string, () => string> = { alunas: telaAlunas, layout: telaLayout, cursos: telaCursos, curso: telaCurso, aula: telaAula, comentarios: telaComentarios, equipe: telaEquipe };
    if (ui.tab === "equipe" && !podeEquipe()) ui.tab = "cursos";
    return `
    <div class="marca">
      <span class="selo">AION</span>
      <span class="rotulo">Painel administrativo</span>
      <span style="flex:1"></span>
      <span style="font-size:13px;color:var(--texto-2)">${h(eu!.nome)} · ${h(eu!.papel)}</span>
      ${botaoTema()}
      <button class="botao-neutro" data-a="sair">Sair</button>
    </div>
    <div class="conteudo">
      <div class="cabecalho"><h1>${h(t)}</h1><span class="contagem">${h(cont)}</span></div>
      <div class="abas" role="tablist">
        ${abas.map(([id, nome]) => { const on = ui.tab === id || (id === "cursos" && (ui.tab === "curso" || ui.tab === "aula")); return `<button class="aba" role="tab" data-a="aba" data-v="${id}" ${on ? 'aria-selected="true"' : ""}>${nome}</button>`; }).join("")}
      </div>
      ${(telas[ui.tab] || telaCursos)()}
    </div>
    ${modal()}`;
  }

  const etiqueta = (txt: string, cor: string) => `<span class="etiqueta" style="color:${cor}">${h(txt)}</span>`;
  const VERDE = "#9dc08b", VERMELHO = "var(--perigo)", OURO = "var(--ouro)";
  const botoesEdicao = (rotulo: string) => `<button class="botao-neutro">${rotulo}</button><button type="button" class="botao-neutro" data-a="cancelar-edicao">Cancelar</button>`;
  const editando = (tipo: string, id: string) => !!ui.editando && ui.editando.tipo === tipo && ui.editando.id === id;

  /* ---------- ALUNAS ---------- */
  function telaAlunas() {
    const q = ui.busca.trim().toLowerCase();
    const lista = S.alunas.filter((a) => (a.nome + " " + a.login).toLowerCase().includes(q));
    return `
    <section class="tela ativa">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:18px">
        <input id="busca" class="campo" style="flex:1 1 280px;max-width:520px" placeholder="Procurar pelo nome" value="${h(ui.busca)}" data-i="busca" />
        <button class="botao" data-a="aluna-nova">Cadastrar aluna</button>
      </div>
      ${lista.length ? lista.map(linhaAluna).join("") : `<div class="vazio">${S.alunas.length ? "Nenhuma aluna com esse nome." : "Nenhuma aluna cadastrada ainda."}</div>`}
    </section>`;
  }
  function linhaAluna(a: Aluna) {
    const venc = vencida(a);
    const est = a.bloqueada ? etiqueta("Bloqueada", VERMELHO) : venc ? etiqueta("Vencida", VERMELHO) : etiqueta("Ativa", VERDE);
    return `
    <div class="linha">
      <span class="nome"><b>${h(a.nome)}</b><span>${h(a.login)} · entrou em ${brCurto(a.entrada)} · ${venc ? "acesso vencido" : "acesso até " + br(a.validade)} · ${p(a.liberadas, "aula liberada", "aulas liberadas")}</span></span>
      ${est}
      <span class="acoes">
        <button class="botao-neutro" data-a="ficha" data-id="${a.id}">Ficha</button>
        <button class="botao-neutro" data-a="liberar" data-id="${a.id}">Liberar conteúdo</button>
        <button class="botao-neutro" data-a="cronograma" data-id="${a.id}">Cronograma</button>
        <button class="botao-neutro" data-a="renovar" data-id="${a.id}">Renovar</button>
        ${a.bloqueada
          ? `<button class="botao-neutro" data-a="desbloquear-aluna" data-id="${a.id}">Desbloquear</button>`
          : `<button class="botao-neutro botao-remover" data-a="bloquear-aluna" data-id="${a.id}">Bloquear</button>`}
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
          <label class="grupo nome"><span class="rotulo">Nome</span><input class="campo" name="nome" value="${h(c.nome)}" required /></label>
          <label class="grupo" style="flex:1 1 240px"><span class="rotulo">Categoria onde aparece</span>
            <select class="campo" name="cat" required>
              ${S.cats.map((k) => `<option value="${k.id}" ${k.id === c.cat ? "selected" : ""}>${h(k.nome)}</option>`).join("")}
            </select>
          </label>
          <label class="grupo" style="flex:0 0 130px"><span class="rotulo">Visibilidade</span>
            <select class="campo" name="visivel"><option value="1" ${c.visivel ? "selected" : ""}>Visível</option><option value="0" ${c.visivel ? "" : "selected"}>Oculto</option></select>
          </label>
        </div>
        <label class="grupo largo" style="margin-top:14px"><span class="rotulo">Descrição</span><textarea class="campo" name="descricao" rows="2">${h(c.descricao)}</textarea></label>
        <label class="grupo largo" style="margin-top:14px"><span class="rotulo">Fundação — o que é este curso</span><textarea class="campo" name="fundacao" rows="5" placeholder="Para quem é, o que promete, com que voz se fala aqui.">${h(c.fundacao)}</textarea></label>
        <label class="grupo largo" style="margin-top:14px"><span class="rotulo">Aviso de material — aparece em toda aula</span><textarea class="campo" name="aviso" rows="2">${h(c.aviso)}</textarea></label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">
          <button class="botao">Salvar</button>
          <button type="button" class="botao-neutro grande" data-a="curso-cancelar">Cancelar</button>
          <button type="button" class="botao-neutro grande botao-remover" data-a="curso-remover" data-id="${c.id}">Remover</button>
        </div>
      </form>

      <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:12px">
        <span class="rotulo">Conteúdo do produto</span>
        <span style="font-size:13px;color:var(--texto-2)">${p(c.modulos.length, "módulo", "módulos")} · ${p(totalAulas(c), "aula", "aulas")}</span>
      </div>

      ${c.modulos.map((m, i) => blocoModulo(c, m, i)).join("") || `<div class="vazio" style="margin-bottom:14px">Este produto ainda não tem módulos.</div>`}

      <form data-f="mod-add" data-id="${c.id}" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;padding:16px;border:1px dashed rgba(255,255,255,.16);border-radius:14px">
        <input class="campo" name="nome" style="flex:1 1 260px;max-width:520px" placeholder="Nome do novo módulo" required />
        <button class="botao-neutro grande">+ Adicionar módulo</button>
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
          <span class="rotulo">Vídeo — link ou identificador (Cloudflare Stream)</span>
          <input class="campo" name="video" value="${h(a.video)}" placeholder="https://iframe.videodelivery.net/&lt;uid&gt;  ou só o uid" />
        </label>

        <div class="grupo largo" style="margin-bottom:16px">
          <span class="rotulo">Capa da aula</span>
          <span style="display:flex;flex-wrap:wrap;gap:8px">
            <input id="campoCapa" class="campo" name="capa" style="flex:1 1 240px" value="${h(a.capa)}" placeholder="modulo-1-aula-1.webp" />
            <button type="button" class="botao-neutro grande" data-a="escolher-capa">Escolher imagem</button>
          </span>
          <span class="dica">Escolha a imagem do computador e o caminho se preenche sozinho.</span>
          <div id="previaCapa" style="width:220px;max-width:100%;aspect-ratio:16/9;margin-top:6px;border-radius:8px;border:1px solid var(--linha-suave);background:${previa ? `url('${h(previa)}') center/cover no-repeat, ` : ""}linear-gradient(160deg,#131c33,#060911 60%,#101830)"></div>
        </div>

        <label class="grupo largo" style="margin-bottom:18px">
          <span class="rotulo">O texto desta aula — é o que a aluna lê</span>
          <textarea class="campo" name="texto" rows="16" style="min-height:420px" placeholder="Escreva a aula como você quiser.

Uma linha em branco separa parágrafo.

Para destacar, use *asteriscos* — igual ao WhatsApp.">${h(a.texto)}</textarea>
          <span class="dica">Deixe vazio e a aula fica só com o vídeo.</span>
        </label>

        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:34px">
          <button class="botao">Salvar aula</button>
          <button type="button" class="botao-neutro grande" data-a="voltar-sem-salvar">Voltar sem salvar</button>
        </div>
      </form>

      <p class="rotulo" style="margin:0 0 10px">Conteúdo extra desta aula</p>
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
          ${e.codigo ? `<button class="botao-neutro" data-a="ver-codigo" data-id="${e.id}">Ver código</button>` : ""}
          ${gere(e) || e.souEu ? `<button class="botao-neutro" data-a="trocar-codigo" data-id="${e.id}">Trocar código</button>` : ""}
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
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Login</span><input class="campo" name="login" required /></label>
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
        <p class="explica">${a ? "Ficha da aluna. " + p(a.liberadas, "aula liberada", "aulas liberadas") + (a.bloqueada ? " · bloqueada" : "") : "Ela entra com o login e o código de 4 números."}</p>
        <div class="campos">
          <label class="grupo nome"><span class="rotulo">Nome</span><input id="alunaNome" class="campo" name="nome" value="${h(a ? a.nome : "")}" required /></label>
          <label class="grupo" style="flex:1 1 200px"><span class="rotulo">Login</span><input class="campo" name="login" value="${h(a ? a.login : "")}" placeholder="gerado pelo nome" /></label>
          <label class="grupo" style="flex:1 1 220px"><span class="rotulo">Código</span>
            <span style="display:flex;gap:8px"><input class="campo" name="codigo" inputmode="numeric" maxlength="4" value="${h(a ? a.codigo : m.codigo || novoCodigo())}" required /><button type="button" class="botao-neutro grande" data-a="gerar-codigo">Gerar</button></span>
          </label>
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
    switch (a) {
      case "aba":
        ui.tab = d.v; ui.editando = null; ui.addAula = null; ui.respondendo = null;
        if (d.v === "curso" && !curso(ui.curso)) ui.curso = S.cursos[0] ? S.cursos[0].id : null;
        window.scrollTo(0, 0);
        break;
      case "tema": tema = tema === "claro" ? "escuro" : "claro"; try { localStorage.setItem(KT, tema); } catch { /* sem armazenamento */ } aplicarTema(); break;
      case "sair":
        void api.sair().finally(() => { eu = null; ui.focar = "loginCampo"; render(); });
        return;
      case "fechar": ui.modal = null; pend = null; break;
      case "fechar-fundo": if (alvo !== el) return; ui.modal = null; pend = null; break;

      case "aluna-nova": ui.modal = { tipo: "aluna", codigo: novoCodigo() }; break;
      case "ficha": ui.modal = { tipo: "aluna", id: d.id }; break;
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
      case "renovar":
        void executar(async () => {
          const nova = await rpc("renovar_acesso", { p_aluna: al!.id, p_dias: 0, p_meses: 0, p_anos: 1 });
          return "Acesso de " + al!.nome + " renovado até " + br(diaDe(String(nova))) + ".";
        });
        return;
      case "bloquear-aluna":
        confirmar({ titulo: "Bloquear " + al!.nome + "?", texto: "Ela perde o acesso na hora, em qualquer aparelho. Dá para desbloquear depois.", palavra: "BLOQUEAR", rotulo: "Bloquear aluna" }, async () => {
          await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "bloqueada" }); toast(al!.nome + " foi bloqueada.");
        });
        break;
      case "desbloquear-aluna":
        void executar(async () => { await rpc("definir_status_aluna", { p_aluna: al!.id, p_status: "ativa" }); return al!.nome + " foi desbloqueada."; });
        return;
      case "remover-aluna":
        confirmar({ titulo: "Remover " + al!.nome + "?", texto: "A ficha, as liberações e o cronograma dela são apagados. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover aluna" }, async () => {
          await rpc("remover_aluna", { p_aluna: al!.id }); toast(al!.nome + " foi removida.");
        });
        break;

      case "cat-editar": ui.editando = { tipo: "cat", id: d.id }; ui.focar = "editarCampo"; break;
      case "mod-editar": ui.editando = { tipo: "mod", id: d.id }; ui.focar = "editarCampo"; break;
      case "aula-editar": ui.editando = { tipo: "aula", id: d.id }; ui.focar = "editarCampo"; break;
      case "cancelar-edicao": ui.editando = null; break;
      case "cat-sobe": case "cat-desce": {
        const nova = trocado(S.cats, S.cats.findIndex((k) => k.id === d.id), a === "cat-sobe" ? -1 : 1);
        if (nova) void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: nova.map((k) => k.id) }); });
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
          falhou(await supabase.from("modulos").update({ bloqueado_geral: true }).eq("id", x.m.id).select("id").single()); toast("Módulo bloqueado para todas.");
        });
        else { void executar(async () => { falhou(await supabase.from("modulos").update({ bloqueado_geral: false }).eq("id", x.m.id).select("id").single()); return "Módulo desbloqueado."; }); return; }
        break;
      }
      case "mod-sobe": case "mod-desce": {
        const x = acharModulo(d.id)!; const nova = trocado(x.c.modulos, x.i, a === "mod-sobe" ? -1 : 1);
        if (nova) void executar(async () => { await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: nova.map((k) => k.id) }); });
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
        if (nova) void executar(async () => { await rpc("ordenar_aulas", { p_modulo: x.m.id, p_ids: nova.map((k) => k.id) }); });
        return;
      }
      case "abrir-aula": { const x = acharAula(d.id)!; ui.aula = d.id; ui.curso = x.c.id; ui.tab = "aula"; window.scrollTo(0, 0); break; }
      case "aula-liberar": {
        const x = acharAula(d.id)!; const liberar = x.a.acesso !== "liberada";
        void executar(async () => { await rpc("definir_liberada_geral", { p_aula: x.a.id, p_liberada: liberar }); return liberar ? "Aula liberada para todas." : "Liberação retirada."; });
        return;
      }
      case "aula-bloquear": {
        const x = acharAula(d.id)!;
        if (x.a.acesso === "bloqueada") { void executar(async () => { await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: false }); return "Aula desbloqueada."; }); return; }
        confirmar({ titulo: "Bloquear esta aula?", texto: "Nenhuma aluna vê " + x.a.nome + " até você desbloquear.", palavra: "BLOQUEAR", rotulo: "Bloquear aula" }, async () => {
          await rpc("definir_bloqueio_aula", { p_aula: x.a.id, p_bloqueada: true }); toast("Aula bloqueada.");
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
      case "com-publicar": void executar(async () => { await rpc("moderar_comentario", { p_comentario: d.id, p_status: "publicado" }); return "Comentário publicado."; }); return;
      case "com-ocultar": void executar(async () => { await rpc("moderar_comentario", { p_comentario: d.id, p_status: "oculto" }); return "Comentário ocultado."; }); return;
      case "com-responder": ui.respondendo = d.id; ui.focar = "respostaCampo"; break;
      case "com-responder-cancelar": ui.respondendo = null; break;
      case "com-remover":
        confirmar({ titulo: "Remover este comentário?", texto: "Ele some para todas as alunas. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover comentário" }, async () => {
          await rpc("moderar_comentario", { p_comentario: d.id, p_status: "removido" }); toast("Comentário removido.");
        });
        break;

      case "ver-codigo": { const e = pessoa(d.id); ui.modal = { tipo: "info", titulo: "Código de " + e.nome, texto: "Login " + e.login + ". É o que ela digita para entrar no painel.", destaque: e.codigo ?? "" }; break; }
      case "trocar-codigo": {
        const e = pessoa(d.id);
        void executar(async () => {
          const codigo = String(await rpc("trocar_codigo", { p_id: e.id }));
          ui.modal = { tipo: "info", titulo: "Novo código de " + e.nome, texto: "O código antigo deixou de funcionar. Passe este para ela.", destaque: codigo };
        });
        return;
      }
      case "equipe-bloquear": { const e = pessoa(d.id); confirmar({ titulo: "Bloquear " + e.nome + "?", texto: "Ela deixa de entrar no painel até você desbloquear.", palavra: "BLOQUEAR", rotulo: "Bloquear" }, async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "bloqueada" }); toast(e.nome + " foi bloqueada."); }); break; }
      case "equipe-desbloquear": { const e = pessoa(d.id); void executar(async () => { await rpc("bloquear_colaborador", { p_id: e.id, p_status: "ativa" }); return e.nome + " foi desbloqueada."; }); return; }
      case "equipe-remover": { const e = pessoa(d.id); confirmar({ titulo: "Remover " + e.nome + " da equipe?", texto: "Ela perde o acesso ao painel. Não dá para desfazer.", palavra: "REMOVER", rotulo: "Remover" }, async () => { await rpc("remover_colaborador", { p_id: e.id }); toast(e.nome + " saiu da equipe."); }); break; }
      default: return;
    }
    render();
  }

  function enviar(f: string, form: HTMLFormElement) {
    const v = (n: string) => { const el = form.elements.namedItem(n) as HTMLInputElement | null; return el ? el.value.trim() : ""; };
    const id = form.dataset.id ?? "";
    switch (f) {
      case "entrar": {
        if (ocupado) return;
        ocupado = true; ui.erroLogin = ""; render();
        void (async () => {
          const r = await api.entrar(v("login").toLowerCase(), v("codigo"));
          if (!r.ok) { ui.erroLogin = r.falha.mensagem; ocupado = false; render(); return; }
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
        void executar(async () => {
          if (id) {
            await rpc("salvar_ficha_aluna", { p_aluna: id, p_nome: nome, p_login: loginNovo, p_codigo: cod, p_entrada: v("entrada"), p_validade: v("validade") });
            ui.modal = null; return "Ficha de " + nome + " salva.";
          }
          await chamarFuncao("cadastrar-aluna", { nome, login: loginNovo, codigo: cod, entrada: v("entrada"), validade: v("validade") });
          ui.modal = null; return nome + " cadastrada. Login " + loginNovo + ", código " + cod + ".";
        });
        return;
      }
      case "liberar": {
        const marcados = (n: string) => [...form.querySelectorAll<HTMLInputElement>('input[name="' + n + '"]:checked')].map((x) => x.value);
        const cs = marcados("c");
        const ms = marcados("m").filter((mid) => { const x = acharModulo(mid); return x && !cs.includes(x.c.id); });
        const as = marcados("a").filter((aid) => { const x = acharAula(aid); return x && !cs.includes(x.c.id) && !ms.includes(x.m.id); });
        const al = aluna(id);
        void executar(async () => {
          const n = Number(await rpc("salvar_liberacao", { p_aluna: id, p_produtos: cs, p_modulos: ms, p_aulas: as }));
          ui.modal = null; return "Liberação salva: " + p(n, "aula", "aulas") + " para " + al.nome + ".";
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
        void executar(async () => {
          await rpc("salvar_cronograma", { p_aluna: id, p_modulos: mods, p_dias: dias, p_aulas: aulas, p_datas: datas });
          ui.modal = null; return "Cronograma de " + al.nome + " salvo.";
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
          ui.modal = null; ui.curso = r.data!.id; ui.tab = "curso";
          return "Produto criado. Agora monte os módulos.";
        });
        return;
      }
      case "cat-add":
        void executar(async () => {
          const r = falhou(await supabase.from("categorias").insert({ titulo: v("nome"), ordem: S.cats.length }).select("id").single());
          await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: [...S.cats.map((k) => k.id), r.data!.id] });
          return "Categoria adicionada.";
        });
        return;
      case "cat-renomear":
        void executar(async () => { falhou(await supabase.from("categorias").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return "Categoria renomeada."; });
        return;
      case "curso-config":
        void executar(async () => {
          falhou(await supabase.from("produtos").update({
            titulo: v("nome"), categoria_id: v("cat"), publicado: v("visivel") === "1",
            descricao: v("descricao") || null, fundacao: v("fundacao") || null, aviso_material: v("aviso") || null,
          }).eq("id", ui.curso!).select("id").single());
          return "Configurações salvas.";
        });
        return;
      case "mod-add": {
        const c = curso(id)!;
        void executar(async () => {
          const r = falhou(await supabase.from("modulos").insert({ produto_id: id, titulo: v("nome").toUpperCase(), ordem: c.modulos.length }).select("id").single());
          // A posição é a última da lista, qualquer que seja a `ordem` dos outros.
          await rpc("ordenar_lista", { p_tabela: "modulos", p_ids: [...c.modulos.map((m) => m.id), r.data!.id] });
          ui.abertos.add(r.data!.id); return "Módulo adicionado.";
        });
        return;
      }
      case "mod-renomear":
        void executar(async () => { falhou(await supabase.from("modulos").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return "Módulo renomeado."; });
        return;
      case "aula-add": {
        const x = acharModulo(id)!;
        void executar(async () => {
          const r = falhou(await supabase.from("aulas").insert({ modulo_id: id, titulo: v("nome"), ordem: x.m.aulas.length }).select("id").single());
          await rpc("ordenar_aulas", { p_modulo: id, p_ids: [...x.m.aulas.map((a) => a.id), r.data!.id] });
          ui.addAula = null; return "Aula adicionada.";
        });
        return;
      }
      case "aula-renomear":
        void executar(async () => { falhou(await supabase.from("aulas").update({ titulo: v("nome") }).eq("id", id).select("id").single()); ui.editando = null; return "Aula renomeada."; });
        return;
      case "aula": {
        const video = v("video"); const ref = idDoVideo(video);
        if (video && !ref) { toast("Não reconheci o vídeo. Cole o link do Cloudflare Stream ou só o identificador."); return; }
        const texto = (form.elements.namedItem("texto") as HTMLTextAreaElement).value;
        void executar(async () => {
          falhou(await supabase.from("aulas").update({ capa_path: v("capa") || null, texto: texto.trim() ? texto : null }).eq("id", id).select("id").single());
          if (ref) falhou(await supabase.from("aula_midia").upsert({ aula_id: id, video_provider: provedorDoLink(video), video_ref: ref }));
          else falhou(await supabase.from("aula_midia").delete().eq("aula_id", id));
          delete previas[id];
          return "Aula salva.";
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
        void executar(async () => { falhou(await supabase.from("conteudos").insert(linha)); return "Conteúdo adicionado à aula."; });
        return;
      }
      case "com-resposta":
        void executar(async () => { await rpc("responder_comentario", { p_comentario: id, p_texto: v("resposta") }); ui.respondendo = null; return "Resposta enviada."; });
        return;
      case "equipe-add": {
        const login = v("login").toLowerCase();
        if (S.equipe.some((x) => x.login === login)) { toast("Esse login já está na equipe."); return; }
        const papel = v("papel") === "Administrador" ? "admin" : "suporte";
        void executar(async () => {
          const r = await chamarFuncao("cadastrar-colaborador", { nome: v("nome"), login, papel });
          ui.modal = { tipo: "info", titulo: v("nome") + " entrou na equipe", texto: "Login " + login + ". Passe este código para ela entrar no painel.", destaque: String(r.codigo ?? "") };
        });
        return;
      }
      default: return;
    }
    render();
  }

  /* ---------- eventos ---------- */
  app.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    acao(b.dataset.a!, Object.assign({}, b.dataset) as Record<string, string>, b, e.target);
  });
  app.addEventListener("submit", (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>("form[data-f]");
    if (!f) return;
    e.preventDefault();
    enviar(f.dataset.f!, f);
  });
  app.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.i === "busca") { ui.busca = t.value; render(); return; }
    if (t.id === "confirmaPalavra") (document.getElementById("confirmaBotao") as HTMLButtonElement).disabled = t.value.trim().toUpperCase() !== t.dataset.palavra;
  });
  app.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
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
          (form.elements.namedItem("arquivo") as HTMLInputElement).value = caminho;
          const nome = form.elements.namedItem("nome") as HTMLInputElement;
          if (!nome.value) nome.value = file.name.replace(/\.[^.]+$/, "");
        }
        toast("Arquivo enviado. Clique em Adicionar para pôr na aula.");
      } catch (e) { toast(motivo(e)); }
    })();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.modal) { ui.modal = null; pend = null; render(); }
  });

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
      void executar(async () => { await rpc("ordenar_lista", { p_tabela: "categorias", p_ids: nova.map((x) => x.id) }); return "Ordem das categorias salva."; });
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
