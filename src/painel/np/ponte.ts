/*
 * Produtos e Categorias = o modelo aprovado (modelo.html, v298) embutido no painel.
 * O painel manda os dados reais (np-dados) e recebe as ações que gravam (np-acao).
 * O quadro fica fixo sobre a área de conteúdo e não é recriado a cada redesenho do painel.
 */
import modeloBruto from "./modelo.html?raw";

/** A mesma base com que o modelo roda no claude.ai: o que está marcado como escondido fica escondido. */
const BASE = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
/** No modelo, acima de 760 px a barra lateral dele (200 px) come a largura; aqui ela não existe.
 *  Cada mudança de arrumação passa a valer na mesma largura de conteúdo do modelo. */
const modeloHtml = BASE + modeloBruto.replace(/@media\(max-width:(\d+)px\)/g, (m, n) => (+n > 760 ? `@media(max-width:${+n - 200}px),(max-width:760px)` : m)) + "\n</body></html>";

export type NpAcao = { np: "acao"; tipo: string; [k: string]: unknown };

let quadro: HTMLIFrameElement | null = null;
let assinatura = "";
let vistaAtual = "";
let aoAgir: ((m: NpAcao) => void) | null = null;
let carregado = false;

/** Resposta do painel ao modelo (ex.: id do curso criado). */
export function npResponder(m: Record<string, unknown>) { quadro?.contentWindow?.postMessage({ np: "resp", ...m }, "*"); }

function quadroDe(): HTMLIFrameElement {
  if (quadro) return quadro;
  const f = document.createElement("iframe");
  f.id = "npQuadro";
  f.title = "Produtos e categorias";
  f.setAttribute("style", "position:fixed;border:0;z-index:1;background:#101113;display:none");
  document.body.appendChild(f);
  addEventListener("message", (e) => {
    if (e.source !== f.contentWindow) return;
    const m = e.data as NpAcao;
    if (m && m.np === "acao" && aoAgir) aoAgir(m);
  });
  const repor = () => posicionar();
  addEventListener("resize", repor);
  addEventListener("scroll", repor, { passive: true });
  quadro = f;
  return f;
}

function posicionar() {
  const f = quadro, alvo = document.getElementById("npAlvo");
  if (!f) return;
  if (!alvo) { f.style.display = "none"; return; }
  const r = alvo.getBoundingClientRect();
  const topo = Math.max(r.top, 0);
  f.style.display = "block";
  f.style.left = r.left + "px";
  f.style.top = topo + "px";
  f.style.width = r.width + "px";
  f.style.height = Math.max(200, innerHeight - topo) + "px";
}

/** Chamado depois de cada redesenho do painel. */
export function npSincronizar(ativo: boolean, vista: "lista" | "categorias", dados: () => Record<string, unknown>, agir: (m: NpAcao) => void) {
  aoAgir = agir;
  if (!ativo) { if (quadro) quadro.style.display = "none"; return; }
  const f = quadroDe();
  const d = dados();
  const ass = JSON.stringify(d);
  if (ass !== assinatura && carregado && quadro) {
    // Dados novos (depois de gravar): o modelo atualiza sem recarregar, para não perder a tela em que está.
    assinatura = ass;
    f.contentWindow?.postMessage({ np: "dados", d }, "*");
    if (vista !== vistaAtual) { vistaAtual = vista; f.contentWindow?.postMessage({ np: "ir", v: vista }, "*"); }
  } else if (ass !== assinatura) {
    assinatura = ass;
    vistaAtual = vista;
    f.onload = () => { carregado = true; };
    const json = ass.replace(/</g, "\\u003c");
    f.srcdoc = modeloHtml.replace("<script>", `<script>window.NP_EMBED=1;window.NP_DADOS=${json};window.NP_DADOS.ir=${JSON.stringify(vista)};</script>\n<script>`);
  } else if (vista !== vistaAtual) {
    vistaAtual = vista;
    f.contentWindow?.postMessage({ np: "ir", v: vista }, "*");
  }
  posicionar();
}
