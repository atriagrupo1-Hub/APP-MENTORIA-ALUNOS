/*
 * Editor de capa (categoria, curso, módulo, aula, destaque): arrastar a
 * imagem para os lados, aproximar ou afastar com a barra (ou a roda do
 * mouse) e salvar o recorte no formato da capa. Devolve um arquivo novo,
 * pronto para enviar; a imagem original não é alterada.
 */

/** Abre o editor. `fonte` é um arquivo novo ou o endereço da capa atual. Resolve com o recorte, ou null se cancelar. */
export function editarCapa(fonte: File | string, proporcao: number, nome = "capa"): Promise<File | null> {
  return new Promise((resolve) => {
    const W = Math.min(620, window.innerWidth - 64), H = Math.round(W / proporcao) > 460 ? 460 : Math.round(W / proporcao);
    const JW = proporcao * H < W ? Math.round(proporcao * H) : W, JH = Math.round(JW / proporcao);
    const F = { w: 1, h: 1, z: 1, x: 0, y: 0 };
    const fundo = document.createElement("div");
    fundo.className = "ec-fundo";
    fundo.innerHTML = `
      <div class="ec-caixa" role="dialog" aria-modal="true" aria-label="Editar a capa">
        <h2>Editar capa</h2>
        <p>Arraste a imagem para os lados. Use a barra (ou a roda do mouse) para aproximar ou afastar.</p>
        <div class="ec-janela" style="width:${JW}px;height:${JH}px"><img class="ec-img" alt="" draggable="false" /></div>
        <div class="ec-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Aproximar ou afastar" /><span aria-hidden="true">+</span></div>
        <div class="ec-botoes">
          <button type="button" class="botao-neutro grande ec-centro">Centralizar</button>
          <span style="flex:1"></span>
          <button type="button" class="botao-neutro grande ec-cancelar">Cancelar</button>
          <button type="button" class="al-botao-ouro ec-salvar">Salvar capa</button>
        </div>
        <p class="ec-erro" hidden></p>
      </div>`;
    document.body.append(fundo);
    const im = fundo.querySelector<HTMLImageElement>(".ec-img")!;
    const jan = fundo.querySelector<HTMLElement>(".ec-janela")!;
    const zoom = fundo.querySelector<HTMLInputElement>('input[type="range"]')!;
    const erro = fundo.querySelector<HTMLElement>(".ec-erro")!;
    // Escala em que a imagem cobre a janela inteira (zoom 1).
    const base = () => Math.max(JW / F.w, JH / F.h);
    const limitar = () => {
      const sc = base() * F.z, mx = Math.max(0, (F.w * sc - JW) / 2), my = Math.max(0, (F.h * sc - JH) / 2);
      F.x = Math.max(-mx, Math.min(mx, F.x)); F.y = Math.max(-my, Math.min(my, F.y));
    };
    const desenhar = () => {
      limitar(); const sc = base() * F.z;
      im.style.width = F.w * sc + "px"; im.style.height = F.h * sc + "px";
      im.style.transform = `translate(calc(-50% + ${F.x}px), calc(-50% + ${F.y}px))`;
      zoom.value = String(F.z);
    };
    let url = "";
    const fechar = (r: File | null) => { fundo.remove(); document.removeEventListener("keydown", esc); if (url) URL.revokeObjectURL(url); resolve(r); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(null); };
    document.addEventListener("keydown", esc);
    im.crossOrigin = "anonymous";
    im.onload = () => { F.w = im.naturalWidth; F.h = im.naturalHeight; desenhar(); };
    im.onerror = () => { erro.hidden = false; erro.textContent = "Não deu para abrir esta imagem."; };
    if (typeof fonte === "string") im.src = fonte; else { url = URL.createObjectURL(fonte); im.src = url; }
    let arr: { px: number; py: number; x: number; y: number } | null = null;
    jan.addEventListener("pointerdown", (e) => { arr = { px: e.clientX, py: e.clientY, x: F.x, y: F.y }; jan.setPointerCapture(e.pointerId); });
    jan.addEventListener("pointermove", (e) => { if (!arr) return; F.x = arr.x + (e.clientX - arr.px); F.y = arr.y + (e.clientY - arr.py); desenhar(); });
    jan.addEventListener("pointerup", () => { arr = null; }); jan.addEventListener("pointercancel", () => { arr = null; });
    jan.addEventListener("wheel", (e) => { e.preventDefault(); F.z = Math.max(1, Math.min(4, F.z - e.deltaY * 0.002)); desenhar(); }, { passive: false });
    zoom.addEventListener("input", () => { F.z = +zoom.value; desenhar(); });
    fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(null); });
    fundo.querySelector(".ec-centro")!.addEventListener("click", () => { F.z = 1; F.x = 0; F.y = 0; desenhar(); });
    fundo.querySelector(".ec-cancelar")!.addEventListener("click", () => fechar(null));
    fundo.querySelector(".ec-salvar")!.addEventListener("click", () => {
      // Saída em boa resolução, no formato da capa.
      const TW = proporcao >= 1 ? 1920 : 1024, TH = Math.round(TW / proporcao), k = TW / JW;
      const sc = base() * F.z, dw = F.w * sc * k, dh = F.h * sc * k;
      const c = document.createElement("canvas"); c.width = TW; c.height = TH;
      const g = c.getContext("2d")!; g.imageSmoothingQuality = "high";
      g.drawImage(im, TW / 2 - dw / 2 + F.x * k, TH / 2 - dh / 2 + F.y * k, dw, dh);
      try {
        c.toBlob((b) => {
          if (!b) { erro.hidden = false; erro.textContent = "Não deu para salvar o recorte."; return; }
          fechar(new File([b], nome.replace(/\.[a-z0-9]+$/i, "") + ".webp", { type: "image/webp" }));
        }, "image/webp", 0.9);
      } catch { erro.hidden = false; erro.textContent = "Esta imagem não pode ser editada aqui. Use Alterar para enviar de novo."; }
    });
  });
}
