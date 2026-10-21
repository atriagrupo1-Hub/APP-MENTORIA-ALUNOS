/*
 * Editor da foto da aluna, no painel: escolher, arrastar para centralizar
 * o rosto e aproximar. Mesmo recorte da área de membros (círculo, 320px),
 * para a foto sair igual nos dois lados.
 */

export type Ajuste = { w: number; h: number; z: number; x: number; y: number };
export type FotoPronta = { foto: string; original: string; ajuste: Ajuste };

const V = 240; // lado da janela de recorte, em px

/** Lê um arquivo de imagem e reduz para no máximo 1000px no lado maior. */
export function lerImagem(arquivo: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((ok, falha) => {
    const rd = new FileReader();
    rd.onerror = () => falha(new Error("Não deu para ler a imagem."));
    rd.onload = () => {
      const im = new Image();
      im.onerror = () => falha(new Error("Este arquivo não é uma imagem."));
      im.onload = () => {
        const k = Math.min(1, 1000 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        ok({ src: c.toDataURL("image/jpeg", 0.9), w: c.width, h: c.height });
      };
      im.src = String(rd.result);
    };
    rd.readAsDataURL(arquivo);
  });
}

/** Abre o editor. Resolve com a foto pronta, ou null se cancelar. */
export function editarFoto(src: string, a: Ajuste, nome: string, trocar: () => void): Promise<FotoPronta | null> {
  return new Promise((resolve) => {
    const F = { ...a };
    const base = () => V / Math.min(F.w, F.h);
    const fundo = document.createElement("div");
    fundo.className = "ef-fundo";
    fundo.innerHTML = `
      <div class="ef-caixa" role="dialog" aria-modal="true" aria-label="Ajustar a foto de ${nome.replace(/[<>&"]/g, "")}">
        <h2>Ajustar foto</h2>
        <p>Arraste a foto para centralizar o rosto. Use a barra para aproximar.</p>
        <div class="ef-janela"><img class="ef-img" alt="" draggable="false" /></div>
        <div class="ef-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="3" step="0.01" aria-label="Aproximar a foto" /><span aria-hidden="true">+</span></div>
        <button type="button" class="ef-trocar">Escolher outra foto</button>
        <div class="ef-botoes"><button type="button" class="botao-neutro grande ef-cancelar">Cancelar</button><button type="button" class="al-botao-ouro ef-salvar">Salvar foto</button></div>
      </div>`;
    document.body.append(fundo);
    const im = fundo.querySelector<HTMLImageElement>(".ef-img")!;
    const jan = fundo.querySelector<HTMLElement>(".ef-janela")!;
    const zoom = fundo.querySelector<HTMLInputElement>('input[type="range"]')!;
    const limitar = () => {
      const sc = base() * F.z, mx = Math.max(0, (F.w * sc - V) / 2), my = Math.max(0, (F.h * sc - V) / 2);
      F.x = Math.max(-mx, Math.min(mx, F.x)); F.y = Math.max(-my, Math.min(my, F.y));
    };
    const desenhar = () => {
      limitar(); const sc = base() * F.z;
      im.style.width = F.w * sc + "px"; im.style.height = F.h * sc + "px";
      im.style.transform = `translate(calc(-50% + ${F.x}px), calc(-50% + ${F.y}px))`;
      zoom.value = String(F.z);
    };
    const fechar = (r: FotoPronta | null) => { fundo.remove(); document.removeEventListener("keydown", esc); resolve(r); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(null); };
    document.addEventListener("keydown", esc);
    im.src = src; if (im.complete) desenhar(); else im.onload = desenhar;
    let arr: { px: number; py: number; x: number; y: number } | null = null;
    jan.addEventListener("pointerdown", (e) => { arr = { px: e.clientX, py: e.clientY, x: F.x, y: F.y }; jan.setPointerCapture(e.pointerId); });
    jan.addEventListener("pointermove", (e) => { if (!arr) return; F.x = arr.x + (e.clientX - arr.px); F.y = arr.y + (e.clientY - arr.py); desenhar(); });
    jan.addEventListener("pointerup", () => { arr = null; }); jan.addEventListener("pointercancel", () => { arr = null; });
    jan.addEventListener("wheel", (e) => { e.preventDefault(); F.z = Math.max(1, Math.min(3, F.z - e.deltaY * 0.002)); desenhar(); }, { passive: false });
    zoom.addEventListener("input", () => { F.z = +zoom.value; desenhar(); });
    fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(null); });
    fundo.querySelector(".ef-cancelar")!.addEventListener("click", () => fechar(null));
    fundo.querySelector(".ef-trocar")!.addEventListener("click", () => { fechar(null); trocar(); });
    fundo.querySelector(".ef-salvar")!.addEventListener("click", () => {
      const t = 320, sc = base() * F.z, k = t / V, dw = F.w * sc * k, dh = F.h * sc * k;
      const c = document.createElement("canvas"); c.width = t; c.height = t;
      c.getContext("2d")!.drawImage(im, t / 2 - dw / 2 + F.x * k, t / 2 - dh / 2 + F.y * k, dw, dh);
      fechar({ foto: c.toDataURL("image/jpeg", 0.88), original: src, ajuste: { ...F } });
    });
  });
}
