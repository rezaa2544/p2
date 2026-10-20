#!/usr/bin/env node
/* Isolated CI webhook sink for the M15-01 Alertmanager runtime exercise.
 * This is not an on-call receiver and must never be exposed as production alerting.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 18080;
const MAX_BODY_BYTES = 1024 * 1024;

function isPrivateOrLoopback(remoteAddress) {
  let address = String(remoteAddress || '').replace(/^::ffff:/i, '');
  if (address === '::1' || /^127\./.test(address)) return true;
  if (address.startsWith('::')) return false;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function normalizeEvent(body) {
  const alerts = Array.isArray(body.alerts) ? body.alerts : [];
  return {
    received_at: new Date().toISOString(),
    receiver: String(body.receiver || '').slice(0, 100),
    status: String(body.status || '').slice(0, 32),
    alerts: alerts.slice(0, 100).map((alert) => {
      const labels = alert && alert.labels && typeof alert.labels === 'object' ? alert.labels : {};
      return {
        status: String(alert && alert.status || body.status || '').slice(0, 32),
        alertname: String(labels.alertname || '').slice(0, 100),
        severity: String(labels.severity || '').slice(0, 32),
        service: String(labels.service || '').slice(0, 64),
        instance_role: String(labels.instance_role || '').slice(0, 64),
        starts_at: String(alert && alert.startsAt || '').slice(0, 64),
        ends_at: String(alert && alert.endsAt || '').slice(0, 64)
      };
    })
  };
}

function start(options) {
  options = options || {};
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.M15_RUNTIME_ALLOW_CI !== '1') {
    throw new Error('m15_alert_receiver_ci_only_guard_rejected');
  }
  const eventsFile = path.resolve(String(options.eventsFile || process.env.M15_ALERT_EVENTS_FILE || ''));
  const runnerTemp = path.resolve(String(process.env.RUNNER_TEMP || ''));
  if (!runnerTemp || !eventsFile.startsWith(runnerTemp + path.sep)) {
    throw new Error('m15_alert_receiver_events_file_must_be_under_runner_temp');
  }
  fs.mkdirSync(path.dirname(eventsFile), { recursive: true });

  const server = http.createServer((req, res) => {
    if (!isPrivateOrLoopback(req.socket && req.socket.remoteAddress)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end('{"ok":false,"code":"private_ci_network_only"}');
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end('{"ok":true}');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/alerts') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"ok":false,"code":"not_found"}');
      return;
    }

    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end('{"ok":false,"code":"body_too_large"}');
        return;
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch (_) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"ok":false,"code":"invalid_json"}');
        return;
      }
      if (!body || !Array.isArray(body.alerts)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"ok":false,"code":"invalid_alert_payload"}');
        return;
      }
      try {
        const line = JSON.stringify(normalizeEvent(body)) + '\n';
        const fd = fs.openSync(eventsFile, 'a', 0o600);
        try {
          fs.fchmodSync(fd, 0o600);
          fs.writeSync(fd, line, null, 'utf8');
        } finally { fs.closeSync(fd); }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end('{"ok":true}');
      } catch (_) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"ok":false,"code":"event_write_failed"}');
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', () => resolve(server));
  });
}

if (require.main === module) {
  start().then(() => console.log('M15-01 isolated Alertmanager receiver ready on 0.0.0.0:' + PORT))
    .catch((err) => {
      console.error('M15-01 alert receiver failed: ' + String(err && err.message || err));
      process.exitCode = 1;
    });
}

module.exports = { PORT, MAX_BODY_BYTES, isPrivateOrLoopback, normalizeEvent, start };
