#!/bin/bash
# Atualiza a PRÉVIA (nunca a produção) e confere que a versão nova chegou.
#   bash scripts/previa.sh css       → só painel.css     (~2–3 s, sem build)
#   bash scripts/previa.sh painel    → código + CSS       (build completo)
#   bash scripts/previa.sh app-css   → só area.css        (~2–3 s, sem build)
#   bash scripts/previa.sh app       → app da aluna       (build completo)
# O CSS da tela (painel.css / area.css) vai sempre como arquivo à parte, sem
# passar pelo build: por isso mudança só de CSS não precisa montar nada.
# As chaves vêm da API do Supabase na hora e ficam só em /tmp (nunca no repositório).
set -e
T0=$(date +%s%3N)
ALVO="${1:-painel}"
cd "$(dirname "$0")/.."
CH=/tmp/claude-0/.chaves; mkdir -p /tmp/claude-0
[ -s "$CH" ] || curl -s "https://api.supabase.com/v1/projects/crcclhmamknqkamvavyp/api-keys?reveal=true" > "$CH"; chmod 600 "$CH"
K=$(python3 -c "import json;print([k['api_key'] for k in json.load(open('$CH')) if k.get('name')=='service_role'][0])")
A=$(python3 -c "import json;print([k['api_key'] for k in json.load(open('$CH')) if k.get('name')=='anon'][0])")
export VITE_SUPABASE_URL=https://crcclhmamknqkamvavyp.supabase.co VITE_SUPABASE_ANON_KEY="$A" VITE_SUPABASE_PUBLISHABLE_KEY="$A"
case "$ALVO" in
  app|app-css) CFG=vite.app-previa.config.ts; OUT=dist-app-previa; PASTA=a; ENT='^app-.*\.js$'; JSON=app.json; FONTE=src/aluna/area.css; NOME=area;;
  painel|css)  CFG=vite.previa.config.ts; OUT=dist-previa; PASTA=b; ENT='^painel-.*\.js$'; JSON=atual.json; FONTE=src/painel/painel.css; NOME=painel;;
  *) echo "uso: previa.sh css|painel|app-css|app"; exit 1;;
esac
U="$VITE_SUPABASE_URL/storage/v1/object/previa"; PUB="$VITE_SUPABASE_URL/storage/v1/object/public/previa"
LISTA=/tmp/claude-0/previa-enviados-$ALVO.txt; [ "$ALVO" = css ] && LISTA=/tmp/claude-0/previa-enviados-painel.txt; [ "$ALVO" = app-css ] && LISTA=/tmp/claude-0/previa-enviados-app.txt
touch "$LISTA"
enviar() { # $1 arquivo  $2 caminho no depósito  $3 tipo
  local c; c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$U/$2" -H "Authorization: Bearer $K" -H "apikey: $K" -H "x-upsert: true" -H "Content-Type: $3" -H "Cache-Control: max-age=31536000" --data-binary @"$1")
  [ "$c" = 200 ] || { sleep 1; c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$U/$2" -H "Authorization: Bearer $K" -H "apikey: $K" -H "x-upsert: true" -H "Content-Type: $3" -H "Cache-Control: max-age=31536000" --data-binary @"$1"); }
  [ "$c" = 200 ] || { echo "FALHOU envio $2 ($c)"; exit 1; }
}
if [ "$ALVO" = painel ] || [ "$ALVO" = app ]; then
  rm -rf "$OUT"; npx vite build -c "$CFG" > /tmp/claude-0/previa-$ALVO.log 2>&1 || { tail -20 /tmp/claude-0/previa-$ALVO.log; exit 1; }
  for f in "$OUT"/assets/*; do n=$(basename "$f"); grep -qx "$n" "$LISTA" && continue
    case $n in *.js|*.mjs) t=application/javascript;; *.css) t=text/css;; *.webp) t=image/webp;; *.png) t=image/png;; *.svg) t=image/svg+xml;; *.woff2) t=font/woff2;; *) t=application/octet-stream;; esac
    enviar "$f" "$PASTA/assets/$n" "$t"; echo "$n" >> "$LISTA"
  done
  E="$PASTA/assets/$(ls "$OUT"/assets/ | grep -E "$ENT")"
  BASECSS=$(ls "$OUT"/assets/ | grep -E '\.css$' | sed "s|^|$PASTA/assets/|" | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
  echo "{\"entrada\":\"$E\",\"css\":$BASECSS}" > /tmp/claude-0/base-$JSON
else
  [ -s /tmp/claude-0/base-$JSON ] || { echo "Primeiro rode o build completo: previa.sh ${ALVO%-css}"; [ "$ALVO" = css ] && echo "(previa.sh painel)"; exit 1; }
fi
# CSS da tela, direto do arquivo-fonte (nome com o conteúdo, para o navegador não usar cópia velha)
H=$(md5sum "$FONTE" | cut -c1-10); CSSN="$PASTA/css/$NOME-$H.css"
grep -qx "$CSSN" "$LISTA" || { enviar "$FONTE" "$CSSN" text/css; echo "$CSSN" >> "$LISTA"; }
ID=$(date +%s%3N)
python3 - /tmp/claude-0/base-$JSON "$ID" "$CSSN" > /tmp/claude-0/$JSON <<'PY'
import json,sys
b=json.load(open(sys.argv[1])); print(json.dumps({"id":sys.argv[2],"entrada":b["entrada"],"css":b["css"]+[sys.argv[3]]}))
PY
c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$U/$JSON" -H "Authorization: Bearer $K" -H "apikey: $K" -H "x-upsert: true" -H "Content-Type: application/json" -H "Cache-Control: no-store" --data-binary @/tmp/claude-0/$JSON)
[ "$c" = 200 ] || { echo "FALHOU envio $JSON ($c)"; exit 1; }
# Conferência: a versão publicada é esta, e o código e o CSS abrem.
python3 - "$PUB" "$JSON" "$ID" "$T0" <<'PY'
import json,sys,urllib.request,time
pub,arq,idv,t0=sys.argv[1:]
v=json.load(urllib.request.urlopen(f"{pub}/{arq}?t={time.time()}"))
assert v["id"]==idv, "a prévia não pegou a versão nova"
for p in [v["entrada"]]+v["css"]:
    assert urllib.request.urlopen(urllib.request.Request(f"{pub}/{p}",method="HEAD")).status==200, "arquivo não abre: "+p
print("PRÉVIA OK", arq, idv, v["entrada"], *v["css"], f"({(time.time()*1000-int(t0))/1000:.1f} s)")
PY
