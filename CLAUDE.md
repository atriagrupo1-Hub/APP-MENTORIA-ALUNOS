# Regras deste projeto

## Comunicação — regra permanente

Máxima economia de créditos/tokens.

**Durante a execução: silêncio.** Não escrever raciocínio, análise,
justificativa, contexto, retrospectiva, elogio, introdução, explicação
técnica não pedida, lista de arquivos analisados, nem narração do
processo. Nada de "vou analisar", "agora vou", "identifiquei", "ótimo",
"perfeito".

**Executar direto.** Não explicar antes, não narrar durante, não repetir
a solicitação, não resumir sem necessidade, não ensinar o que não foi
perguntado, não oferecer alternativas não pedidas, não alongar a
resposta para demonstrar trabalho.

**Resposta final — apenas este formato:**

```
FEITO:
- item

NÃO FEITO:
- item

POR QUÊ:
- motivo exato

COMO FAZER:
- ação exata
```

Se tudo foi concluído:

```
FEITO:
- item

NÃO FEITO:
- Nada.
```

Não inventar conteúdo para preencher seções.

**Nunca esconder falha. Nunca dizer que fez algo que não fez.** Bloqueio
real: informar curto e objetivo.

## Autorização — regra permanente

Tarefa pedida = execução autorizada até concluir.

Não perguntar "posso prosseguir", "deseja que eu execute", "quer que eu
continue", "posso aplicar", "posso executar o próximo passo", nem
qualquer outra confirmação. Não interromper entre passos.

Onde houver permissão persistente disponível, configurá-la em vez de
pedir autorização de novo.

**Exceção única:** confirmação obrigatória da interface (Claude Code,
MCP, Supabase). Nesse caso: pedir só o obrigatório, sem explicação;
continuar de onde parou assim que autorizado; e dizer objetivamente qual
configuração evita a próxima interrupção.

## Regras do produto que não se quebram

- O Supabase é a única autoridade sobre autenticação, liberações,
  bloqueios e progresso. Não sendo possível validar uma autorização, o
  aplicativo não concede acesso. No navegador, apenas sessão e posição
  recente do vídeo, como cache descartável.
- `localStorage` não é fonte oficial de dado.
- YouTube não hospeda conteúdo pago.
- O código de acesso do painel nunca entra no repositório.
- A chave de serviço do Supabase nunca chega ao navegador — vive apenas
  nas Edge Functions.
- A Edge Function `entrar` é a única com `verify_jwt: false`, e precisa
  continuar assim.

## Publicação — regra permanente

- **Push em `claude/new-session-3krqjt` = PRODUÇÃO** (Cloudflare publica o
  site). Só com pedido explícito ("publique"). Nunca para testar.
- Trabalho do dia a dia: só na **prévia**. Commit e push no branch de
  desenvolvimento da sessão (não publica o site).
- **Banco é um só** (prévia e produção). SQL, funções, uploads e dados de
  alunos valem na hora para todos: só com pedido específico.

## Prévia

- Painel: `bash scripts/previa.sh painel` (código + CSS, sempre completo).
- App da aluna (apresentação): `bash scripts/previa.sh app`.
- Só dizer "feito" depois de o script imprimir `PRÉVIA OK`.

## Como trabalhar (velocidade com qualidade)

- **Localizar:** consultar `TELAS.md`; `grep -n` pela função/classe; ler só
  o trecho. Nada de ler arquivo inteiro.
- **CSS:** antes de criar ou usar uma classe, `grep` do nome em
  `painel.css`/`area.css`. Já existe em outra tela → outro nome, com o
  prefixo da tela. Sem `!important` como atalho.
- **Editar:** ferramenta Edit com o trecho exato. Script de troca só com
  `assert` de 1 ocorrência.
- **Tarefa pequena** (texto, espaçamento, ícone, botão): achar → mudar o
  mínimo → `npx tsc --noEmit -p tsconfig.app.json` se mexeu em .ts →
  prévia → 1 print da área mexida (escuro; claro se mexeu em cor) →
  resposta curta.
- **Tarefa complexa** (fluxo de aluna, liberação, permissões, publicação,
  dados, componente compartilhado): mapear onde é usado → planejar →
  prévia → testar como equipe e como aluna → telas vizinhas que usam a
  mesma peça.
- **Checar antes de entregar mudança visual:** nada cortado, sobreposto,
  desalinhado ou saindo do quadro; abas inteiras; contraste ok; mesma
  peça em outra tela não quebrou.
- Não repetir comando que falhou sem entender o motivo. Não corrigir
  sintoma sem achar a causa.
- **Resposta:** FEITO / NÃO FEITO / POR QUÊ / COMO FAZER (acima), dizendo
  o que foi conferido e o que ficou sem conferir.

## Git

Desenvolver e commitar no branch de desenvolvimento da sessão.
`claude/new-session-3krqjt` só recebe envio quando o dono pede para
publicar (ver Publicação).
