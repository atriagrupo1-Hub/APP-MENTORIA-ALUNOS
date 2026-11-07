# Engenharia reversa — AION (painel + área de membros)

Retrato do app em 07/11/2026, para servir de base ao redesenho.

## 1. Arquitetura

| Parte | Onde | Como |
|---|---|---|
| Área de membros (aluna) | `src/aluna/area.ts` (~2.400 linhas) | HTML gerado em TypeScript, sem React, mobile-first |
| Painel administrativo | `src/painel/painel.ts` (~8.800 linhas) + `painel.css` | HTML gerado em TypeScript, uma tela com abas |
| Dados | `src/data/*` + Supabase (projeto crcclhmamknqkamvavyp) | Supabase é a única autoridade (login, liberação, progresso) |
| Funções | `supabase/functions/*` | entrar (sem JWT), cadastrar-aluna, cadastrar-colaborador, enviar-avisos, video-assinado, importar-video, gerar-capa, gerar-material-aula, gerar-descricao-curso, extrair-ebook |
| Endereços | `src/enderecos.ts` | souaion.com (aluna), /admin (painel), /appmentoria |
| Prévia | `src/previa.ts` | `/admin?previa=1`: versão em edição, só layout, nada é gravado |

## 2. A regra que fica: aluna da mentoria × outras alunas

- **Aluna da mentoria**: tem acesso ao curso "jornada" (configuracoes.jornada = Bênçãos Ilimitadas), por curso, módulo ou aula.
  - App: Início com a jornada, **Módulos**, abas de categorias (Presentes etc.), Perfil. Liberação aula a aula (cronograma, prazos, ao vivo, presença).
- **Aluna geral** (sem a jornada): o app abre a versão "geral".
  - App: Início geral, **Meus Cursos**, **Novos**, Perfil.
- No painel, a lista de alunas separa "Alunos mentoria" e "Alunos gerais" (`daMentoria()`).

## 3. Área de membros (mobile)

| Tela | Função |
|---|---|
| Entrada | login por código (Edge Function `entrar`) |
| Início (mentoria) | destaque, versículo do dia, continuar assistindo, módulos, avisos |
| Início geral | destaques, meus cursos, novidades |
| Módulos / Módulo | capa em pé e deitada, aulas com liberação, ao vivo |
| Aula | player (vídeo assinado / PDF), sobre a aula, instruções, material, comentários, concluir |
| Categoria / Presentes | cards de cursos por categoria (bloqueado, oculto, rascunho, liberado por data/cadastro) |
| Curso (apresentação) / E-book / Opção | e-book com capa em pé, opções (orações) separadas |
| Leitor | leitura de PDF |
| Jornada | progresso da mentoria |
| Perfil | foto, cor, tema, tamanho da letra, notificações |

Personalização vinda do painel: menu inferior (ordem, nomes, ícones, cores, links), aparência (temas, fontes, cores), estilos por tela (`cssDaTela`).

## 4. Painel administrativo

Menu: Início · Alunas · Engajamento · Cursos e conteúdos · Categorias · Comentários · Equipe · Registro · Configurações · Lixeira · Reduzir PDF.

| Tela | Função |
|---|---|
| Início | tarefas, últimas liberações, atividades, período |
| Alunas / Ficha | cadastro, acesso por curso/módulo/aula, validade, bloqueio, contatos, foto, histórico |
| Engajamento | participação, quem precisa de atenção |
| Cursos e conteúdos | cards/lista, filtros, Visão geral, Sobre o curso, Módulos e aulas, Alunas, Comentários, Relatórios |
| Criar novo curso (em construção) | 01 Dados iniciais · 02 Conteúdo · 03 Apresentação · 04 Acesso · 05 Revisão |
| Aula | vídeo/PDF, capa (IA), material com IA, liberação |
| Categorias | cards, publicação/acesso/liberação, cursos dentro |
| Comentários | moderar, publicar, ocultar, responder |
| Equipe | colaboradores, papéis, permissões por aba |
| Registro | histórico de ações, desfazer |
| Configurações | menu inferior, início, versículos, módulos, aulas, presentes, perfil, aparência |
| Lixeira | 30 dias, restaurar ou excluir |

Modelo de publicação (curso, módulo, aula, categoria): Publicação (rascunho/publicado) × Acesso (liberado/bloqueado/oculto) × Liberação (imediata, data, X dias após cadastro, prazo após o anterior).

## 5. Banco (tabelas principais)

profiles, acessos, produtos, modulos, aulas, conteudos, aula_materiais, aula_midia, categorias, categorias_aba, categoria_itens, cronograma_modulo, aulas_ao_vivo, presencas, progresso, comentarios, curtidas, configuracoes, destaques_inicio, versiculos, presentes, avisos_enviados, push_inscricoes, historico_acoes, sessoes_painel, lixeira_linhas, credenciais, tentativas_ip.

Hoje: 25 alunas, 4 produtos, 51 aulas, 23 comentários.

## 6. Pontos fracos encontrados

- Telas gigantes num arquivo só (painel 8.800 linhas): mudar demora e quebra fácil.
- Muitos jeitos diferentes de editar a mesma coisa (curso, módulo, aula e categoria com formulários próprios).
- Painel denso: muita informação por tela, poucos padrões repetidos.
- Criar curso estava espalhado; o novo passo a passo (01–05) ainda está pela metade.
- Área de membros com duas versões (mentoria/geral) dentro do mesmo arquivo, com regras misturadas.
