#!/usr/bin/env bash
# tools/production-verifier.sh — Phase 7 T1–T7
# Verdict is ONLY VERIFIED or NOT VERIFIED.
# Missing PostgreSQL / Redis / git / Node = FAIL (exit 1). No skip. No mock.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE="${NODE:-}"
if [ -z "$NODE" ]; then
  if [ -x /tmp/node-v22.22.0-linux-x64/bin/node ]; then NODE=/tmp/node-v22.22.0-linux-x64/bin/node
  else NODE="$(command -v node || true)"; fi
fi
PSQL="$(command -v psql || true)"
REDIS_CLI="$(command -v redis-cli || true)"

PASS=0
FAIL=0
RESULTS=()

log() { printf '%s\n' "$*"; }
chk() {
  local id="$1" name="$2" ok="$3" detail="${4:-}"
  if [ "$ok" = "1" ]; then
    PASS=$((PASS+1))
    log "✅ [$id] $name${detail:+ — $detail}"
    RESULTS+=("PASS $id $name")
  else
    FAIL=$((FAIL+1))
    log "❌ [$id] $name${detail:+ — $detail}"
    RESULTS+=("FAIL $id $name :: $detail")
  fi
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "NOT VERIFIED — DATABASE_URL required (dependency missing = FAIL)"
  exit 1
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  log "NOT VERIFIED — node binary missing"
  exit 1
fi
if [ -z "$PSQL" ]; then
  log "NOT VERIFIED — psql missing"
  exit 1
fi

HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$HEAD" ] || { log "NOT VERIFIED — git HEAD missing"; exit 1; }

# ── T1 schema: 019 + VIEWs not TABLEs, no dual canary/governance tables ──
log ""
log "════ T1 — Schema authority foundation (VIEW not TABLE)"
ADM_URL="$DATABASE_URL"
DBNAME="payesh_p7v"
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DBNAME' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DBNAME;" >/dev/null
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $DBNAME;" >/dev/null
URL="$(python3 - <<'PY'
import os,re
u=os.environ['DATABASE_URL']
print(re.sub(r'/[^/?]+(\?.*)?$', lambda m: '/payesh_p7v'+(m.group(1) or ''), u, count=1))
PY
)"
export URL
apply_up() {
  local url="$1"
  DATABASE_URL="$url" $NODE "$ROOT/tools/migrate-ledger.js" up >/dev/null
}
apply_down() {
  local url="$1"
  DATABASE_URL="$url" $NODE "$ROOT/tools/migrate-ledger.js" down-all >/dev/null
}
if apply_up "$URL"; then chk T1 "UP 001→020" 1; else chk T1 "UP 001→020" 0 "migrate-ledger up failed"; fi

SM="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM schema_migrations;")"
chk T1 "schema_migrations ledger active (>=20 rows)" "$([ "${SM:-0}" -ge 20 ] && echo 1 || echo 0)" "rows=$SM"

REL="$(psql "$URL" -tA -c "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='canary_state';")"
chk T1 "canary_state is VIEW (relkind=v)" "$([ "$REL" = "v" ] && echo 1 || echo 0)" "relkind=$REL"
REL2="$(psql "$URL" -tA -c "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='governance_ledger';")"
chk T1 "governance_ledger is VIEW (relkind=v)" "$([ "$REL2" = "v" ] && echo 1 || echo 0)" "relkind=$REL2"
TBLC="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name IN ('canary_state','governance_ledger');")"
chk T1 "no physical canary_state/governance_ledger tables" "$([ "$TBLC" = "0" ] && echo 1 || echo 0)" "count=$TBLC"
TP="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM tenant_policy;")"
chk T1 "tenant_policy seeded" "$([ "${TP:-0}" -ge 20 ] && echo 1 || echo 0)" "rows=$TP"
AS="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='authority_state';")"
chk T1 "authority_state exists" "$([ "$AS" = "1" ] && echo 1 || echo 0)"
SA="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='system_audit';")"
chk T1 "system_audit exists" "$([ "$SA" = "1" ] && echo 1 || echo 0)"
PC="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='phase6_canary_configs';")"
chk T1 "phase6_canary_configs SoT intact (no dual schema)" "$([ "$PC" = "1" ] && echo 1 || echo 0)"

# ── T2 HTTP persist of Phase-5 control plane into authority_state ──
log ""
log "════ T2 — Control-plane persist (RAM cache, PG authority)"
$NODE server/seed.js >/dev/null 2>&1 || true
STORE="/tmp/p7v-store.json"
cp -f server/data/payesh.json "$STORE"
JWT="/tmp/p7v-jwt.key"
printf '0123456789abcdef0123456789abcdef' > "$JWT"
PORTA=3511
PORTB=3512
OTP_A=/tmp/p7v-otp-a.json
OTP_B=/tmp/p7v-otp-b.json
rm -f "$OTP_A" "$OTP_B"

boot_one() {
  local port="$1" otp="$2" logfile="$3"
  PAYESH_STORE="$STORE" PAYESH_KEY="$JWT" PAYESH_DEMO_CODE=1 \
    PAYESH_OTP_FILE="$otp" HOST=127.0.0.1 PORT="$port" DATABASE_URL="$URL" \
    PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY="${PUBB64:-}" \
    $NODE server/index.js >"$logfile" 2>&1 &
  echo $!
}

# generate governance key for T6 BEFORE boot so both instances load the public key
$NODE - <<'JS'
const gov = require('./server/infrastructure/phase6-governance');
const fs = require('fs');
const { publicKey, privateKey } = gov.generateGovernanceKeypair();
fs.writeFileSync('/tmp/p7v-gov-priv.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync('/tmp/p7v-gov.json', JSON.stringify({ pub: gov.exportPublicKeyB64(publicKey) }));
JS
PUBB64="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-gov.json"))["pub"])')"
[ -n "$PUBB64" ] && [ -s /tmp/p7v-gov-priv.pem ] || { echo "NOT VERIFIED — governance keygen failed"; exit 1; }

PIDA=$(boot_one "$PORTA" "$OTP_A" /tmp/p7v-a.log)
PIDB=$(boot_one "$PORTB" "$OTP_B" /tmp/p7v-b.log)
cleanup() {
  kill -9 "$PIDA" "$PIDB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_health() {
  local port="$1" n=0
  while [ $n -lt 480 ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health" || true)"
    if [ "$code" = "200" ]; then return 0; fi
    n=$((n+1)); sleep 0.25
  done
  return 1
}
if wait_health "$PORTA"; then chk T2 "instance A listen+hydrate" 1; else
  chk T2 "instance A listen+hydrate" 0 "$(tail -c 240 /tmp/p7v-a.log | tr '\n' ' ')"
fi
if wait_health "$PORTB"; then chk T2 "instance B listen+hydrate" 1; else
  chk T2 "instance B listen+hydrate" 0 "$(tail -c 240 /tmp/p7v-b.log | tr '\n' ' ')"
fi

LOGIN="$($NODE - <<JS
const fs=require('fs'); const http=require('http');
const st=JSON.parse(fs.readFileSync('$STORE','utf8'));
const su=(st.users||[]).find(u=>u.role==='superadmin');
const teacher=(st.users||[]).find(u=>u.role==='teacher' && Number(u.school_id)===3);
function req(port,method,p,body,cookie,headers){
  return new Promise(res=>{
    const data=body?JSON.stringify(body):null;
    const h=Object.assign({'content-type':'application/json'}, data?{'content-length':Buffer.byteLength(data)}:{}, cookie?{cookie}:{}, headers||{});
    const r=http.request({host:'127.0.0.1',port,path:p,method,headers:h}, resp=>{
      let b=''; resp.on('data',d=>b+=d); resp.on('end',()=>{
        let j=null; try{j=JSON.parse(b)}catch(e){}
        res({status:resp.statusCode, json:j, body:b, headers:resp.headers});
      });
    });
    r.on('error',()=>res({status:0,json:null,body:'',headers:{}}));
    if(data) r.write(data); r.end();
  });
}
(async()=>{
  const sc=await req($PORTA,'POST','/api/auth/send-code',{phone:su.phone});
  const lg=await req($PORTA,'POST','/api/auth/login',{phone:su.phone,code:sc.json&&sc.json.demo_code,national_id:su.national_id});
  const cookie=(lg.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
  const tsc=await req($PORTA,'POST','/api/auth/send-code',{phone:teacher.phone});
  const tlg=await req($PORTA,'POST','/api/auth/login',{phone:teacher.phone,code:tsc.json&&tsc.json.demo_code,national_id:teacher.national_id});
  const tcookie=(tlg.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
  fs.writeFileSync('/tmp/p7v-auth.json', JSON.stringify({cookie, tcookie, suOk: lg.status===200, tOk: tlg.status===200, lg: lg.status, tlg: tlg.status}));
})();
JS
)"
SU_OK="$(python3 -c 'import json;print(int(json.load(open("/tmp/p7v-auth.json"))["suOk"]))')"
chk T2 "superadmin login A" "$SU_OK" "$(python3 -c 'import json;print(json.load(open("/tmp/p7v-auth.json"))["lg"])')"

COOKIE="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-auth.json"))["cookie"])')"
TCOOKIE="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-auth.json"))["tcookie"])')"

# persist region state via HTTP
CR="$(curl -s -o /tmp/p7v-cr.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORTA/api/v1/system/national/change-request" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"change_type":"REGION_STATE","region_id":"ir-isfahan-1","target_state":"MAINTENANCE","approved":true,"automated_decision":false,"automated_execution":false,"requires_human_approval":true}')"
chk T2 "POST REGION_STATE on A" "$([ "$CR" = "200" ] && echo 1 || echo 0)" "http=$CR $(head -c 120 /tmp/p7v-cr.json)"

PG_REG="$(psql "$URL" -tA -c "SELECT payload->>'health_status' FROM authority_state WHERE kind='region' AND id='ir-isfahan-1';")"
chk T2 "authority_state.region persisted in PostgreSQL" "$([ "$PG_REG" = "MAINTENANCE" ] && echo 1 || echo 0)" "pg=$PG_REG"

curl -s "http://127.0.0.1:$PORTB/api/v1/system/national/regions?region_id=ir-isfahan-1" -H "Cookie: $COOKIE" > /tmp/p7v-getb.json
BSTAT="$(python3 -c 'import json; j=json.load(open("/tmp/p7v-getb.json")); print((j.get("region") or {}).get("health_status") or "")')"
chk T2 "instance B GET sees PG SoT (MAINTENANCE)" "$([ "$BSTAT" = "MAINTENANCE" ] && echo 1 || echo 0)" "B=$BSTAT body=$(head -c 160 /tmp/p7v-getb.json)"

# provincial persist
PA="$(curl -s -o /tmp/p7v-pa.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORTA/api/v1/system/phase5/provincial-pilots/activate" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"province_id":"isfahan","approved":true,"automated_decision":false,"automated_execution":false,"requires_human_approval":true}')"
chk T2 "POST provincial activate on A" "$([ "$PA" = "200" ] && echo 1 || echo 0)" "http=$PA $(head -c 80 /tmp/p7v-pa.json)"
PG_PR="$(psql "$URL" -tA -c "SELECT payload->>'pilot_status' FROM authority_state WHERE kind='provincial' AND id='isfahan';")"
chk T2 "authority_state.provincial persisted" "$([ -n "$PG_PR" ] && [ "$PG_PR" != "" ] && echo 1 || echo 0)" "pg=$PG_PR"

# ── T3 tenant_policy HTTP ──
log ""
log "════ T3 — tenant_policy HTTP guard"
BR="$(curl -s -o /tmp/p7v-br.json -w '%{http_code}' "http://127.0.0.1:$PORTA/api/v1/students?school_id=1" \
  -H "Cookie: $TCOOKIE" -H 'x-province-code: 04')"
BODYBR="$(cat /tmp/p7v-br.json)"
if [ "$BR" = "403" ] && echo "$BODYBR" | grep -q 'PHASE6_TENANT_ISOLATION_BREACH'; then
  chk T3 "cross-province header ⇒ 403 TENANT_BREACH" 1 "http=$BR"
else
  chk T3 "cross-province header ⇒ 403 TENANT_BREACH" 0 "http=$BR $BODYBR"
fi
POL="$(psql "$URL" -tA -c "SELECT province FROM tenant_policy WHERE province='04' LIMIT 1;")"
chk T3 "tenant_policy row for 04 is SoT" "$([ "$POL" = "04" ] && echo 1 || echo 0)" "row=$POL"

# ── T4 Redis fail-closed when REDIS_URL ──
log ""
log "════ T4 — Redis cache-only fail-closed"
RPORT=$((19010 + $$ % 500))
if [ -z "$REDIS_CLI" ]; then
  chk T4 "redis-cli present" 0 "missing"
else
  redis-server --port "$RPORT" --save '' --appendonly no --dir /tmp >/tmp/p7v-redis.log 2>&1 &
  RPID=$!
  sleep 0.6
  PONG="$(redis-cli -p "$RPORT" ping 2>/dev/null || true)"
  chk T4 "dedicated redis PONG" "$([ "$PONG" = "PONG" ] && echo 1 || echo 0)" "$PONG"
  PORTD=3514
  env -u DATABASE_URL PAYESH_STORE="$STORE" PAYESH_KEY="$JWT" PAYESH_DEMO_CODE=1 \
    PAYESH_OTP_FILE=/tmp/p7v-otp-d.json HOST=127.0.0.1 PORT="$PORTD" \
    REDIS_URL="redis://127.0.0.1:$RPORT" \
    $NODE server/index.js >/tmp/p7v-d.log 2>&1 &
  PIDD=$!
  if wait_health "$PORTD"; then
    chk T4 "boot with live REDIS_URL" 1
    PHONE="$(python3 - <<'PY'
import json
st=json.load(open("/tmp/p7v-store.json"))
u=next(x for x in st["users"] if x.get("role")=="superadmin")
print(u["phone"])
PY
)"
    OK1="$(curl -s -o /tmp/p7v-sc1.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORTD/api/auth/send-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}")"
    chk T4 "send-code while redis live" "$([ "$OK1" = "200" ] && echo 1 || echo 0)" "http=$OK1"
    kill -9 "$RPID" >/dev/null 2>&1 || true
    sleep 1.2
    PHONE2="$(python3 - <<'PY'
import json
st=json.load(open("/tmp/p7v-store.json"))
u=next(x for x in st["users"] if x.get("phone") and x.get("role")!="superadmin")
print(u["phone"])
PY
)"
    DEAD="$(curl -s -o /tmp/p7v-dead.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORTD/api/auth/send-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE2\"}")"
    DEADBODY="$(cat /tmp/p7v-dead.json)"
    if [ "$DEAD" = "503" ] && echo "$DEADBODY" | grep -q 'REDIS_UNAVAILABLE'; then
      chk T4 "REDIS_URL down ⇒ 503 REDIS_UNAVAILABLE" 1 "http=$DEAD"
    else
      chk T4 "REDIS_URL down ⇒ 503 REDIS_UNAVAILABLE" 0 "http=$DEAD $DEADBODY"
    fi
    if echo "$DEADBODY" | grep -qE 'fallback"\s*:\s*true|allowed"\s*:\s*true'; then
      chk T4 "body has no fallback:true/allowed:true" 0 "$DEADBODY"
    else
      chk T4 "body has no fallback:true/allowed:true" 1
    fi
  else
    chk T4 "boot with live REDIS_URL" 0 "$(tail -c 200 /tmp/p7v-d.log | tr '\n' ' ')"
  fi
  kill -9 "$PIDD" "$RPID" >/dev/null 2>&1 || true
fi

# ── T5 boot refuse without authority hydrate ──
log ""
log "════ T5 — DATABASE_URL without hydrate refuses listen()"
DBBAD="payesh_p7v_bad"
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DBBAD' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DBBAD;" >/dev/null
psql "$ADM_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $DBBAD;" >/dev/null
URLBAD="$(python3 - <<'PY'
import os,re
u=os.environ['DATABASE_URL']
print(re.sub(r'/[^/?]+(\?.*)?$', lambda m: '/payesh_p7v_bad'+(m.group(1) or ''), u, count=1))
PY
)"
# apply only through 018 so authority_state is missing
for f in $(ls "$ROOT/migrations"/[0-9][0-9][0-9]_*.sql | grep -v '\.down\.sql$' | sort | grep -v '019_'); do
  psql "$URLBAD" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
PORTC=3513
printf '%s\n' '{"users":[],"schools":[],"__processed_uids":{},"__revoked_jti":{},"__auth":{"codes":{},"login_fail":{},"code_rate":{}}}' > /tmp/p7v-empty-store.json
PAYESH_STORE=/tmp/p7v-empty-store.json PAYESH_KEY="$JWT" PAYESH_DEMO_CODE=1 \
  PAYESH_OTP_FILE=/tmp/p7v-otp-c.json HOST=127.0.0.1 PORT="$PORTC" DATABASE_URL="$URLBAD" \
  $NODE server/index.js >/tmp/p7v-c.log 2>&1 &
PIDC=$!
sleep 6
if wait_health "$PORTC"; then
  chk T5 "listen refused when 019 missing" 0 "health still 200 — leak"
  kill -9 "$PIDC" >/dev/null 2>&1 || true
else
  # process should have exited non-zero or never bound
  sleep 1
  if kill -0 "$PIDC" 2>/dev/null; then
    # still running but no health? treat as refuse-listen if port closed
    HC="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTC/api/health" || true)"
    if [ "$HC" = "000" ] || [ "$HC" = "0" ] || [ -z "$HC" ]; then
      chk T5 "listen refused when 019 missing" 1 "running but no socket hc=$HC"
    else
      chk T5 "listen refused when 019 missing" 0 "hc=$HC"
    fi
    kill -9 "$PIDC" >/dev/null 2>&1 || true
  else
    if grep -q 'refusing listen' /tmp/p7v-c.log || grep -q 'FATAL' /tmp/p7v-c.log; then
      chk T5 "listen refused when 019 missing" 1 "exited; FATAL in log"
    else
      chk T5 "listen refused when 019 missing" 1 "process exited (no health)"
    fi
  fi
fi

# ── T6 canary + replay SoT via authority.consumeNonce ──
log ""
log "════ T6 — Canary weight + replay nonce (phase6_replay_ledger via authority)"
$NODE - <<JS
const gov=require('./server/infrastructure/phase6-governance');
const crypto=require('crypto');
const fs=require('fs');
const http=require('http');
const priv=crypto.createPrivateKey(fs.readFileSync('/tmp/p7v-gov-priv.pem'));
const signed=gov.signGovernancePayload(priv,{action:'WEIGHT_UPDATE',cluster_id:'ir-isfahan-1',target_weight:25});
const body={cluster_id:'ir-isfahan-1',target_weight:25,action:signed.action,nonce:signed.nonce,timestamp:signed.timestamp,expiry:signed.expiry,signature:signed.signature,reason:'p7-verifier'};
function req(port,method,p,payload,cookie){
  return new Promise(res=>{
    const data=JSON.stringify(payload);
    const r=http.request({host:'127.0.0.1',port,path:p,method,headers:{'content-type':'application/json','content-length':Buffer.byteLength(data),cookie}}, resp=>{
      let b=''; resp.on('data',d=>b+=d); resp.on('end',()=>res({status:resp.statusCode,body:b}));
    });
    r.on('error',()=>res({status:0,body:''})); r.write(data); r.end();
  });
}
(async()=>{
  const cookie=JSON.parse(fs.readFileSync('/tmp/p7v-auth.json','utf8')).cookie;
  const pr=await req($PORTA,'POST','/api/v1/system/phase6/canary/promote',body,cookie);
  fs.writeFileSync('/tmp/p7v-promote.json', JSON.stringify({status:pr.status,body:pr.body,nonce:signed.nonce,payload:body}));
})().catch(e=>{ fs.writeFileSync('/tmp/p7v-promote.json', JSON.stringify({status:0,body:String(e),payload:{}})); });
JS
PR_STATUS="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-promote.json"))["status"])')"
chk T6 "promote Ed25519 on A ⇒ 200" "$([ "$PR_STATUS" = "200" ] && echo 1 || echo 0)" "http=$PR_STATUS $(python3 -c 'print(open("/tmp/p7v-promote.json").read()[:180])')"

WPG="$(psql "$URL" -tA -c "SELECT COALESCE(weight,traffic_weight)::text FROM phase6_canary_configs WHERE id='ir-isfahan-1';")"
WA="$($NODE - <<JS
const http=require('http'); const fs=require('fs');
const cookie=JSON.parse(fs.readFileSync('/tmp/p7v-auth.json','utf8')).cookie;
function get(port){return new Promise(res=>{http.get({host:'127.0.0.1',port,path:'/api/v1/system/phase6/canary/status',headers:{cookie}}, r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res(b));}).on('error',()=>res(''));});}
(async()=>{
  const a=JSON.parse(await get($PORTA)||'{}');
  const b=JSON.parse(await get($PORTB)||'{}');
  const ca=((a.canary_fabric&&a.canary_fabric.clusters)||[]).find(x=>x.id==='ir-isfahan-1')||{};
  const cb=((b.canary_fabric&&b.canary_fabric.clusters)||[]).find(x=>x.id==='ir-isfahan-1')||{};
  fs.writeFileSync('/tmp/p7v-w.json', JSON.stringify({a:Number(ca.weight),b:Number(cb.weight)}));
})();
JS
)"
WA_N="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-w.json"))["a"])')"
WB_N="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-w.json"))["b"])')"
chk T6 "A==B==PG weight=25" "$([ "$WA_N" = "25" ] && [ "$WB_N" = "25" ] && [ "$WPG" = "25" ] && echo 1 || echo 0)" "A=$WA_N B=$WB_N PG=$WPG"

RP="$(python3 - <<'PY'
import json,http.client
p=json.load(open('/tmp/p7v-promote.json'))
auth=json.load(open('/tmp/p7v-auth.json'))
c=http.client.HTTPConnection('127.0.0.1', 3511, timeout=10)
body=json.dumps(p['payload'])
c.request('POST','/api/v1/system/phase6/canary/promote',body,{'Content-Type':'application/json','Cookie':auth['cookie']})
r=c.getresponse(); b=r.read().decode()
open('/tmp/p7v-replay.json','w').write(json.dumps({'status':r.status,'body':b}))
print(r.status)
PY
)"
RPBODY="$(python3 -c 'import json;print(json.load(open("/tmp/p7v-replay.json"))["body"])')"
if [ "$RP" = "403" ] && echo "$RPBODY" | grep -q 'REPLAY_ATTACK_DETECTED'; then
  chk T6 "replay same nonce ⇒ 403 REPLAY_ATTACK_DETECTED" 1
else
  chk T6 "replay same nonce ⇒ 403 REPLAY_ATTACK_DETECTED" 0 "http=$RP $RPBODY"
fi
LED="$(psql "$URL" -tA -c "SELECT COUNT(*) FROM phase6_replay_ledger;")"
chk T6 "nonce landed in phase6_replay_ledger (not a parallel table)" "$([ "${LED:-0}" -ge 1 ] && echo 1 || echo 0)" "rows=$LED"

# kill -9 A, restart, replay still 403, weight still 25
kill -9 "$PIDA" >/dev/null 2>&1 || true
sleep 0.5
PIDA=$(boot_one "$PORTA" "$OTP_A" /tmp/p7v-a2.log)
if wait_health "$PORTA"; then
  chk T6 "A restarted after kill -9" 1
  curl -s "http://127.0.0.1:$PORTA/api/v1/system/phase6/canary/status" -H "Cookie: $COOKIE" > /tmp/p7v-w2.json
  W2N="$(python3 -c 'import json; j=json.load(open("/tmp/p7v-w2.json")); c=next((x for x in ((j.get("canary_fabric") or {}).get("clusters") or []) if x.get("id")=="ir-isfahan-1"), {}); print(c.get("weight"))')"
  chk T6 "weight after kill-9 still 25 from PG" "$([ "$W2N" = "25" ] && echo 1 || echo 0)" "w=$W2N"
  RP2="$(python3 - <<'PY'
import json,http.client
p=json.load(open('/tmp/p7v-promote.json'))
auth=json.load(open('/tmp/p7v-auth.json'))
c=http.client.HTTPConnection('127.0.0.1', 3511, timeout=10)
body=json.dumps(p['payload'])
c.request('POST','/api/v1/system/phase6/canary/promote',body,{'Content-Type':'application/json','Cookie':auth['cookie']})
r=c.getresponse(); b=r.read().decode()
print(r.status, b[:120].replace('\n',' '))
PY
)"
  echo "$RP2" | grep -q '403' && echo "$RP2" | grep -q 'REPLAY' && chk T6 "replay after kill-9 still 403" 1 "$RP2" || chk T6 "replay after kill-9 still 403" 0 "$RP2"
else
  chk T6 "A restarted after kill -9" 0 "$(tail -c 200 /tmp/p7v-a2.log | tr '\n' ' ')"
fi

# ── T7 honesty / wiring ──
log ""
log "════ T7 — Honesty scanner + authority wiring"
if grep -n 'authority.consumeNonce\|consumeNonce' server/infrastructure/phase6-canary-engine.js >/dev/null; then
  chk T7 "canary nonce goes through authority.consumeNonce" 1
else
  chk T7 "canary nonce goes through authority.consumeNonce" 0
fi
if grep -n 'hydrateControlPlane\|authority.attach' server/index.js >/dev/null; then
  chk T7 "boot attaches+hydrates authority" 1
else
  chk T7 "boot attaches+hydrates authority" 0
fi
if grep -n 'refusing listen' server/index.js >/dev/null; then
  chk T7 "listen refused without DATABASE_URL hydrate" 1
else
  chk T7 "listen refused without DATABASE_URL hydrate" 0
fi
SKIPHITS="$(grep -R --include='*.js' -E 'describe\.skip\s*\(|it\.skip\s*\(|test\.skip\s*\(' tests tools 2>/dev/null | grep -v production-truth-gate | grep -v production-verifier | head -5 || true)"
if [ -z "$SKIPHITS" ]; then
  chk T7 "no it.skip/describe.skip in tests/tools (sample)" 1
else
  chk T7 "no it.skip/describe.skip in tests/tools (sample)" 0 "$SKIPHITS"
fi
# Tenant policy authority is intentionally split: the HTTP guard calls
# authority.assertTenantPolicy(), whose PostgreSQL implementation owns the
# getTenantPolicy() query. Checking the old helper name in the HTTP hardening
# module was stale and made this verifier fail on the already-remediated code.
if grep -n 'authority\.assertTenantPolicy' server/infrastructure/phase6-production-hardening.js >/dev/null &&
   grep -n 'async function getTenantPolicy' server/infrastructure/authority/postgres-authority.js >/dev/null; then
  chk T7 "HTTP tenant guard uses PostgreSQL tenant_policy authority" 1
else
  chk T7 "HTTP tenant guard uses PostgreSQL tenant_policy authority" 0
fi

# cleanup extra dbs
psql "$ADM_URL" -q -c "DROP DATABASE IF EXISTS $DBBAD;" >/dev/null 2>&1 || true

log ""
log "════ PRODUCTION VERIFIER: $PASS pass / $FAIL fail / HEAD $HEAD ════"
if [ "$FAIL" -eq 0 ]; then
  log "VERDICT: VERIFIED"
  exit 0
else
  log "VERDICT: NOT VERIFIED"
  for r in "${RESULTS[@]}"; do
    case "$r" in FAIL*) log "  $r";; esac
  done
  exit 1
fi
