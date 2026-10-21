#!/usr/bin/env bash
# Publica uma Edge Function do Supabase pela API de gestão.
# Uso: bash scripts/publicar-funcao.sh <nome>
# `entrar` sai com verify_jwt desligado (é o login); todas as outras, ligado.
set -euo pipefail
nome="${1:?nome da função}"
dir="supabase/functions/$nome"
[ -f "$dir/index.ts" ] || { echo "não existe $dir/index.ts"; exit 1; }
jwt=true; [ "$nome" = "entrar" ] && jwt=false
args=()
while IFS= read -r f; do args+=(-F "file=@$f;filename=${f#supabase/functions/$nome/}"); done < <(find "$dir" -type f -name '*.ts')
curl -sS -X POST "https://api.supabase.com/v1/projects/crcclhmamknqkamvavyp/functions/deploy?slug=$nome" \
  -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$nome\",\"verify_jwt\":$jwt};type=application/json" \
  "${args[@]}"
echo
