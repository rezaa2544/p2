#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pitr-restore-args-'));
try {
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  const psql = path.join(bin, 'psql');
  const fakePgBackRest = path.join(temp, 'fake-pgbackrest.sh');
  fs.writeFileSync(psql, '#!/bin/sh\n[ "$1" = "--version" ] && { echo "psql mock"; exit 0; }\nexit 0\n');
  fs.writeFileSync(fakePgBackRest, '#!/usr/bin/env bash\nprintf "ARG_COUNT=%s\\n" "$#"\nfor arg in "$@"; do printf "ARG=<%s>\\n" "$arg"; done\n');
  fs.chmodSync(psql, 0o700);
  fs.chmodSync(fakePgBackRest, 0o700);

  const target = '2026-10-19 14:25:36.123456+00';
  const result = spawnSync('bash', [path.join(root, 'tools', 'pitr-restore.sh'), '--time', target, '--no-start'], {
    cwd: root,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      PATH: bin + path.delimiter + process.env.PATH,
      PBR_EXEC: 'bash ' + fakePgBackRest,
      PBR_DEST_ROOT: path.join(temp, 'restore-runs')
    })
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const args = Array.from(String(result.stdout).matchAll(/^ARG=<([^\r\n]*)>$/gm), (match) => match[1]);
  assert.strictEqual(args.includes('--type=time'), true, result.stdout);
  assert.strictEqual(args.includes('--target=' + target), true, result.stdout);
  assert.strictEqual(args.includes('--target-action=promote'), true, result.stdout);
  assert.strictEqual(args.includes('2026-10-19'), false, 'timestamp must not be split into multiple argv entries');
  console.log('PITR restore target argv contract: 5 passed, 0 failed');
} catch (error) {
  console.error('PITR restore target argv contract: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
