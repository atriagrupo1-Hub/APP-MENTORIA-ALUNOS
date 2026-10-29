/**
 * Estilos visuais (0098): o que a equipe escolhe no seletor de cores do painel
 * para um card, um botão ou uma capa — cor livre ou degradê, cor do texto,
 * contorno, sombra, tamanho e formato. Fica guardado em `estilo` (jsonb) da
 * categoria e do módulo, separado por parte. Vazio = o visual padrão do app.
 *
 * O mesmo arquivo serve ao painel (prévia) e ao app da aluna, para os dois
 * desenharem igual.
 */

/** Fundo: cor lisa ou degradê; `aa`/`ba` = opacidade de cada cor (0–100, sem = 100). */
export type Fundo = { t: "cor" | "degrade"; a: string; b?: string; ang?: number; aa?: number; ba?: number };
export const ESTILOS_BORDA = [["none", "Oculto"], ["solid", "Sólido"], ["dotted", "Pontilhado"], ["dashed", "Tracejado"], ["double", "Duplo"], ["groove", "Ranhurado"], ["ridge", "Cume"], ["inset", "Inserir"], ["outset", "Saliente"]] as const;
export type BordaEst = { estilo: (typeof ESTILOS_BORDA)[number][0]; w: [number, number, number, number]; cor: string };
export type SombraCx = { cor: string; a: number; x: number; y: number; blur: number; esp: number; inset: boolean };
export type Visual = {
  fundo?: Fundo | null;
  texto?: string | null;
  borda?: { cor: string; w: number } | null;
  sombra?: { n: number; cor: string } | null;
  tam?: "p" | "m" | "g" | null;
  forma?: "quadrado" | "arredondado" | "redondo" | null;
  /** Borda completa (editor de card): estilo, largura de cada lado (topo, direita, baixo, esquerda) e cor. */
  bordaEst?: BordaEst | null;
  /** Sombra da caixa completa (editor de card): cor, opacidade (0–100), deslocamento, desfoque, espalhar e se é por dentro. */
  sombraCx?: SombraCx | null;
  /** Cantos arredondados em px: topo-esquerdo, topo-direito, baixo-direito, baixo-esquerdo. */
  raio?: [number, number, number, number] | null;
  /** Só para textos: uma das FONTES_APP. */
  fonte?: string | null;
  /** Só para textos: peso, itálico, tamanho (px) e sombra do texto. */
  peso?: "normal" | "negrito" | null;
  italico?: boolean | null;
  px?: number | null;
  sombraTxt?: { cor: string; blur: number; op: number } | null;
  alinha?: "left" | "center" | "right" | "justify" | null;
};
/** As fontes que o painel oferece para os textos do app (carregadas do Google Fonts). */
export const FONTES_APP = ["Cinzel", "Cormorant Garamond", "Playfair Display", "Lora", "EB Garamond", "Libre Baskerville", "Marcellus", "Lato", "Montserrat", "Inter", "Poppins", "Raleway", "Open Sans", "Nunito"];
export type Estilo = Partial<Record<string, Visual>>;

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (x: unknown) => (typeof x === "string" && HEX.test(x) ? x.toLowerCase() : "");

/** Deixa só o que é válido (o que vem do banco ou de uma mensagem nunca vira CSS solto). */
export function limparVisual(v: unknown): Visual | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, any>, out: Visual = {};
  const f = o.fundo;
  if (f && hex(f.a)) {
    out.fundo = f.t === "degrade" && hex(f.b) ? { t: "degrade", a: hex(f.a), b: hex(f.b), ang: Math.max(0, Math.min(360, Math.round(Number(f.ang) || 0))) } : { t: "cor", a: hex(f.a) };
    const op = (x: unknown) => (x === undefined || x === null || x === "" ? null : Math.max(0, Math.min(100, Math.round(Number(x) || 0))));
    const aa = op(f.aa), ba = op(f.ba);
    if (aa !== null && aa < 100) out.fundo.aa = aa;
    if (out.fundo.t === "degrade" && ba !== null && ba < 100) out.fundo.ba = ba;
  }
  if (hex(o.texto)) out.texto = hex(o.texto);
  if (o.borda && hex(o.borda.cor)) out.borda = { cor: hex(o.borda.cor), w: Math.max(0, Math.min(8, Math.round(Number(o.borda.w) || 0))) };
  if (o.sombra && hex(o.sombra.cor)) out.sombra = { n: Math.max(0, Math.min(4, Math.round(Number(o.sombra.n) || 0))), cor: hex(o.sombra.cor) };
  if (["p", "m", "g"].includes(o.tam)) out.tam = o.tam;
  if (["quadrado", "arredondado", "redondo"].includes(o.forma)) out.forma = o.forma;
  const lados = (x: unknown, max: number) => (Array.isArray(x) && x.length === 4 ? x.map((n) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)))) as [number, number, number, number] : null);
  const be = o.bordaEst;
  if (be && ESTILOS_BORDA.some(([k]) => k === be.estilo)) { const w = lados(be.w, 20); if (w) out.bordaEst = { estilo: be.estilo, w, cor: hex(be.cor) || "#d4af37" }; }
  const rr = lados(o.raio, 200); if (rr) out.raio = rr;
  const sc = o.sombraCx, faixa = (n: unknown, a: number, b: number) => Math.max(a, Math.min(b, Math.round(Number(n) || 0)));
  if (sc && hex(sc.cor)) out.sombraCx = { cor: hex(sc.cor), a: faixa(sc.a, 0, 100), x: faixa(sc.x, -100, 100), y: faixa(sc.y, -100, 100), blur: faixa(sc.blur, 0, 100), esp: faixa(sc.esp, -100, 100), inset: sc.inset === true };
  if (FONTES_APP.includes(o.fonte)) out.fonte = o.fonte;
  if (o.peso === "normal" || o.peso === "negrito") out.peso = o.peso;
  if (typeof o.italico === "boolean") out.italico = o.italico;
  if (["left", "center", "right", "justify"].includes(o.alinha)) out.alinha = o.alinha;
  if (Number.isFinite(Number(o.px)) && o.px !== null && o.px !== "") out.px = Math.max(8, Math.min(72, Math.round(Number(o.px))));
  if (o.sombraTxt && hex(o.sombraTxt.cor)) out.sombraTxt = { cor: hex(o.sombraTxt.cor), blur: Math.max(0, Math.min(30, Math.round(Number(o.sombraTxt.blur) || 0))), op: Math.max(0, Math.min(100, Math.round(Number(o.sombraTxt.op) || 0))) };
  return Object.keys(out).length ? out : null;
}
export function limparEstilo(e: unknown): Estilo | null {
  if (!e || typeof e !== "object") return null;
  const out: Estilo = {};
  for (const [k, v] of Object.entries(e as Record<string, unknown>)) { if (!/^[a-z]{2,12}$/.test(k)) continue; const x = limparVisual(v); if (x) out[k] = x; }
  return Object.keys(out).length ? out : null;
}

const rgba = (c: string, a: number) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
const comAlfa = (c: string, a?: number) => (a !== undefined && a < 100 ? rgba(c, a / 100) : c);
export const cssFundo = (f: Fundo) => (f.t === "degrade" && f.b ? `linear-gradient(${f.ang ?? 135}deg, ${comAlfa(f.a, f.aa)}, ${comAlfa(f.b, f.ba)})` : comAlfa(f.a, f.aa));
export const SOMBRAS = ["Nenhuma", "Suave", "Média", "Forte", "Brilho"];
function cssSombra(s: { n: number; cor: string }) {
  if (!s.n) return "none";
  if (s.n === 4) return `0 0 0 1px ${rgba(s.cor, 0.35)}, 0 0 28px -4px ${rgba(s.cor, 0.85)}`;
  return [`0 2px 6px ${rgba(s.cor, 0.22)}`, `0 8px 20px -6px ${rgba(s.cor, 0.45)}`, `0 16px 36px -8px ${rgba(s.cor, 0.7)}`][s.n - 1];
}
const RAIO = { quadrado: "0px", arredondado: "12px", redondo: "999px" };
const ZOOM = { p: "0.88", m: "1", g: "1.15" };

/**
 * O CSS (para o atributo style) de uma parte. `card` não tem formato "redondo":
 * fica com cantos bem arredondados. Usa !important porque os cards do app
 * têm temas próprios (Mestres, Documentários…) que senão ganhariam.
 */
export function cssVisual(v: Visual | null | undefined, tipo: "card" | "botao" | "capa" = "botao"): string {
  if (!v) return "";
  const r: string[] = [];
  const imp = (p: string, x: string) => r.push(`${p}:${x} !important`);
  if (v.fundo && tipo !== "capa") { imp("background", cssFundo(v.fundo)); if (tipo === "botao") imp("background-image", v.fundo.t === "degrade" ? cssFundo(v.fundo) : "none"); }
  if (v.texto && tipo !== "capa") imp("color", v.texto);
  if (v.borda) imp("border", v.borda.w ? `${v.borda.w}px solid ${v.borda.cor}` : "0");
  if (v.sombra) imp("box-shadow", cssSombra(v.sombra));
  if (v.forma) imp("border-radius", tipo === "card" && v.forma === "redondo" ? "28px" : RAIO[v.forma]);
  if (v.tam && tipo === "botao") imp("zoom", ZOOM[v.tam]);
  // Borda completa e cantos (editor novo) valem por cima do contorno e do formato simples.
  if (v.bordaEst) {
    if (v.bordaEst.estilo === "none") imp("border-style", "none");
    else { imp("border-style", v.bordaEst.estilo); imp("border-width", v.bordaEst.w.map((n) => n + "px").join(" ")); imp("border-color", v.bordaEst.cor); }
  }
  if (v.raio) imp("border-radius", v.raio.map((n) => n + "px").join(" "));
  if (v.sombraCx) { const s = v.sombraCx; imp("box-shadow", `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.esp}px ${rgba(s.cor, s.a / 100)}`); }
  return r.join(";");
}

/** Tipos de parte: o seletor mostra só o que faz sentido para cada uma. */
export type TipoParte = "card" | "botao" | "capa" | "texto";

/**
 * As partes da tela da aula (Configurações → Aulas, 0099). O que se escolhe
 * para uma parte vale para todas as aulas. `sel` é onde o app aplica.
 */
export type ParteTela = { k: string; nome: string; desc: string; tipo: TipoParte; sel: string; aba?: string; svg?: boolean; extra?: string };
export const PARTES_AULA: ParteTela[] = [
  { k: "video", nome: "Vídeo", desc: "Contorno, sombra e cantos do vídeo.", tipo: "capa", sel: ".aula-col .player" },
  { k: "play", nome: "Botão de play", desc: "O botão redondo no meio do vídeo.", tipo: "botao", sel: ".aula-col .play-centro" },
  { k: "textos", nome: "Títulos e textos", desc: "Cor do “Módulo · Aula”, dos títulos e dos textos da aula.", tipo: "texto", sel: ".aula-col .aula-local, .aula-col .aula-local b, .aula-col .sobre-titulo, .aula-col .sobre-cartao p, .aula-col .ex-cartao h3, .aula-col .ex-texto p, .aula-col .prox-aulas h2, .aula-col .coms-cab h2" },
  { k: "icones", nome: "Ícones", desc: "Cor dos ícones da tela da aula.", tipo: "texto", sel: ".aula-col .abas-aula svg, .aula-col .sobre-ic svg, .aula-col .nav-ant svg, .aula-col .nav-prox svg, .aula-col .la-assistir svg, .aula-col .aula-entre svg, .aula-col .com-abrir-txt svg, .aula-col .com-acoes svg" },
  { k: "anterior", nome: "Botão Aula anterior", desc: "", tipo: "botao", sel: ".aula-col .nav-ant" },
  { k: "proxima", nome: "Botão Próxima aula", desc: "", tipo: "botao", sel: ".aula-col .nav-prox" },
  { k: "abas", nome: "Botões Sobre · Instruções · PDF", desc: "", tipo: "botao", sel: ".aula-col .abas-aula button" },
  { k: "cards", nome: "Cards de Sobre e Instruções", desc: "O card que abre ao tocar em Sobre, Instruções ou PDF.", tipo: "card", sel: ".aula-col .sobre-cartao, .aula-col .ex-cartao", aba: "sobre" },
  { k: "comentarios", nome: "Card de comentários", desc: "", tipo: "card", sel: ".aula-col .coms" },
  { k: "proxcards", nome: "Cards das próximas aulas", desc: "A lista embaixo, com as próximas aulas do módulo.", tipo: "card", sel: ".aula-col .prox-card" },
  { k: "modulos", nome: "Botões Módulo anterior · Próximo", desc: "Os dois botões no fim da página.", tipo: "botao", sel: ".aula-col .aula-entre button" },
];

/**
 * As partes fixas da tela inicial e do que fica em todas as telas (topo e menu
 * de baixo) — Configurações → Início (0100). Os cards de módulo não entram:
 * eles são configurados em Módulos.
 */
export const PARTES_INICIO: ParteTela[] = [
  { k: "topo", nome: "Faixa do topo", desc: "A barra de cima, com o nome e a foto.", tipo: "card", sel: ".topo" },
  { k: "marca", nome: "Nome no topo", desc: "A linha grande (ex.: Mentoria).", tipo: "texto", sel: ".topo .marca b" },
  { k: "marcasub", nome: "Subtítulo no topo", desc: "A linha pequena (ex.: Área de alunos).", tipo: "texto", sel: ".topo .marca span" },
  { k: "toposaud", nome: "Texto de saudação (topo)", desc: "O texto pequeno antes do nome, junto da foto.", tipo: "texto", sel: ".tp-saud" },
  { k: "toponome", nome: "Nome da aluna (topo)", desc: "O nome ao lado da foto.", tipo: "texto", sel: ".tp-nome" },
  { k: "foto", nome: "Contorno da foto", desc: "O círculo da foto no canto de cima.", tipo: "capa", sel: ".topo .av-topo" },
  { k: "ola", nome: "Card de boas-vindas", desc: "O bloco com a saudação e a mensagem.", tipo: "card", sel: ".pa-ola" },
  { k: "saudacao", nome: "Texto inicial", desc: "A frase grande antes do versículo (ex.: “Bem-vindo(a), nome”).", tipo: "texto", sel: ".pa-nome" },
  { k: "mensagem", nome: "Mensagem de boas-vindas", desc: "O texto embaixo da saudação.", tipo: "texto", sel: ".pa-intro" },
  { k: "vers", nome: "Card do versículo", desc: "Fundo, contorno e sombra da caixa do versículo.", tipo: "card", sel: ".pa .vers" },
  { k: "verstexto", nome: "Texto do versículo", desc: "", tipo: "texto", sel: ".pa .vers-txt" },
  { k: "versref", nome: "“Versículo de hoje” e referência", desc: "", tipo: "texto", sel: ".pa .vers-rot, .pa .vers-ref" },
  { k: "mentoria", nome: "Card “Sua mentoria”", desc: "O bloco que envolve a mentoria (os cards dos módulos ficam em Módulos).", tipo: "card", sel: ".pa .mt-bloco" },
  { k: "mentoriatx", nome: "Textos de “Sua mentoria”", desc: "“Sua mentoria”, o nome e “Comece por aqui”.", tipo: "texto", sel: ".pa .mt-rot, .pa .mt-tit, .pa .mt-passo" },
  { k: "mentoriacard", nome: "Card da aula (dentro de “Sua mentoria”)", desc: "O card com a capa, o título e o botão, dentro do card “Sua mentoria”.", tipo: "card", sel: ".mt-bloco .mh-card, .mt-bloco .heroi" },
  { k: "comece", nome: "Texto “Comece por aqui”", desc: "O texto em cima da primeira aula, dentro do card “Sua mentoria”.", tipo: "texto", sel: "#h-comece" },
  { k: "menu", nome: "Menu de baixo", desc: "Fundo, contorno e sombra da barra de baixo.", tipo: "card", sel: ".nav-base" },
  { k: "menutexto", nome: "Nomes do menu", desc: "Início, Módulos… (os que não estão abertos).", tipo: "texto", sel: ".nav-base button:not([aria-current]), .nav-base .nb-link" },
  { k: "menuicone", nome: "Ícones do menu", desc: "Os ícones dos botões que não estão abertos.", tipo: "texto", sel: ".nav-base button:not([aria-current]) svg, .nav-base .nb-link svg", svg: true },
  { k: "menuativo", nome: "Botão aberto do menu", desc: "Nome e ícone da tela em que a aluna está.", tipo: "texto", sel: ".nav-base button[aria-current=\"page\"], .nav-base button[aria-current=\"page\"] svg", svg: true },
];

/** As partes da tela Perfil (Configurações → Perfil, 0101). */
export const PARTES_PERFIL: ParteTela[] = [
  { k: "fundo", nome: "Fundo da tela", desc: "Cor ou degradê atrás de tudo no Perfil.", tipo: "card", sel: "html:has(.pf-al)", extra: "html:has(.pf-al) body,html:has(.pf-al) main{background:transparent !important}html:has(.pf-al){min-height:100%;background-attachment:fixed !important}" },
  { k: "titulo", nome: "Título", desc: "“Seu perfil”.", tipo: "texto", sel: ".pf-al .ola p" },
  { k: "nome", nome: "Nome da aluna", desc: "", tipo: "texto", sel: ".pf-al .ola h1" },
  { k: "foto", nome: "Contorno da foto", desc: "Quando a foto aparece no Perfil.", tipo: "capa", sel: ".pf-al .pf-foto-circ" },
  { k: "botoes", nome: "Botões", desc: "Configurar, Onde parei e os outros.", tipo: "botao", sel: ".pf-al .pf-al-bt:not(.sair)" },
  { k: "sair", nome: "Botão Sair", desc: "", tipo: "botao", sel: ".pf-al .pf-al-bt.sair" },
  { k: "botaoicone", nome: "Ícones dos botões", desc: "", tipo: "texto", sel: ".pf-al .pf-al-bt svg", svg: true },
  { k: "botaoseta", nome: "Setinha dos botões", desc: "O círculo com › no fim de cada botão.", tipo: "botao", sel: ".pf-al .pf-al-bt > b" },
  { k: "notif", nome: "Barra dos avisos", desc: "O card “Avisos das novas aulas”.", tipo: "card", sel: ".pf-al .np-card" },
  { k: "notiftexto", nome: "Textos da barra dos avisos", desc: "", tipo: "texto", sel: ".pf-al .np-ctxt b, .pf-al .np-ctxt em" },
  { k: "notifsino", nome: "Sino da barra dos avisos", desc: "", tipo: "botao", sel: ".pf-al .np-csino" },
  { k: "notifbt", nome: "Botão Ativar", desc: "", tipo: "botao", sel: ".pf-al .np-cbt" },
  { k: "texto", nome: "Texto do fim", desc: "O texto livre embaixo dos botões.", tipo: "texto", sel: ".pf-al .pf-al-txt" },
];

/** As partes do pop-up "Ativar notificações" (Configurações → Perfil → Notificações, 0102). */
export const PARTES_NOTIF: ParteTela[] = [
  { k: "caixa", nome: "Caixa do pop-up", desc: "Fundo, contorno, sombra e cantos.", tipo: "card", sel: ".np-fundo .np" },
  { k: "veu", nome: "Fundo atrás do pop-up", desc: "A cor que escurece a tela atrás.", tipo: "card", sel: ".np-fundo" },
  { k: "sino", nome: "Sino", desc: "O círculo com o sino no alto.", tipo: "botao", sel: ".np-fundo .np-sino" },
  { k: "titulo", nome: "Título", desc: "", tipo: "texto", sel: ".np-fundo .np h2" },
  { k: "texto", nome: "Texto", desc: "", tipo: "texto", sel: ".np-fundo .np p" },
  { k: "ativar", nome: "Botão grande (ativar)", desc: "", tipo: "botao", sel: ".np-fundo .np-ativar" },
  { k: "depois", nome: "Botão pequeno (agora não)", desc: "", tipo: "botao", sel: ".np-fundo .np-depois" },
];

/** O CSS de uma parte de texto: cor, fonte, peso, itálico, tamanho e sombra. */
function cssTexto(p: ParteTela, v: Visual): string {
  const r: string[] = [];
  if (v.texto) r.push(`color:${v.texto} !important${p.svg ? `;stroke:${v.texto} !important` : ""}`);
  if (!p.svg) {
    if (v.fonte) r.push(`font-family:'${v.fonte}', Georgia, serif !important`);
    if (v.peso) r.push(`font-weight:${v.peso === "negrito" ? 700 : 400} !important`);
    if (typeof v.italico === "boolean") r.push(`font-style:${v.italico ? "italic" : "normal"} !important`);
    if (v.px) r.push(`font-size:${v.px}px !important`);
    if (v.alinha) r.push(`text-align:${v.alinha} !important`);
    if (v.sombraTxt) r.push(`text-shadow:0 1px ${v.sombraTxt.blur}px ${rgba(v.sombraTxt.cor, v.sombraTxt.op / 100)} !important`);
  }
  return r.length ? `${p.sel}{${r.join(";")}}` : "";
}
/** O CSS de uma tela (aula ou início) com o estilo escolhido (vazio = visual padrão). */
export function cssDaTela(partes: ParteTela[], e: Estilo | null | undefined): string {
  if (!e) return "";
  return partes.map((p) => {
    const v = e[p.k]; if (!v) return "";
    if (p.tipo === "texto") return cssTexto(p, v);
    const css = cssVisual(v, p.tipo === "capa" ? "capa" : p.tipo);
    return css ? `${p.sel}{${css}}${v.fundo && p.extra ? p.extra : ""}` : "";
  }).join("\n");
}
export const cssDaAula = (e: Estilo | null | undefined) => cssDaTela(PARTES_AULA, e);
export const cssDoInicio = (e: Estilo | null | undefined) => cssDaTela(PARTES_INICIO, e);
export const cssDoPerfil = (e: Estilo | null | undefined) => cssDaTela(PARTES_PERFIL, e);
export const cssDaNotif = (e: Estilo | null | undefined) => cssDaTela(PARTES_NOTIF, e);
