#!/bin/bash
# Sync — TMS destination trust
# Demonstrates that a repo-supplied tms.server cannot redirect an
# environment-held TMS_API_KEY to a host you have not approved

set -e  # Exit on error

echo "=== DeepL CLI: Sync — TMS Destination Trust ==="
echo

# push talks to a TMS, not to DeepL, so no DeepL API key is needed. The TMS here
# is a throwaway listener on loopback, so this example needs no network either.
echo "No API key needed: push talks to a TMS, and this example runs its own."
echo

PROJECT_DIR="/tmp/deepl-tms-trust-demo"
CONFIG_DIR="/tmp/deepl-tms-trust-config"
rm -rf "$PROJECT_DIR" "$CONFIG_DIR"
mkdir -p "$PROJECT_DIR/locales" "$CONFIG_DIR"

LISTENER_PID=""
cleanup() {
  [ -n "$LISTENER_PID" ] && kill "$LISTENER_PID" 2>/dev/null || true
  rm -rf "$PROJECT_DIR" "$CONFIG_DIR"
}
trap cleanup EXIT

# An isolated config dir, so the example cannot touch your real allowlist.
export DEEPL_CONFIG_DIR="$CONFIG_DIR"

cd "$PROJECT_DIR"

# 1. A stand-in TMS that records what it receives. Stands in for the attacker's
#    listener in the refusal step and for a legitimate TMS in the last one.
cat > tms.mjs << 'EOF'
import http from 'node:http';
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    console.error(`  [tms] ${req.method} ${req.url}`);
    console.error(`  [tms]   authorization: ${req.headers['authorization']}`);
    console.error(`  [tms]   body: ${body}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
});
srv.listen(0, '127.0.0.1', () =>
  console.log(`PORT=${srv.address().port}`)
);
EOF

node tms.mjs > port.txt 2> tms.log &
LISTENER_PID=$!
for _ in $(seq 1 50); do
  grep -q PORT= port.txt 2>/dev/null && break
  sleep 0.1
done
PORT=$(sed 's/PORT=//' port.txt | tr -d '[:space:]')

# 2. The checkout chooses the destination. In a hostile repository this is the
#    attacker's host; the operator never typed it.
echo "1. A checkout whose .deepl-sync.yaml picks the TMS host"
cat > .deepl-sync.yaml << EOF
version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
tms:
  enabled: true
  server: http://localhost:$PORT
  project_id: victim-project
EOF
cat .deepl-sync.yaml
echo

echo '{ "greeting": "Hello" }' > locales/en.json
echo '{ "greeting": "Hallo" }' > locales/de.json

# 3. The credential comes from the operator's environment, which is the
#    recommended setup and normal for cross-project use. Nothing secret is in
#    the repo, and that is the point: the repo only has to name the host.
echo "2. Push with an environment-supplied credential, non-interactively"
echo "   (tms.allowedServers is empty, so this must not send anything)"
set +e
TMS_API_KEY='TMS-SECRET-CREDENTIAL-1234' deepl --no-input sync push
STATUS=$?
set -e
echo "   exit code: $STATUS  (7 = ConfigError)"
echo

echo "3. What the stand-in TMS received"
if [ -s tms.log ]; then
  cat tms.log
else
  echo "  (nothing — the credential never left the machine)"
fi
echo

# 4. The approval lives in USER config, outside the repository, so it survives a
#    fresh clone of the same project and does not travel with the repo.
echo "4. Approve the destination once, in your own configuration"
deepl config set tms.allowedServers localhost
deepl config get tms.allowedServers
echo
echo "   Recorded in \$DEEPL_CONFIG_DIR/config.json, not in the checkout:"
grep -c allowedServers "$CONFIG_DIR/config.json" > /dev/null && \
  echo "   ✓ $CONFIG_DIR/config.json"
test ! -f "$PROJECT_DIR/config.json" && echo "   ✓ nothing written to $PROJECT_DIR"
echo

# 5. Now the same command proceeds, and names the destination it used.
echo "5. Push again — approved, and the destination origin is reported"
TMS_API_KEY='TMS-SECRET-CREDENTIAL-1234' deepl --no-input sync push
echo
echo "   What the TMS received:"
cat tms.log
echo

# 6. Machine-readable output carries the destination too, so a pipeline can
#    assert on it rather than trusting the count alone.
echo "6. JSON output includes the resolved destination"
TMS_API_KEY='TMS-SECRET-CREDENTIAL-1234' deepl --no-input sync push --format json
echo

cat << 'EOF'

Notes:
  - The gate applies only to an ENVIRONMENT-supplied credential. A credential
    inlined as tms.api_key / tms.token in .deepl-sync.yaml is not gated: it
    belongs to the same file that chose the destination, so nothing of yours
    leaks. Inlining a secret is still discouraged, and warned about separately.
  - In an interactive terminal an unapproved host prompts once, naming the host
    and what would be sent, and records a yes in your user config. This example
    passes --no-input to show the non-interactive path, which fails closed.
  - Matching is exact and case-insensitive on the parsed hostname, ignoring
    scheme, port and path. A listed "example.com" does NOT approve
    "tms.example.com", and there are no wildcards.
  - Loopback is not exempt. This example approved "localhost" explicitly; a
    co-tenant process listening on 127.0.0.1 is as much an exfiltration sink as
    a remote host.
  - See docs/SYNC.md#tms-destination-trust for the full contract.

EOF

echo "=== TMS destination trust example complete ==="
