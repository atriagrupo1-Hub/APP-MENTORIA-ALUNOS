# Banco — Supabase / PostgreSQL

Fonte única de verdade sobre autenticação, liberações, bloqueios e
progresso. O aplicativo não concede acesso sem resposta do banco; no
navegador ficam apenas a sessão e a posição recente do vídeo, como cache
descartável.

## Migrations

| Arquivo | O que faz |
|---|---|
| `migrations/0001_estrutura_inicial.sql` | Tabelas, RLS e funções |
| `migrations/0002_storage.sql` | Depósitos `capas`, `materiais` e `audios`, com suas regras |
| `migrations/0003_comentarios_por_coluna.sql` | Anonimato dos comentários por privilégio de coluna, e a moderação |
| `migrations/0004_catalogo.sql` | Os 11 módulos, as 50 aulas, as 11 aulas ao vivo e as 4 categorias |
| `migrations/0005_limite_por_ip.sql` | Limite de tentativas de login por origem |
| `migrations/0039_comentario_para_moderar.sql` | O estado `pendente` dos comentários |
| `migrations/0040_painel_da_maquete.sql` | O banco do painel da maquete: moderação, liberada para todas, numeração pela posição, entrada, liberação em três níveis, cronograma por módulo, quem da equipe faz o quê |

## Projeto

| | |
|---|---|
| Nome | MENTORIA-AION |
| Organização | painel-mestre-atria (Pro) |
| Região | São Paulo (`sa-east-1`) |
| Reference | `crcclhmamknqkamvavyp` |

As cinco migrations estão aplicadas. O banco tem o catálogo completo e
a conta de administradora; nenhuma aluna e nenhuma mídia ainda.

Aplicar em ordem, como dono `postgres`. As funções `security definer`
leem tabelas protegidas por RLS de dentro das políticas dessas mesmas
tabelas — isso só não entra em recursão infinita porque o dono tem
`BYPASSRLS`. Aplicar com outro dono trava o banco inteiro.

## Testar antes de aplicar

```bash
./supabase/testes/rodar.sh
```

Sobe um PostgreSQL 16 descartável, aplica as migrations sobre um
arremedo do ambiente Supabase (schemas `auth` e `storage`, papéis `anon`,
`authenticated` e `service_role`) e roda 31 provas das regras de acesso:
o que a aluna alcança, o que a administradora vê, e o que ninguém deve
conseguir.

## Diferenças em relação ao script do handoff

O `handoff_area_de_membros/app/Banco de Dados.sql` continua no
repositório, intacto, como referência. As migrations corrigem o que a
revisão apontou; cada mudança está marcada com `[CORRIGIDO]` no lugar
onde acontece.

| # | O que era | O que virou |
|---|---|---|
| 1 | `video_provider`/`video_ref` como colunas do catálogo, legíveis por qualquer aluna ativa | Tabelas `aula_midia`, `presente_midia` e `ao_vivo_midia`, só da administradora; o endereço sai por função, depois de conferida a liberação |
| 2 | View de comentários `security_invoker = true`, e a política da tabela-base liberava a linha com `autora_id` | Política base restrita a admin e à própria autora; a view roda como dona, filtra por conta própria e não traz autoria |
| 3 | `codigo`, `tentativas_erradas` e `travada_ate` em `profiles`, legíveis pela própria aluna | Tabela `credenciais`, só da administradora |
| 4 | `UPDATE` de comentário sem `pode_ver_aula` no `WITH CHECK` | Não dá mais para mover o comentário para uma aula bloqueada |
| 5 | Autora apagava a linha do comentário | `remover_meu_comentario()` muda o status e preserva o histórico |
| 6 | Índices únicos comuns em `modulos(numero)` e `aulas(modulo_id, numero)` | Constraints `deferrable initially deferred` — reordenar deixa de quebrar |
| 7 | Sem índice nas chaves estrangeiras de cascata | `progresso(aula_id)`, `curtidas(aula_id)` e os quatro alvos de `acessos` |
| 8 | `minhas_aulas()` chamava `pode_ver_aula()` por linha | Uma consulta só, com desempate na ordenação |
| 9 | Contador de erros nunca zerava: uma tentativa a cada 15 min, para sempre | Zera quando a trava expira |
| 10 | `registrar_duracao()` aceitava qualquer inteiro do navegador | Limites de 30 s a 10 h |
| 11 | Funções com `execute` para `public` por padrão | `revoke` geral e `grant` só no necessário |

Duas coisas do modelo mudaram junto:

- `video_provider` nasce `'stream'` (Cloudflare Stream), não `youtube`.
- Existe `aulas_ao_vivo` com mídia própria e função de acesso
  (`video_da_ao_vivo`), que o script original não tinha — a aula ao vivo
  segue a liberação do módulo dela.

## Ainda fora do SQL

- **Edge Function do vídeo** — troca o `video_ref` do Cloudflare Stream
  por um token assinado de curta duração.
- **Primeira conta de administradora** — feita. O procedimento está em
  `administradora.exemplo.sql`, com placeholders: o código de acesso é
  credencial e não entra no repositório.
- **As 56 capas** — subir para o depósito `capas`. Os caminhos já estão
  gravados em `modulos.capa_path` e `aulas.capa_path`, na convenção do
  item 10 do README do handoff.
- **Os vídeos** — subir para o Cloudflare Stream e gravar o `uid` de
  cada um em `aula_midia`. Enquanto a tabela estiver vazia, a aula
  aparece como indisponível, que é o comportamento correto.

## Sobre os avisos do linter do Supabase

`get_advisors` de segurança devolve 19 avisos, todos do mesmo tipo:
*Signed-In Users Can Execute SECURITY DEFINER Function*. Nenhum é
defeito, e nenhum deve ser "corrigido" revogando o `EXECUTE`.

**As funções de predicado precisam do `EXECUTE`.** `pode_ver_aula`,
`pode_ver_presente`, `pode_ver_ao_vivo`, `eh_admin` e `conta_ativa` são
chamadas de dentro das políticas de RLS, e o Postgres avalia a política
com os privilégios de quem consulta. Revogar o `EXECUTE` não fecha nada
— quebra tudo. Verificado: sem ele, `select` em `aula_materiais` devolve
`permission denied for function pode_ver_aula`.

**As demais são o desenho.** `video_da_aula`, `video_do_presente` e
`video_da_ao_vivo` só têm razão de existir sendo `security definer`: é
assim que leem as tabelas de mídia, fechadas à aluna, depois de conferir
a liberação. `minhas_aulas`, `meu_perfil`, `meus_comentarios`,
`salvar_posicao`, `marcar_concluida`, `alternar_curtida`,
`registrar_duracao`, `editar_meu_comentario`, `remover_meu_comentario`,
`comentarios_para_moderacao` e `moderar_comentario` conferem
`auth.uid()` ou `eh_admin()` por dentro, antes de qualquer leitura ou
escrita.

`verificar_codigo` é a única sem `EXECUTE` para `authenticated`: ela fica
só para a Edge Function, com a chave de serviço.

O linter acusava também um **ERRO** — `security_definer_view` em
`comentarios_publicos`. Esse era legítimo e foi eliminado pela migration
0003: o anonimato deixou de depender do filtro dentro de uma view
privilegiada e passou a ser privilégio de coluna, que nenhuma mudança
futura de política reabre.

## Edge Function `entrar`

`functions/entrar/index.ts` — publicada e ativa.

É o único ponto do sistema que conhece a chave de serviço. Recebe nome de
acesso e código, confere no banco e, dando certo, emite a sessão. O
navegador nunca vê a chave de serviço, nunca chama `verificar_codigo()` e
nunca decide nada sobre acesso.

```
POST https://<projeto>.supabase.co/functions/v1/entrar
Header:  apikey: <chave publicável>
Corpo:   { "login": "admin", "codigo": "123456" }
```

| Resposta | Quando |
|---|---|
| `200` + `access_token`, `refresh_token` | Nome e código conferem |
| `400` | Campo faltando, ou código fora do formato (4 a 6 dígitos) |
| `401` `acesso_invalido` | Nome inexistente **ou** código errado — de propósito, a mesma resposta para os dois |
| `403` `conta_bloqueada` | `profiles.status = 'bloqueada'` |
| `423` `conta_travada` | 5 erros seguidos: 15 minutos |
| `429` `muitas_tentativas` | 20 tentativas da mesma origem em 15 minutos |
| `503` | Falha do servidor. O motivo fica no log da função, nunca na resposta |

**`verify_jwt` está desligado, de propósito.** É o endpoint de login:
quem chama ainda não tem sessão. A autenticação é a própria função, e é
por isso que o limite por origem existe.

**Duas travas, uma sobre a outra.** A de `verificar_codigo()` é por
conta e protege uma aluna. A de `registrar_tentativa_ip()` é por origem e
impede varrer muitas contas em paralelo — que é o ataque real contra um
código de 4 dígitos. A segunda vive no banco porque Edge Function não
guarda estado entre invocações.

**Como a sessão é emitida.** O Supabase Auth não tem login por código.
A função gera um token de uso único pela API administrativa e o consome
ali mesmo, no próprio servidor: nunca é enviado por e-mail nem exposto ao
navegador. O que volta para o aplicativo é a sessão pronta.

### Testar

```bash
CHAVE_ANON=<chave publicável> ./supabase/testes/testar_entrar.sh admin <codigo>
```

Cinco chamadas, dos casos de erro ao acesso válido. Não imprime os
tokens — só o tamanho, para confirmar que vieram. As tentativas erradas
contam para a trava de 5 por conta.

### Variável a definir em produção

`ORIGENS_PERMITIDAS` — o domínio da Cloudflare Pages, separando por
vírgula se houver mais de um. Sem ela, a função responde a qualquer
origem, o que serve para desenvolvimento e não para produção.
