# Novo produto — especificação para implementar de verdade

Fonte da verdade do desenho: `modelo-novo-produto.html` (cópia do modelo
ilustrativo https://claude.ai/artifact/RRBW66hGuHEDfQekbE9z1N, versão 196,
18/11/2026). Abra no navegador para ver o comportamento. Tudo aqui foi
pedido e aprovado pelo dono no modelo; a implementação real vai para o
painel (`src/painel/painel.ts` + `painel.css`) e para o app do aluno
(`src/aluna/area.ts` + `area.css`), com dados no Supabase.

> O modelo guarda tudo no navegador (sessionStorage/localStorage/IndexedDB)
> e usa IA pelo `window.claude`. **No produto real:** dados, capas, arquivos
> e status vêm do Supabase (única autoridade); IA via Edge Functions; vídeo
> no Cloudflare Stream ou link do YouTube. `localStorage` nunca é fonte.

Regras gerais

- Texto na tela: sempre "aluno/alunos", nunca "aluna/alunas".
- Vídeo de aula: arquivo (Cloudflare Stream) ou link YouTube (inclusive não listado) / Cloudflare Stream.
- Ordem de construção: vídeo-aula primeiro; depois e-book; depois áudio. Qualquer aula pode ser vídeo, áudio ou e-book.
- "?" mostra explicação só com o mouse em cima (não fixa ao clicar).
- Nenhum clique pode fazer a tela pular: ao abrir algo, a tela vai até ele; ao fechar, fica onde está.
- Avisos: toast pequeno (1,5 s) ou grande centralizado (1,8 s); carregamento com logo AIŌN.

## 1. Lista de produtos

- Menu lateral: só "Produtos" (ícone play) e "Categorias" (ícone pasta), sem o título "Conteúdo".
- Abas por tipo (Todos/Vídeo/E-book/Áudio com contagem), busca, filtros em lista suspensa (categoria, status), Ordenar (Mais recentes padrão, Mais antigos, preço, Mais alunos, Menos alunos, Nome A–Z por último), alternar Cards/Lista.
- Card: capa, tipo, NOME, categoria, Módulos/Aulas/Alunos, Criado em, Liberado em, status, botão ("Abrir produto →" ou "Continuar edição →" no rascunho).
- Modo lista: capa 200 px, nome 13 px; "Aulas" embaixo de "Módulos" e "Alunos" ao lado (grade 2 colunas).

## 2. Criar curso (vídeo-aula)

Cabeçalho "Curso, categoria e aparência" (texto simples, não botão) com "?", progresso "N DE 5 · %" e etapas em pílulas.

1. Formato — cards, nada pré-selecionado, "?".
2. Categoria — cards + "+ Nova categoria" (só é criada ao salvar).
3. Informações — texto em cima do nome, nome (rótulo muda pelo formato), descrição (✦ Gerar com IA, ✦ Corrigir texto, Desfazer), texto do botão (✦ Gerar com IA). Todos obrigatórios.
4. Capa do curso — opcional; 16:9 e 2:3 (e-book só 2:3). Enviar/arrastar, Ajustar (mover, zoom 0,4–3 com desfazer, girar com barra/clique segurado/Shift+roda com desfazer, Centralizar, Salvar → 1920×1080 ou 1000×1500), Gerar com IA.
5. Aparência — esquerda: textos com "Aa Estilo" (fonte, normal/negrito/itálico, alinhamento, tamanho, cor com seletor/hex/conta-gotas/recentes, sombra; ↻ padrão, ✕, Aplicar/Cancelar → "Salvo."); Visual: Card, Botão, Barra (cores, espessura, cantos, sombra X/Y, desfoque, opacidade, ↻). Direita: prévia Celular/Tablet/Computador. Botão "Salvar curso".

Rodapé: Cancelar (esquerda) · Voltar (a partir da 2ª etapa) · Próximo / Salvar. **Não existe "Salvar rascunho"**: tudo é "Salvar" (Salvar curso, Salvar módulo, Salvar aula) e salvar já guarda; publicar é uma etapa depois.
Cancelar sempre pergunta: "Sair sem salvar?" → Continuar editando / Salvar e sair / Sim, sair sem salvar.

## 3. Curso criado (resumo)

- Esquerda: quadro de informações — selo "Curso" com ícone, status (Rascunho/Publicado/Bloqueado/Oculto, colorido, editável) + menu ⋮ (Ver como aluno, Duplicar, Excluir); NOME em serifada maiúscula; "Categoria: X"; quadros Módulos, Aulas, Alunos (Alunos por último); linha Data de criação | Liberado em | Progresso (barra); botão "Editar curso".
- Direita: "Card do curso" com "?" ("Este é o card do curso do jeito que o aluno vê dentro do aplicativo") e a prévia do card (clicar edita o curso).

## 4. Conteúdo do curso

- Título "Conteúdo do curso" + "?" ("Organize os módulos e aulas, defina a liberação e gerencie o status do conteúdo."); à direita "+ Adicionar" → menu:
  - Módulo → criação do módulo.
  - Aula → janela "escolha o módulo" → criação da aula naquele módulo.
  - Material → escolhe módulo → escolhe aula → abre a aula na parte Material complementar.
- Barra: escolha do módulo ("Módulo 1 – Nome (N aulas)"); ordem muda arrastando pelo ⋮⋮ (sem setas); campo "Pesquisar aula, módulo, material…" (busca sem acento em nome/descrição do módulo, nome/descrição/tipo da aula e título/tipo/arquivo dos materiais; em "Por módulos" mostra só os módulos com resultado, já abertos e só com as aulas encontradas; "Nada encontrado para “x”." quando vazio); à direita Visualização (Por módulos | Por aulas) e Filtrar (Ordem do curso, Nome A–Z, Últimos adicionados, Liberados). Filtro só muda a exibição.
- Card do módulo (mesmas colunas da aula, alinhadas): caixinha de seleção, ⋮⋮ arrastar, capa (sem imagem: "MÓDULO" + "01"), "MÓDULO 1   NOME" (separados por espaço, fonte/cor/negrito/maiúsculas vindos da Aparência do módulo; tamanho da lista), Criado em, Liberado em, Visualizações, status (Publicado/Não publicado/Rascunho), Editar, ⋮ (Editar módulo, Publicar/Despublicar, Excluir com confirmação). Módulo selecionado com borda dourada. Clicar no card só seleciona.
- "▶ Aulas do módulo (N) ⌄" sempre visível embaixo do card: clicar abre/fecha as aulas (fechadas por padrão).
- Linha da aula: caixinha, ⋮⋮, miniatura (capa do vídeo ou play), etiqueta VÍDEO/ÁUDIO/E-BOOK + NOME, Criado em, Liberado em, Visualizações, status, Editar, ⋮ (Editar, Publicar/Despublicar, Excluir). "+ Adicionar aula" embaixo da última aula.
- Telas estreitas: datas descem para uma 2ª linha; nada pode se sobrepor (itens escondidos guardam espaço).

## 5. Módulo (painel lateral por cima — opção B aprovada)

- "Adicionar → Módulo" e "Editar" abrem painel à direita com fundo escurecido; topo fixo "Novo módulo/Editar módulo", progresso "N DE 3", etapas, ✕. Fechar (✕, clique fora, Esc) pergunta antes. Ao salvar fecha e o módulo aparece na lista.
- Etapas: 1 Informações (Identificação "?", Número "?", Nome "?", Descrição com IA/Corrigir, Texto do botão com IA e "?": "É o botão do card do módulo. Ao tocar, abre a lista de aulas do módulo para o aluno escolher qual quer assistir, mesmo que só uma esteja liberada.") → 2 Capa do módulo (só 16:9, opcional, mesmo ajuste/IA) → 3 Aparência do módulo (igual à do curso + "Copiar aparência do curso") → "Salvar módulo".
- Número: obrigatório; já vem sugerido o próximo (maior + 1); repetido → "Já tem um módulo com esse número." e não avança.
- Cada módulo guarda sua aparência (estilos e visual) e ela volta ao editar.
- Prévia do card do módulo: o botão abre a lista de aulas (miniatura, "MÓDULO 1 · AULA 1", nome, "Disponível", "▶ Assistir") e vira "Esconder aulas" — igual ao app do aluno.
- "Salvar e sair" no Cancelar guarda o módulo incompleto com selo Rascunho.

## 6. Aula (janela)

- Tipo Vídeo/Áudio/E-book → Conteúdo da aula com "?" (Formato, Tamanho máximo, Proporção 16:9 1920×1080) → envio com % e "Cancelar envio" (salva sozinho ao terminar) ou link YouTube/Cloudflare; player e aviso se não for 16:9.
- Capa do vídeo (opcional): botão "+ Adicionar capa do vídeo" abre o mesmo quadro de capa (enviar, ajustar, IA).
- Nome da aula, Descrição da aula (✦ Gerar com IA usando documentos da aula, ✦ Corrigir texto, Desfazer).
- Material complementar: +PDF/+Áudio/+Texto. PDF também tem "✦ Gerar PDF com IA": título, documentos da aula (os mesmos da descrição + novos), contexto ("retire do PDF o resumo de X"), mostra o PDF gerado para ler → Refazer / Salvar PDF.
- Rodapé: Cancelar (pergunta) · Voltar (pergunta só se mudou algo) · Salvar aula. "Salvar e sair" guarda a aula incompleta com selo Rascunho.

## 7. IA (no real: Edge Functions)

- Gerar descrição (curso/módulo/aula): arquivos PDF/Word/texto + contexto → texto editável até 180 caracteres → Salvar descrição.
- Corrigir texto: pontuação, acentos, organização; nunca muda CAIXA ALTA.
- Gerar texto do botão: sugestões.
- Gerar capa: + Modelo (imagens de referência), contexto (opcional com modelo), texto da capa → prévia → Refazer/Baixar/Usar esta.
- Gerar PDF do material: ver seção 6.

## Arquivos de referência nesta pasta

- `modelo-novo-produto.html` — o modelo completo e interativo.
- `opcoes-lista-modulos.html` — 3 modelos de lista de módulos (base do desenho final da seção 4).
- `opcoes-onde-abre-modulo.html` — onde abre o novo módulo (aprovada a opção B, painel lateral).
