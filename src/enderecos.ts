/**
 * Onde o aplicativo atende.
 *
 * Ele atende em QUALQUER uma destas portas, ao mesmo tempo:
 *
 *   souaion.com                   a área da aluna
 *   souaion.com/admin             o painel
 *   souaion.com/appmentoria       a área da aluna
 *   souaion.com/admappmentoria    o painel
 *
 * Antes eram só as duas últimas, e a raiz devolvia 404. Bastava uma
 * regra de endereço errada em algum painel de fora para tudo cair numa
 * porta que não existia — e a tela ficava preta, sem dizer por quê.
 *
 * Aceitar as quatro custa três linhas e acaba com essa classe inteira de
 * problema: se uma regra jogar a pessoa na raiz, ela cai na mentoria, e
 * não no vazio.
 *
 * As rotas internas (`/inicio`, `/modulo/3`) continuam escritas sem
 * prefixo nenhum nas telas. O `basename`, escolhido em `main.tsx` pela
 * porta de entrada, põe o prefixo em todas de uma vez.
 */

/** Cada par é uma porta do painel e a porta da aluna que anda com ela. */
const PORTAS = [
  { painel: "/admin", aluna: "/" },
  { painel: "/admappmentoria", aluna: "/appmentoria" },
] as const;

export const CAMINHO_APP = PORTAS[0].aluna;
export const CAMINHO_PAINEL = PORTAS[0].painel;

function dentro(caminho: string, base: string): boolean {
  return caminho === base || caminho.startsWith(base + "/");
}

export type Porta = {
  /** Entrou pela porta do painel? */
  ehPainel: boolean;
  /** O `basename` do roteador. */
  base: string;
  /** Onde mora a área da aluna nesta porta — é o que vai no convite. */
  aluna: string;
};

export function portaAtual(caminho?: string): Porta {
  const p = caminho ?? (typeof window === "undefined" ? "/" : window.location.pathname);

  for (const porta of PORTAS) {
    if (dentro(p, porta.painel)) return { ehPainel: true, base: porta.painel, aluna: porta.aluna };
  }
  for (const porta of PORTAS) {
    if (porta.aluna !== "/" && dentro(p, porta.aluna)) {
      return { ehPainel: false, base: porta.aluna, aluna: porta.aluna };
    }
  }
  // Sobrou a raiz: é a área da aluna.
  return { ehPainel: false, base: "/", aluna: "/" };
}

/**
 * O endereço completo da área da aluna, para o convite dela.
 *
 * Acompanha a porta pela qual o painel foi aberto: quem administra por
 * `/admappmentoria` convida para `/appmentoria`; quem administra por
 * `/admin` convida para a raiz. Assim o convite nunca aponta para uma
 * porta diferente da que a equipe está usando.
 */
export function enderecoDaMentoria(): string {
  if (typeof window === "undefined") return "/";
  const origem = window.location.origin.replace(/\/+$/, "");
  const { aluna } = portaAtual();
  return aluna === "/" ? origem : origem + aluna;
}
