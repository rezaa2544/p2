#!/usr/bin/env node
/* docs-metadata.js — استخراج متادیتای کاتالوگ مستندات + نمایهٔ جستجو (چت ۶، مأموریت ۳۲)
 * خروجی‌ها (تولیدی و gitignore): docs/_metadata.json و docs/_search-index.json
 * اجرا: node tools/docs-metadata.js   — یا require برای استفادهٔ برنامه‌ای در تست‌ها
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const LIVE = new Set(['DOCS_HEALTH_REPORT.md', 'DOCS_CONSISTENCY_REPORT.md', 'SECURITY_INCIDENT_LOG.md']);
const META_OUT = path.join(DOCS, '_metadata.json');
const INDEX_OUT = path.join(DOCS, '_search-index.json');

/** همهٔ اسناد کاتالوگ: ریشه + زیرپوشه‌ها (بدون فایل‌های تولیدی با پیشوند زیرخط) */
function listDocs() {
  const out = [];
  for (const f of fs.readdirSync(DOCS)) {
    if (f.endsWith('.md') && !f.startsWith('_')) out.push(f);
  }
  for (const sub of fs.readdirSync(DOCS)) {
    const p = path.join(DOCS, sub);
    if (!fs.statSync(p).isDirectory() || sub.startsWith('_')) continue;
    for (const f of fs.readdirSync(p)) {
      if (f.endsWith('.md') && !f.startsWith('_')) out.push(path.join(sub, f));
    }
  }
  return out.sort();
}

/** عنوان (نخستین H1) */
function titleOf(text, rel) {
  const m = text.match(/^# (.+)$/m);
  return m ? m[1].trim() : path.basename(rel, '.md');
}

/** مالک از سربرگ سند (مالک سند / مالک / مالک انتشار) */
function ownerOf(text) {
  const head = text.split('\n').slice(0, 8).join('\n');
  const m = head.match(/مالک(?:\s+سند|\s+انتشار)?[:：]\s*([^\n|]+)/);
  if (!m) return 'سیستمی/نامشخص';
  const raw = m[1].trim();
  const chat = raw.match(/چت\s+[۰-۹0-9]+/);
  if (chat) return chat[0].replace(/\s+/g, ' ');
  if (/ناظر/.test(raw)) return 'ناظر';
  if (/کارفرما/.test(raw)) return 'کارفرما';
  return 'سیستمی/نامشخص';
}

/** نگاشت فایل → دسته/وضعیت از نمایه (پارس §۲) + فایل → مالک از §۴ */
function parseIndex() {
  const text = fs.readFileSync(path.join(DOCS, 'DOCS_INDEX.md'), 'utf8');
  const cat = {};
  const owners = {};
  let section = null, inArchive = false, inOwn = false;
  for (const line of text.split('\n')) {
    if (/^## ۴\) نقشهٔ مالکیت/.test(line)) { inOwn = true; section = null; continue; }
    if (inOwn && /^## /.test(line) && !/^## ۴\)/.test(line)) inOwn = false;
    if (inOwn && line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3 && /^چت [۰-۹0-9]+|^ناظر/.test(cells[0])) {
        for (const f of (line.match(/`[^`]+\.md`/g) || []).map((t) => t.replace(/`/g, ''))) owners[f] = cells[0];
      }
      continue;
    }
    const h = line.match(/^### ۲\.(\S+)\s+(.*)$/);
    if (h) { section = '۲.' + h[1] + ' ' + h[2].trim(); inArchive = /بایگانی/.test(section); continue; }
    if (/^### |^## /.test(line)) { if (!/^### ۲\./.test(line)) { section = null; inArchive = false; } continue; }
    if (!section || !line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2 || /^---/.test(cells[0])) continue;
    const files = [...(line.match(/`[^`]+\.md`/g) || [])].map((t) => t.replace(/`/g, ''));
    const statusCell = cells.slice(2).join(' ');
    for (const f of files) {
      const key = f.includes('/') ? f.replace(/^docs\//, '') : f;
      cat[key] = { category: section, status: inArchive ? 'archived' : (/منجمد|⚪/.test(statusCell) ? 'frozen' : 'active') };
    }
  }
  return { cat, owners };
}

/** مالک جایگزین بر اساس مالکیت موج‌ها در نقشهٔ مالکیت نمایه */
function waveOwner(base) {
  const m = base.match(/^WAVE(\d+)_/);
  if (!m) return null;
  const w = Number(m[1]);
  if ([1, 3, 10].includes(w)) return 'چت ۱';
  if (w === 5) return 'چت ۲';
  if (w === 7) return 'چت ۳';
  if ([6, 9, 11, 12, 14].includes(w)) return 'چت ۴';
  if ([18, 19].includes(w)) return 'چت ۵';
  if (w === 13) return 'چت ۶';
  return null;
}

/** طبقه‌بندی جایگزین برای اسناد بدون ردیف در نمایه (بر الگوی نام فایل) */
function fallbackCategory(rel) {
  const base = rel.replace(/\\/g, '/');
  if (/^RUNBOOK_CARDS\//.test(base)) return 'زیرپوشه: کارت‌های ران‌بورد';
  if (/^user-guides\//.test(base)) return 'زیرپوشه: راهنمای کاربران نهایی';
  if (/^pilot\//.test(base)) return 'زیرپوشه: اسناد پایلوت';
  const f = base.split('/').pop();
  if (/^WAVE\d+_/.test(f)) return 'گزارش موج‌ها (خارج از جدول نمایه)';
  if (/^ARENA\d/.test(f)) return 'گزارش آرنا (خارج از جدول نمایه)';
  if (/^(D\d+_DRAFT|CHAT\d|ROUND)/.test(f)) return 'پیش‌نویس و صورت‌جلسهٔ اولیه';
  if (/^MISSION_\d/.test(f)) return 'گزارش مأموریت';
  return 'عمومی/بدون طبقه در نمایه';
}

/** ارجاع‌های خروجی به اسناد کاتالوگ */
function outgoingOf(text, rel, known) {
  const refs = new Set();
  const pats = [/\]\(([^)\s]+\.md)\)/g, /`([^`\n]+\.md)`/g];
  const self = rel.replace(/\\/g, '/');
  const dir = self.includes('/') ? self.slice(0, self.lastIndexOf('/') + 1) : '';
  for (const re of pats) {
    let m;
    while ((m = re.exec(text)) !== null) {
      let t = m[1].replace(/^docs\//, '').replace(/^\.\//, '');
      if (t.startsWith('../')) continue; // بیرون کاتالوگ (مثلاً ریشهٔ ریپو)
      if (t === self || t === path.basename(self)) continue;
      const candidates = [t, dir + t, path.basename(t)];
      const hit = candidates.find((c) => known.has(c) && c !== self);
      if (hit) refs.add(hit);
    }
  }
  return [...refs].sort();
}

/** توکن‌های کلیدواژه از عنوان فایل + تیترهای H2/H3 */
const STOP_FA = new Set(['آنچه', 'برای', 'چیزی', 'یک', 'های', 'است', 'در', 'به', 'از', 'با', 'که', 'این', 'آن', 'هر', 'نیز', 'باید', 'شده', 'یا', 'تا', 'بر', 'شد', 'همهٔ', 'هیچ', 'بعد', 'قبل', 'پیش', 'پس', 'روی', 'زیر', 'بالا', 'جدول', 'فهرست', 'بخش', 'نسخه', 'تاریخ', 'وضعیت', 'حالت', 'صورت', 'راه', 'کار', 'ها', 'هایش', 'گزارشِ', 'خلاصهٔ', 'نتیجه', 'مورد', 'موارد', 'سایر', 'کل', 'جمع', 'زمانی', 'واقعی', 'نهایی', 'کامل', 'اجرایی', 'جواب', 'گام‌ها', 'بدون', 'کارهای', 'نداد', 'داد', 'شدن', 'نشده', 'می‌شود', 'نباید', 'مربوط', 'مربوطه', 'مختلف', 'جدید', 'فعلی', 'امضا', 'تاریخی', 'جایگزین‌شده', 'شمار', 'قاعدهٔ', 'محتوا', 'راهنمای', 'توضیح', 'یک‌خطی', 'آخرین', 'به‌روزرسانی']);
const STOP_EN = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'v1', 'v2', 'html', 'pdf', 'md', 'json', 'steps']);
function isNoise(w) {
  return /^[\d۰-۹._-]+$/.test(w) || STOP_EN.has(w.toLowerCase()) || STOP_FA.has(w) || w.length < 3;
}
function keywordsOf(text, rel) {
  const toks = new Map();
  const bump = (w, weight) => {
    if (!w || isNoise(w)) return;
    toks.set(w, (toks.get(w) || 0) + weight);
  };
  for (const part of path.basename(rel, '.md').split(/[_\-.]/)) bump(part, 2);
  for (const line of text.split('\n')) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (!h) continue;
    for (const w of h[1].match(/[A-Za-z][A-Za-z0-9+#]{2,}/g) || []) {
      bump(/^[a-z]/.test(w) ? w.toLowerCase() : w, 1);
    }
    for (const w of h[1].match(/[\u0600-\u06FF][\u0600-\u06FF\u200c]{3,}/g) || []) bump(w, 1);
  }
  return [...toks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k]) => k);
}

/** آخرین تغییر از تاریخچهٔ گیت */
function lastModDates() {
  const map = {};
  try {
    const out = execFileSync('git', ['log', '--date=short', '--pretty=format:@@@%cs', '--name-only'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let date = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('@@@')) { date = line.slice(3); continue; }
      const t = line.trim();
      if (t.startsWith('docs/') && t.endsWith('.md') && !map[t]) map[t] = date;
    }
  } catch (e) { /* تاریخچه در دسترس نیست */ }
  return map;
}

function buildCatalog() {
  const files = listDocs();
  const known = new Set(files);
  const { cat: indexMap, owners: indexOwners } = parseIndex();
  const gitDates = lastModDates();
  const entries = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(DOCS, rel), 'utf8');
    const freezeMatch = path.basename(rel).match(/^DOCS_FREEZE_v1\.0\.0-(rc\d+)\.md$/);
    let status, freezeVer;
    if (freezeMatch) { status = 'frozen'; freezeVer = freezeMatch[1]; }
    else if (LIVE.has(path.basename(rel))) { status = 'active-live'; freezeVer = 'مستثنی (زنده)'; }
    else {
      const idx = indexMap[rel] || indexMap[path.basename(rel)];
      status = idx ? idx.status : 'active';
      freezeVer = status === 'archived' ? 'پیش از آرشیو' : 'rc14';
    }
    const idx = indexMap[rel] || indexMap[path.basename(rel)];
    const base = rel.replace(/\\/g, '/').split('/').pop();
    entries.push({
      path: 'docs/' + rel,
      title: titleOf(text, rel),
      category: idx ? idx.category : fallbackCategory(rel),
      owner: ownerOf(text) !== 'سیستمی/نامشخص' ? ownerOf(text)
        : (indexOwners[base] || waveOwner(base) || 'سیستمی/نامشخص'),
      freeze: freezeVer,
      keywords: keywordsOf(text, rel),
      outgoing: outgoingOf(text, rel, known),
      incoming: [], // در دور دوم پر می‌شود
      lastModified: gitDates['docs/' + rel.replace(/\\/g, '/')] || null,
      status,
      indexed: !!idx,
      bytes: Buffer.byteLength(text),
    });
  }
  const byPath = new Map(entries.map((e) => [e.path.replace(/^docs\//, ''), e]));
  for (const e of entries) {
    for (const t of e.outgoing) {
      const te = byPath.get(t);
      if (te && !te.incoming.includes(e.path)) te.incoming.push(e.path);
    }
  }
  for (const e of entries) e.incoming.sort();
  return entries;
}

function buildSearchIndex(entries) {
  const idx = {};
  const add = (tok, e, weight) => {
    if (!tok) return;
    (idx[tok] = idx[tok] || new Map()).set(e.path, ((idx[tok].get(e.path)) || 0) + weight);
  };
  for (const e of entries) {
    for (const part of path.basename(e.path, '.md').split(/[_\-.]/)) { if (!isNoise(part)) add(part, e, 2); }
    for (const w of e.title.match(/[A-Za-z][A-Za-z0-9+#]{2,}|[\u0600-\u06FF][\u0600-\u06FF\u200c]{3,}/g) || []) { if (!isNoise(w)) add(w, e, 3); }
    for (const k of e.keywords) add(k, e, 1);
  }
  const out = {};
  for (const [tok, m] of Object.entries(idx)) {
    out[tok] = [...m.entries()].map(([p, s]) => ({ path: p, score: s })).sort((a, b) => b.score - a.score);
  }
  return out;
}

function summarize(entries) {
  const byCat = {}, byOwner = {}, byStatus = {};
  for (const e of entries) {
    byCat[e.category] = (byCat[e.category] || 0) + 1;
    byOwner[e.owner] = (byOwner[e.owner] || 0) + 1;
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  }
  const orphans = entries.filter((e) => e.incoming.length === 0 && !LIVE.has(path.basename(e.path)));
  const hubs = [...entries].sort((a, b) => b.incoming.length - a.incoming.length).slice(0, 10);
  return { total: entries.length, byCat, byOwner, byStatus, orphans, hubs };
}

if (require.main === module) {
  const entries = buildCatalog();
  const index = buildSearchIndex(entries);
  fs.writeFileSync(META_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total: entries.length, docs: entries }, null, 1), 'utf8');
  fs.writeFileSync(INDEX_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), tokens: Object.keys(index).length, index }, null, 1), 'utf8');
  const s = summarize(entries);
  console.log('docs-metadata: ' + s.total + ' سند فهرست شد · ' + Object.keys(index).length + ' توکن در نمایهٔ جستجو');
  console.log('وضعیت‌ها: ' + Object.entries(s.byStatus).map(([k, v]) => k + '=' + v).join(' · '));
  console.log('یتیم (بدون ارجاع ورودی): ' + (s.orphans.length ? s.orphans.map((o) => o.path).join(', ') : 'هیچ'));
  console.log('قطب‌ها: ' + s.hubs.slice(0, 5).map((h) => path.basename(h.path) + '(' + h.incoming.length + ')').join(' · '));
  console.log('خروجی: ' + path.relative(ROOT, META_OUT) + ' + ' + path.relative(ROOT, INDEX_OUT));
}

module.exports = { buildCatalog, buildSearchIndex, summarize, listDocs, LIVE };
