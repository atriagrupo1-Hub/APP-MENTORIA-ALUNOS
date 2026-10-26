/**
 * Notificações: o pop-up "Ativar notificações" e o botão do Perfil.
 * O que a equipe muda em Configurações → Perfil fica em
 * `configuracoes.notif` (0092); aqui ficam os valores de fábrica.
 */
export type NotifCfg = {
  ativo: boolean; titulo: string; texto: string; botao: string; depois: string;
  layout: "centro" | "baixo"; intervalo: number;
  cores: { fundo: string; borda: string; titulo: string; texto: string; botao: string; botaoTexto: string };
};

export const NOTIF_PADRAO: NotifCfg = {
  ativo: true,
  titulo: "Receber avisos das novas aulas?",
  texto: "Clique no botão abaixo para receber aviso das novas aulas quando forem liberadas.",
  botao: "Ativar notificações",
  depois: "Agora não",
  layout: "centro",
  intervalo: 3,
  cores: { fundo: "#16130e", borda: "#d4b170", titulo: "#f0dca8", texto: "#cfc6b6", botao: "#d4b170", botaoTexto: "#1a140a" },
};

/** De quanto em quanto tempo o pop-up volta para quem tocou em "Agora não". */
export const INTERVALOS: [number, string][] = [[0, "Toda vez que entrar"], [1, "1 dia depois"], [3, "3 dias depois"], [7, "7 dias depois"], [15, "15 dias depois"], [30, "30 dias depois"]];

export function notifDe(x: unknown): NotifCfg {
  const o = (x && typeof x === "object" ? x : {}) as Partial<NotifCfg>;
  const hex = (v: unknown, p: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : p);
  const txt = (v: unknown, p: string) => (typeof v === "string" && v.trim() ? v : p);
  const c = (o.cores ?? {}) as Partial<NotifCfg["cores"]>, P = NOTIF_PADRAO;
  return {
    ativo: o.ativo !== false, titulo: txt(o.titulo, P.titulo), texto: typeof o.texto === "string" ? o.texto : P.texto,
    botao: txt(o.botao, P.botao), depois: txt(o.depois, P.depois), layout: o.layout === "baixo" ? "baixo" : "centro",
    intervalo: INTERVALOS.some(([n]) => n === o.intervalo) ? Number(o.intervalo) : P.intervalo,
    cores: { fundo: hex(c.fundo, P.cores.fundo), borda: hex(c.borda, P.cores.borda), titulo: hex(c.titulo, P.cores.titulo), texto: hex(c.texto, P.cores.texto), botao: hex(c.botao, P.cores.botao), botaoTexto: hex(c.botaoTexto, P.cores.botaoTexto) },
  };
}

export const SINO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

/** O pop-up, igual na área da aluna e na prévia do painel. */
export function popNotif(n: NotifCfg, prev = false): string {
  const c = n.cores;
  const vars = `--np-fundo:${c.fundo};--np-borda:${c.borda};--np-tit:${c.titulo};--np-txt:${c.texto};--np-bt:${c.botao};--np-bttxt:${c.botaoTexto}`;
  return `<div class="np-fundo np-${n.layout}${prev ? " np-prev" : ""}"><div class="np" role="dialog" aria-modal="true" aria-labelledby="npTit" style="${vars}">
    <span class="np-sino">${SINO}<i></i></span>
    <h2 id="npTit">${esc(n.titulo)}</h2>${n.texto ? `<p>${esc(n.texto)}</p>` : ""}
    <button type="button" class="np-ativar" data-a="notif-ativar">${SINO}<span>${esc(n.botao)}</span></button>
    <button type="button" class="np-depois" data-a="notif-depois">${esc(n.depois)}</button></div></div>`;
}
