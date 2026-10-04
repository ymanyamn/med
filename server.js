// MED — Syrian Civil Defense server
// Roles: citizen (public submit) / central (password) / station (code) / admin (link+password).
// SECURITY: no password, station code, OTP or token is EVER sent to an
// unauthenticated client. Public endpoints expose no secrets.
// Links: opaque single-use rotating session links (#/go/<id>), track links (#/track/<id>).
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
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'med-db.json');
// Admin inbox: ONLY this address can receive login links. Configurable via env.
const ADMIN_EMAIL = (process.env.MED_ADMIN_EMAIL || 'redmimhmdov@gmail.com').toLowerCase();
// Admin second factor password ("1992" per spec). ONLY its hash lives here.
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Admin gate password (second factor after the encrypted link). Never sent to clients.
const ADMIN_PASS_HASH = sha256(process.env.MED_ADMIN_PASS || '1992');
const randPass = (n = 10) => crypto.randomBytes(n).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, n) || 'Med' + Date.now().toString(36);
const randTok = (p = '') => p + crypto.randomBytes(24).toString('hex');
const randId = (p = '') => p + crypto.randomBytes(12).toString('hex');

// In-memory session tokens (restart = re-login)
const centralTokens = new Set();
const stationTokens = {}; // token -> centerId
// Opaque rotating entry links: id -> {kind, role, centerId?, exp, used}
const entryLinks = {};
// Field-team tracking: trackId -> {centerId, exp}; positions: centerId -> {lat,lng,acc,at}
const trackLinks = {};
const teamPos = {};

function seedCenters() {
  const mk = (id, name, code, phone, manager, managerPhone, lat, lng, published) =>
    ({ id, name, codeHash: sha256(code), phone, manager, managerPhone, lat, lng, published });
  return [
    mk('c1', 'مركز إدلب المركزي', '1001', '0950000001', 'مدير مركز إدلب', '0950000001', 35.9306, 36.6339, true),
    mk('c2', 'مركز حلب — الأتارب', '1002', '0950000002', 'مدير مركز الأتارب', '0950000002', 36.1372, 36.9733, true),
    mk('c3', 'مركز ريف دمشق — دوما', '1003', '0950000003', 'مدير مركز دوما', '0950000003', 33.5728, 36.4042, true),
    mk('c4', 'مركز حماة — كفرزيتا', '1004', '0950000004', 'مدير مركز كفرزيتا', '0950000004', 35.3742, 36.4832, true),
    mk('c5', 'مركز اللاذقية — الحفة', '1005', '0950000005', 'مدير مركز الحفة', '0950000005', 35.7252, 36.0339, false)
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
    if (c.manager === undefined) c.manager = 'مدير ' + c.name;
    if (c.managerPhone === undefined) c.managerPhone = c.phone || '';
  }
  // First boot: random central password, printed ONLY to server console.
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

// Public view of a center: NEVER code/codeHash. No phones publicly.
const pubCenter = (c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, published: c.published });
const staffCenter = (c) => ({ ...pubCenter(c), phone: c.phone, manager: c.manager, managerPhone: c.managerPhone });
const adminCenter = (c) => ({ ...staffCenter(c), hasCode: !!c.codeHash });

// ---- PUBLIC ----
app.get('/api/centers', (req, res) => res.json(db.centers.filter(c => c.published).map(pubCenter)));

// Citizen submits a report (open). Idempotent by id (offline retry safe).
// Accepts: type, phone, name, desc, count, addr, lat, lng, acc, perms, photo (dataURL<=500KB)
app.post('/api/reports', (req, res) => {
  const b = req.body || {};
  if (!b.phone || !b.type) return res.status(400).json({ error: 'phone+type required' });
  if (b.photo && String(b.photo).length > 700000) return res.status(413).json({ error: 'photo too large' });
  const r = { id: String(b.id || 'r' + Date.now()), createdAt: Date.now(), status: 'new', ...b, id: String(b.id || 'r' + Date.now()) };
  const i = db.reports.findIndex(x => x.id === r.id);
  if (i >= 0) { Object.assign(db.reports[i], r); } else { db.reports.push(r); }
  saveDB(db);
  io.to('central').emit('report', pickReport(db.reports.find(x => x.id === r.id)));
  const saved = db.reports.find(x => x.id === r.id);
  if (saved.centerId) io.to('station:' + saved.centerId).emit('report', saved);
  res.json(saved);
});

// Citizen checks ONLY his own report (must know the phone number used).
// Returns citizen-safe view: status pipeline + assigned center name + manager contact only.
app.get('/api/reports/:id', (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r || (req.query.phone || '') !== r.phone) return res.status(404).json({ error: 'not found' });
  res.json(citizenView(r));
});
function citizenView(r) {
  return {
    id: r.id, type: r.type, status: r.status, createdAt: r.createdAt,
    sentAt: r.sentAt || null, receivedAt: r.receivedAt || null,
    startedAt: r.startedAt || null, finishedAt: r.finishedAt || null,
    centerName: r.centerName || null, centerPhone: r.centerPhone || null,
    centerManager: r.centerManager || null
  };
}

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
app.post('/api/central/logout', need('central', 'admin'), (req, res) => {
  centralTokens.delete(bearer(req));
  res.json({ ok: true });
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
  const b = req.body || {};
  // When central assigns a center, snapshot its public contact (manager) into the report.
  if (b.centerId && (req.role.role === 'central' || req.role.role === 'admin')) {
    const c = db.centers.find(x => x.id === b.centerId);
    if (c) { b.centerName = c.name; b.centerPhone = c.managerPhone || c.phone || ''; b.centerManager = c.manager || ''; }
  }
  Object.assign(r, b, { id: r.id });
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
app.post('/api/station/logout', (req, res) => {
  delete stationTokens[bearer(req)];
  res.json({ ok: true });
});
// Generic session end (called on logout / page close): invalidates any token.
// Entry links are single-use, so reopening requires a freshly minted link.
app.post('/api/session/end', (req, res) => {
  const t = bearer(req) || String((req.body || {}).token || '');
  centralTokens.delete(t);
  delete stationTokens[t];
  if (t && t === db.adminToken) { db.adminToken = null; saveDB(db); }
  res.json({ ok: true });
});

// ---- OPAQUE ROTATING ENTRY LINKS (#/go/<id>) ----
// Only admins can mint staff entry links. Links are single-use, 15-min, and reveal
// nothing in page source (no role/password inside). After a session ends, mint a new one.
app.post('/api/link/issue', need('admin'), (req, res) => {
  const { role, centerId } = req.body || {};
  if (!['central', 'station'].includes(role)) return res.status(400).json({ error: 'role?' });
  if (role === 'station' && !db.centers.find(x => x.id === centerId)) return res.status(400).json({ error: 'center?' });
  const id = randId('L');
  entryLinks[id] = { role, centerId: centerId || null, exp: Date.now() + 15 * 60 * 1000, used: false };
  res.json({ ok: true, id, url: '#/go/' + id });
});
app.post('/api/link/redeem', (req, res) => {
  const { id } = req.body || {};
  const L = entryLinks[id];
  if (!L || L.used || Date.now() > L.exp) return res.status(404).json({ error: 'expired' });
  L.used = true; // single-use: rotated after each session
  const out = { ok: true, role: L.role };
  if (L.centerId) {
    const c = db.centers.find(x => x.id === L.centerId);
    out.center = c ? pubCenter(c) : null;
  }
  res.json(out);
});

// ---- FIELD-TEAM TRACKING (iPad per center, no GPS hardware to buy) ----
// Admin/central mints a track link per center; the team opens it on the iPad and
// presses "بدء بث الموقع". Central watches live markers + mission timer.
app.post('/api/track/issue', need('admin', 'central'), (req, res) => {
  const { centerId } = req.body || {};
  const c = db.centers.find(x => x.id === centerId);
  if (!c) return res.status(400).json({ error: 'center?' });
  const id = randId('T');
  trackLinks[id] = { centerId, exp: Date.now() + 24 * 3600 * 1000 };
  res.json({ ok: true, trackId: id, url: '#/track/' + id, center: pubCenter(c) });
});
app.get('/api/track/info/:id', (req, res) => {
  const T = trackLinks[req.params.id];
  if (!T || Date.now() > T.exp) return res.status(404).json({ error: 'expired' });
  const c = db.centers.find(x => x.id === T.centerId);
  res.json({ ok: true, center: c ? pubCenter(c) : null });
});
app.post('/api/track/ping', (req, res) => {
  const { trackId, lat, lng, acc } = req.body || {};
  const T = trackLinks[trackId];
  if (!T || Date.now() > T.exp) return res.status(404).json({ error: 'expired' });
  if (!isFinite(+lat) || !isFinite(+lng)) return res.status(400).json({ error: 'coords?' });
  teamPos[T.centerId] = { lat: +lat, lng: +lng, acc: Math.round(+acc || 0), at: Date.now() };
  io.to('central').emit('team-pos', { centerId: T.centerId, ...teamPos[T.centerId] });
  io.to('admin').emit('team-pos', { centerId: T.centerId, ...teamPos[T.centerId] });
  res.json({ ok: true });
});
app.get('/api/track', need('central', 'admin', 'station'), (req, res) => {
  if (req.role.role === 'station') {
    const cid = req.role.centerId;
    return res.json(teamPos[cid] ? [{ centerId: cid, ...teamPos[cid] }] : []);
  }
  res.json(Object.entries(teamPos).map(([centerId, p]) => ({ centerId, ...p })));
});

// ---- ADMIN (magic link to inbox + password 1992) ----
// Step 1: request link. Generic reply; real link only logged/emailed for the inbox.
app.post('/api/admin/request-link', (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    return res.json({ ok: true, message: 'إن كان البريد مسجلاً ستصلك رسالة دخول' });
  }
  const id = randId('A');
  entryLinks[id] = { role: 'admin-link', exp: Date.now() + 15 * 60 * 1000, used: false };
  // PRODUCTION: email `#/go/${id}` to ADMIN_EMAIL via SMTP here.
  console.log(`[MED] admin magic link: #/go/${id} (valid 15min, single-use)`);
  res.json({ ok: true, message: 'تم إرسال رابط الدخول المشفر إلى بريد المدير' });
});
// Step 2: open magic link -> redeem -> password prompt -> unlock.
app.post('/api/admin/unlock', (req, res) => {
  const { linkId, password } = req.body || {};
  const L = entryLinks[linkId];
  if (!L || L.role !== 'admin-link' || L.used || Date.now() > L.exp) {
    return res.status(401).json({ error: 'رابط غير صالح — اطلب رابطاً جديداً' });
  }
  if (!password || sha256(password) !== ADMIN_PASS_HASH) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
  L.used = true;
  db.adminToken = randTok('adm-');
  db.otps = {};
  saveDB(db);
  res.json({ ok: true, adminToken: db.adminToken });
});
// Legacy OTP endpoints kept as aliases (same inbox-only behavior: no code in reply).
app.post('/api/admin/request-code', (req, res) => {
  const { email } = req.body || {};
  if ((email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    return res.json({ ok: true, pendingId: null, message: 'إن كان البريد مسجلاً ستصلك رسالة دخول' });
  }
  const pendingId = randTok('p-');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otps[pendingId] = { code, exp: Date.now() + 10 * 60 * 1000 };
  console.log(`[MED] admin OTP pendingId=${pendingId} code=${code} (inbox only)`);
  res.json({ ok: true, pendingId, message: 'تم إرسال الكود إلى بريد المدير' });
});
app.post('/api/admin/verify', (req, res) => {
  const { pendingId, code } = req.body || {};
  const rec = db.otps[pendingId];
  if (!rec || rec.code !== String(code || '').trim()) return res.status(401).json({ error: 'كود غير صحيح' });
  if (Date.now() > rec.exp) return res.status(400).json({ error: 'انتهت الصلاحية — اطلب كوداً جديداً' });
  db.adminToken = randTok('adm-');
  db.otps = {};
  saveDB(db);
  res.json({ ok: true, adminToken: db.adminToken });
});
app.post('/api/admin/logout', need('admin'), (req, res) => {
  db.adminToken = null; saveDB(db);
  res.json({ ok: true });
});
app.get('/api/admin/centers', need('admin'), (req, res) => res.json(db.centers.map(adminCenter)));
app.post('/api/admin/centers', need('admin'), (req, res) => {
  const { name, code, phone, manager, managerPhone, lat, lng, published } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'الاسم والرمز مطلوبان' });
  const c = { id: 'c' + Date.now(), name, codeHash: sha256(code), phone: phone || '', manager: manager || ('مدير ' + name), managerPhone: managerPhone || phone || '', lat: +lat || 35.5, lng: +lng || 36.3, published: published !== false };
  db.centers.push(c); saveDB(db);
  res.json(adminCenter(c));
});
app.put('/api/admin/centers/:id', need('admin'), (req, res) => {
  const c = db.centers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const { name, code, phone, manager, managerPhone, lat, lng, published } = req.body || {};
  if (name !== undefined) c.name = name;
  if (phone !== undefined) c.phone = phone;
  if (manager !== undefined) c.manager = manager;
  if (managerPhone !== undefined) c.managerPhone = managerPhone;
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
});

function pickReport(r) { return r; }

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MED running on :${PORT}`));
