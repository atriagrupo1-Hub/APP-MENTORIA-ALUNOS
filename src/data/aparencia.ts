/*
 * Aparência da área da aluna (Configurações → Aparência, 0089): tema,
 * cores, fontes, imagens e recursos visuais. O painel usa as mesmas
 * paletas e fontes para a prévia; a área da aluna aplica de verdade.
 */

export type Cores = { primaria: string; secundaria: string; fundo: string; cards: string; texto: string; texto2: string };
export type Aparencia = {
  tema: string; cores?: Partial<Cores> | null; fonteTitulo?: string; fonteTexto?: string;
  logo?: string; fundoLogin?: string; fundoPaginas?: string; favicon?: string;
  brilho?: boolean; bordas?: boolean; sombras?: boolean; animacoes?: boolean;
};

export const TEMAS: Record<string, [string, Cores]> = {
  escuro: ["Escuro (Padrão)", { primaria: "#d4b170", secundaria: "#f0dca8", fundo: "#000000", cards: "#121114", texto: "#f7f1e6", texto2: "#c9c2b6" }],
  claro: ["Claro", { primaria: "#a97c2f", secundaria: "#7a5518", fundo: "#f7f3ec", cards: "#ffffff", texto: "#1c1710", texto2: "#5a5248" }],
  azul: ["Azul profundo", { primaria: "#5b9bff", secundaria: "#cfe0ff", fundo: "#040a18", cards: "#0c1830", texto: "#eef3ff", texto2: "#a9b8d6" }],
  roxo: ["Roxo místico", { primaria: "#d36bff", secundaria: "#f3d9ff", fundo: "#0c0613", cards: "#1a0e27", texto: "#f7efff", texto2: "#c3b0d6" }],
  verde: ["Verde natureza", { primaria: "#b9c95a", secundaria: "#e8f0c8", fundo: "#03100a", cards: "#0b2015", texto: "#eef6ea", texto2: "#a9c2ad" }],
};
export const FONTES_TITULO: Record<string, string> = { "Cormorant Garamond": "Cormorant Garamond (Padrão)", "Playfair Display": "Playfair Display", Cinzel: "Cinzel", Lora: "Lora", "EB Garamond": "EB Garamond" };
export const FONTES_TEXTO: Record<string, string> = { Lato: "Lato (Padrão)", Inter: "Inter", Montserrat: "Montserrat", "Open Sans": "Open Sans", Nunito: "Nunito" };

const hex = (x: unknown) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : "");
/** As cores finais: a paleta do tema com as trocas feitas no painel. */
export function coresDe(a: Aparencia | null): Cores {
  const base = (TEMAS[a?.tema || "escuro"] || TEMAS.escuro)[1];
  const c = { ...base };
  for (const k of Object.keys(c) as (keyof Cores)[]) { const v = hex(a?.cores?.[k]); if (v) c[k] = v; }
  return c;
}
const rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

/** O CSS que troca as variáveis de cor da área da aluna (só quando algo mudou do padrão escuro). */
export function cssDasCores(a: Aparencia | null): string {
  if (!a) return "";
  const tema = a.tema || "escuro";
  if (tema === "escuro" && !Object.values(a.cores || {}).some(hex)) return "";
  if (tema === "claro" && !Object.values(a.cores || {}).some(hex)) return "";
  const c = coresDe(a);
  const sel = tema === "claro" ? 'html[data-tema="claro"]' : ':root:not([data-tema="claro"])';
  return `${sel}{--fundo:${c.fundo};--sup:${c.cards};--sup-2:${c.cards};--texto:${c.texto};--texto-2:${rgba(c.texto2, 0.95)};--texto-3:${rgba(c.texto2, 0.8)};--ouro:${c.primaria};--ouro-txt:${c.primaria};--ouro-claro:${c.secundaria};--reserva:linear-gradient(160deg,${c.cards},${c.fundo} 60%,${c.cards});}
${sel} body{background:${c.fundo}}
${sel} .topo{background:${rgba(c.fundo, 0.92)};border-bottom-color:${rgba(c.primaria, 0.25)}}
${sel} .nav-base:not(.nb-cores){background:${rgba(c.fundo, 0.97)};border-top-color:${rgba(c.primaria, 0.25)}}
${sel} .entrada{background:radial-gradient(900px 500px at 50% -10%,${rgba(c.primaria, 0.25)},${c.fundo} 65%)!important}
${sel} .vers{border-color:${rgba(c.primaria, 0.6)};background:linear-gradient(180deg,${c.cards} 0%,${c.fundo} 100%);box-shadow:inset 0 0 0 4px ${c.fundo},inset 0 0 0 5px ${rgba(c.primaria, 0.22)},0 16px 34px -24px ${rgba(c.primaria, 0.55)}}
${sel} .mt-bloco{background:radial-gradient(120% 70% at 50% 0%,${rgba(c.primaria, 0.16)},transparent 65%),${c.cards};border-color:${rgba(c.secundaria, 0.75)};box-shadow:0 0 22px -10px ${rgba(c.primaria, 0.7)}}
${sel} .mt-cab .mt-rot,${sel} .mt-passo{color:${c.secundaria}}
${sel} .pa-ola{background:radial-gradient(120% 90% at 92% 0%,${rgba(c.primaria, 0.22)},transparent 60%)}`;
}

const urlFonte = (f: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
/** Carrega a fonte do Google (uma vez). */
export function carregarFonte(f: string) {
  if (!f || f === "Cormorant Garamond" || f === "Lato") return;
  const id = "fonte-" + f.replace(/\s+/g, "-");
  if (document.getElementById(id)) return;
  const l = Object.assign(document.createElement("link"), { id, rel: "stylesheet", href: urlFonte(f) });
  document.head.append(l);
}

/** Carrega várias fontes de uma vez (um só pedido ao Google), só as que ainda faltam. */
export function carregarFontes(fs: string[]) {
  const faltam = fs.filter((f) => f && f !== "Cormorant Garamond" && f !== "Lato" && !document.getElementById("fonte-" + f.replace(/\s+/g, "-")));
  if (!faltam.length) return;
  const l = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${faltam.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":wght@400;600").join("&")}&display=swap` });
  faltam.forEach((f) => document.head.append(Object.assign(document.createElement("meta"), { id: "fonte-" + f.replace(/\s+/g, "-") })));
  document.head.append(l);
}

let fontesOriginais: Array<[CSSStyleDeclaration, string]> | null = null;
/** Troca as fontes do app nas regras de CSS (títulos: Cormorant Garamond; textos: Lato). */
function trocarFontes(titulo: string, texto: string) {
  if (!fontesOriginais) {
    fontesOriginais = [];
    for (const ss of Array.from(document.styleSheets)) {
      let regras: CSSRuleList; try { regras = ss.cssRules; } catch { continue; }
      const andar = (lista: CSSRuleList) => { for (const r of Array.from(lista)) { if (r instanceof CSSStyleRule && r.style.fontFamily) fontesOriginais!.push([r.style, r.style.fontFamily]); else if ("cssRules" in r) andar((r as CSSGroupingRule).cssRules); } };
      andar(regras);
    }
  }
  for (const [st, orig] of fontesOriginais) {
    let f = orig;
    if (titulo && titulo !== "Cormorant Garamond") f = f.replace(/"?Cormorant Garamond"?/g, `"${titulo}"`);
    if (texto && texto !== "Lato") f = f.replace(/(^|,\s*)"?Lato"?/g, `$1"${texto}"`);
    if (st.fontFamily !== f) st.fontFamily = f;
  }
}

/** Aplica a aparência na área da aluna. */
export function aplicarAparencia(a: Aparencia | null, urlImagem: (c: string) => string) {
  let st = document.getElementById("aparencia") as HTMLStyleElement | null;
  if (!st) { st = document.createElement("style"); st.id = "aparencia"; document.head.append(st); }
  const raiz = document.documentElement;
  raiz.classList.toggle("sem-brilho", a?.brilho === false);
  raiz.classList.toggle("sem-bordas", a?.bordas === false);
  raiz.classList.toggle("sem-sombras", a?.sombras === false);
  raiz.classList.toggle("sem-animacao", a?.animacoes === false);
  const img = (c?: string) => (c ? urlImagem(c) : "");
  let css = cssDasCores(a);
  if (a?.fundoLogin) css += `\n.entrada{background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.75)),url("${img(a.fundoLogin)}") center/cover no-repeat!important}`;
  if (a?.fundoPaginas) css += `\nbody:not(.sem-nav){background-image:linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,.86)),url("${img(a.fundoPaginas)}");background-size:cover;background-attachment:fixed;background-position:center}`;
  st.textContent = css;
  if (a?.favicon) { let l = document.querySelector<HTMLLinkElement>('link[rel="icon"]'); if (!l) { l = Object.assign(document.createElement("link"), { rel: "icon" }); document.head.append(l); } l.href = img(a.favicon); }
  const ft = a?.fonteTitulo || "Cormorant Garamond", fx = a?.fonteTexto || "Lato";
  carregarFonte(ft); carregarFonte(fx);
  if (ft !== "Cormorant Garamond" || fx !== "Lato" || fontesOriginais) trocarFontes(ft, fx);
}
