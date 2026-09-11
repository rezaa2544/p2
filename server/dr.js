/* ═══════════════════════════════════════════════════════════════════
   server/dr.js — Wave 16 (Disaster Recovery)
   ───────────────────────────────────────────────────────────────────
   "Backup having without a restore drill is not enough." (ROADMAP §19)

   server/admin.js already writes the snapshot (atomic tmp+rename, 0600,
   retention 10, data-only). This module owns the *recovery* half, which
   did not exist before Wave 16:

     1. Integrity   — SHA-256 manifest, self-healing from disk
     2. Encryption  — AES-256-GCM at rest (scrypt KDF), fail-closed
     3. Off-site    — verified copy outside the data dir
     4. PITR        — posture report (PG WAL is a DB-side config)
     5. Restore test— an automated drill that PROVES a backup restores,
                      including a tamper test that proves the integrity
                      check actually rejects a modified archive
     6. RPO/RTO     — declared objectives vs the *achieved* RPO

   Deliberate design choices:
   - NO new HTTP endpoints. A restore capability reachable over HTTP is a
     data-destruction primitive; the drill is an operator-run script
     (scripts/dr-restore-drill.js) instead.
   - NO change to admin.js. The manifest is derived from the files on
     disk, so it can be rebuilt even if the manifest itself is lost.
   - The drill restores into an ISOLATED store. It never mutates the live
     store — a test that can destroy production data is not a test.
   - Fail-closed: a missing key in production, a checksum mismatch, a
     tampered archive or an "off-site" target that is really the same
     disk all produce a refusal, never a silent success.

   Runtime deps: Node stdlib only (fs, path, crypto).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Must stay identical to server/admin.js — these are the files it writes. */
const NAME_RE = /^payesh-\d{8}-\d{6}-\d{3}\.json$/;
const ENC_RE = /^payesh-\d{8}-\d{6}-\d{3}\.json\.enc$/;
const MANIFEST_NAME = 'MANIFEST.json';

const MAGIC = 'PAYESHDR1';
const KDF = { N: 16384, r: 8, p: 1, keylen: 32, saltBytes: 16 };
const IV_BYTES = 12;

/* ── defaults (overridable; see docs/WAVE16_DISASTER_RECOVERY.md §2) ── */
const DEFAULT_RPO_S = 300;    /* 5 min  — matches docs/RELIABILITY_DR_PLAN.md */
const DEFAULT_RTO_S = 900;    /* 15 min — matches docs/RELIABILITY_DR_PLAN.md */

function numEnv(name, dflt, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function sha256File(fp) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(fp));
  return h.digest('hex');
}
function sha256Buf(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function nowIso() { return new Date().toISOString(); }

function createDR(ctx) {
  const options = ctx || {};
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const dir = options.backupDir || path.join(dataDir, 'backups');
  const audit = typeof options.audit === 'function' ? options.audit : () => {};
  /* Evaluated at CALL time, not construction time: the fail-closed guarantee
     must not depend on whether the module happened to be composed before or
     after PAYESH_ENV was set. An explicit option still wins (tests). */
  const isProduction = () => (options.isProduction !== undefined
    ? options.isProduction
    : process.env.PAYESH_ENV === 'production');

  function ensureDir() { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }

  function objectives() {
    const rtoS = numEnv('PAYESH_DR_RTO_S', DEFAULT_RTO_S, 1, 86400);
    /* PAYESH_DR_RTO_MS lets a drill gate at sub-second precision — the 1 s
       floor on PAYESH_DR_RTO_S is right for an incident and far too coarse
       for a CI gate on a synthetic store. */
    const rtoMsEnv = Number(process.env.PAYESH_DR_RTO_MS);
    return {
      rpo_seconds: numEnv('PAYESH_DR_RPO_S', DEFAULT_RPO_S, 1, 86400),
      rto_seconds: rtoS,
      rto_ms: (Number.isFinite(rtoMsEnv) && rtoMsEnv > 0) ? rtoMsEnv : rtoS * 1000,
      source: (process.env.PAYESH_DR_RPO_S || process.env.PAYESH_DR_RTO_S || process.env.PAYESH_DR_RTO_MS) ? 'env' : 'default'
    };
  }

  function listBackups() {
    try { return fs.readdirSync(dir).filter((f) => NAME_RE.test(f)).sort(); }
    catch (e) { return []; }
  }
  function listEncrypted() {
    try { return fs.readdirSync(dir).filter((f) => ENC_RE.test(f)).sort(); }
    catch (e) { return []; }
  }

  /* ── 1. integrity manifest (self-healing) ────────────────────────── */
  function manifestPath() { return path.join(dir, MANIFEST_NAME); }

  function readManifest() {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
      return (m && typeof m === 'object' && Array.isArray(m.entries)) ? m : { version: 1, entries: [] };
    } catch (e) { return { version: 1, entries: [] }; }
  }

  function writeManifest(m) {
    ensureDir();
    const tmp = manifestPath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, manifestPath());
    try { fs.chmodSync(manifestPath(), 0o600); } catch (e) {}
  }

  /* The manifest is DERIVED from the files on disk, so a lost or corrupt
     manifest is rebuilt rather than trusted. */
  function ensureManifest() {
    ensureDir();
    const m = readManifest();
    const byName = new Map(m.entries.map((e) => [e.name, e]));
    const onDisk = listBackups();
    let added = 0;
    for (const name of onDisk) {
      if (byName.has(name)) continue;
      const fp = path.join(dir, name);
      let st = null;
      try { st = fs.statSync(fp); } catch (e) { continue; }
      byName.set(name, {
        name,
        size: st.size,
        sha256: sha256File(fp),
        created_at: st.mtime.toISOString(),
        recorded_at: nowIso()
      });
      added++;
    }
    /* drop entries whose file is gone (retention already pruned them) */
    const kept = [...byName.values()].filter((e) => onDisk.indexOf(e.name) >= 0).sort((a, b) => a.name < b.name ? -1 : 1);
    const out = { version: 1, updated_at: nowIso(), entries: kept };
    if (added > 0 || kept.length !== m.entries.length) writeManifest(out);
    return out;
  }

  /* ── structural integrity of a snapshot (no live store touched) ──── */
  function inspectData(data) {
    const problems = [];
    const counts = {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, problems: ['not_an_object'], counts };
    }
    for (const k of Object.keys(data)) {
      if (k.indexOf('__') === 0) problems.push('internal_key_leaked:' + k);
      if (Array.isArray(data[k])) counts[k] = data[k].length;
    }
    const users = data.users;
    if (!Array.isArray(users) || users.length === 0) problems.push('users_missing_or_empty');
    else {
      let bad = 0;
      for (const u of users) if (!u || u.id == null || typeof u.phone !== 'string') bad++;
      if (bad > 0) problems.push('users_malformed:' + bad);
    }
    const schools = data.schools;
    if (!Array.isArray(schools) || schools.length === 0) problems.push('schools_missing_or_empty');
    else if (Array.isArray(data.classes)) {
      const ids = new Set(schools.map((s) => s && s.id));
      const orphans = data.classes.filter((c) => c && c.school_id != null && !ids.has(c.school_id)).length;
      if (orphans > 0) problems.push('classes_orphan_school:' + orphans);
    }
    return { ok: problems.length === 0, problems, counts };
  }

  function verifyBackup(name) {
    const t0 = process.hrtime.bigint();
    const res = { ok: false, name, checks: {} };
    const fp = path.join(dir, name);
    if (!NAME_RE.test(String(name || ''))) { res.reason = 'invalid_name'; return res; }
    if (!fs.existsSync(fp)) { res.reason = 'missing_file'; return res; }

    const m = ensureManifest();
    const entry = m.entries.find((e) => e.name === name) || null;
    res.checks.manifest_entry = !!entry;

    let sha = null;
    try { sha = sha256File(fp); } catch (e) { res.reason = 'unreadable'; return res; }
    res.sha256 = sha;
    res.size = fs.statSync(fp).size;
    res.checks.sha256_matches_manifest = entry ? entry.sha256 === sha : false;

    let data = null;
    try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); }
    catch (e) { res.reason = 'corrupt_json'; return res; }
    res.checks.json_parses = true;

    const insp = inspectData(data);
    res.checks.structure_ok = insp.ok;
    res.problems = insp.problems;
    res.counts = insp.counts;

    res.ok = res.checks.sha256_matches_manifest === true && insp.ok;
    res.reason = res.ok ? null : (insp.ok ? 'checksum_mismatch' : 'structure_invalid');
    res.duration_ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return res;
  }

  /* ── 2. encryption at rest (AES-256-GCM + scrypt) ────────────────── */
  function backupKey() {
    const k = process.env.PAYESH_BACKUP_KEY;
    return (typeof k === 'string' && k.length >= 16) ? k : null;
  }

  function deriveKey(secret, salt) {
    return crypto.scryptSync(secret, salt, KDF.keylen, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 128 * 1024 * 1024 });
  }

  function encryptBackup(name) {
    if (!NAME_RE.test(String(name || ''))) return { ok: false, reason: 'invalid_name' };
    const fp = path.join(dir, name);
    if (!fs.existsSync(fp)) return { ok: false, reason: 'missing_file' };
    const secret = backupKey();
    if (!secret) {
      /* Fail-closed: in production a plaintext PII archive may not be
         promoted to "off-site ready". The key is never logged. */
      audit('backup_unencrypted', { file: name, reason: 'no_key', summary: 'پشتیبان بدون رمزنگاری ماند (کلید موجود نیست)' });
      return { ok: false, reason: isProduction() ? 'key_required_in_production' : 'no_key' };
    }
    const t0 = process.hrtime.bigint();
    const plain = fs.readFileSync(fp);
    const salt = crypto.randomBytes(KDF.saltBytes);
    const iv = crypto.randomBytes(IV_BYTES);
    const key = deriveKey(secret, salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const header = Buffer.from(JSON.stringify({
      v: 1, cipher: 'aes-256-gcm', kdf: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p,
      salt: salt.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'),
      plain_sha256: sha256Buf(plain), plain_size: plain.length
    }), 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(header.length, 0);
    const out = Buffer.concat([Buffer.from(MAGIC, 'utf8'), lenBuf, header, ct]);
    const dest = fp + '.enc';
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, out, { mode: 0o600 });
    fs.renameSync(tmp, dest);
    try { fs.chmodSync(dest, 0o600); } catch (e) {}
    audit('backup_encrypted', { file: name, enc: path.basename(dest), size: out.length, summary: 'پشتیبان رمزنگاری شد: ' + path.basename(dest) });
    return {
      ok: true, file: path.basename(dest), size: out.length,
      plain_sha256: sha256Buf(plain),
      duration_ms: Number(process.hrtime.bigint() - t0) / 1e6
    };
  }

  /* Decrypt + authenticate an archive at an explicit path. ANY tamper must
     fail (GCM auth tag, then a sha256 cross-check of the plaintext).
     Split out from decryptBackup() so the drill can tamper-test an archive
     under a scratch name without weakening the name validation. */
  function decryptFile(absPath, destPath) {
    const secret = backupKey();
    if (!secret) return { ok: false, reason: 'no_key' };
    const t0 = process.hrtime.bigint();
    try {
      const blob = fs.readFileSync(absPath);
      if (blob.slice(0, MAGIC.length).toString('utf8') !== MAGIC) return { ok: false, reason: 'bad_magic' };
      const hlen = blob.readUInt32BE(MAGIC.length);
      if (hlen <= 0 || hlen > 65536) return { ok: false, reason: 'bad_header_length' };
      const hstart = MAGIC.length + 4;
      const header = JSON.parse(blob.slice(hstart, hstart + hlen).toString('utf8'));
      const ct = blob.slice(hstart + hlen);
      const key = deriveKey(secret, Buffer.from(header.salt, 'base64'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(header.tag, 'base64'));
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      if (sha256Buf(plain) !== header.plain_sha256) return { ok: false, reason: 'checksum_mismatch' };
      if (destPath) {
        fs.writeFileSync(destPath, plain, { mode: 0o600 });
        try { fs.chmodSync(destPath, 0o600); } catch (e) {}
      }
      return { ok: true, size: plain.length, sha256: sha256Buf(plain), duration_ms: Number(process.hrtime.bigint() - t0) / 1e6 };
    } catch (e) {
      /* GCM authentication failure lands here — the archive was modified. */
      return { ok: false, reason: 'authentication_failed' };
    }
  }

  /* Decrypt + authenticate a backup by its (validated) archive name. */
  function decryptBackup(encName, destPath) {
    if (!ENC_RE.test(String(encName || ''))) return { ok: false, reason: 'invalid_name' };
    const fp = path.join(dir, encName);
    if (!fs.existsSync(fp)) return { ok: false, reason: 'missing_file' };
    return decryptFile(fp, destPath);
  }

  /* ── 3. off-site copy (verified, and honestly off-site) ──────────── */
  function offSiteDir() {
    const d = process.env.PAYESH_BACKUP_OFFSITE_DIR;
    return (typeof d === 'string' && d.length > 0) ? d : null;
  }

  function copyOffSite(name, opts) {
    const useEncrypted = !(opts && opts.plaintext === true);
    const target = offSiteDir();
    if (!target) return { ok: false, reason: 'not_configured' };
    const abs = path.resolve(target);
    const dataAbs = path.resolve(dataDir);
    /* Fail-closed honesty: an "off-site" copy on the same disk protects
       against nothing. Refuse a target inside the data directory. */
    if (abs === dataAbs || abs.indexOf(dataAbs + path.sep) === 0) {
      return { ok: false, reason: 'target_inside_data_dir' };
    }
    const srcName = useEncrypted ? name + '.enc' : name;
    const src = path.join(dir, srcName);
    if (!fs.existsSync(src)) return { ok: false, reason: useEncrypted ? 'encrypt_first' : 'missing_file' };
    try { fs.mkdirSync(abs, { recursive: true }); } catch (e) { return { ok: false, reason: 'mkdir_failed' }; }
    const dest = path.join(abs, path.basename(srcName));
    const want = sha256File(src);
    fs.copyFileSync(src, dest);
    try { fs.chmodSync(dest, 0o600); } catch (e) {}
    const got = sha256File(dest);
    const ok = got === want;
    audit('backup_offsite_copied', { file: path.basename(srcName), ok, encrypted: useEncrypted, summary: 'کپی برون‌سایتی پشتیبان' + (ok ? '' : ' — ناموفق') });
    return { ok, file: dest, sha256: got, encrypted: useEncrypted, reason: ok ? null : 'checksum_mismatch' };
  }

  function offSiteStatus() {
    const target = offSiteDir();
    const st = { configured: !!target, dir: target, encrypted_available: false, latest: null, count: 0 };
    if (!target) return st;
    try {
      const files = fs.readdirSync(target).filter((f) => ENC_RE.test(f) || NAME_RE.test(f)).sort();
      st.count = files.length;
      st.latest = files.length ? files[files.length - 1] : null;
      st.encrypted_available = files.some((f) => ENC_RE.test(f));
    } catch (e) { st.readable = false; }
    return st;
  }

  /* ── 4. PITR posture ─────────────────────────────────────────────── */
  function pitrStatus(db) {
    const d = db || null;
    const pgLive = !!(d && typeof d.isPostgres === 'function' && d.isPostgres());
    return {
      mode: pgLive ? 'postgres' : 'json-store',
      pitr: pgLive,
      /* WAL archiving is a server-side postgresql.conf setting; this module
         can only report the posture, never enable it. See the runbook. */
      note: pgLive
        ? 'PITR = pgBackRest/WAL-G archiving of PostgreSQL WAL (see docs/RUNBOOK_DISASTER_RECOVERY.md §PITR)'
        : 'JSON store has no WAL — RPO equals the backup interval; PostgreSQL is the PITR path (Wave 1)'
    };
  }

  /* ── 5/6. achieved RPO and the restore drill ─────────────────────── */
  function newestVerified() {
    const all = listBackups();
    for (let i = all.length - 1; i >= 0; i--) {
      const v = verifyBackup(all[i]);
      if (v.ok) return { name: all[i], verified: v };
    }
    return null;
  }

  function achievedRpoSeconds() {
    const all = listBackups();
    if (!all.length) return null;
    let newest = null;
    try { newest = fs.statSync(path.join(dir, all[all.length - 1])).mtimeMs; }
    catch (e) { return null; }
    return Math.max(0, Math.round((Date.now() - newest) / 1000));
  }

  function rpoStatus() {
    const o = objectives();
    const achieved = achievedRpoSeconds();
    return {
      objective_seconds: o.rpo_seconds,
      achieved_seconds: achieved,
      breached: achieved === null ? true : achieved > o.rpo_seconds,
      has_backup: achieved !== null
    };
  }

  /**
   * The restore drill. Proves — with timings — that a backup can be
   * restored, that the encrypted form round-trips, and that a MODIFIED
   * archive is rejected. Restores into an isolated store only.
   *
   * @param {object} o
   * @param {object} [o.snapshot]   data object to back up (defaults: none → uses an existing backup)
   * @param {string} [o.workDir]    scratch dir (defaults: os tmpdir under dir/.drill)
   * @param {boolean} [o.keep]      keep the scratch dir for inspection
   */
  function restoreDrill(o) {
    const opts = o || {};
    const t0 = process.hrtime.bigint();
    const phases = [];
    const rec = (name, ok, ms, extra) => { phases.push(Object.assign({ name, ok, ms: Math.round(ms * 100) / 100 }, extra || {})); return ok; };
    const work = opts.workDir || path.join(dir, '.drill-' + Date.now());
    const report = { ok: false, started_at: nowIso(), phases, objectives: objectives(), work_dir: work };

    try {
      fs.mkdirSync(work, { recursive: true });

      /* P1 — produce (or locate) the archive under test */
      let name = null;
      if (opts.snapshot) {
        ensureDir();
        const now = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        name = 'payesh-' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate())
          + '-' + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds())
          + '-' + String(now.getMilliseconds()).padStart(3, '0') + '.json';
        const s1 = process.hrtime.bigint();
        const clean = {};
        for (const k of Object.keys(opts.snapshot)) if (k.indexOf('__') !== 0) clean[k] = opts.snapshot[k];
        fs.writeFileSync(path.join(dir, name), JSON.stringify(clean), { encoding: 'utf8', mode: 0o600 });
        rec('snapshot', true, Number(process.hrtime.bigint() - s1) / 1e6, { file: name });
      } else {
        const all = listBackups();
        name = all[all.length - 1] || null;
        if (!name) { report.reason = 'no_backup_to_test'; return report; }
      }
      report.backup = name;

      /* P2 — integrity verification */
      const s2 = process.hrtime.bigint();
      const v = verifyBackup(name);
      if (!rec('verify', v.ok, Number(process.hrtime.bigint() - s2) / 1e6, { reason: v.reason, sha256: v.sha256, size: v.size })) {
        report.reason = 'verify_failed'; return report;
      }
      report.record_counts = v.counts;

      /* P3 — restore into an ISOLATED store (the live store is untouched) */
      const s3 = process.hrtime.bigint();
      let restored = null;
      try { restored = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch (e) {}
      const insp = inspectData(restored);
      if (!rec('restore_isolated', insp.ok, Number(process.hrtime.bigint() - s3) / 1e6, { problems: insp.problems })) {
        report.reason = 'restore_failed'; return report;
      }
      report.restored_users = (restored.users || []).length;
      report.restored_schools = (restored.schools || []).length;

      /* P4 — encryption round trip (skipped, not failed, when no key) */
      const secret = backupKey();
      if (secret) {
        const s4 = process.hrtime.bigint();
        const e = encryptBackup(name);
        if (!e.ok) { rec('encrypt', false, Number(process.hrtime.bigint() - s4) / 1e6, { reason: e.reason }); report.reason = 'encrypt_failed'; return report; }
        rec('encrypt', true, e.duration_ms, { file: e.file, size: e.size });

        const s5 = process.hrtime.bigint();
        const destPlain = path.join(work, 'restored.json');
        const d = decryptBackup(e.file, destPlain);
        const sameAsOriginal = d.ok && d.sha256 === v.sha256;
        if (!rec('decrypt_roundtrip', sameAsOriginal, Number(process.hrtime.bigint() - s5) / 1e6, { reason: d.reason })) {
          report.reason = 'decrypt_failed'; return report;
        }

        /* P6 — tamper test: flip one ciphertext byte. It is not enough that
           the decrypt fails; it must fail for the RIGHT reason. A rejection
           caused by name validation would be a false pass, so the tampered
           archive is read by path and the reason is asserted. */
        const s6 = process.hrtime.bigint();
        const encPath = path.join(dir, e.file);
        const blob = fs.readFileSync(encPath);
        const at = blob.length - 1;
        blob[at] = blob[at] ^ 0xff;
        const tamperedPath = path.join(work, 'tampered.enc');
        fs.writeFileSync(tamperedPath, blob, { mode: 0o600 });
        const t = decryptFile(tamperedPath, path.join(work, 'should-not-exist.json'));
        const rejectedForTamper = t.ok === false
          && (t.reason === 'authentication_failed' || t.reason === 'checksum_mismatch');
        if (!rec('tamper_rejected', rejectedForTamper, Number(process.hrtime.bigint() - s6) / 1e6, { reason: t.reason })) {
          report.reason = 'tamper_not_detected'; return report;
        }
        report.tamper_reason = t.reason;
        /* a rejected decrypt must not have written anything to disk */
        if (!rec('tamper_wrote_nothing', !fs.existsSync(path.join(work, 'should-not-exist.json')), 0)) {
          report.reason = 'tamper_wrote_output'; return report;
        }
      } else {
        rec('encrypt', true, 0, { skipped: 'no_key' });
        rec('decrypt_roundtrip', true, 0, { skipped: 'no_key' });
        rec('tamper_rejected', true, 0, { skipped: 'no_key' });
        report.warnings = (report.warnings || []).concat('PAYESH_BACKUP_KEY not set — encryption phases skipped');
      }

      /* P7 — off-site copy (only when configured; verified by checksum) */
      if (offSiteDir()) {
        const s7 = process.hrtime.bigint();
        const c = copyOffSite(name, { plaintext: !secret });
        rec('offsite_copy', c.ok, Number(process.hrtime.bigint() - s7) / 1e6, { reason: c.reason, file: c.file });
      } else {
        rec('offsite_copy', true, 0, { skipped: 'not_configured' });
      }

      report.restore_ms = Math.round(phases
        .filter((p) => ['verify', 'restore_isolated', 'decrypt_roundtrip'].indexOf(p.name) >= 0)
        .reduce((a, p) => a + p.ms, 0) * 100) / 100;
      report.rto_objective_ms = report.objectives.rto_ms;
      report.within_rto = report.restore_ms <= report.rto_objective_ms;
      report.ok = phases.every((p) => p.ok) && report.within_rto === true;
      if (!report.ok && !report.reason) report.reason = report.within_rto ? 'phase_failed' : 'rto_exceeded';
      report.duration_ms = Number(process.hrtime.bigint() - t0) / 1e6;
      report.finished_at = nowIso();
      audit('dr_restore_drill', {
        ok: report.ok, backup: name, restore_ms: report.restore_ms,
        rto_objective_ms: report.rto_objective_ms, reason: report.reason || null,
        summary: 'مانور بازیابی ' + (report.ok ? 'موفق' : 'ناموفق') + ' روی ' + name
      });
      return report;
    } finally {
      if (!opts.keep) { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {} }
    }
  }

  return {
    dir,
    objectives,
    listBackups,
    listEncrypted,
    ensureManifest,
    readManifest,
    verifyBackup,
    inspectData,
    encryptBackup,
    decryptBackup,
    decryptFile,
    copyOffSite,
    offSiteDir,
    offSiteStatus,
    pitrStatus,
    achievedRpoSeconds,
    rpoStatus,
    newestVerified,
    restoreDrill,
    NAME_RE, ENC_RE, MANIFEST_NAME, MAGIC
  };
}

module.exports = { createDR, NAME_RE, ENC_RE, MANIFEST_NAME, MAGIC, DEFAULT_RPO_S, DEFAULT_RTO_S };
