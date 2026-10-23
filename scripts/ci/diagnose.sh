#!/usr/bin/env bash
# Diagnosa otomatis bot di cloud. Perlu env: TGCLOUD_TOKEN, BOSS_IDS.
# Menulis diagnose-report.md (juga ke $GITHUB_STEP_SUMMARY). Exit 1 bila ada cek gagal.
# Tidak mengubah data toko: hanya membaca (me, getChanges) lewat `tgcloud run`.
set -uo pipefail
export NO_COLOR=1 FORCE_COLOR=0
REPORT=${REPORT:-diagnose-report.md}
FAILS=0
: > "$REPORT"

log() { printf '%s\n' "$*" >> "$REPORT"; }
check() { # check <judul> <pola-harus-ada|-> <pola-tidak-boleh-ada|-> -- perintah...
  local title=$1 must=$2 mustnot=$3; shift 4
  local out rc
  out=$("$@" 2>&1); rc=$?
  local ok=1
  [ $rc -ne 0 ] && ok=0
  [ "$must" != "-" ] && ! grep -qE "$must" <<<"$out" && ok=0
  [ "$mustnot" != "-" ] && grep -qE "$mustnot" <<<"$out" && ok=0
  if [ $ok -eq 1 ]; then log "### ✅ $title"; else log "### ❌ $title (exit $rc)"; FAILS=$((FAILS+1)); fi
  log '```'; log "$out" | tail -n 60; log '```'; log ''
}

log "# Diagnosa tgcloud — $(date -u +'%Y-%m-%d %H:%M UTC')"
log ''

if [ -z "${TGCLOUD_TOKEN:-}" ]; then
  log '### ❌ Secret TGCLOUD_TOKEN belum diisi'; FAILS=$((FAILS+1))
fi
FIRST_BOSS=$(printf '%s' "${BOSS_IDS:-}" | tr -s ', ' '\n\n' | grep -E '^[0-9]+$' | head -n1 || true)
if [ -z "$FIRST_BOSS" ]; then
  log '### ❌ Secret BOSS_IDS kosong atau tidak valid'; FAILS=$((FAILS+1))
fi

if [ "$FAILS" -eq 0 ]; then
  CTX="{ initData: { user: { id: $FIRST_BOSS, first_name: \"CI\", is_ci: true } } }"
  check "Status proyek vs cloud" - - -- npx tgcloud status
  check "Webhook sinkron dengan handler" - 'OUT OF SYNC' -- npx tgcloud webhook
  check "Skema DB sinkron" 'No schema changes' - -- npx tgcloud migrate --local --dry-run
  check "Smoke: endpoint me (peran Bos)" 'boss' - -- npx tgcloud run endpoints/me '{}' --ctx "$CTX"
  check "Smoke: endpoint getChanges" 'serverTime' - -- npx tgcloud run endpoints/getChanges '{ since: 0 }' --ctx "$CTX"
fi

if [ "$FAILS" -eq 0 ]; then log "**Semua cek lulus.**"; else log "**$FAILS cek gagal.**"; fi
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$REPORT" >> "$GITHUB_STEP_SUMMARY"
cat "$REPORT"
[ "$FAILS" -eq 0 ]
