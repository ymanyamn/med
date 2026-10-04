/* MED — Syrian Civil Defense | citizen + central + station + admin */
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('med') : null;
let socket = null;
try { if (window.io) socket = io({ reconnectionAttempts: 3, timeout: 3000 }); } catch { socket = null; }

if (!store.get('med_centers')) store.set('med_centers', [
  // Public directory only: names + coordinates. Codes/phones live ONLY on the server.
  { id: 'c1', name: 'مركز إدلب المركزي', lat: 35.9306, lng: 36.6339, published: true },
  { id: 'c2', name: 'مركز حلب — الأتارب', lat: 36.1372, lng: 36.9733, published: true },
  { id: 'c3', name: 'مركز ريف دمشق — دوما', lat: 33.5728, lng: 36.4042, published: true },
  { id: 'c4', name: 'مركز حماة — كفرزيتا', lat: 35.3742, lng: 36.4832, published: true },
  { id: 'c5', name: 'مركز اللاذقية — الحفة', lat: 35.7252, lng: 36.0339, published: false }
]);
if (!store.get('med_reports')) store.set('med_reports', []);
if (!store.get('med_loclog')) store.set('med_loclog', []);

// ---- session tokens (per role, verified by the server — never trust the client) ----
const sess = {
  get central() { return sessionStorage.getItem('med_central') || null; },
  set central(v) { v ? sessionStorage.setItem('med_central', v) : sessionStorage.removeItem('med_central'); },
  get station() { return sessionStorage.getItem('med_station') || null; },
  set station(v) { v ? sessionStorage.setItem('med_station', v) : sessionStorage.removeItem('med_station'); },
  get admin() { return sessionStorage.getItem('med_admin') || null; },
  set admin(v) { v ? sessionStorage.setItem('med_admin', v) : sessionStorage.removeItem('med_admin'); }
};
function authHeaders(extra = {}) {
  const t = sess.admin || sess.central || sess.station;
  return t ? { ...extra, 'X-Auth-Token': t } : extra;
}
async function AF(url, opts = {}) {
  const o = { ...opts, headers: authHeaders({ 'Content-Type': 'application/json', ...(opts.headers || {}) }) };
  const r = await fetch(url, o);
  if (r.status === 401) { sess.central = sess.station = sess.admin = null; throw new Error('auth'); }
  return r;
}

const getCenters = () => store.get('med_centers', []);
const getReports = () => store.get('med_reports', []);
function saveReport(r) {
  const all = getReports(); const i = all.findIndex(x => x.id === r.id);
  if (i >= 0) all[i] = r; else all.push(r);
  store.set('med_reports', all);
  bc && bc.postMessage({ t: 'report-update', r });
  // Staff edits go through the authenticated API; citizen creates via POST below.
  try { AF('/api/reports/' + r.id, { method: 'PATCH', body: JSON.stringify(r) }).catch(() => {}); } catch {}
  renderAll();
}
// Separate role links: citizen is public; staff/admin/track open ONLY via opaque
// single-use rotating links (#/go/<id>, #/track/<id>) that reveal nothing in page source.
const ROUTES = { citizen: 'citizen', central: 'central', station: 'center', admin: 'admin', track: 'track' };
function paintNav() {
  const staff = sess.central ? 'central' : (sess.station ? 'station' : (sess.admin ? 'admin' : null));
  document.querySelectorAll('#mainNav button').forEach(b => {
    if (!b.dataset.staff) { b.classList.toggle('hidden', !!staff && staff !== 'central' && b.dataset.tab === 'citizen' ? false : false); return; }
    b.classList.toggle('hidden', b.dataset.staff !== staff);
  });
}
function goTab(name, push = true) {
  // Staff tabs are unreachable without their session token (link-gated).
  if ((name === 'central' && !sess.central) || (name === 'center' && !sess.station) || (name === 'admin' && !sess.admin)) name = 'citizen';
  document.querySelectorAll('#mainNav button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  const map = { center: 'tab-center', track: 'tab-track' };
  $(map[name] || ('tab-' + name)).classList.add('active');
  paintNav();
  if (name === 'central') renderCentral();
  if (name === 'center') renderSubSelect();
  if (name === 'admin' && sess.admin) renderAdmin();
  if (push) { try { history.replaceState(null, '', '#/' + (name === 'center' ? 'station' : name)); } catch {} }
  setTimeout(() => { window.dispatchEvent(new Event('resize')); [citMap, centMap, admMap].forEach(m => m && m.invalidateSize()); }, 150);
}
async function route() {
  const h = location.hash || '#/citizen';
  let m;
  if ((m = h.match(/^#\/go\/([A-Za-z0-9_-]+)$/))) { await redeemGo(m[1]); return; }
  if ((m = h.match(/^#\/track\/([A-Za-z0-9_-]+)$/))) { openTrack(m[1]); return; }
  if (h.startsWith('#/admin-') && h.length > 8) { adminLink = h.replace('#/admin-', ''); goTab('admin', false); tryMagic(); return; }
  const key = h.replace('#/', '');
  goTab(ROUTES[key] ? (key === 'station' ? 'center' : key) : 'citizen', false);
}
async function redeemGo(id) {
  try {
    const r = await fetch('/api/link/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then(x => x.json());
    if (!r.ok && r.error) throw 0;
    if (r.role === 'central') { goTab('citizen', false); $('splash').style.display = 'none'; goTab('central', false); $('centralLock').classList.remove('hidden'); $('centralApp').classList.add('hidden'); alert('رابط المركزية صالح — أدخل كلمة مرور الغرفة'); try { history.replaceState(null, '', '#/central'); } catch {} paintNavForce('central'); return; }
    if (r.role === 'station') { if (r.center) { try { const l = await fetch('/api/centers').then(x => x.json()); if (Array.isArray(l)) store.set('med_centers', l); } catch {} } goTab('citizen', false); $('splash').style.display = 'none'; sessionStorage.setItem('med_precenter', (r.center && r.center.id) || ''); goTab('center', false); try { history.replaceState(null, '', '#/station'); } catch {} paintNavForce('station'); const pc = sessionStorage.getItem('med_precenter'); if (pc) { renderSubSelect().then(() => { $('subSelect').value = pc; }); } return; }
    if (r.role === 'admin-link') { adminLinkId = id; goTab('citizen', false); $('splash').style.display = 'none'; goTab('admin', false); $('adminStep1').classList.add('hidden'); $('adminPassCard').classList.remove('hidden'); try { history.replaceState(null, '', '#/admin'); } catch {} return; }
  } catch {}
  goTab('citizen', false);
}
function paintNavForce(role) {
  document.querySelectorAll('#mainNav button').forEach(b => {
    if (!b.dataset.staff) return;
    b.classList.toggle('hidden', b.dataset.staff !== role);
  });
}
function endSession(role) {
  const t = role === 'central' ? sess.central : role === 'station' ? sess.station : sess.admin;
  try { navigator.sendBeacon && navigator.sendBeacon('/api/session/end', JSON.stringify({ token: t })); } catch {}
  try { fetch('/api/session/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }); } catch {}
  if (role === 'central') sess.central = null;
  if (role === 'station') sess.station = null;
  if (role === 'admin') sess.admin = null;
  try { history.replaceState(null, '', '#/citizen'); } catch {}
  goTab('citizen', false);
}
window.addEventListener('pagehide', () => {
  const t = sess.central || sess.station || sess.admin;
  if (t) { try { navigator.sendBeacon && navigator.sendBeacon('/api/session/end', JSON.stringify({ token: t })); } catch {} }
});

/* splash typewriter */
const SENT = 'رجال الدفاع المدني معك أينما تكون';
let ti = 0;
(function type() {
  if (ti <= SENT.length) { $('typewriter').textContent = SENT.slice(0, ti) + (ti < SENT.length ? '▌' : ''); ti++; setTimeout(type, 90); }
  else $('enterBtn').disabled = false;
})();
$('enterBtn').onclick = () => $('splash').style.display = 'none';

/* terminal modal — exact required text */
const termTxt =
`$ whoami
> Designed and Developed by Mohammad Al-Hussein (0952725590)
> M-Code Organization for Technical Development.
> project: MED / Syrian Civil Defense
> status: ACTIVE _`;
function termType() { let i = 0; $('termBody').textContent = ''; (function s() { if (i <= termTxt.length) { $('termBody').textContent = termTxt.slice(0, i); i += 2; setTimeout(s, 12); } })(); }
$('devLink').onclick = () => { $('termOverlay').classList.remove('hidden'); termType(); };
$('devLink2').onclick = () => { $('termOverlay').classList.remove('hidden'); termType(); };
$('termClose').onclick = () => $('termOverlay').classList.add('hidden');
$('termOverlay').onclick = e => { if (e.target.id === 'termOverlay') e.target.classList.add('hidden'); };

/* tabs */
document.querySelectorAll('#mainNav button').forEach(b => b.onclick = () => goTab(b.dataset.tab));
window.addEventListener('hashchange', route);

/* ===== البوابة الذكية: تحليل حر + أقرب مركز + تحقق صامت ===== */
function collectPerms() {
  return {
    geo: !!(manualPos || livePos), acc: (manualPos || livePos || {}).acc ?? null,
    online: navigator.onLine, ts: Date.now()
  };
}
const AI_RULES = [
  { t: 'حريق', k: ['حريق', 'حرق', 'نار', 'دخان', 'لهب', 'انفجار'] },
  { t: 'طبي / إنقاذ', k: ['مصاب', 'إسعاف', 'جريح', 'جرحى', 'حادث سير', 'دهس', 'مريض', 'نجدة', 'عالق', 'إنقاذ', 'ساعد'] },
  { t: 'انهيار مبنى', k: ['انهيار', 'أنقاض', 'بناء ساقط', 'بناية', 'سقوط مبنى', 'تحت الردم'] },
  { t: 'كوارث طبيعية', k: ['زلزال', 'هزة', 'فيضان', 'سيول', 'غرق', 'عاصفة', 'كارثة', 'انهيار أرضي'] }
];
function aiDetect(text) {
  for (const r of AI_RULES) if (r.k.some(k => text.includes(k))) return r.t;
  if (/(بلاغ|حادث|طوارئ|كارثة|نجدة|مساعدة|خطر)/.test(text)) return 'حادث عام';
  return null;
}
function matchCenter(lat, lng, text = '') {
  const cities = ['إدلب', 'حلب', 'الأتارب', 'دمشق', 'دوما', 'حماة', 'كفرزيتا', 'اللاذقية', 'الحفة'];
  const mentioned = cities.filter(c => text.includes(c));
  return getCenters().filter(c => c.published && lat != null).map(c => {
    let km = hav(lng, lat, c.lng, c.lat);
    const hit = mentioned.some(mc => c.name.includes(mc));
    if (hit) km -= 50; // مطابقة الاسم تمنح أفضلية حاسمة
    return { ...c, km, hit };
  }).sort((a, b) => a.km - b.km);
}
$('aiGo').onclick = () => {
  const text = ($('aiInput').value || '').trim();
  if (!text) return alert('اكتب ما يحدث أولاً');
  const type = aiDetect(text) || 'حادث عام';
  repType = type;
  document.querySelectorAll('#catGrid .cat').forEach(x => x.classList.toggle('active', x.dataset.t === type));
  const pos = manualPos || livePos;
  const best = pos ? matchCenter(pos.lat, pos.lng, text)[0] : null;
  window._aiText = text; window._aiBest = best || null;
  $('aiResult').classList.remove('hidden');
  $('aiVerdict').textContent = `تم التعرف: مواطن — نوع البلاغ: ${type}` + (best ? ` — أقرب مركز إليك: ${best.name}` : ' — سيُحدد أقرب مركز عند الإرسال');
  if (text) { $('repDesc').value = text; }
};
$('aiContinue').onclick = () => {
  $('repFormCard').scrollIntoView({ behavior: 'smooth' });
  updateNearHint();
};
function updateNearHint() {
  const pos = manualPos || livePos;
  const text = [$('repDesc').value, $('repAddr').value, window._aiText || ''].join(' ');
  const best = pos ? matchCenter(pos.lat, pos.lng, text)[0] : null;
  if (best) { $('nearHint').classList.remove('hidden'); $('nearHint').innerHTML = `أقرب مركز دفاع مدني إليك: <b>${best.name}</b> (حوالي ${Math.max(0, best.km).toFixed(1)} كم)`; }
}

/* citizen category */
let repType = 'حريق';
document.querySelectorAll('#catGrid .cat').forEach(c => c.onclick = () => {
  document.querySelectorAll('#catGrid .cat').forEach(x => x.classList.remove('active'));
  c.classList.add('active'); repType = c.dataset.t;
});

/* silent background location */
let livePos = store.get('med_lastpos', null), manualPos = null;
function setLocStatus(t) { $('locStatus').textContent = t; }
function logLoc(p, src) {
  const e = { at: Date.now(), lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy || 0), src };
  const log = store.get('med_loclog', []);
  log.push(e);
  store.set('med_loclog', log.slice(-200));
  try { fetch('/api/loclog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) }).catch(() => {}); } catch {}
}
function gateStatus() {
  const parts = [];
  parts.push(livePos ? 'الموقع المباشر: تم الجلب' : 'الموقع المباشر: جارٍ الجلب…');
  parts.push('الأذونات: تُجمع بصمت دون إشعار');
  parts.push(navigator.onLine ? 'الاتصال: متصل' : 'الاتصال: أوفلاين (سيُحفظ البلاغ)');
  $('gateLoc').textContent = parts.join(' • ');
}
function gotPos(p, src) {
  livePos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now(), src };
  store.set('med_lastpos', livePos); logLoc(p, src);
  setLocStatus(`تم تحديد موقعك (${livePos.lat.toFixed(5)}, ${livePos.lng.toFixed(5)}) دقة ±${livePos.acc}م`);
  drawCitMarker(); gateStatus(); updateNearHint();
}
if (navigator.geolocation) {
  try { navigator.geolocation.watchPosition(p => gotPos(p, 'background'), null, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }); } catch {}
  const ask = () => { try { navigator.geolocation.getCurrentPosition(p => gotPos(p, 'gps'), () => fallbackIP(), { enableHighAccuracy: true, timeout: 15000 }); } catch { fallbackIP(); } };
  ask(); setInterval(() => { if (!livePos) ask(); }, 30000);
} else fallbackIP();
async function fallbackIP() {
  try { const r = await fetch('https://ipapi.co/json/').then(r => r.json()); if (r.latitude) gotPos({ coords: { latitude: r.latitude, longitude: r.longitude, accuracy: 5000 } }, 'ip'); } catch { setLocStatus('تعذّر GPS — ثبّت موقعك يدوياً على الخريطة'); }
}

/* maps */
let citMap, centMap, admMap, citMarker;
function mkMap(el, lat, lng, z) {
  const m = L.map(el).setView([lat, lng], z || 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
  return m;
}
setTimeout(() => {
  citMap = mkMap('citMap', (livePos || { lat: 35.93, lng: 36.63 }).lat, (livePos || { lat: 35.93, lng: 36.63 }).lng);
  drawCitMarker();
  citMap.on('click', e => { manualPos = { lat: e.latlng.lat, lng: e.latlng.lng, manual: true }; drawCitMarker(); setLocStatus(`تثبيت يدوي (${manualPos.lat.toFixed(5)}, ${manualPos.lng.toFixed(5)})`); });
}, 500);
function drawCitMarker() {
  if (!citMap) return;
  const p = manualPos || livePos; if (!p) return;
  if (citMarker) citMarker.remove();
  citMarker = L.marker([p.lat, p.lng]).addTo(citMap).bindPopup('موقعك').openPopup();
  citMap.setView([p.lat, p.lng], 14);
}
$('pickBtn').onclick = () => { $('citMap').scrollIntoView({ behavior: 'smooth' }); };

/* citizen SOS */
const STAGES = ['sent', 'received', 'in_progress', 'finished'];
const STAGE_AR = { sent: 'تم الإرسال', received: 'تم الاستلام', in_progress: 'جارية', finished: 'مكتملة' };
const STATUS_AR = { new: 'جديد', confirmed: 'مؤكد', sent: 'مرسل', received: 'مستلم', in_progress: 'جارية', finished: 'منتهية' };
function pipe(r) {
  const idx = STAGES.indexOf(r.status === 'new' || r.status === 'confirmed' ? 'sent' : r.status);
  return `<div class="pipe">${STAGES.map((s, i) => `<span class="${i < idx ? 'on' : (i === idx ? 'cur' : '')}">${STAGE_AR[s]}</span>`).join('<span>←</span>')}</div>`;
}
$('sendRep').onclick = async () => {
  const phone = $('repPhone').value.trim(), desc = $('repDesc').value.trim();
  if (!phone || !desc) return alert('رقم الهاتف ووصف الحالة مطلوبان');
  // Silent verification circle: location + permissions + safety, no scary prompts.
  $('verifyCircle').classList.remove('hidden');
  const mark = (id) => $(id).classList.add('ok');
  $('vGeo').textContent = 'التحقق من الموقع المباشر…';
  $('vPerm').textContent = 'التحقق من الأذونات…';
  $('vSafe').textContent = 'التأكد الدوري من السلامة…';
  await new Promise(r => setTimeout(r, 500));
  const pos = manualPos || livePos;
  $('vGeo').textContent = pos ? `الموقع المباشر مؤكد (±${pos.acc || '?'}م)` : 'تعذر الموقع — سيُرسل بدونه';
  if (pos) mark('vGeo');
  await new Promise(r => setTimeout(r, 500));
  try {
    const pm = await (navigator.permissions ? navigator.permissions.query({ name: 'geolocation' }) : null);
    $('vPerm').textContent = 'الأذونات: الموقع ' + (pm ? pm.state : 'ممنوح');
  } catch { $('vPerm').textContent = 'الأذونات: تم الفحص'; }
  mark('vPerm');
  await new Promise(r => setTimeout(r, 500));
  $('vSafe').textContent = 'تم تفعيل المتابعة الدورية لسلامتك';
  mark('vSafe');
  document.querySelector('.vring').classList.add('done');
  if (!pos && !confirm('لم يتم جلب الموقع بعد. إرسال بدون موقع؟')) return;
  const photo = await readPhoto();
  const r = {
    id: 'r' + Date.now(), type: repType, phone, name: $('repName').value.trim(), desc,
    count: +$('repCount').value || 0, addr: $('repAddr').value.trim(),
    lat: pos?.lat ?? null, lng: pos?.lng ?? null, acc: pos?.acc ?? null,
    perms: collectPerms(), photo: photo || null, aiText: window._aiText || '',
    status: 'new', createdAt: Date.now(), centerId: null, centerName: null,
    reportText: '', casualties: 0, resources: '', notes: '', reportState: 'none'
  };
  runVerify(async () => {
    try { await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }); } catch {}
    const all = getReports(); all.push(r); store.set('med_reports', all);
    bc && bc.postMessage({ t: 'report', r });
    window._myLast = r.id; window._myPhone = phone;
    $('citTrack').innerHTML = `<div class="rep"><b>تم استلام بلاغك — ابقَ هنا لمشاهدة مسار البلاغ (${r.id})</b><div id="citPipe"></div><small>تابع هنا — تتحدث الحالة تلقائياً</small></div>`;
    trackMine();
    $('repDesc').value = '';
  });
};
function readPhoto() {
  return new Promise(res => {
    const f = $('repPhoto') && $('repPhoto').files && $('repPhoto').files[0];
    if (!f) return res(null);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        const s = Math.min(1, 800 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.7));
      } catch { res(null); }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(f);
  });
}
// دائرة التحقق: تأكيد صامت للموقع والأذونات والاتصال دون إشعار المستخدم
function runVerify(done) {
  const ov = $('verifyOverlay');
  ov.classList.remove('hidden');
  const steps = ['التأكد من الموقع المباشر…', 'التأكد من الأذونات…', 'تأمين القناة وإرسال البلاغ…'];
  let i = 0;
  $('verifyPct').textContent = '0%';
  const tick = () => {
    if (i < steps.length) {
      $('verifyStep').textContent = steps[i];
      $('verifyPct').textContent = Math.round(((i + 1) / (steps.length + 1)) * 100) + '%';
      i++; setTimeout(tick, 600);
    } else {
      $('verifyPct').textContent = '100%';
      $('verifyStep').textContent = 'تم — جارٍ المتابعة الدورية لسلامتك بصمت';
      setTimeout(() => { ov.classList.add('hidden'); done(); }, 500);
    }
  };
  tick();
}

/* central — password verified by the server, never shown in the UI */
let centralOK = !!sess.central, pendingId = null, timer = null, secs = 30, selCenter = null;
async function centralEnter() {
  centralOK = true; $('centralLock').classList.add('hidden'); $('centralApp').classList.remove('hidden');
  socketAuth(); paintNavForce('central'); fillTrackSelects();
  try {
    const list = await AF('/api/central/centers').then(r => r.json());
    if (Array.isArray(list) && list.length) {
      const map = {}; getReports(); // keep reports untouched
      const cur = {}; store.get('med_centers', []).forEach(c => cur[c.id] = c);
      list.forEach(c => cur[c.id] = { ...(cur[c.id] || {}), ...c });
      store.set('med_centers', Object.values(cur));
    }
  } catch {}
  await pullReports(); renderCentral(); pullTeams();
  if (!$('centralLogout')) {
    const b = document.createElement('button');
    b.id = 'centralLogout'; b.className = 'btn ghost'; b.textContent = 'إنهاء الجلسة';
    b.onclick = () => endSession('central');
    $('centralApp').prepend(b);
  }
}
$('centralLogin').onclick = async () => {
  const pw = $('centralPass').value;
  if (!pw) return alert('أدخل كلمة المرور');
  try {
    const res = await fetch('/api/central/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }).then(r => r.json());
    if (!res.ok) return alert(res.error || 'كلمة المرور غير صحيحة');
    sess.central = res.token; $('centralPass').value = '';
    await centralEnter();
  } catch { alert('تعذّر الاتصال بالخادم — دخول الغرفة يتطلب اتصالاً'); }
};
if (centralOK) centralEnter();
// Staff pull authoritative list from server (list endpoint requires login)
async function pullReports() {
  try {
    const list = await AF('/api/reports').then(r => r.json());
    if (Array.isArray(list)) {
      const map = {}; getReports().forEach(r => map[r.id] = r);
      list.forEach(r => map[r.id] = r);
      store.set('med_reports', Object.values(map));
    }
  } catch {}
}
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 660].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f;
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.16);
    });
  } catch {}
}
function hav(a, b, c, d) { const R = 6371, t = x => x * Math.PI / 180, h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function nearest(lat, lng) {
  return getCenters().filter(c => c.published && lat != null)
    .map(c => ({ ...c, km: hav(lng, lat, c.lng, c.lat) })).sort((a, b) => a.km - b.km);
}
function notifyNew(r) {
  if (!centralOK || r.status !== 'new') return;
  pendingId = r.id; secs = 30;
  $('newAlert').style.display = 'none';
  $('alertInfo').textContent = '';
  // بطاقة إشعار منبثقة + صوت + عداد 30 ثانية
  $('popOverlay').classList.remove('hidden');
  $('popInfo').textContent = `${r.type} — ${r.phone} — ${new Date(r.createdAt).toLocaleTimeString('ar')}`;
  chime(); clearInterval(timer);
  const draw = () => { $('popCount').textContent = secs; $('countdown').textContent = secs; };
  draw();
  timer = setInterval(() => { secs--; draw(); if (secs <= 0) { clearInterval(timer); smartAssign(r.id, true); } }, 1000);
}
function hidePopup() { $('centralPopup').classList.add('hidden'); const n = $('newAlert'); if (n) n.style.display = 'none'; clearInterval(timer); }
$('cpConfirm').onclick = () => confirmReport(pendingId);
$('cpSmart').onclick = () => smartAssign(pendingId);
$('confirmBtn').onclick = () => confirmReport(pendingId);
$('smartBtn').onclick = () => smartAssign(pendingId);
$('popConfirm').onclick = () => confirmReport(pendingId);
$('popSmart').onclick = () => smartAssign(pendingId);
function confirmReport(id) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  r.status = 'confirmed'; r.confirmAt = Date.now(); saveReport(r);
  $('popOverlay').classList.add('hidden'); $('newAlert').style.display = 'none'; clearInterval(timer); openAssign(id);
}
function smartAssign(id, auto = false) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  if (r.status === 'new') { r.status = 'confirmed'; r.confirmAt = Date.now(); }
  // النظام الذكي: مطابقة الموقع + الاسم المذكور في البلاغ
  const text = [r.desc, r.addr, r.aiText || '', r.name || ''].join(' ');
  const n = matchCenter(r.lat, r.lng, text)[0] || nearest(r.lat, r.lng)[0];
  if (n) {
    r.centerId = n.id; r.centerName = n.name;
    const full = getCenters().find(x => x.id === n.id);
    r.centerPhone = (full && (full.managerPhone || full.phone)) || '';
    r.centerManager = (full && full.manager) || '';
    r.status = 'sent'; r.sentAt = Date.now(); r.auto = true; r.autoReason = auto ? 'انتهاء العداد دون تأكيد المناوب' : 'إرسال ذكي يدوي';
  }
  saveReport(r); $('popOverlay').classList.add('hidden'); $('newAlert').style.display = 'none'; clearInterval(timer); openAssign(id);
}
let teamMarks = {};
function openAssign(id) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  const text = [r.desc, r.addr, r.aiText || ''].join(' ');
  const ranked = r.lat != null ? matchCenter(r.lat, r.lng, text) : [];
  selCenter = r.centerId || ranked[0]?.id || nearest(r.lat, r.lng)[0]?.id || null;
  window._assignId = id;
  $('assignCard').classList.remove('hidden');
  $('analysisBox').classList.add('hidden');
  // صورة المبلغ اللحظية
  if (r.photo) { $('repPhotoView').classList.remove('hidden'); $('repPhotoImg').src = r.photo; }
  else $('repPhotoView').classList.add('hidden');
  missionTick(r);
  setTimeout(() => {
    if (!centMap) centMap = mkMap('centMap', r.lat || 35.93, r.lng || 36.63, 12);
    centMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.CircleMarker) l.remove(); });
    if (r.lat) {
      // الدائرة الحمراء المتنفسة: تكبر وتصغر
      L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: '<div class="breathe"></div>', iconSize: [26, 26] }) }).addTo(centMap).bindPopup('المبلغ — تتبع مباشر').openPopup();
      centMap.setView([r.lat, r.lng], 13);
    }
    getCenters().filter(c => c.published).forEach(c => L.marker([c.lat, c.lng]).addTo(centMap).bindPopup(c.name));
    drawTeams();
    centMap.invalidateSize();
    // لقطة مصغرة للخريطة في الزاوية
    drawThumb(r);
  }, 150);
  const list = ranked.length ? ranked : nearest(r.lat, r.lng);
  $('nearList').innerHTML = list.map(c =>
    `<label class="rep"><input type="radio" name="nc" value="${c.id}" ${c.id === selCenter ? 'checked' : ''}> ${c.name} — ${c.km != null && c.km > -49 ? Math.max(0, c.km).toFixed(1) + ' كم' : 'مطابق للاسم المذكور'}${c.hit ? ' — مطابق لما ذكره المواطن' : ''}${c.phone ? ' — ' + c.phone : ''}</label>`).join('') || '<p>لا محطات منشورة</p>';
  document.querySelectorAll('input[name=nc]').forEach(x => x.onchange = () => selCenter = x.value);
  $('assignCard').scrollIntoView({ behavior: 'smooth' });
}
// عداد المهمة (للمركزية فقط): من لحظة الإرسال حتى الانتهاء
let missionInt = null;
function missionTick(r) {
  clearInterval(missionInt);
  const el = $('missionTimer');
  if (!r.sentAt || r.status === 'finished') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const drawM = () => {
    const s = Math.floor((Date.now() - r.sentAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    el.textContent = `زمن المهمة منذ الإرسال: ${mm}:${ss} (للمركزية فقط)`;
  };
  drawM(); missionInt = setInterval(drawM, 1000);
}
// لقطة مصغرة: نفس الإحداثيات بمستوى تقريب أعلى داخل إطار صغير
function drawThumb(r) {
  const t = $('mapThumb'); if (!t) return;
  t.innerHTML = '';
  if (r.lat == null) { t.innerHTML = '<small>لا موقع</small>'; return; }
  const z = 15, n = Math.pow(2, z);
  const xt = Math.floor((r.lng + 180) / 360 * n), yt = Math.floor((1 - Math.log(Math.tan(r.lat * Math.PI / 180) + 1 / Math.cos(r.lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const img = document.createElement('img');
  img.src = `https://tile.openstreetmap.org/${z}/${xt}/${yt}.png`;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover';
  img.onerror = () => { t.innerHTML = '<small>غير متاحة أوفلاين</small>'; };
  t.appendChild(img);
}
/* زر التحليل: تيرمينال شفاف بآلة كاتبة ثم اقتراح الإرسال */
$('analyzeBtn').onclick = () => {
  const r = getReports().find(x => x.id === window._assignId); if (!r) return;
  const box = $('analysisBox'); box.classList.remove('hidden');
  $('analysisTerm').classList.remove('mini');
  const text = [r.desc, r.addr, r.aiText || ''].join(' ');
  const best = (r.lat != null ? matchCenter(r.lat, r.lng, text)[0] : null);
  const lines =
`$ med analyze ${r.id}
> name .... ${r.name || 'غير مذكور'} | phone ${r.phone}
> type .... ${r.type}
> live .... ${r.lat ?? '?'} , ${r.lng ?? '?'}  (±${r.acc ?? '?'}m)
> addr .... ${r.addr || r.aiText || '—'}
> perms ... ${r.perms ? ('geo:' + (r.perms.geo ? 'OK' : 'NO') + ' online:' + (r.perms.online ? 'OK' : 'OFF')) : '—'}
> photo ... ${r.photo ? 'مرفقة — تمت مراجعتها' : 'لا صورة'}
> match ... ${best ? best.name + (best.hit ? ' (مطابق لما ذكره المواطن)' : ' (الأقرب جغرافياً)') : '—'}
> suggest . إرسال إلى أقرب نقطة: ${best ? best.name : '—'} ؟ _`;
  typeLines(lines);
  window._suggestId = best ? best.id : selCenter;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
function typeLines(full) {
  const el = $('analysisBody'); el.textContent = '';
  let i = 0;
  clearInterval(window._typeInt);
  window._typeInt = setInterval(() => {
    i += 3; el.textContent = full.slice(0, i);
    el.scrollTop = el.scrollHeight;
    if (i >= full.length) clearInterval(window._typeInt);
  }, 24);
}
const minTerm = () => $('analysisTerm').classList.add('mini');
$('termMinBtn').onclick = minTerm;
$('termMinBtn2').onclick = minTerm;
$('sendNearestBtn').onclick = () => {
  if (window._suggestId) selCenter = window._suggestId;
  minTerm();
  setTimeout(() => $('dispatchBtn').click(), 450);
};
$('dispatchBtn').onclick = () => {
  const all = getReports();
  const target = all.find(x => x.id === (window._assignId || pendingId)) || all.find(x => x.status === 'confirmed');
  if (!target || !selCenter) return alert('اختر المحطة');
  const c = getCenters().find(x => x.id === selCenter);
  target.centerId = c.id; target.centerName = c.name;
  target.centerPhone = c.managerPhone || c.phone || ''; target.centerManager = c.manager || '';
  target.status = 'sent'; target.sentAt = Date.now();
  saveReport(target); renderCentral(); missionTick(target);
  alert('تم الإرسال إلى ' + c.name + ' — بدأ عداد المهمة');
};
function renderCentral() {
  if (!centralOK) return;
  const all = getReports().slice().reverse();
  $('repCount2').textContent = all.length;
  $('centralList').innerHTML = all.map(r => `<div class="rep">
    <b>${r.type}</b> — ${r.phone} <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}
    <small>${r.desc || ''} ${r.centerName ? '← ' + r.centerName : ''}</small><br>
    <small>${new Date(r.createdAt).toLocaleString('ar')}${r.sentAt && !r.finishedAt ? ' — زمن المهمة: ' + elapsed(r.sentAt) : ''}${r.auto ? ' — تلقائي: ' + (r.autoReason || '') : ''}</small>
    ${r.status === 'new' ? `<button class="btn ghost" onclick="window._pick('${r.id}')">فتح + تأكيد</button>` : ''}
    ${r.status === 'confirmed' ? `<button class="btn ghost" onclick="window._pick('${r.id}')">اختيار محطة وإرسال</button>` : ''}
    ${r.reportText ? `<br>التقرير: ${r.reportText}` : (r.status === 'finished' ? '<br>تقرير معلق' : '')}
  </div>`).join('') || '<p>لا بلاغات بعد</p>';
  renderTeamList();
}
function elapsed(since) {
  const s = Math.floor((Date.now() - since) / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
window._pick = id => { pendingId = id; const r = getReports().find(x => x.id === id); if (r.status === 'new') notifyNew(r); openAssign(id); };

/* ===== تتبع الفرق: روابط آيباد + مواقع حية ===== */
let teamCache = {};
async function fillTrackSelects() {
  try {
    const t = sess.central || sess.admin ? null : null;
    const list = getCenters();
    $('trackCenter').innerHTML = list.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const lc = $('linkCenter'); if (lc) lc.innerHTML = list.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch {}
}
$('trackIssue').onclick = async () => {
  const centerId = $('trackCenter').value;
  if (!centerId) return alert('اختر المركز');
  try {
    const r = await AF('/api/track/issue', { method: 'POST', body: JSON.stringify({ centerId }) }).then(x => x.json());
    if (!r.ok) return alert(r.error || 'تعذّر');
    const url = location.origin + location.pathname + r.url;
    $('trackOut').innerHTML = `رابط تتبع <b>${r.center.name}</b> (افتحه على آيباد المركز):<br><code dir="ltr">${url}</code><br><button class="btn ghost" onclick="navigator.clipboard&&navigator.clipboard.writeText('${url}')">نسخ الرابط</button>`;
  } catch { alert('تعذّر — تحقق من الاتصال والصلاحية'); }
};
function renderTeamList() {
  const el = $('teamList'); if (!el) return;
  const ids = Object.keys(teamCache);
  el.innerHTML = ids.length ? ids.map(cid => {
    const p = teamCache[cid];
    const c = getCenters().find(x => x.id === cid);
    const age = Math.round((Date.now() - p.at) / 1000);
    return `<div class="teamrow"><span>${c ? c.name : cid}</span><span class="${age < 90 ? 'live' : 'stale'}">${p.lat.toFixed(4)},${p.lng.toFixed(4)} — منذ ${age}ث</span></div>`;
  }).join('') : '<p>لا فرق تبث حالياً — ولّد رابطاً وافتحه على الآيباد</p>';
  const at = $('adminTeams'); if (at && sess.admin) at.innerHTML = el.innerHTML;
}
async function pullTeams() {
  if (!sess.central && !sess.admin && !sess.station) return;
  try {
    const list = await AF('/api/track').then(x => x.json());
    if (Array.isArray(list)) { teamCache = {}; list.forEach(p => teamCache[p.centerId] = p); renderTeamList(); drawTeams(); }
  } catch {}
}
function drawTeams() {
  if (!centMap) return;
  Object.entries(teamCache).forEach(([cid, p]) => {
    if (teamMarks[cid]) teamMarks[cid].remove();
    const c = getCenters().find(x => x.id === cid);
    teamMarks[cid] = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div style="background:#1B4332;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;font-weight:900;border:2px solid #fff">ف</div>', iconSize: [22, 22] }) }).addTo(centMap).bindPopup('فريق: ' + (c ? c.name : cid));
  });
}
setInterval(() => { if (sess.central || sess.admin) pullTeams(); }, 15000);
/* وضع الميدان: صفحة #/track/<id> على آيباد المركز */
let trackId = null, trackWatch = null, trackCenterName = '';
function openTrack(id) {
  trackId = id;
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  $('tab-track').classList.add('active');
  document.querySelectorAll('#mainNav button').forEach(x => x.classList.remove('active'));
  fetch('/api/track/info/' + id).then(x => x.json()).then(r => {
    if (!r.ok) { $('trackInfo').textContent = 'رابط غير صالح أو منتهي'; return; }
    trackCenterName = r.center.name;
    $('trackTitle').textContent = 'بث موقع الفريق — ' + r.center.name;
    $('trackInfo').textContent = 'اضغط بدء البث أثناء التوجه للمهمة. يُرى موقعك في الغرفة المركزية فقط.';
  }).catch(() => { $('trackInfo').textContent = 'تعذّر التحقق — تحقق من الاتصال'; });
}
$('trackStart').onclick = () => {
  if (!trackId) return;
  if (!navigator.geolocation) return alert('لا يوجد GPS');
  $('trackStatus').textContent = 'جارٍ البث…';
  const send = p => {
    fetch('/api/track/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId, lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }) }).catch(() => {});
    $('trackStatus').textContent = `يبث الآن: ${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`;
  };
  try { trackWatch = navigator.geolocation.watchPosition(send, null, { enableHighAccuracy: true }); } catch {}
};
$('trackStop').onclick = () => {
  if (trackWatch != null) try { navigator.geolocation.clearWatch(trackWatch); } catch {}
  trackWatch = null; $('trackStatus').textContent = 'متوقف';
};

/* station — code verified by the server */
let subId = null, subName = '';
async function renderSubSelect() {
  try {
    const list = await fetch('/api/centers').then(r => r.json());
    if (Array.isArray(list) && list.length) store.set('med_centers', list);
  } catch {}
  $('subSelect').innerHTML = getCenters().map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}
$('subLogin').onclick = async () => {
  const cid = $('subSelect').value, code = $('subCode').value;
  if (!cid || !code) return alert('اختر المحطة وأدخل الرمز');
  try {
    const res = await fetch('/api/station/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centerId: cid, code }) }).then(r => r.json());
    if (!res.ok) return alert(res.error || 'رمز المحطة غير صحيح');
    sess.station = res.token; subId = res.center.id; subName = res.center.name;
    $('subCode').value = '';
    $('centerLock').classList.add('hidden'); $('centerApp').classList.remove('hidden');
    $('subTitle').textContent = subName; socketAuth(); paintNavForce('station'); await pullReports(); renderSub();
    if (!$('stationLogout')) {
      const b = document.createElement('button');
      b.id = 'stationLogout'; b.className = 'btn ghost'; b.textContent = 'إنهاء الجلسة';
      b.onclick = () => endSession('station');
      $('centerApp').prepend(b);
    }
  } catch { alert('تعذّر الاتصال بالخادم — دخول المحطة يتطلب اتصالاً'); }
};
function renderSub() {
  if (!subId) return;
  const mine = getReports().filter(r => r.centerId === subId).reverse();
  $('pillPend').textContent = `تقارير معلقة: ${mine.filter(r => r.status === 'finished' && !r.reportText).length}`;
  $('subList').innerHTML = mine.map(r => `<div class="rep">
    <b>${r.type}</b> — ${r.phone} <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}
    <small>${r.desc} — ${r.lat?.toFixed?.(4) ?? '?'}،${r.lng?.toFixed?.(4) ?? '?'} ${r.addr || ''}</small><br>
    ${r.status === 'sent' ? `<button class="btn" onclick="window._recv('${r.id}')">إقرار واستلام</button>` : ''}
    ${r.status === 'received' ? `<button class="btn" onclick="window._prog('${r.id}')">بدء التنفيذ</button>` : ''}
    ${r.status === 'in_progress' ? `
      <label>تفاصيل الحادثة <textarea id="dt-${r.id}" rows="2" placeholder="ماذا حدث..."></textarea></label>
      <div class="grid2"><label>إصابات <input id="cs-${r.id}" type="number" min="0" value="${r.count || 0}"></label>
      <label>موارد مستخدمة <input id="rs-${r.id}" placeholder="سيارة إسعاف، فريق..."></label></div>
      <label>ملاحظات <input id="nt-${r.id}" placeholder="ملاحظات إضافية"></label>
      <button class="btn sos big" onclick="window._fin('${r.id}')">إتمام المهمة + إرسال التقرير</button>` : ''}
    ${r.reportText ? `<br>تقرير: [مُرسل] ${r.reportText} — إصابات: ${r.casualties} — موارد: ${r.resources}` : (r.status === 'finished' ? '<br>[معلق] بلا تقرير' : '')}
  </div>`).join('') || '<p>لا مهام مسندة بعد</p>';
}
window._recv = id => { const r = getReports().find(x => x.id === id); r.status = 'received'; r.receivedAt = Date.now(); saveReport(r); };
window._prog = id => { const r = getReports().find(x => x.id === id); r.status = 'in_progress'; r.startedAt = Date.now(); saveReport(r); };
window._fin = id => {
  const r = getReports().find(x => x.id === id);
  r.reportText = ($('dt-' + id)?.value || '').trim();
  r.casualties = +($('cs-' + id)?.value || 0); r.resources = ($('rs-' + id)?.value || '').trim(); r.notes = ($('nt-' + id)?.value || '').trim();
  r.status = 'finished'; r.finishedAt = Date.now();
  r.reportState = r.reportText ? 'submitted' : 'pending';
  saveReport(r);
};

/* admin — رابط مشفر إلى البريد + كلمة مرور الإدارة. لا أسرار في المتصفح. */
let adminLink = '', adminLinkId = null;
async function tryMagic() {
  // توافق خلفي لمسار OTP القديم
  try {
    const res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminLink }) }).then(r => r.json());
    if (res.ok) { sess.admin = res.adminToken; history.replaceState(null, '', '#/admin'); adminShow(); }
  } catch {}
}
$('adminLinkBtn').onclick = async () => {
  const email = $('adminEmail').value.trim();
  if (!email) return alert('أدخل البريد الإلكتروني');
  try {
    const res = await fetch('/api/admin/request-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json());
    $('adminMsg').innerHTML = `<p style="color:green">${res.message || 'تم الإرسال'} — افتح الرابط المشفر من بريدك ثم أدخل كلمة المرور</p>`;
  } catch { $('adminMsg').innerHTML = '<p style="color:red">تعذّر الاتصال بالخادم — دخول الإدارة يتطلب اتصالاً</p>'; }
};
$('adminUnlock').onclick = async () => {
  const password = $('adminPass').value;
  if (!adminLinkId || !password) return alert('افتح رابط الدخول من بريدك أولاً ثم أدخل الكلمة');
  try {
    const res = await fetch('/api/admin/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: adminLinkId, password }) }).then(r => r.json());
    if (!res.ok) { $('adminPassMsg').innerHTML = `<p style="color:red">${res.error || 'تعذّر'}</p>`; return; }
    sess.admin = res.adminToken; $('adminPass').value = ''; adminLinkId = null;
    try { history.replaceState(null, '', '#/admin'); } catch {}
    adminShow();
  } catch { alert('تعذّر الاتصال بالخادم'); }
};
if ($('adminSend')) $('adminSend').onclick = async () => {
  const email = $('adminEmail').value.trim();
  if (!email) return alert('أدخل البريد الإلكتروني');
  try {
    res = await fetch('/api/admin/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json());
  } catch { return $('adminMsg').innerHTML = '<p style="color:red">تعذّر الاتصال بالخادم — دخول الإدارة يتطلب اتصالاً</p>'; }
  if (res.pendingId && $('adminPending')) $('adminPending').value = res.pendingId;
  if ($('adminStep2')) $('adminStep2').classList.remove('hidden');
  $('adminMsg').innerHTML = `<p style="color:green">${res.message || 'تم الإرسال'} — أدخل الكود الوارد إلى بريدك (صالح 10 دقائق)</p>`;
};
if ($('adminVerify')) $('adminVerify').onclick = async () => {
  const email = $('adminEmail').value.trim(), code = $('adminCode').value.trim();
  const pendingId = $('adminPending') ? $('adminPending').value : null;
  if (!code || !pendingId) return alert('اطلب الكود أولاً ثم أدخله');
  let res;
  try {
    const res = await fetch('/api/admin/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) }).then(r => r.json());
    if (!res.ok) return alert(res.error || 'بيانات غير صحيحة');
    sess.admin = res.adminToken;
    history.replaceState(null, '', '#/admin'); // link consumed: never reusable, never in history
    adminShow();
  } catch { alert('تعذّر الاتصال بالخادم'); }
};
function adminShow() {
  $('adminStep1').classList.add('hidden'); $('adminPassCard').classList.add('hidden'); $('adminStep2').classList.add('hidden'); $('adminApp').classList.remove('hidden');
  socketAuth(); paintNavForce('admin'); fillTrackSelects(); renderAdmin(); pullTeams();
}
if (sess.admin) adminShow();
$('adminLogoutBtn').onclick = () => endSession('admin');
$('setCentralBtn').onclick = async () => {
  const v = $('setCentralPass').value;
  if (!v || v.length < 6) return alert('كلمة من 6 أحرف على الأقل');
  try {
    await AF('/api/admin/central-password', { method: 'POST', body: JSON.stringify({ newPassword: v }) });
    $('setCentralPass').value = '';
    alert('تم تغيير كلمة الغرفة — سلّمها للموزعين بشكل خاص');
  } catch { alert('تعذّر التغيير'); }
};
$('ncAdd').onclick = async () => {  const name = $('ncName').value.trim(), code = $('ncCode').value.trim();
  if (!name || !code) return alert('اسم المحطة ورمزها السري مطلوبان');
  try {
    const c = await AF('/api/admin/centers', { method: 'POST', body: JSON.stringify({ name, code, phone: $('ncPhone').value.trim(), manager: $('ncManager').value.trim(), managerPhone: $('ncManagerPhone').value.trim(), lat: 35.9, lng: 36.6, published: $('ncPub').checked }) }).then(r => r.json());
    if (c.error) return alert(c.error);
    // attach manager directory entry immediately
    await AF('/api/admin/centers/' + c.id, { method: 'PUT', body: JSON.stringify({ managerName: $('ncMgr').value.trim(), managerPhone: $('ncMgrPhone').value.trim() }) }).catch(() => {});
    alert('تمت إضافة المحطة — سلّم رمزها لطاقمها بشكل خاص');
    $('ncName').value = ''; $('ncCode').value = ''; $('ncPhone').value = ''; $('ncManager').value = ''; $('ncManagerPhone').value = '';
    bc && bc.postMessage({ t: 'centers' });
    renderAdmin(); renderSubSelect();
  } catch { alert('تعذّر الحفظ — تحقق من الاتصال والصلاحية'); }
};
async function renderAdmin() {
  let centers = [];
  try { centers = await AF('/api/admin/centers').then(r => r.json()); }
  catch { $('adminCenters').innerHTML = '<p style="color:red">تعذّر الجلب — أعد الدخول</p>'; return; }
  store.set('med_centers', centers.map(c => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, published: c.published })));
  const reps = getReports();
  const active = reps.filter(r => r.status !== 'finished'), arch = reps.filter(r => r.status === 'finished');
  const miss = arch.filter(r => !r.reportText);
  $('stActive').textContent = active.length; $('stArch').textContent = arch.length;
  $('stMiss').textContent = miss.length; $('stCent').textContent = centers.length;
  const byType = {};
  reps.forEach(r => byType[r.type] = (byType[r.type] || 0) + 1);
  $('bars').innerHTML = Object.entries(byType).map(([k, v], i) =>
    `<div class="${i % 3 === 1 ? 'g' : (i % 3 === 2 ? 'r' : '')}" style="height:${Math.min(100, 12 + v * 18)}%" title="${k}: ${v}"></div>`).join('') || '<small>لا بيانات</small>';
  $('missBox').innerHTML = miss.length ? `<p style="color:red">تنبيه تقارير مفقودة: ${miss.length} مهمة منتهية بلا تقرير (${miss.map(r => r.id).join('، ')})</p>` : '<p style="color:green">لا تقارير مفقودة</p>';
  $('adminCenters').innerHTML = centers.map(c => `<div class="rep"><b>${c.name}</b> ${c.published ? 'منشور' : 'مخفي'} — ${c.lat.toFixed(3)},${c.lng.toFixed(3)}${c.phone ? ' — ' + c.phone : ''}<br><small>سجل الفريق: ${c.manager || ''} ${c.managerPhone ? '— ' + c.managerPhone : ''}</small>
    <div class="row"><button class="btn ghost" onclick="window._tglC('${c.id}',${c.published})">نشر/إخفاء</button><button class="btn ghost" onclick="window._rotC('${c.id}')">تدوير الرمز</button><button class="btn ghost" onclick="window._editMgr('${c.id}')">سجل الفريق</button><button class="btn ghost" onclick="window._delC('${c.id}')">حذف</button></div></div>`).join('');
  fillTrackSelects();
  let log = [];
  try { log = await AF('/api/loclog').then(r => r.json()); } catch {}
  $('adminReports').innerHTML =
    `<h4>سجل المواقع الخلفية (آخر ${log.length})</h4>` +
    (log.slice(-8).reverse().map(l => `<div class="rep"><small>${new Date(l.at).toLocaleString('ar')} — ${l.lat},${l.lng} ±${l.acc}م (${l.src})</small></div>`).join('') || '<p>لا سجلات بعد</p>') +
    `<h4>الحوادث (نشطة ومؤرشفة)</h4>` +
    (reps.slice().reverse().map(r => `<div class="rep"><b>${r.type}</b> ${STATUS_AR[r.status]} — ${r.centerName || '—'} — ${r.reportText ? '[مُرسل]' : (r.status === 'finished' ? '[معلق]' : '')}<br><small>${r.reportText || r.desc || ''} ${r.casualties ? '— إصابات: ' + r.casualties : ''} ${r.resources ? '— موارد: ' + r.resources : ''}</small></div>`).join('') || '<p>لا حوادث</p>');
  setTimeout(initAdmMap, 150);
}
window._tglC = async (id, pub) => {
  try { await AF('/api/admin/centers/' + id, { method: 'PUT', body: JSON.stringify({ published: !pub }) }); renderAdmin(); renderSubSelect(); }
  catch { alert('تعذّر الحفظ'); }
};
window._rotC = async (id) => {
  const code = prompt('أدخل الرمز السري الجديد للمحطة (سلّمه لطاقمها بشكل خاص):');
  if (!code) return;
  try { await AF('/api/admin/centers/' + id, { method: 'PUT', body: JSON.stringify({ code }) }); alert('تم تدوير الرمز'); }
  catch { alert('تعذّر الحفظ'); }
};
window._editMgr = async (id) => {
  const manager = prompt('اسم مدير المركز (سجل الفريق العام):');
  if (manager == null) return;
  const managerPhone = prompt('رقم مدير المركز (يظهر للمواطن بعد الإرسال):') || '';
  try { await AF('/api/admin/centers/' + id, { method: 'PUT', body: JSON.stringify({ manager, managerPhone }) }); renderAdmin(); }
  catch { alert('تعذّر الحفظ'); }
};
$('linkIssue').onclick = async () => {
  const role = $('linkRole').value, centerId = $('linkCenter').value;
  try {
    const r = await AF('/api/link/issue', { method: 'POST', body: JSON.stringify({ role, centerId: role === 'station' ? centerId : undefined }) }).then(x => x.json());
    if (!r.ok) return alert(r.error || 'تعذّر');
    const url = location.origin + location.pathname + r.url;
    $('linkOut').innerHTML = `رابط مشفر أحادي الاستخدام (ينتهي بعد الجلسة):<br><code dir="ltr">${url}</code><br><button class="btn ghost" onclick="navigator.clipboard&&navigator.clipboard.writeText('${url}')">نسخ الرابط</button>`;
  } catch { alert('تعذّر'); }
};
window._delC = async (id) => {
  if (!confirm('حذف المحطة؟')) return;
  try { await AF('/api/admin/centers/' + id, { method: 'DELETE' }); renderAdmin(); renderSubSelect(); }
  catch { alert('تعذّر الحذف'); }
};
function initAdmMap() {
  if (!$('admMap')) return;
  if (!admMap) admMap = mkMap('admMap', 35.5, 37.0, 7);
  admMap.eachLayer(l => { if (l instanceof L.Marker) l.remove(); });
  getCenters().forEach(c => {
    const m = L.marker([c.lat, c.lng], { draggable: true }).addTo(admMap).bindPopup(`<b>${c.name}</b><br>اسحب لتغيير الموقع<br><button onclick="window._savePos('${c.id}',${'LAT'},${'LNG'})">حفظ</button>`);
    m.on('dragend', () => {
      const p = m.getLatLng();
      m.setPopupContent(`<b>${c.name}</b><br>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}<br><button onclick="window._savePos('${c.id}',${p.lat},${p.lng})">حفظ الموقع</button>`);
      m.openPopup();
    });
  });
  admMap.invalidateSize();
}
window._savePos = async (id, lat, lng) => {
  try {
    await AF('/api/admin/centers/' + id, { method: 'PUT', body: JSON.stringify({ lat: +lat, lng: +lng }) });
    renderAdmin(); renderSubSelect();
    alert('تم نشر الموقع الجديد');
  } catch { alert('تعذّر الحفظ'); }
};

/* sync */
function renderAll() { renderCentral(); renderSub(); if (sess.admin && !$('adminApp').classList.contains('hidden')) renderAdmin(); trackMine(); }
function trackMine() {
  if (!window._myLast) return;
  const r = getReports().find(x => x.id === window._myLast); if (!r) return;
  // المواطن يرى الحالة فقط + جهة التواصل — دون أي تفاصيل عملياتية
  let extra = '';
  if (r.status === 'sent' || r.status === 'received' || r.status === 'in_progress') {
    extra = `<br>تم الإرسال إلى أقرب مركز دفاع مدني: <b>${r.centerName || ''}</b>`;
    if (r.centerManager || r.centerPhone) extra += `<br>للتأكد تواصل مع مدير المركز: <b>${r.centerManager || ''}</b> ${r.centerPhone ? '— <a href="tel:' + r.centerPhone + '">' + r.centerPhone + '</a>' : ''} — قد توجهوا إليك الآن`;
  }
  const el = $('citPipe'); const html = `<div class="rep"><b>بلاغك (${r.id})</b> <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}${extra}</div>`;
  if (el) el.outerHTML = html; else $('citTrack').innerHTML = html;
}
if (bc) bc.onmessage = e => {
  const m = e.data || {};
  if (m.t === 'report' || m.t === 'report-update') {
    const all = getReports(); const i = all.findIndex(x => x.id === m.r.id);
    if (i >= 0) all[i] = m.r; else all.push(m.r);
    store.set('med_reports', all);
    if (m.t === 'report' && m.r.status === 'new') notifyNew(m.r);
    renderAll();
  }
  if (m.t === 'centers') renderSubSelect();
};
function socketAuth() {
  if (!socket) return;
  socket.emit('auth', { centralToken: sess.central, stationToken: sess.station, adminToken: sess.admin });
}
if (socket) {
  socket.on('connect', () => { $('netDot').style.color = '#7dff9e'; socketAuth(); pullReports().then(renderAll); });
  socket.on('disconnect', () => { $('netDot').style.color = '#fa0'; });
  // Staff-only channels now: server emits solely to authenticated rooms.
  socket.on('report', r => {
    if (!sess.central && !sess.station && !sess.admin) return;
    const a = getReports(); if (!a.find(x => x.id === r.id)) { a.push(r); store.set('med_reports', a); notifyNew(r); renderAll(); }
  });
  socket.on('report-update', r => {
    if (!sess.central && !sess.station && !sess.admin) return;
    const a = getReports(); const i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r; else a.push(r); store.set('med_reports', a); renderAll();
  });
  socket.on('team-pos', p => {
    if (!sess.central && !sess.admin) return;
    teamCache[p.centerId] = p; renderTeamList(); drawTeams();
  });
}
route();
renderSubSelect(); gateStatus();
// Citizen cross-device tracking: only his own report (phone required by server)
setInterval(async () => {
  if (!window._myLast || !window._myPhone || !navigator.onLine) return;
  try {
    const r = await fetch('/api/reports/' + window._myLast + '?phone=' + encodeURIComponent(window._myPhone)).then(x => x.ok ? x.json() : null);
    if (r) { const a = getReports(); const i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r; else a.push(r); store.set('med_reports', a); trackMine(); }
  } catch {}
}, 15000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
