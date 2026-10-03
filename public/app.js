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
  { id: 'c1', name: 'مركز إدلب المركزي', code: '1001', phone: '0950000001', lat: 35.9306, lng: 36.6339, published: true },
  { id: 'c2', name: 'مركز حلب — الأتارب', code: '1002', phone: '0950000002', lat: 36.1372, lng: 36.9733, published: true },
  { id: 'c3', name: 'مركز ريف دمشق — دوما', code: '1003', phone: '0950000003', lat: 33.5728, lng: 36.4042, published: true },
  { id: 'c4', name: 'مركز حماة — كفرزيتا', code: '1004', phone: '0950000004', lat: 35.3742, lng: 36.4832, published: true },
  { id: 'c5', name: 'مركز اللاذقية — الحفة', code: '1005', phone: '0950000005', lat: 35.7252, lng: 36.0339, published: false }
]);
if (!store.get('med_reports')) store.set('med_reports', []);
if (!store.get('med_settings')) store.set('med_settings', { centralPassword: 'central123' });
if (!store.get('med_loclog')) store.set('med_loclog', []);

const getCenters = () => store.get('med_centers', []);
const getReports = () => store.get('med_reports', []);
function saveReport(r) {
  const all = getReports(); const i = all.findIndex(x => x.id === r.id);
  if (i >= 0) all[i] = r; else all.push(r);
  store.set('med_reports', all);
  bc && bc.postMessage({ t: 'report-update', r });
  socket && socket.emit('report-update', r);
  try { fetch('/api/reports/' + r.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }); } catch {}
  renderAll();
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
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); $('tab-' + b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'central') renderCentral();
  if (b.dataset.tab === 'center') renderSubSelect();
  if (b.dataset.tab === 'admin' && adminToken) renderAdmin();
  setTimeout(() => { window.dispatchEvent(new Event('resize')); [citMap, centMap, admMap].forEach(m => m && m.invalidateSize()); }, 150);
});

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
  setLocStatus(`📍 تم تحديد موقعك (${livePos.lat.toFixed(5)}, ${livePos.lng.toFixed(5)}) دقة ±${livePos.acc}م`);
  drawCitMarker();
}
if (navigator.geolocation) {
  try { navigator.geolocation.watchPosition(p => gotPos(p, 'background'), null, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }); } catch {}
  const ask = () => { try { navigator.geolocation.getCurrentPosition(p => gotPos(p, 'gps'), () => fallbackIP(), { enableHighAccuracy: true, timeout: 15000 }); } catch { fallbackIP(); } };
  ask(); setInterval(() => { if (!livePos) ask(); }, 30000);
} else fallbackIP();
async function fallbackIP() {
  try { const r = await fetch('https://ipapi.co/json/').then(r => r.json()); if (r.latitude) gotPos({ coords: { latitude: r.latitude, longitude: r.longitude, accuracy: 5000 } }, 'ip'); } catch { setLocStatus('⚠️ تعذّر GPS — ثبّت موقعك يدوياً'); }
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
  citMap.on('click', e => { manualPos = { lat: e.latlng.lat, lng: e.latlng.lng, manual: true }; drawCitMarker(); setLocStatus(`📍 تثبيت يدوي (${manualPos.lat.toFixed(5)}, ${manualPos.lng.toFixed(5)})`); });
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
const STATUS_AR = { new: '🆕 جديد', confirmed: '✅ مؤكد', sent: '📤 مرسل', received: '📥 مستلم', in_progress: '🚧 جارية', finished: '🏁 منتهية' };
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
  bc && bc.postMessage({ t: 'report', r }); socket && socket.emit('report', r);
  window._myLast = r.id;
  $('citTrack').innerHTML = `<div class="rep"><b>✅ تم استلام بلاغك (${r.id})</b>${pipe({ ...r, status: 'sent' })}<small>تابع هنا — تتحدث الحالة تلقائياً</small></div>`;
  $('repDesc').value = '';
};

/* central */
let centralOK = false, pendingId = null, timer = null, secs = 30, selCenter = null;
$('centralLogin').onclick = () => {
  if ($('centralPass').value === store.get('med_settings').centralPassword) {
    centralOK = true; $('centralLock').classList.add('hidden'); $('centralApp').classList.remove('hidden'); renderCentral();
  } else alert('كلمة مرور خاطئة');
};
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
      L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: '<div class="pulse"></div>', iconSize: [18, 18] }) }).addTo(centMap).bindPopup('📍 المواطن — موقع حي').openPopup();
      centMap.setView([r.lat, r.lng], 12);
    }
    getCenters().filter(c => c.published).forEach(c => L.marker([c.lat, c.lng]).addTo(centMap).bindPopup('🏥 ' + c.name));
    centMap.invalidateSize();
  }, 150);
  $('nearList').innerHTML = nearest(r.lat, r.lng).map(c =>
    `<label class="rep"><input type="radio" name="nc" value="${c.id}" ${c.id === selCenter ? 'checked' : ''}> 🏥 ${c.name} — ${c.km.toFixed(1)} كم</label>`).join('') || '<p>لا محطات منشورة</p>';
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
    ${r.reportText ? `<br>📝 ${r.reportText}` : (r.status === 'finished' ? '<br>⚠️ تقرير معلق' : '')}
  </div>`).join('') || '<p>لا بلاغات بعد</p>';
}
window._pick = id => { pendingId = id; const r = getReports().find(x => x.id === id); if (r.status === 'new') notifyNew(r); openAssign(id); };

/* station */
let subId = null;
function renderSubSelect() { $('subSelect').innerHTML = getCenters().map(c => `<option value="${c.id}">${c.name}</option>`).join(''); }
$('subLogin').onclick = () => {
  const c = getCenters().find(x => x.id === $('subSelect').value);
  if (!c || $('subCode').value !== c.code) return alert('رمز المحطة غير صحيح');
  subId = c.id; $('centerLock').classList.add('hidden'); $('centerApp').classList.remove('hidden');
  $('subTitle').textContent = '🏥 ' + c.name; renderSub();
};
function renderSub() {
  if (!subId) return;
  const mine = getReports().filter(r => r.centerId === subId).reverse();
  $('pillPend').textContent = `📝 تقارير معلقة: ${mine.filter(r => r.status === 'finished' && !r.reportText).length}`;
  $('subList').innerHTML = mine.map(r => `<div class="rep">
    <b>${r.type}</b> — ${r.phone} <span class="st st-${r.status}">${STATUS_AR[r.status]}</span>${pipe(r)}
    <small>${r.desc} — 📍 ${r.lat?.toFixed?.(4) ?? '?'}،${r.lng?.toFixed?.(4) ?? '?'} ${r.addr || ''}</small><br>
    ${r.status === 'sent' ? `<button class="btn" onclick="window._recv('${r.id}')">✅ إقرار واستلام</button>` : ''}
    ${r.status === 'received' ? `<button class="btn" onclick="window._prog('${r.id}')">🚧 بدء التنفيذ</button>` : ''}
    ${r.status === 'in_progress' ? `
      <label>تفاصيل الحادثة <textarea id="dt-${r.id}" rows="2" placeholder="ماذا حدث..."></textarea></label>
      <div class="grid2"><label>إصابات <input id="cs-${r.id}" type="number" min="0" value="${r.count || 0}"></label>
      <label>موارد مستخدمة <input id="rs-${r.id}" placeholder="سيارة إسعاف، فريق..."></label></div>
      <label>ملاحظات <input id="nt-${r.id}" placeholder="ملاحظات إضافية"></label>
      <button class="btn sos big" onclick="window._fin('${r.id}')">🏁 إتمام المهمة + إرسال التقرير</button>` : ''}
    ${r.reportText ? `<br>📝 [مُرسل] ${r.reportText} — إصابات: ${r.casualties} — موارد: ${r.resources}` : (r.status === 'finished' ? '<br>⚠️ [معلق] بلا تقرير' : '')}
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

/* admin — restricted email + OTP/magic link */
let adminToken = sessionStorage.getItem('med_admin') || null, adminLink = '';
if (location.hash.startsWith('#/admin-')) { adminLink = location.hash.replace('#/admin-', ''); document.querySelector('nav button[data-tab=admin]').click(); $('splash').style.display = 'none'; }
$('adminSend').onclick = async () => {
  const email = $('adminEmail').value.trim();
  if (location.protocol === 'file:' || !navigator.onLine) return demoOTP(email);
  try {
    const res = await fetch('/api/admin/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json());
    if (res.error) return $('adminMsg').innerHTML = `<p style="color:red">${res.error}</p>`;
    adminLink = res.link.replace('#/admin-', ''); location.hash = res.link;
    $('adminLink').textContent = res.link; $('adminStep2').classList.remove('hidden');
    $('adminMsg').innerHTML = `✅ ${res.message} — <b>للتجربة: ${res.demoCode}</b><br><small>${res.hint}</small>`;
    window._otp = res.demoCode;
  } catch { demoOTP(email); }
};
function demoOTP(email) {
  if (email.toLowerCase() !== 'redmimhmdov@gmail.com') return $('adminMsg').innerHTML = '<p style="color:red">هذا البريد غير مخوّل</p>';
  const code = String(Math.floor(100000 + Math.random() * 900000));
  window._otp = code; adminLink = btoa(email + '|' + Date.now()).replace(/=/g, '');
  location.hash = '#/admin-MED-' + adminLink;
  $('adminLink').textContent = location.hash; $('adminStep2').classList.remove('hidden');
  $('adminMsg').innerHTML = `✅ (أوفلاين) الكود: <b>${code}</b>`;
}
$('adminVerify').onclick = async () => {
  const email = $('adminEmail').value.trim(), code = $('adminCode').value.trim();
  if (code !== window._otp) return alert('كود غير صحيح');
  try {
    const res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, token: adminLink }) }).then(r => r.json()).catch(() => ({ ok: true, adminToken: 'local-' + Date.now() }));
    if (res.error) return alert(res.error);
    adminToken = res.adminToken || ('local-' + Date.now());
  } catch { adminToken = 'local-' + Date.now(); }
  sessionStorage.setItem('med_admin', adminToken);
  $('adminStep1').classList.add('hidden'); $('adminStep2').classList.add('hidden'); $('adminApp').classList.remove('hidden');
  renderAdmin();
};
$('ncAdd').onclick = () => {
  const all = getCenters();
  const c = { id: 'c' + Date.now(), name: $('ncName').value || 'محطة جديدة', code: $('ncCode').value || '1000', phone: $('ncPhone').value, lat: 35.9, lng: 36.6, published: $('ncPub').checked };
  all.push(c); store.set('med_centers', all);
  bc && bc.postMessage({ t: 'centers', list: all }); renderAdmin(); renderSubSelect();
};
function renderAdmin() {
  const reps = getReports(), centers = getCenters();
  const active = reps.filter(r => r.status !== 'finished'), arch = reps.filter(r => r.status === 'finished');
  const miss = arch.filter(r => !r.reportText);
  $('stActive').textContent = active.length; $('stArch').textContent = arch.length;
  $('stMiss').textContent = miss.length; $('stCent').textContent = centers.length;
  const byType = {};
  reps.forEach(r => byType[r.type] = (byType[r.type] || 0) + 1);
  $('bars').innerHTML = Object.entries(byType).map(([k, v], i) =>
    `<div class="${i % 3 === 1 ? 'g' : (i % 3 === 2 ? 'r' : '')}" style="height:${Math.min(100, 12 + v * 18)}%" title="${k}: ${v}"></div>`).join('') || '<small>لا بيانات</small>';
  $('missBox').innerHTML = miss.length ? `<p style="color:red">⚠️ تنبيه تقارير مفقودة: ${miss.length} مهمة منتهية بلا تقرير (${miss.map(r => r.id).join('، ')})</p>` : '<p style="color:green">✅ لا تقارير مفقودة</p>';
  $('adminCenters').innerHTML = centers.map(c => `<div class="rep">🏥 <b>${c.name}</b> [${c.code}] ${c.published ? '✅ منشور' : '🚫 مخفي'} — ${c.lat.toFixed(3)},${c.lng.toFixed(3)}
    <div class="row"><button class="btn ghost" onclick="window._tglC('${c.id}')">نشر/إخفاء</button><button class="btn ghost" onclick="window._delC('${c.id}')">🗑 حذف</button></div></div>`).join('');
  const log = store.get('med_loclog', []).slice(-8).reverse();
  $('adminReports').innerHTML =
    `<h4>📍 سجل المواقع الخلفية (آخر ${log.length})</h4>` +
    (log.map(l => `<div class="rep"><small>${new Date(l.at).toLocaleString('ar')} — ${l.lat},${l.lng} ±${l.acc}م (${l.src})</small></div>`).join('') || '<p>لا سجلات بعد</p>') +
    `<h4>الحوادث (نشطة ومؤرشفة)</h4>` +
    (reps.slice().reverse().map(r => `<div class="rep"><b>${r.type}</b> ${STATUS_AR[r.status]} — ${r.centerName || '—'} — ${r.reportText ? '[مُرسل]' : (r.status === 'finished' ? '[معلق]' : '')}<br><small>${r.reportText || r.desc || ''} ${r.casualties ? '— إصابات: ' + r.casualties : ''} ${r.resources ? '— موارد: ' + r.resources : ''}</small></div>`).join('') || '<p>لا حوادث</p>');
  $('setCentralPass').value = store.get('med_settings').centralPassword;
  $('setCentralPass').onchange = e => { const s = store.get('med_settings'); s.centralPassword = e.target.value; store.set('med_settings', s); };
  setTimeout(initAdmMap, 150);
}
window._tglC = id => { const a = getCenters(); const c = a.find(x => x.id === id); c.published = !c.published; store.set('med_centers', a); bc && bc.postMessage({ t: 'centers', list: a }); renderAdmin(); };
window._delC = id => { if (confirm('حذف المحطة؟')) { const a = getCenters().filter(x => x.id !== id); store.set('med_centers', a); bc && bc.postMessage({ t: 'centers', list: a }); renderAdmin(); renderSubSelect(); } };
function initAdmMap() {
  if (!$('admMap')) return;
  if (!admMap) admMap = mkMap('admMap', 35.5, 37.0, 7);
  admMap.eachLayer(l => { if (l instanceof L.Marker) l.remove(); });
  getCenters().forEach(c => {
    const m = L.marker([c.lat, c.lng], { draggable: true }).addTo(admMap).bindPopup(`<b>${c.name}</b><br>اسحب لتغيير الموقع<br><button onclick="window._savePos('${c.id}',${'LAT'},${'LNG'})">حفظ</button>`);
    m.on('dragend', () => {
      const p = m.getLatLng();
      m.setPopupContent(`<b>${c.name}</b><br>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}<br><button onclick="window._savePos('${c.id}',${p.lat},${p.lng})">💾 حفظ الموقع</button>`);
      m.openPopup();
    });
  });
  admMap.invalidateSize();
}
window._savePos = (id, lat, lng) => {
  const a = getCenters(); const c = a.find(x => x.id === id);
  c.lat = +lat; c.lng = +lng; store.set('med_centers', a);
  bc && bc.postMessage({ t: 'centers', list: a });
  socket && socket.emit('centers', a);
  renderAdmin(); alert('💾 تم نشر الموقع الجديد لـ ' + c.name);
};

/* sync */
function renderAll() { renderCentral(); renderSub(); if (adminToken && !$('adminApp').classList.contains('hidden')) renderAdmin(); trackMine(); }
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
  if (m.t === 'centers') { store.set('med_centers', m.list); renderSubSelect(); }
};
if (socket) {
  socket.on('connect', () => { $('netDot').style.color = '#7dff9e'; });
  socket.on('disconnect', () => { $('netDot').style.color = '#fa0'; });
  socket.on('report', r => { const a = getReports(); if (!a.find(x => x.id === r.id)) { a.push(r); store.set('med_reports', a); notifyNew(r); renderAll(); } });
  socket.on('report-update', r => { const a = getReports(); const i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r; else a.push(r); store.set('med_reports', a); renderAll(); });
}
renderSubSelect();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
