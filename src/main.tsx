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
if (porta.ehPainel) {
  void import("./index.css").then(() => import("./painel/painel")).then((m) => m.montar(raiz));
} else {
  void import("./aluna/area").then((m) => m.montar(raiz));
}
