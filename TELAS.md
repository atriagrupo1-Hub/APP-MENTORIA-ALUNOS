# Mapa de telas (onde mexer)

Busque pela **função** com `grep -n "function NOME" arquivo` e leia só o trecho.
Prefixo = começo das classes CSS da tela. **Antes de criar/usar uma classe:**
`grep -n "\.PREFIXO-nome" src/painel/painel.css src/aluna/area.css` — se já existir em outra tela, use outro nome.

## Painel da equipe — `src/painel/painel.ts` + `src/painel/painel.css`

| Tela | Função(ões) | Prefixo CSS | Observações / riscos |
|---|---|---|---|
| Moldura: topo, lateral, trilha | `painel()` | `tp-`, `lado-`, `casca2` | `.casca2` tem ~280 regras por cima das antigas |
| Visão geral (Início) | `telaInicio`, `vgxResto`, `painelListaIni`, `quadroLib`, `seletorPeriodo` | `vgx-`, `ini-`, `m2-`, `lq-` | Blocos antigos escondidos por `INI_EXTRA`/`INI_TEMPO`/`ATALHOS_INI` |
| Janela "Criar novo" | dentro de `telaInicio` | `cri-` | Já colidiu com `cn-` (editor de produto) |
| Alunas e acessos | `telaAlunas`, `linhaAluna`, `barraLote` | `al2-`, `al-modal-` | `.al-mods` é da ficha (Progresso por módulo) — não reutilizar |
| Ficha da aluna (painel lateral) | `cadastroAluna` | `aa-` (`.aa-painel.largo`) | Abas usam a regra única de abas (`.aa-abas > button`, com `!important`) |
| Cadastrar / editar aluna (janela) | `modal()` → `m.tipo === "aluna"` | `cad-` | Desfazer: `cadHist`; login automático: `loginAuto` |
| Engajamento | `telaEngajamento` | `eng-` | Dados do Supabase: `resumo_engajamento` |
| Todos os produtos | `telaCursos` | `prod-`, `kc-` | |
| Página do produto (abas) | `telaCurso` → `visaoGeralCurso`, `configCurso` (Sobre o curso), `modulosCurso` | `vg-`, `ce-`/`cs-`, `ma2-` | `fichaCurso` (`cf-`) está guardada, sem uso |
| Criar novo curso | `telaCursoNovo` | `cn-` | Não usar `cn-` em outra tela |
| Aula | `telaAula` | `ae-`, `pm-` | |
| Categorias | `telaCategorias`, `telaCategoriaAba` | `ac-`, `cl-`, `catx-` | `.ac-ic`/`.ac-topo` já colidiram com a Visão geral |
| Comentários | `telaComentarios` | `cm-` | |
| Equipe / Registro | `telaEquipe`, `telaRegistro` | `eq-`, `reg-` | |
| Configurações (Experiência da aluna) | `telaConfig` | `cfg-` | |
| Lixeira / Reduzir PDF | `telaLixeira`, `telaReduzir` | `lx-`, `rd-` | |

Regras únicas que valem para várias telas (mudar = mexe em todas): família de abas `.cs-abas, .prod-abas, .aa-abas, .reg-abas, .cad-abas` (com `!important`); botões `.al-botao`, `.al-botao-ouro`; hover geral `[data-painel] button:hover` (sombra — desligar por componente se atrapalhar).

## App da aluna — `src/aluna/area.ts` + `src/aluna/area.css`

| Tela | Função | Observações |
|---|---|---|
| Entrada (login) | `telaEntrada` | |
| Início (mentoria / geral) | `telaInicio`, `telaInicioGeral` | Versão vem de `minha_versao` |
| Módulos / Módulo / Aula | `telaModulos`, `telaModulo`, `telaAula` | Ordem das aulas: `seqOk`; cadeado: `aulaAdmin` |
| Presentes | `telaPresentes`, `cartaoPresente` | Sem botões no topo; linha `.pres-div` |
| Lista de uma categoria (ex.: E-books) | `telaCategoria` | Só para categorias "sub" (E-books); as outras voltam para Presentes |
| Curso de presente / e-book | `telaCursoPres`, `telaEbook`, `telaPresente`, `telaOpcao` | Botões do e-book = conteúdos com `opcao=true` |
| Perfil | `telaPerfil` | Cor: `salvar_minha_cor` |
| Cadastro de demonstração | `VER_TUDO` (perfil com `ver_tudo=true`) | Abre tudo só para esse cadastro |

## Prévia × produção × banco

- Prévia do painel: `bash scripts/previa.sh css` (só CSS, ~3 s) ou `painel` (código, ~12 s) → https://souaion.com/admin?previa=1
- Prévia do app: `bash scripts/previa.sh app-css` (só CSS) ou `app` → https://souaion.com/apresentacao (`/?demo=1`)
- O script só termina com `PRÉVIA OK` depois de conferir a versão e os arquivos.
- **Produção:** push no branch `claude/new-session-3krqjt` publica o site (Cloudflare, 1,5 a 6+ min). Só com autorização.
- **Banco:** prévia e produção usam o **mesmo** Supabase. No painel em prévia, salvar é "de teste" (só no navegador). Qualquer SQL, função ou upload vale para todos na hora.

## Novo fluxo "Criar produto" (em desenho, modelo ilustrativo)

- Modelo: https://claude.ai/artifact/RRBW66hGuHEDfQekbE9z1N (arquivo no scratchpad da sessão `novo-produto.html`). Ajustar só no modelo até o dono aprovar; depois prévia.
- Ordem: desenhar primeiro **Vídeo-aula**; depois **E-book**; depois **Áudio**.
- Etapas (vídeo-aula): 1 Formato (cards, nada pré-selecionado) → 2 Categoria (cards; nova categoria só existe ao salvar) → 3 Informações (texto em cima do nome, nome do curso, descrição; todos obrigatórios, sem exemplo) → 4 Capa (deitada 16:9 obrigatória + em pé 2:3 opcional) → 5 Conteúdo (vazio com "Criar módulo" centralizado) → 6 Apresentação → 7 Acesso e publicação.
- Não avança sem preencher; avisa no rodapé. Fechar/abrir de novo zera tudo (até existir "salvar rascunho").
- Capa: enviar (JPG/PNG/WebP até 15 MB, clicar ou arrastar), janela "Ajustar capa" (arrastar livre, zoom 0,4–3×, Centralizar, Cancelar, Salvar capa; recorta em 1920×1080 ou 1000×1500). Na migração: salvar no depósito do Supabase (no modelo fica só no navegador).
- Etapas em 2 fases: Fase 1 Criação (1 Formato, 2 Categoria, 3 Informações [texto em cima do nome, nome, descrição, texto do botão], 4 Capa do curso) → botão "Próximo". Fase 2 Montagem (5 Aparência do curso = cria o curso; 6 Conteúdo; 7 Acesso e publicação). "Salvar rascunho" a partir da etapa 3.
- Aparência: esquerda Informações com "Aa Estilo" (fonte, normal/negrito/itálico, alinhamento, tamanho); direita prévia do card (Celular/Computador).
- Lista de produtos: filtros funcionais (tipo, busca, categoria, status), ordenar (recentes padrão, antigos, preço, alunas, A–Z), cards/lista.
- Layout da criação (aprovado, opção C — substituiu a B): painel único com cabeçalho "Curso", barra de progresso "N DE 5 · %" e etapas em pílulas; à direita "Depois: Conteúdo e liberação 🔒" (vira link após criar). Antes era: coluna de etapas à esquerda — "Curso" (1 Formato, 2 Categoria, 3 Informações, 4 Capa do curso, 5 Aparência) e, separado, "Conteúdo e liberação" (Conteúdo, Liberação e publicação) com cadeado até "Criar curso" na Aparência. Rodapé: Voltar · Próximo/Criar curso · Salvar rascunho.
- Aparência: Informações (Aa Estilo: fonte, normal/negrito/itálico, alinhamento, tamanho, cor com seletor/hex/conta-gotas/recentes, sombra do texto; ↻ padrão, ✕, Aplicar/Cancelar) + Visual (Card, Botão, Barra: cores, borda, cantos, sombra com posição X/Y, desfoque, opacidade; ↻ por barra). Prévia Celular/Tablet/Computador.
- Fases (botões separados com "?"): "Curso, categoria e aparência" (1 Formato, 2 Categoria, 3 Informações, 4 Capa do curso, 5 Aparência → "Salvar e ir para conteúdo" com carregamento AIŌN; "Salvar rascunho" avisa que falta conteúdo e liberação) e "Conteúdo, aparência e liberação" (cria módulo com as mesmas etapas: Formato, Informações [texto em cima, número, nome, descrição, texto do botão], Capa do módulo, Aparência, Liberação e publicação → "Criar módulo"). Sem "Aa Estilo" na etapa Informações.
- Ajustar capa: zoom e giro com flechinha de desfazer (volta ao normal), giro com clique segurado + roda ou Shift + roda.
