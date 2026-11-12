/* ═══════════════════════════════════════════════════════════════════
   server/ws-hub.js — WebSocket hub مقیاس‌پذیر افقی (M15-17)
   ───────────────────────────────────────────────────────────────────
   مسئله: با چند نمونه، broadcast داخل‌پروسه‌ای فقط به کلاینت‌های همان
   نمونه می‌رسد و استقرار به sticky-session (چسبندگیِ LB) نیاز دارد —
   شکننده (ریاستارت نمونه = قطعِ جریان) و ناسازگار با مقیاس افقی.
   راه‌حل: fan-out از طریق Redis pub/sub — هر نمونه به یک topic مشترک
   گوش می‌دهد؛ broadcast = انتشار روی Redis؛ «همه» نمونه‌ها به کلاینت‌های
   محلیِ خودشان تحویل می‌دهند. هیچ sticky-session لازم نیست.

   احراز هویت: upgrade فقط با session معتبر (توکن از ?token= — مرورگر
   هدرِ سفارشی نمی‌فرستد). sessionFrom همان تابعِ auth است.

   جداسازی tenant: کلاینت با اشتراکِ tenant:<schoolId> فقطِ tenant خودش را
   می‌گیرد (superadmin = همه)؛ نقض = پیام خطا، بدون عضویت.

   نگهداشت اتصال: ping/pong دوره‌ای؛ اتصالِ مرده حذف می‌شود (unref —
   هرگز خروجِ پروسه را نگه نمی‌دارد).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const WebSocket = require('ws');
const redis = require('./redis');

const WS_CHANNEL = 'payesh-ws-broadcast';

function createWsHub({ httpServer, sessionFrom, path = '/ws', heartbeatMs = 30000 }) {
  const wss = new WebSocket.Server({ noServer: true });
  const locals = new Set(); // { ws, topics:Set<string>, session }

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== path) { try { socket.destroy(); } catch (e) {/* gone */} return; }
      let session = null;
      if (typeof sessionFrom === 'function') {
        const token = url.searchParams.get('token');
        if (token && !req.headers.authorization) req.headers.authorization = 'Bearer ' + token;
        session = await sessionFrom(req);
      }
      if (!session) {
        try { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); } catch (e) {/* gone */}
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, session);
      });
    } catch (e) {
      try { socket.destroy(); } catch (_e) {/* gone */}
    }
  });

  wss.on('connection', (ws, req, session) => {
    const client = { ws, topics: new Set(['global']), session };
    locals.add(client);
    ws.on('message', (raw) => {
      /* فقط کنترلِ اشتراک — داده از کلاینت جریان رسمی ندارد (sync = REST) */
      try {
        const m = JSON.parse(String(raw));
        if (m && m.action === 'subscribe' && typeof m.topic === 'string' && /^[\w:.@-]{1,120}$/.test(m.topic)) {
          if (m.topic.startsWith('tenant:')) {
            const tid = m.topic.slice('tenant:'.length);
            const own = session && session.school_id != null && String(session.school_id) === tid;
            const sa = session && session.role === 'superadmin';
            if (!own && !sa) {
              try { ws.send(JSON.stringify({ error: 'tenant_isolation', topic: m.topic })); } catch (e) {/* gone */}
              return;
            }
          }
          client.topics.add(m.topic);
          try { ws.send(JSON.stringify({ ok: true, subscribed: m.topic })); } catch (e) {/* gone */}
        }
      } catch (e) { /* malformed = ignored */ }
    });
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => locals.delete(client));
    ws.on('error', () => locals.delete(client));
  });

  const hb = setInterval(() => {
    for (const c of [...locals]) {
      if (c.ws.readyState !== WebSocket.OPEN || !c.ws.isAlive) {
        try { c.ws.terminate(); } catch (e) {/* gone */}
        locals.delete(c);
        continue;
      }
      c.ws.isAlive = false;
      try { c.ws.ping(); } catch (e) {/* gone */}
    }
  }, Math.max(5000, heartbeatMs));
  hb.unref();

  /* fan-in: پیامِ Redis = تحویل به کلاینت‌های محلیِ همین نمونه */
  redis.subscribe(WS_CHANNEL, (raw) => {
    let m = null;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.topic !== 'string') return;
    const data = JSON.stringify({ topic: m.topic, payload: m.payload });
    for (const c of [...locals]) {
      const wants = c.topics.has(m.topic) || (m.topic === 'global' && c.topics.has('global'));
      if (wants && c.ws.readyState === WebSocket.OPEN) {
        try { c.ws.send(data); } catch (e) {/* gone */}
      }
    }
  });

  return {
    /** broadcast از طریق Redis: همهٔ نمونه‌ها به کلاینت‌های محلیِ خودشان می‌دهند */
    async broadcast(topic, payload) {
      return redis.publish(WS_CHANNEL, JSON.stringify({ topic, payload }));
    },
    stats() { return { localClients: locals.size }; },
    close() {
      clearInterval(hb);
      for (const c of [...locals]) { try { c.ws.terminate(); } catch (e) {/* gone */} }
      locals.clear();
      try { wss.close(); } catch (e) {/* gone */}
    }
  };
}

module.exports = { createWsHub, WS_CHANNEL };
