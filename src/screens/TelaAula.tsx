import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso } from "@/components/Aviso";
import { Capa, capaAula, capaModulo } from "@/components/Capa";
import { Conversa } from "@/components/Conversa";
import { Conteudos } from "@/components/Conteudos";
import { EsqueletoComentarios } from "@/components/Esqueleto";
import { Player } from "@/components/Player";
import { Play } from "@/components/Icones";
import { useAviso } from "@/components/useAviso";
import * as api from "@/data/api";
import type { ComentarioPublico } from "@/data/api";
import { quandoAbre } from "@/data/derivados";
import { rotuloDuracao, useEstado } from "@/data/estado";
import { cores, paleta } from "@/design/tokens";

/*
 * As velocidades, com o número que o vídeo entende.
 *
 * Antes era só uma lista de rótulos: o menu girava o texto e o vídeo
 * seguia igual. "Normal" e não "1x" porque é a palavra que a aluna
 * procura quando quer desfazer o que mexeu.
 *
 * A resolução saiu. Ela também não fazia nada, e ligá-la seria pior:
 * fora do Safari daria para escolher a faixa, dentro do Safari não —
 * o mesmo botão funcionando no Android e não no iPhone é pior que
 * botão nenhum. O Cloudflare já escolhe a faixa pela conexão, que é o
 * que a aluna quer sem saber que quer.
 */
const VELOCIDADES = [
  { rotulo: "0,5x", valor: 0.5 },
  { rotulo: "0,75x", valor: 0.75 },
  { rotulo: "Normal", valor: 1 },
  { rotulo: "1,25x", valor: 1.25 },
  { rotulo: "1,5x", valor: 1.5 },
  { rotulo: "1,75x", valor: 1.75 },
  { rotulo: "2x", valor: 2 },
] as const;

/** "Normal" é onde toda aula começa. */
const VELOCIDADE_NORMAL = 2;

/**
 * Os passos do exercício, como a administradora escreveu no painel:
 * uma linha, um passo. Linha em branco não vira passo — assim ela pode
 * espaçar o texto enquanto escreve sem que apareça um número vazio.
 */
/**
 * O texto da aula, como quem escreveu deixou.
 *
 * Uma linha em branco separa parágrafo — é o que se digita sem pensar.
 * Dentro do parágrafo, a quebra de linha é respeitada: quem escreveu
 * uma lista, uma oração ou um verso quis aquelas quebras ali.
 *
 * O destaque é `*assim*` ou `**assim**`, que é como se destaca no
 * WhatsApp — a única marcação que este público já usa todo dia.
 */
function paragrafos(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Quebra um parágrafo em pedaços normais e pedaços em negrito. */
function pedacos(paragrafo: string): Array<{ forte: boolean; texto: string }> {
  return paragrafo
    .split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
    .filter(Boolean)
    .map((pedaco) => {
      const forte = /^\*\*[^*]+\*\*$/.test(pedaco) || /^\*[^*\n]+\*$/.test(pedaco);
      return { forte, texto: forte ? pedaco.replace(/^\*+|\*+$/g, "") : pedaco };
    });
}

/** Um parágrafo pintado: quebras preservadas, destaque em negrito. */
function Paragrafo({ texto }: { texto: string }) {
  return (
    <p className="mb-4 mt-0 whitespace-pre-line text-corpo leading-[1.7] text-white/85">
      {pedacos(texto).map((p, i) =>
        p.forte ? (
          <strong key={i} className="font-bold text-white">
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </p>
  );
}

/** O preto e branco desta tela: uma linha e um cinza, e nada mais. */
/*
 * O contorno de "✓ Concluir", de ← e → e do campo de comentário.
 * Estava em .22 — 1,79:1, contra os 3:1 que a norma pede para o limite
 * de um controle. Era a única coisa que dizia onde esses botões
 * começam e terminam.
 */
const LINHA = "rgba(255,255,255,.4)";

const SUAVE = "rgba(255,255,255,.62)";

export function TelaAula() {
  const { mi, li } = useParams();
  const numeroModulo = Number(mi);
  const ordem = Number(li);
  const navegar = useNavigate();
  const aviso = useAviso();
  const estado = useEstado();
  const {
    catalogo,
    concluida,
    curtiu,
    alternarConcluida,
    alternarCurtida,
    registrarPosicao,
    posicaoSegundos,
    aulaBloqueada,
    aulaAbreEm,
    moduloLiberado,
    moduloVisivel,
  } = estado;

  const [tocando, setTocando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [velocidade, setVelocidade] = useState(VELOCIDADE_NORMAL);
  const [painel, setPainel] = useState<"" | "exercicio">("");
  const [comentariosAbertos, setComentariosAbertos] = useState(false);
  const secaoComentarios = useRef<HTMLElement>(null);
  const [mostrarFechar, setMostrarFechar] = useState(true);
  const [rascunho, setRascunho] = useState("");
  const [semNome, setSemNome] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [comentarios, setComentarios] = useState<ComentarioPublico[]>([]);
  /*
   * Esperando não é o mesmo que não existir, e a tela dizia que era.
   *
   * Enquanto o servidor não devolvia o endereço do vídeo, `video` era
   * nulo — o mesmo valor de uma aula sem vídeo cadastrado. A tela lia
   * esse nulo e escrevia "Vídeo em breve" por alguns instantes, em toda
   * aula, toda vez. A aluna abria a aula e o aplicativo dizia que ela
   * não existia ainda.
   */
  const [buscandoVideo, setBuscandoVideo] = useState(true);
  /*
   * Falhar não é a mesma coisa que não existir.
   *
   * A busca engolia o erro e deixava `video` nulo — exatamente o estado
   * de uma aula que ainda não tem vídeo cadastrado. As duas coisas
   * desenhavam "Vídeo em breve", e a aluna sem internet concluía que a
   * aula não estava pronta e ia embora esperar.
   */
  const [falhouVideo, setFalhouVideo] = useState(false);
  const [tentativaVideo, setTentativaVideo] = useState(0);
  const [buscandoComentarios, setBuscandoComentarios] = useState(true);
  const [video, setVideo] = useState<api.Video | null>(null);
  const [segundos, setSegundos] = useState(0);

  /*
   * Por id primeiro, por número depois — a mesma regra da
   * `PaginaModulo`. `numero` só é único dentro de um produto, e os
   * endereços antigos (`/aula/3/2`) sempre quiseram dizer a mentoria.
   */
  const modulo =
    catalogo.modulos.find((m) => m.id === mi) ??
    catalogo.modulos.find(
      (m) =>
        m.numero === numeroModulo &&
        (catalogo.produtoJornada === null || m.produtoId === catalogo.produtoJornada),
    );
  const aula = modulo?.aulas[ordem];

  /** Na mentoria isto é "Módulo 3 • Aula 2". Num e-book, não é. */
  const naJornada =
    catalogo.produtoJornada === null || modulo?.produtoId === catalogo.produtoJornada;

  const aulaId = aula?.id ?? null;

  useEffect(() => {
    setTocando(false);
    setSegundos(0);
    setPainel("");
    setMenuAberto(false);
    // A velocidade NÃO volta ao normal aqui, de propósito: quem escolheu
    // 1,5x quer 1,5x na aula seguinte também. Trocar de aula não é
    // mudar de ideia.
  }, [numeroModulo, ordem]);

  /*
   * Menu aberto fecha ao tocar fora, e no Esc.
   *
   * Sem isto ele só fecha tocando no próprio botão de novo — e no
   * celular, onde não há "fora" evidente, a aluna toca na tela, nada
   * acontece, e o painel fica pairando sobre o vídeo.
   */
  const menuVelocidade = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuAberto) return;
    const foraDaqui = (e: MouseEvent | TouchEvent) => {
      if (!menuVelocidade.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAberto(false);
    };
    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  }, [menuAberto]);

  // Comentários e endereço do vídeo vêm do banco, por aula. O endereço
  // só é devolvido depois de o servidor conferir a liberação.
  useEffect(() => {
    if (!aulaId) return;
    let valeAinda = true;
    setComentarios([]);
    setVideo(null);
    setFalhouVideo(false);
    setBuscandoVideo(true);
    setBuscandoComentarios(true);
    void api
      .comentariosDaAula(aulaId)
      .then((lista) => valeAinda && setComentarios(lista))
      .catch(() => undefined)
      .finally(() => valeAinda && setBuscandoComentarios(false));
    void api
      .videoDaAula(aulaId)
      .then((v) => valeAinda && setVideo(v))
      .catch(() => valeAinda && setFalhouVideo(true))
      // `finally` e não `then`: falhando a busca, continua sendo
      // espera terminada — o que a tela precisa saber é que já não há
      // o que esperar, não se deu certo.
      .finally(() => valeAinda && setBuscandoVideo(false));
    return () => {
      valeAinda = false;
    };
  }, [aulaId, tentativaVideo]);

  /*
   * Um endereço novo, quando o de agora deixou de servir.
   *
   * Com URL assinada o endereço tem prazo: uma aula aberta numa aba
   * desde cedo, ou um celular que dormiu no meio, voltam com um
   * endereço vencido. O player avisa, isto assina outro, e ela volta ao
   * mesmo minuto sem saber que houve problema.
   *
   * Quem decide continua sendo o banco. Se o acesso dela mudou nesse
   * meio-tempo — prazo vencido, conta suspensa —, o servidor não assina
   * nada, e é o certo: a tela do player passa a dizer que não deu.
   */
  const renovarVideo = useCallback(async () => {
    if (!aulaId) return false;
    const novo = await api.videoDaAula(aulaId).catch(() => null);
    if (!novo) return false;
    setVideo(novo);
    return true;
  }, [aulaId]);


  /*
   * Aula que não é dela responde igual a aula que não existe.
   *
   * A interface já não deixa clicar, e o vídeo já não sai do servidor —
   * mas digitando o endereço na barra a tela abria assim mesmo, com
   * título, descrição e comentários de uma aula que ela não tem. Não é
   * vazamento de conteúdo pago, e o vídeo continuava sem tocar; é
   * apenas que não se confirma a ninguém o que existe do outro lado da
   * porta. É a mesma resposta que a página de módulo já dava.
   */
  if (!modulo || !aula || !moduloVisivel(modulo) || aulaBloqueada(modulo, aula)) {
    return <main className="p-8">Aula não encontrada.</main>;
  }

  /*
   * O ✕ some com o vídeo rodando e volta ao toque.
   *
   * O certo seria acompanhar os controles do player, mas ele é do
   * Cloudflare e roda num quadro fechado: de fora não dá para saber
   * quando os controles dele aparecem ou somem. Então o ✕ tem o próprio
   * relógio — some depois de alguns segundos parados e volta a qualquer
   * toque, rolagem ou tecla.
   *
   * Só some com o vídeo de verdade tocando. Na capa, com o botão de
   * play na tela, não há o que atrapalhar.
   */
  useEffect(() => {
    if (!(tocando && video)) {
      setMostrarFechar(true);
      return;
    }
    let relogio = 0;
    const adiar = () => {
      setMostrarFechar(true);
      window.clearTimeout(relogio);
      relogio = window.setTimeout(() => setMostrarFechar(false), 3500);
    };
    adiar();
    const gestos = ["pointerdown", "pointermove", "scroll", "keydown"] as const;
    for (const gesto of gestos) {
      window.addEventListener(gesto, adiar, { passive: true });
    }
    return () => {
      window.clearTimeout(relogio);
      for (const gesto of gestos) window.removeEventListener(gesto, adiar);
    };
  }, [tocando, video]);

  const cor = paleta(modulo.numero);
  const feita = concluida(aula.id);
  /* A aba só existe se houver o que ler. */
  const blocos = paragrafos(aula.texto);
  const extras = aula.conteudos.filter((c) => c.publicado);
  /*
   * O minuto em que ela está. Com vídeo de verdade vem do player; sem
   * vídeo, da barra simulada, que só existe enquanto a aula não subiu.
   */
  const segundoAtual = segundos;


  /*
   * O relógio simulado do protótipo saiu daqui.
   *
   * Ele empurrava a barra para a demonstração parecer viva, e gravava em
   * `progresso` uma posição inventada — justamente de onde sai o
   * "continue de onde parou". Agora quem diz o minuto é o player, e o
   * que se grava é o que ela assistiu de verdade.
   */
  /** O player avisou onde está. É daqui que sai "continue de onde parou". */
  function aoProgredir(atual: number, total: number, agora = false) {
    setSegundos(atual);
    registrarPosicao(aula!.id, atual, total, agora);
  }
  function fechar() {
    setSaindo(true);
    // O mesmo tempo do desaparecimento, em `index.css`. Navegar antes
    // corta a saída pela metade; depois, deixa a tela apagada parada.
    window.setTimeout(() => navegar(`/modulo/${modulo!.id}`), 220);
  }

  /*
   * Anterior e próximo andam pelos irmãos do MESMO produto.
   *
   * Antes andavam por `numero` no catálogo inteiro. Com mais de um
   * produto, `numero` deixou de ser único: o "próximo" da última aula
   * do Módulo 1 podia ser o capítulo de um e-book.
   */
  const irmaos = catalogo.modulos
    .filter((m) => m.produtoId === modulo?.produtoId)
    .sort((a, b) => a.ordem - b.ordem);

  const vizinho = (passo: -1 | 1) => {
    const aqui = irmaos.findIndex((m) => m.id === modulo?.id);
    return aqui < 0 ? undefined : irmaos[aqui + passo];
  };

  function irParaAnterior() {
    if (ordem > 0) return navegar(`/aula/${modulo!.id}/${ordem - 1}`);
    const anterior = vizinho(-1);
    if (anterior && moduloLiberado(anterior)) {
      return navegar(`/aula/${anterior.id}/${anterior.aulas.length - 1}`);
    }
    aviso.mostrar("Este é o primeiro desta trilha.");
  }

  function irParaProxima() {
    if (ordem + 1 < modulo!.aulas.length) {
      return navegar(`/aula/${modulo!.id}/${ordem + 1}`);
    }
    const seguinte = vizinho(1);
    if (!seguinte) {
      aviso.mostrar("Você chegou ao fim desta trilha.");
      return;
    }
    if (!moduloLiberado(seguinte)) {
      aviso.mostrar("Isto será liberado no momento certo da sua jornada.");
      return;
    }
    navegar(`/aula/${seguinte.id}/0`);
  }

  /*
   * Concluir uma aula não libera nada.
   *
   * No protótipo liberava: terminar a aula abria a próxima, e terminar
   * o módulo abria o seguinte. Com o cronograma por aluna, quem abre é
   * a data que a administradora marcou — a conclusão só registra que a
   * aluna assistiu.
   *
   * O aviso antigo prometia uma liberação que não ia acontecer. A aluna
   * concluía, ia procurar a próxima aula e encontrava a data.
   */
  async function marcarConcluida() {
    const virou = await alternarConcluida(aula!.id);
    if (!virou) return;
    const ultimaDoModulo = ordem + 1 >= modulo!.aulas.length;
    aviso.mostrar(
      ultimaDoModulo ? "Módulo concluído." : "Aula concluída.",
    );
  }

  /*
   * O comentário aparece na hora, antes do banco confirmar.
   *
   * Antes eram duas idas a São Paulo em sequência — gravar e reler a
   * lista inteira — e a aluna ficava olhando para o nada no meio. Agora
   * ela vê o que escreveu imediatamente; a gravação acontece atrás, e a
   * releitura acerta os identificadores. Falhando, o texto volta para o
   * campo e a linha provisória some: nada fica no ar dizendo que foi
   * publicado quando não foi.
   */
  async function escrever(texto: string, respostaA?: string) {
    if (!texto || !aulaId) return false;
    setComentariosAbertos(true);

    const provisorio: api.ComentarioPublico = {
      id: `provisorio-${Date.now()}`,
      aulaId,
      texto,
      posicaoSegundos: 0,
      criadoEm: new Date().toISOString(),
      // Só serve para o `minha` abaixo; a linha provisória mostra
      // "Você", como todas as dela.
      autoraNome: null,
      minha: true,
      respostaA: respostaA ?? null,
      ehInstrutor: estado.aluna?.papel === "admin",
    };
    // Comentário novo entra em cima, que é onde a lista o mostraria.
    // Resposta entra no fim, porque é assim que ela é lida: embaixo da
    // conversa, depois das que vieram antes.
    setComentarios((atuais) =>
      respostaA ? [...atuais, provisorio] : [provisorio, ...atuais],
    );

    try {
      await api.comentar(aulaId, texto, segundoAtual, respostaA, semNome);
      setComentarios(await api.comentariosDaAula(aulaId));
      // Comentário de aluna espera a moderação (0040): sem este aviso, ele
      // sumiria da tela sem explicação.
      if (!["dono", "admin", "suporte"].includes(estado.aluna?.papel ?? "")) {
        aviso.mostrar("Recebemos seu comentário. Ele aparece aqui assim que a equipe aprovar.");
      }
      return true;
    } catch {
      setComentarios((atuais) => atuais.filter((c) => c.id !== provisorio.id));
      aviso.mostrar(
        respostaA
          ? "Não conseguimos publicar sua resposta. Tente de novo."
          : "Não conseguimos publicar seu comentário. Tente de novo.",
      );
      return false;
    }
  }

  async function enviarComentario(e: FormEvent) {
    e.preventDefault();
    const texto = rascunho.trim();
    if (!texto) return;
    setRascunho("");
    if (!(await escrever(texto))) setRascunho(texto);
  }

  const responder = (pai: string, texto: string) => escrever(texto, pai);

  /*
   * A lista vem do banco já na ordem certa — conversa por conversa,
   * pergunta primeiro. Aqui ela só é agrupada, preservando essa ordem,
   * para que a tela saiba onde termina uma conversa e começa a outra.
   *
   * Resposta órfã não existe nesta lista: o banco não devolve resposta
   * cuja raiz saiu do ar.
   */
  const conversas = useMemo(
    () =>
      comentarios
        .filter((c) => !c.respostaA)
        .map((pai) => ({
          pai,
          respostas: comentarios.filter((r) => r.respostaA === pai.id),
        })),
    [comentarios],
  );

  return (
    <main
      data-saindo={saindo ? "1" : "0"}
      className="tela-aula mx-auto max-w-[1080px] pb-24"
    >
      {/*
        O escurecimento da tela inteira vinha do protótipo, onde não
        havia vídeo: servia para dar clima à demonstração. Com o player
        do Cloudflare na tela ele só atrapalha — some tudo em volta e a
        aula fica flutuando no preto. Fica apenas onde ainda não há
        vídeo cadastrado.
      */}
      {tocando && !video ? (
        <div
          className="entra pointer-events-none fixed inset-0 z-[45]"
          style={{ background: "rgba(0,0,0,.9)" }}
        />
      ) : null}

      {/*
        A faixa da barra de status, em preto, acima do vídeo — como faz
        qualquer aplicativo de vídeo no celular. Sem ela o relógio e a
        bateria caem em cima da arte da aula, porque o `viewport-fit=cover`
        do index.html manda a página começar atrás deles. No navegador de
        computador a medida é zero e a faixa não existe.
      */}
      <div className="sticky top-0 z-50 w-full bg-black">
        <div style={{ height: "env(safe-area-inset-top)" }} />
        <div className="relative aspect-video w-full overflow-hidden">
          {video ? (
            <Player
              identificador={video.ref}
              aoRenovar={renovarVideo}
              capa={
                <Capa
                  caminhos={[capaAula(modulo.numero, aula.ordem), capaModulo(modulo.numero)]}
                  alt={`Capa da Aula ${aula.numero} — ${aula.titulo}`}
                />
              }
              comecarEm={posicaoSegundos(aula.id)}
              velocidade={VELOCIDADES[velocidade].valor}
              aoTocar={setTocando}
              aoProgredir={aoProgredir}
            />
          ) : (
            <>
              <Capa
                caminhos={[capaAula(modulo.numero, aula.ordem), capaModulo(modulo.numero)]}
                alt={`Capa da Aula ${aula.numero} — ${aula.titulo}`}
                opacidade={tocando ? 0.55 : 1}
              />

              {/*
                Dois estados, e não um: a aula sem vídeo cadastrado
                espera, e não há o que fazer; a busca que falhou tem
                conserto, e a aluna precisa do botão para tentar.
              */}
              {tocando || buscandoVideo ? null : falhouVideo ? (
                <span className="absolute left-1/2 top-1/2 z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 px-4">
                  <span
                    className="rounded-[5px] px-4 py-2 text-center text-apoio"
                    style={{
                      color: "rgba(255,255,255,.92)",
                      background: "rgba(0,0,0,.6)",
                      border: "1px solid rgba(255,255,255,.4)",
                    }}
                  >
                    Não conseguimos carregar o vídeo.
                  </span>
                  <button
                    onClick={() => setTentativaVideo((n) => n + 1)}
                    className="min-h-[44px] rounded-pilula border-none bg-white px-6 text-corpo font-bold text-black hover:opacity-[.86]"
                    style={{ cursor: "pointer" }}
                  >
                    Tentar de novo
                  </button>
                </span>
              ) : (
                <span
                  className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[5px] px-4 py-2 text-apoio"
                  style={{
                    color: "rgba(255,255,255,.85)",
                    background: "rgba(0,0,0,.5)",
                    border: "1px solid rgba(255,255,255,.2)",
                  }}
                >
                  Vídeo em breve
                </span>
              )}
            </>
          )}

          <button
            onClick={fechar}
            aria-label="Fechar e voltar ao módulo"
            className="absolute right-4 top-4 z-[6] flex h-11 w-11 items-center justify-center rounded-full border-none text-secao leading-none text-white hover:opacity-80"
            style={{
              background: "rgba(0,0,0,.55)",
              backdropFilter: "blur(6px)",
              opacity: mostrarFechar ? 1 : 0,
              pointerEvents: mostrarFechar ? "auto" : "none",
              transition: "opacity .25s ease",
              cursor: "pointer",
            }}
          >
            ✕
          </button>

          {/*
            Com o ✕ escondido, esta faixa fina no alto devolve ele ao
            primeiro toque. Só o alto: o meio do quadro continua indo
            para o player, que é onde a aluna toca para pausar.
          */}
          {tocando && video && !mostrarFechar ? (
            <button
              onClick={() => setMostrarFechar(true)}
              aria-label="Mostrar o botão de fechar"
              className="absolute inset-x-0 top-0 z-[5] h-[68px] border-none bg-transparent"
              style={{ cursor: "pointer" }}
            />
          ) : null}
        </div>
      </div>

      <div className="relative z-20 bg-black px-4 pt-4">
        <div className="flex items-start gap-3">
          <h1
            className="text-titulo m-0 min-w-0 flex-1 font-bold leading-[1.3] text-white"
          >
            {aula.numero}. {aula.titulo}
          </h1>
          {/*
            Velocidade, e só ela.

            Este menu girava dois rótulos — velocidade e resolução — e
            não tocava no vídeo. E aparecia justamente onde não havia
            vídeo nenhum: a condição estava invertida, então ele se
            escondia na única aula que tinha o que controlar.

            Agora a velocidade é real e o menu aparece quando há vídeo.
            A aluna de mentoria revê aula: querer 1,5x numa que ela já
            viu, ou 0,75x num trecho difícil, é o pedido mais comum de
            quem estuda por vídeo.

            Não deixei para os controles do próprio navegador porque
            eles não são os mesmos em toda parte — no Chrome a
            velocidade está escondida atrás de três pontinhos, no
            iPhone só aparece em tela cheia. Um toque, igual em todo
            aparelho, é o que se espera de uma área de membros paga.
          */}
          {video ? (
          <div ref={menuVelocidade} className="relative flex-none">
            <button
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Velocidade do vídeo"
              aria-expanded={menuAberto}
              className="flex h-10 min-w-[44px] items-center justify-center rounded-botao border-none bg-transparent px-2 text-apoio font-semibold hover:opacity-70"
              style={{ color: "#ffffff", cursor: "pointer" }}
            >
              {VELOCIDADES[velocidade].rotulo}
            </button>

            {menuAberto ? (
              <div
                role="menu"
                className="absolute right-0 top-11 z-40 w-[200px] max-w-[calc(100vw-32px)] rounded-botao p-2"
                style={{
                  background: "#1b1b1b",
                  border: "1px solid rgba(255,255,255,.1)",
                  boxShadow: "0 24px 50px rgba(0,0,0,.7)",
                }}
              >
                {VELOCIDADES.map((v, i) => (
                  <button
                    key={v.rotulo}
                    role="menuitemradio"
                    aria-checked={i === velocidade}
                    onClick={() => {
                      setVelocidade(i);
                      setMenuAberto(false);
                    }}
                    className="flex min-h-[48px] w-full items-center rounded-lg border-none bg-transparent px-3 hover:bg-white/[.07]"
                    style={{ cursor: "pointer" }}
                  >
                    <span className="flex-1 text-left text-corpo text-white">{v.rotulo}</span>
                    {/* Uma marca e não negrito: o que está valendo se vê de relance. */}
                    <span className="text-corpo text-white" style={{ opacity: i === velocidade ? 1 : 0 }}>
                      ✓
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}
        </div>

        <p className="mb-0 mt-1 text-corpo text-white/55">
          {naJornada
            ? `Módulo ${modulo.numero} • Aula ${aula.numero}`
            : `${modulo.titulo} • ${aula.numero} de ${modulo.aulas.length}`}
        </p>

        {/*
          A fileira de ações, em preto e branco.

          Dois grupos, como faz todo aplicativo de aula: à esquerda o que
          ela sente sobre a aula, à direita para onde ela vai. Nada de
          divisórias entre cinco itens iguais nem de cor para chamar
          atenção — numa tela que a aluna abre cinquenta vezes, cor vira
          ruído. O único destaque é o botão de concluir, e ele muda de
          estado, não de cor.
        */}
        <div className="flex flex-wrap items-center gap-3 pb-1 pt-4">
          <div
            className="flex items-center overflow-hidden rounded-pilula"
            style={{ border: `1px solid ${LINHA}` }}
          >
            <button
              onClick={() => void alternarCurtida(aula.id)}
              aria-label={curtiu(aula.id) ? "Descurtir" : "Curtir"}
              aria-pressed={curtiu(aula.id)}
              className="flex h-11 items-center gap-2 border-none bg-transparent px-4 text-realce hover:opacity-80"
              style={{ color: curtiu(aula.id) ? "#ffffff" : SUAVE, cursor: "pointer" }}
            >
              {curtiu(aula.id) ? "♥" : "♡"}
            </button>
            <span className="h-[18px] w-px flex-none" style={{ background: LINHA }} />
            <button
              onClick={() => {
                setComentariosAbertos(true);
                secaoComentarios.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              aria-label="Ir para os comentários"
              className="flex h-11 items-center gap-2 border-none bg-transparent px-4 text-corpo hover:opacity-80"
              style={{ color: SUAVE, cursor: "pointer" }}
            >
              <span className="text-realce leading-none">💬</span>
              {comentarios.length > 0 ? (
                <span className="text-corpo">{comentarios.length}</span>
              ) : null}
            </button>
          </div>

          <span className="flex-1" />

          <div className="flex items-center gap-3">
            <button
              onClick={irParaAnterior}
              aria-label="Aula anterior"
              className="grid h-11 w-11 place-items-center rounded-full bg-transparent text-secao hover:opacity-80"
              style={{ border: `1px solid ${LINHA}`, color: SUAVE, cursor: "pointer" }}
            >
              ←
            </button>

            <button
              onClick={marcarConcluida}
              aria-pressed={feita}
              /*
                Dos três botões desta linha, só este registra progresso
                — e tinha exatamente o mesmo peso das setas ← e →, que
                apenas mudam de página. As setas não podem encolher
                (44px é o alvo mínimo) nem perder contorno (3:1), então
                a distinção vem daqui: contorno pleno e negrito.
              */
              className="flex h-11 items-center gap-2 rounded-pilula px-6 text-corpo font-bold hover:opacity-90"
              style={{
                color: feita ? "#000000" : "#ffffff",
                background: feita ? "#ffffff" : "transparent",
                border: `1px solid ${feita ? "#ffffff" : "rgba(255,255,255,.8)"}`,
                cursor: "pointer",
              }}
            >
              <span className="text-corpo leading-none">✓</span>
              {feita ? "Concluída" : "Concluir"}
            </button>

            <button
              onClick={irParaProxima}
              aria-label="Próxima aula"
              className="grid h-11 w-11 place-items-center rounded-full bg-transparent text-secao hover:opacity-80"
              style={{ border: `1px solid ${LINHA}`, color: SUAVE, cursor: "pointer" }}
            >
              →
            </button>
          </div>
        </div>

        {/*
          A aplicação ganha a própria linha: é leitura, não navegação.

          Antes só aparecia depois de "Concluir", para a aluna assistir
          primeiro. Deixou de esperar: o resumo é a própria aula em
          texto, e quem está sem vídeo — ônibus, dado no fim, casa com
          internet fraca — precisa dele ANTES, não como prêmio.
        */}
        {blocos.length > 0 ? (
          <button
            onClick={() => setPainel("exercicio")}
            className="mt-3 flex min-h-[46px] w-full items-center gap-3 rounded-botao px-4 text-corpo hover:opacity-85"
            style={{
              color: "#ffffff",
              background: "transparent",
              border: `1px solid ${LINHA}`,
              cursor: "pointer",
            }}
          >
            <span className="text-corpo leading-none" style={{ color: SUAVE }}>
              ✎
            </span>
            <span className="flex-1 text-left">Ler esta aula</span>
            <span className="text-corpo leading-none" style={{ color: SUAVE }}>
              ›
            </span>
          </button>
        ) : null}

        {/*
          Tela cheia, e não sanfona.

          Sanfona empurrava o resto da página para baixo e obrigava a
          rolar entre a pergunta e a resposta. Isto é para LER: a tela
          inteira, só o texto, e uma saída visível no topo.

          Vai direto no `body`, por portal. Dentro da página não
          funcionava: `.entra` anima a tela com `transform`, e elemento
          com transform prende o `fixed` e o `z-index` dos filhos. O
          painel abria por baixo do cabeçalho do vídeo — medido: o ✕ de
          fechar da aula interceptava o clique do ✕ do painel.
        */}
        {painel === "exercicio"
          ? createPortal(
          <div
            className="fixed inset-0 z-[80] overflow-y-auto"
            style={{ background: cores.fundo }}
            role="dialog"
            aria-modal="true"
            aria-label="O texto desta aula"
          >
            <div className="mx-auto w-full max-w-[720px] px-5 pb-20 pt-5">
              <div className="mb-6 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-apoio" style={{ color: SUAVE }}>
                    Módulo {modulo.numero} · Aula {aula.numero}
                  </p>
                  <h2 className="mb-0 mt-1 text-secao font-bold text-white">
                    {aula.titulo}
                  </h2>
                </div>
                <button
                  onClick={() => setPainel("")}
                  aria-label="Fechar"
                  className="grid h-11 w-11 flex-none place-items-center border-none bg-transparent text-realce text-white/60 hover:text-white"
                  style={{ cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {blocos.map((paragrafo, i) => (
                <Paragrafo key={i} texto={paragrafo} />
              ))}

              {/* A frase do material vem do curso, escrita uma vez só. */}
              {modulo.avisoMaterial?.trim() ? (
                <p
                  className="mb-0 mt-8 rounded-botao p-4 text-apoio leading-[1.6]"
                  style={{ color: SUAVE, border: `1px solid ${LINHA}` }}
                >
                  {modulo.avisoMaterial}
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
            )
          : null}

        {/*
          Os conteúdos extras desta aula — outro áudio, um texto, um
          PDF, um link. O vídeo principal, a capa e o exercício
          continuam vindo de onde sempre vieram; isto é o que a aula
          ganhou além disso, na ordem definida no painel.

          A lista só chega até aqui se a política de `conteudos` no
          banco deixou: aula não liberada não devolve linha nenhuma.
        */}
        {extras.length > 0 ? (
          <section className="mt-8">
            <Conteudos itens={extras} />
          </section>
        ) : null}

        {/*
          Comentários.

          Convite primeiro, campo depois, lista fechada — a aluna acabou
          de assistir e o que se quer dela é a impressão fresca, não a
          leitura das outras. A lista abre num toque.

          Sem data e sem o carimbo de minuto: a data não ajudava a
          ninguém, e o minuto do vídeo virou promessa vazia quando o
          player passou a ser o do Cloudflare — clicar nele mexia numa
          barra que não é o vídeo. Quando o app conversar com o player
          de verdade, ele volta funcionando.
        */}
        <section
          ref={secaoComentarios}
          className="mt-5 rounded-botao p-4"
          style={{ background: "#101010", border: `1px solid ${LINHA}` }}
        >
          <p className="mb-3 mt-0 text-corpo text-white">
            O que você achou desta aula?{" "}
            <span className="font-bold underline underline-offset-4">Comente!</span>
          </p>

          <form onSubmit={enviarComentario} className="flex items-center gap-2">
            <input
              type="text"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              placeholder="Adicione seu comentário aqui"
              aria-label="Adicionar comentário"
              className="min-h-[46px] w-full flex-1 rounded-botao px-4 text-realce text-white"
              style={{ background: "transparent", border: `1px solid ${LINHA}` }}
            />
            {rascunho.trim() ? (
              <button
                type="submit"
                className="min-h-[46px] flex-none rounded-botao border-none px-4 text-corpo font-semibold hover:opacity-90"
                style={{ color: "#000000", background: "#ffffff", cursor: "pointer" }}
              >
                Enviar
              </button>
            ) : null}
          </form>

          <div className="mt-3 flex items-center">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-apoio" style={{ color: SUAVE }}>
              <input
                type="checkbox"
                checked={semNome}
                onChange={(e) => setSemNome(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#ffffff" }}
              />
              {semNome ? "Seu nome não aparecerá no comentário" : "Seu nome aparecerá no comentário — marque para ficar anônima"}
            </label>
            {comentarios.length > 0 ? (
              <button
                onClick={() => setComentariosAbertos((v) => !v)}
                aria-expanded={comentariosAbertos}
                /*
                  Tinha 13px de letra e nenhuma altura: ~20px de alvo,
                  numa tela em que todo o resto tem 44. E é por ele que
                  se chega aos comentários.
                */
                className="-mr-3 flex min-h-[44px] flex-none items-center border-none bg-transparent px-3 text-apoio underline underline-offset-4 hover:opacity-80"
                style={{ color: SUAVE, cursor: "pointer" }}
              >
                {comentariosAbertos
                  ? "Ocultar comentários"
                  : `Ver comentários (${comentarios.length})`}
              </button>
            ) : null}
          </div>

          {comentariosAbertos && buscandoComentarios ? (
            <div className="mt-4">
              <EsqueletoComentarios />
            </div>
          ) : null}

          {comentariosAbertos && !buscandoComentarios && conversas.length > 0 ? (
            /*
              A chave é a aula. Trocando de aula, a conversa é outra: a
              caixa de resposta que estivesse aberta apontava para um
              comentário que já não está na tela, e o rascunho dentro
              dela não tem mais onde ser publicado.
            */
            <Conversa key={aulaId} conversas={conversas} aoResponder={responder} />
          ) : null}

        </section>

        <h2
          className="mb-3 mt-7 text-rotulo font-bold uppercase tracking-rotulo"
          style={{ color: SUAVE }}
        >
          Aulas do módulo {modulo.numero}
        </h2>

        <div className="flex flex-col">
          {modulo.aulas.map((outra) => {
            const feitaOutra = concluida(outra.id);
            const travada = aulaBloqueada(modulo, outra);
            const abreEm = travada ? aulaAbreEm(outra.id) : null;
            const assistido = estado.percentualAssistido(outra.id);
            const atual = outra.ordem === ordem;
            return (
              <button
                key={outra.id}
                onClick={() => {
                  if (travada) {
                    const abre = aulaAbreEm(outra.id);
                    aviso.mostrar(
                      abre
                        ? `Esta aula abre ${quandoAbre(abre)}.`
                        : "Esta aula será liberada no momento certo da sua jornada.",
                    );
                    return;
                  }
                  navegar(`/aula/${modulo.id}/${outra.ordem}`);
                }}
                className="flex items-start gap-4 border-none bg-transparent py-3 text-left transition-opacity hover:opacity-[.82]"
                style={{ borderBottom: "1px solid rgba(255,255,255,.08)", cursor: "pointer" }}
              >
                <span
                  className="relative aspect-video flex-[0_0_clamp(126px,34vw,150px)] overflow-hidden rounded-mini"
                  style={{ background: cores.placeholderCapa }}
                >
                  <Capa
                    caminhos={[
                      capaAula(modulo.numero, outra.ordem),
                      capaModulo(modulo.numero),
                    ]}
                    alt={`Capa da Aula ${outra.numero} — ${outra.titulo}`}
                  />
                  <span
                    className="absolute inset-0"
                    style={{ background: travada ? "rgba(0,0,0,.62)" : "rgba(0,0,0,.28)" }}
                  />

                  {!travada && !feitaOutra ? (
                    <span
                      className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                      style={{ border: "2px solid rgba(255,255,255,.92)" }}
                    >
                      <span className="ml-1">
                        <Play tamanho={12} cor="#ffffff" />
                      </span>
                    </span>
                  ) : null}

                  {travada ? (
                    <span
                      className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
                      style={{ border: "2px solid rgba(255,255,255,.85)" }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 6,
                          border: "2px solid rgba(255,255,255,.9)",
                          borderBottom: "none",
                          borderRadius: "99px 99px 0 0",
                        }}
                      />
                      <span
                        style={{
                          width: 14,
                          height: 10,
                          background: "rgba(255,255,255,.9)",
                          borderRadius: 2,
                        }}
                      />
                    </span>
                  ) : null}

                  {feitaOutra && !travada ? (
                    <span
                      className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-secao"
                      style={{ color: "#000000", background: "#ffffff" }}
                    >
                      ✓
                    </span>
                  ) : null}

                  {/*
                    A etiqueta de duração saiu da miniatura.
                    Ela dizia "16:00" no canto da imagem e a linha ao
                    lado dizia "16 min" — a mesma informação duas vezes,
                    em dois formatos, a dois centímetros de distância.
                    Ficou a do texto, que é onde o olho já está lendo o
                    resto.
                  */}

                  {!travada && !feitaOutra && assistido > 0 ? (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[3px]"
                      style={{ background: "rgba(255,255,255,.28)" }}
                    >
                      <span
                        className="block h-full"
                        style={{ background: "#ffffff", width: `${assistido}%` }}
                      />
                    </span>
                  ) : null}

                  {atual ? (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[3px]"
                      style={{ background: cor.destaque }}
                    />
                  ) : null}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                  <span
                    className="text-corpo font-bold leading-[1.35]"
                    style={{ color: atual ? "#ffffff" : "rgba(255,255,255,.62)" }}
                  >
                    {outra.numero}. {outra.titulo}
                  </span>
                  <span className="text-apoio text-white/50">
                    {rotuloDuracao(modulo, outra)} ·{" "}
                    {travada
                      ? abreEm
                        ? `Abre ${quandoAbre(abreEm)}`
                        : "Bloqueada"
                      : feitaOutra
                        ? "Concluída"
                        : assistido > 0
                          ? "Em andamento"
                          : "Disponível"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Aviso mensagem={aviso.mensagem} aoFechar={aviso.limpar} />
    </main>
  );
}
