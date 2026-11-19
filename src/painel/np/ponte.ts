/*
 * Produtos e Categorias = o modelo aprovado (modelo.html, v298) embutido no painel.
 * O painel manda os dados reais (np-dados) e recebe as ações que gravam (np-acao).
 * O quadro fica fixo sobre a área de conteúdo e não é recriado a cada redesenho do painel.
 */
import modeloHtml from "./modelo.html?raw";

export type NpAcao = { np: "acao"; tipo: string; [k: string]: unknown };

let quadro: HTMLIFrameElement | null = null;
let assinatura = "";
let vistaAtual = "";
let aoAgir: ((m: NpAcao) => void) | null = null;

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
  if (ass !== assinatura) {
    assinatura = ass;
    vistaAtual = vista;
    const json = ass.replace(/</g, "\\u003c");
    f.srcdoc = modeloHtml.replace("<script>", `<script>window.NP_EMBED=1;window.NP_DADOS=${json};window.NP_DADOS.ir=${JSON.stringify(vista)};</script>\n<script>`);
  } else if (vista !== vistaAtual) {
    vistaAtual = vista;
    f.contentWindow?.postMessage({ np: "ir", v: vista }, "*");
  }
  posicionar();
}
