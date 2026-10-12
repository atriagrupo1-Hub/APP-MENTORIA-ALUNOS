import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import { supabase } from "./supabase";
import type { AulaLiberada, PerfilSessao } from "./api";
import type { Aula, Catalogo, Modulo } from "./tipos";

/**
 * Estado da área da aluna.
 *
 * O Supabase é a única autoridade. Este arquivo pergunta e guarda a
 * resposta; não decide nada. Não havendo resposta, `erro` fica
 * preenchido e as telas não concedem acesso — nunca se cai para um
 * palpite local.
 */

const CATALOGO_VAZIO: Catalogo = {
  modulos: [],
  categorias: [],
  aoVivo: {},
  produtos: [],
  produtoJornada: null,
};

/**
 * Duração de demonstração, herdada do protótipo. Vale só enquanto
 * `aulas.duracao_segundos` estiver vazio; a plataforma grava a duração
 * real na primeira reprodução.
 */
export function duracaoDemo(numeroModulo: number, ordemAula: number): number {
  return 11 + ((numeroModulo * 5 + ordemAula * 7) % 15);
}

export function minutosDaAula(modulo: Modulo, aula: Aula): number {
  if (aula.duracaoSegundos) return Math.round(aula.duracaoSegundos / 60);
  return duracaoDemo(modulo.numero, aula.ordem);
}

export function rotuloDuracao(modulo: Modulo, aula: Aula): string {
  return `${minutosDaAula(modulo, aula)} min`;
}

export function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * O mesmo minuto, escrito como se fala: 7:12, não 07:12.
 *
 * O zero à frente serve num contador que corre, onde a largura não pode
 * mudar a cada minuto. Numa frase — "voltar aos 7:12" — ele só atrapalha.
 */
export function minutoFalado(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Estado = {
  carregando: boolean;
  erro: string | null;
  aluna: PerfilSessao | null;
  catalogo: Catalogo;

  entrar: (login: string, codigo: string) => Promise<string | null>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;

  aulaLiberada: (modulo: Modulo, aula: Aula) => boolean;
  aulaBloqueada: (modulo: Modulo, aula: Aula) => boolean;
  moduloLiberado: (modulo: Modulo) => boolean;
  /** Falso quando a aluna não tem nenhuma aula do módulo: fica oculto. */
  moduloVisivel: (modulo: Modulo) => boolean;
  /** Quando a primeira aula do módulo abre. Nulo se já abriu ou se não é dela. */
  moduloAbreEm: (modulo: Modulo) => string | null;
  /**
   * Quando esta aula abre. Nulo quando já abriu, quando não é dela, ou
   * quando ainda não há data marcada no cronograma.
   */
  aulaAbreEm: (aulaId: string) => string | null;
  presenteLiberado: (categoriaId: string, presenteId: string) => boolean;
  /** Produto de conteúdo direto: a aluna pode abrir? */
  produtoLiberado: (produtoId: string) => boolean;

  concluida: (aulaId: string) => boolean;
  percentualAssistido: (aulaId: string) => number;
  posicaoSegundos: (aulaId: string) => number;
  /** Quando ela mexeu nesta aula pela última vez. Nulo = nunca abriu. */
  atualizadaEm: (aulaId: string) => string | null;
  curtiu: (aulaId: string) => boolean;

  alternarConcluida: (aulaId: string) => Promise<boolean>;
  alternarCurtida: (aulaId: string) => Promise<void>;
  registrarPosicao: (
    aulaId: string,
    segundos: number,
    duracao: number,
    /** Grava agora, sem esperar os 15 segundos. Ver `registrarPosicao`. */
    agora?: boolean,
  ) => void;
};

const Contexto = createContext<Estado | null>(null);

export function ProvedorEstado({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aluna, setAluna] = useState<PerfilSessao | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo>(CATALOGO_VAZIO);
  const [liberadas, setLiberadas] = useState<Map<string, AulaLiberada>>(new Map());
  const [presentesLib, setPresentesLib] = useState<Set<string>>(new Set());
  const [produtosLib, setProdutosLib] = useState<Set<string>>(new Set());
  const [modulosDaAluna, setModulosDaAluna] = useState<Map<string, api.ModuloDaAluna>>(
    new Map(),
  );
  const [curtidasSet, setCurtidasSet] = useState<Set<string>>(new Set());
  /** Aula fechada -> quando abre. Só as que já têm data marcada. */
  const [aberturas, setAberturas] = useState<Map<string, string>>(new Map());

  /** Posição do vídeo em andamento, antes de chegar ao banco. */
  const posicoesLocais = useRef<Map<string, number>>(new Map());
  /*
   * Aulas que ela mexeu nesta visita, e quando.
   *
   * O banco só é relido quando a tela inteira recarrega. Sem esta
   * lembrança, ela assistiria dez minutos de uma aula, voltaria ao
   * Início e o bloco "continue de onde parou" ainda apontaria para a
   * aula anterior — o app saberia menos do que ela acabou de fazer.
   */
  const mexidasAgora = useRef<Map<string, string>>(new Map());
  const enviosPendentes = useRef<Map<string, number>>(new Map());

  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      if (!(await api.temSessao())) {
        setAluna(null);
        setCatalogo(CATALOGO_VAZIO);
        setLiberadas(new Map());
        setPresentesLib(new Set());
        setProdutosLib(new Set());
        setModulosDaAluna(new Map());
        setCurtidasSet(new Set());
        setAberturas(new Map());
        return;
      }

      const perfil = await api.meuPerfil();
      if (!perfil || perfil.status === "bloqueada") {
        await api.sair();
        setAluna(null);
        setErro(
          perfil?.status === "bloqueada"
            ? "Seu acesso está temporariamente suspenso. Fale com a equipe da mentoria."
            : null,
        );
        return;
      }
      setAluna(perfil);
      if (perfil.papel === "aluna") void api.marcarPresenca().catch(() => {});

      const [cat, aulas, likes, mods, abre] = await Promise.all([
        api.carregarCatalogo(),
        api.minhasAulas(),
        api.curtidas(),
        api.meusModulos(),
        api.minhasAberturas(),
      ]);

      setCatalogo(cat);
      setLiberadas(new Map(aulas.map((a) => [a.aulaId, a])));
      setCurtidasSet(likes);
      setModulosDaAluna(mods);
      setAberturas(abre);

      const idsPresentes = cat.categorias.flatMap((c) => c.presentes.map((p) => p.id));

      /*
       * Só os produtos de conteúdo DIRETO precisam de pergunta própria.
       * Quem tem módulo ou item já é decidido pela liberação deles, e
       * perguntar de novo seria uma ida ao banco por produto sem mudar
       * resposta nenhuma.
       */
      const idsProdutos = cat.produtos
        .filter((p) => p.modulos.length === 0 && p.presentes.length === 0)
        .map((p) => p.id);

      const [libPresentes, libProdutos] = await Promise.all([
        api.presentesLiberados(idsPresentes),
        api.produtosLiberados(idsProdutos),
      ]);
      setPresentesLib(libPresentes);
      setProdutosLib(libProdutos);
    } catch (falha) {
      // Sem resposta do banco, nada é liberado. É a regra do item 8.
      setLiberadas(new Map());
      setPresentesLib(new Set());
      setProdutosLib(new Set());
      setModulosDaAluna(new Map());
      setAberturas(new Map());
      setErro(
        falha instanceof Error
          ? `Não conseguimos carregar seus dados. ${falha.message}`
          : "Não conseguimos carregar seus dados.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  /*
   * O app precisa ficar sabendo quando a sessão morre.
   *
   * Não havia nenhum `onAuthStateChange` no projeto. O token dura uma
   * hora; quando a renovação falha — outra aba entrou com outra conta,
   * o aparelho dormiu, a rede caiu na hora errada — o cliente do
   * Supabase desiste da sessão e passa a mandar TODO pedido como
   * visitante anônimo. E o app não ficava sabendo: o React continuava
   * segurando o perfil em memória, o painel continuava desenhado, os
   * botões continuavam clicáveis, e cada um deles saía sem credencial.
   *
   * O banco recusava, corretamente. Mas a tela mostrava um painel vivo
   * operado por ninguém — os registros de produção de 17/09 têm dezenas
   * de `permission denied for function eh_admin` em sequência, que é o
   * banco dizendo "quem está falando comigo não é administradora".
   *
   * Daqui em diante a queda da sessão é um evento, não um mistério:
   * limpa o que está na tela e diz o que aconteceu, para a pessoa
   * entrar de novo em vez de ficar clicando contra uma parede.
   *
   * Só `SIGNED_OUT` age. `INITIAL_SESSION` e `SIGNED_IN` disparam no
   * carregamento e logo depois de `setSession`, e reagir a eles faria
   * o app recarregar em laço.
   */
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== "SIGNED_OUT") return;
      setAluna(null);
      setCatalogo(CATALOGO_VAZIO);
      setLiberadas(new Map());
      setPresentesLib(new Set());
      setProdutosLib(new Set());
      setModulosDaAluna(new Map());
      setCurtidasSet(new Set());
      setAberturas(new Map());
      setCarregando(false);
      setErro("Sua sessão expirou. Entre de novo para continuar.");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const entrar = useCallback<Estado["entrar"]>(
    async (login, codigo) => {
      const r = await api.entrar(login, codigo);
      if (!r.ok) return r.falha.mensagem;
      await carregarTudo();
      return null;
    },
    [carregarTudo],
  );

  const sair = useCallback<Estado["sair"]>(async () => {
    await api.sair();
    setAluna(null);
    setCatalogo(CATALOGO_VAZIO);
    setLiberadas(new Map());
    setPresentesLib(new Set());
    setProdutosLib(new Set());
    setModulosDaAluna(new Map());
    setCurtidasSet(new Set());
    posicoesLocais.current.clear();
  }, []);

  const aulaLiberada = useCallback<Estado["aulaLiberada"]>(
    (_modulo, aula) => liberadas.has(aula.id),
    [liberadas],
  );

  const moduloLiberado = useCallback<Estado["moduloLiberado"]>(
    (modulo) => modulo.aulas.some((a) => liberadas.has(a.id)),
    [liberadas],
  );

  /**
   * O módulo é o retrato das aulas dela: sem nenhuma atribuída, some da
   * tela. Não é bloqueio — é ausência.
   */
  const moduloVisivel = useCallback<Estado["moduloVisivel"]>(
    (modulo) => modulosDaAluna.has(modulo.id),
    [modulosDaAluna],
  );

  const moduloAbreEm = useCallback<Estado["moduloAbreEm"]>(
    (modulo) => {
      const info = modulosDaAluna.get(modulo.id);
      if (!info || info.abertas > 0) return null;
      return info.proximaAbertura;
    },
    [modulosDaAluna],
  );

  const aulaAbreEm = useCallback<Estado["aulaAbreEm"]>(
    (aulaId) => aberturas.get(aulaId) ?? null,
    [aberturas],
  );

  const concluida = useCallback<Estado["concluida"]>(
    (aulaId) => liberadas.get(aulaId)?.concluida ?? false,
    [liberadas],
  );

  /**
   * Bloqueada é o contrário de liberada, e ponto. Quem decide é a tabela
   * `acessos`; a tela não inventa sequência.
   */
  const aulaBloqueada = useCallback<Estado["aulaBloqueada"]>(
    (_modulo, aula) => !liberadas.has(aula.id),
    [liberadas],
  );

  const presenteLiberado = useCallback<Estado["presenteLiberado"]>(
    (_categoriaId, presenteId) => presentesLib.has(presenteId),
    [presentesLib],
  );

  const produtoLiberado = useCallback<Estado["produtoLiberado"]>(
    (produtoId) => produtosLib.has(produtoId),
    [produtosLib],
  );

  const posicaoSegundos = useCallback<Estado["posicaoSegundos"]>(
    (aulaId) => posicoesLocais.current.get(aulaId) ?? liberadas.get(aulaId)?.posicaoSegundos ?? 0,
    [liberadas],
  );

  /*
   * A data que o banco devolveu, ou agora, se ela mexeu nesta aula
   * depois de a tela ter carregado. Sem essa segunda metade, assistir
   * uma aula e voltar para o Início mostraria a aula de antes.
   */
  const atualizadaEm = useCallback<Estado["atualizadaEm"]>(
    (aulaId) =>
      mexidasAgora.current.get(aulaId) ?? liberadas.get(aulaId)?.atualizadaEm ?? null,
    [liberadas],
  );

  const percentualAssistido = useCallback<Estado["percentualAssistido"]>(
    (aulaId) => {
      const info = liberadas.get(aulaId);
      if (!info?.duracaoSegundos) return 0;
      const posicao = posicoesLocais.current.get(aulaId) ?? info.posicaoSegundos;
      return Math.min(100, Math.round((posicao / info.duracaoSegundos) * 100));
    },
    [liberadas],
  );

  const curtiu = useCallback<Estado["curtiu"]>(
    (aulaId) => curtidasSet.has(aulaId),
    [curtidasSet],
  );

  const alternarConcluida = useCallback<Estado["alternarConcluida"]>(
    async (aulaId) => {
      const virou = !concluida(aulaId);
      await api.marcarConcluida(aulaId, virou);
      setLiberadas((atual) => {
        const proxima = new Map(atual);
        const info = proxima.get(aulaId);
        if (info) proxima.set(aulaId, { ...info, concluida: virou });
        return proxima;
      });
      return virou;
    },
    [concluida],
  );

  const alternarCurtida = useCallback<Estado["alternarCurtida"]>(async (aulaId) => {
    const agoraCurtida = await api.alternarCurtida(aulaId);
    setCurtidasSet((atual) => {
      const proxima = new Set(atual);
      if (agoraCurtida) proxima.add(aulaId);
      else proxima.delete(aulaId);
      return proxima;
    });
  }, []);

  /**
   * A posição vai para o banco a cada 15 segundos de reprodução, como
   * pede o item (H) do modelo — não a cada segundo.
   *
   * `agora` fura essa espera. O player pede isso quando ela pausa,
   * quando a aula acaba e quando ela sai do aplicativo: são justamente
   * os momentos em que "onde eu parei" é decidido, e economizar uma
   * gravação ali custava até quinze segundos de aula na volta. Durante
   * a reprodução a espera continua valendo — é o que impede uma aula de
   * vinte minutos de virar mil gravações.
   */
  const registrarPosicao = useCallback<Estado["registrarPosicao"]>(
    (aulaId, segundos, duracao, agora = false) => {
      posicoesLocais.current.set(aulaId, segundos);
      const ultimo = enviosPendentes.current.get(aulaId) ?? -Infinity;
      if (!agora && Math.abs(segundos - ultimo) < 15) return;
      enviosPendentes.current.set(aulaId, segundos);
      mexidasAgora.current.set(aulaId, new Date().toISOString());
      void api.salvarPosicao(aulaId, segundos).catch(() => undefined);
      const info = liberadas.get(aulaId);
      if (info && !info.duracaoSegundos && duracao > 0) {
        void api.registrarDuracao(aulaId, duracao).catch(() => undefined);
      }
    },
    [liberadas],
  );

  const valor = useMemo<Estado>(
    () => ({
      carregando,
      erro,
      aluna,
      catalogo,
      entrar,
      sair,
      recarregar: carregarTudo,
      aulaLiberada,
      aulaBloqueada,
      moduloLiberado,
      moduloVisivel,
      moduloAbreEm,
      aulaAbreEm,
      presenteLiberado,
      produtoLiberado,
      concluida,
      percentualAssistido,
      posicaoSegundos,
      atualizadaEm,
      curtiu,
      alternarConcluida,
      alternarCurtida,
      registrarPosicao,
    }),
    [
      carregando,
      erro,
      aluna,
      catalogo,
      entrar,
      sair,
      carregarTudo,
      aulaLiberada,
      aulaBloqueada,
      moduloLiberado,
      moduloVisivel,
      moduloAbreEm,
      aulaAbreEm,
      presenteLiberado,
      produtoLiberado,
      concluida,
      percentualAssistido,
      posicaoSegundos,
      atualizadaEm,
      curtiu,
      alternarConcluida,
      alternarCurtida,
      registrarPosicao,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): Estado {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useEstado precisa estar dentro de ProvedorEstado");
  return valor;
}
