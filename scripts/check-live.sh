#!/usr/bin/env bash
# Smoke-check the live deployment (read-only). Run after every push and before a walkthrough.
#   bash scripts/check-live.sh
# Override hosts with FRONTEND=... API=... if they move (e.g. to DigitalOcean).

FRONTEND="${FRONTEND:-https://app.oysipa.site}"
API="${API:-https://investor-tracking.onrender.com}"
fail=0

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }

echo "Frontend: $FRONTEND"
echo "API:      $API"
echo

# 1. Frontend loads
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$FRONTEND")
[ "$code" = "200" ] && pass "frontend responds 200" || bad "frontend responds $code"

# 2. Frontend bundle points at the expected API
bundle=$(curl -s -m 30 "$FRONTEND" | grep -oE '/assets/index-[^"]+\.js' | head -1)
if [ -n "$bundle" ] && curl -s -m 60 "$FRONTEND$bundle" | grep -q "$API"; then
  pass "bundle calls $API"
else
  bad "bundle does not reference $API (check VITE_API_URL in Vercel)"
fi

# 3. API health (waits up to ~3 min for a cold start)
health=""
for _ in $(seq 1 12); do
  health=$(curl -s -m 15 -w ' %{http_code}' "$API/health")
  case "$health" in *'"UP"'*' 200') break ;; esac
  sleep 15
done
case "$health" in *'"UP"'*' 200') pass "API /health is UP" ;; *) bad "API /health: ${health:-no response}" ;; esac

# 4. CORS preflight from the frontend origin
allow=$(curl -s -m 30 -o /dev/null -D - -X OPTIONS "$API/api/auth/login" \
  -H "Origin: $FRONTEND" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' \
  | tr -d '\r' | grep -i '^access-control-allow-origin:' | cut -d' ' -f2)
[ "$allow" = "$FRONTEND" ] && pass "CORS allows $FRONTEND" || bad "CORS allow-origin is '${allow:-missing}' (check FRONTEND_URL on the API host)"

# 5. Login route reaches the database (fake user must be rejected with 400 "Invalid credentials")
resp=$(curl -s -m 30 -w ' %{http_code}' -X POST "$API/api/auth/login" -H "Origin: $FRONTEND" \
  -H 'Content-Type: application/json' -d '{"email":"smoke-check@invalid.test","password":"x"}')
case "$resp" in *'Invalid credentials'*' 400') pass "login route + database reachable" ;; *) bad "login route: $resp" ;; esac

echo
[ $fail = 0 ] && echo "All checks passed." || echo "Some checks FAILED."
exit $fail
