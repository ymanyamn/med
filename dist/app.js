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
// Separate links per role: #/citizen #/central #/station #/admin (+ legacy #/admin-TOKEN magic link)
const ROUTES = { citizen: 'citizen', central: 'central', station: 'center', admin: 'admin' };
function goTab(name, push = true) {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  if (name === 'central') renderCentral();
  if (name === 'center') renderSubSelect();
  if (name === 'admin' && sess.admin) renderAdmin();
  if (push && location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
  setTimeout(() => { window.dispatchEvent(new Event('resize')); [citMap, centMap, admMap].forEach(m => m && m.invalidateSize()); }, 150);
}
function route() {
  const h = location.hash || '#/citizen';
  if (h.startsWith('#/admin-') && h.length > 8) { adminLink = h.replace('#/admin-', ''); goTab('admin', false); tryMagic(); return; }
  const key = h.replace('#/', '');
  goTab(ROUTES[key] ? key : 'citizen', false);
}

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
document.querySelectorAll('nav button').forEach(b => b.onclick = () => goTab(b.dataset.tab));
window.addEventListener('hashchange', route);

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
  const log = store.get('med_loclog', []);
  log.push({ at: Date.now(), lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy || 0), src });
  store.set('med_loclog', log.slice(-200));
}
function gotPos(p, src) {
  livePos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now(), src };
  store.set('med_lastpos', livePos); logLoc(p, src);
  setLocStatus(`تم تحديد موقعك (${livePos.lat.toFixed(5)}, ${livePos.lng.toFixed(5)}) دقة ±${livePos.acc}م`);
  drawCitMarker();
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
  const pos = manualPos || livePos;
  if (!pos && !confirm('لم يتم جلب الموقع بعد. إرسال بدون موقع؟')) return;
  const r = {
    id: 'r' + Date.now(), type: repType, phone, name: $('repName').value.trim(), desc,
    count: +$('repCount').value || 0, addr: $('repAddr').value.trim(),
    lat: pos?.lat ?? null, lng: pos?.lng ?? null, acc: pos?.acc ?? null,
    status: 'new', createdAt: Date.now(), centerId: null, centerName: null,
    reportText: '', casualties: 0, resources: '', notes: '', reportState: 'none'
  };
  saveReport(r);
  try { await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }); } catch {}
  bc && bc.postMessage({ t: 'report', r });
  window._myLast = r.id; window._myPhone = phone;
  $('citTrack').innerHTML = `<div class="rep"><b>تم استلام بلاغك (${r.id})</b>${pipe({ ...r, status: 'sent' })}<small>تابع هنا — تتحدث الحالة تلقائياً</small></div>`;
  $('repDesc').value = '';
};

/* central — password verified by the server, never shown in the UI */
let centralOK = !!sess.central, pendingId = null, timer = null, secs = 30, selCenter = null;
async function centralEnter() {
  centralOK = true; $('centralLock').classList.add('hidden'); $('centralApp').classList.remove('hidden');
  socketAuth();
  try {
    const list = await AF('/api/central/centers').then(r => r.json());
    if (Array.isArray(list) && list.length) {
      const map = {}; getReports(); // keep reports untouched
      const cur = {}; store.get('med_centers', []).forEach(c => cur[c.id] = c);
      list.forEach(c => cur[c.id] = { ...(cur[c.id] || {}), ...c });
      store.set('med_centers', Object.values(cur));
    }
  } catch {}
  await pullReports(); renderCentral();
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
  $('newAlert').style.display = '';
  $('alertInfo').textContent = `${r.type} — ${r.phone} — ${new Date(r.createdAt).toLocaleTimeString('ar')}`;
  chime(); clearInterval(timer);
  timer = setInterval(() => { secs--; $('countdown').textContent = secs; if (secs <= 0) { clearInterval(timer); smartAssign(r.id); } }, 1000);
}
$('confirmBtn').onclick = () => confirmReport(pendingId);
$('smartBtn').onclick = () => smartAssign(pendingId);
function confirmReport(id) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  r.status = 'confirmed'; r.confirmAt = Date.now(); saveReport(r);
  $('newAlert').style.display = 'none'; clearInterval(timer); openAssign(id);
}
function smartAssign(id) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  if (r.status === 'new') { r.status = 'confirmed'; r.confirmAt = Date.now(); }
  const n = nearest(r.lat, r.lng)[0];
  if (n) { r.centerId = n.id; r.centerName = n.name; r.status = 'sent'; r.sentAt = Date.now(); r.auto = true; }
  saveReport(r); $('newAlert').style.display = 'none'; clearInterval(timer); openAssign(id);
}
function openAssign(id) {
  const r = getReports().find(x => x.id === id); if (!r) return;
  selCenter = r.centerId || nearest(r.lat, r.lng)[0]?.id || null;
  $('assignCard').classList.remove('hidden');
  setTimeout(() => {
    if (!centMap) centMap = mkMap('centMap', r.lat || 35.93, r.lng || 36.63, 12);
    centMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.CircleMarker) l.remove(); });
    if (r.lat) {
      L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: '<div class="pulse"></div>', iconSize: [18, 18] }) }).addTo(centMap).bindPopup('المواطن — موقع حي').openPopup();
      centMap.setView([r.lat, r.lng], 12);
    }
    getCenters().filter(c => c.published).forEach(c => L.marker([c.lat, c.lng]).addTo(centMap).bindPopup(c.name));
    centMap.invalidateSize();
  }, 150);
  $('nearList').innerHTML = nearest(r.lat, r.lng).map(c =>
    `<label class="rep"><input type="radio" name="nc" value="${c.id}" ${c.id === selCenter ? 'checked' : ''}> ${c.name} — ${c.km.toFixed(1)} كم${c.phone ? ' — ' + c.phone : ''}</label>`).join('') || '<p>لا محطات منشورة</p>';
  document.querySelectorAll('input[name=nc]').forEach(x => x.onchange = () => selCenter = x.value);
  $('assignCard').scrollIntoView({ behavior: 'smooth' });
}
$('dispatchBtn').onclick = () => {
  const all = getReports();
  const target = all.find(x => x.id === pendingId) || all.find(x => x.status === 'confirmed');
  if (!target || !selCenter) return alert('اختر المحطة');
  const c = getCenters().find(x => x.id === selCenter);
  target.centerId = c.id; target.centerName = c.name; target.status = 'sent'; target.sentAt = Date.now();
  saveReport(target); renderCentral();
};
function renderCentral() {
  if (!centralOK) return;
  const all = getReports().slice().reverse();
  $('repCount2').textContent = all.length;
  $('centralList').innerHTML = all.map(r => `<div class="rep">
    <b>${r.type}</b> — ${r.phone} <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}
    <small>${r.desc || ''} ${r.centerName ? '← ' + r.centerName : ''}</small><br>
    <small>${new Date(r.createdAt).toLocaleString('ar')}</small>
    ${r.status === 'new' ? `<button class="btn ghost" onclick="window._pick('${r.id}')">فتح + تأكيد</button>` : ''}
    ${r.status === 'confirmed' ? `<button class="btn ghost" onclick="window._pick('${r.id}')">اختيار محطة وإرسال</button>` : ''}
    ${r.reportText ? `<br>التقرير: ${r.reportText}` : (r.status === 'finished' ? '<br>تقرير معلق' : '')}
  </div>`).join('') || '<p>لا بلاغات بعد</p>';
}
window._pick = id => { pendingId = id; const r = getReports().find(x => x.id === id); if (r.status === 'new') notifyNew(r); openAssign(id); };

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
    $('subTitle').textContent = subName; socketAuth(); await pullReports(); renderSub();
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

/* admin — email OTP / magic link. The code is delivered to the inbox only;
   this browser never receives it except typed by the admin's own hand. */
let adminLink = '';
async function tryMagic() {
  // Opened via magic link from email: verify the token directly.
  try {
    const res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminLink }) }).then(r => r.json());
    if (res.ok) { sess.admin = res.adminToken; history.replaceState(null, '', '#/admin'); adminShow(); }
  } catch {}
}
$('adminSend').onclick = async () => {
  const email = $('adminEmail').value.trim();
  if (!email) return alert('أدخل البريد الإلكتروني');
  let res;
  try {
    res = await fetch('/api/admin/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json());
  } catch { return $('adminMsg').innerHTML = '<p style="color:red">تعذّر الاتصال بالخادم — دخول الإدارة يتطلب اتصالاً</p>'; }
  if (res.pendingId) $('adminPending').value = res.pendingId;
  $('adminStep2').classList.remove('hidden');
  $('adminMsg').innerHTML = `<p style="color:green">${res.message || 'تم الإرسال'} — أدخل الكود الوارد إلى بريدك (صالح 10 دقائق)</p>`;
};
$('adminVerify').onclick = async () => {
  const email = $('adminEmail').value.trim(), code = $('adminCode').value.trim();
  const pendingId = $('adminPending').value;
  if (!code || !pendingId) return alert('اطلب الكود أولاً ثم أدخله');
  let res;
  try {
    res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, pendingId, code }) }).then(r => r.json());
  } catch { return alert('تعذّر الاتصال بالخادم'); }
  if (!res.ok) return alert(res.error || 'كود غير صحيح');
  sess.admin = res.adminToken;
  adminShow();
};
function adminShow() {
  $('adminStep1').classList.add('hidden'); $('adminStep2').classList.add('hidden'); $('adminApp').classList.remove('hidden');
  socketAuth(); renderAdmin();
}
if (sess.admin) adminShow();
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
    const c = await AF('/api/admin/centers', { method: 'POST', body: JSON.stringify({ name, code, phone: $('ncPhone').value.trim(), lat: 35.9, lng: 36.6, published: $('ncPub').checked }) }).then(r => r.json());
    if (c.error) return alert(c.error);
    alert('تمت إضافة المحطة — سلّم رمزها لطاقمها بشكل خاص');
    $('ncName').value = ''; $('ncCode').value = ''; $('ncPhone').value = '';
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
  $('adminCenters').innerHTML = centers.map(c => `<div class="rep"><b>${c.name}</b> ${c.published ? 'منشور' : 'مخفي'} — ${c.lat.toFixed(3)},${c.lng.toFixed(3)}${c.phone ? ' — ' + c.phone : ''}
    <div class="row"><button class="btn ghost" onclick="window._tglC('${c.id}',${c.published})">نشر/إخفاء</button><button class="btn ghost" onclick="window._rotC('${c.id}')">تدوير الرمز</button><button class="btn ghost" onclick="window._delC('${c.id}')">حذف</button></div></div>`).join('');
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
  $('citTrack').innerHTML = `<div class="rep"><b>بلاغك (${r.id})</b> <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}${r.centerName ? ' — ' + r.centerName : ''}</div>`;
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
}
route();
renderSubSelect();
// Citizen cross-device tracking: only his own report (phone required by server)
setInterval(async () => {
  if (!window._myLast || !window._myPhone || !navigator.onLine) return;
  try {
    const r = await fetch('/api/reports/' + window._myLast + '?phone=' + encodeURIComponent(window._myPhone)).then(x => x.ok ? x.json() : null);
    if (r) { const a = getReports(); const i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r; else a.push(r); store.set('med_reports', a); trackMine(); }
  } catch {}
}, 15000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
