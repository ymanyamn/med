// MED — Syrian Civil Defense server
// Roles: citizen (public submit) / central (password) / station (code) / admin (email OTP).
// SECURITY: no password, station code, OTP or magic token is EVER sent to an
// unauthenticated client. Public endpoints expose no secrets.
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
// Admin inbox: ONLY this address can receive login codes. Configurable via env.
const ADMIN_EMAIL = (process.env.MED_ADMIN_EMAIL || 'redmimhmdov@gmail.com').toLowerCase();

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randPass = (n = 10) => crypto.randomBytes(n).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, n) || 'Med' + Date.now().toString(36);
const randTok = (p = '') => p + crypto.randomBytes(24).toString('hex');

// In-memory session tokens (restart = re-login)
const centralTokens = new Set();
const stationTokens = {}; // token -> centerId

function seedCenters() {
  const mk = (id, name, code, phone, lat, lng, published) =>
    ({ id, name, codeHash: sha256(code), phone, lat, lng, published });
  return [
    mk('c1', 'مركز إدلب المركزي', '1001', '0950000001', 35.9306, 36.6339, true),
    mk('c2', 'مركز حلب — الأتارب', '1002', '0950000002', 36.1372, 36.9733, true),
    mk('c3', 'مركز ريف دمشق — دوما', '1003', '0950000003', 33.5728, 36.4042, true),
    mk('c4', 'مركز حماة — كفرزيتا', '1004', '0950000004', 35.3742, 36.4832, true),
    mk('c5', 'مركز اللاذقية — الحفة', '1005', '0950000005', 35.7252, 36.0339, false)
  ];
}

function loadDB() {
  let db = null;
  try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
  if (!db || !db.centers) {
    db = { centers: seedCenters(), reports: [], loclog: [], settings: {}, otps: {} };
  }
  // Migrate legacy plaintext secrets -> hashes (then they never touch disk again)
  db.settings = db.settings || {};
  if (db.settings.centralPassword && !db.settings.centralHash) {
    db.settings.centralHash = sha256(db.settings.centralPassword);
    delete db.settings.centralPassword;
  }
  for (const c of db.centers) {
    if (c.code && !c.codeHash) { c.codeHash = sha256(c.code); delete c.code; }
  }
  // First boot: random central password, printed ONLY to server console.
  // The admin must change it and hand it privately to operations staff.
  if (!db.settings.centralHash) {
    const pw = randPass(10);
    db.settings.centralHash = sha256(pw);
    console.log(`[MED] INITIAL central password (give privately to ops room, then change it): ${pw}`);
  }
  db.reports = db.reports || []; db.loclog = db.loclog || []; db.otps = db.otps || {};
  return db;
}
function saveDB(db) {
  const { otps, ...persist } = db;
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...persist, otps: {} }, null, 2));
}
let db = loadDB();
saveDB(db);

// ---- auth helpers ----
const bearer = (req) => (req.headers['x-auth-token'] || req.query.token || '').toString();
function roleOf(req) {
  const t = bearer(req);
  if (!t) return null;
  if (t === db.adminToken && t) return { role: 'admin' };
  if (centralTokens.has(t)) return { role: 'central' };
  if (stationTokens[t]) return { role: 'station', centerId: stationTokens[t] };
  return null;
}
const need = (...roles) => (req, res, next) => {
  const r = roleOf(req);
  if (!r || !roles.includes(r.role)) return res.status(401).json({ error: 'unauthorized' });
  req.role = r; next();
};

// Public view of a center: NEVER code/codeHash. Phone only for staff.
const pubCenter = (c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, published: c.published });
const staffCenter = (c) => ({ ...pubCenter(c), phone: c.phone });
const adminCenter = (c) => ({ ...staffCenter(c), hasCode: !!c.codeHash });

// ---- PUBLIC ----
app.get('/api/centers', (req, res) => res.json(db.centers.filter(c => c.published).map(pubCenter)));

// Citizen submits a report (open). Idempotent by id (offline retry safe).
app.post('/api/reports', (req, res) => {
  const b = req.body || {};
  if (!b.phone || !b.type) return res.status(400).json({ error: 'phone+type required' });
  const r = { id: String(b.id || 'r' + Date.now()), createdAt: Date.now(), status: 'new', ...b, id: String(b.id || 'r' + Date.now()) };
  const i = db.reports.findIndex(x => x.id === r.id);
  if (i >= 0) { Object.assign(db.reports[i], r); } else { db.reports.push(r); }
  saveDB(db);
  io.to('central').emit('report', r);
  if (r.centerId) io.to('station:' + r.centerId).emit('report', r);
  res.json(r);
});

// Citizen checks ONLY his own report (must know the phone number used).
app.get('/api/reports/:id', (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r || (req.query.phone || '') !== r.phone) return res.status(404).json({ error: 'not found' });
  res.json(r);
});

// ---- CENTRAL (password, verified server-side) ----
app.post('/api/central/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || sha256(password) !== db.settings.centralHash) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
  const t = randTok('ct-'); centralTokens.add(t);
  res.json({ ok: true, token: t });
});
app.get('/api/central/centers', need('central', 'admin'), (req, res) => res.json(db.centers.map(staffCenter)));
app.get('/api/reports', need('central', 'station', 'admin'), (req, res) => {
  let list = db.reports;
  if (req.role.role === 'station') list = list.filter(r => r.centerId === req.role.centerId);
  res.json(list.slice().reverse().slice(0, 200));
});
app.patch('/api/reports/:id', need('central', 'station', 'admin'), (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  if (req.role.role === 'station' && r.centerId !== req.role.centerId) return res.status(403).json({ error: 'forbidden' });
  Object.assign(r, req.body || {}, { id: r.id });
  saveDB(db);
  io.to('central').emit('report-update', r);
  if (r.centerId) io.to('station:' + r.centerId).emit('report-update', r);
  res.json(r);
});

// ---- STATION (center code, verified server-side) ----
app.post('/api/station/login', (req, res) => {
  const { centerId, code } = req.body || {};
  const c = db.centers.find(x => x.id === centerId);
  if (!c || !code || sha256(code) !== c.codeHash) {
    return res.status(401).json({ error: 'رمز المحطة غير صحيح' });
  }
  const t = randTok('st-'); stationTokens[t] = c.id;
  res.json({ ok: true, token: t, center: staffCenter(c) });
});

// ---- ADMIN (email OTP + magic link; secrets only via the inbox/stdout) ----
app.post('/api/admin/request-code', (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    // Generic reply: do not reveal which address is valid.
    return res.json({ ok: true, pendingId: null, message: 'إن كان البريد مسجلاً ستصلك رسالة دخول' });
  }
  const pendingId = randTok('p-');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = 'MED-' + Buffer.from(`${ADMIN_EMAIL}|${Date.now()}|${crypto.randomBytes(8).toString('hex')}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  db.otps[pendingId] = { code, token, exp: Date.now() + 10 * 60 * 1000 };
  // TEST MODE: printed to server console only — NEVER returned to the browser.
  // PRODUCTION: send `code` + link `#/admin-<token>` via SMTP to ADMIN_EMAIL here.
  console.log(`[MED] admin OTP pendingId=${pendingId} code=${code} magic=#/admin-${token}`);
  res.json({ ok: true, pendingId, message: 'تم إرسال الكود إلى بريد المدير' });
});
app.post('/api/admin/verify', (req, res) => {
  const { pendingId, code, token } = req.body || {};
  let rec = null;
  if (token) {
    const tk = String(token).replace(/^#\/admin-/, '').replace(/^admin-/, '');
    rec = Object.values(db.otps).find(o => o.token.replace(/^MED-/, '') === tk.replace(/^MED-/, ''));
  } else if (pendingId && code) {
    rec = db.otps[pendingId];
    if (rec && rec.code !== String(code).trim()) rec = null;
  }
  if (!rec) return res.status(401).json({ error: 'كود أو رابط غير صحيح' });
  if (Date.now() > rec.exp) return res.status(400).json({ error: 'انتهت الصلاحية — اطلب كوداً جديداً' });
  db.adminToken = randTok('adm-');
  db.otps = {}; // single-use: invalidate all pending
  saveDB(db);
  res.json({ ok: true, adminToken: db.adminToken });
});
app.get('/api/admin/centers', need('admin'), (req, res) => res.json(db.centers.map(adminCenter)));
app.post('/api/admin/centers', need('admin'), (req, res) => {
  const { name, code, phone, lat, lng, published } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'الاسم والرمز مطلوبان' });
  const c = { id: 'c' + Date.now(), name, codeHash: sha256(code), phone: phone || '', lat: +lat || 35.5, lng: +lng || 36.3, published: published !== false };
  db.centers.push(c); saveDB(db);
  res.json(adminCenter(c));
});
app.put('/api/admin/centers/:id', need('admin'), (req, res) => {
  const c = db.centers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const { name, code, phone, lat, lng, published } = req.body || {};
  if (name !== undefined) c.name = name;
  if (phone !== undefined) c.phone = phone;
  if (lat !== undefined) c.lat = +lat;
  if (lng !== undefined) c.lng = +lng;
  if (published !== undefined) c.published = !!published;
  if (code) c.codeHash = sha256(code); // rotate code; hand it privately to the station
  saveDB(db); res.json(adminCenter(c));
});
app.delete('/api/admin/centers/:id', need('admin'), (req, res) => {
  db.centers = db.centers.filter(x => x.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.post('/api/admin/central-password', need('admin'), (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'كلمة من 6 أحرف على الأقل' });
  db.settings.centralHash = sha256(newPassword);
  for (const t of [...centralTokens]) centralTokens.delete(t); // force re-login
  saveDB(db); res.json({ ok: true });
});
app.get('/api/loclog', need('admin'), (req, res) => res.json((db.loclog || []).slice(-200)));
app.post('/api/loclog', (req, res) => {
  db.loclog = (db.loclog || []).concat({ ...req.body, at: Date.now() }).slice(-500);
  saveDB(db); res.json({ ok: true });
});

// ---- sockets: staff-only channels ----
io.on('connection', (s) => {
  s.on('auth', (m = {}) => {
    if (m.adminToken && m.adminToken === db.adminToken && m.adminToken) { s.join('central'); s.join('admin'); s.data.authed = true; }
    if (m.centralToken && centralTokens.has(m.centralToken)) { s.join('central'); s.data.authed = true; }
    if (m.stationToken && stationTokens[m.stationToken]) { s.join('station:' + stationTokens[m.stationToken]); s.data.authed = true; }
    if (s.data.authed) s.emit('auth-ok', { ok: true });
  });
  // Legacy citizen emit is disabled: citizens use HTTP POST (open) so reports
  // are never broadcast to anonymous sockets.
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MED running on :${PORT}`));
