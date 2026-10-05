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
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; }

// ---- Email (SMTP) ----
// Configure on Render: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (+ SMTP_FROM, APP_BASE_URL).
// Without SMTP the server logs the link and (dev only) returns it for testing.
function mailConfig() {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!nodemailer || !host || !user || !pass) return null;
  const port = +(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')) === 'true';
  return { host, port, secure, user, pass, from: process.env.SMTP_FROM || user };
}
function appBaseUrl(req) {
  const env = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (env) return env;
  const proto = (req && req.headers && req.headers['x-forwarded-proto']) || req.protocol || 'http';
  const host = (req && req.get && req.get('host')) || ('localhost:' + (process.env.PORT || 3000));
  return `${proto}://${host}`;
}
async function sendMail(to, subject, html) {
  const cfg = mailConfig();
  if (!cfg) return { sent: false, reason: 'no-smtp' };
  try {
    const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass } });
    await t.sendMail({ from: cfg.from, to, subject, html });
    return { sent: true };
  } catch (e) {
    console.log('[MED] SMTP send failed:', e && e.message);
    return { sent: false, reason: 'smtp-error: ' + (e && e.message) };
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'med-db.json');
// Admin inbox: ONLY this address can receive login links. Configurable via env.
const ADMIN_EMAIL = (process.env.MED_ADMIN_EMAIL || 'redmimhmdov@gmail.com').toLowerCase();

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Admin gate password (second factor after the encrypted link). Never sent to clients.
const ADMIN_PASS_HASH = sha256(process.env.MED_ADMIN_PASS || '1992');
const randPass = (n = 10) => crypto.randomBytes(n).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, n) || 'Med' + Date.now().toString(36);
const randTok = (p = '') => p + crypto.randomBytes(24).toString('hex');

// In-memory session tokens (restart = re-login)
const centralTokens = new Set();
const stationTokens = {}; // token -> centerId

function seedCenters() {
  const mk = (id, name, code, phone, lat, lng, published) =>
    ({ id, name, codeHash: sha256(code), phone, lat, lng, published, managerName: '', managerPhone: '', trackHash: null });
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
  // Operator-defined password wins (e.g. Render env MED_CENTRAL_PASSWORD).
  // Set it once in your hosting dashboard and the room password is known.
  if (process.env.MED_CENTRAL_PASSWORD && String(process.env.MED_CENTRAL_PASSWORD).length >= 6) {
    db.settings.centralHash = sha256(String(process.env.MED_CENTRAL_PASSWORD));
    console.log('[MED] central password taken from MED_CENTRAL_PASSWORD env');
  }
  // First boot: random central password, printed ONLY to server console.
  // The admin must change it and hand it privately to operations staff.
  if (!db.settings.centralHash) {
    const pw = randPass(10);
    db.settings.centralHash = sha256(pw);
    console.log(`[MED] INITIAL central password (give privately to ops room, then change it): ${pw}`);
  }
  db.reports = db.reports || []; db.loclog = db.loclog || []; db.otps = db.otps || {};
  db.adminLinks = db.adminLinks || {}; // token -> {exp} single-use, rotated after each session
  db.tracks = db.tracks || {}; // centerId -> {lat,lng,at}
  return db;
}
function saveDB(db) {
  const { otps, adminLinks, ...persist } = db;
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...persist, otps: {}, adminLinks: {} }, null, 2));
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
const staffCenter = (c) => ({ ...pubCenter(c), phone: c.phone, managerName: c.managerName || '', managerPhone: c.managerPhone || '' });
const adminCenter = (c) => ({ ...staffCenter(c), hasCode: !!c.codeHash, hasTrack: !!c.trackHash });

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

// Citizen contact card: ONLY after dispatch, ONLY with the report phone.
app.get('/api/reports/:id/contact', (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r || (req.query.phone || '') !== r.phone || !r.centerId) return res.status(404).json({ error: 'not found' });
  const c = db.centers.find(x => x.id === r.centerId);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ centerName: c.name, managerName: c.managerName || '', managerPhone: c.managerPhone || c.phone || '' });
});

// ---- TEAM TRACKING (iPad per station, no GPS hardware) ----
// iPad opens /#/track-<token>, shares position; central/admin watch live.
app.post('/api/track', (req, res) => {
  const { token, lat, lng } = req.body || {};
  if (!token || lat === undefined || lng === undefined) return res.status(400).json({ error: 'bad' });
  const c = db.centers.find(x => x.trackHash && x.trackHash === sha256(String(token)));
  if (!c) return res.status(401).json({ error: 'unauthorized' });
  db.tracks[c.id] = { lat: +lat, lng: +lng, at: Date.now() };
  saveDB(db);
  io.to('central').emit('team-track', { centerId: c.id, ...db.tracks[c.id] });
  res.json({ ok: true });
});
app.get('/api/teams/track', need('central', 'admin'), (req, res) => {
  res.json(db.centers.map(c => ({ centerId: c.id, name: c.name, ...(db.tracks[c.id] || { lat: null, lng: null, at: 0 }) })));
});
app.post('/api/central/login', (req, res) => {
  // ---- CENTRAL (password, verified server-side) ----
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

// ---- ADMIN: encrypted single-use link (emailed) + gate password ----
app.get('/api/admin/status', (req, res) => {
  res.json({ emailConfigured: !!mailConfig() });
});
app.post('/api/admin/request-link', async (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    return res.json({ ok: true, message: 'إن كان البريد مسجلاً ستصلك رسالة دخول' });
  }
  const token = 'A-' + crypto.randomBytes(24).toString('hex');
  db.adminLinks[token] = { exp: Date.now() + 30 * 60 * 1000 };
  const linkUrl = appBaseUrl(req) + '/#/a-' + token;
  console.log(`[MED] admin magic link: #/a-${token} (valid 30 min, single-use, rotated after session)`);
  const mail = await sendMail(ADMIN_EMAIL, 'رابط دخول لوحة تحكم MED',
    `<div dir="rtl" style="font-family:Tahoma"><h3>الدفاع المدني السوري — MED</h3><p>رابط الدخول المشفر (صالح 30 دقيقة، لمرة واحدة):</p><p><a href="${linkUrl}">${linkUrl}</a></p><p>بعد فتح الرابط أدخل كلمة مرور اللوحة.</p></div>`);
  if (mail.sent) {
    return res.json({ ok: true, emailed: true, message: 'تم إرسال الرابط المشفر إلى بريدك — تفقد البريد (وصندوق الرسائل غير المرغوبة)' });
  }
  const dev = process.env.ALLOW_DEV_LINK === 'true' || !mailConfig();
  return res.json({
    ok: true, emailed: false,
    message: dev
      ? 'خادم البريد غير مضبوط — وضع التجربة: انسخ الرابط بالأسفل (لن يظهر في الإنتاج بعد ضبط SMTP)'
      : 'تعذر إرسال البريد حالياً (' + (mail.reason || '') + ') — راجع سجل الخادم أو إعدادات SMTP',
    ...(dev ? { devLink: '#/a-' + token, devUrl: linkUrl } : {})
  });
});
app.post('/api/admin/enter', (req, res) => {
  const { token, password } = req.body || {};
  const tk = String(token || '').replace(/^#\/a-/, '').replace(/^a-/, 'A-');
  const norm = tk.startsWith('A-') ? tk : null;
  const rec = norm && db.adminLinks[norm];
  if (!rec) return res.status(401).json({ error: 'رابط غير صالح — اطلب رابطاً جديداً' });
  if (Date.now() > rec.exp) { delete db.adminLinks[norm]; return res.status(400).json({ error: 'انتهت صلاحية الرابط' }); }
  if (!password || sha256(String(password)) !== ADMIN_PASS_HASH) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  delete db.adminLinks[norm]; // single-use: link dies when the session starts
  db.adminToken = randTok('adm-');
  db.otps = {};
  saveDB(db);
  res.json({ ok: true, adminToken: db.adminToken });
});
app.post('/api/admin/request-code', async (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    // Generic reply: do not reveal which address is valid.
    return res.json({ ok: true, pendingId: null, message: 'إن كان البريد مسجلاً ستصلك رسالة دخول' });
  }
  const pendingId = randTok('p-');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = 'MED-' + Buffer.from(`${ADMIN_EMAIL}|${Date.now()}|${crypto.randomBytes(8).toString('hex')}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  db.otps[pendingId] = { code, token, exp: Date.now() + 10 * 60 * 1000 };
  console.log(`[MED] admin OTP pendingId=${pendingId} code=${code} magic=#/admin-${token}`);
  const mail = await sendMail(ADMIN_EMAIL, 'كود دخول لوحة تحكم MED',
    `<div dir="rtl" style="font-family:Tahoma"><h3>الدفاع المدني السوري — MED</h3><p>كود الدخول (صالح 10 دقائق): <b style="font-size:22px">${code}</b></p></div>`);
  if (mail.sent) {
    return res.json({ ok: true, pendingId, emailed: true, message: 'تم إرسال الكود إلى بريدك — تفقد البريد (وصندوق الرسائل غير المرغوبة)' });
  }
  const dev = process.env.ALLOW_DEV_LINK === 'true' || !mailConfig();
  return res.json({
    ok: true, pendingId, emailed: false,
    message: dev ? 'خادم البريد غير مضبوط — وضع التجربة: الكود بالأسفل' : 'تعذر إرسال البريد حالياً — راجع إعدادات SMTP',
    ...(dev ? { devCode: code } : {})
  });
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
  const { name, code, phone, lat, lng, published, managerName, managerPhone } = req.body || {};
  if (name !== undefined) c.name = name;
  if (phone !== undefined) c.phone = phone;
  if (managerName !== undefined) c.managerName = String(managerName);
  if (managerPhone !== undefined) c.managerPhone = String(managerPhone);
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
app.post('/api/admin/centers/:id/track-token', need('admin'), (req, res) => {
  const c = db.centers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  // Shown ONCE to the admin; hand it to the station iPad privately.
  // Only the hash is stored; the iPad link is #/track-<token>.
  const token = 'T-' + crypto.randomBytes(18).toString('hex');
  c.trackHash = sha256(token);
  saveDB(db);
  res.json({ ok: true, token, link: `#/track-${token}` });
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
