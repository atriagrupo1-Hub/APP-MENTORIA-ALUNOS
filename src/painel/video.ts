/*
 * Reduzir vídeo no navegador, sem enviar nada para fora.
 *
 * O vídeo toca escondido, cada quadro é desenhado num canvas menor
 * (lado maior até 1280 px, que mantém texto de tela de celular nítido)
 * e o MediaRecorder grava de novo com taxa menor. Sai MP4 (H.264) onde
 * o navegador grava MP4 — Chrome, Edge e Safari —, senão WebM.
 * O som vai direto para a gravação, sem tocar nos alto-falantes.
 * Leva mais ou menos o tempo do próprio vídeo.
 */

const TIPOS = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const podeReduzirVideo = () =>
  typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

export async function reduzirVideo(arq: File, aoProgresso: (p: number) => void, maxLado = 1280, bps = 1_800_000): Promise<File> {
  if (!podeReduzirVideo()) throw new Error("Este navegador não reduz vídeo. Use o Chrome no computador.");
  const url = URL.createObjectURL(arq);
  const v = document.createElement("video");
  v.src = url; v.playsInline = true; v.preload = "auto";
  try {
    await new Promise<void>((ok, erro) => { v.onloadedmetadata = () => ok(); v.onerror = () => erro(new Error("Não consegui abrir este vídeo.")); });
    const esc = Math.min(1, maxLado / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.max(2, Math.round((v.videoWidth * esc) / 2) * 2), hh = Math.max(2, Math.round((v.videoHeight * esc) / 2) * 2);
    const cv = Object.assign(document.createElement("canvas"), { width: w, height: hh });
    const cx = cv.getContext("2d")!;
    const fluxo = cv.captureStream(30);
    // Som: sai do vídeo direto para a gravação (nada toca no alto-falante).
    let ac: AudioContext | null = null;
    try {
      ac = new AudioContext();
      const dst = ac.createMediaStreamDestination();
      ac.createMediaElementSource(v).connect(dst);
      dst.stream.getAudioTracks().forEach((t) => fluxo.addTrack(t));
    } catch { /* vídeo sem som ou navegador sem WebAudio: segue só a imagem */ }
    const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(fluxo, { ...(tipo ? { mimeType: tipo } : {}), videoBitsPerSecond: bps, audioBitsPerSecond: 96_000 });
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    const fim = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    const quadro = () => { cx.drawImage(v, 0, 0, w, hh); };
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (f: () => void) => number }).requestVideoFrameCallback?.bind(v);
    const laco = () => { if (v.ended) return; quadro(); aoProgresso(v.duration ? Math.min(1, v.currentTime / v.duration) : 0); if (rvfc) rvfc(laco); else requestAnimationFrame(laco); };
    if (ac && ac.state === "suspended") await ac.resume();
    quadro();
    rec.start(1000);
    await v.play();
    laco();
    await new Promise<void>((ok) => { v.onended = () => ok(); });
    quadro();
    rec.stop();
    await fim;
    try { await ac?.close(); } catch { /* ignora */ }
    aoProgresso(1);
    const mime = (rec.mimeType || tipo || "video/webm").split(";")[0];
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const nome = arq.name.replace(/\.[^.]+$/, "") + "-reduzido." + ext;
    return new File(partes, nome, { type: mime });
  } finally {
    v.pause(); v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url);
  }
}
