/**
 * Camadas flutuantes do painel, no modelo dos editores (Figma, Canva, Webflow):
 * a lista de fontes e o seletor de cor abrem por cima, presos ao controle
 * clicado. Nada embaixo cresce nem pula. Só uma fica aberta por vez.
 */
export const PRONTAS = ["#d4af37", "#c9a25c", "#f2d27a", "#8a6a2f", "#ffffff", "#f6eed7", "#b9b9b9", "#3a3a3a", "#0b0b0d", "#000000",
  "#8e6cc9", "#c7b0f0", "#4a78c2", "#7fa8e8", "#2f9c98", "#5fc7c2", "#4f9a5a", "#8fc27e", "#b8352d", "#e07a8a", "#ff6a00", "#ff1f8f"];
export function hsvParaHex(hh: number, s: number, v: number) {
  const f = (n: number) => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
export function hexParaHsv(c: string): [number, number, number] {
  const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
}


const OK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;
const ff = (x: string) => `'${x}', Georgia, serif`;

let pop: HTMLElement | null = null, gatilho: HTMLElement | null = null, aoFecharPop: (() => void) | null = null;

/** Clique fora: fecha só a camada. Num fundo de janela (véu), o clique não passa adiante. */
function fora(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (!pop || pop.contains(t) || gatilho?.contains(t)) return;
  const veu = t.matches(".fc-fundo, .se-fora");
  fecharFlutuante(false);
  if (veu) { e.stopPropagation(); e.preventDefault(); }
}
function tecla(e: KeyboardEvent) { if (e.key === "Escape" && pop) { e.stopImmediatePropagation(); e.preventDefault(); fecharFlutuante(); } }
function posicionar() {
  if (!pop || !gatilho) return;
  if (!gatilho.isConnected) { fecharFlutuante(false); return; }
  const r = gatilho.getBoundingClientRect(), alt = pop.offsetHeight, larg = Math.max(r.width, Number(pop.dataset.larg || 0));
  const baixo = innerHeight - r.bottom - 12, cima = r.top - 12;
  pop.style.width = larg + "px";
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - larg - 12)) + "px";
  pop.style.top = (alt <= baixo || baixo >= cima ? r.bottom + 6 : Math.max(12, r.top - 6 - alt)) + "px";
}

export const flutuanteDe = (g: HTMLElement) => !!pop && gatilho === g;
export function fecharFlutuante(devolverFoco = true) {
  if (!pop) return;
  const g = gatilho, fn = aoFecharPop;
  pop.remove(); pop = null; gatilho = null; aoFecharPop = null;
  removeEventListener("pointerdown", fora, true); removeEventListener("keydown", tecla, true);
  removeEventListener("resize", posicionar); removeEventListener("scroll", posicionar, true);
  g?.setAttribute("aria-expanded", "false"); if (devolverFoco) g?.focus();
  try { fn?.(); } catch { /* quem abriu se ajeita */ }
}
function abrir(g: HTMLElement, el: HTMLElement, aoFechar?: () => void) {
  fecharFlutuante(false);
  pop = el; gatilho = g; aoFecharPop = aoFechar || null;
  g.setAttribute("aria-expanded", "true"); document.body.append(el); posicionar();
  addEventListener("pointerdown", fora, true); addEventListener("keydown", tecla, true);
  addEventListener("resize", posicionar); addEventListener("scroll", posicionar, true);
}

/** Lista de fontes: busca, ✓ na atual, prévia ao passar o mouse, setas + Enter. */
export function abrirListaFontes(g: HTMLElement, o: { fontes: string[]; atual: string; padrao?: string; aoPrevia: (f: string | null) => void; aoEscolher: (f: string) => void }) {
  if (flutuanteDe(g)) { fecharFlutuante(); return; }
  const el = document.createElement("div"); el.className = "fc-pop fc-pop-fontes";
  const itens = (o.padrao !== undefined ? [["", o.padrao]] : []).concat(o.fontes.map((x) => [x, x]));
  el.innerHTML = `<div class="fc-busca"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg><input type="text" placeholder="Buscar fonte" aria-label="Buscar fonte" spellcheck="false" autocomplete="off" /></div>
    <div class="fc-opcoes" role="listbox" aria-label="Fontes">${itens.map(([v, n]) => `<button type="button" role="option" tabindex="-1" data-v="${v}" aria-selected="${v === o.atual}"><span${v ? ` style="font-family:${ff(v)}"` : ""}>${n}</span><i>${OK}</i></button>`).join("")}<p class="fc-nada" hidden>Nenhuma fonte encontrada.</p></div>`;
  const busca = el.querySelector<HTMLInputElement>("input")!, ops = () => [...el.querySelectorAll<HTMLButtonElement>(".fc-opcoes button:not([hidden])")];
  let ativo = Math.max(0, itens.findIndex(([v]) => v === o.atual));
  const marcar = (i: number, rolar = true) => { const l = ops(); if (!l.length) return; ativo = (i + l.length) % l.length; l.forEach((b, n) => b.classList.toggle("ativo", n === ativo)); if (rolar) l[ativo].scrollIntoView({ block: "nearest" }); };
  const escolher = (x: string) => { o.aoEscolher(x); fecharFlutuante(); };
  busca.addEventListener("input", () => {
    const t = busca.value.trim().toLowerCase();
    el.querySelectorAll<HTMLButtonElement>(".fc-opcoes button").forEach((b) => { b.hidden = !!t && !(b.textContent || "").toLowerCase().includes(t); });
    el.querySelector<HTMLElement>(".fc-nada")!.hidden = ops().length > 0; marcar(0);
  });
  busca.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); marcar(ativo + (e.key === "ArrowDown" ? 1 : -1)); const b = ops()[ativo]; if (b) o.aoPrevia(b.dataset.v!); }
    else if (e.key === "Enter") { e.preventDefault(); const b = ops()[ativo]; if (b) escolher(b.dataset.v!); }
  });
  el.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".fc-opcoes button"); if (b) escolher(b.dataset.v!); });
  el.addEventListener("pointerover", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".fc-opcoes button"); if (b) { marcar(ops().indexOf(b as HTMLButtonElement), false); o.aoPrevia(b.dataset.v!); } });
  el.addEventListener("pointerleave", () => o.aoPrevia(null));
  abrir(g, el, () => o.aoPrevia(null));
  marcar(ativo); busca.focus();
}

/** Seletor de cor: quadro de saturação/brilho, matiz, código e cores prontas. */
export function abrirQuadroCor(g: HTMLElement, o: { cor: string; aoMudar: (c: string) => void; aoFechar?: () => void; alfa?: number; aoAlfa?: (a: number) => void; degrades?: [string, string, number][]; aoDegrade?: (a: string, b: string, ang: number) => void }) {
  if (flutuanteDe(g)) { fecharFlutuante(); return; }
  let cor = /^#[0-9a-f]{6}$/i.test(o.cor) ? o.cor.toLowerCase() : "#d4af37", hsv = hexParaHsv(cor), alfa = Math.max(0, Math.min(100, o.alfa ?? 100));
  const el = document.createElement("div"); el.className = "fc-pop fc-pop-cor"; el.dataset.larg = "280";
  el.innerHTML = `<div class="se-sv fc-sv"><i></i></div>
    <div class="se-hue"><i></i></div>
    ${o.aoAlfa ? `<div class="fc-alfa" title="Transparência"><b></b><i></i></div>` : ""}
    <div class="fc-hexl"><i class="fc-bola"></i><input class="campo fc-hex" maxlength="7" spellcheck="false" aria-label="Código da cor (dá para colar)" /></div>
    <span class="fc-rot fc-rot-p">Cores prontas</span>
    <div class="se-prontas fc-prontas">${PRONTAS.map((c) => `<button type="button" data-v="${c}" title="${c.toUpperCase()}" aria-label="${c.toUpperCase()}" style="background:${c}"></button>`).join("")}</div>
    ${o.degrades && o.aoDegrade ? `<span class="fc-rot fc-rot-p">Degradês prontos</span><div class="se-prontas fc-degs">${o.degrades.map(([a, b, g], i) => `<button type="button" data-deg="${i}" title="Degradê pronto" aria-label="Degradê pronto" style="background:linear-gradient(${g}deg, ${a}, ${b})"></button>`).join("")}</div>` : ""}`;
  const sv = el.querySelector<HTMLElement>(".fc-sv")!, hu = el.querySelector<HTMLElement>(".se-hue")!, hx = el.querySelector<HTMLInputElement>(".fc-hex")!;
  const mostrar = (deHex = false) => {
    sv.style.background = hsvParaHex(hsv[0], 1, 1);
    const p = sv.querySelector("i")!; p.style.left = hsv[1] * 100 + "%"; p.style.top = (1 - hsv[2]) * 100 + "%";
    hu.querySelector("i")!.style.left = (hsv[0] / 360) * 100 + "%";
    el.querySelector<HTMLElement>(".fc-bola")!.style.background = cor;
    const al = el.querySelector<HTMLElement>(".fc-alfa"); if (al) { al.querySelector<HTMLElement>("b")!.style.background = `linear-gradient(90deg, transparent, ${cor})`; al.querySelector<HTMLElement>("i")!.style.left = alfa + "%"; }
    if (!deHex) hx.value = cor.toUpperCase();
    el.querySelectorAll<HTMLElement>(".fc-prontas button").forEach((b) => b.classList.toggle("on", b.dataset.v === cor));
  };
  const mudar = (deHex = false) => { o.aoMudar(cor); mostrar(deHex); };
  const arrastar = (e: PointerEvent, alvo: HTMLElement, fn: (x: number, y: number) => void) => {
    e.preventDefault();
    const mover = (ev: PointerEvent) => { const r = alvo.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); };
    mover(e);
    const solta = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", solta); };
    addEventListener("pointermove", mover); addEventListener("pointerup", solta);
  };
  sv.addEventListener("pointerdown", (e) => arrastar(e, sv, (x, y) => { hsv = [hsv[0], x, 1 - y]; cor = hsvParaHex(...hsv); mudar(); }));
  hu.addEventListener("pointerdown", (e) => arrastar(e, hu, (x) => { hsv = [x * 359.9, hsv[1], hsv[2]]; cor = hsvParaHex(...hsv); mudar(); }));
  const alv = el.querySelector<HTMLElement>(".fc-alfa");
  alv?.addEventListener("pointerdown", (e) => arrastar(e, alv, (x) => { alfa = Math.round(x * 100); o.aoAlfa?.(alfa); mostrar(); }));
  hx.addEventListener("input", () => { let x = hx.value.trim(); if (!x.startsWith("#")) x = "#" + x; if (/^#[0-9a-f]{6}$/i.test(x)) { cor = x.toLowerCase(); hsv = hexParaHsv(cor); mudar(true); } });
  hx.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fecharFlutuante(); } });
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".fc-prontas button"); if (b) { cor = b.dataset.v!; hsv = hexParaHsv(cor); mudar(); return; }
    const d = (e.target as HTMLElement).closest<HTMLElement>("[data-deg]"); if (d && o.degrades && o.aoDegrade) { const [a, bb, g] = o.degrades[Number(d.dataset.deg)]; o.aoDegrade(a, bb, g); fecharFlutuante(); }
  });
  abrir(g, el, o.aoFechar); mostrar();
}
