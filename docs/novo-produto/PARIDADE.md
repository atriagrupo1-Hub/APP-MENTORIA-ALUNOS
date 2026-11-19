# Paridade 100% — Produtos e Categorias (painel = modelo)

Pedido do dono (19/11/2026): as abas **Produtos** e **Categorias** do painel têm que ficar
100% iguais ao modelo (`modelo-novo-produto.html`, v298): tamanho, botão, cor, função, padrão.

## Decisão de implementação
Reescrever 144 KB de CSS e ~2.000 linhas de comportamento à mão gera diferença. Por isso o painel
**embute o próprio modelo** (`src/painel/np/modelo.html`, cópia da v298) numa área fixa do conteúdo
(iframe `srcdoc`, sem barra lateral/selo/trilha do modelo) e conversa com ele por mensagens:

- **Painel → modelo (`np-dados`)**: produtos, categorias, módulos/aulas, alunos e comentários reais do Supabase,
  convertidos para o formato do modelo. Em modo embutido o modelo **não usa dados de exemplo nem localStorage**.
- **Modelo → painel (`np-acao`)**: cada ação que grava (publicação, liberação, criar/editar curso, categoria,
  módulo, aula, excluir…) vira uma ação do painel, que grava no Supabase com as regras atuais
  (permissões, histórico, desfazer) e manda os dados atualizados de volta.

## Checklist (marcar ao ligar no Supabase)
Lista de produtos
- [x] Cards, abas, filtros, ordenar, cards/lista — dados reais
- [x] Publicação ▾ / Liberação ▾ gravam
- [x] Abrir produto / Continuar edição
Página do produto
- [x] Sobre (números reais) · [ ] Editar curso grava
- [x] Conteúdo (módulos/aulas reais) · [ ] criar/editar/duplicar/excluir módulo · [ ] aula · [ ] liberação
- [x] Engajamento (dados reais ou vazio — nunca inventado)
- [x] Comentários reais + moderar/responder/ocultar/apagar
- [x] Alunos reais + bloquear/desativar/remover/+ Aluno
- [x] Ranking (regra de pontos a definir)
Criar curso
- [x] Formato · Categoria · Informações · Capa (upload/ajuste) · Aparência → grava produto
Categorias
- [x] Lista/vazio reais · [ ] status gravam · [ ] criar/editar no fluxo do curso grava · [ ] página da categoria
- [x] Adicionar curso (novo/existente) grava · [ ] excluir
IA (descrição, capa, PDF): via Edge Functions existentes do painel.

## Ligado ao Supabase (19/11/2026)
Cada ação do modelo vira uma gravação real, numa fila (uma depois da outra):
curso (criar, editar, publicação/liberação, duplicar com módulos escolhidos, excluir → Lixeira),
módulo (salvar, duplicar com aulas copiadas de verdade, excluir), aula (salvar com arquivo, capa, link, liberação e materiais; excluir),
status/liberação/ordem/mover de módulos e aulas (`conteudo-sync`, só o que mudou), categoria (criar, editar, status, adicionar cursos, excluir),
comentários (aprovar, responder, ocultar, mostrar, apagar), alunos (bloquear, desbloquear, desativar = acesso encerrado, reativar = +1 ano,
remover do curso, + Aluno = libera o curso para quem já tem cadastro; sem cadastro → aviso para cadastrar em Alunos).
Ainda não: vídeo por arquivo (só link YouTube/Cloudflare), IA do modelo (usa as respostas prontas), Ranking (regra de pontos provisória).
