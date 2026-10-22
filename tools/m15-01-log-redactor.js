#!/usr/bin/env node
'use strict';

const fs = require('fs');

const SECRET_ENV_NAMES = [
  'POSTGRES_PASSWORD', 'PG_PASSWORD', 'PGHA_PASSWORD', 'PG_ADMIN_URL', 'DATABASE_URL', 'PGURL', 'P11_LIVE_PG',
  'REDIS_PASSWORD', 'REDIS_URL', 'PAYESH_METRICS_TOKEN', 'PAYESH_JWT_SECRET', 'PAYESH_OTP_PEPPER',
  'PG_REPLICATION_PASSWORD', 'PGHA_REPLICATION_PASSWORD', 'MINIO_PASSWORD', 'MINIO_ROOT_PASSWORD',
  'MINIO_ROOT_USER', 'MINIO_USER', 'PGHA_S3_KEY', 'PGHA_S3_SECRET', 'ALERTMANAGER_WEBHOOK_URL', 'GRAFANA_PASSWORD',
  'GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'VERCEL_TOKEN', 'SUPABASE_ACCESS_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ACCESS_TOKEN', 'SESSION_COOKIE'
];
const SECRET_KEY_SUFFIX = /(?:^|_)(?:PASSWORD|PASSWD|TOKEN|SECRET|API_KEY|ACCESS_KEY(?:_ID)?|S3_KEY|PRIVATE_KEY|CREDENTIALS?|AUTHORIZATION|COOKIE)(?:_|$)|(?:_URL|_URI|_DSN)$|^PGURL$/i;
const NORMALIZED_SECRET_SUFFIX = /(?:PASSWORD|PASSWD|TOKEN|SECRET|APIKEY|ACCESSKEY(?:ID)?|S3KEY|PRIVATEKEY|CREDENTIALS?|AUTHORIZATION|COOKIE|JWT|BEARER|URL|URI|DSN)$/;
const SECRET_ENV_NAME_KEYS = new Set(SECRET_ENV_NAMES.map((name) => name.toUpperCase()));
const PRIVATE_DATA_KEYS = new Set([
  'ADDRESS', 'COOKIES', 'DEMOCODE', 'EMAIL', 'FULLNAME', 'MOBILE', 'MOBILENUMBER',
  'NATIONALID', 'ONETIMECODE', 'OTP', 'OTPCODE', 'PHONE', 'PHONENUMBER', 'SESSION', 'SESSIONID',
  'SETCOOKIE', 'USER', 'USERNAME'
]);
const KEY_VALUE_PATTERN = /(["']?)([A-Za-z_][A-Za-z0-9_-]*)(["']?)(\s*)([=:])(\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\{[^{}]*\}|\[[^[\]]*\]|[^\s,;}\]]+)/gi;

function redactText(input, env) {
  env = env || process.env;
  let text = String(input == null ? '' : input);
  const values = Array.from(new Set(SECRET_ENV_NAMES.map((name) => String(env[name] || '')
    .trim()).filter((value) => value.length >= 8)))
    .sort((left, right) => right.length - left.length);
  for (const value of values) text = text.split(value).join('[REDACTED]');

  // Authorization headers are multi-token values; redact the whole remainder of the line.
  text = text.replace(/\b((?:[A-Za-z_][A-Za-z0-9_]*_)?AUTHORIZATION)\s*:\s*[^\r\n]*/gi,
    (_match, key) => key + ': [REDACTED]');
  text = text.replace(KEY_VALUE_PATTERN, (match, quoteBefore, key, quoteAfter, beforeSeparator, separator, afterSeparator, value) => {
    if (!isSensitiveKey(key)) return match;
    const first = value[0];
    const replacement = value === '[REDACTED]' ? value
      : first === '"' ? '"[REDACTED]"'
        : first === "'" ? "'[REDACTED]'"
          : first === '{' || first === '[' ? '"[REDACTED]"' : '[REDACTED]';
    return quoteBefore + key + quoteAfter + beforeSeparator + separator + afterSeparator + replacement;
  });
  // PostgreSQL constraint diagnostics use `Key (column)=(...)`, not an
  // ordinary assignment. Never persist constraint values: even a generic
  // column can contain an opaque identifier or user-controlled data.
  text = text.replace(/\bKey\s*\(([^)]+)\)\s*=\s*\(([^)]*)\)/gi,
    (_match, key) => 'Key (' + key + ')=[REDACTED]');
  text = text.replace(/\b(postgres(?:ql)?|redis):\/\/[^\s"'`]+/gi,
    (_match, scheme) => scheme + '://[REDACTED]');
  return text;
}

function isSensitiveKey(key) {
  const value = String(key || '');
  const normalized = value.replace(/[-_]/g, '').toUpperCase();
  return SECRET_KEY_SUFFIX.test(value) || SECRET_ENV_NAME_KEYS.has(value.toUpperCase())
    || NORMALIZED_SECRET_SUFFIX.test(normalized) || PRIVATE_DATA_KEYS.has(normalized);
}

function redactArgument(raw, env) {
  const arg = String(raw);
  const envOption = /^(--env=|-e)([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(arg);
  if (envOption && isSensitiveKey(envOption[2])) {
    return envOption[1] + envOption[2] + '=[REDACTED]';
  }
  const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(arg);
  if (assignment && isSensitiveKey(assignment[1])) return assignment[1] + '=[REDACTED]';
  return redactText(arg, env);
}

function shellQuote(raw) {
  const value = String(raw);
  if (/^[A-Za-z0-9_./:=,+@%-]+$/.test(value)) return value;
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function formatCommand(args, env) {
  return Array.from(args || [], (arg) => shellQuote(redactArgument(arg, env))).join(' ');
}

function redactFile(file, env) {
  const input = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, redactText(input, env), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function main(argv) {
  const [mode, ...args] = argv;
  if (mode === 'format-command') {
    process.stdout.write(formatCommand(args, process.env) + '\n');
    return;
  }
  if (mode === 'redact-file' && args.length === 1) {
    redactFile(args[0], process.env);
    return;
  }
  throw new Error('usage: node tools/m15-01-log-redactor.js <format-command|redact-file> [args]');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error('M15 log redactor failed: ' + String(error && error.message || 'unknown'));
    process.exitCode = 1;
  }
}

module.exports = { SECRET_ENV_NAMES, isSensitiveKey, redactText, redactArgument, formatCommand, redactFile };
