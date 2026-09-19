'use strict';
/* Stop/start the PostgreSQL that DATABASE_URL actually talks to.
   GitHub Actions: postgres is a service container (docker), NOT
   pg_ctlcluster 17 — hosted images ship PG 16 disabled.
   Local: fall back to pg_ctlcluster 17/16.
   Never fake-green: if neither path works, ok=false. */
const { execSync } = require('child_process');

function urlPort(url) {
  try {
    const u = new URL(String(url).replace(/^postgres(ql)?:/i, 'http:'));
    return Number(u.port || 5432);
  } catch (e) {
    return 5432;
  }
}

function stop(url) {
  const port = urlPort(url);
  try {
    const out = execSync('docker ps --format "{{.ID}} {{.Ports}} {{.Image}}"', { encoding: 'utf8', timeout: 8000 });
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const hit = t.includes(':' + port + '->') || t.includes('0.0.0.0:' + port) || t.includes('[::]:' + port);
      if (hit && /postgres/i.test(t)) {
        const id = t.split(/\s+/)[0];
        execSync('docker stop -t 2 ' + id, { stdio: 'pipe', timeout: 25000 });
        return { ok: true, method: 'docker', id, port };
      }
    }
  } catch (e) { /* no docker or no matching container */ }
  for (const v of ['17', '16', '15']) {
    try {
      execSync('sudo pg_ctlcluster ' + v + ' main stop --mode fast', { stdio: 'pipe', timeout: 25000 });
      return { ok: true, method: 'pg_ctlcluster-' + v, port };
    } catch (e) {}
  }
  return { ok: false, method: 'none', port };
}

function start(handle) {
  if (!handle || !handle.ok) return false;
  try {
    if (handle.method === 'docker' && handle.id) {
      execSync('docker start ' + handle.id, { stdio: 'pipe', timeout: 25000 });
      return true;
    }
    const m = String(handle.method || '').match(/^pg_ctlcluster-(\d+)$/);
    if (m) {
      execSync('sudo pg_ctlcluster ' + m[1] + ' main start', { stdio: 'pipe', timeout: 25000 });
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

module.exports = { stop, start, urlPort };
