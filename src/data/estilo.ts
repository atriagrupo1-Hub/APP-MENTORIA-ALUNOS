/**
 * Estilos visuais (0098): o que a equipe escolhe no seletor de cores do painel
 * para um card, um botão ou uma capa — cor livre ou degradê, cor do texto,
 * contorno, sombra, tamanho e formato. Fica guardado em `estilo` (jsonb) da
 * categoria e do módulo, separado por parte. Vazio = o visual padrão do app.
 *
 * O mesmo arquivo serve ao painel (prévia) e ao app da aluna, para os dois
 * desenharem igual.
 */

export type Fundo = { t: "cor" | "degrade"; a: string; b?: string; ang?: number };
export type Visual = {
  fundo?: Fundo | null;
  texto?: string | null;
  borda?: { cor: string; w: number } | null;
  sombra?: { n: number; cor: string } | null;
  tam?: "p" | "m" | "g" | null;
  forma?: "quadrado" | "arredondado" | "redondo" | null;
};
export type Estilo = Partial<Record<string, Visual>>;

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (x: unknown) => (typeof x === "string" && HEX.test(x) ? x.toLowerCase() : "");

/** Deixa só o que é válido (o que vem do banco ou de uma mensagem nunca vira CSS solto). */
export function limparVisual(v: unknown): Visual | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, any>, out: Visual = {};
  const f = o.fundo;
  if (f && hex(f.a)) out.fundo = f.t === "degrade" && hex(f.b) ? { t: "degrade", a: hex(f.a), b: hex(f.b), ang: Math.max(0, Math.min(360, Math.round(Number(f.ang) || 0))) } : { t: "cor", a: hex(f.a) };
  if (hex(o.texto)) out.texto = hex(o.texto);
  if (o.borda && hex(o.borda.cor)) out.borda = { cor: hex(o.borda.cor), w: Math.max(0, Math.min(8, Math.round(Number(o.borda.w) || 0))) };
  if (o.sombra && hex(o.sombra.cor)) out.sombra = { n: Math.max(0, Math.min(4, Math.round(Number(o.sombra.n) || 0))), cor: hex(o.sombra.cor) };
  if (["p", "m", "g"].includes(o.tam)) out.tam = o.tam;
  if (["quadrado", "arredondado", "redondo"].includes(o.forma)) out.forma = o.forma;
  return Object.keys(out).length ? out : null;
}
export function limparEstilo(e: unknown): Estilo | null {
  if (!e || typeof e !== "object") return null;
  const out: Estilo = {};
  for (const [k, v] of Object.entries(e as Record<string, unknown>)) { if (!/^[a-z]{2,12}$/.test(k)) continue; const x = limparVisual(v); if (x) out[k] = x; }
  return Object.keys(out).length ? out : null;
}

const rgba = (c: string, a: number) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
export const cssFundo = (f: Fundo) => (f.t === "degrade" && f.b ? `linear-gradient(${f.ang ?? 135}deg, ${f.a}, ${f.b})` : f.a);
export const SOMBRAS = ["Nenhuma", "Suave", "Média", "Forte", "Brilho"];
function cssSombra(s: { n: number; cor: string }) {
  if (!s.n) return "none";
  if (s.n === 4) return `0 0 0 1px ${rgba(s.cor, 0.35)}, 0 0 28px -4px ${rgba(s.cor, 0.85)}`;
  return [`0 2px 6px ${rgba(s.cor, 0.22)}`, `0 8px 20px -6px ${rgba(s.cor, 0.45)}`, `0 16px 36px -8px ${rgba(s.cor, 0.7)}`][s.n - 1];
}
const RAIO = { quadrado: "0px", arredondado: "12px", redondo: "999px" };
const ZOOM = { p: "0.88", m: "1", g: "1.15" };

/**
 * O CSS (para o atributo style) de uma parte. `card` não tem formato "redondo":
 * fica com cantos bem arredondados. Usa !important porque os cards do app
 * têm temas próprios (Mestres, Documentários…) que senão ganhariam.
 */
export function cssVisual(v: Visual | null | undefined, tipo: "card" | "botao" | "capa" = "botao"): string {
  if (!v) return "";
  const r: string[] = [];
  const imp = (p: string, x: string) => r.push(`${p}:${x} !important`);
  if (v.fundo && tipo !== "capa") { imp("background", cssFundo(v.fundo)); if (tipo === "botao") imp("background-image", v.fundo.t === "degrade" ? cssFundo(v.fundo) : "none"); }
  if (v.texto && tipo !== "capa") imp("color", v.texto);
  if (v.borda) imp("border", v.borda.w ? `${v.borda.w}px solid ${v.borda.cor}` : "0");
  if (v.sombra) imp("box-shadow", cssSombra(v.sombra));
  if (v.forma) imp("border-radius", tipo === "card" && v.forma === "redondo" ? "28px" : RAIO[v.forma]);
  if (v.tam && tipo === "botao") imp("zoom", ZOOM[v.tam]);
  return r.join(";");
}
