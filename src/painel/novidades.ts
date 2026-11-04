/*
 * Novidades do painel: as últimas atualizações, da mais nova para a mais antiga.
 * Aparece no botão "Novidades" do topo quando o dono deixa ligado.
 */
export type Novidade = { data: string; titulo: string; itens: string[] };

export const NOVIDADES: Novidade[] = [
  { data: "2026-11-04", titulo: "Publicação e liberação em tudo", itens: [
    "Todos os módulos, aulas, cursos e categorias usam agora a publicação separada do acesso (Liberado, Bloqueado, Oculto ou Rascunho).",
    "Na mentoria, depois da Aula 2 do Módulo 1, tudo está Publicado e Bloqueado até ser liberado numa data.",
    "Botão Atualizar recarrega o painel e volta para a mesma página.",
  ] },
  { data: "2026-11-04", titulo: "Publicação e liberação (em teste)", itens: [
    "Módulo 0, curso Bênçãos Ilimitadas e aulas do Módulo 0: publicação separada do acesso (Liberado, Bloqueado, Oculto ou Rascunho).",
    "Quatro formas de liberar: imediatamente, após um prazo, em uma data ou X dias após o cadastro da aluna.",
    "Resumo do status com data de criação, de publicação e de liberação.",
    "Salvar e Cancelar só aparecem quando algo é alterado.",
  ] },
  { data: "2026-11-04", titulo: "Módulos e aulas", itens: [
    "Cada módulo em cartão próprio, com as aulas num painel interno.",
    "Cabeçalho com contadores, busca, Expandir e Recolher.",
    "Seleção de vários módulos: Ativar, Bloquear, Duplicar e Excluir de uma vez, com confirmação.",
  ] },
  { data: "2026-11-03", titulo: "Cursos e conteúdos", itens: [
    "Nova lista de cursos com busca, filtros (categoria, status, publicação), ordem e cards ou lista.",
    "Visão geral do curso com capa, categoria, status e publicação.",
    "Só os cursos de verdade aparecem; as antigas categorias de Presentes saíram da lista de cursos.",
  ] },
  { data: "2026-11-02", titulo: "Categorias", itens: [
    "Nova tela de categorias em cards ou lista, com busca, visibilidade e ordem.",
    "Dentro da categoria: cursos dela, Novo curso e Adicionar existente.",
    "Nova categoria com capa, descrição, visibilidade e cursos; ao criar, abre a edição completa.",
    "Publicar separado de salvar e data de liberação da categoria.",
  ] },
];
