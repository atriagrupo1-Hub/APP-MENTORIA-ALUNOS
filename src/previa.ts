/**
 * Modo prévia do painel (/admin?previa=1).
 *
 * Enquanto o Claude edita, cada versão nova do painel é publicada no depósito
 * público `previa` do Supabase (não no site). Esta tela carrega essa versão e
 * confere a cada segundo se saiu outra: se saiu, guarda onde a pessoa está e
 * recarrega sozinha. O site oficial só muda quando alguém publica de verdade.
 * Na prévia nada é gravado (ver soLayout): ela serve só para ver o layout.
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

/*
 * Prévia é só layout: nada é gravado. Toda escrita no banco, no depósito de
 * arquivos e nas funções (IA, cadastro) é barrada aqui, antes de sair da tela.
 * Leituras continuam, para a tela mostrar os dados de verdade.
 */
const SUPA = String(import.meta.env.VITE_SUPABASE_URL || "");
const RPC_LEITURA = /^(pode|eh_|conferir|listar|meu_|meus_|minha_|minhas_|resumo_|relatorio_|engajamento_|equipe_do_|alunas_do_|contatos_|comentarios_para|comentarios_do|curtidas_da|aulas_concluidas|atividades_|opcoes_|lixeira_listar|sinal_painel)/;
function barrar(url: string, metodo: string): boolean {
  if (!url.startsWith(SUPA) || metodo === "GET" || metodo === "HEAD") return false;
  const c = url.slice(SUPA.length).split("?")[0];
  if (c.startsWith("/auth/v1/")) return false; // entrar e renovar a sessão
  if (c === "/functions/v1/entrar") return false;
  // IA que só lê e devolve texto ou imagem (não grava nada): liberada, para ver o layout com o resultado.
  if (["/functions/v1/extrair-ebook", "/functions/v1/gerar-descricao-curso", "/functions/v1/gerar-capa"].includes(c)) return false;
  if (c.startsWith("/rest/v1/rpc/")) return !RPC_LEITURA.test(c.slice(13));
  return c.startsWith("/rest/v1/") || c.startsWith("/storage/v1/object") || c.startsWith("/functions/v1/");
}
function soLayout() {
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = (init?.method || (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    if (barrar(url, metodo)) {
      aviso();
      return Promise.resolve(new Response(JSON.stringify({ message: "Prévia é só layout: nada foi salvo.", mensagem: "Prévia é só layout: nada foi salvo." }), { status: 403, headers: { "Content-Type": "application/json" } }));
    }
    return original(entrada, init);
  };
}
let avisoT = 0;
function aviso() {
  selo("Prévia: só layout — nada foi salvo");
  clearTimeout(avisoT); avisoT = window.setTimeout(() => selo("Prévia ao vivo · só layout"), 3500);
}

export async function iniciar(raiz: HTMLElement, normal: () => void) {
  soLayout();
  const v = await versaoAtual();
  if (!v) { normal(); selo("Prévia sem versão em edição — mostrando o site"); return; }
  const links = v.css.map((c) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = BASE + c; document.head.appendChild(l); return l; });
  const m = await import(/* @vite-ignore */ BASE + v.entrada);
  m.montar(raiz);
  selo("Prévia ao vivo · só layout");
  let atual = v.id, entrada = v.entrada, tela = raiz, trocando = false;
  // Troca o CSS sem piscar: o novo entra, e o velho só sai depois que o novo carregou.
  const trocarCss = (css: string[]) => Promise.all(css.map((c, i) => new Promise<void>((ok) => {
    if (links[i] && links[i].href.endsWith(c)) return ok();
    const velho = links[i], nl = document.createElement("link"); nl.rel = "stylesheet"; nl.href = BASE + c;
    nl.onload = nl.onerror = () => { velho?.remove(); ok(); };
    if (velho) velho.after(nl); else document.head.appendChild(nl);
    links[i] = nl;
  })));
  // Troca o código sem recarregar: monta a versão nova escondida, espera ela desenhar e só então troca.
  async function trocarCodigo(n: Versao) {
    try { (window as unknown as { __aionGuardar?: () => void }).__aionGuardar?.(); } catch { /* segue */ }
    const y = window.scrollY;
    const mod = await import(/* @vite-ignore */ BASE + n.entrada);
    const nova = document.createElement("div");
    nova.style.cssText = "position:absolute;left:0;top:0;width:100%;visibility:hidden;pointer-events:none";
    tela.after(nova);
    mod.montar(nova);
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await new Promise((r) => setTimeout(r, 120));
      if (nova.querySelector(".conteudo, form[data-f=\"entrar\"]")) { await new Promise((r) => setTimeout(r, 250)); break; }
    }
    nova.style.cssText = ""; nova.id = tela.id;
    tela.remove(); tela = nova;
    window.scrollTo(0, y);
  }
  setInterval(async () => {
    if (trocando) return;
    const n = await versaoAtual();
    if (!n || n.id === atual) return;
    trocando = true;
    try {
      atual = n.id;
      await trocarCss(n.css);
      if (n.entrada !== entrada) { entrada = n.entrada; await trocarCodigo(n); }
    } catch { /* tenta na próxima versão */ }
    trocando = false;
  }, 400);
}
