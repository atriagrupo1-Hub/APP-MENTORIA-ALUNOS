/**
 * PDF no navegador (carregado só quando a equipe usa):
 * - textoDoPdf: tira o texto de cada página, para a IA ler rápido sem subir o arquivo.
 * - reduzirPdf: redesenha cada página como imagem leve (JPEG) e monta um PDF novo,
 *   bem menor, bom para baixar no celular. O texto do PDF reduzido vira imagem.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Prog = (feitas: number, total: number) => void;

async function abrir(f: File) {
  return pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
}

async function textoDaPagina(pg: pdfjs.PDFPageProxy) {
  const c = await pg.getTextContent();
  return c.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
}

export async function textoDoPdf(f: File, prog?: Prog): Promise<{ texto: string; paginas: number }> {
  const doc = await abrir(f);
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    partes.push(await textoDaPagina(pg));
    pg.cleanup();
    prog?.(i, doc.numPages);
  }
  const paginas = doc.numPages;
  await doc.destroy();
  return { texto: partes.filter(Boolean).join("\n\n"), paginas };
}

/** Largura alvo ~1240 px (A4 a 150 dpi) e JPEG 72%: lê bem no celular e fica leve. */
export async function reduzirPdf(f: File, prog?: Prog): Promise<{ arquivo: File; texto: string; paginas: number }> {
  const doc = await abrir(f);
  const novo = await PDFDocument.create();
  const partes: string[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    partes.push(await textoDaPagina(pg));
    const base = pg.getViewport({ scale: 1 });
    const escala = Math.min(2, Math.max(0.5, 1240 / base.width));
    const vp = pg.getViewport({ scale: escala });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("imagem"))), "image/jpeg", 0.72));
    const jpg = await novo.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    novo.addPage([base.width, base.height]).drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });
    pg.cleanup();
    prog?.(i, doc.numPages);
  }
  const paginas = doc.numPages;
  await doc.destroy();
  canvas.width = canvas.height = 0;
  const bytes = await novo.save();
  const nome = f.name.replace(/\.pdf$/i, "") + " (reduzido).pdf";
  return { arquivo: new File([bytes as Uint8Array<ArrayBuffer>], nome, { type: "application/pdf" }), texto: partes.filter(Boolean).join("\n\n"), paginas };
}

export const mb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
