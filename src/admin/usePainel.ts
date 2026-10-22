import { useCallback, useEffect, useState } from "react";
import { useEstado } from "@/data/estado";
import type { Catalogo } from "@/data/tipos";
import * as dados from "./dados";
import type { AlunaAdmin } from "./dados";

export type Midia = { provider: string; ref: string };

/**
 * Dados do painel, sempre vindos do banco.
 *
 * Toda escrita é seguida de uma releitura: a tela mostra o que o banco
 * aceitou, não o que ela supôs que aconteceria. É mais chamadas, e é o
 * que impede o painel de divergir do que a aluna enxerga.
 */
/**
 * O catálogo com a ordem nova já aplicada.
 *
 * Todas as listas do painel e da área da aluna ordenam por `ordem`, e
 * por isso basta reescrever esse campo de quem está na lista nova: as
 * cinco listas se acertam sozinhas, sem saber qual delas mudou.
 *
 * Conteúdo leva `numero` junto — é o "1." na frente do nome, e no
 * banco `ordenar_aulas` grava os dois. Se aqui só andasse a `ordem`,
 * a numeração piscaria errada até a releitura chegar.
 */
function comNovaOrdem(c: Catalogo, ids: string[]): Catalogo {
  const posicao = new Map(ids.map((id, i) => [id, i]));
  if (posicao.size === 0) return c;

  const põe = <T extends { id: string; ordem: number }>(item: T): T => {
    const i = posicao.get(item.id);
    return i === undefined ? item : { ...item, ordem: i };
  };

  const aula = (a: Catalogo["modulos"][number]["aulas"][number]) => {
    const i = posicao.get(a.id);
    return i === undefined ? a : { ...a, ordem: i, numero: i + 1 };
  };

  const modulo = (m: Catalogo["modulos"][number]) =>
    põe({ ...m, aulas: m.aulas.map(aula).sort((x, y) => x.ordem - y.ordem) });

  const modulos = c.modulos.map(modulo).sort((x, y) => x.ordem - y.ordem);
  const porId = new Map(modulos.map((m) => [m.id, m]));

  const produtos = c.produtos
    .map((p) =>
      põe({
        ...p,
        modulos: p.modulos.map((m) => porId.get(m.id) ?? m).sort((x, y) => x.ordem - y.ordem),
        presentes: p.presentes.map(põe).sort((x, y) => x.ordem - y.ordem),
        conteudos: p.conteudos.map(põe).sort((x, y) => x.ordem - y.ordem),
      }),
    )
    .sort((x, y) => x.ordem - y.ordem);

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  const categorias = c.categorias
    .map((cat) =>
      põe({
        ...cat,
        produtos: cat.produtos
          .map((p) => produtoPorId.get(p.id) ?? p)
          .sort((x, y) => x.ordem - y.ordem),
        presentes: cat.presentes.map(põe).sort((x, y) => x.ordem - y.ordem),
      }),
    )
    .sort((x, y) => x.ordem - y.ordem);

  return { ...c, modulos, produtos, categorias };
}

export function usePainel() {
  const { recarregar: recarregarSessao } = useEstado();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo>({
    modulos: [],
    categorias: [],
    aoVivo: {},
    produtos: [],
    produtoJornada: null,
  });
  const [alunas, setAlunas] = useState<AlunaAdmin[]>([]);
  const [midiaAulas, setMidiaAulas] = useState<Map<string, Midia>>(new Map());
  const [midiaPresentes, setMidiaPresentes] = useState<Map<string, Midia>>(new Map());
  const [configuracao, setConfiguracao] = useState<dados.Configuracao>(
    dados.CONFIGURACAO_PADRAO,
  );

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      const [cat, lista, mAulas, mPresentes, cfg] = await Promise.all([
        dados.carregarCatalogo(),
        dados.listarAlunas(),
        dados.midiaDasAulas(),
        dados.midiaDosPresentes(),
        dados.carregarConfiguracao(),
      ]);
      setCatalogo(cat);
      setAlunas(lista);
      setMidiaAulas(mAulas);
      setMidiaPresentes(mPresentes);
      setConfiguracao(cfg);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Falha ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /**
   * Executa a escrita e relê. Devolve a mensagem de falha, ou null.
   *
   * `Promise<unknown>` e não `Promise<void>`: algumas escritas devolvem
   * valor — `definir_acesso` responde com a data gravada — e o que
   * interessa aqui é só ter esperado e relido.
   */
  const executar = useCallback(
    async (acao: () => Promise<unknown>): Promise<string | null> => {
      try {
        await acao();
        await recarregar();
        return null;
      } catch (falha) {
        const mensagem =
          falha instanceof Error ? falha.message : "Não foi possível salvar.";

        /*
         * `sem_permissao` aqui quase nunca é falta de permissão de
         * verdade: é a sessão ter deixado de ser de administradora.
         *
         * O navegador guarda UMA sessão. Entrando como aluna noutra aba
         * para conferir a experiência dela, a sessão da administradora é
         * substituída — e esta aba continua mostrando os dados de antes,
         * mas cada gravação sai com o token da aluna. O banco recusa,
         * corretamente, e a tela dizia apenas "sem_permissao".
         *
         * Reler a sessão faz o painel perceber e voltar para a entrada,
         * em vez de deixar você clicando contra uma parede.
         */
        if (mensagem.includes("sem_permissao")) {
          void recarregarSessao();
          return (
            "Sua sessão de administradora foi substituída — este navegador entrou " +
            "como aluna. Entre de novo para continuar. Para ver a área da aluna sem " +
            "perder o painel, use uma janela anônima."
          );
        }

        return mensagem;
      }
    },
    [recarregar, recarregarSessao],
  );

  /**
   * Reordenar: pinta primeiro, grava depois.
   *
   * A tela mudava só quando o banco respondia — e, com o arrasto,
   * esse era o tempo entre soltar e ver. Agora a ordem nova entra no
   * catálogo na hora, e a gravação segue pelo caminho de sempre.
   *
   * O banco continua sendo a autoridade: voltando igual, nada pisca;
   * recusando, a releitura desfaz a pintura e o aviso diz o que houve.
   */
  const reordenar = useCallback(
    async (ids: string[], escrever: () => Promise<unknown>): Promise<string | null> => {
      setCatalogo((c) => comNovaOrdem(c, ids));
      const falha = await executar(escrever);
      /*
       * Recusou: relê, e a releitura desfaz a pintura.
       *
       * `executar` só relê quando dá certo — e é o correto para as
       * outras escritas, onde a tela não adiantou nada. Aqui ela
       * adiantou: sem esta releitura a lista ficaria na ordem nova,
       * que o banco não tem, e o painel passaria a mentir.
       */
      if (falha) await recarregar();
      return falha;
    },
    [executar, recarregar],
  );

  return {
    carregando,
    erro,
    catalogo,
    alunas,
    midiaAulas,
    midiaPresentes,
    configuracao,
    recarregar,
    executar,
    reordenar,
  };
}

export type Painel = ReturnType<typeof usePainel>;
