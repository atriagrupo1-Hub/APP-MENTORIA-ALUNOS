/**
 * Seletor de estilo do painel: escolhe qualquer cor (quadro de cor + matiz +
 * código), degradê, cor do texto, contorno, sombra, tamanho e formato de um
 * card, botão ou capa. Abre flutuando ao lado de quem chamou, sem cobrir a
 * prévia do celular quando dá, e cabe sempre na tela (rola por dentro).
 *
 * Nada é gravado sozinho: cada mudança vai para `aoMudar` (prévia ao vivo) e
 * só "Salvar" chama `aoSalvar`. Cancelar (ou Esc, ou clicar fora) desfaz.
 */
import { cssFundo, cssVisual, limparEstilo, SOMBRAS, type Estilo, type Visual } from "../data/estilo";

export type Parte = { k: string; nome: string; tipo: "card" | "botao" | "capa" | "texto"; exemplo?: string };
type Opcoes = {
  ancora: HTMLElement;
  titulo: string;
  partes: Parte[];
  valor: Estilo | null;
  aoMudar: (e: Estilo | null) => void;
  aoSalvar: (e: Estilo | null) => Promise<boolean>;
  aoFechar?: () => void;
};

const PRONTAS = ["#d4af37", "#c9a25c", "#f2d27a", "#8a6a2f", "#ffffff", "#f6eed7", "#b9b9b9", "#3a3a3a", "#0b0b0d", "#000000",
  "#8e6cc9", "#c7b0f0", "#4a78c2", "#7fa8e8", "#2f9c98", "#5fc7c2", "#4f9a5a", "#8fc27e", "#b8352d", "#e07a8a", "#ff6a00", "#ff1f8f"];
const DEGRADES: [string, string, number][] = [["#f2d27a", "#a8812f", 180], ["#d4af37", "#5a3d16", 135], ["#c7b0f0", "#4b2a8a", 135], ["#7fa8e8", "#1d3a6e", 135], ["#5fc7c2", "#13504d", 135], ["#e07a8a", "#5a1626", 135], ["#1c1430", "#08060d", 135], ["#2a2a2a", "#000000", 180]];

const h = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function hsvParaHex(hh: number, s: number, v: number) {
  const f = (n: number) => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
function hexParaHsv(c: string): [number, number, number] {
  const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
}

let aberto: { fechar: (salvou: boolean) => void } | null = null;
export const seletorAberto = () => !!aberto;
export function fecharSeletorEstilo() { aberto?.fechar(false); }

export function abrirSeletorEstilo(o: Opcoes) {
  aberto?.fechar(false);
  const inicial = JSON.stringify(o.valor || {});
  const est: Estilo = JSON.parse(inicial);
  let parte = o.partes[0].k;
  // Qual cor o quadro está editando agora: fundo.a, fundo.b, texto, borda ou sombra.
  let alvo = "fundo.a";
  let hsv: [number, number, number] = [40, 0.6, 0.8];
  let salvando = false;

  const caixa = document.createElement("div");
  caixa.className = "se-caixa"; caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-label", o.titulo);
  const fundoClique = document.createElement("div"); fundoClique.className = "se-fora";
  document.body.append(fundoClique, caixa);

  const V = (): Visual => (est[parte] ||= {});
  const tipo = () => o.partes.find((p) => p.k === parte)!.tipo;
  const corDoAlvo = (): string => {
    const v = V();
    if (alvo === "fundo.a") return v.fundo?.a || "#d4af37";
    if (alvo === "fundo.b") return v.fundo?.b || "#5a3d16";
    if (alvo === "texto") return v.texto || "#ffffff";
    if (alvo === "borda") return v.borda?.cor || "#d4af37";
    return v.sombra?.cor || "#000000";
  };
  function porCor(c: string) {
    const v = V();
    if (alvo === "fundo.a") v.fundo = { ...(v.fundo || { t: "cor" }), a: c } as Visual["fundo"];
    else if (alvo === "fundo.b") v.fundo = { t: "degrade", a: v.fundo?.a || "#d4af37", b: c, ang: v.fundo?.ang ?? 135 };
    else if (alvo === "texto") v.texto = c;
    else if (alvo === "borda") v.borda = { cor: c, w: v.borda?.w || 2 };
    else v.sombra = { n: v.sombra?.n || 2, cor: c };
  }
  const mudou = () => { o.aoMudar(limparEstilo(est)); };

  function amostra() {
    const v = est[parte], t = tipo();
    if (t === "texto") return `<span class="se-am se-am-txt" style="color:${v?.texto || "#f1e6c9"}"><b>Aa</b> Título e texto${o.partes.length === 1 && /cone/i.test(o.titulo) ? " · ✦ ▶ ☰" : ""}</span>`;
    const css = cssVisual(v, t).replace(/ !important/g, "");
    if (t === "capa") return `<span class="se-am se-am-capa" style="${h(css)}"><i></i></span>`;
    if (t === "card") return `<span class="se-am se-am-card" style="${h(css)}"><b>Título do card</b><em>Texto do card</em></span>`;
    return `<span class="se-am se-am-bt" style="${h(css)}">${h(o.partes.find((p) => p.k === parte)?.exemplo || "Ver aulas ›")}</span>`;
  }
  const chip = (k: string, cor: string, rot: string, vazio = false) =>
    `<button type="button" class="se-chip${alvo === k ? " on" : ""}${vazio ? " vazio" : ""}" data-se="alvo" data-v="${k}" title="Editar: ${rot}"><i style="background:${vazio ? "transparent" : cor}"></i>${rot}</button>`;

  function desenhar() {
    const v = V(), t = tipo(), f = v.fundo;
    const temFundo = t !== "capa" && t !== "texto", soCor = t === "texto";
    if (soCor) alvo = "texto";
    else if (!temFundo && alvo.startsWith("fundo")) alvo = "borda";
    if (alvo === "texto" && !temFundo && !soCor) alvo = "borda";
    hsv = hexParaHsv(corDoAlvo());
    const corAgora = corDoAlvo();
    const sec = alvo.startsWith("fundo") ? "fundo" : alvo;
    // O quadro de cor aparece logo embaixo do item que está sendo editado.
    const cor = (k: string) => (k === sec ? `
        <div class="se-cor">
          <span class="se-rot se-rot2">Escolha a cor <em>(${alvo === "fundo.a" ? (f?.t === "degrade" ? "cor 1 do degradê" : "preenchimento") : alvo === "fundo.b" ? "cor 2 do degradê" : alvo === "texto" ? "texto" : alvo === "borda" ? "contorno" : "sombra"})</em></span>
          <div class="se-sv" data-se-sv style="background:${hsvParaHex(hsv[0], 1, 1)}"><i style="left:${hsv[1] * 100}%;top:${(1 - hsv[2]) * 100}%"></i></div>
          <div class="se-hue" data-se-hue><i style="left:${(hsv[0] / 360) * 100}%"></i></div>
          <div class="se-hexl"><span class="se-hexam" style="background:${corAgora}"></span><input class="campo se-hex" value="${corAgora.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Código da cor" data-se="hex" />${"EyeDropper" in window ? `<button type="button" class="se-gota" data-se="gota" title="Pegar uma cor da tela"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5l5 5M17 2.5l4.5 4.5-3 3-4.5-4.5zM15.5 8.5L6 18l-2.5 2.5 2.5-.5L15.5 10.5"/></svg></button>` : ""}</div>
          <div class="se-prontas">${PRONTAS.map((c) => `<button type="button" data-se="pronta" data-v="${c}" title="${c.toUpperCase()}" style="background:${c}"${c === corAgora ? ' class="on"' : ""}></button>`).join("")}</div>
        </div>` : "");
    caixa.innerHTML = `
      <div class="se-cab"><b>${h(o.titulo)}</b><button type="button" class="se-x" data-se="cancelar" aria-label="Fechar">✕</button></div>
      ${o.partes.length > 1 ? `<div class="se-partes" role="tablist">${o.partes.map((p) => `<button type="button" role="tab" data-se="parte" data-v="${p.k}" aria-selected="${p.k === parte}">${h(p.nome)}${est[p.k] && Object.keys(est[p.k]!).length ? "<i></i>" : ""}</button>`).join("")}</div>` : ""}
      <div class="se-rolo">
        <div class="se-amostra">${amostra()}</div>
        ${soCor ? `<div class="se-sec"><span class="se-rot">Cor</span>
          <div class="se-chips">${chip("texto", v.texto || "#f1e6c9", v.texto ? "Cor escolhida" : "Cor do app (padrão)", !v.texto)}${v.texto ? `<button type="button" class="se-lnk" data-se="tirar" data-v="texto">Usar a do app</button>` : ""}</div>
          ${cor("texto")}</div>` : ""}
        ${temFundo ? `
        <div class="se-sec"><span class="se-rot">Preenchimento</span>
          <div class="se-seg">${[["padrao", "Padrão do app"], ["cor", "Cor sólida"], ["degrade", "Degradê"]].map(([k, n]) => `<button type="button" data-se="fundo-tipo" data-v="${k}" aria-pressed="${(f ? f.t : "padrao") === k}">${n}</button>`).join("")}</div>
          ${f ? `<div class="se-chips">${chip("fundo.a", f.a, f.t === "degrade" ? "Cor 1" : "Cor")}${f.t === "degrade" ? chip("fundo.b", f.b || "#5a3d16", "Cor 2") : ""}</div>` : ""}
          ${f?.t === "degrade" ? `<label class="se-linha"><span>Direção</span><input type="range" min="0" max="360" step="5" value="${f.ang ?? 135}" data-se="ang" /><em>${f.ang ?? 135}°</em></label>
            <div class="se-degs">${DEGRADES.map(([a, b, g], i) => `<button type="button" data-se="deg" data-v="${i}" title="Degradê pronto" style="background:${cssFundo({ t: "degrade", a, b, ang: g })}"></button>`).join("")}</div>` : ""}
          ${f ? cor("fundo") : ""}
        </div>
        <div class="se-sec"><span class="se-rot">Texto</span>
          <div class="se-chips">${chip("texto", v.texto || "#ffffff", v.texto ? "Cor do texto" : "Cor do texto (padrão)", !v.texto)}${v.texto ? `<button type="button" class="se-lnk" data-se="tirar" data-v="texto">Usar a do app</button>` : ""}</div>
          ${v.texto ? cor("texto") : ""}
        </div>` : ""}
        ${soCor ? "" : `<div class="se-sec"><span class="se-rot">Contorno</span>
          <div class="se-chips">${chip("borda", v.borda?.cor || "#d4af37", v.borda ? "Cor do contorno" : "Sem contorno escolhido", !v.borda)}${v.borda ? `<button type="button" class="se-lnk" data-se="tirar" data-v="borda">Usar o do app</button>` : ""}</div>
          ${v.borda ? `<label class="se-linha"><span>Espessura</span><input type="range" min="0" max="8" step="1" value="${v.borda.w}" data-se="bw" /><em>${v.borda.w ? v.borda.w + " px" : "Sem"}</em></label>` : ""}
          ${v.borda ? cor("borda") : ""}
        </div>
        <div class="se-sec"><span class="se-rot">Sombra</span>
          <div class="se-seg se-seg5">${SOMBRAS.map((n, i) => `<button type="button" data-se="sombra" data-v="${i}" aria-pressed="${(v.sombra ? v.sombra.n : -1) === i}">${n}</button>`).join("")}</div>
          ${v.sombra && v.sombra.n ? `<div class="se-chips">${chip("sombra", v.sombra.cor, "Cor da sombra")}<button type="button" class="se-lnk" data-se="tirar" data-v="sombra">Usar a do app</button></div>${cor("sombra")}` : ""}
        </div>
        <div class="se-sec"><span class="se-rot">Formato dos cantos</span>
          <div class="se-seg">${[["quadrado", "Quadrado"], ["arredondado", "Arredondado"], ["redondo", t === "botao" ? "Redondo" : "Bem arredondado"]].map(([k, n]) => `<button type="button" data-se="forma" data-v="${k}" aria-pressed="${v.forma === k}"><i class="se-forma se-f-${k}"></i>${n}</button>`).join("")}</div>
        </div>`}
        ${t === "botao" ? `<div class="se-sec"><span class="se-rot">Tamanho</span>
          <div class="se-seg">${[["p", "Menor"], ["m", "Normal"], ["g", "Maior"]].map(([k, n]) => `<button type="button" data-se="tam" data-v="${k}" aria-pressed="${(v.tam || "m") === k}">${n}</button>`).join("")}</div></div>` : ""}
      </div>
      <div class="se-pe">
        <button type="button" class="se-lnk" data-se="restaurar">Restaurar padrão</button>
        <span></span>
        <button type="button" class="al-botao" data-se="cancelar">Cancelar</button>
        <button type="button" class="al-botao-ouro" data-se="salvar"${salvando ? " disabled" : ""}>${salvando ? "Salvando…" : "Salvar"}</button>
      </div>`;
  }
  /** Atualiza só a amostra e o quadro (sem redesenhar tudo, para o arrasto ficar liso). */
  function leve() {
    const c = corDoAlvo();
    const am = caixa.querySelector(".se-amostra"); if (am) am.innerHTML = amostra();
    const sv = caixa.querySelector<HTMLElement>("[data-se-sv]"); if (sv) { sv.style.background = hsvParaHex(hsv[0], 1, 1); const i = sv.querySelector("i")!; i.style.left = hsv[1] * 100 + "%"; i.style.top = (1 - hsv[2]) * 100 + "%"; }
    const hu = caixa.querySelector<HTMLElement>("[data-se-hue] i"); if (hu) hu.style.left = (hsv[0] / 360) * 100 + "%";
    const hx = caixa.querySelector<HTMLInputElement>(".se-hex"); if (hx && document.activeElement !== hx) hx.value = c.toUpperCase();
    const ha = caixa.querySelector<HTMLElement>(".se-hexam"); if (ha) ha.style.background = c;
    const ch = caixa.querySelector<HTMLElement>(`.se-chip[data-v="${alvo}"] i`); if (ch) ch.style.background = c;
    mudou();
  }
  function posicionar() {
    const r = o.ancora.getBoundingClientRect(), W = Math.min(360, innerWidth - 16);
    caixa.style.width = W + "px";
    const alto = Math.min(caixa.scrollHeight, innerHeight - 24);
    // Prefere abrir à esquerda de quem chamou (a prévia do celular fica à direita); senão à direita; senão por cima.
    let x = r.left - W - 12;
    if (x < 8) x = r.right + 12;
    if (x + W > innerWidth - 8) x = Math.max(8, Math.min(innerWidth - W - 8, r.left));
    let y = r.top + r.height / 2 - alto / 2;
    y = Math.max(12, Math.min(innerHeight - alto - 12, y));
    Object.assign(caixa.style, { left: x + "px", top: y + "px", maxHeight: innerHeight - 24 + "px" });
  }
  function fechar(salvou: boolean) {
    if (!aberto) return;
    aberto = null;
    if (!salvou && JSON.stringify(est) !== inicial) o.aoMudar(limparEstilo(JSON.parse(inicial)));
    caixa.remove(); fundoClique.remove();
    removeEventListener("resize", posicionar); document.removeEventListener("keydown", tecla, true);
    o.aoFechar?.();
  }
  const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fechar(false); } };

  // Arrastar no quadro de cor e na barra de matiz.
  function arrastar(e: PointerEvent, el: HTMLElement, fn: (x: number, y: number) => void) {
    const mover = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); };
    mover(e);
    const solta = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", solta); };
    addEventListener("pointermove", mover); addEventListener("pointerup", solta);
  }
  caixa.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    const sv = t.closest<HTMLElement>("[data-se-sv]"), hu = t.closest<HTMLElement>("[data-se-hue]");
    if (sv) { e.preventDefault(); arrastar(e, sv, (x, y) => { hsv = [hsv[0], x, 1 - y]; porCor(hsvParaHex(...hsv)); leve(); }); }
    else if (hu) { e.preventDefault(); arrastar(e, hu, (x) => { hsv = [x * 359.9, hsv[1], hsv[2]]; porCor(hsvParaHex(...hsv)); leve(); }); }
  });
  caixa.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-se]"); if (!b) return;
    const a = b.dataset.se!, val = b.dataset.v || "", v = V();
    switch (a) {
      case "cancelar": fechar(false); return;
      case "parte": parte = val; alvo = tipo() === "texto" ? "texto" : tipo() === "capa" ? "borda" : "fundo.a"; break;
      case "alvo":
        alvo = val;
        // Escolher uma cor que ainda não existe já liga essa parte com uma cor de partida.
        if (val === "texto" && !v.texto) v.texto = "#ffffff";
        if (val === "borda" && !v.borda) v.borda = { cor: "#d4af37", w: 2 };
        mudou(); break;
      case "fundo-tipo":
        if (val === "padrao") { delete v.fundo; alvo = "texto"; }
        else if (val === "cor") { v.fundo = { t: "cor", a: v.fundo?.a || "#d4af37" }; alvo = "fundo.a"; }
        else { v.fundo = { t: "degrade", a: v.fundo?.a || "#f2d27a", b: v.fundo?.b || "#a8812f", ang: v.fundo?.ang ?? 135 }; alvo = "fundo.a"; }
        if (val === "padrao" && !v.texto) alvo = "borda";
        mudou(); break;
      case "deg": { const [x, y, g] = DEGRADES[Number(val)]; v.fundo = { t: "degrade", a: x, b: y, ang: g }; mudou(); break; }
      case "tirar": if (val === "texto") delete v.texto; else if (val === "borda") delete v.borda; else delete v.sombra; if (alvo === val) alvo = v.fundo ? "fundo.a" : "borda"; mudou(); break;
      case "sombra": { const n = Number(val); v.sombra = { n, cor: v.sombra?.cor || (n === 4 ? "#d4af37" : "#000000") }; if (n) alvo = "sombra"; mudou(); break; }
      case "forma": v.forma = v.forma === val ? null : (val as Visual["forma"]); mudou(); break;
      case "tam": v.tam = val as Visual["tam"]; mudou(); break;
      case "pronta": porCor(val); mudou(); break;
      case "restaurar": delete est[parte]; alvo = tipo() === "texto" ? "texto" : tipo() === "capa" ? "borda" : "fundo.a"; mudou(); break;
      case "gota": {
        const ED = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        void new ED().open().then((r) => { if (/^#[0-9a-f]{6}$/i.test(r.sRGBHex)) { porCor(r.sRGBHex.toLowerCase()); mudou(); desenhar(); posicionar(); } }).catch(() => {});
        return;
      }
      case "salvar": {
        if (salvando) return;
        salvando = true; desenhar();
        void o.aoSalvar(limparEstilo(est)).then((ok) => { salvando = false; if (ok) fechar(true); else desenhar(); });
        return;
      }
      default: return;
    }
    desenhar(); posicionar();
  });
  caixa.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement, v = V();
    if (t.dataset.se === "ang" && v.fundo) { v.fundo.ang = Number(t.value); (t.nextElementSibling as HTMLElement).textContent = t.value + "°"; leve(); }
    if (t.dataset.se === "bw" && v.borda) { v.borda.w = Number(t.value); (t.nextElementSibling as HTMLElement).textContent = Number(t.value) ? t.value + " px" : "Sem"; leve(); }
    if (t.dataset.se === "hex") { let x = t.value.trim(); if (!x.startsWith("#")) x = "#" + x; if (/^#[0-9a-f]{6}$/i.test(x)) { porCor(x.toLowerCase()); hsv = hexParaHsv(x.toLowerCase()); leve(); } }
  });
  fundoClique.addEventListener("pointerdown", () => fechar(false));
  addEventListener("resize", posicionar);
  document.addEventListener("keydown", tecla, true);
  aberto = { fechar };
  desenhar(); posicionar();
  caixa.querySelector<HTMLElement>(".se-partes button, .se-seg button")?.focus();
}
