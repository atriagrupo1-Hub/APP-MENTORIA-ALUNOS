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

- Prévia do painel: `bash scripts/previa.sh painel` → https://souaion.com/admin?previa=1
- Prévia do app: `bash scripts/previa.sh app` → https://souaion.com/apresentacao (`/?demo=1`)
- O script só termina com `PRÉVIA OK` depois de conferir a versão e os arquivos.
- **Produção:** push no branch `claude/new-session-3krqjt` publica o site (Cloudflare, 1,5 a 6+ min). Só com autorização.
- **Banco:** prévia e produção usam o **mesmo** Supabase. No painel em prévia, salvar é "de teste" (só no navegador). Qualquer SQL, função ou upload vale para todos na hora.
