/**
 * Seletor de estilo do painel: escolhe qualquer cor (quadro de cor + matiz +
 * código), degradê, cor do texto, contorno, sombra, tamanho e formato de um
 * card, botão ou capa. Abre flutuando ao lado de quem chamou, sem cobrir a
 * prévia do celular quando dá, e cabe sempre na tela (rola por dentro).
 *
 * Nada é gravado sozinho: cada mudança vai para `aoMudar` (prévia ao vivo) e
 * só "Salvar" chama `aoSalvar`. Cancelar (ou Esc, ou clicar fora) desfaz.
 */
import { abrirListaFontes, abrirQuadroCor, fecharFlutuante, flutuanteDe } from "./flutuante";
import { carregarFontes } from "../data/aparencia";
import { cssFundo, cssVisual, ESTILOS_BORDA, FONTES_APP, limparEstilo, SOMBRAS, type BordaEst, type SombraCx, type Estilo, type Visual } from "../data/estilo";

export type Parte = { k: string; nome: string; tipo: "card" | "botao" | "capa" | "texto"; exemplo?: string; fonte?: boolean };
type Opcoes = {
  ancora: HTMLElement;
  titulo: string;
  partes: Parte[];
  valor: Estilo | null;
  aoMudar: (e: Estilo | null) => void;
  aoSalvar: (e: Estilo | null) => Promise<boolean>;
  aoFechar?: () => void;
};

const DEGRADES: [string, string, number][] = [["#f2d27a", "#a8812f", 180], ["#d4af37", "#5a3d16", 135], ["#c7b0f0", "#4b2a8a", 135], ["#7fa8e8", "#1d3a6e", 135], ["#5fc7c2", "#13504d", 135], ["#e07a8a", "#5a1626", 135], ["#1c1430", "#08060d", 135], ["#2a2a2a", "#000000", 180]];

const h = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
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
    if (t === "texto") return `<span class="se-am se-am-txt" style="color:${v?.texto || "#f1e6c9"}${v?.fonte ? `;font-family:'${v.fonte}', Georgia, serif` : ""}"><b>Aa</b> Título e texto${o.partes.length === 1 && /cone/i.test(o.titulo) ? " · ✦ ▶ ☰" : ""}</span>`;
    const css = cssVisual(v, t).replace(/ !important/g, "");
    if (t === "capa") return `<span class="se-am se-am-capa" style="${h(css)}"><i></i></span>`;
    if (t === "card") return `<span class="se-am se-am-card" style="${h(css)}"><b>Título do card</b><em>Texto do card</em></span>`;
    return `<span class="se-am se-am-bt" style="${h(css)}">${h(o.partes.find((p) => p.k === parte)?.exemplo || "Ver aulas ›")}</span>`;
  }
  const chip = (k: string, cor: string, rot: string, vazio = false) =>
    `<button type="button" class="se-chip${alvo === k ? " on" : ""}${vazio ? " vazio" : ""}" data-se="alvo" data-v="${k}" title="Editar: ${rot}"><i style="background:${vazio ? "transparent" : cor}"></i>${rot}</button>`;

  // ——— Card (editor novo, no modelo do Elementor): começa pela Borda ———
  const LAPIS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>`;
  const REFAZ = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>`;
  const nomeBorda = (k: string) => ESTILOS_BORDA.find(([x]) => x === k)?.[1] || "";
  function resumoBorda(v: Visual) {
    const r: string[] = [];
    if (v.bordaEst) r.push(v.bordaEst.estilo === "none" ? "Oculta" : `${nomeBorda(v.bordaEst.estilo)} · ${new Set(v.bordaEst.w).size === 1 ? v.bordaEst.w[0] + " px" : v.bordaEst.w.join("/") + " px"} · ${v.bordaEst.cor.toUpperCase()}`);
    if (v.raio) r.push("cantos " + (new Set(v.raio).size === 1 ? v.raio[0] + " px" : v.raio.join("/") + " px"));
    return r.length ? r.join(" · ") : "Padrão do app";
  }
  const resumoSombra = (v: Visual) => { const s = v.sombraCx; return s ? `${s.inset ? "Dentro" : "Fora"} · ${s.x}/${s.y} px · desfoque ${s.blur} · ${s.cor.toUpperCase()} ${s.a}%` : "Padrão do app"; };
  function secoesCard(v: Visual) {
    const mexido = !!(v.bordaEst || v.raio);
    return `<div class="se-sec se-row">
        <span class="se-row-t"><b>Borda</b><small data-se-resumo>${h(resumoBorda(v))}</small></span>
        <span class="se-row-bts"><button type="button" class="se-ic" data-se="borda-rest" title="Voltar a borda ao padrão" aria-label="Voltar a borda ao padrão"${mexido ? "" : " disabled"}>${REFAZ}</button><button type="button" class="se-ic" data-se="borda-ed" title="Editar a borda" aria-label="Editar a borda" aria-haspopup="dialog" aria-expanded="false">${LAPIS}</button></span>
      </div>
      <div class="se-sec se-row">
        <span class="se-row-t"><b>Sombra da caixa</b><small data-se-resumo-s>${h(resumoSombra(v))}</small></span>
        <span class="se-row-bts"><button type="button" class="se-ic" data-se="sombra-rest" title="Voltar a sombra ao padrão" aria-label="Voltar a sombra ao padrão"${v.sombraCx ? "" : " disabled"}>${REFAZ}</button><button type="button" class="se-ic" data-se="sombra-ed" title="Editar a sombra da caixa" aria-label="Editar a sombra da caixa" aria-haspopup="dialog" aria-expanded="false">${LAPIS}</button></span>
      </div>`;
  }
  /** Painel flutuante da Borda: estilo, largura, cor e cantos. */
  let painelBorda: HTMLElement | null = null, painelTipo = "";
  function fecharBorda() {
    if (!painelBorda) return;
    painelBorda.remove(); painelBorda = null; fecharFlutuante(false);
    removeEventListener("pointerdown", foraBorda, true); removeEventListener("keydown", teclaBorda, true);
    caixa.querySelectorAll('[data-se="borda-ed"], [data-se="sombra-ed"]').forEach((x) => x.setAttribute("aria-expanded", "false"));
  }
  const foraBorda = (e: PointerEvent) => { const t = e.target as HTMLElement; if (painelBorda && !painelBorda.contains(t) && !t.closest(".fc-pop, [data-se='borda-ed'], [data-se='sombra-ed']")) fecharBorda(); };
  const teclaBorda = (e: KeyboardEvent) => { if (e.key === "Escape" && painelBorda && !document.querySelector(".fc-pop")) { e.stopImmediatePropagation(); e.preventDefault(); fecharBorda(); } };
  function abrirBorda(g: HTMLElement) {
    if (painelBorda) { const era = painelTipo; fecharBorda(); if (era === "borda") return; }
    painelTipo = "borda";
    const v = V();
    const el = document.createElement("div"); el.className = "se-pop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Borda");
    const lados = ["Topo", "Direita", "Baixo", "Esquerda"], cantos = ["Topo esq.", "Topo dir.", "Baixo dir.", "Baixo esq."];
    const quatro = (nome: string, rot: string[], val: number[], dis = false) => `<div class="se-4">${rot.map((r, i) => `<label><input class="campo" type="number" min="0" max="${nome === "w" ? 20 : 200}" inputmode="numeric" data-sb="${nome}" data-i="${i}" value="${val[i]}"${dis ? " disabled" : ""} /><span>${r}</span></label>`).join("")}</div>`;
    const pintar = () => {
      const b = v.bordaEst, ativo = !!b && b.estilo !== "none";
      el.innerHTML = `
        <label class="se-pop-l"><span>Estilo de borda</span><select class="campo" data-sb="estilo"><option value=""${b ? "" : " selected"}>Padrão do app</option>${ESTILOS_BORDA.map(([k, n]) => `<option value="${k}"${b?.estilo === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="se-pop-b${ativo ? "" : " off"}">
          <span class="se-pop-r">Largura (px)</span>${quatro("w", lados, b?.w || [1, 1, 1, 1], !ativo)}
          <div class="se-pop-l se-pop-cor"><span>Cor</span><span><button type="button" class="se-pop-bola" data-sb="cor" style="background:${b?.cor || "#d4af37"}" aria-label="Cor da borda" aria-haspopup="dialog" aria-expanded="false"${ativo ? "" : " disabled"}></button><input class="campo se-pop-hex" data-sb="hex" maxlength="7" spellcheck="false" value="${(b?.cor || "#d4af37").toUpperCase()}"${ativo ? "" : " disabled"} /></span></div>
        </div>
        <span class="se-pop-r">Arredondar cantos (px)</span>${quatro("r", cantos, v.raio || [0, 0, 0, 0])}`;
    };
    const aplicarB = () => {
      leve();
      const rs = caixa.querySelector("[data-se-resumo]"); if (rs) rs.textContent = resumoBorda(v);
      const rb = caixa.querySelector<HTMLButtonElement>('[data-se="borda-rest"]'); if (rb) rb.disabled = !(v.bordaEst || v.raio);
    };
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.sb === "estilo") {
        if (!t.value) delete v.bordaEst;
        else v.bordaEst = { estilo: t.value as BordaEst["estilo"], w: v.bordaEst?.w || [1, 1, 1, 1], cor: v.bordaEst?.cor || "#d4af37" };
        pintar(); aplicarB();
      }
    });
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement, sb = t.dataset.sb, i = Number(t.dataset.i);
      const n = Math.max(0, Math.min(sb === "w" ? 20 : 200, Math.round(Number(t.value) || 0)));
      if (sb === "w" && v.bordaEst) { v.bordaEst.w[i] = n; aplicarB(); }
      else if (sb === "r") { const r = v.raio || [0, 0, 0, 0]; r[i] = n; v.raio = r; aplicarB(); }
      else if (sb === "hex" && v.bordaEst) { let x = t.value.trim(); if (!x.startsWith("#")) x = "#" + x; if (/^#[0-9a-f]{6}$/i.test(x)) { v.bordaEst.cor = x.toLowerCase(); el.querySelector<HTMLElement>(".se-pop-bola")!.style.background = v.bordaEst.cor; aplicarB(); } }
    });
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sb="cor"]'); if (!b || !v.bordaEst) return;
      abrirQuadroCor(b, { cor: v.bordaEst.cor, aoMudar: (c) => { if (!v.bordaEst) return; v.bordaEst.cor = c; b.style.background = c; const hx = el.querySelector<HTMLInputElement>(".se-pop-hex"); if (hx) hx.value = c.toUpperCase(); aplicarB(); } });
    });
    pintar(); document.body.append(el); painelBorda = el; g.setAttribute("aria-expanded", "true");
    // Abre ao lado do seletor, alinhado ao lápis, sem cobrir o seletor.
    const r = g.getBoundingClientRect(), c = caixa.getBoundingClientRect(), W = 320, H = el.offsetHeight;
    let x = c.left - W - 10; if (x < 8) x = Math.min(innerWidth - W - 8, c.right + 10);
    Object.assign(el.style, { width: W + "px", left: x + "px", top: Math.max(8, Math.min(innerHeight - H - 8, r.top - 20)) + "px" });
    addEventListener("pointerdown", foraBorda, true); addEventListener("keydown", teclaBorda, true);
    el.querySelector<HTMLElement>("select")?.focus();
  }

  /** Painel flutuante da Sombra da caixa: cor (com transparência), horizontal, vertical, desfocar, espalhar e posição. */
  const SOMBRA_PAD: SombraCx = { cor: "#000000", a: 40, x: 0, y: 8, blur: 24, esp: 0, inset: false };
  function abrirSombra(g: HTMLElement) {
    if (painelBorda) { const era = painelTipo; fecharBorda(); if (era === "sombra") return; }
    painelTipo = "sombra";
    const v = V(), sv = (): SombraCx => v.sombraCx || { ...SOMBRA_PAD };
    const el = document.createElement("div"); el.className = "se-pop se-pop-sombra"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Sombra da caixa");
    const GOTA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5l5 5M17 2.5l4.5 4.5-3 3-4.5-4.5zM15.5 8.5L6 18l-2.5 2.5 2.5-.5L15.5 10.5"/></svg>`;
    const regua = (k: keyof SombraCx, nome: string, min: number, max: number) => `<div class="se-pop-reg"><span class="se-pop-r">${nome}<button type="button" class="se-mini-rest" data-ss-rest="${k}" title="Voltar ao padrão" aria-label="Voltar ${nome} ao padrão">${REFAZ}</button></span><div class="se-pop-rl"><input type="range" min="${min}" max="${max}" data-ss="${k}" aria-label="${nome}" /><input class="campo" type="number" min="${min}" max="${max}" data-ssn="${k}" aria-label="${nome} (número)" /></div></div>`;
    el.innerHTML = `
      <div class="se-pop-l"><span>Cor</span><span>${"EyeDropper" in window ? `<button type="button" class="se-mini-rest se-gota2" data-ss-gota title="Pegar uma cor da tela" aria-label="Pegar uma cor da tela">${GOTA}</button>` : ""}<button type="button" class="se-pop-bola" data-ss-cor aria-label="Cor da sombra" aria-haspopup="dialog" aria-expanded="false"></button></span></div>
      ${regua("x", "Horizontal", -100, 100)}${regua("y", "Vertical", -100, 100)}${regua("blur", "Desfocar", 0, 100)}${regua("esp", "Espalhar", -100, 100)}
      <label class="se-pop-l se-pop-pos"><span>Posição</span><select class="campo" data-ss-pos><option value="fora">Fora (outline)</option><option value="dentro">Dentro (inset)</option></select></label>`;
    const pintar = () => {
      const s = sv();
      el.querySelector<HTMLElement>("[data-ss-cor]")!.style.background = `linear-gradient(${s.cor}${Math.round(s.a * 2.55).toString(16).padStart(2, "0")}, ${s.cor}${Math.round(s.a * 2.55).toString(16).padStart(2, "0")}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/10px 10px`;
      (["x", "y", "blur", "esp"] as const).forEach((k) => { const r = el.querySelector<HTMLInputElement>(`[data-ss="${k}"]`)!, n = el.querySelector<HTMLInputElement>(`[data-ssn="${k}"]`)!; r.value = String(s[k]); if (document.activeElement !== n) n.value = String(s[k]); });
      el.querySelector<HTMLSelectElement>("[data-ss-pos]")!.value = s.inset ? "dentro" : "fora";
    };
    const mudar = (fn: (s: SombraCx) => void) => {
      const s = sv(); fn(s); v.sombraCx = s; pintar(); leve();
      const rs = caixa.querySelector("[data-se-resumo-s]"); if (rs) rs.textContent = resumoSombra(v);
      const rb = caixa.querySelector<HTMLButtonElement>('[data-se="sombra-rest"]'); if (rb) rb.disabled = false;
    };
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement, k = (t.dataset.ss || t.dataset.ssn) as "x" | "y" | "blur" | "esp" | undefined;
      if (k && t.value !== "" && t.value !== "-") mudar((s) => { s[k] = Number(t.value); });
    });
    el.addEventListener("change", (e) => { const t = e.target as HTMLSelectElement; if (t.matches("[data-ss-pos]")) mudar((s) => { s.inset = t.value === "dentro"; }); });
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement, rest = t.closest<HTMLElement>("[data-ss-rest]");
      if (rest) { const k = rest.dataset.ssRest as "x" | "y" | "blur" | "esp"; mudar((s) => { s[k] = SOMBRA_PAD[k]; }); return; }
      const bola = t.closest<HTMLElement>("[data-ss-cor]");
      if (bola) { const s = sv(); abrirQuadroCor(bola, { cor: s.cor, alfa: s.a, aoMudar: (c) => mudar((x) => { x.cor = c; }), aoAlfa: (a) => mudar((x) => { x.a = a; }) }); return; }
      if (t.closest("[data-ss-gota]")) {
        const ED = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        void new ED().open().then((r) => { if (/^#[0-9a-f]{6}$/i.test(r.sRGBHex)) mudar((x) => { x.cor = r.sRGBHex.toLowerCase(); }); }).catch(() => {});
      }
    });
    pintar(); document.body.append(el); painelBorda = el; g.setAttribute("aria-expanded", "true");
    const r = g.getBoundingClientRect(), c = caixa.getBoundingClientRect(), W = 320, H = el.offsetHeight;
    let x = c.left - W - 10; if (x < 8) x = Math.min(innerWidth - W - 8, c.right + 10);
    Object.assign(el.style, { width: W + "px", left: x + "px", top: Math.max(8, Math.min(innerHeight - H - 8, r.top - 40)) + "px" });
    addEventListener("pointerdown", foraBorda, true); addEventListener("keydown", teclaBorda, true);
  }

  function desenhar() {
    const v = V(), t = tipo(), f = v.fundo;
    const temFundo = t !== "capa" && t !== "texto", soCor = t === "texto";
    if (soCor) alvo = "texto";
    else if (!temFundo && alvo.startsWith("fundo")) alvo = "borda";
    if (alvo === "texto" && !temFundo && !soCor) alvo = "borda";
    // A cor abre flutuando presa ao botão da cor (o seletor não cresce).
    const cor = (_k: string) => "";
    const SETA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
    const parteAtual = o.partes.find((p) => p.k === parte);
    caixa.innerHTML = `
      <div class="se-cab"><b>${h(o.titulo)}</b><button type="button" class="se-x" data-se="cancelar" aria-label="Fechar">✕</button></div>
      ${o.partes.length > 1 ? `<div class="se-partes" role="tablist">${o.partes.map((p) => `<button type="button" role="tab" data-se="parte" data-v="${p.k}" aria-selected="${p.k === parte}">${h(p.nome)}${est[p.k] && Object.keys(est[p.k]!).length ? "<i></i>" : ""}</button>`).join("")}</div>` : ""}
      <div class="se-rolo">
        <div class="se-amostra">${amostra()}</div>
        ${t === "card" ? secoesCard(v) : `
        ${soCor ? `<div class="se-sec"><span class="se-rot">Cor</span>
          <div class="se-chips">${chip("texto", v.texto || "#f1e6c9", v.texto ? "Cor escolhida" : "Cor do app (padrão)", !v.texto)}${v.texto ? `<button type="button" class="se-lnk" data-se="tirar" data-v="texto">Usar a do app</button>` : ""}</div>
          ${cor("texto")}
          ${parteAtual?.fonte ? `<span class="se-rot se-rot-f">Fonte</span><button type="button" class="fc-sel se-fonte" data-se="fonte" aria-haspopup="listbox" aria-expanded="false"><span class="fc-sel-t"${v.fonte ? ` style="font-family:'${v.fonte}', Georgia, serif"` : ""}>${h(v.fonte || "Fonte do app (padrão)")}</span>${SETA}</button>` : ""}</div>` : ""}
        ${temFundo ? `
        <div class="se-sec"><span class="se-rot">Preenchimento</span>
          <div class="se-seg">${[["padrao", "Padrão do app"], ["cor", "Cor sólida"], ["degrade", "Degradê"]].map(([k, n]) => `<button type="button" data-se="fundo-tipo" data-v="${k}" aria-pressed="${(f ? f.t : "padrao") === k}">${n}</button>`).join("")}</div>
          ${f ? `<div class="se-chips">${chip("fundo.a", f.a, f.t === "degrade" ? "Cor 1" : "Cor")}${f.t === "degrade" ? chip("fundo.b", f.b || "#5a3d16", "Cor 2") : ""}</div>` : ""}
          ${f?.t === "degrade" ? `<label class="se-linha"><span>Direção</span><input type="range" min="0" max="360" step="5" value="${f.ang ?? 135}" data-se="ang" /><em>${f.ang ?? 135}°</em></label>
            <div class="se-codl"><code>${h(cssFundo(f))}</code><button type="button" class="se-lnk" data-se="copiar-deg">Copiar código</button></div>
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
        `}
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
    const am = caixa.querySelector(".se-amostra"); if (am) am.innerHTML = amostra();
    const ch = caixa.querySelector<HTMLElement>(`.se-chip[data-v="${alvo}"] i`); if (ch) ch.style.background = corDoAlvo();
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
    aberto = null; fecharBorda(); fecharFlutuante(false);
    // Primeiro some da tela (nada pode ficar cobrindo o painel), depois avisa quem abriu.
    caixa.remove(); fundoClique.remove();
    removeEventListener("resize", posicionar); document.removeEventListener("keydown", tecla, true);
    try { if (!salvou && JSON.stringify(est) !== inicial) o.aoMudar(limparEstilo(JSON.parse(inicial))); } catch { /* a prévia se ajeita no próximo envio */ }
    try { o.aoFechar?.(); } catch { /* idem */ }
  }
  const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fechar(false); } };

  /** Abre o seletor de cor flutuante preso ao botão da cor que está sendo editada. */
  function abrirCor() {
    const g = caixa.querySelector<HTMLElement>(`.se-chip[data-v="${alvo}"]`); if (!g) return;
    abrirQuadroCor(g, { cor: corDoAlvo(), aoMudar: (c) => { porCor(c); leve(); } });
  }
  caixa.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-se]"); if (!b) return;
    const a = b.dataset.se!, val = b.dataset.v || "", v = V();
    switch (a) {
      case "cancelar": fechar(false); return;
      case "parte": parte = val; alvo = tipo() === "texto" ? "texto" : tipo() === "capa" ? "borda" : "fundo.a"; break;
      case "alvo":
        if (flutuanteDe(b)) { fecharFlutuante(); return; }
        alvo = val;
        // Escolher uma cor que ainda não existe já liga essa parte com uma cor de partida.
        if (val === "texto" && !v.texto) v.texto = "#ffffff";
        if (val === "borda" && !v.borda) v.borda = { cor: "#d4af37", w: 2 };
        mudou(); desenhar(); posicionar(); abrirCor(); return;
      case "borda-ed": abrirBorda(b); return;
      case "borda-rest": fecharBorda(); delete v.bordaEst; delete v.raio; mudou(); break;
      case "sombra-ed": abrirSombra(b); return;
      case "sombra-rest": fecharBorda(); delete v.sombraCx; mudou(); break;
      case "fonte":
        abrirListaFontes(b, {
          fontes: FONTES_APP, atual: v.fonte || "", padrao: "Fonte do app (padrão)",
          aoPrevia: (x) => { const s2 = caixa.querySelector<HTMLElement>(".se-am-txt"); if (s2) s2.style.fontFamily = x ? `'${x}', Georgia, serif` : v.fonte ? `'${v.fonte}', Georgia, serif` : ""; },
          aoEscolher: (x) => { if (x) v.fonte = x; else delete v.fonte; mudou(); desenhar(); posicionar(); caixa.querySelector<HTMLElement>(".se-fonte")?.focus(); },
        });
        carregarFontes(FONTES_APP);
        return;
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
      case "copiar": case "copiar-deg": {
        const txt = a === "copiar" ? corDoAlvo().toUpperCase() : v.fundo ? cssFundo(v.fundo) : "";
        void navigator.clipboard?.writeText(txt).then(() => { b.textContent = a === "copiar" ? "✓" : "Copiado ✓"; setTimeout(() => desenhar(), 900); }).catch(() => {});
        return;
      }
      case "restaurar": delete est[parte]; alvo = tipo() === "texto" ? "texto" : tipo() === "capa" ? "borda" : "fundo.a"; mudou(); break;
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
  });
  fundoClique.addEventListener("pointerdown", () => fechar(false));
  addEventListener("resize", posicionar);
  document.addEventListener("keydown", tecla, true);
  aberto = { fechar };
  desenhar(); posicionar();
  caixa.querySelector<HTMLElement>(".se-partes button, .se-seg button")?.focus();
}
