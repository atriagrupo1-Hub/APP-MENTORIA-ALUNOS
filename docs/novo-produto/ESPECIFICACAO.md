# Novo produto — especificação para implementar de verdade

Fonte da verdade do desenho: `modelo-novo-produto.html` (cópia do modelo
ilustrativo https://claude.ai/artifact/RRBW66hGuHEDfQekbE9z1N, versão 305,
18/11/2026). Abra no navegador para ver o comportamento. Tudo aqui foi
pedido e aprovado pelo dono no modelo; a implementação real vai para o
painel (`src/painel/painel.ts` + `painel.css`) e para o app do aluno
(`src/aluna/area.ts` + `area.css`), com dados no Supabase.

> O modelo guarda tudo no navegador (sessionStorage/localStorage/IndexedDB)
> e usa IA pelo `window.claude`. **No produto real:** dados, capas, arquivos
> e status vêm do Supabase (única autoridade); IA via Edge Functions; vídeo
> no Cloudflare Stream ou link do YouTube. `localStorage` nunca é fonte.

Regras gerais

- **Status iguais para curso, módulo e aula**, na mesma ordem, cor e visual de lista: Não publicado (cinza) · Publicado (verde) · Agendado (dourado) · Bloqueado (vermelho) · Oculto (azul), com bolinha colorida e ✓ no atual. Não existe "Liberado" como status: o nome é Publicado.
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

### Adicionar aluno

- **Não fica no card da lista de produtos** (testado e recusado pelo dono: botão grande, ícone no rodapé e quadrinho clicável). Lugar ainda a definir. A janela já desenhada no modelo (Um aluno / Em massa com planilha CSV, colar lista, conferência Pronto/Inválido/Repetido/Já é aluno, e-mail de boas-vindas) continua no código do modelo (`abrirAlunos`) para reaproveitar.

## 1b. Página do produto ("Abrir produto")

- Topo: botão voltar + trilha "Produtos › Nome do produto › Aba atual".
- Abas (botões, a ativa em dourado): Sobre o produto · Engajamento · Comentários · Alunos · Aulas · Ranking de alunos · Conteúdo. Só "Sobre o produto" está desenhada; as outras mostram "vai ser desenhada em seguida".
- **Sobre o produto** (igual à imagem do dono):
  - Esquerda: capa com selo do formato; Nome; Descrição; Formato (pílula); Categoria (pílula).
  - Direita: quadros Total de módulos · Total de aulas · Horas totais; caixa "Progresso de liberação" com barra e "18 de 28 aulas liberadas" (%); lista Data de criação · Data da primeira aula/módulo liberado · Última aula liberada (ex.: "Módulo 3 – Aula 6"); quadros Total de alunos · Engajamento médio (com "?": média de quanto os alunos assistem do conteúdo liberado); linha Status com a pílula do status (cor do status).
- **Botão "Editar curso"** (dourado) no título da aba Sobre o produto: abre a edição completa do curso (etapas Formato → Aparência) já preenchida com formato, categoria, nome e descrição do produto. "Salvar curso" grava e volta para a página do produto; Cancelar pergunta (Continuar editando / Salvar e sair / Sair sem salvar) e volta para a página do produto. (No modelo, o curso que estava em montagem fica guardado e volta intacto.)
- **Engajamento** (igual à imagem do dono, em dourado): título + "Acompanhe a participação e o desempenho dos alunos neste produto." + seletor de período (Últimos 7 / 30 / 90 dias). 4 números com variação (↑ +x%): Engajamento médio (destacado), Aulas assistidas, Tempo total assistido, Conclusão média. "Evolução do engajamento" (linha com área, 0–100%, datas embaixo, valor do último ponto em destaque; passar o mouse mostra o valor de cada ponto). "Principais indicadores": Taxa de início, Aulas por aluno (média), Tempo por aluno (média), Taxa de conclusão, Alunos ativos. "Engajamento por módulo": nome do módulo, % e barra. "Atividade dos alunos": rosca com o total no meio e legenda Ativos (últimos 7 dias) / Pouco ativos / Inativos com % e quantidade.
- **Comentários** (igual à imagem do dono, em dourado): título + "Gerencie, responda e modere os comentários dos alunos."; 5 números: Total de comentários (destacado), Respondidos, Pendentes, Ocultos, Apagados; abas Todos · Para moderar · Publicados · Respondidos · Ocultos · Apagados (com contagem); filtros: busca por aluno ou comentário, módulo, data (Todas as datas · Hoje · Últimos 7 dias · Últimos 30 dias), Mais recentes/Mais antigos, ver em grade ou lista. Cards: foto/iniciais, nome, data, selo (Aguardando moderação / Publicado / Respondido / Oculto), texto com "Ver completo" quando longo, local "Produto / Módulo X - Aula Y" e ações: Aprovar (pendente), Responder (abre campo + Enviar resposta → Respondido), Ver resposta (respondido), Ocultar/Mostrar, Apagar (pede "digite EXCLUIR"). Rodapé "Mostrando N de M comentários" + páginas. Mesmas regras de moderação da aba Comentários do painel atual (comentário real não é inventado; no modelo os dados são de exemplo).
- **Alunos — 1ª parte** (igual à imagem do dono): título "Alunos" + "Gerencie seus alunos e acompanhe o progresso e os principais status."; 5 quadros: Total de alunos (destacado), Ativos (verde, check), Bloqueados (dourado, cadeado), Desativados (vermelho, X) e "Adicionados recentes" (destacado, clicável: seleciona a aba Adicionados recentes). Logo abaixo, abas com contagem: Todos (ativa, dourado) · Ativos · Bloqueados · Desativados · Adicionados recentes. Abaixo: busca "Buscar aluno por nome, e-mail ou código…" (mesmo tamanho e posição da busca dos Comentários, lupa dentro do campo, 470 px) + "Todos os status" (Ativos, Bloqueados, Desativados); à direita a ordem (Nome A–Z · Mais recentes · Mais antigos · Mais adiantados · Mais atrasados; ao escolher, o campo não fica destacado) e o ícone de filtro (mostra quantos filtros estão ativos). O ícone abre o painel "Filtrar alunos": Status do aluno (Todos, Ativos, Pausados, Cancelados, Bloqueados — marcar vários), Período de cadastro (Todos, Hoje, 7, 30, 90 dias), Progresso (Todos, 0%, 1–49%, 50–99%, 100%), Módulo; botões Limpar e Aplicar; ✕ fecha.
  - **Tabela de alunos**: caixinha (e "selecionar todos da página"), Aluno (iniciais/foto, nome, e-mail), Status (Ativo verde · Bloqueado dourado · Desativado cinza · Pausado dourado · Cancelado vermelho), Progresso (barra + %), Última atividade (↕ ordena), Data de cadastro (↕ ordena), Ações ⋮ (Ver detalhes, Bloquear/Desbloquear, Desativar/Reativar, Remover do produto com "digite EXCLUIR"). Com alunos marcados aparece a barra "N alunos selecionados" com Ativar · Bloquear · Desativar · Limpar. Rodapé: "Mostrando N de M alunos", Itens por página (5/10/25/50) e páginas com "…". Abas, busca (nome, e-mail ou código), status, ordem e painel de filtros agem na tabela; os números dos quadros/abas batem com a lista.
- No real: todos os números vêm do Supabase (horas = soma das durações; progresso = aulas liberadas ÷ total; engajamento = média assistida do conteúdo liberado).

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

### Duplicar curso (⋮ do curso)

- Mesmas condições do duplicar módulo: "Com módulos e aulas" / "Sem módulos" (obrigatório escolher). Com módulos → lista dos módulos (com nº de aulas) para marcar, "Marcar todos" (todos vêm marcados; precisa ao menos um); cada módulo vai com as suas aulas.
- "Duplicar e editar": o original continua na lista de produtos; a cópia abre na edição completa do curso (etapa 1, tudo editável). Curso, módulos e aulas da cópia começam Não publicado e sem liberação.

### Liberação do curso

- Botão "Liberação" ao lado de "Editar curso" abre a janela "Liberação do curso" com 3 opções (cards):
  - Imediata — fica disponível assim que confirmar.
  - Dias após o cadastro — campo "Liberar [N] dias após o cadastro do aluno" (conta para cada aluno).
  - Data específica — data + hora.
- "Continuar" valida (escolher tipo, dias ≥ 0, data) → "Confirmar liberação": resumo com Curso, Tipo de liberação, Liberado em, Status depois de confirmar → Voltar / Confirmar liberação.
- Ao confirmar: "Liberado em" do quadro mostra a data (ou "N dias após o cadastro" / "dd/mm/aaaa às hh:mm") e embaixo o tipo (Imediata / Dias após o cadastro / Data específica). Status: Imediata e Dias → Publicado; Data futura → Agendado. O status do curso segue a liberação automaticamente: escolher Publicado ou Agendado no seletor abre a Liberação (não dá para marcar à mão); Agendado vira Publicado sozinho quando chega a data/hora. Não publicado, Bloqueado e Oculto continuam manuais.
- No real: regra de liberação no Supabase (a liberação por aluno conta da data de cadastro dele).

### Depois de salvar um módulo novo

- "Salvar módulo" (na etapa Liberação) mostra o carregamento com o logo AIŌN; ao terminar, abre o card "Módulo salvo": capa, "Módulo X — Nome", descrição, status, liberação (data · tipo), "0 aulas" e a pergunta "Quer adicionar uma aula neste módulo agora?".
- **Adicionar aula agora** → abre a janela de nova aula já nesse módulo. **Adicionar depois** (ou ✕/Esc) → fecha e fica na tela do curso, com o módulo na lista.
- Ao editar um módulo existente não aparece esse card (só "Módulo salvo.").

### Liberação do módulo

- **Ao criar/editar o módulo, a liberação é a 4ª etapa, depois de "Aparência do módulo": Informações → Capa → Aparência → Liberação do módulo → "Salvar módulo".** Obrigatória, nada pré-selecionado (Imediata / Dias após o cadastro / Data específica); avisa o que falta; ao editar mostra a já escolhida. Não existe mais o botão "Liberação" no topo do painel do módulo.

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

### Linha do módulo e da aula (decisão final)

- Ordem (igual no módulo e na aula, colunas alinhadas): caixinha · ⋮⋮ · capa/miniatura · nome · **Status** · **Liberado em** (data + tipo) · botão **Liberação** · botão **Editar** · botão **Ver** · ⋮.
- Sem "Criado em" e sem "Visualizações" na linha.
- **Status editável na própria linha** (módulo e aula): clicar no selo abre a lista Liberado · Agendado (escolher data) · Não publicado · Oculto · Bloqueado, com ✓ no atual. Liberado = libera agora (Imediata); Agendado abre a janela de liberação para escolher a data; os outros mudam na hora.
- ⋮ do módulo: **Duplicar módulo** e Excluir módulo; ⋮ da aula: Excluir aula (excluir sempre com "digite EXCLUIR").
- **Duplicar módulo**: janela com "Com aulas" / "Sem aulas" (obrigatório escolher). Com aulas → lista das aulas para marcar, com "Marcar todas" (todas vêm marcadas; precisa ao menos uma). "Duplicar e editar" abre a edição completa como **módulo novo** (mesmas informações, capa e aparência, tudo editável), com o **próximo número** (não repete); aulas copiadas voltam para Não publicado, sem liberação; a liberação do módulo novo começa sem nada escolhido.
- **Ver aula — prévia (direita) igual ao app do aluno**: player com a capa do vídeo e botão play (vídeo enviado toca; YouTube/Cloudflare abre o link), "Módulo X · Aula N" em dourado, botões "‹ Aula anterior" e "Próxima aula ›" (navegam entre as aulas do módulo; desativados nas pontas), e três botões: Sobre a aula (nome + descrição), Instruções (materiais de texto), PDF (PDFs/áudios). Cada um abre/fecha o seu conteúdo.
- **Ver aula**: antes da caixa da aula aparece só o nome do módulo como foi escrito ("Módulo 1 — Atria teste"), sem rótulo extra, sem contagem e sem link. Depois tudo sobre a aula.
- **Ver**: topo da janela mostra "CURSO", o nome do curso e "Categoria: X"; o rótulo "Como o aluno vê" fica em cima da prévia (direita). Mesmo modelo do quadro do curso: à esquerda a caixa de informações (selo Módulo/Aula + status; nome grande; "Curso: …" — na aula também o módulo; quadros Aulas · Tempo total · Visualizações no módulo, ou Duração · Materiais · Visualizações na aula; linha Data de criação · Liberado em (data + como: Imediata, Dias após o cadastro, Data específica, Junto com o módulo, Trancada) · Progresso). À direita a prévia: card do módulo com a lista de aulas e a situação de cada uma, ou o player da aula / "Abrir vídeo ↗", descrição e materiais. Em tela estreita, um embaixo do outro.
- Status por atalho (Oculto/Bloqueado/Não publicado) fica na ação em massa "Status"; Liberado/Agendado vêm da Liberação.
- (Itens desta seção substituem o que estiver diferente nas seções abaixo.)

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
- `opcoes-pagina-produto.html` — 3 modelos da página "Abrir produto" (abas Sobre, Conteúdo, Alunos, Aulas, Engajamento, Ranking, Comentários, com filtros). Aguardando o dono escolher A, B ou C.
- `opcoes-onde-abre-modulo.html` — onde abre o novo módulo (aprovada a opção B, painel lateral).

### Aba Alunos — botão "+ Aluno" (v257)
- Botão dourado "+ Aluno" no topo à direita da aba Alunos.
- Abre a janela "Adicionar alunos" (Um aluno / Em massa por planilha).
- Aluno novo entra como Ativo, progresso 0%, aparece em "Adicionados recentes" e soma nos totais.
- E-mail que já é aluno do produto é recusado ("Esse e-mail já é aluno deste produto.").

### Abas da página do produto (v258)
- Aba "Aulas" removida. Abas: Sobre o produto, Engajamento, Comentários, Alunos, Ranking de alunos, Conteúdo.

### Aba Conteúdo — topo (v259)
- Cabeçalho: "Conteúdo — Gerencie módulos, aulas e todo o material do seu curso."
- 4 números: Módulos, Aulas, Tempo total, Horas aula (decimal).
- Linha 1: Evolução de aulas (total + variação + gráfico), Distribuição do conteúdo (rosca por tipo com % ), Tipos de conteúdo (barras: Vídeo, Áudio, E-book, Material).
- Linha 2: Aulas mais assistidas (top 3, capa + duração + visualizações, "Ver todas"), Aulas com mais comentários (top 3, "Ver todas"), Última aula/módulo liberado (selo Liberado) e O que tem agendado (selo Agendado, "Ver agenda").
- Dados reais virão do Supabase (aulas, tipos, visualizações, comentários, liberações).

### Aba Conteúdo — botão "Editar conteúdo" (v260)
- Botão dourado "Editar conteúdo" no topo à direita da aba Conteúdo.
- Abre a tela de conteúdo do curso (card do curso + lista de módulos e aulas) já com os módulos e aulas do produto, para adicionar, editar, liberar, duplicar ou excluir.
- "Fechar" volta para a página do produto, na aba Conteúdo.

### Aba Ranking de alunos (v261)
- Cabeçalho com período (7/30/90 dias), igual ao Engajamento.
- 4 números: Alunos matriculados, Concluíram aulas, Aulas assistidas, Engajamento médio.
- Linha 1: Top 3 do curso (pódio com 1º ao centro, coroa), Evolução do engajamento (gráfico + variação), Conquistas mais obtidas (Assíduo, Concluiu módulo, Participativo, Top engajamento).
- Ranking geral (só alunos ativos): #, Aluno, Pontos, Aulas assistidas, Módulos concluídos (x / total), Tempo de estudo, Conquistas (3 ícones + "+N"), ⋮ (ver aluno). Busca por nome, botão Filtros (ordenar por pontos/aulas/módulos/tempo; só quem concluiu o curso), 10 por página.
- Coluna direita: Engajamento por nível (Avançado ≥80%, Intermediário 40–79%, Básico <40%) e Conquistas e metas (% de alunos que atingiram a meta).
- Regra de pontos a definir na implementação real (progresso, aulas, módulos, assiduidade).

### Página do produto — ordem das abas e atualização (v262)
- Ordem: Sobre o produto, Conteúdo, Engajamento, Comentários, Alunos, Ranking de alunos.
- Ao atualizar a página, o painel volta para o mesmo produto, na mesma aba, no mesmo período e na mesma posição da tela (cache descartável do navegador; não é dado oficial).

### Dois status: Publicação e Liberação (v263) — decisão do dono
- **Publicação** (só 2): Publicado / Não publicado. Diz se o produto existe para o aluno.
- **Liberação** (4): Liberado / Bloqueado / Agendado / Oculto. Diz se o aluno consegue abrir.
- São independentes (ex.: publicado e bloqueado; não publicado e liberado).
- Card do produto (opção B): faixa com "Publicação ⓘ" e "Liberação ⓘ", cada um com seletor (seta ▾) que troca o status ali mesmo. Cores: Publicado/Liberado verde, Não publicado/Oculto cinza, Bloqueado vermelho, Agendado roxo.
- Saíram do card: "Criado em" e "Liberado em" (ficam dentro do produto).
- Card em criação ("Continuar edição"): seletores avisam "Termine de criar o curso para publicar e liberar".
- Filtro "Todos os status" da lista: acha por qualquer um dos dois (inclui "Liberado").
- Supabase (implementação real): dois campos separados no produto (publicação e liberação), em vez de um só.
- Ainda falta: levar os dois status para módulos e aulas (lista de conteúdo) e para a janela de Liberação.
- (v264) Seletores de status nunca cortam o texto: na lista a faixa tem 320 px; no card, "Publicação" ocupa a largura que precisa.
- (v265) Card do curso na tela de conteúdo: o seletor de status saiu do topo e fica ao lado do botão "Liberação" (Status · Liberação · Editar curso). Em tela estreita os botões quebram de linha.

### Depois de criar o curso (v266)
- "Salvar curso" (primeira vez) → carregando → abre a janela "Curso criado": card com capa, nome, descrição, tipo · categoria, Não publicado, 0 módulos.
- Pergunta: "Quer adicionar o conteúdo agora? Começamos pelo primeiro módulo."
- "Adicionar conteúdo agora" → abre direto o painel "Novo módulo" (Informações do módulo).
- "Adicionar depois" / ✕ → fecha e fica no card do curso, com aviso "Curso salvo. Você pode adicionar o conteúdo quando quiser."
- Salvar de novo um curso que já existe não abre a janela (só "Curso salvo.").
- Janelas no celular: margem de 16 px dos dois lados.

### Conteúdo do curso — topo novo e estado vazio (v267)
- Topo: ícone + "Conteúdo do curso ?" e, abaixo, totais: N Módulos · N Aulas · N Materiais · tempo total (soma da duração das aulas). À direita, botão dourado "+ Adicionar conteúdo ▾" (Módulo / Aula / Material).
- Barra: Pesquisar conteúdo… | Por módulos / Por aulas | Filtrar: (ordem e status) + inverter ordem | alternar Cartões / Lista.
- Saiu da barra o seletor de módulo.
- Modo Cartões (por módulos): cada módulo vira um cartão com capa, nome, status (seletor), data de liberação, Liberação / Editar / Ver / ⋮ e "Aulas do módulo (N)", que volta para a lista com o módulo aberto.
- Sem conteúdo: faixa com ilustração, "Seu curso ainda não tem conteúdo", "Adicione módulos, aulas e materiais para organizar o aprendizado." e botão "+ Adicionar conteúdo ▾" (no tema dourado do painel).
- (v268) "+ Adicionar conteúdo" sem setinha ▾ (topo e vazio); abre o menu Módulo / Aula / Material como antes. No vazio, título, texto e botão ficam centralizados.
- (v269) "+ Adicionar conteúdo" (topo e vazio) abre uma janela no meio da tela: "O que você quer adicionar?" com 3 cartões grandes — Módulo, Aula, Material. Esc, ✕ ou clique fora fecham.
- (v270) Curso vazio: título, texto e botão "Adicionar conteúdo" centralizados na faixa inteira; ilustração fixa à esquerda (em tela estreita vai para cima).

### Janela "Módulo salvo" — layout novo (v271)
- Topo: capa do curso, "CURSO", nome do curso e "Categoria: X"; ✕ à direita.
- Confirmação: ícone ✓ verde com brilho + "Módulo salvo" grande em branco (sem caixa, sem riscos) e "O módulo foi criado e salvo com sucesso." (v272)
- Card do módulo: capa grande, "MÓDULO", "Módulo N — Nome", descrição e chips (status, data · tipo de liberação, N aulas).
- Pergunta com ícone: "Quer adicionar uma aula neste módulo agora?" / "Você pode adicionar a primeira aula agora ou fazer isso mais tarde."
- Dois botões do mesmo tamanho: "🕒 Adicionar depois" e "▶ Adicionar aula agora" (dourado).
- Cores no tema dourado do painel (o modelo enviado era roxo).
- (v273) Modelo guarda vários cursos em criação: "+ Novo produto" não apaga mais o curso que estava sendo feito; ele vira um card "Continuar edição" na lista e volta com tudo (módulos, aulas) ao clicar. Na implementação real cada curso é um registro no Supabase.

### Aba Conteúdo — Estatísticas / Conteúdos (v274)
- Abaixo dos 4 números (Módulos, Aulas, Tempo total, Horas aula), dois botões: "Estatísticas" e "Conteúdos".
- Estatísticas: tudo o que já existia (evolução, distribuição, tipos, mais assistidas, mais comentadas, última liberada, agendado).
- Conteúdos: lista dos módulos do curso (capa, "Módulo N — Nome", nº de aulas e duração, status, data de liberação); clicar abre/fecha as aulas do módulo (nº, nome, tipo e duração, status, data). Link "Editar conteúdo →" leva à edição.
- A escolha fica guardada ao atualizar a página.
- (v275) Ordem dos botões: "Conteúdos" primeiro (abre por padrão), depois "Estatísticas". O botão dourado "Editar conteúdo" saiu do topo da aba e fica dentro do card de Conteúdos.
- (v276) "Conteúdos" na página do produto agora é o MESMO card "Conteúdo do curso" da edição (totais, busca, Por módulos/Por aulas, filtro, cartões/lista, módulos com status, Liberado em, Liberação/Editar/Ver/⋮, aulas, Adicionar aula). Ao lado de "+ Adicionar conteúdo" fica "Editar conteúdo".
  - Abrir/fechar aulas, buscar, filtrar, trocar visão e cartões/lista funcionam ali mesmo.
  - Qualquer ação de mudança (Editar, Liberação, status, ⋮, Adicionar…) entra na edição do conteúdo e já executa a ação.
  - O que é mudado na edição volta para a página do produto ao fechar e fica guardado ao atualizar. Os 4 números do topo da aba saem desse conteúdo.

### Tela Categorias — modelo A (v277)
- Menu lateral "Categorias" abre a tela (fica marcado no menu; trilha "Categorias").
- Topo: "Categorias — Organize seus produtos em grupos." + botão "Criar categoria".
- Quadro central: ícone, "Agrupe seus produtos por categoria", explicação (a categoria é a prateleira do app do aluno) e botão "Criar categoria".
- "Como funciona" em 3 passos: Crie a categoria · Coloque os produtos · O aluno vê organizado.
- "Suas categorias (N)": cartões com ícone, nome, descrição, nº de produtos e selo Ativa / Em breve.
- Janela "Nova categoria": Nome* (até 40), Descrição curta (até 80), Ícone (6 opções), Prévia. Bloqueia nome vazio e nome repetido (sem diferenciar acento/maiúscula).
- Categoria criada já aparece na criação de produto (etapa Categoria) e no filtro "Todas as categorias" da lista.
- Supabase (real): tabela de categorias (nome único, descrição, ícone, status, ordem).
- (v278) **Categorias — estado vazio (aprovado):** quando não existe nenhuma categoria, a tela mostra só o título "Categorias / Organize seus produtos em grupos.", o quadro central (ícone, "Agrupe seus produtos por categoria", explicação, botão "Criar categoria") e os 3 passos. **Sem** botão "Criar categoria" no topo, fora do quadro.
  - Simulação no modelo: todas as categorias foram retiradas (Mentoria, E-books, Presentes, Mestres espirituais); produtos aparecem "Sem categoria"; filtro só com "Todas as categorias"; na criação de produto só existe "+ Nova categoria".
  - A tela COM categorias será redesenhada depois.
- (v279) **Categorias — estado vazio, layout final:** topo com ícone de pasta + "Categorias" + "Organize seus cursos por temas, formatos ou áreas de conhecimento." Quadro: ilustração (pasta com capelo e folhas de vídeo, e-book e áudio), "Ainda não há categorias", "Crie categorias para agrupar e organizar seus cursos (como Vídeos, Áudios, E-books, Mentorias, etc.).", botão grande "+ Criar categoria" e, abaixo de uma linha, 3 benefícios: Organize seus cursos · Facilite a navegação dos alunos · Ganhe agilidade na gestão. Sem botão no topo. Tema dourado do painel. (Substitui os "3 passos" no vazio.)
- (v280) Categorias vazio: ilustração da pasta removida; o quadro começa direto em "Ainda não há categorias".

### Criar categoria — fluxo em etapas, igual ao criar curso (v281)
- "Criar categoria" abre a tela "Nova categoria / Criar categoria" (Fechar no topo), com barra de progresso "N DE 3 · %" e etapas: **1 Informações · 2 Capa · 3 Aparência** (✓ nas concluídas; dá para clicar e voltar).
- 1 Informações: Nome* (até 40, contador) e Descrição* (até 160, contador).
- 2 Capa: enviar imagem 16:9 (JPG/PNG/WebP até 15 MB, clicar ou arrastar), Trocar / Remover. Obrigatória.
- 3 Aparência: Ícone* (6 opções) e Situação (Ativa / Em breve) + prévia "Como o aluno vê" (capa, ícone, nome, descrição, cadeado "Em breve").
- Rodapé: Cancelar · aviso · Voltar · Próximo / "Salvar categoria". Não avança sem o obrigatório: campos ficam vermelhos e aparece o aviso; foco no primeiro campo que falta. Nome repetido é recusado.
- Cancelar/Fechar com algo preenchido: "Sair sem salvar?" (Continuar editando / Salvar e sair / Sim, sair sem salvar).
- Salvar → carregando "Salvando a categoria…" → janela "Categoria criada" (card com capa, nome, descrição, situação, 0 produtos) → "Criar depois" ou "Criar produto agora" (abre a criação de produto com a categoria já escolhida).
- (v282) **Criar categoria agora tem 4 etapas, na mesma ordem do curso: 1 Formato · 2 Informações · 3 Capa · 4 Aparência da categoria** ("N DE 4"). Formato (obrigatório): Vídeos / E-books / Áudios, mesmos cards do curso — define o que a categoria apresenta. A janela "Categoria criada" mostra o formato.
- (v283) **Criar categoria = o MESMO fluxo de criar curso (duplicado, não refeito).** "Criar categoria" abre a tela de criação do curso em modo categoria: título "Nova categoria / Criar categoria", etapas **Formato · Informações · Capa da categoria · Aparência da categoria** ("N DE 4"; a etapa Categoria some). Tudo igual ao curso: cards de formato; Informações (texto em cima do nome, Nome da categoria, descrição, texto do botão, obrigatórios em vermelho); Capa deitada + em pé com enviar, **Ajustar capa** (zoom/arrastar), **IA** e remover; Aparência do card com Celular/Tablet/Computador e estilos. Rodapé Cancelar / Voltar / Próximo / **Salvar categoria**; Fechar e Cancelar perguntam antes de sair. Salvar → "Salvando a categoria…" → volta para Categorias e abre a janela "Categoria criada". Nada do curso/rascunho em andamento é perdido (volta exatamente como estava). Substitui o fluxo próprio da v281/v282.

### Categorias — lista quando já existem categorias (v284)
- Mesmo layout da lista de Produtos: "CONTEÚDO / Categorias / Organize seus cursos por temas, formatos ou áreas de conhecimento." + "+ Nova categoria".
- Abas por formato com contagem: Todos · Vídeo · E-book · Áudio.
- Filtros: Buscar categoria, Todos os status (Publicado, Não publicado, Liberado, Bloqueado, Agendado, Oculto), total, Ordenar (Mais recentes, Nome A–Z, Mais cursos), cards/lista.
- Card da categoria (igual ao do produto): capa + selo do formato; NOME; descrição; números **N CURSOS** e **HORAS AULA** (soma da duração das aulas dos cursos da categoria); Publicação ▾ e Liberação ▾ (trocam ali mesmo); "Abrir categoria →" (página da categoria a desenhar).
- Categoria nova começa Não publicado / Bloqueado.
- Seletores de status do card: quando o card fica estreito, o ícone da esquerda some para o texto não cortar (vale para produtos e categorias).

### Página da categoria — "Abrir categoria" (v285)
- Mesmo modelo do card do curso: barra "Categoria, formato e aparência ?" e "Card da categoria ?"; "← Categorias" para voltar.
- Esquerda (resumo): selo do formato (Vídeos/E-books/Áudios) e ⋮ (Excluir categoria, digitando EXCLUIR; cursos ficam sem categoria); nome grande; Descrição; números Cursos · Horas aula · Alunos; Data de criação · Liberado em · Cursos publicados (N de total + barra); Publicação ▾ e Liberação ▾ ao lado; botão "Editar categoria".
- Direita: o card da categoria como o aluno vê (o mesmo card montado na Aparência).
- Abaixo: "Cursos desta categoria (N)" com os cards dos cursos (ou aviso se vazio).
- "Editar categoria" abre o mesmo fluxo (Formato · Informações · Capa · Aparência) já preenchido; ao salvar volta para a página da categoria; renomear atualiza os cursos e o filtro.
- Ao atualizar a página, continua na mesma categoria.
- (v286) Página da categoria: o card da direita é o card REAL montado na Aparência (mesmas cores, fonte, botão, cantos e capa), guardado ao salvar. A capa é guardada reduzida (até 1280 px) para caber; antes, capas grandes faziam aparecer um card genérico.
- (v287) Página da categoria: saiu "Cursos publicados"; ficam só Data de criação e Liberado em.
- (v288) Categorias antigas (sem card guardado) mostram o card no mesmo modelo do card real (capa, texto em cima, nome, descrição e botão com ícone e seta), não mais um card genérico.
- (v289) Card da categoria igual ao card do curso: mesma peça (capa, texto em cima, nome grande em serifa, descrição, barra de progresso com %, botão com ícone, texto centralizado e seta), mesma largura e tamanhos. Categoria antiga usa o card padrão do curso com os textos dela.
- (v290) Página da categoria alinhada: Publicação ▾, Liberação ▾ e "Editar categoria" com a mesma altura (44 px) e alinhados pela base; descrição longa quebra normal ao lado do ícone; em tela média o resumo ocupa a largura toda e o card vai para baixo.
- (v291) Card da categoria SEM barra de progresso (na Aparência da categoria some a barra e o ajuste "Barra de progresso"; na página da categoria também). O card do curso continua com a barra.
- (v292) Página da categoria, ordem no resumo: selo "Categoria" → nome → "Formato: Vídeos/E-books/Áudios" → "Descrição: …".
- (v293) Sem barra de rolagem lateral: a dica "Card do curso / Card da categoria ?" abre para dentro (não passa da borda) e os números da aba Sobre diminuem para caber em telas menores. Regra: nenhuma tela pode precisar rolar para os lados.
- (v294) Removida a limpeza única de categorias da simulação (v278). Categorias criadas nunca são apagadas pelo modelo; só saem com "Excluir categoria" (digitando EXCLUIR).

### Página da categoria — "Cursos da categoria" (v295)
- Mesmo modelo do card "Conteúdo do curso": título "Cursos da categoria ?", totais (N Cursos · N Aulas · tempo), botão dourado "+ Adicionar curso", barra com "Pesquisar curso…" e cartões/lista.
- Sem cursos: faixa igual à do conteúdo vazio (ilustração à esquerda), "Esta categoria ainda não tem cursos", "Adicione um curso novo ou um curso que já existe para organizar esta categoria." e "+ Adicionar curso" centralizado.
- "+ Adicionar curso" abre a janela: **Curso novo** (abre criar curso já com esta categoria) ou **Curso que já existe** (lista com caixas de seleção, mostra a categoria atual de cada um) → "Adicionar selecionados".
- Com cursos: os cards dos cursos (cartões ou lista), com busca. A categoria de cada curso fica guardada ao atualizar.
- (v296) Modelo: com o modelo aberto em mais de uma janela/aba, a janela antiga sobrescrevia o que foi salvo na outra (categorias "sumiam"). Agora cada salvamento tem horário, ao abrir vale sempre o mais novo e as outras janelas se atualizam sozinhas. (Na implementação real isso não existe: os dados ficam no Supabase.)
- (v297) **Janela "Adicionar curso à categoria" refeita:** botão pequeno "+ Curso novo" no topo (ao lado do ✕); abas por formato com contagem (Todos/Vídeo/E-book/Áudio); barra com busca, filtro de categoria atual (Todas / Sem categoria / Em outra categoria) e ordenar (Mais recentes / Nome A–Z / Mais alunos); "Selecionar todos (N)"; lista em cards: caixa de seleção, miniatura com o formato, nome, módulos · aulas · alunos · criado em, selo da categoria atual e situação de publicação. Rodapé: "N selecionados", Cancelar, "Adicionar N cursos" (desligado sem seleção).
- (v298) Janela "Adicionar curso à categoria": busca com lupa pequena dentro do campo e busca + filtros na mesma linha e mesma altura (40 px).

## v299 (19/11/2026) — IA da descrição
- "Gerar descrição com IA": lê o material inteiro (todas as páginas do PDF, até 300 mil caracteres por arquivo; até 150 mil vão para a IA) e segue os critérios do dono: **promessa** principal tirada do material, **pontos** centrais do conteúdo, **curiosidade** e, quando o material/contexto falar de prazo ou vagas, **escassez/urgência**. Nada inventado; sem copiar trechos ("Introdução", páginas, capítulos); até 180 caracteres.
- PDF de material da aula também recebe o documento inteiro (até 150 mil caracteres por arquivo).

## v300 (19/11/2026) — Arquivos da IA e "carregando"
- Área de arquivos das janelas de IA (descrição e PDF da aula): caixa de envio maior com ícone ("Adicionar arquivos · clique ou arraste aqui"), aceita arrastar e soltar; com arquivo na lista vira "Adicionar outro arquivo".
- Cada arquivo: ícone de documento com o tipo, nome, situação e barra: "Lendo página X de Y…" (com roda girando e barra de progresso), "✓ Lido · N páginas · N caracteres" (verde) ou "Não deu para ler este arquivo…" (vermelho).
- Gerando a descrição: roda girando + "A IA está lendo o material inteiro. Leva alguns segundos."
- Painel: ao recarregar, volta para a mesma tela (inclusive no meio de Criar/Editar curso, categoria ou módulo, com o que foi preenchido).

## v301 (19/11/2026) — Aba Alunos e Adicionar/Cadastrar aluno (em teste no ilustrativo, ainda não aprovado)
- Barra lateral ganha **Alunos**: números (Total, Ativos, Bloqueados, Desativados), busca, status, ordem (Últimos adicionados, Nome A–Z/Z–A, Mais antigos), tabela (aluno, status, cursos, cadastro, acesso até, ⋮ Ver acesso / Bloquear / Desativar ou Reativar +1 ano / Remover). 4 alunos ilustrativos. Botão **Cadastrar aluno**.
- **+ Aluno dentro do curso**: primeiro escolhe **Aluno existente | Novo aluno**.
  - Novo aluno — 5 etapas: 1 Dados do aluno · 2 Acesso · 3 Conteúdos liberados (card grande só com o curso, já marcado) · 4 Forma de liberação · 5 Resumo.
  - Aluno existente — 3 etapas: Escolher aluno (lista com busca; quem já está no curso aparece apagado) · Forma de liberação · Resumo.
- **Forma de liberação** (por curso): Tudo liberado agora · Uma aula a cada X dias (começa em [data], primeira aula no dia do início, "usar a regra do Módulo 1 em todos os módulos" — desmarcado, um intervalo por módulo) · Manual (primeira aula agora; as outras uma a uma). Mostra "Como o aluno vai receber" (cronograma com datas).
- **Resumo**: dados, acesso, conteúdos, forma de liberação (cada bloco com Editar) e **Mensagem de acesso** com **Copiar mensagem**.
- Cadastrar aluno pela aba Alunos: o mesmo fluxo, com todos os cursos para marcar na etapa 3.

## v302 (19/11/2026) — Adicionar aluno: escolha fica sozinha
- Escolheu **Novo aluno** (ou **Aluno existente**): a outra opção some; fica só a escolhida, com **Trocar** ao lado para voltar à escolha.

---
## 🔖 MARCO "GOOGLE" (19/11/2026)
Pedido do dono: **tudo que for feito no modelo ilustrativo a partir daqui** (a partir da **v301**, inclusive) fica guardado e **só vai para o painel quando ele disser "a partir do Google"**.
- Base do que já está no painel: modelo **v300** (commit `82f1601`, `src/painel/np/modelo.html`).
- Ainda **não** levado ao painel: v301 (aba Alunos, Adicionar/Cadastrar aluno em 5 etapas, Forma de liberação, Resumo com mensagem) e v302 em diante (lista abaixo, a cada mudança).
- Ao ouvir "a partir do Google": comparar `docs/novo-produto/modelo-novo-produto.html` com a v300 (`git diff 82f1601 -- docs/novo-produto/modelo-novo-produto.html`), levar cada item ao painel real (painel + Supabase), primeiro arrumando o que faltar no ilustrativo.

### Mudanças desde o marco (não levadas ao painel)
- v301 — aba Alunos (4 ilustrativos) · + Aluno: Aluno existente | Novo aluno · 5 etapas (Dados, Acesso, Conteúdos liberados com card grande, Forma de liberação, Resumo + mensagem para copiar) · Forma de liberação: Tudo agora / 1 aula a cada X dias (regra do Módulo 1 para todos ou por módulo) / Manual · cronograma "Como o aluno vai receber".
- v302 — escolhida a opção, a outra some (fica só a escolhida + Trocar).
- v303 — Forma de liberação: "Tudo liberado agora" libera só o que já está liberado para os alunos. Embaixo: card do curso (capa, formato, nome, Publicação e Liberação atuais, "N aulas entram agora · N agendadas · N ficam de fora") e Módulos e aulas separados (cada módulo abre/fecha, com o status dele e das aulas: ✓ Liberada no cadastro · Libera em [data] · Fica de fora). "Uma aula a cada X dias" e "Manual" também só usam as aulas já liberadas.
- v304 — Forma de liberação com os **cards de módulo e aula** (mesmo modelo da lista de conteúdo: capa, "Módulo N — NOME", status para todos e "liberado em", "Aulas do módulo (n)" com as aulas, tipo e duração) e a **data deste aluno** em cada módulo e cada aula.
  - Tudo liberado agora: datas fixas (hoje). Uma aula a cada X dias: 1º módulo **Imediato** ou **Depois de X dias do cadastro**; as datas saem pela regra (primeira aula no início, regra do 1º módulo em todos, ou um intervalo por módulo) e **qualquer data de módulo ou aula pode ser editada** (↺ volta ao automático; as seguintes seguem a partir da editada). Manual: você escolhe o dia de cada módulo e de cada aula; sem data = você libera depois; "Liberar a primeira aula agora".
  - Aula agendada para todos mostra a data de todos; aula não publicada/oculta/bloqueada: "Fica de fora". Trocar a opção limpa as datas editadas.
  - O cronograma "Como o aluno vai receber" saiu desta etapa e foi para o **Resumo**.
  - A janela de Adicionar/Cadastrar aluno **continua aberta no mesmo ponto** depois de recarregar a página.
- v305 — Forma de liberação com 9 opções (as 3 primeiras continuam iguais): **Tudo liberado agora** · **Uma aula a cada X dias** · **Manual** · **Por módulo** (marca quais módulos o aluno acessa no cadastro; os outros ficam 🔒 até você liberar) · **Módulo inteiro a cada X dias** (contando do cadastro; 1º módulo imediato ou após X dias; intervalo igual ou por módulo) · **Por data fixa** (você escolhe a data de cada módulo; aulas acompanham; sem data = bloqueado) · **Dia fixo da semana** (1 aula toda [dia] às [hora]; primeira no cadastro ou no primeiro [dia]) · **Ao concluir a anterior** (a próxima abre quando o aluno conclui a anterior, + X dias de espera; primeira agora) · **Personalizado** (em cada módulo: Imediato, Após X dias do cadastro, Data fixa ou Manual). Todas mostram os cards de módulo e aula com a data deste aluno; o Resumo traz o texto da regra e o cronograma.
