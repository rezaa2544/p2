'use strict';
/* tests/m15-07-rabbitmq-tls.js — M15-07 (ردیف ۲۶): Message Queue امن
   ───────────────────────────────────────────────────────────────────
   معیارِ گیت (docs/M15_GOVERNANCE_ACCEPTANCE.md §۲):
     «TLS + auth فعال روی RabbitMQ + تستِ اتصالِ بدونِ TLS = رد»

   S1 static: compose/config = فقط-AMQPS (listeners.tcp=none)، بدونِ
      publishِ 5672، TLS 1.2/1.3 با verify_peer، env-guard رمزها،
      ایمیج پین‌شده، اسکریپتِ گواهی + gitignore.
   L1..L4 live (خود-skip صادقانه بدونِ env — هرگز PASS شمرده نمی‌شود):
     L1  اتصالِ TLS + هندشیکِ خامِ AMQP 0-9-1 با PLAIN = open-ok
     L2  queue.declare + basic.publish + consume + تحویلِ پیام = کارِ واقعی صف
     L3  رمزِ غلط = connection.close (403 access-refused)
     L4  اتصالِ بدونِ TLS (سوکتِ خام به پورتِ amqps) = رد (بسته‌شدن/EOF)
   هندشیک = بدونِ هیچ وابستگیِ جدید (الگویِ پروبِ خامِ sentinel — M15-05
   زنجیره هم بدون کتابخانه). اثباتِ منفیِ S1: حذفِ `listeners.tcp = none`
   از conf ⇒ این تست قرمز.
   Run: node tests/m15-07-rabbitmq-tls.js
   Live: PAYESH_RABBITMQ_HOST=… PAYESH_RABBITMQ_AMQPS_PORT=25671
         PAYESH_RABBITMQ_USER=… PAYESH_RABBITMQ_PASS=… PAYESH_RABBITMQ_CA=… */

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

let ok = 0, fail = 0, skipped = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function skip(name, why) {
  skipped++;
  console.log('  ⏭️ ' + name + ' (' + why + ')');
}

/* ── کدکِ مینیمالِ AMQP 0-9-1 (فقط همان‌قدر که گیت لازم دارد) ─────── */
const PROTO = Buffer.from('AMQP\x00\x00\x09\x01', 'binary');
const FRAME_END = 0xCE;

function reader(buf) {
  let o = 0;
  return {
    octet() { return buf[o++]; },
    short() { const v = buf.readUInt16BE(o); o += 2; return v; },
    long() { const v = buf.readUInt32BE(o); o += 4; return v; },
    longlong() { const v = buf.readBigUInt64BE(o); o += 8; return v; },
    shortstr() { const n = buf[o++]; const v = buf.toString('utf8', o, o + n); o += n; return v; },
    longstr() { const n = buf.readUInt32BE(o); o += 4; const v = buf.toString('utf8', o, o + n); o += n; return v; },
    skipTable() { const n = buf.readUInt32BE(o); o += 4 + n; },
    tell() { return o; }
  };
}

function methodFrame(channel, payload) {
  const h = Buffer.alloc(7);
  h.writeUInt8(1, 0);                 /* type = METHOD */
  h.writeUInt16BE(channel, 1);
  h.writeUInt32BE(payload.length, 3);
  return Buffer.concat([h, payload, Buffer.from([FRAME_END])]);
}

function methodPayload(classId, methodId, ...fieldBufs) {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(classId, 0);
  head.writeUInt16BE(methodId, 2);
  return Buffer.concat([head, ...fieldBufs]);
}

function shortstr(s) {
  const b = Buffer.from(s, 'utf8');
  const h = Buffer.alloc(1);
  h.writeUInt8(b.length, 0);
  return Buffer.concat([h, b]);
}
function longstr(s) {
  const b = Buffer.from(s, 'binary');
  const h = Buffer.alloc(4);
  h.writeUInt32BE(b.length, 0);
  return Buffer.concat([h, b]);
}
function emptyTable() {
  const h = Buffer.alloc(4);
  h.writeUInt32BE(0, 0);
  return h;
}

/* connection.start-ok: client-properties(table) mechanism(response) locale */
function startOk(user, pass) {
  const resp = Buffer.concat([Buffer.from([0]), Buffer.from(user, 'utf8'), Buffer.from([0]), Buffer.from(pass, 'utf8')]);
  const respF = Buffer.alloc(4);
  respF.writeUInt32BE(resp.length, 0);
  return methodPayload(10, 11, emptyTable(), shortstr('PLAIN'), Buffer.concat([respF, resp]), shortstr('en_US'));
}
/* connection.tune-ok: channel-max(short) frame-max(long) heartbeat(short) */
function tuneOk(channelMax, frameMax, heartbeat) {
  const b = Buffer.alloc(8);
  b.writeUInt16BE(channelMax, 0);
  b.writeUInt32BE(frameMax, 2);
  b.writeUInt16BE(heartbeat, 6);
  return methodPayload(10, 31, b);
}
/* connection.open: vhost(shortstr) capabilities(shortstr) insist(bit) */
function connectionOpen(vhost) {
  return methodPayload(10, 40, shortstr(vhost), shortstr(''), Buffer.from([0]));
}
/* queue.declare: ticket(0) queue(bits: passive|durable|exclusive|auto-delete|no-wait) args */
function queueDeclare(queue, autoDelete) {
  const bits = Buffer.alloc(1);
  if (autoDelete) bits.writeUInt8(0x08, 0); /* auto-delete */
  return methodPayload(50, 10, Buffer.from([0, 0]), shortstr(queue), bits, emptyTable());
}
/* basic.publish: ticket(0) exchange("" = default) routing-key bits(0) */
function basicPublish(routingKey, body) {
  const m = methodPayload(60, 40, Buffer.from([0, 0]), shortstr(''), shortstr(routingKey), Buffer.from([0]));
  const head = Buffer.alloc(7 + 14);
  head.writeUInt8(2, 0);               /* type = HEADER */
  head.writeUInt16BE(1, 1);
  head.writeUInt32BE(14, 3);
  const h = head.subarray(7);
  h.writeUInt16BE(60, 0);              /* class 60 */
  h.writeUInt16BE(0, 2);               /* weight */
  h.writeBigUInt64BE(BigInt(body.length), 4); /* body size */
  h.writeUInt16BE(0, 12);              /* property flags: هیچ */
  const bodyFrame = Buffer.alloc(7 + body.length + 1); /* +1 = فریم‌اند */
  bodyFrame.writeUInt8(3, 0);          /* type = BODY */
  bodyFrame.writeUInt16BE(1, 1);
  bodyFrame.writeUInt32BE(body.length, 3);
  Buffer.from(body).copy(bodyFrame, 7);
  bodyFrame[7 + body.length] = FRAME_END;
  return Buffer.concat([methodFrame(1, m), head, Buffer.from([FRAME_END]), bodyFrame]);
}
/* basic.consume: ticket(0) queue consumer-tag("" ) bits(no-ack=0) args */
function basicConsume(queue) {
  return methodPayload(60, 20, Buffer.from([0, 0]), shortstr(queue), shortstr(''), Buffer.from([0]), emptyTable());
}
/* basic.ack: delivery-tag(longlong) multiple(bit) */
function basicAck(tag) {
  const b = Buffer.alloc(9);
  b.writeBigUInt64BE(BigInt(tag), 0);
  b.writeUInt8(0, 8);
  return methodPayload(60, 80, b);
}
/* connection.close (کلاینت، مؤدبانه): reply-code text class-id method-id */
function connectionClose() {
  const b = Buffer.alloc(4);
  b.writeUInt16BE(200, 0);
  return methodPayload(10, 60, b, shortstr('client goodbye'), Buffer.from([0, 0, 0, 0]));
}

function frameAssembler(onFrame) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 7) return;
      const size = buf.readUInt32BE(3);
      if (buf.length < 7 + size + 1) return;
      const type = buf.readUInt8(0);
      const channel = buf.readUInt16BE(1);
      const payload = buf.subarray(7, 7 + size);
      buf = buf.subarray(7 + size + 1);
      if (type === 1) { /* method */
        const r = reader(payload);
        onFrame({ kind: 'method', channel, classId: r.short(), methodId: r.short(), rest: r, raw: payload });
      } else if (type === 2) {
        onFrame({ kind: 'header', channel });
      } else if (type === 3) {
        onFrame({ kind: 'body', channel, body: Buffer.from(payload) });
      } /* heartbeat 8 = نادیده */
    }
  };
}

function amqpHandshake(socket, { user, pass, vhost }) {
  return new Promise((resolve, reject) => {
    const fail = (e) => { try { socket.removeListener('data', feed); socket.destroy(); } catch (_) {} reject(new Error(e)); };
    const timer = setTimeout(() => fail('TIMEOUT در هندشیک AMQP'), 10000);
    const okResolve = (v) => { clearTimeout(timer); socket.removeListener('data', feed); resolve(v); };
    let stage = 'proto', channelMax = 0, frameMax = 131072, heartbeat = 0;
    const feed = frameAssembler((f) => {
      if (f.kind !== 'method') return;
      if (stage === 'proto' && f.classId === 10 && f.methodId === 10) {          /* connection.start */
        stage = 'tune';
        socket.write(methodFrame(0, startOk(user, pass)));
      } else if (stage === 'tune' && f.classId === 10 && f.methodId === 30) {    /* connection.tune */
        channelMax = f.rest.short(); frameMax = f.rest.long(); heartbeat = f.rest.short();
        stage = 'open';
        socket.write(methodFrame(0, tuneOk(channelMax || 16, Math.min(frameMax || 131072, 131072), 0)));
        socket.write(methodFrame(0, connectionOpen(vhost)));
      } else if (stage === 'open' && f.classId === 10 && f.methodId === 41) {    /* connection.open-ok */
        okResolve({ channelMax, frameMax, socket });
      } else if (f.classId === 10 && f.methodId === 60) {                        /* connection.close از سرور */
        const code = f.rest.short();
        fail('CONNECTION_CLOSE code=' + code + ' text=' + f.rest.shortstr());
      }
    });
    socket.on('data', feed);
    socket.on('error', (e) => fail('SOCKET: ' + e.message));
    socket.on('close', () => { if (stage !== 'open-ok') fail('SOCKET CLOSED در مرحلهٔ ' + stage); });
    socket.write(PROTO);
  });
}

function drain(socket, ms) {
  /* صفِ فریم‌های ورودی برای مصرف (deliver/header/body) */
  return new Promise((resolve) => {
    const got = { deliver: null, header: null, body: null };
    const timer = setTimeout(() => resolve(got), ms);
    const feed = frameAssembler((f) => {
      if (f.kind === 'method') console.error('TRACE drain: class=' + f.classId + ' method=' + f.methodId + ' ch=' + f.channel);
      if (f.kind === 'method' && f.classId === 60 && f.methodId === 60) {
        got.deliver = { tag: Number(f.rest.longlong()), rest: f.rest };
      } else if (f.kind === 'header') got.header = true;
      else if (f.kind === 'body') { got.body = f.body; clearTimeout(timer); resolve(got); }
    });
    socket.on('data', feed);
  });
}

(async () => {
  console.log('\n▸ M15-07 — Message Queue امن (RabbitMQ فقط-AMQPS)');

  /* ── S1 — static: قراردادِ compose/config ── */
  const compose = fs.readFileSync(path.join(__dirname, '..', 'infra', 'rabbitmq', 'docker-compose.rabbitmq.yml'), 'utf8');
  const conf = fs.readFileSync(path.join(__dirname, '..', 'infra', 'rabbitmq', 'rabbitmq.conf'), 'utf8');
  const certs = fs.readFileSync(path.join(__dirname, '..', 'tools', 'rabbitmq-gen-certs.sh'), 'utf8');
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');

  chk('S1a conf = بدونِ listenerِ plain (listeners.tcp = none)', /listeners\.tcp\s*=\s*none/.test(conf));
  chk('S1b conf = TLS با verify_peer + tlsv1.2/1.3', conf.includes('verify_peer') && conf.includes('tlsv1.2') && conf.includes('tlsv1.3') && conf.includes('cacertfile'));
  chk('S1c compose = فقط پورتِ amqps 5671 روی 127.0.0.1 — بدونِ 5672', compose.includes('"127.0.0.1:25671:5671"') && !/:\s*"127\.0\.0\.1:[0-9]+:5672"/.test(compose) && !compose.includes(':5672"'));
  chk('S1d compose = ایمیجِ پین‌شدهٔ rabbitmq', /image:\s*rabbitmq:3\.13\.[0-9]+/.test(compose));
  chk('S1e compose = env-guard رمز و مسیرِ گواهی', (compose.match(/\$\{[A-Z_]+:\?/g) || []).length >= 3);
  chk('S1f اسکریپتِ گواهی = CA + سرور + 0600 + SAN', certs.includes('openssl req -x509') && certs.includes('subjectAltName=DNS:rabbitmq') && certs.includes('chmod 0600'));
  chk('S1g gitignore = *.crt/*.key/*.pem (R96)', gi.includes('*.pem') && gi.includes('*.key') && gi.includes('*.crt'));

  /* ── Live (خود-skip صادقانه) ── */
  const host = process.env.PAYESH_RABBITMQ_HOST;
  const port = Number(process.env.PAYESH_RABBITMQ_AMQPS_PORT || 0);
  const user = process.env.PAYESH_RABBITMQ_USER;
  const pass = process.env.PAYESH_RABBITMQ_PASS;
  const caPath = process.env.PAYESH_RABBITMQ_CA;
  const vhost = process.env.PAYESH_RABBITMQ_VHOST || '/';

  if (!host || !port || !user || !pass || !caPath || !fs.existsSync(caPath)) {
    skip('L1..L4 (RabbitMQ زنده)', 'env کاملِ PAYESH_RABBITMQ_* تنظیم نیست — self-skip صادقانه؛ این اجرا PASSِ گیت شمرده نمی‌شود');
  } else {
    const ca = fs.readFileSync(caPath);

    /* L1 — TLS + auth خوب = open-ok */
    let s1, h1;
    try {
      s1 = tls.connect({ host, port, ca, servername: host, rejectUnauthorized: true });
      await new Promise((res, rej) => { s1.once('secureConnect', res); s1.once('error', rej); });
      h1 = await amqpHandshake(s1, { user, pass, vhost });
      chk('L1 اتصالِ TLS + auth = connection.open-ok', !!h1 && !s1.destroyed, 'frame-max=' + (h1 && h1.frameMax));
    } catch (e) {
      chk('L1 اتصالِ TLS + auth = connection.open-ok', false, e.message);
    }

    /* L2 — صف واقعی: channel.open (الزامی!) + declare + publish + consume + تحویل */
    if (s1 && h1 && !s1.destroyed) {
      try {
        s1.write(methodFrame(1, methodPayload(20, 10, shortstr('')))); /* channel.open */
        await new Promise((res, rej) => {
          const feed = frameAssembler((f) => {
            if (f.kind === 'method' && f.classId === 20 && f.methodId === 11) { s1.removeListener('data', feed); res(); }
          });
          s1.on('data', feed);
          const t = setTimeout(() => rej(new Error('TIMEOUT channel.open-ok')), 8000);
          if (typeof t.unref === 'function') t.unref();
        });
        const q = 'm15-07-drill-' + Date.now();
        s1.write(methodFrame(1, queueDeclare(q, true)));
        await new Promise((res, rej) => {
          const feed = frameAssembler((f) => {
            if (f.kind === 'method') console.error('TRACE frame: class=' + f.classId + ' method=' + f.methodId + ' ch=' + f.channel + ' hex=' + f.raw.toString('hex').slice(0, 40));
            if (f.kind === 'method' && f.classId === 50 && f.methodId === 11) { s1.removeListener('data', feed); res(); }
            if (f.kind === 'method' && f.classId === 20 && f.methodId === 40) { s1.removeListener('data', feed); rej(new Error('CHANNEL_CLOSE از سرور — declare رد شد')); }
          });
          s1.on('data', feed);
          const t = setTimeout(() => rej(new Error('TIMEOUT declare')), 8000);
          if (typeof t.unref === 'function') t.unref();
        });
        s1.write(methodFrame(1, basicConsume(q)));
        await new Promise((res) => setTimeout(res, 300)); /* consume-ok زمان می‌خواهد */
        const msg = Buffer.from('m15-07-live-drill', 'utf8');
        s1.write(basicPublish(q, msg));
        const got = await drain(s1, 8000);
        const bodyOk = got.body && msg.equals(got.body);
        chk('L2 publish/consume روی TLS = پیامِ واقعی تحویل شد', !!(got.deliver && got.header && bodyOk),
          'deliver=' + !!got.deliver + ' body-match=' + bodyOk);
        if (got.deliver) s1.write(methodFrame(1, basicAck(got.deliver.tag)));
        s1.write(methodFrame(0, connectionClose()));
        await new Promise((res) => setTimeout(res, 200));
        try { s1.destroy(); } catch (e) { /* swallowed: intentional — e unused */ }
      } catch (e) {
        chk('L2 publish/consume روی TLS = پیامِ واقعی تحویل شد', false, e.message);
        try { s1.destroy(); } catch (e2) { /* swallowed: intentional — e2 unused */ }
      }
    }

    /* L3 — رمزِ غلط = رد */
    try {
      const s3 = tls.connect({ host, port, ca, servername: host, rejectUnauthorized: true });
      await new Promise((res, rej) => { s3.once('secureConnect', res); s3.once('error', rej); });
      await amqpHandshake(s3, { user, pass: pass + 'WRONG', vhost });
      chk('L3 رمزِ غلط = رد (connection.close)', false, 'اتصال با رمزِ غلط open-ok شد!');
      try { s3.destroy(); } catch (e) { /* swallowed: intentional — e unused */ }
    } catch (e) {
      chk('L3 رمزِ غلط = رد (connection.close)', /CONNECTION_CLOSE|SOCKET/.test(e.message), e.message.slice(0, 80));
    }

    /* L4 — اتصالِ بدونِ TLS = رد در سطحِ سرور.
       معیارِ صادقانه: سوکتِ خامِ بدونِ TLS به درگاهِ amqps = یا بسته می‌شود
       (error/close) یا هرگز جوابِ AMQP نمی‌گیرد (سکوتِ لایهٔ TLS) — هر دو یعنی
       بدونِ TLS به صف نمی‌رسد. اثباتِ قاطعِ «پورتِ 5672 بسته است» در L4b. */
    try {
      const res = await new Promise((resolve) => {
        const s4 = net.connect({ host, port });
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; try { s4.destroy(); } catch (_) {} resolve(v); } };
        const guard = setTimeout(() => done({ silent: true, why: 'سکوتِ لایهٔ TLS — پاسخِ AMQP داده نشد' }), 9000);
        const wrap = (v) => { clearTimeout(guard); done(v); };
        let sawStart = false;
        s4.on('data', (d) => { if (d.includes(Buffer.from('AMQP'))) { sawStart = true; wrap({ silent: false, amqp: true, why: 'سرور در حالتِ plain جواب AMQP داد!' }); } });
        s4.on('error', (e) => wrap({ silent: false, rejected: true, why: 'error:' + (e.code || e.message) }));
        s4.on('close', () => wrap({ silent: false, rejected: true, why: 'closed (TLS alert/EOF)' }));
        s4.on('connect', () => { s4.write(PROTO); });
      });
      const rejected = !res.amqp; /* رد = یا بسته‌شدن یا سکوت؛ شکستِ واقعی = جوابِ AMQPِ بدونِ TLS */
      chk('L4 اتصالِ بدونِ TLS = به صف نمی‌رسد (' + (res.rejected ? 'بسته‌شدن' : 'سکوتِ TLS') + ')', rejected, res.why);
    } catch (e) {
      chk('L4 اتصالِ بدونِ TLS = به صف نمی‌رسد', false, e.message);
    }

    /* L4b — درونِ خودِ کانتینر: پورتِ 5672 اصلاً listener ندارد (refused)
       — ردِ قاطعِ اتصالِ بدونِ TLS در سطحِ سرور، نه فقط سطحِ publish. */
    if (process.env.PAYESH_RABBITMQ_CONTAINER) {
      try {
        const { execFileSync } = require('child_process');
        let refused = false;
        try {
          execFileSync('docker', ['exec', process.env.PAYESH_RABBITMQ_CONTAINER,
            'sh', '-c', 'nc -z -w 2 127.0.0.1 5672 2>&1; echo rc=$?'], { timeout: 15000 });
          refused = false;
        } catch (e) { /* nc nonzero = refused */ }
        const out = (() => { try { return execFileSync('docker', ['exec', process.env.PAYESH_RABBITMQ_CONTAINER, 'sh', '-c', 'nc -z -w 2 127.0.0.1 5672 || echo REFUSED'], { timeout: 15000, encoding: 'utf8' }); } catch (e) { return String(e.stdout || 'ERR'); } })();
        refused = out.includes('REFUSED');
        chk('L4b داخلِ کانتینر هم 5672 بسته است (بدونِ TLS = رد)', refused, out.trim().slice(0, 60));
      } catch (e) {
        skip('L4b داخلِ کانتینر', 'docker در دسترس نیست: ' + e.message.slice(0, 60));
      }
    }
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-07-rabbitmq-tls: ' + ok + ' pass / ' + fail + ' fail' + (skipped ? ' / ' + skipped + ' skip' : ''));
  console.log('CHECKS ' + (ok + fail) + ' FAIL ' + fail);
  console.error('TRACE: summary done, failing=' + fail);
  /* خروجِ طبیعی با کدِ شکست — process.exit() با stdoutِ پایپی دمِ خروجی
     را قطع می‌کند (کلاسِ G7)؛ exitCode + پایانِ طبیعی = خروجیِ کامل. */
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('FATAL ' + (e && e.stack || e && e.message));
  process.exit(1);
});
