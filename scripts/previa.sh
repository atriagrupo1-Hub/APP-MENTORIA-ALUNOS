#!/bin/bash
# Atualiza a PRÉVIA (nunca a produção) e confere que a versão nova chegou.
#   bash scripts/previa.sh painel   → /admin?previa=1   (código + CSS, ~20 s)
#   bash scripts/previa.sh app      → /apresentacao     (app da aluna, ~10 s)
# Sempre build completo (leva o CSS junto). As chaves vêm da API do Supabase
# na hora e ficam só em /tmp (nunca no repositório).
set -e
ALVO="${1:-painel}"
cd "$(dirname "$0")/.."
CH=/tmp/claude-0/.chaves; mkdir -p /tmp/claude-0
[ -s "$CH" ] || curl -s "https://api.supabase.com/v1/projects/crcclhmamknqkamvavyp/api-keys?reveal=true" > "$CH"; chmod 600 "$CH"
K=$(python3 -c "import json;print([k['api_key'] for k in json.load(open('$CH')) if k.get('name')=='service_role'][0])")
A=$(python3 -c "import json;print([k['api_key'] for k in json.load(open('$CH')) if k.get('name')=='anon'][0])")
export VITE_SUPABASE_URL=https://crcclhmamknqkamvavyp.supabase.co VITE_SUPABASE_ANON_KEY="$A" VITE_SUPABASE_PUBLISHABLE_KEY="$A"
if [ "$ALVO" = app ]; then CFG=vite.app-previa.config.ts; OUT=dist-app-previa; PASTA=a; ENT='^app-.*\.js$'; JSON=app.json
else CFG=vite.previa.config.ts; OUT=dist-previa; PASTA=b; ENT='^painel-.*\.js$'; JSON=atual.json; fi
rm -rf "$OUT"; npx vite build -c "$CFG" > /tmp/claude-0/previa-$ALVO.log 2>&1 || { tail -20 /tmp/claude-0/previa-$ALVO.log; exit 1; }
U="$VITE_SUPABASE_URL/storage/v1/object/previa"; PUB="$VITE_SUPABASE_URL/storage/v1/object/public/previa"
LISTA=/tmp/claude-0/previa-enviados-$ALVO.txt; touch "$LISTA"
for f in "$OUT"/assets/*; do n=$(basename "$f"); grep -qx "$n" "$LISTA" && continue
  case $n in *.js|*.mjs) t=application/javascript;; *.css) t=text/css;; *.webp) t=image/webp;; *.png) t=image/png;; *.svg) t=image/svg+xml;; *.woff2) t=font/woff2;; *) t=application/octet-stream;; esac
  c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$U/$PASTA/assets/$n" -H "Authorization: Bearer $K" -H "apikey: $K" -H "x-upsert: true" -H "Content-Type: $t" -H "Cache-Control: max-age=31536000" --data-binary @"$f")
  [ "$c" = 200 ] && echo "$n" >> "$LISTA" || { echo "FALHOU envio $n ($c)"; exit 1; }
done
E=$(ls "$OUT"/assets/ | grep -E "$ENT"); C=$(ls "$OUT"/assets/ | grep -E '\.css$' | sed "s|^|$PASTA/assets/|" | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
ID=$(date +%s%3N); echo "{\"id\":\"$ID\",\"entrada\":\"$PASTA/assets/$E\",\"css\":$C}" > /tmp/claude-0/$JSON
curl -s -o /dev/null -X POST "$U/$JSON" -H "Authorization: Bearer $K" -H "apikey: $K" -H "x-upsert: true" -H "Content-Type: application/json" -H "Cache-Control: no-store" --data-binary @/tmp/claude-0/$JSON
# Conferência: a versão publicada é esta, e o código e o CSS abrem.
python3 - "$PUB" "$JSON" "$ID" <<'PY'
import json,sys,urllib.request,time
pub,arq,idv=sys.argv[1:]
v=json.load(urllib.request.urlopen(f"{pub}/{arq}?t={time.time()}"))
assert v["id"]==idv, "a prévia não pegou a versão nova"
for p in [v["entrada"]]+v["css"]:
    assert urllib.request.urlopen(urllib.request.Request(f"{pub}/{p}",method="HEAD")).status==200, "arquivo não abre: "+p
print("PRÉVIA OK", arq, idv, v["entrada"], *v["css"])
PY
