import { portaAtual } from "./enderecos";

/*
 * Qual porta foi aberta decide o que esta tela é.
 *
 * São quatro portas e todas funcionam — ver `enderecos.ts`. O
 * `basename` é escolhido aqui, uma vez, e dali para dentro nada mais
 * precisa saber onde o aplicativo mora: as vinte e quatro navegações da
 * área da aluna continuam dizendo `/inicio` e `/modulo/3`, como sempre.
 *
 * O painel não entra no roteador da aluna de propósito. Ele não tem
 * rota nenhuma — é uma tela só, com abas.
 */
const porta = portaAtual();

/**
 * Service worker: guarda só os arquivos do programa, e por isso é
 * registrado depois que a página carregou — nunca disputa banda com o
 * primeiro desenho da tela. Ver `public/sw.js`.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app funciona igual; só não instala no Android.
    });
  });
}

const raiz = document.getElementById("root")!;

// O painel da equipe e a área da aluna são as maquetes aprovadas ligadas
// ao banco, sem React: cada porta carrega só o que é dela.
const abrirPainel = () => void import("./index.css").then(() => import("./painel/painel")).then((m) => m.montar(raiz));
if (porta.ehPainel) {
  // /admin?previa=1: a versão em edição, que se atualiza sozinha (ver previa.ts).
  void import("./previa").then((p) => (p.previaLigada() ? p.iniciar(raiz, abrirPainel) : abrirPainel()));
} else if (demoLigada()) {
  // /?demo=1 (página de apresentação): o app em edição, guardado no depósito `previa` do Supabase.
  // Muda em segundos, sem publicar o site; as alunas continuam no app publicado.
  void abrirDemo();
} else {
  void import("./aluna/area").then((m) => m.montar(raiz));
}

function demoLigada() {
  const q = new URLSearchParams(location.search);
  try {
    if (q.get("demo") === "0") sessionStorage.removeItem("aion-demo");
    else if (q.has("demo")) sessionStorage.setItem("aion-demo", "1");
    return sessionStorage.getItem("aion-demo") === "1";
  } catch { return q.has("demo") && q.get("demo") !== "0"; }
}
async function abrirDemo() {
  const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/previa/`;
  const ler = async () => { try { const r = await fetch(`${BASE}app.json?t=${Date.now()}`, { cache: "no-store" }); return r.ok ? ((await r.json()) as { id: string; entrada: string; css: string[] }) : null; } catch { return null; } };
  const v = await ler();
  if (!v) { void import("./aluna/area").then((m) => m.montar(raiz)); return; }
  for (const c of v.css) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = BASE + c; document.head.appendChild(l); }
  const m = await import(/* @vite-ignore */ BASE + v.entrada);
  m.montar(raiz);
  // Saiu versão nova: recarrega sozinha (a sessão da aluna continua).
  setInterval(async () => { const n = await ler(); if (n && n.id !== v.id) location.reload(); }, 2000);
}
