/**
 * Aviso de versão nova do painel (como no Atria Track): o painel fica aberto
 * por horas, e uma publicação nova não aparece sozinha. A cada 2 minutos, e
 * quando a aba volta a ficar visível, compara o programa carregado com o que
 * está no ar; se mudou, mostra "Nova versão disponível – atualizar".
 * "Atualizar agora" recarrega na mesma tela (quem chama guarda onde estava).
 */

const PADRAO = /assets\/index-[\w-]+\.js/;
let avisoAberto = false;
let ocultoAte = 0;

async function temVersaoNova(): Promise<boolean> {
  if (/[?&]previa=1/.test(location.search)) return false;
  const meu = [...document.scripts].map((s) => s.src).find((s) => PADRAO.test(s));
  if (!meu) return false;
  try {
    const html = await fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" }).then((r) => r.text());
    const noAr = html.match(PADRAO)?.[0];
    return !!noAr && !meu.includes(noAr);
  } catch {
    return false;
  }
}

function mostrar(recarregar: () => void) {
  if (avisoAberto || Date.now() < ocultoAte) return;
  avisoAberto = true;
  const el = document.createElement("div");
  el.className = "versao-aviso";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="versao-ponto" aria-hidden="true"></span><span class="versao-txt">Nova versão disponível – atualizar</span><button type="button" class="versao-bt">Atualizar agora</button><button type="button" class="versao-x" aria-label="Fechar aviso">✕</button>`;
  const bt = el.querySelector<HTMLButtonElement>(".versao-bt")!;
  bt.addEventListener("click", () => { bt.disabled = true; bt.textContent = "Atualizando…"; recarregar(); });
  el.querySelector(".versao-x")!.addEventListener("click", () => {
    // Fechou: volta a avisar daqui a 30 minutos, se ainda não tiver atualizado.
    el.remove(); avisoAberto = false; ocultoAte = Date.now() + 30 * 60_000;
  });
  document.body.appendChild(el);
}

/** Começa a vigiar. `recarregar` guarda a tela atual e recarrega a página. */
export function vigiarVersao(recarregar: () => void) {
  const checar = async () => { if (!avisoAberto && Date.now() >= ocultoAte && (await temVersaoNova())) mostrar(recarregar); };
  setInterval(() => { if (!document.hidden) void checar(); }, 2 * 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checar(); });
  window.addEventListener("focus", () => void checar());
  setTimeout(() => void checar(), 15_000);
}
