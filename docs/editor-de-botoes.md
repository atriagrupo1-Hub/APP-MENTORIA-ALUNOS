# Editor de botões (pedido do dono, salvo para aplicar)

Status: **anotado, aguardando o dono dizer onde aplicar primeiro.**

## O que o editor precisa ter (para cada botão)

Dois modos, em abas no topo do editor: **Normal | Hover** (passar o mouse / tocar).

### Título / texto do botão
- Cor do texto (com seta de desfazer ↺ e conta-gotas).

### Cor de fundo
- Três escolhas: **nenhuma** (⊘) · **cor lisa** (pincel) · **degradê**.
- Cor lisa: cor, com ↺ e conta-gotas.

### Formato
- Redondo ou quadrado (cantos).

### Sombra da caixa (mapinha da sombra)
- Linha "Sombra da caixa" com ↺ (voltar ao padrão) e ✎ (lápis) que abre o painel:
  - **Cor** (conta-gotas + quadrado da cor)
  - **Horizontal** (régua + número, com ↺)
  - **Vertical** (régua + número, com ↺) — sombra para cima ou para baixo
  - **Desfocar** (régua + número, com ↺)
  - **Espalhar** (régua + número, com ↺)
  - **Posição**: Outline (fora) / Inset (dentro)

### Animação
- Nenhuma · Fade In Out · Zoom In Zoom Out · Pulse · Pulse with shadow · Rotate · Bounce

### Aplicar em tudo
- Opção de aplicar o que está escolhido em todos os botões da seção.

## Modelo visual (referência enviada pelo dono — seguir à risca)

Painel lateral em seções que abrem e fecham (▾), cada linha = rótulo à esquerda, controle à direita.

- **Alinhamento**: 3 botões de ícone juntos (esquerda · centro · direita), o escolhido com fundo marcado.
- **Normal | Hover**: abas lado a lado dentro de uma caixa com borda; tudo abaixo vale para a aba ativa.
- **Cor do texto**: ↺ · conta-gotas · quadradinho da cor. Clicar no quadradinho abre o **seletor de cor flutuante**.
- **Cor de fundo**: 3 botões de ícone (⊘ nenhuma · pincel cor lisa · degradê). Escolhendo "cor lisa" aparece a sub-linha **Cor Lisa** (↺ · conta-gotas · quadradinho).
- **Animação**: lista suspensa (None, Fade In Out, Zoom In Zoom Out, Pulse, Pulse with shadow, Rotate, Bounce) com ✓ na atual + caixinha de número ao lado (duração/velocidade).
- **Editar tipografia**: botão largo que abre um **painel flutuante "Tipografia"** (↺ no topo) com: Fonte (lista suspensa com busca, cada fonte no próprio estilo, abre por cima sem empurrar nada), espaçamento entre letras e altura da linha (régua + número + unidade), Sombra de texto (↺ + ✎).
- **Tamanho**: botões PP · P · M · G · GG + ✎ para valor livre.
- **Peso**: L · N · M · F · EF + ✎.
- **Largura (%)**: ↺ · régua + número + unidade (% / px).
- **Borda**: ↺ + ✎ (abre painel flutuante).
- **Espaçamento interno**: 4 caixas (Topo, Direita, Baixo, Esquerda) + unidade.
- **Sombra da caixa**: ↺ + ✎ (abre o mapinha da sombra, flutuante).

### Seletor de cor flutuante (abre ao lado, por cima, sem mudar o tamanho de nada)
1. **Cores usadas recentemente** (seção que abre/fecha): Cores normais · Cores de gradiente.
2. **Cores comumente utilizadas** (abre/fecha): bolinhas de cores normais · bolinhas de gradientes prontos.
3. Quadro de saturação/brilho.
4. Bolinha da cor atual + barra de matiz + barra de transparência.
5. Campo do código (HEX) com setas ▴▾ para trocar o formato (HEX / RGB / HSL).

Regra geral: **todo painel, lista e seletor abre flutuando** preso ao controle clicado; o card/painel de baixo nunca cresce nem pula.

## Como agrupar (para não virar muita coisa para editar)
- Edita-se **por seção**, não botão por botão:
  - Botões dos módulos → um estilo vale para todos os módulos.
  - Botões de uma categoria → vale só para aquela categoria; dentro dos cursos dessa categoria, um estilo só.
  - Dentro dos módulos, uma cor só; dentro das aulas, uma cor só.
- Botões a cobrir (depois): menu inferior (fundo e cor da sombra do menu, inclusive no Início), próxima aula, entrar na aula, ver aulas dos módulos, botões das categorias, botões gerais.

## Ordem
1. Fazer primeiro em **um lugar** (o dono vai indicar — começo pelos botões das categorias / Configurações → Módulos).
2. Depois replicar para todos.
