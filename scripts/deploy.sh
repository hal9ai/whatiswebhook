#!/usr/bin/env bash
# Deploy whatiswebhook to Cloudish from the repo root: upload the folder,
# wait for the server-side build, and print the live URL.
#
#   CLOUDISH_API_KEY=cld_... scripts/deploy.sh
#
# No key yet? One call creates one, no signup (save "key" from the answer):
#   curl -X POST https://cloudish.ai/api/v1/keys -H "content-type: application/json" \
#     -d '{"alias": "whatiswebhook", "agent": "claude-code"}'
#
# The tester keeps requests in memory, so the app runs as one replica. URLs
# survive a sleep and the page keeps its own history, so a short idle timeout
# is fine (per-key setting, so it also applies to other apps on the same key):
#   curl -X PATCH https://cloudish.ai/api/v1/me -H "Authorization: Bearer $CLOUDISH_API_KEY" \
#     -H "content-type: application/json" -d '{"settings": {"idleTimeoutSeconds": 300}}'
set -euo pipefail

API=${CLOUDISH_API:-https://cloudish.ai}
NAME=${NAME:-whatiswebhook}
: "${CLOUDISH_API_KEY:?Set CLOUDISH_API_KEY first (see the top of this script)}"
cd "$(dirname "$0")/.."

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],JSON.parse(s));console.log(v??"")})' "$1"; }
auth=(-H "Authorization: Bearer $CLOUDISH_API_KEY")

ctx=$(mktemp -t whatiswebhook-XXXX.tar.gz)
tar --exclude='.git' --exclude='node_modules' --exclude='.env*' -czf "$ctx" .
echo "Uploading $(du -h "$ctx" | cut -f1) build context…"
resp=$(curl -fsS -X POST "$API/api/v1/projects" "${auth[@]}" \
  -F "name=$NAME" -F "port=8080" -F "replicas=1" -F "context=@$ctx")
rm -f "$ctx"
path=$(echo "$resp" | json project.path)
build=$(echo "$resp" | json build.id)
echo "Project $path, build $build"

seen=$(mktemp)
while :; do
  b=$(curl -fsS "$API/api/v1/images/builds/$build" "${auth[@]}")
  status=$(echo "$b" | json build.status)
  # build.logs is a rolling tail: print only lines not printed before.
  echo "$b" | json build.logs | grep -vxF -f "$seen" | tee -a "$seen" || true
  case "$status" in
    succeeded) break ;;
    failed) echo "Build failed: $(echo "$b" | json build.error)" >&2; rm -f "$seen"; exit 1 ;;
  esac
  sleep 3
done
rm -f "$seen"

# A readable URL instead of the random one; skipped quietly if the label is taken.
url=$(curl -fsS -X PUT "$API/api/v1/projects/$path/subdomain" "${auth[@]}" \
  -H "content-type: application/json" -d "{\"label\": \"$NAME\"}" 2>/dev/null | json subdomain.url || true)
if [ -z "$url" ]; then
  project=$(curl -fsS "$API/api/v1/projects/$path" "${auth[@]}")
  url=$(echo "$project" | json subdomain.url)
  [ -n "$url" ] || { echo "Deployed, but no URL in the answer:"; echo "$project"; exit 0; }
fi
echo
echo "Live: $url"
echo "Tester: ${url%/}/webhook-tester.html"
