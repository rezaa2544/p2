/* ─────────────────────────────────────────────────────────────
   wave16-dr.js — Wave 16: Disaster Recovery
   ─────────────────────────────────────────────────────────────
   Verifies server/dr.js: integrity, encryption at rest, off-site copy,
   PITR posture, RPO/RTO accounting and the restore drill.

   D1  objectives (RPO/RTO) — defaults, env override, clamping
   D2  manifest — self-healing from disk, pruning, not a backup itself
   D3  verifyBackup — good archive passes; bit-flip / corrupt JSON /
       structural damage / traversal are all refused
   D4  encryption at rest — round trip, wrong key, tamper, fail-closed
       without a key in production, 0600, magic header
   D5  off-site copy — verified; a target inside the data dir is refused
   D6  PITR posture — json-store vs postgres
   D7  RPO/RTO accounting — achieved RPO, breach when stale/absent
   D8  restoreDrill — every phase, tamper rejected FOR THE RIGHT REASON,
       nothing written on rejection, live store untouched
   D9  drill without a key — skipped phases are declared, not faked
   D10 path traversal is refused by name validation
   D11 audit events carry no secret material
   D12 RTO gate — an impossible objective fails the drill
   T   docs, runbook, drill script and .env.example are present
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { createDR, NAME_RE, ENC_RE, MAGIC } = require('../server/dr.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── scratch world (hermetic; nothing touches server/data) ────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w16-'));
function fresh(name) {
  const dataDir = path.join(TMP, name);
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  return dataDir;
}
function syntheticStore(users) {
  const schools = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const u = [];
  for (let i = 1; i <= users; i++) {
    u.push({ id: i, phone: '0912000' + String(i).padStart(4, '0'), national_id: String(1000000000 + i), role: i % 3 === 0 ? 'manager' : 'student', school_id: (i % 2) + 1, full_name: 'u' + i });
  }
  return {
    users: u, schools,
    classes: [{ id: 1, school_id: 1 }, { id: 2, school_id: 2 }],
    students: [], grades: [], attendance: [],
    __auth: { codes: {} }, __processed_uids: {}
  };
}
function makeDr(dataDir, audits) {
  const log = audits || [];
  return { dr: createDR({ dataDir, audit: (e, d) => log.push({ e, d }) }), log };
}
function snapshotInto(dr, data) {
  /* use the drill's own snapshot writer so we test the real path */
  const rep = dr.restoreDrill({ snapshot: data });
  return rep.backup;
}
function withEnv(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = process.env[k]; if (patch[k] === null) delete process.env[k]; else process.env[k] = patch[k]; }
  try { return fn(); }
  finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

(async () => {
  console.log('\n▸ Wave 16 — Disaster Recovery (integrity, encryption, off-site, drill)');

  /* ═══ D1 — objectives ═══ */
  {
    const { dr } = makeDr(fresh('d1'));
    const d = withEnv({ PAYESH_DR_RPO_S: null, PAYESH_DR_RTO_S: null }, () => dr.objectives());
    chk('D1a default RPO/RTO are 300s / 900s (RELIABILITY_DR_PLAN)', d.rpo_seconds === 300 && d.rto_seconds === 900, JSON.stringify(d));
    chk('D1b the source of the objectives is reported', d.source === 'default');
    const e = withEnv({ PAYESH_DR_RPO_S: '60', PAYESH_DR_RTO_S: '120' }, () => dr.objectives());
    chk('D1c env overrides the objectives', e.rpo_seconds === 60 && e.rto_seconds === 120 && e.source === 'env', JSON.stringify(e));
    const c = withEnv({ PAYESH_DR_RPO_S: '-5', PAYESH_DR_RTO_S: 'junk' }, () => dr.objectives());
    chk('D1d invalid env values fall back to the defaults', c.rpo_seconds === 300 && c.rto_seconds === 900, JSON.stringify(c));
  }

  /* ═══ D2 — integrity manifest ═══ */
  {
    const dataDir = fresh('d2');
    const { dr } = makeDr(dataDir);
    const name = withEnv({ PAYESH_BACKUP_KEY: null }, () => snapshotInto(dr, syntheticStore(5)));
    const m1 = dr.ensureManifest();
    chk('D2a a manifest entry is derived from the file on disk', m1.entries.length === 1 && m1.entries[0].name === name && /^[a-f0-9]{64}$/.test(m1.entries[0].sha256), JSON.stringify(m1.entries[0]));
    /* lose the manifest — it must be rebuilt, not trusted */
    fs.unlinkSync(path.join(dr.dir, 'MANIFEST.json'));
    const m2 = dr.ensureManifest();
    chk('D2b a lost manifest is rebuilt from disk with the same checksum',
      m2.entries.length === 1 && m2.entries[0].sha256 === m1.entries[0].sha256);
    chk('D2c MANIFEST.json is never mistaken for a backup', dr.listBackups().indexOf('MANIFEST.json') < 0 && !NAME_RE.test('MANIFEST.json'));
    chk('D2d the manifest itself matches no backup/enc pattern', !NAME_RE.test('MANIFEST.json') && !ENC_RE.test('MANIFEST.json'));
    /* prune: remove the file, the entry must go too */
    fs.unlinkSync(path.join(dr.dir, name));
    chk('D2e entries for pruned files are dropped', dr.ensureManifest().entries.length === 0);
  }

  /* ═══ D3 — verification ═══ */
  {
    const dataDir = fresh('d3');
    const { dr } = makeDr(dataDir);
    const name = snapshotInto(dr, syntheticStore(5));
    const good = dr.verifyBackup(name);
    chk('D3a a clean backup verifies', good.ok === true && good.reason === null, JSON.stringify({ ok: good.ok, reason: good.reason, problems: good.problems }));
    chk('D3b verification reports size, sha and record counts', good.size > 0 && /^[a-f0-9]{64}$/.test(good.sha256) && good.counts.users === 5, JSON.stringify(good.counts));
    chk('D3c internal (__*) keys are stripped from the snapshot', Object.keys(good.counts).every((k) => k.indexOf('__') !== 0) && good.problems.indexOf('internal_key_leaked:__auth') < 0);
    chk('D3d verification time is measured', typeof good.duration_ms === 'number' && good.duration_ms >= 0);

    /* one flipped byte must be caught */
    const fp = path.join(dr.dir, name);
    const buf = fs.readFileSync(fp);
    buf[Math.floor(buf.length / 2)] = buf[Math.floor(buf.length / 2)] ^ 0x01;
    fs.writeFileSync(fp, buf);
    const bad = dr.verifyBackup(name);
    chk('D3e a single flipped byte is detected', bad.ok === false && bad.reason === 'checksum_mismatch', JSON.stringify({ ok: bad.ok, reason: bad.reason }));

    /* A re-scan must NOT re-bless a modified file: the manifest holds the
       checksum as recorded when the archive was created, so a tampered file
       can never acquire a matching entry by being scanned again. */
    const before = dr.ensureManifest().entries.find((e) => e.name === name).sha256;
    chk('D3e2 ensureManifest never re-blesses a modified file',
      before === good.sha256 && dr.verifyBackup(name).reason === 'checksum_mismatch',
      'manifest sha changed to ' + before);

    /* structural damage must be caught on its own — with a FRESH archive whose
       manifest genuinely matches, so the checksum half cannot mask the result */
    const st = (() => {
      const d2 = fresh('d3f'); const { dr: dr2 } = makeDr(d2);
      const n2 = snapshotInto(dr2, { schools: [], classes: [], __auth: {} });
      const v = dr2.verifyBackup(n2);
      const entry = dr2.ensureManifest().entries.find((e) => e.name === n2);
      return { v, matches: entry.sha256 === v.sha256 };
    })();
    chk('D3f a structurally invalid snapshot is refused even when the checksum matches',
      st.matches === true && st.v.ok === false && st.v.reason === 'structure_invalid'
      && st.v.problems.indexOf('users_missing_or_empty') >= 0,
      JSON.stringify({ matches: st.matches, ok: st.v.ok, reason: st.v.reason, problems: st.v.problems }));

    /* corrupt JSON (own archive, so the manifest matches the damage) */
    chk('D3g corrupt JSON is refused', (() => {
      const d2 = fresh('d3g'); const { dr: dr2 } = makeDr(d2);
      const n2 = snapshotInto(dr2, syntheticStore(2));
      fs.writeFileSync(path.join(dr2.dir, n2), '{not json', 'utf8');
      return dr2.verifyBackup(n2).reason === 'corrupt_json';
    })());

    chk('D3h a missing file is refused', dr.verifyBackup('payesh-19700101-000000-000.json').reason === 'missing_file');
    chk('D3i orphan classes are reported as a structural problem', (() => {
      const d2 = fresh('d3b'); const { dr: dr2 } = makeDr(d2);
      const n2 = snapshotInto(dr2, { users: [{ id: 1, phone: '0912' }], schools: [{ id: 9 }], classes: [{ id: 1, school_id: 42 }] });
      const v = dr2.verifyBackup(n2);
      return v.ok === false && v.problems.some((p) => p.indexOf('classes_orphan_school') === 0);
    })());
  }

  /* ═══ D4 — encryption at rest ═══ */
  {
    const dataDir = fresh('d4');
    const { dr, log } = makeDr(dataDir);
    const name = snapshotInto(dr, syntheticStore(20));
    const plain = fs.readFileSync(path.join(dr.dir, name));

    const noKey = withEnv({ PAYESH_BACKUP_KEY: null, PAYESH_ENV: 'production' }, () => dr.encryptBackup(name));
    chk('D4a production without a key refuses to produce an archive (fail-closed)',
      noKey.ok === false && noKey.reason === 'key_required_in_production', JSON.stringify(noKey));
    chk('D4b the refusal is audited', log.some((x) => x.e === 'backup_unencrypted'));
    chk('D4c no key material appears in the audit payload',
      JSON.stringify(log).indexOf('PAYESH_BACKUP_KEY') < 0);

    const enc = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.encryptBackup(name));
    chk('D4d encryption succeeds with a key', enc.ok === true && /\.enc$/.test(enc.file), JSON.stringify(enc));
    const encPath = path.join(dr.dir, enc.file);
    chk('D4e the archive carries the format magic', fs.readFileSync(encPath).slice(0, MAGIC.length).toString('utf8') === MAGIC);
    chk('D4f the archive is NOT the plaintext', fs.readFileSync(encPath).indexOf(plain.slice(0, 64)) < 0);
    chk('D4g a phone number is not readable in the archive',
      fs.readFileSync(encPath, 'latin1').indexOf('09120000001') < 0);
    let mode = null;
    try { mode = fs.statSync(encPath).mode & 0o777; } catch (e) {}
    chk('D4h the archive is owner-only (0600)', mode === 0o600, 'mode=' + (mode && mode.toString(8)));

    const rt = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.decryptBackup(enc.file, path.join(TMP, 'rt.json')));
    chk('D4i the round trip reproduces the original bytes exactly',
      rt.ok === true && rt.sha256 === dr.verifyBackup(name).sha256
      && fs.readFileSync(path.join(TMP, 'rt.json')).equals(plain), JSON.stringify(rt));

    const wrong = withEnv({ PAYESH_BACKUP_KEY: 'a-completely-different-key-9999' }, () => dr.decryptBackup(enc.file, null));
    chk('D4j a wrong key cannot decrypt', wrong.ok === false && wrong.reason === 'authentication_failed', JSON.stringify(wrong));

    /* tamper */
    const blob = fs.readFileSync(encPath);
    blob[blob.length - 1] = blob[blob.length - 1] ^ 0xff;
    const tampered = path.join(TMP, 'tampered.enc');
    fs.writeFileSync(tampered, blob);
    const t = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.decryptFile(tampered, path.join(TMP, 'nope.json')));
    chk('D4k a modified archive is rejected by the auth tag',
      t.ok === false && t.reason === 'authentication_failed', JSON.stringify(t));
    chk('D4l a rejected decrypt writes nothing', !fs.existsSync(path.join(TMP, 'nope.json')));

    /* truncated / garbage archives */
    fs.writeFileSync(path.join(TMP, 'short.enc'), Buffer.from('PAYESHDR1xx'));
    chk('D4m a truncated archive is refused, not thrown',
      withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.decryptFile(path.join(TMP, 'short.enc'), null)).ok === false);
    chk('D4n a short key is rejected (min 16 chars)',
      withEnv({ PAYESH_BACKUP_KEY: 'short' }, () => dr.encryptBackup(name)).ok === false);
  }

  /* ═══ D5 — off-site copy ═══ */
  {
    const dataDir = fresh('d5');
    const { dr } = makeDr(dataDir);
    const name = snapshotInto(dr, syntheticStore(5));
    chk('D5a unconfigured off-site is reported, not faked',
      withEnv({ PAYESH_BACKUP_OFFSITE_DIR: null }, () => dr.copyOffSite(name)).reason === 'not_configured');
    chk('D5b a target inside the data dir is refused (that is not off-site)',
      withEnv({ PAYESH_BACKUP_OFFSITE_DIR: path.join(dataDir, 'fake-offsite') }, () => dr.copyOffSite(name)).reason === 'target_inside_data_dir');
    const site = path.join(TMP, 'offsite-d5');
    const withKey = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789', PAYESH_BACKUP_OFFSITE_DIR: site }, () => {
      const e = dr.encryptBackup(name);
      const c = dr.copyOffSite(name);
      return { e, c };
    });
    chk('D5c the encrypted archive is copied off-site and checksum-verified',
      withKey.c.ok === true && withKey.c.encrypted === true
      && fs.existsSync(path.join(site, withKey.e.file)), JSON.stringify(withKey.c));
    chk('D5d the off-site copy is byte-identical',
      fs.readFileSync(path.join(site, withKey.e.file)).equals(fs.readFileSync(path.join(dr.dir, withKey.e.file))));
    chk('D5e copying plaintext off-site without encrypting first is refused',
      withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789', PAYESH_BACKUP_OFFSITE_DIR: path.join(TMP, 'offsite-d5b') },
        () => dr.copyOffSite('payesh-19700101-000000-000.json')).reason === 'encrypt_first');
    const st = withEnv({ PAYESH_BACKUP_OFFSITE_DIR: site }, () => dr.offSiteStatus());
    chk('D5f off-site status reports count and encryption availability',
      st.configured === true && st.count === 1 && st.encrypted_available === true, JSON.stringify(st));
  }

  /* ═══ D6 — PITR posture ═══ */
  {
    const { dr } = makeDr(fresh('d6'));
    const json = dr.pitrStatus();
    chk('D6a the JSON store honestly reports no PITR', json.mode === 'json-store' && json.pitr === false, JSON.stringify(json));
    const pg = dr.pitrStatus({ isPostgres: () => true });
    chk('D6b a live PostgreSQL reports PITR available', pg.mode === 'postgres' && pg.pitr === true, JSON.stringify(pg));
    chk('D6c the posture names the WAL archiving requirement', /WAL|pgBackRest|WAL-G/.test(json.note + pg.note));
  }

  /* ═══ D7 — RPO / RTO accounting ═══ */
  {
    const dataDir = fresh('d7');
    const { dr } = makeDr(dataDir);
    chk('D7a with no backup the RPO is breached', (() => {
      const s = withEnv({ PAYESH_DR_RPO_S: null }, () => dr.rpoStatus());
      return s.has_backup === false && s.breached === true && s.achieved_seconds === null;
    })());
    const name = snapshotInto(dr, syntheticStore(5));
    const s2 = withEnv({ PAYESH_DR_RPO_S: null }, () => dr.rpoStatus());
    chk('D7b a fresh backup gives an achieved RPO of ~0s', s2.achieved_seconds !== null && s2.achieved_seconds <= 5 && s2.breached === false, JSON.stringify(s2));
    /* age the newest backup beyond the objective */
    const old = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(path.join(dr.dir, name), old, old);
    const s3 = withEnv({ PAYESH_DR_RPO_S: '300' }, () => dr.rpoStatus());
    chk('D7c a stale backup breaches the RPO objective', s3.breached === true && s3.achieved_seconds > 3000, JSON.stringify(s3));
    chk('D7d newestVerified only returns an archive that really verifies', (() => {
      const v = dr.newestVerified();
      return !!v && v.name === name && v.verified.ok === true;
    })());
  }

  /* ═══ D8 — the restore drill ═══ */
  {
    const dataDir = fresh('d8');
    const audits = [];
    const { dr } = makeDr(dataDir, audits);
    const live = syntheticStore(200);
    const liveBefore = JSON.stringify(live.users.length);
    const rep = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.restoreDrill({ snapshot: live }));
    const names = rep.phases.map((p) => p.name);
    chk('D8a every drill phase passes', rep.ok === true && rep.phases.every((p) => p.ok), JSON.stringify(rep.phases));
    chk('D8b the drill runs the full recovery path',
      ['snapshot', 'verify', 'restore_isolated', 'encrypt', 'decrypt_roundtrip', 'tamper_rejected', 'tamper_wrote_nothing', 'offsite_copy']
        .every((n) => names.indexOf(n) >= 0), names.join(','));
    chk('D8c the tamper phase fails FOR THE RIGHT REASON (not name validation)',
      rep.tamper_reason === 'authentication_failed', 'reason=' + rep.tamper_reason);
    chk('D8d the drill restores the real record counts', rep.restored_users === 200 && rep.restored_schools === 2, JSON.stringify({ u: rep.restored_users, s: rep.restored_schools }));
    chk('D8e restore time is measured against the RTO objective',
      typeof rep.restore_ms === 'number' && rep.restore_ms > 0 && rep.within_rto === true, JSON.stringify({ ms: rep.restore_ms, rto: rep.rto_objective_ms }));
    chk('D8f the drill leaves the live store untouched', JSON.stringify(live.users.length) === liveBefore);
    chk('D8g the scratch dir is cleaned up', !fs.existsSync(rep.work_dir));
    chk('D8h the drill is audited', audits.some((a) => a.e === 'dr_restore_drill' && a.d.ok === true));
    chk('D8i internal (__*) state never enters the archive', (() => {
      const data = JSON.parse(fs.readFileSync(path.join(dr.dir, rep.backup), 'utf8'));
      return Object.keys(data).every((k) => k.indexOf('__') !== 0);
    })());
    const kept = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.restoreDrill({ snapshot: syntheticStore(2), keep: true }));
    chk('D8j --keep preserves the scratch dir for inspection', fs.existsSync(kept.work_dir));
  }

  /* ═══ D9 — drill without a key: skipped, not faked ═══ */
  {
    const { dr } = makeDr(fresh('d9'));
    const rep = withEnv({ PAYESH_BACKUP_KEY: null, PAYESH_BACKUP_OFFSITE_DIR: null }, () => dr.restoreDrill({ snapshot: syntheticStore(3) }));
    const enc = rep.phases.find((p) => p.name === 'encrypt');
    chk('D9a without a key the encryption phase is explicitly skipped', rep.ok === true && enc.skipped === 'no_key', JSON.stringify(enc));
    chk('D9b the report warns that encryption was not exercised',
      Array.isArray(rep.warnings) && rep.warnings.some((w) => /PAYESH_BACKUP_KEY/.test(w)), JSON.stringify(rep.warnings));
    chk('D9c the tamper phase is not claimed as passed', rep.tamper_reason === undefined);
  }

  /* ═══ D10 — traversal / name validation ═══ */
  {
    const { dr } = makeDr(fresh('d10'));
    chk('D10a verifyBackup refuses a traversal name', dr.verifyBackup('../../../../etc/passwd').reason === 'invalid_name');
    chk('D10b verifyBackup refuses an absolute path', dr.verifyBackup('/etc/passwd').reason === 'invalid_name');
    chk('D10c decryptBackup refuses a non-archive name',
      withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.decryptBackup('../../../etc/passwd', null)).reason === 'invalid_name');
    chk('D10d encryptBackup refuses a non-backup name',
      withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789' }, () => dr.encryptBackup('../../etc/passwd')).reason === 'invalid_name');
  }

  /* ═══ D11 — audit hygiene ═══ */
  {
    const dataDir = fresh('d11');
    const audits = [];
    const { dr } = makeDr(dataDir, audits);
    const name = snapshotInto(dr, syntheticStore(3));
    withEnv({ PAYESH_BACKUP_KEY: 'wave16-SUPER-SECRET-KEY-xyz', PAYESH_BACKUP_OFFSITE_DIR: path.join(TMP, 'offsite-d11') }, () => {
      dr.encryptBackup(name);
      dr.copyOffSite(name);
    });
    const dumped = JSON.stringify(audits);
    chk('D11a audit events are emitted for encrypt + off-site',
      audits.some((a) => a.e === 'backup_encrypted') && audits.some((a) => a.e === 'backup_offsite_copied'));
    chk('D11b the backup key never reaches the audit log', dumped.indexOf('wave16-SUPER-SECRET-KEY-xyz') < 0);
    chk('D11c no PII from the snapshot reaches the audit log',
      dumped.indexOf('09120000001') < 0 && dumped.indexOf('1000000001') < 0);
  }

  /* ═══ D12 — the RTO gate actually gates ═══ */
  {
    const { dr } = makeDr(fresh('d12'));
    /* An unachievable objective must fail the drill even though every phase
       passed — otherwise within_rto is decoration. PAYESH_DR_RTO_MS gives
       sub-second precision so the gate can be exercised deterministically. */
    const rep = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789', PAYESH_DR_RTO_MS: '1' },
      () => dr.restoreDrill({ snapshot: syntheticStore(300) }));
    chk('D12a an unachievable RTO fails the drill even with all phases green',
      rep.ok === false && rep.within_rto === false && rep.reason === 'rto_exceeded'
      && rep.phases.every((p) => p.ok),
      JSON.stringify({ ms: rep.restore_ms, obj: rep.rto_objective_ms, reason: rep.reason }));
    const real = withEnv({ PAYESH_BACKUP_KEY: 'wave16-test-key-0123456789', PAYESH_DR_RTO_MS: null },
      () => dr.restoreDrill({ snapshot: syntheticStore(300) }));
    chk('D12b the same snapshot passes against the real 900s objective', real.ok === true && real.within_rto === true);
    chk('D12c the objective reports both the seconds and ms form',
      real.objectives.rto_seconds === 900 && real.objectives.rto_ms === 900000, JSON.stringify(real.objectives));
  }

  /* ═══ T — deliverables ═══ */
  {
    chk('Ta docs/WAVE16_DISASTER_RECOVERY.md exists', fs.existsSync(path.join(ROOT, 'docs/WAVE16_DISASTER_RECOVERY.md')));
    chk('Tb docs/RUNBOOK_DISASTER_RECOVERY.md exists', fs.existsSync(path.join(ROOT, 'docs/RUNBOOK_DISASTER_RECOVERY.md')));
    chk('Tc scripts/dr-restore-drill.js exists and parses',
      fs.existsSync(path.join(ROOT, 'scripts/dr-restore-drill.js'))
      && spawnSync(process.execPath, ['--check', path.join(ROOT, 'scripts/dr-restore-drill.js')]).status === 0);
    chk('Td the drill script runs and reports PASS on the seeded store', (() => {
      const dir = path.join(TMP, 'drill-cli');
      fs.mkdirSync(dir, { recursive: true });
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dr-restore-drill.js'), '--data-dir', dir],
        { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
      return r.status === 0 && /dr-restore-drill: PASS/.test(r.stdout || '');
    })());
    chk('Te .env.example documents the Wave 16 variables', (() => {
      const e = read('.env.example');
      return ['PAYESH_BACKUP_KEY', 'PAYESH_BACKUP_OFFSITE_DIR', 'PAYESH_DR_RPO_S', 'PAYESH_DR_RTO_S'].every((k) => e.indexOf(k) >= 0);
    })());
    chk('Tf the wave doc states RPO/RTO and lists the roadmap deliverables', (() => {
      const d = read('docs/WAVE16_DISASTER_RECOVERY.md');
      return ['RPO', 'RTO', 'Backup', 'Off-site', 'Encryption', 'PITR', 'Restore test', 'Failover', 'Runbook']
        .every((s) => d.indexOf(s) >= 0);
    })());
  }

  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('wave16-dr crashed:', e); process.exit(1); });
