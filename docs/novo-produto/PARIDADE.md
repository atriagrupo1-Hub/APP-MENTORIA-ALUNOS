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
- [ ] Cards, abas, filtros, ordenar, cards/lista — dados reais
- [ ] Publicação ▾ / Liberação ▾ gravam
- [ ] Abrir produto / Continuar edição
Página do produto
- [ ] Sobre (números reais) · [ ] Editar curso grava
- [ ] Conteúdo (módulos/aulas reais) · [ ] criar/editar/duplicar/excluir módulo · [ ] aula · [ ] liberação
- [ ] Engajamento (dados reais ou vazio — nunca inventado)
- [ ] Comentários reais + moderar/responder/ocultar/apagar
- [ ] Alunos reais + bloquear/desativar/remover/+ Aluno
- [ ] Ranking (regra de pontos a definir)
Criar curso
- [ ] Formato · Categoria · Informações · Capa (upload/ajuste) · Aparência → grava produto
Categorias
- [ ] Lista/vazio reais · [ ] status gravam · [ ] criar/editar no fluxo do curso grava · [ ] página da categoria
- [ ] Adicionar curso (novo/existente) grava · [ ] excluir
IA (descrição, capa, PDF): via Edge Functions existentes do painel.
