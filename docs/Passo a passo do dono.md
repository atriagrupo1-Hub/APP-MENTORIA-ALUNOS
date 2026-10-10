# Passo a passo do dono

Três coisas só se fazem de dentro das contas — Supabase e Cloudflare.
Aqui está onde clicar e o que fazer, em ordem: da mais rápida e sem
risco para a mais delicada.

---

## ETAPA 1 — Proteção contra senha vazada

**2 minutos. Sem risco. Nada sai do ar.**

O Supabase confere a senha contra a lista pública de senhas já vazadas
(HaveIBeenPwned) e recusa as que estão lá. Hoje está desligado.

1. Abrir `https://supabase.com/dashboard/project/crcclhmamknqkamvavyp`
2. Menu da esquerda: **Authentication**
3. Dentro dele: **Policies** (em alguns temas a Supabase chama de
   *Attack Protection* ou *Auth Protection*)
4. Procurar **Leaked password protection**
5. Ligar a chave e **Save**

**Como saber que pegou:** recarregar a página e a chave continuar ligada.

---

## ETAPA 2 — Require Signed URLs em cada vídeo

**1 minuto por vídeo. Sem risco.**

Sem isso, quem descobrir o endereço do vídeo assiste sem ser aluna.
Hoje só há **um** vídeo na conta, e ele já está protegido. Isto é para
**cada vídeo novo**.

1. Abrir `https://dash.cloudflare.com`
2. Menu da esquerda: **Stream** → **Vídeos**
3. Clicar no vídeo
4. Aba **Settings**
5. Ligar **Require Signed URLs**
6. **Save**

**Como saber que pegou:** abrir a aula no aplicativo e o vídeo tocar.
Se tocar, a assinatura está funcionando. Se der erro, parar e avisar
antes de subir os outros.

**Ordem que evita esquecer:** subir o vídeo → ligar Require Signed URLs
→ só então criar a aula no painel.

---

## ETAPA 3 — Trocar a chave de assinatura

**10 minutos. O vídeo fica fora do ar entre 3.3 e 3.5 — fazer os três
seguidos, em horário de pouca gente.**

A chave em uso foi colada numa conversa. Enquanto ela existir, quem
tiver aquele texto consegue assinar vídeo como se fosse o aplicativo.
**Apagar a antiga é o que resolve** — criar outra, sozinho, não resolve.

A Cloudflare não tem tela para isso. É por API, três chamadas.

### 3.1 — Pegar os dois valores

**ID da conta**
`https://dash.cloudflare.com` → **Stream** → coluna da direita →
**Account ID** → copiar.

**Token de API**
`https://dash.cloudflare.com/profile/api-tokens` → **Create Token** →
rolar até o fim → **Create Custom Token** → **Get started** →
em Permissions escolher **Account · Stream · Edit** → **Continue to
summary** → **Create Token** → copiar.
(Se o token que você criou antes ainda existe, ele serve.)

### 3.2 — Ver qual chave existe

Trocar `SEU_TOKEN` e `SUA_CONTA` pelos valores acima:

```
curl -X GET \
  "https://api.cloudflare.com/client/v4/accounts/SUA_CONTA/stream/keys" \
  -H "Authorization: Bearer SEU_TOKEN"
```

Anotar o `id` que vier. É a chave exposta.

### 3.3 — Apagar a exposta

```
curl -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/SUA_CONTA/stream/keys/ID_DA_CHAVE" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3.4 — Criar a nova

```
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/SUA_CONTA/stream/keys" \
  -H "Authorization: Bearer SEU_TOKEN"
```

A resposta traz `id` e `jwk`. **Não colar em conversa nenhuma.** Vão
direto para o Supabase, no passo seguinte.

### 3.5 — Guardar no Supabase

1. `https://supabase.com/dashboard/project/crcclhmamknqkamvavyp/settings/functions`
2. Em **Edge Function Secrets**, editar os dois:
   - `STREAM_CHAVE_ID` → o `id` da resposta
   - `STREAM_CHAVE_JWK` → o `jwk` **exatamente como veio**, sem tirar
     nem acrescentar nada. Começa com `eyJ` e termina com `=`.
3. **Save**

### 3.6 — Conferir

Abrir a aula com vídeo no aplicativo.

- **Tocou** → a chave nova está valendo e a antiga não serve mais para
  ninguém. Acabou.
- **Não tocou** → o mais provável é o `jwk` ter sido colado pela
  metade; copiar de novo, inteiro, e salvar.

---

## Regra que não se quebra

Token, chave, `jwk` e código de acesso **nunca** passam por conversa,
nem por mensagem, nem entram no repositório. Vão do lugar onde nascem
direto para o lugar onde moram — os segredos das Edge Functions.

---

## ETAPA 4 — Ligar o painel novo (souaion.com/admin)

**Fazer as três partes em seguida, nesta ordem.** O painel novo e a área
da aluna nova dependem do banco novo.

### 4.1 Banco (5 minutos)

1. Abrir `https://supabase.com/dashboard/project/crcclhmamknqkamvavyp/sql/new`
2. Colar o arquivo inteiro `supabase/migrations/0040_painel_da_maquete.sql`
   (a 0039 já está aplicada)
3. **Run**. Tem de terminar com *Success. No rows returned*.

### 4.2 Edge Functions (2 minutos)

Supabase → **Edge Functions** → abrir cada uma → **Edit** → colar o
arquivo do repositório → **Deploy**:

- `cadastrar-aluna` ← `supabase/functions/cadastrar-aluna/index.ts`
- `cadastrar-colaborador` ← `supabase/functions/cadastrar-colaborador/index.ts`

Não mexer na `entrar`.

### 4.3 Site

Publicar o branch `claude/new-session-3krqjt` na Cloudflare Pages
(projeto `mentoria-aion`). Depois abrir `souaion.com/admin`, entrar com o
login e o código do dono, e conferir as abas.
