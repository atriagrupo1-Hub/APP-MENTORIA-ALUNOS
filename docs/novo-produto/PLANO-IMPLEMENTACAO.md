# Plano de implementação — Novo produto (modelo → painel real)

Fonte da verdade do que construir: `ESPECIFICACAO.md` (versão 298) e `modelo-novo-produto.html` (abrir no navegador para ver cada tela).
Pedido do dono (18/11/2026): aplicar o modelo **100%** no painel e no app do aluno, e publicar.

## Regras que valem durante toda a implementação (CLAUDE.md)
- Trabalhar no branch da sessão + **prévia** (`bash scripts/previa.sh painel` / `app`). Produção (`claude/new-session-3krqjt`) só no fim, com "publique".
- Banco é um só (prévia e produção): cada migração é aplicada uma vez, testada, e precisa ser compatível com o que está no ar (só adicionar colunas/tabelas; nada de apagar/renomear coluna em uso).
- Supabase é a única autoridade (status, liberação, progresso). `localStorage` só cache. Chave de serviço só em Edge Function. `entrar` continua a única com `verify_jwt:false`.
- Texto na tela: "aluno/alunos". Nenhuma tela com rolagem para os lados.

## Tabelas que já existem (usadas pelo painel hoje)
`produtos`, `modulos`, `aulas`, `conteudos`, `aula_midia`, `categorias`, `categorias_aba`, `categoria_itens`, RPCs `salvar_liberacao`, `definir_bloqueio_aula`, `ordenar_lista`, `ordenar_aulas`, `moderar_comentario`, `responder_comentario`, `remover_produto`.

## Fases (cada fase: migração se precisar → painel → app do aluno → teste equipe + aluno → prévia)

1. **Banco — campos novos** (uma migração, aditiva)
   - `produtos` / `modulos` / `aulas` / `categorias`: `publicacao` (`publicado` | `nao_publicado`) e `liberacao` (`liberado` | `bloqueado` | `agendado` | `oculto`), + regra de liberação (`imediata` | `dias` | `data`, dias, data/hora).
   - Aparência do card (JSON) e capas (deitada/em pé) para produto e categoria; `formato` da categoria; descrição/rótulo/texto do botão da categoria.
   - Número do módulo único por produto; tipo e duração da aula.
   - Mapear valores antigos de status para os dois campos novos (sem apagar a coluna antiga até o app usar só os novos).
2. **Lista de produtos**: card com Publicação ▾ / Liberação ▾, sem Criado/Liberado em, filtros, cards/lista, vários cursos em criação.
3. **Criar / editar curso** (Formato · Categoria · Informações · Capa · Aparência), capa com ajuste/IA, campos obrigatórios em vermelho, Cancelar/Voltar/Salvar, janela "Curso criado → Adicionar conteúdo agora/depois".
4. **Conteúdo do curso**: topo com totais, "+ Adicionar conteúdo" (janela Módulo/Aula/Material), vazio, cartões/lista, busca/filtro/inverter, módulos e aulas com status, Liberação, Editar, Ver, ⋮ (duplicar, excluir com EXCLUIR), seleção em massa, janela "Módulo salvo".
5. **Página do produto** (abas Sobre · Conteúdo · Engajamento · Comentários · Alunos · Ranking) com dados reais (`+ Aluno`, filtros, ranking — regra de pontos a definir com o dono).
6. **Categorias**: vazio, lista no layout de produtos, criar/editar no mesmo fluxo do curso, página da categoria (card real, Cursos da categoria, Adicionar curso com busca/filtros), excluir.
7. **App do aluno**: respeitar publicação × liberação (cadeado, agendado, oculto), card de categoria/curso com a aparência salva.
8. **Revisão final** em prévia (equipe e aluno, celular e computador) → dono aprova → "publique".

## Como começar (conversa nova)
Mensagem sugerida: "Implementar o novo produto conforme docs/novo-produto/PLANO-IMPLEMENTACAO.md, começando pela Fase 1 (banco) e Fase 2. Pode aplicar as migrações aditivas."

## Andamento
- 18/11 — Fase 2 (parte 1) na prévia: card da lista de produtos com Publicação ▾ (rascunho) e Liberação ▾ (Liberado / Bloqueado / Oculto + Agendado quando há data futura), sem a data de criação. Nova ação `curso-pub` (permissão cur_estado). Sem mudança no banco: os campos já existem (`rascunho`, `publicado`, `bloqueado_geral`, `libera_em`).
- Descoberta: o painel real é claro (tema do painel), o modelo é escuro/dourado — aplicar o layout do modelo, mantendo as cores do painel, salvo pedido contrário.
