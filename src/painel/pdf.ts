/**
 * PDF no navegador (carregado só quando a equipe usa):
 * - textoDoPdf: tira o texto de cada página, para a IA ler rápido sem subir o arquivo.
 * - reduzirPdf: recomprime só as imagens de dentro do PDF; o resto fica como no original.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";

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

/*
 * Reduzir mantendo o PDF original: texto, fontes, links e layout ficam intactos.
 * Só as imagens de dentro do PDF (fundos, fotos, ilustrações) são recomprimidas:
 * no máximo 1600 px no lado maior, JPEG 72%. Uma imagem só é trocada se ficar menor.
 */
const LADO = 1600, QUALIDADE = 0.72, MINIMO = 40 * 1024;

const nomeDe = (o: unknown) => (o instanceof PDFName ? o.decodeText() : "");

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const st = new Blob([dados as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

/** Desfaz o preditor PNG (Predictor >= 10) linha a linha. */
function despredizer(d: Uint8Array, larg: number, cores: number): Uint8Array {
  const lin = larg * cores, saida = new Uint8Array((d.length / (lin + 1)) * lin | 0);
  let ant = new Uint8Array(lin);
  for (let y = 0, o = 0; o + lin < d.length + 1 && y * lin < saida.length; y++) {
    const f = d[o++], cur = saida.subarray(y * lin, y * lin + lin);
    for (let x = 0; x < lin; x++) {
      const a = x >= cores ? cur[x - cores] : 0, b = ant[x], c = x >= cores ? ant[x - cores] : 0, v = d[o + x];
      let r = v;
      if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = r & 255;
    }
    o += lin; ant = cur;
  }
  return saida;
}

async function paraJpeg(fonte: CanvasImageSource, w: number, h: number): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const k = Math.min(1, LADO / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
  const cv = document.createElement("canvas"); cv.width = nw; cv.height = nh;
  const ctx = cv.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, nw, nh); ctx.drawImage(fonte, 0, 0, nw, nh);
  const blob = await new Promise<Blob>((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error("jpeg"))), "image/jpeg", QUALIDADE));
  cv.width = cv.height = 0;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: nw, h: nh };
}

export async function reduzirPdf(f: File, prog?: Prog): Promise<{ arquivo: File; texto?: string; paginas: number; imagens: number }> {
  const doc = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { updateMetadata: false });
  const ctxPdf = doc.context;
  const alvos = ctxPdf.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && nomeDe(o.dict.get(PDFName.of("Subtype"))) === "Image" && o.contents.length >= MINIMO) as [PDFRef, PDFRawStream][];
  // Máscaras de transparência (SMask) ficam como estão: precisam continuar em tons de cinza.
  const mascaras = new Set<string>();
  for (const [, o] of ctxPdf.enumerateIndirectObjects()) if (o instanceof PDFRawStream) { const m = o.dict.get(PDFName.of("SMask")); if (m instanceof PDFRef) mascaras.add(m.toString()); }
  let trocadas = 0;
  for (const [n, [ref, st]] of alvos.entries()) {
    prog?.(n + 1, alvos.length);
    try {
      const d = st.dict;
      if (mascaras.has(ref.toString())) continue;
      if (d.get(PDFName.of("ImageMask")) || d.get(PDFName.of("Decode")) || d.get(PDFName.of("Mask"))) continue;
      const filtro = d.get(PDFName.of("Filter")), filtros = filtro instanceof PDFArray ? filtro.asArray().map(nomeDe) : [nomeDe(filtro)];
      const w = (d.get(PDFName.of("Width")) as PDFNumber)?.asNumber?.() ?? 0, h = (d.get(PDFName.of("Height")) as PDFNumber)?.asNumber?.() ?? 0;
      if (!w || !h) continue;
      let cs = d.get(PDFName.of("ColorSpace")); if (cs instanceof PDFRef) cs = ctxPdf.lookup(cs);
      let cores = 0;
      const csN = nomeDe(cs);
      if (csN === "DeviceRGB") cores = 3; else if (csN === "DeviceGray") cores = 1;
      else if (cs instanceof PDFArray && nomeDe(cs.get(0)) === "ICCBased") { const icc = ctxPdf.lookup(cs.get(1)) as PDFRawStream; const nn = (icc?.dict.get(PDFName.of("N")) as PDFNumber)?.asNumber?.(); if (nn === 3 || nn === 1) cores = nn; }
      if (!cores) continue; // CMYK, Indexed, Lab...: fica como está
      let fonte: CanvasImageSource;
      if (filtros.length === 1 && filtros[0] === "DCTDecode") {
        fonte = await createImageBitmap(new Blob([st.contents as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
      } else if (filtros.length === 1 && filtros[0] === "FlateDecode") {
        if (((d.get(PDFName.of("BitsPerComponent")) as PDFNumber)?.asNumber?.() ?? 8) !== 8) continue;
        let px = await inflar(st.contents);
        let parms = d.get(PDFName.of("DecodeParms")); if (parms instanceof PDFRef) parms = ctxPdf.lookup(parms);
        const pred = parms instanceof PDFDict ? ((parms.get(PDFName.of("Predictor")) as PDFNumber)?.asNumber?.() ?? 1) : 1;
        if (pred >= 10) px = despredizer(px, w, cores); else if (pred !== 1) continue;
        if (px.length < w * h * cores) continue;
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let i = 0, j = 0; i < w * h; i++, j += cores) { const r = px[j], g = cores === 3 ? px[j + 1] : r, b = cores === 3 ? px[j + 2] : r; rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255; }
        fonte = await createImageBitmap(new ImageData(rgba, w, h));
      } else continue;
      const j = await paraJpeg(fonte, w, h);
      (fonte as ImageBitmap).close?.();
      if (j.bytes.length >= st.contents.length * 0.9) continue;
      const nd = d.clone(ctxPdf);
      nd.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      nd.delete(PDFName.of("DecodeParms"));
      nd.set(PDFName.of("Width"), PDFNumber.of(j.w)); nd.set(PDFName.of("Height"), PDFNumber.of(j.h));
      nd.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB")); nd.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      nd.set(PDFName.of("Length"), PDFNumber.of(j.bytes.length));
      ctxPdf.assign(ref, PDFRawStream.of(nd, j.bytes));
      trocadas++;
    } catch { /* imagem que não deu para ler fica como está */ }
  }
  const bytes = await doc.save({ useObjectStreams: true });
  const nome = f.name.replace(/\.pdf$/i, "") + " (reduzido).pdf";
  return { arquivo: new File([bytes as Uint8Array<ArrayBuffer>], nome, { type: "application/pdf" }), paginas: doc.getPageCount(), imagens: trocadas };
}

export const mb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
