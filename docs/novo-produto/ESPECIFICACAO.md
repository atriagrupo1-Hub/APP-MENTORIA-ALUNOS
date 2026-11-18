# Novo produto — especificação para implementar de verdade

Fonte da verdade do desenho: `modelo-novo-produto.html` (cópia do modelo
ilustrativo https://claude.ai/artifact/RRBW66hGuHEDfQekbE9z1N, versão 223,
18/11/2026). Abra no navegador para ver o comportamento. Tudo aqui foi
pedido e aprovado pelo dono no modelo; a implementação real vai para o
painel (`src/painel/painel.ts` + `painel.css`) e para o app do aluno
(`src/aluna/area.ts` + `area.css`), com dados no Supabase.

> O modelo guarda tudo no navegador (sessionStorage/localStorage/IndexedDB)
> e usa IA pelo `window.claude`. **No produto real:** dados, capas, arquivos
> e status vêm do Supabase (única autoridade); IA via Edge Functions; vídeo
> no Cloudflare Stream ou link do YouTube. `localStorage` nunca é fonte.

Regras gerais

- **Rascunho não existe.** Status: Não publicado (padrão ao salvar), Publicado, Bloqueado, Oculto. "Não publicado" é o que antes seria rascunho: salvar nunca publica sozinho; fica Não publicado até a liberação ser configurada. Nada de "Salvar rascunho" nem selo "Rascunho" em curso, módulo, aula ou lista.

- Texto na tela: sempre "aluno/alunos", nunca "aluna/alunas".
- Vídeo de aula: arquivo (Cloudflare Stream) ou link YouTube (inclusive não listado) / Cloudflare Stream.
- Ordem de construção: vídeo-aula primeiro; depois e-book; depois áudio. Qualquer aula pode ser vídeo, áudio ou e-book.
- "?" mostra explicação só com o mouse em cima (não fixa ao clicar).
- **Descrição é obrigatória** no curso, no módulo e na aula (não avança/salva sem ela).
- **Obrigatórios sem preencher (janela da aula):** ao clicar "Salvar aula", cada card que falta fica com borda vermelha e a mensagem embaixo (Tipo, Conteúdo, Nome, Descrição, Liberação — na ordem da tela); o rodapé mostra "Falta preencher: …" na mesma ordem e a tela vai até o primeiro. O vermelho some sozinho conforme preenche.
- **Excluir (curso, módulo, aula, em massa): sempre pede para digitar EXCLUIR** (exatamente, em maiúsculas) antes de liberar o botão Excluir; Enter confirma quando está certo. "Excluir curso" no ⋮ do curso apaga o curso com módulos e aulas e volta para a lista.
- Menus (⋮, + Adicionar): abrem para cima quando não cabem embaixo (nunca ficam cortados); fecham ao clicar fora, ao clicar de novo no mesmo botão, com Esc ou ao rolar a página.
- Nenhum clique pode fazer a tela pular: ao abrir algo, a tela vai até ele; ao fechar, fica onde está. Trocar visualização, filtro ou pesquisa mantém a barra no mesmo lugar da tela (se a lista encolher, guarda o espaço embaixo em vez de subir a página).
- Avisos: toast pequeno (1,5 s) ou grande centralizado (1,8 s); carregamento com logo AIŌN.

## 1. Lista de produtos

- Menu lateral: só "Produtos" (ícone play) e "Categorias" (ícone pasta), sem o título "Conteúdo".
- Abas por tipo (Todos/Vídeo/E-book/Áudio com contagem), busca, filtros em lista suspensa (categoria, status), Ordenar (Mais recentes padrão, Mais antigos, preço, Mais alunos, Menos alunos, Nome A–Z por último), alternar Cards/Lista.
- Card: capa, tipo, NOME, categoria, Módulos/Aulas/Alunos, Criado em, Liberado em, status, botão ("Abrir produto →" ou "Continuar edição →" no produto em montagem).
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

- Esquerda: quadro de informações — selo "Curso" com ícone, status (Não publicado/Publicado/Bloqueado/Oculto, colorido, editável) + menu ⋮ (Ver como aluno, Duplicar, Excluir); NOME em serifada maiúscula; "Categoria: X"; quadros Módulos, Aulas, Alunos (Alunos por último); linha Data de criação | Liberado em | Progresso (barra); botão "Editar curso".
- Direita: "Card do curso" com "?" ("Este é o card do curso do jeito que o aluno vê dentro do aplicativo") e a prévia do card (clicar edita o curso).

### Liberação do curso

- Botão "Liberação" ao lado de "Editar curso" abre a janela "Liberação do curso" com 3 opções (cards):
  - Imediata — fica disponível assim que confirmar.
  - Dias após o cadastro — campo "Liberar [N] dias após o cadastro do aluno" (conta para cada aluno).
  - Data específica — data + hora.
- "Continuar" valida (escolher tipo, dias ≥ 0, data) → "Confirmar liberação": resumo com Curso, Tipo de liberação, Liberado em, Status depois de confirmar → Voltar / Confirmar liberação.
- Ao confirmar: "Liberado em" do quadro mostra a data (ou "N dias após o cadastro" / "dd/mm/aaaa às hh:mm") e embaixo o tipo (Imediata / Dias após o cadastro / Data específica). Status: Imediata e Dias → Publicado; Data futura → Agendado. O status do curso segue a liberação automaticamente: escolher Publicado ou Agendado no seletor abre a Liberação (não dá para marcar à mão); Agendado vira Publicado sozinho quando chega a data/hora. Não publicado, Bloqueado e Oculto continuam manuais.
- No real: regra de liberação no Supabase (a liberação por aluno conta da data de cadastro dele).

### Liberação do módulo

- Separada da do curso e feita só no módulo. Botão "Liberação" na linha do módulo, entre o status e "Editar" (na aula fica um espaço do mesmo tamanho para manter as colunas alinhadas), e também no topo do painel do módulo ao criar/editar ("Liberação: 05/12/2026"): dá para configurar antes ou depois.
- Janela "Liberação" com 3 abas em sequência: **1 Módulo** (Imediata / Dias após o cadastro / Data específica → "Salvar e escolher as aulas") → **2 Aulas (N)** (cada aula do módulo: Junto com o módulo [padrão] / Dias após o cadastro / Data específica / Trancada, com os campos de dias ou data/hora → "Salvar e ver o resumo") → **3 Resumo** (módulo: liberado em, tipo, status; lista das aulas com a liberação de cada uma; avisos: curso ainda não liberado; todas as aulas trancadas) → "Confirmar liberação".
- Ao confirmar: aula "Junto com o módulo" herda data/status do módulo; "Trancada" fica Bloqueado; dias/data viram Liberado ou Agendado.
- Na lista: "Liberado em" mostra a data curta ("05/12/2026", "+10 dias") e embaixo o tipo ("Às 09:00", "Após o cadastro", "Imediata"); status vira Liberado (ou Agendado se a data é futura).
- No painel ao criar: a escolha fica guardada e vale ao clicar "Salvar módulo".
- Regra (para o real): curso → módulo → aula; o aluno só vê o que está liberado em toda a cadeia. A liberação das aulas é feita dentro da liberação do módulo (aba Aulas).

### Liberação da aula

- Botão "Liberação" na linha de cada aula (mesma coluna do botão do módulo). Na janela da aula (criar/editar), a liberação fica aberta como seção "Liberação da aula" logo depois de "Material complementar" (cards de opção já visíveis; **obrigatória e sem nada pré-selecionado** na aula nova — não salva sem escolher; ao editar, mostra a já escolhida; vale ao clicar "Salvar aula"; valida dias/data).
- Opções: Junto com o módulo (padrão) / Dias após o cadastro / Data específica / Trancada → resumo (Aula, Módulo, Liberado em, Status) → Confirmar. Avisa se o módulo ainda não está liberado (o aluno só vê a aula depois do módulo).
- Resultado: Junto com o módulo herda do módulo (sem liberação no módulo → Não publicado); Trancada → Bloqueado; dias/data → Liberado ou Agendado.

## 4. Conteúdo do curso

- Título "Conteúdo do curso" + "?" ("Organize os módulos e aulas, defina a liberação e gerencie o status do conteúdo."); à direita "+ Adicionar" → menu:
  - Módulo → criação do módulo.
  - Aula → janela "escolha o módulo" → criação da aula naquele módulo.
  - Material → escolhe módulo → escolhe aula → abre a aula na parte Material complementar.
- Barra: escolha do módulo ("Módulo 1 – Nome (N aulas)"); ordem muda arrastando pelo ⋮⋮ (sem setas); campo "Pesquisar aula, módulo, material…" (busca sem acento em nome/descrição do módulo, nome/descrição/tipo da aula e título/tipo/arquivo dos materiais; em "Por módulos" mostra só os módulos com resultado, já abertos e só com as aulas encontradas; "Nada encontrado para “x”." quando vazio); à direita Visualização (Por módulos | Por aulas), Filtrar (Ordem do conteúdo [padrão], Nome A–Z, Últimos liberados, Últimos adicionados, Mais assistidos, Módulo com mais aulas) + grupo Status no mesmo seletor (Liberado, Agendado, Não publicado, Oculto, Bloqueado: mostra só módulos/aulas com esse status, abrindo o módulo nas aulas encontradas) e a flechinha ⇅ que inverte a ordem escolhida (ex.: últimos liberados ↔ primeiros liberados; os ainda não liberados ficam sempre no fim). Filtro só muda a exibição.
- Card do módulo (mesmas colunas da aula, alinhadas): caixinha de seleção, ⋮⋮ arrastar, capa (sem imagem: "MÓDULO" + "01"), "Módulo 0 — Boas-vindas e diagnóstico" (texto normal, Manrope 17 px, branco; se não couber, continua na linha de baixo), Criado em, Liberado em (sem Visualizações no módulo; o espaço fica vazio para manter as colunas alinhadas com as aulas), status (Liberado/Agendado/Não publicado/Oculto/Bloqueado), Editar, ⋮ (Editar módulo, Liberar/Agendar/Não publicar/Ocultar/Bloquear, Excluir com confirmação). Módulo selecionado com borda dourada. Clicar no card só seleciona.
- "▶ Aulas do módulo (N) ⌄" sempre visível embaixo do card: clicar abre/fecha as aulas (fechadas por padrão).
- Linha da aula: caixinha, ⋮⋮, miniatura (capa do vídeo ou play), título "Aula 2 — Nome da aula" (branco, quebra linha se não couber) e embaixo "Vídeo · 49 min" (tipo + duração em minutos), Criado em, Liberado em, Visualizações, status, Editar, ⋮ (Editar, Liberar/Agendar/Não publicar/Ocultar/Bloquear, Excluir). "+ Adicionar aula" embaixo da última aula.
- Telas estreitas: datas descem para uma 2ª linha; nada pode se sobrepor (itens escondidos guardam espaço).

### Tipo da liberação na lista

- Em módulo e aula, embaixo da data de "Liberado em" aparece o tipo numa linha só (corta com "…" se não couber): Imediata, Às 09:00 (data específica), Após o cadastro, Com o módulo ou Trancado. Aula "junto com o módulo" ainda sem data mostra só "Com o módulo" no lugar da data.
- "Liberar" no menu ⋮ = liberação Imediata (grava a configuração); "Agendar" no menu ⋮ abre a janela de liberação para escolher a data.

### Seleção em massa

- Acima da lista: "Selecionar todos os módulos" e "Selecionar todas as aulas" (marca/desmarca tudo). As caixinhas de cada módulo e aula também selecionam.
- Com algo selecionado aparece à direita "N módulos e M aulas selecionados" + ações:
  - Liberação: Imediata / Dias após o cadastro / Data específica / Trancar (+ "Junto com o módulo" se só aulas) → resumo com a lista dos itens → Confirmar.
  - Status: Não publicado / Oculto / Bloqueado (Liberado e Agendado vêm da Liberação).
  - Mover aulas (só aulas, com mais de um módulo): escolhe o módulo de destino.
  - Excluir (com confirmação) e Limpar.
- Depois de cada ação a seleção é limpa. Marcar/desmarcar não redesenha a lista (a tela não mexe).

## 5. Módulo (painel lateral por cima — opção B aprovada)

- "Adicionar → Módulo" e "Editar" abrem painel à direita com fundo escurecido; topo fixo "Novo módulo/Editar módulo", progresso "N DE 3", etapas, ✕. Fechar (✕, clique fora, Esc) pergunta antes. Ao salvar fecha e o módulo aparece na lista.
- Etapas: 1 Informações (Identificação "?", Número "?", Nome "?", Descrição com IA/Corrigir, Texto do botão com IA e "?": "É o botão do card do módulo. Ao tocar, abre a lista de aulas do módulo para o aluno escolher qual quer assistir, mesmo que só uma esteja liberada.") → 2 Capa do módulo (só 16:9, opcional, mesmo ajuste/IA) → 3 Aparência do módulo (igual à do curso + "Copiar aparência do curso") → "Salvar módulo".
- Número: obrigatório; flechinhas ▲▼ dentro do campo (e setas do teclado) sobem/descem 1, mínimo 0; já vem sugerido o próximo (maior + 1); repetido → "Já tem um módulo com esse número." e não avança.
- Cada módulo guarda sua aparência (estilos e visual) e ela volta ao editar.
- Prévia do card do módulo: o botão abre a lista de aulas (miniatura, "MÓDULO 1 · AULA 1", nome, "Disponível", "▶ Assistir") e vira "Esconder aulas" — igual ao app do aluno.
- "Salvar e sair" no Cancelar guarda o módulo como Não publicado.

## 6. Aula (janela)

- Tipo Vídeo/Áudio/E-book → Conteúdo da aula com "?" (Formato, Tamanho máximo, Proporção 16:9 1920×1080) → envio com % e "Cancelar envio" (salva sozinho ao terminar) ou link YouTube/Cloudflare; player e aviso se não for 16:9.
- Capa do vídeo (opcional): botão "+ Adicionar capa do vídeo" abre o mesmo quadro de capa (enviar, ajustar, IA).
- Nome da aula, Descrição da aula (✦ Gerar com IA usando documentos da aula, ✦ Corrigir texto, Desfazer).
- Material complementar: +PDF/+Áudio/+Texto. PDF também tem "✦ Gerar PDF com IA": título, documentos da aula (os mesmos da descrição + novos), contexto ("retire do PDF o resumo de X"), mostra o PDF gerado para ler → Refazer / Salvar PDF.
- Rodapé: Cancelar (pergunta) · Voltar (pergunta só se mudou algo) · Salvar aula. "Salvar e sair" guarda a aula como Não publicada.

### Link do vídeo (validação)

- Aceita só YouTube (youtu.be/ID, youtube.com/watch?v=ID, /shorts/, /embed/, /live/; ID de 11 caracteres; não listado funciona) e Cloudflare Stream (videodelivery.net/ID, *.cloudflarestream.com/ID/…, ou só o código de 32 caracteres).
- Enquanto digita: "✓ Link do YouTube reconhecido" + botão "Abrir para testar ↗" (abre em nova aba), ou em vermelho "Esse link não é de vídeo do YouTube nem do Cloudflare Stream."
- Link inválido bloqueia "Salvar aula" (card Conteúdo em vermelho). No real: validar também no Supabase/Edge Function e guardar o ID + provedor.

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
