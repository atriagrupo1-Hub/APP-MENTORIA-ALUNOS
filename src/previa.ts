/**
 * Modo prévia do painel (/admin?previa=1).
 *
 * Enquanto o Claude edita, cada versão nova do painel é publicada no depósito
 * público `previa` do Supabase (não no site). Esta tela carrega essa versão e
 * confere a cada segundo se saiu outra: se saiu, guarda onde a pessoa está e
 * recarrega sozinha. O site oficial só muda quando alguém publica de verdade.
 */
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/previa/`;
const CHAVE = "aion-previa";
type Versao = { id: string; entrada: string; css: string[] };

async function versaoAtual(): Promise<Versao | null> {
  try {
    const r = await fetch(`${BASE}atual.json?t=${Date.now()}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as Versao) : null;
  } catch { return null; }
}

export const previaLigada = () => {
  const q = new URLSearchParams(location.search);
  try {
    if (q.get("previa") === "0") sessionStorage.removeItem(CHAVE);
    else if (q.has("previa")) sessionStorage.setItem(CHAVE, "1");
    return sessionStorage.getItem(CHAVE) === "1";
  } catch { return q.has("previa") && q.get("previa") !== "0"; }
};

function selo(texto: string) {
  let el = document.getElementById("previaSelo");
  if (!el) {
    el = document.createElement("div"); el.id = "previaSelo";
    el.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:10px;padding:8px 14px;font:600 13px/1.2 system-ui,sans-serif;color:#1a1408;background:linear-gradient(180deg,#e2c27a,#b8944f);border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.35)";
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>● ${texto}</span><a href="?previa=0" style="color:#1a1408;text-decoration:underline">Sair da prévia</a>`;
}

export async function iniciar(raiz: HTMLElement, normal: () => void) {
  const v = await versaoAtual();
  if (!v) { normal(); selo("Prévia sem versão em edição — mostrando o site"); return; }
  const links = v.css.map((c) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = BASE + c; document.head.appendChild(l); return l; });
  const m = await import(/* @vite-ignore */ BASE + v.entrada);
  m.montar(raiz);
  selo("Prévia ao vivo");
  let atual = v.id, entrada = v.entrada;
  setInterval(async () => {
    const n = await versaoAtual();
    if (n && n.id !== atual) {
      atual = n.id;
      // Só o estilo mudou: troca o CSS na hora, sem recarregar a tela.
      if (n.entrada === entrada && n.css.length === links.length) {
        n.css.forEach((c, i) => { if (!links[i].href.endsWith(c)) { const velho = links[i], nl = velho.cloneNode() as HTMLLinkElement; nl.href = BASE + c; nl.onload = () => velho.remove(); velho.after(nl); links[i] = nl; } });
        return;
      }
      try { (window as unknown as { __aionGuardar?: () => void }).__aionGuardar?.(); } catch { /* recarrega mesmo assim */ }
      location.reload();
    }
  }, 400);
}
