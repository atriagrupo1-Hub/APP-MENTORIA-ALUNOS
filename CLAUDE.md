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
FEITO: uma frase.
PRÉVIA: atualizada e verificada (ou motivo de não ter sido).
VALIDADO: o que foi conferido.
TEMPO: duração total, se medida.
PENDENTE: só se houver (o quê, por quê, como resolver).
```

Não inventar conteúdo nem medição para preencher seções.

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
- **SEM PRINT — regra obrigatória.** Não tirar print/captura de tela, a
  não ser que o dono peça. Nem para conferir.
- O script só envia ao depósito `previa` do Supabase: não publica o site
  nem mexe em branch.

## MODO TURBO — como trabalhar (permanente)

Pedido → execução → prévia → resultado. Metas (não garantias): visual
pequeno 30–60 s; intermediário 1–3 min; complexo o necessário. Velocidade
nunca justifica pular segurança, teste necessário ou validação.

- **Executar direto:** sem plano longo, auditoria prévia, relatório
  intermediário ou nova autorização para detalhe dentro do escopo. Perguntar
  só se a dúvida puder causar dano.
- **Localizar:** `TELAS.md` → `grep -n` pela função/classe → ler só o
  trecho. Se o mapa estiver errado, vale o código (e corrigir o mapa).
- **CSS:** antes de mexer, `grep` do seletor em `painel.css`/`area.css`:
  onde é usado, regras concorrentes, especificidade, `!important`, peça
  compartilhada. Classe nova com prefixo da tela; sem `!important` como
  atalho; sem reescrever bloco grande por detalhe. Conflito local dentro do
  escopo: resolver sem perguntar. Refatoração estrutural: não fazer.
- **Editar:** Edit com o trecho exato; script de troca só com `assert` de 1
  ocorrência; conferir o diff. Comando que falhou não se repete sem saber a
  causa.
- **Verificar proporcional:** `npx tsc --noEmit -p tsconfig.app.json` se
  mexeu em .ts; CSS/texto isolado não pede bateria completa; regra de
  negócio pede teste funcional e de regressão. Sem build repetido à toa.
- **Prévia uma vez por tarefa** (validar antes para não soltar várias
  versões — cada versão recarrega a tela aberta).
- **Sem print** (só se o dono pedir). Se pedir: esperar
  `domcontentloaded` + o elemento, nunca `networkidle`; só a área mexida.
- **Tarefa complexa** (fluxo, dados, liberação, permissões, autenticação,
  componente compartilhado): mapear dependências → executar no escopo →
  testar como equipe e como aluna → regressões → prévia.
- **Sessões curtas:** conversa longa gera compactação lenta (1 min 24 s
  medido). Guardar o que importa em `CLAUDE.md`/`TELAS.md`; recomendar
  conversa nova antes de tarefa grande quando a sessão estiver longa.
- **Modelo/esforço:** não trocar sozinho. Latência menor é escolha do dono
  (`/model`, `/fast`, esforço).

## Git

Desenvolver e commitar no branch de desenvolvimento da sessão.
`claude/new-session-3krqjt` só recebe envio quando o dono pede para
publicar (ver Publicação).
