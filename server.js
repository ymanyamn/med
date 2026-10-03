// MED — Syrian Civil Defense server
// Serves PWA + realtime relay (Socket.io) + admin OTP + JSON file DB
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'med-db.json');
const ADMIN_EMAIL = 'redmimhmdov@gmail.com';

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {}
  return {
    centers: [
      { id: 'c1', name: 'مركز إدلب المركزي', code: '1001', phone: '0950000001', lat: 35.9306, lng: 36.6339, published: true },
      { id: 'c2', name: 'مركز حلب — الأتارب', code: '1002', phone: '0950000002', lat: 36.1372, lng: 36.9733, published: true },
      { id: 'c3', name: 'مركز ريف دمشق — دوما', code: '1003', phone: '0950000003', lat: 33.5728, lng: 36.4042, published: true },
      { id: 'c4', name: 'مركز حماة — كفرزيتا', code: '1004', phone: '0950000004', lat: 35.3742, lng: 36.4832, published: true },
      { id: 'c5', name: 'مركز اللاذقية — الحفة', code: '1005', phone: '0950000005', lat: 35.7252, lng: 36.0339, published: false }
    ],
    reports: [],
    settings: { centralPassword: 'central123' },
    otps: {} // email -> {code, exp, token}
  };
}
function saveDB(db) {
  const { otps, ...persist } = db;
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...persist, otps: {} }, null, 2));
}
let db = loadDB();

const enc = (s) => Buffer.from(encodeURIComponent(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => { try { return decodeURIComponent(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch { return null; } };

// ---- REST ----
app.get('/api/centers', (req, res) => res.json(db.centers.filter(c => c.published)));
app.get('/api/admin/centers', (req, res) => {
  if (req.headers['x-admin-token'] !== db.adminToken) return res.status(401).json({ error: 'unauthorized' });
  res.json(db.centers);
});
app.get('/api/reports', (req, res) => res.json(db.reports.slice().reverse().slice(0, 200)));

// Background location logs (citizen silent tracking audit)
app.post('/api/loclog', (req, res) => {
  db.loclog = (db.loclog || []).concat({ ...req.body, at: Date.now() }).slice(-500);
  saveDB(db); res.json({ ok: true });
});
app.get('/api/loclog', (req, res) => res.json((db.loclog || []).slice(-200)));

// Admin: step1 request code
// Passwordless: encrypted OTP + hashed secure magic link (#/admin-MED-...).
// Optional Firebase path: replace this handler with Firebase Auth email-link
// (see docs/FIREBASE.md) — Firestore 'incidents' + FCM for instant alerts.
app.post('/api/admin/request-code', (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: 'هذا البريد غير مخوّل' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = 'MED-' + enc(ADMIN_EMAIL + '|' + Date.now() + '|' + crypto.randomBytes(8).toString('hex'));
  db.otps[email.toLowerCase()] = { code, exp: Date.now() + 10 * 60 * 1000, token };
  // In production: send via SMTP. Here: log + return token link, code returned for demo (hide in prod behind SMTP).
  console.log(`[MED] OTP for ${email}: ${code} | link: #/admin-${token}`);
  res.json({ ok: true, message: 'تم إرسال الكود', link: `#/admin-${token}`, demoCode: code, hint: 'نسخة العرض تُظهر الكود هنا. للإنتاج اربط SMTP.' });
});

// Admin: step2 verify
app.post('/api/admin/verify', (req, res) => {
  const { email, code, token } = req.body || {};
  const rec = db.otps[(email || '').toLowerCase()];
  if (!rec) return res.status(400).json({ error: 'اطلب الكود أولاً' });
  if (Date.now() > rec.exp) return res.status(400).json({ error: 'انتهت صلاحية الكود' });
  const linkToken = (token || '').replace(/^#\/admin-/, '').replace(/^admin-/, '');
  const recToken = rec.token.replace(/^MED-/, '');
  if (code !== rec.code || linkToken !== recToken) return res.status(401).json({ error: 'كود أو رابط غير صحيح' });
  db.adminToken = 'adm-' + crypto.randomBytes(16).toString('hex');
  saveDB(db);
  res.json({ ok: true, adminToken: db.adminToken });
});

// Admin CRUD centers
function needAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== db.adminToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}
app.post('/api/admin/centers', needAdmin, (req, res) => {
  const { name, code, phone, lat, lng, published } = req.body || {};
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  const c = { id: 'c' + Date.now(), name, code: code || String(Math.floor(1000 + Math.random() * 9000)), phone: phone || '', lat: +lat || 35.5, lng: +lng || 36.3, published: published !== false };
  db.centers.push(c); saveDB(db); io.emit('centers', db.centers);
  res.json(c);
});
app.put('/api/admin/centers/:id', needAdmin, (req, res) => {
  const c = db.centers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  Object.assign(c, req.body || {}); saveDB(db); io.emit('centers', db.centers);
  res.json(c);
});
app.delete('/api/admin/centers/:id', needAdmin, (req, res) => {
  db.centers = db.centers.filter(x => x.id !== req.params.id);
  saveDB(db); io.emit('centers', db.centers);
  res.json({ ok: true });
});

// Reports relay (also persisted for central deployment)
app.post('/api/reports', (req, res) => {
  const r = { id: 'r' + Date.now(), createdAt: Date.now(), status: 'new', ...req.body };
  db.reports.push(r); saveDB(db); io.emit('report', r);
  res.json(r);
});
app.patch('/api/reports/:id', (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  Object.assign(r, req.body || {}); saveDB(db); io.emit('report-update', r);
  res.json(r);
});

io.on('connection', (s) => {
  s.emit('init', { centers: db.centers, reports: db.reports.slice(-100) });
  s.on('report', (r) => { db.reports.push(r); saveDB(db); io.emit('report', r); });
  s.on('report-update', (r) => {
    const i = db.reports.findIndex(x => x.id === r.id);
    if (i >= 0) db.reports[i] = r; else db.reports.push(r);
    saveDB(db); io.emit('report-update', r);
  });
  s.on('centers', (list) => { db.centers = list; saveDB(db); io.emit('centers', list); });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MED running on :${PORT}`));
