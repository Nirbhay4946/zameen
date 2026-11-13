/* Zameen Register — land parcel records. All data stays on this device (IndexedDB) until you export a backup. */
(() => {
'use strict';
const G = window.Geo;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };
const fmtDate = t => t ? new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const today = () => new Date().toISOString().slice(0, 10);
const ft = m => G.fmtN(m * G.U.FT_PER_M, 1);
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };
let toastT;
function toast(msg, ms = 2600) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = msg; el.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => el.style.display = 'none', ms); }

// ---------------------------------------------------------------- DB
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('zameen', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('parcels', { keyPath: 'id' });
        const s = d.createObjectStore('docs', { keyPath: 'id' }); s.createIndex('parcelId', 'parcelId');
        d.createObjectStore('kv');
      };
      r.onsuccess = () => { this.db = r.result; this.db.onversionchange = () => this.db.close(); res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => out = r.result;
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all: s => DB.tx(s, 'readonly', st => st.getAll()),
  get: (s, k) => DB.tx(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => DB.tx(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)),
  del: (s, k) => DB.tx(s, 'readwrite', st => st.delete(k)),
  docsOf: pid => DB.tx('docs', 'readonly', st => st.index('parcelId').getAll(pid)),
  clear: s => DB.tx(s, 'readwrite', st => st.clear())
};

// ---------------------------------------------------------------- constants
const STATUS = [['owned', 'Owned (स्वामित्व)'], ['coowned', 'Co-owned / shared (साझा)'], ['ancestral', 'Ancestral, undivided (पैतृक अविभाजित)'], ['leased', 'Given on bataidari / lease (बटाई)'], ['mortgaged', 'Mortgaged (बंधक)'], ['disputed', 'Disputed (विवादित)'], ['proposed', 'Proposed purchase (खरीद प्रस्तावित)'], ['sold', 'Sold (बिक चुकी)']];
const STATUS_BADGE = { disputed: 'd', mortgaged: 'w', sold: 'g', proposed: 'w' };
const LANDTYPE = ['', 'Raiyati (रैयती)', 'Gair-majarua khas (गैरमजरुआ खास)', 'Gair-majarua aam (गैरमजरुआ आम)', 'Kaisar-e-hind', 'Bakasht', 'Khas mahal', 'Bhoodan', 'Basgit parcha', 'Other'];
const LANDCLASS = ['', 'Dhanhar (धनहर)', 'Bhith (भीठ)', 'Diara (दियारा)', 'Bagicha (बगीचा)', 'Awasiya / Bhitta (आवासीय)', 'Parti (परती)', 'Tand (टांड)', 'Don (दोन)', 'Pond (पोखर)', 'Other'];
const SURVEY = ['', 'CS (कैडस्ट्रल)', 'RS (रिविजनल)', 'BSS 2011 / New survey', 'Chakbandi (चकबंदी)', 'Other'];
const MODES = [['purchase', 'Purchase – Kewala (केवाला/बैनामा)'], ['inherit', 'Inheritance (वरासत/उत्तराधिकार)'], ['gift', 'Gift – Danpatra (दानपत्र)'], ['partition', 'Partition (बंटवारा)'], ['exchange', 'Exchange (अदला-बदली)'], ['will', 'Will (वसीयत)'], ['settle', 'Govt. settlement / Parcha (पर्चा)'], ['court', 'Court decree (न्यायालय आदेश)'], ['survey', 'Survey record entry (खतियान प्रविष्टि)'], ['sale', 'Sold to someone (बिक्री)'], ['lease', 'Lease / bataidari agreement'], ['other', 'Other']];
const MODE_T = Object.fromEntries(MODES);
const DOCTYPES = ['Kewala / Sale deed (केवाला)', 'Khatiyan (खतियान)', 'Jamabandi / Register-II (जमाबंदी)', 'Lagan receipt (लगान रसीद)', 'LPC (भूमि स्वामित्व प्रमाणपत्र)', 'Mutation order (दाखिल-खारिज)', 'Bhu-naksha / Map (नक्शा)', 'Amin measurement report (अमीन नापी)', 'Partition deed (बंटवारानामा)', 'Vanshavali / family tree (वंशावली)', 'Danpatra / Gift deed', 'Court order', 'Encumbrance / loan papers', 'Site photo (स्थल फोटो)', 'Boundary pillar photo (पिलर फोटो)', 'ID / other', 'Other'];
const MONUMENT = ['', 'Pucca pillar (पक्का पिलर)', 'Stone / khunta (खूंटा)', 'Ail / bund corner (आल/मेड़)', 'Tree (पेड़)', 'Wall corner (दीवार)', 'Road / nala edge', 'No mark (निशान नहीं)'];
const DIRS = [['N', 'North', 'उत्तर'], ['E', 'East', 'पूरब'], ['S', 'South', 'दक्षिण'], ['W', 'West', 'पश्चिम']];
const COLORS = ['#e53935', '#1e88e5', '#fdd835', '#8e24aa', '#00acc1', '#fb8c00', '#43a047', '#d81b60', '#3949ab', '#6d4c41'];
const LINKS = {
  Bihar: [['Bihar Bhumi (Jamabandi, Lagan, LPC, Mutation)', 'https://biharbhumi.bihar.gov.in/'], ['Bihar Bhu-Naksha (plot map)', 'https://bhunaksha.bihar.gov.in/']],
  Jharkhand: [['Jharbhoomi (Register-II, Lagan, Mutation)', 'https://jharbhoomi.jharkhand.gov.in/'], ['Jharkhand Bhu-Naksha', 'https://jharbhunaksha.jharkhand.gov.in/']]
};

const MANY = 30; // above this many points a boundary is treated as a walked track (no per-side tables/labels)
const many = p => p.pts.length > MANY;
const isKey = (q, i) => i === 0 || q.src !== 'walk' || /^K/.test(q.label || '');
function dirTotals(p) { const t = { N: 0, E: 0, S: 0, W: 0 }; G.edges(p.pts).forEach(e => t[e.f4] += e.len); return t; }
const dirTotalsHTML = p => { const t = dirTotals(p); return DIRS.map(([d, en, hi]) => `<div><span class="dirtag">${d}</span>${hi}: <b>${ft(t[d])} ft</b> <span class="mute">(${G.fmtN(t[d], 1)} m) of boundary faces ${en}</span></div>`).join(''); };
const BIHAR_D = ['Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 'Buxar', 'Darbhanga', 'East Champaran', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad', 'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali', 'West Champaran'];
const JHAR_D = ['Bokaro', 'Chatra', 'Deoghar', 'Dhanbad', 'Dumka', 'East Singhbhum', 'Garhwa', 'Giridih', 'Godda', 'Gumla', 'Hazaribagh', 'Jamtara', 'Khunti', 'Koderma', 'Latehar', 'Lohardaga', 'Pakur', 'Palamu', 'Ramgarh', 'Ranchi', 'Sahibganj', 'Seraikela Kharsawan', 'Simdega', 'West Singhbhum'];
const STATES = ['Bihar', 'Jharkhand', 'Uttar Pradesh', 'West Bengal', 'Odisha', 'Madhya Pradesh', 'Chhattisgarh', 'Delhi', 'Haryana', 'Rajasthan', 'Maharashtra', 'Karnataka', 'Telangana', 'Andhra Pradesh', 'Tamil Nadu', 'Kerala', 'Gujarat', 'Punjab', 'Uttarakhand', 'Himachal Pradesh', 'Assam', 'Sikkim', 'Goa'];
const S = { settings: null, parcels: [], cur: null, map: null, watch: null, cleanup: [] };
const DEF_SETTINGS = { title: 'Zameen Register', sys: 'bkd', katthaSqft: 1361.25, avgSec: 20, maxAcc: 20, walkStep: 1, lastBackup: 0, state: 'Bihar', district: 'East Champaran',
  tg: { token: '', chat: '', auto: true }, lastChange: 0, lastDocChange: 0, lastTg: 0, lastTgFull: 0 };

function newParcel() {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    name: '', status: 'owned', color: COLORS[S.parcels.length % COLORS.length],
    loc: { state: S.settings.state || 'Bihar', district: S.settings.district || '', anchal: '', halka: '', mauza: '', thana: '', panchayat: '' },
    rec: { khata: '', khesra: '', survey: '', ulpin: '', jamabandi: '', bhag: '', landType: '', landClass: '', csRaiyat: '', rsRaiyat: '', use: '' },
    area: { sys: S.settings.sys, katthaSqft: S.settings.katthaSqft, b: '', k: '', d: '', acre: '', dec: '', sqft: '', share: '' },
    rev: { lagan: '', laganFY: '', lpc: '', mutCase: '', mutStatus: '' },
    owners: [{ name: '', guardian: '', share: '', mobile: '' }],
    history: [],
    chau: { N: {}, E: {}, S: {}, W: {}, note: '' },
    pts: [],
    tape: { unit: 'ft', sides: [], diags: [] },
    lease: { tenant: '', terms: '', from: '', to: '' },
    tasks: [],
    walks: [],
    notes: ''
  };
}

// ---------------------------------------------------------------- save
const saveNow = async () => { if (!S.cur) return; S.cur.updatedAt = Date.now(); touch(); await DB.put('parcels', S.cur); const i = S.parcels.findIndex(p => p.id === S.cur.id); if (i >= 0) S.parcels[i] = S.cur; else S.parcels.push(S.cur); };
const queueSave = debounce(() => saveNow().catch(e => toast('Save failed: ' + e.message)), 350);
const saveParcel = async p => { p.updatedAt = Date.now(); touch(); await DB.put('parcels', p); const i = S.parcels.findIndex(x => x.id === p.id); if (i >= 0) S.parcels[i] = p; else S.parcels.push(p); };
const saveSettings = () => DB.put('kv', S.settings, 'settings');
const saveSettingsSoon = debounce(() => saveSettings().catch(() => { }), 800);
function touch(docs) { if (!S.settings) return; S.settings.lastChange = Date.now(); if (docs) S.settings.lastDocChange = Date.now(); saveSettingsSoon(); autoSoon(); }
const autoSoon = debounce(() => autoTg(), 90000);

// ---------------------------------------------------------------- sheets / dialogs
function sheet(html, onMount) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  $$('[data-close]', ov).forEach(b => b.onclick = close);
  if (onMount) onMount(ov.firstElementChild, close);
  return close;
}
function ask(msg, okText = 'OK', danger = false) {
  return new Promise(res => {
    sheet(`<h2>${h(msg)}</h2><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn ${danger ? 'd' : 'p'}" data-ok>${h(okText)}</button></div>`, (el, close) => {
      $('[data-x]', el).onclick = () => { close(); res(false); };
      $('[data-ok]', el).onclick = () => { close(); res(true); };
    });
  });
}

// ---------------------------------------------------------------- derived
const recSqft = p => { const v = G.recordSqft(p.area); return v; };
const gpsSqft = p => p.pts.length >= 3 ? G.areaM2(p.pts) * G.U.SQFT_PER_M2 : NaN;
const chainSqft = p => {
  const n = p.pts.length; if (n < 3) return NaN;
  const sides = [], diags = [];
  for (let i = 0; i < n; i++) sides.push(G.lenToFt(p.tape.sides[i], p.tape.unit));
  for (let i = 0; i < n - 3; i++) diags.push(G.lenToFt(p.tape.diags[i], p.tape.unit));
  return G.chainArea(sides, diags);
};
const ks = p => +p.area.katthaSqft || S.settings.katthaSqft;
const fmtA = (p, sqft) => G.fmtArea(sqft, p.area.sys, ks(p));
const fyStart = () => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };
const fyList = () => { const out = []; for (let y = fyStart() + 1; y >= 1990; y--) out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`); return out; };
const pTitle = p => p.name || [p.loc.mauza, p.rec.khesra && 'Khesra ' + p.rec.khesra].filter(Boolean).join(' · ') || 'Untitled parcel';

function warnings(p) {
  const w = [];
  if (p.status === 'sold') return w;
  if (p.pts.length < 3) w.push(['g', 'No boundary']);
  if (p.status !== 'proposed') {
    const fy = parseInt(p.rev.laganFY);
    if (!fy) w.push(['w', 'Lagan year not set']); else if (fy < fyStart()) w.push(['w', `Lagan unpaid ${fyStart() - fy} yr`]);
  }
  if (p.rev.mutStatus === 'pending') w.push(['w', 'Mutation pending']);
  if (p.status === 'disputed') w.push(['d', 'Dispute']);
  if (DIRS.some(([d]) => p.chau[d] && p.chau[d].mis)) w.push(['d', 'Chauhaddi mismatch']);
  const od = (p.tasks || []).filter(t => !t.done && t.due && t.due < today()).length;
  if (od) w.push(['d', od + ' overdue task' + (od > 1 ? 's' : '')]);
  return w;
}

// ---------------------------------------------------------------- map helpers
const TILE = {
  sat: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 22, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
  labels: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 22, attribution: '' }),
  osm: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap contributors' })
};
function makeMap(el, opts = {}) {
  if (S.map) { try { S.map.remove(); } catch (e) { } S.map = null; }
  const map = L.map(el, Object.assign({ zoomControl: !opts.fs, attributionControl: true, maxZoom: 22 }, opts.map || {}));
  const sat = L.layerGroup([TILE.sat(), TILE.labels()]), osm = TILE.osm();
  let pref = 'sat'; try { pref = localStorage.getItem('zr.layer') || 'sat'; } catch (e) { }
  (pref === 'osm' ? osm : sat).addTo(map);
  L.control.layers({ 'Satellite': sat, 'Street map': osm }, null, { position: opts.fs ? 'topright' : 'topright' }).addTo(map);
  map.on('baselayerchange', e => { try { localStorage.setItem('zr.layer', e.layer === osm ? 'osm' : 'sat'); } catch (x) { } });
  map.setView([25.6, 85.1], 7);
  if (!opts.keep) S.map = map;
  return map;
}
const vxIcon = (i, cls = '') => L.divIcon({ className: 'vx ' + cls, html: String(i + 1), iconSize: null });
function drawParcel(map, p, o = {}) {
  const g = L.featureGroup().addTo(map);
  if (p.pts.length >= 2) {
    const ll = p.pts.map(q => [q.lat, q.lng]);
    (p.pts.length >= 3 ? L.polygon(ll, { color: p.color || '#e53935', weight: 3, fillOpacity: .18 }) : L.polyline(ll, { color: p.color, weight: 3 })).addTo(g);
    if (o.lengths !== false && !many(p)) G.edges(p.pts).forEach(e => {
      const a = p.pts[e.i], b = p.pts[e.j];
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, icon: L.divIcon({ className: 'lbl', html: ft(e.len) + ' ft', iconSize: null }) }).addTo(g);
    });
  }
  if (o.corners !== false) p.pts.forEach((q, i) => { if (!many(p) || isKey(q, i)) L.marker([q.lat, q.lng], { icon: vxIcon(i, q.src === 'walk' && i ? 'sm' : ''), interactive: false }).addTo(g); });
  return g;
}

// ---------------------------------------------------------------- GPS
function startWatch(cb, err) {
  stopWatch();
  if (!navigator.geolocation) { err && err({ code: 0, message: 'This browser has no GPS access' }); return; }
  S.watch = navigator.geolocation.watchPosition(pos => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp, alt: pos.coords.altitude }),
    e => err && err(e), { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
}
function stopWatch() { if (S.watch != null) { navigator.geolocation.clearWatch(S.watch); S.watch = null; } }
const accClass = a => a == null ? '' : a <= 5 ? 'g' : a <= 12 ? 'y' : 'r';
const gpsErrText = e => e.code === 1 ? 'Location permission denied. Allow location for this site in browser settings.' : e.code === 2 ? 'GPS unavailable — turn on Location (High accuracy) and go to open sky.' : e.code === 3 ? 'Waiting for GPS… (timeout, still trying)' : (e.message || 'GPS error');
let wakeLock = null;
async function keepAwake(on) { try { if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) { } }

// ---------------------------------------------------------------- router
const main = () => $('main');
function setHeader(title, back, extra = '') {
  $('header.top').innerHTML = `${back ? `<button class="ib" id="hBack" aria-label="Back">←</button>` : `<span style="font-size:20px;padding:0 4px">🌾</span>`}<h1>${h(title)}</h1>${extra}`;
  if (back) $('#hBack').onclick = () => { if (typeof back === 'string') location.hash = back; else history.back(); };
}
async function route() {
  queueSave.flush && S.cur && await saveNow();
  S.cleanup.forEach(f => { try { f(); } catch (e) { } }); S.cleanup = [];
  stopWatch(); keepAwake(false);
  if (S.map) { try { S.map.remove(); } catch (e) { } S.map = null; }
  document.body.classList.remove('fs');
  $('header.top').style.display = '';
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  const [v, id, tab] = parts;
  const p = id ? S.parcels.find(x => x.id === id) : null;
  if (id && !p && v !== 'new') { location.hash = '#/'; return; }
  S.cur = p || null;
  window.scrollTo(0, 0);
  if (v === 'p') return viewParcel(p, tab || 'info');
  if (v === 'cap') return viewCapture(p);
  if (v === 'find') return viewFind(p);
  if (v === 'map') return viewAllMap();
  if (v === 'set') return viewSettings();
  if (v === 'rep') return viewReport(p);
  if (v === 'help') return viewHelp();
  return viewHome();
}

// ---------------------------------------------------------------- HOME
function viewHome() {
  setHeader(S.settings.title, null, `<button class="ib" onclick="location.hash='#/help'" aria-label="Glossary">📖</button><button class="ib" onclick="location.hash='#/map'" aria-label="Map">🗺️</button><button class="ib" onclick="location.hash='#/set'" aria-label="Settings">⚙️</button>`);
  const act = S.parcels.filter(p => p.status !== 'sold' && p.status !== 'proposed');
  const totRec = act.reduce((s, p) => s + (recSqft(p) || 0), 0);
  const totGps = act.reduce((s, p) => s + (gpsSqft(p) || 0), 0);
  const mapped = act.filter(p => p.pts.length >= 3).length;
  const sinceBk = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
  const list = S.parcels.slice().sort((a, b) => (a.status === 'sold') - (b.status === 'sold') || pTitle(a).localeCompare(pTitle(b)));
  main().innerHTML = `
    ${S.parcels.length && (sinceBk == null || sinceBk > 30) ? `<div class="banner w">💾 ${sinceBk == null ? 'No backup taken yet.' : `Last backup ${sinceBk} days ago.`} Your records live only on this phone — <a href="#/set">take a backup</a> and send it to Telegram/Drive.</div>` : ''}
    ${S.parcels.length ? `<div class="stats" style="margin-bottom:12px">
      <div class="stat"><b>${act.length}</b><span>parcels held</span></div>
      <div class="stat"><b>${totRec ? G.fmtN(totRec / G.U.DECIMAL_SQFT, 1) : '—'}</b><span>decimal (record)</span></div>
      <div class="stat"><b>${mapped}/${act.length}</b><span>GPS mapped</span></div></div>
      ${totRec ? `<div class="small mute" style="margin:-4px 2px 12px">Record total: ${G.fmtBKD(totRec, S.settings.katthaSqft)} · ${G.fmtN(totRec / G.U.ACRE_SQFT, 3)} acre${totGps ? ` · GPS-measured total: ${G.fmtN(totGps / G.U.DECIMAL_SQFT, 1)} dec` : ''}</div>` : ''}
      <input class="i" id="q" placeholder="🔎 Search mauza, khata, khesra, owner, neighbour…" style="margin-bottom:12px">` : ''}
    <div id="plist"></div>
    ${!S.parcels.length ? `<div class="card empty"><div style="font-size:44px">🌾</div><h3 style="justify-content:center">Start your land register</h3>
      <p>Add each parcel with its khata–khesra, documents, previous owners and chauhaddi. Then stand at each corner with your phone to record the boundary.</p>
      <button class="btn p" id="new0">+ Add first parcel</button>
      <p class="small">Already have a backup? <a href="#/set">Restore it</a></p></div>` : ''}
    <button class="btn p fab" id="newp">+ Parcel</button>`;
  const renderList = q => {
    q = (q || '').toLowerCase().trim();
    const items = list.filter(p => !q || JSON.stringify([p.name, p.loc, p.rec, p.owners, p.chau, p.history.map(x => [x.from, x.to, x.deedNo])]).toLowerCase().includes(q));
    $('#plist').innerHTML = items.map(p => {
      const r = recSqft(p), g = gpsSqft(p);
      const st = STATUS.find(s => s[0] === p.status);
      return `<a class="card pcard" href="#/p/${p.id}">
        <div class="row"><span class="swatch" style="background:${h(p.color)}"></span><span class="t grow">${h(pTitle(p))}</span>${p.status !== 'owned' ? `<span class="badge ${STATUS_BADGE[p.status] || ''}">${h(st[1].split(' (')[0])}</span>` : ''}</div>
        <div class="small mute">${h([p.loc.mauza && 'Mauza ' + p.loc.mauza, p.loc.anchal, p.loc.district].filter(Boolean).join(', ') || 'Location not filled')}</div>
        <div class="small">${p.rec.khata ? 'Khata <b>' + h(p.rec.khata) + '</b> · ' : ''}${p.rec.khesra ? 'Khesra <b>' + h(p.rec.khesra) + '</b>' : ''}</div>
        <div class="small">Record: <b>${fmtA(p, r)}</b>${isFinite(g) ? ` · GPS: <b>${fmtA(p, g)}</b>` : ''}</div>
        <div>${warnings(p).map(([c, t]) => `<span class="badge ${c}">${h(t)}</span>`).join('')}</div></a>`;
    }).join('') || (q ? '<div class="empty">No match</div>' : '');
  };
  renderList();
  const qi = $('#q'); if (qi) qi.oninput = () => renderList(qi.value);
  const add = async () => { const p = newParcel(); await saveParcel(p); location.hash = '#/p/' + p.id + '/info'; };
  $('#newp').onclick = add; const n0 = $('#new0'); if (n0) n0.onclick = add;
}

// ---------------------------------------------------------------- field helpers
const val = p => { const v = getP(S.cur, p); return v == null ? '' : v; };
const fld = (label, k, o = {}) => `<div class="fld ${o.cls || ''}"><label class="f">${label}</label><input class="i" data-k="${k}" value="${h(val(k))}" ${o.type ? `type="${o.type}"` : ''} ${o.num ? 'inputmode="decimal" data-num' : ''} ${o.ph ? `placeholder="${h(o.ph)}"` : ''} ${o.re ? 'data-re' : ''} ${o.list ? `list="${o.list}"` : ''}></div>`;
const sel = (label, k, opts, o = {}) => `<div class="fld ${o.cls || ''}"><label class="f">${label}</label><select class="i" data-k="${k}" ${o.re ? 'data-re' : ''}>${opts.map(x => { const [v, t] = Array.isArray(x) ? x : [x, x || '—']; return `<option value="${h(v)}" ${String(val(k)) === String(v) ? 'selected' : ''}>${h(t)}</option>`; }).join('')}</select></div>`;
const ta = (label, k, o = {}) => `<div class="fld"><label class="f">${label}</label><textarea class="i" data-k="${k}" ${o.ph ? `placeholder="${h(o.ph)}"` : ''}>${h(val(k))}</textarea></div>`;

function bindAutosave(root, onRe) {
  const hnd = e => {
    const el = e.target.closest('[data-k]'); if (!el || !S.cur) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.hasAttribute('data-num')) v = v === '' ? '' : (isFinite(+v) ? +v : v);
    setP(S.cur, el.dataset.k, v); queueSave();
    if (el.hasAttribute('data-re') && onRe) onRe(el);
  };
  if (root._zrH) { root.removeEventListener('input', root._zrH); root.removeEventListener('change', root._zrH); }
  root._zrH = hnd; root.addEventListener('input', hnd); root.addEventListener('change', hnd);
}

// ---------------------------------------------------------------- PARCEL
const TABS = [['info', 'Details'], ['bound', 'Boundary'], ['chau', 'Chauhaddi'], ['own', 'Ownership'], ['docs', 'Documents'], ['more', 'Tasks & notes']];
async function viewParcel(p, tab) {
  setHeader(pTitle(p), '#/', `<button class="ib" onclick="location.hash='#/rep/${p.id}'" title="Report" aria-label="Report">📄</button><button class="ib" id="pMenu" aria-label="More">⋮</button>`);
  $('#pMenu').onclick = () => parcelMenu(p);
  main().innerHTML = `<nav class="tabs">${TABS.map(([k, t]) => `<a href="#/p/${p.id}/${k}" class="${k === tab ? 'on' : ''}">${t}</a>`).join('')}</nav><div id="tabc"></div>`;
  const c = $('#tabc');
  const tabEl = $('.tabs a.on'); if (tabEl) tabEl.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (tab === 'info') tabInfo(p, c);
  else if (tab === 'bound') tabBound(p, c);
  else if (tab === 'chau') tabChau(p, c);
  else if (tab === 'own') tabOwn(p, c);
  else if (tab === 'docs') await tabDocs(p, c);
  else tabMore(p, c);
}
function parcelMenu(p) {
  sheet(`<h2>${h(pTitle(p))}</h2>
    <div class="fld"><button class="btn full" data-a="rep">📄 Printable record / PDF</button></div>
    <div class="fld"><button class="btn full" data-a="kml">🌍 Export KML (Google Earth)</button></div>
    <div class="fld"><button class="btn full" data-a="md">📝 Export Obsidian note (.md)</button></div>
    <div class="fld"><button class="btn full" data-a="dup">⧉ Duplicate (e.g. adjoining khesra)</button></div>
    <div class="fld"><button class="btn d full" data-a="del">🗑 Delete parcel</button></div>
    <button class="btn full" data-close>Close</button>`, (el, close) => {
    el.onclick = async e => {
      const a = e.target.closest('[data-a]'); if (!a) return; close();
      const k = a.dataset.a;
      if (k === 'rep') location.hash = '#/rep/' + p.id;
      if (k === 'kml') saveOrShare(new Blob([toKML([p])], { type: 'application/vnd.google-earth.kml+xml' }), safeName(pTitle(p)) + '.kml');
      if (k === 'md') saveOrShare(new Blob([toMD(p, await DB.docsOf(p.id), null)], { type: 'text/markdown' }), safeName(pTitle(p)) + '.md');
      if (k === 'dup') { const q = JSON.parse(JSON.stringify(p)); q.id = uid(); q.name = (p.name || pTitle(p)) + ' (copy)'; q.pts = []; q.tape = { unit: 'ft', sides: [], diags: [] }; q.createdAt = Date.now(); q.color = COLORS[S.parcels.length % COLORS.length]; await saveParcel(q); location.hash = '#/p/' + q.id + '/info'; }
      if (k === 'del') {
        if (!await ask(`Delete "${pTitle(p)}" and all its documents from this phone?`, 'Delete', true)) return;
        for (const d of await DB.docsOf(p.id)) await DB.del('docs', d.id);
        await DB.del('parcels', p.id); touch(true); S.parcels = S.parcels.filter(x => x.id !== p.id); S.cur = null; location.hash = '#/'; toast('Deleted');
      }
    };
  });
}

function areaCompareHTML(p) {
  const r = recSqft(p), g = gpsSqft(p), c = chainSqft(p);
  let sig = p.pts.length >= 3 && p.pts.every(q => q.acc != null) ? G.areaSigma(p.pts, p.pts.map(q => q.acc || 0)) * G.U.SQFT_PER_M2 : NaN;
  if (p.pts.length >= 3 && p.pts.some(q => q.src === 'walk')) { // walked tracks: errors are correlated along the path (~10 m), so estimate from perimeter
    const acc = p.pts.filter(q => q.acc).map(q => q.acc).sort((a, b) => a - b); const med = acc.length ? acc[Math.floor(acc.length / 2)] : 5;
    sig = Math.max(isFinite(sig) ? sig : 0, med * Math.sqrt(G.perimeter(p.pts) * 5) * G.U.SQFT_PER_M2);
  }
  const diff = (a) => isFinite(a) && isFinite(r) ? ((a - r) / r * 100) : NaN;
  const dTxt = d => !isFinite(d) ? '' : `<span class="badge ${Math.abs(d) > 10 ? 'd' : Math.abs(d) > 4 ? 'w' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)}% vs record</span>`;
  const row = (t, a, extra = '') => `<tr><td>${t}</td><td><b>${fmtA(p, a)}</b>${isFinite(a) && p.area.sys !== 'acre' ? `<div class="tiny mute">${G.fmtAcre(a)}</div>` : ''}${isFinite(a) && p.area.sys === 'acre' ? `<div class="tiny mute">${G.fmtBKD(a, ks(p))}</div>` : ''}${extra}</td></tr>`;
  return `<table class="t">
    ${row('As per record / deed', r)}
    ${row('GPS measured', g, isFinite(g) ? `${isFinite(sig) && sig > 0 ? `<div class="tiny mute">± ${fmtA(p, sig)} (${p.pts.some(q => q.src === 'walk') ? 'rough, conservative — compare two walks for the real check' : '1σ from corner accuracy'})</div>` : ''}${dTxt(diff(g))}` : `<div class="tiny mute">Record the boundary in the Boundary tab</div>`)}
    ${row('Tape / chain (Heron)', c, isFinite(c) ? dTxt(diff(c)) : `<div class="tiny mute">Enter tape lengths + diagonals in Boundary tab</div>`)}
  </table>`;
}

let e_stateTimer = null;
function tabInfo(p, c) {
  const links = LINKS[p.loc.state] || [];
  c.innerHTML = `
  <div class="card"><h3>Parcel</h3>
    ${fld('Name / nickname (e.g. "Nahar wala khet")', 'name', { re: 1 })}
    <div class="grid2">${sel('Status', 'status', STATUS)}
    <div class="fld"><label class="f">Map colour</label><input type="color" class="i" data-k="color" value="${h(p.color)}" style="padding:4px"></div></div>
  </div>
  <datalist id="dlStates">${STATES.map(x => `<option value="${x}">`).join('')}</datalist>
  <datalist id="dlDist">${(p.loc.state === 'Jharkhand' ? JHAR_D : p.loc.state === 'Bihar' ? BIHAR_D : BIHAR_D.concat(JHAR_D)).map(x => `<option value="${x}">`).join('')}</datalist>
  <div class="card"><h3>Location (स्थान)</h3>
    <div class="grid2">
      ${fld('State (राज्य)', 'loc.state', { re: 1, list: 'dlStates' })}
      ${fld('District (जिला)', 'loc.district', { list: 'dlDist' })}
      ${fld('Anchal / Circle (अंचल)', 'loc.anchal')}
      ${fld('Halka (हल्का)', 'loc.halka')}
      ${fld('Mauza / Village (मौजा)', 'loc.mauza', { re: 1 })}
      ${fld('Thana no. (थाना नं.)', 'loc.thana')}
      ${fld('Panchayat', 'loc.panchayat', { cls: '' })}
    </div>
  </div>
  <div class="card"><h3>Revenue record (राजस्व अभिलेख)</h3>
    <div class="grid2">
      ${fld('Khata no. (खाता)', 'rec.khata', { re: 1 })}
      ${fld('Khesra / Plot no. (खेसरा)', 'rec.khesra', { re: 1, ph: 'e.g. 412, 413/2' })}
      ${sel('Survey', 'rec.survey', SURVEY)}
      ${fld('ULPIN / Bhu-Aadhaar (14 digit)', 'rec.ulpin')}
      ${fld('Jamabandi no. (जमाबंदी)', 'rec.jamabandi')}
      ${fld('Bhag / Pristha (भाग/पृष्ठ)', 'rec.bhag')}
      ${sel('Land type (किस्म)', 'rec.landType', LANDTYPE)}
      ${sel('Land class', 'rec.landClass', LANDCLASS)}
      ${fld('CS khatiyan raiyat (नाम)', 'rec.csRaiyat')}
      ${fld('RS khatiyan raiyat (नाम)', 'rec.rsRaiyat')}
    </div>
    ${fld('Current use (crop, orchard, house, pond…)', 'rec.use')}
  </div>
  <div class="card"><h3>Area (रकबा)</h3>
    <div class="grid2">
      ${sel('Unit system', 'area.sys', [['bkd', 'Bigha–Kattha–Dhur'], ['acre', 'Acre–Decimal'], ['sqft', 'Square feet']], { re: 1 })}
      ${fld('1 Kattha = sq ft (local)', 'area.katthaSqft', { num: 1, re: 1 })}
    </div>
    <div id="areaIn"></div>
    ${fld('Your share (हिस्सा), if co-owned', 'area.share', { ph: 'e.g. 1/3 or 50%' })}
    <div class="hint">Standard Bihar kattha = 1361.25 sq ft (also the usual value for East Champaran), but old local measures differ. Many kewalas write the area in both decimal and bigha–kattha — use that to check: <a href="#" id="calK">Find kattha size from my deed</a>. 1 decimal = 435.6 sq ft.</div>
    <div id="areaCmp" style="margin-top:10px"></div>
  </div>
  <div class="card"><h3>Lagan, LPC & mutation</h3>
    <div class="grid2">
      ${fld('Annual lagan ₹', 'rev.lagan', { num: 1 })}
      ${sel('Lagan paid up to FY', 'rev.laganFY', [['', '—'], ...fyList()])}
      ${fld('LPC no. / date', 'rev.lpc')}
      ${fld('Mutation case no. (दाखिल-खारिज)', 'rev.mutCase')}
      ${sel('Mutation status', 'rev.mutStatus', [['', '—'], ['done', 'Done / in my name'], ['pending', 'Pending'], ['rejected', 'Rejected'], ['na', 'Not needed']])}
    </div>
  </div>
  ${['leased', 'mortgaged'].includes(p.status) ? `<div class="card"><h3>${p.status === 'leased' ? 'Bataidar / lessee' : 'Mortgage'}</h3>
    ${fld(p.status === 'leased' ? 'Tenant name & mobile' : 'Bank / lender', 'lease.tenant')}
    <div class="grid2">${fld('From', 'lease.from', { type: 'date' })}${fld('To', 'lease.to', { type: 'date' })}</div>
    ${ta('Terms (share, rent, loan amount…)', 'lease.terms')}</div>` : ''}
  ${links.length ? `<div class="card"><h3>Official portals</h3>${links.map(([t, u]) => `<div class="fld"><a href="${u}" target="_blank" rel="noopener">${h(t)} ↗</a></div>`).join('')}<div class="hint">Check jamabandi & naksha there using the khata/khesra above. Save the downloaded PDFs in Documents.</div></div>` : ''}
  `;
  const areaIn = () => {
    const s = p.area.sys;
    $('#areaIn').innerHTML = s === 'acre' ? `<div class="grid2">${fld('Acre', 'area.acre', { num: 1, re: 1 })}${fld('Decimal (डिसमिल)', 'area.dec', { num: 1, re: 1 })}</div>`
      : s === 'sqft' ? fld('Square feet', 'area.sqft', { num: 1, re: 1 })
        : `<div class="grid3">${fld('Bigha', 'area.b', { num: 1, re: 1 })}${fld('Kattha', 'area.k', { num: 1, re: 1 })}${fld('Dhur', 'area.d', { num: 1, re: 1 })}</div>`;
  };
  const cmp = () => { $('#areaCmp').innerHTML = areaCompareHTML(p); };
  areaIn(); cmp();
  $('#calK', c).onclick = e => { e.preventDefault(); sheet(`<h2>Kattha size from your deed</h2><p class="small">If the deed / khatiyan gives the same land in both units, enter both:</p>
    <div class="grid2"><div class="fld"><label class="f">Acre</label><input class="i" id="ca" inputmode="decimal"></div><div class="fld"><label class="f">Decimal</label><input class="i" id="cd" inputmode="decimal"></div></div>
    <div class="grid3"><div class="fld"><label class="f">Bigha</label><input class="i" id="cb" inputmode="decimal"></div><div class="fld"><label class="f">Kattha</label><input class="i" id="ck" inputmode="decimal"></div><div class="fld"><label class="f">Dhur</label><input class="i" id="cdh" inputmode="decimal"></div></div>
    <div class="banner i" id="cres">Enter both areas.</div><label class="chk small"><input type="checkbox" id="cdef">Also make this the default for new parcels</label>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-close>Cancel</button><button class="btn p" id="cuse" disabled>Use it</button></div>`, (el, close) => {
      let ksv = NaN;
      const calc = () => { const sq = (+$('#ca', el).value || 0) * 43560 + (+$('#cd', el).value || 0) * 435.6; const kt = (+$('#cb', el).value || 0) * 20 + (+$('#ck', el).value || 0) + (+$('#cdh', el).value || 0) / 20; ksv = sq > 0 && kt > 0 ? sq / kt : NaN;
        $('#cres', el).innerHTML = isFinite(ksv) ? `1 kattha = <b>${G.fmtN(ksv, 2)} sq ft</b> (1 bigha = ${G.fmtN(ksv * 20, 0)} sq ft)${Math.abs(ksv - 1361.25) / 1361.25 < 0.03 ? ' — matches the standard Bihar measure.' : ' — differs from the standard 1361.25.'}` : 'Enter both areas.'; $('#cuse', el).disabled = !isFinite(ksv); };
      $$('input', el).forEach(i => i.oninput = calc);
      $('#cuse', el).onclick = async () => { p.area.katthaSqft = Math.round(ksv * 100) / 100; if ($('#cdef', el).checked) { S.settings.katthaSqft = p.area.katthaSqft; await saveSettings(); } await saveNow(); close(); tabInfo(p, c); };
    }); };
  bindAutosave(c, el => {
    if (el.dataset.k === 'area.sys') areaIn();
    if (el.dataset.k === 'loc.state') {
      if (e_stateTimer) clearTimeout(e_stateTimer);
      e_stateTimer = setTimeout(() => { if (p.loc.state === 'Jharkhand' && p.area.sys === 'bkd' && !isFinite(recSqft(p))) p.area.sys = 'acre'; saveParcel(p).then(() => { if (!c.isConnected || S.cur !== p) return; const y = window.scrollY; tabInfo(p, c); window.scrollTo(0, y); }); }, 900);
      return;
    }
    if (el.dataset.k === 'status') { saveNow().then(() => tabInfo(p, c)); return; }
    if (['name', 'loc.mauza', 'rec.khesra'].includes(el.dataset.k)) $('header.top h1').textContent = pTitle(p);
    cmp();
  });
  // status change re-render handled above; also listen 'status'
  $('[data-k="status"]', c).setAttribute('data-re', '');
}

// ---------------------------------------------------------------- BOUNDARY TAB
function walkHistoryHTML(p) {
  const W = p.walks.slice().reverse(); const ar = W.filter(w => w.kind === 'walk').map(w => w.area);
  const spread = ar.length > 1 ? (Math.max(...ar) - Math.min(...ar)) / (ar.reduce((a, b) => a + b, 0) / ar.length) * 100 : NaN;
  return `<div class="card"><h3>Walks & history</h3>
    ${isFinite(spread) ? `<div class="banner ${spread > 8 ? 'w' : 'i'} small">Your ${ar.length} walked loops differ by <b>${spread.toFixed(1)}%</b> in area. ${spread > 8 ? 'Walk once more, slowly, under open sky.' : 'Good repeatability.'}</div>` : '<div class="small mute" style="margin-bottom:6px">Tip: walk the loop a second time (another day or the other direction). If the two areas agree, you can trust the shape.</div>'}
    <table class="t"><tr><th>When</th><th>Points</th><th>Area</th><th></th></tr>${W.map(w => `<tr><td class="small">${new Date(w.t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}<div class="tiny mute">${w.kind === 'walk' ? 'walked loop' + (w.gap != null ? ', gap ' + w.gap + ' m' : '') : 'earlier boundary'}</div></td>
      <td>${w.pts.length}</td><td class="small">${fmtA(p, w.area * G.U.SQFT_PER_M2)}<div class="tiny mute">${G.fmtN(w.area * G.U.SQFT_PER_M2 / G.U.DECIMAL_SQFT, 2)} dec</div></td>
      <td><button class="btn s" data-wu="${w.id}">Use</button> <button class="btn s" data-wx="${w.id}">✕</button></td></tr>`).join('')}</table></div>`;
}
function tabBound(p, c) {
  const n = p.pts.length, E = G.edges(p.pts);
  const u = p.tape.unit;
  c.innerHTML = `
  <div class="card" style="padding:8px"><div class="minimap" id="mm"></div>
    <div class="row" style="margin-top:8px"><button class="btn p grow" onclick="location.hash='#/cap/${p.id}'">📍 ${n ? 'Edit / add corners' : 'Record boundary with GPS'}</button>
    ${n ? `<button class="btn" onclick="location.hash='#/find/${p.id}'">🧭 Find / check</button>` : ''}</div></div>
  ${n >= 3 ? `<div class="card"><h3>Area</h3><div id="areaCmp">${areaCompareHTML(p)}</div>
    <div class="small mute" style="margin-top:6px">Perimeter ${ft(G.perimeter(p.pts))} ft (${G.fmtN(G.perimeter(p.pts), 1)} m) · ${n} points${many(p) ? ' (walked track — perimeter includes small GPS wiggles, so it reads a little long)' : ''}</div></div>` : ''}
  ${(p.walks || []).length ? walkHistoryHTML(p) : ''}
  ${n ? `<${many(p) ? 'details' : 'div'} class="card">${many(p) ? `<summary>All ${n} boundary points (tap to list)</summary>` : '<h3>Corners (कोना)</h3>'}<div class="scroll-x"><table class="t"><tr><th>#</th><th>Name / mark</th><th>Lat, Lng</th><th>±m</th></tr>
    ${p.pts.map((q, i) => `<tr><td><b>${i + 1}</b></td><td>${h(q.label || 'C' + (i + 1))}<div class="tiny mute">${h(q.mon || '')}${q.adj ? ' · moved on map' : ''}${q.src === 'map' ? ' · placed on map' : q.src === 'walk' ? ' · walked' : q.src === 'import' ? ' · imported' : q.src === 'paste' ? ' · typed' : q.sessions ? ` · ${q.sessions.length} GPS session${q.sessions.length > 1 ? 's' : ''}` : ''}</div></td>
      <td class="tiny">${q.lat.toFixed(7)},<br>${q.lng.toFixed(7)}</td><td>${q.acc != null ? `<span class="badge ${accClass(q.acc) === 'g' ? '' : accClass(q.acc) === 'y' ? 'w' : 'd'}">${q.acc}</span>` : '<span class="badge g">?</span>'}</td></tr>`).join('')}
    </table></div><div class="hint">Green ≤5 m, amber ≤12 m, red worse. Re-measure poor corners at another time of day — sessions are averaged.</div></${many(p) ? 'details' : 'div'}>` : ''}
  ${many(p) ? `<div class="card"><h3>Boundary by direction</h3><div class="small">${dirTotalsHTML(p)}</div></div>` : ''}
  ${n >= 2 && !many(p) ? `<div class="card"><h3>Sides & tape check (भुजा)<span class="sp"></span>
      <span class="seg" id="tu">${['ft', 'm', 'kadi', 'gaj'].map(x => `<button data-u="${x}" class="${u === x ? 'on' : ''}">${x}</button>`).join('')}</span></h3>
    <div class="scroll-x"><table class="t"><tr><th>Side</th><th>Faces</th><th>GPS</th><th>Tape (${u})</th><th>Δ</th></tr>
    ${E.map(e => `<tr><td>${e.i + 1}→${e.j + 1}</td><td><span class="badge">${e.f8}</span><div class="tiny mute">${G.hindiDir(e.f8)}</div></td><td>${ft(e.len)} ft<div class="tiny mute">${G.fmtN(e.len, 2)} m</div></td>
      <td><input class="i" style="width:84px;min-height:36px;padding:6px" inputmode="decimal" data-num data-re data-k="tape.sides.${e.i}" value="${h(p.tape.sides[e.i] ?? '')}"></td><td class="small" id="dl${e.i}"></td></tr>`).join('')}
    </table></div>
    ${n >= 4 && n <= 12 ? `<div style="margin-top:10px"><b class="small">Diagonals from corner 1 (for chain-survey area)</b><div class="grid3" style="margin-top:6px">
      ${Array.from({ length: n - 3 }, (_, k) => `<div><label class="f">1→${k + 3} (${u})</label><input class="i" inputmode="decimal" data-num data-re data-k="tape.diags.${k}" value="${h(p.tape.diags[k] ?? '')}"><div class="tiny mute">GPS ${ft(G.dist(p.pts[0], p.pts[k + 2]))} ft</div></div>`).join('')}
    </div></div>` : ''}
    <div class="hint">Measure each side with a tape/chain (1 kadi = 0.66 ft). With sides + diagonals, area is computed by triangles (Heron) — independent of GPS. Big Δ on one side = that corner needs re-measuring.</div></div>` : ''}
  <div class="card"><h3>Import / enter coordinates</h3>
    <div class="row"><label class="btn s">📂 KML / KMZ / GPX / GeoJSON<input type="file" id="imf" accept=".kml,.kmz,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/gpx+xml" hidden></label>
    <button class="btn s" id="paste">⌨️ Paste lat,lng list</button>${n ? `<button class="btn s d" id="clr">Clear boundary</button>` : ''}</div>
    <div class="hint">Use this if a surveyor/amin gives coordinates, or you trace the plot in Google Earth / Bhu-Naksha and export KML.</div></div>`;
  // minimap
  setTimeout(() => {
    const map = makeMap('mm', { map: { zoomControl: true } });
    const g = drawParcel(map, p);
    if (n) map.fitBounds(g.getBounds().pad(0.3), { maxZoom: 20 }); else locateOnce(map);
  }, 0);
  const deltas = () => {
    E.forEach(e => {
      const t = G.lenToFt(p.tape.sides[e.i], p.tape.unit), el = $('#dl' + e.i); if (!el) return;
      if (!(t > 0)) { el.textContent = ''; return; }
      const gf = e.len * G.U.FT_PER_M, d = gf - t;
      el.innerHTML = `<span class="badge ${Math.abs(d) > Math.max(6, t * .05) ? 'd' : Math.abs(d) > 3 ? 'w' : ''}">${d > 0 ? '+' : ''}${G.fmtN(d, 1)} ft</span>`;
    });
    const ac = $('#areaCmp'); if (ac) ac.innerHTML = areaCompareHTML(p);
  };
  deltas();
  bindAutosave(c, deltas);
  $$('#tu button', c).forEach(b => b.onclick = () => { p.tape.unit = b.dataset.u; saveNow().then(() => tabBound(p, c)); });
  $('#imf', c).onchange = async e => { const f = e.target.files[0]; if (f) await importGeoFile(p, f); e.target.value = ''; };
  $('#paste', c).onclick = () => sheet(`<h2>Paste coordinates</h2><p class="small mute">One corner per line, in order around the plot: <code>25.712345, 85.123456</code>. Google Maps long-press coordinates work.</p>
    <textarea class="i" id="pt" style="min-height:160px"></textarea><div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn p" id="ok">Use these</button></div>`, (el, close) => {
    $('#ok', el).onclick = async () => { const pts = G.parsePasted($('#pt', el).value); if (pts.length < 1) return toast('No coordinates found'); close(); await setBoundary(p, pts); };
  });
  $$('[data-wu]', c).forEach(b => b.onclick = async () => { const w = p.walks.find(x => x.id === b.dataset.wu); if (!await ask('Make this the current boundary? (current one goes to history)', 'Use')) return; pushHistory(p, 'previous', p.pts); p.walks = p.walks.filter(x => x.id !== w.id).concat(w.kind === 'walk' ? [w] : []); p.pts = w.pts.map(q => Object.assign({}, q)); await saveParcel(p); tabBound(p, c); });
  $$('[data-wx]', c).forEach(b => b.onclick = async () => { if (!await ask('Delete this from history?', 'Delete', true)) return; p.walks = p.walks.filter(x => x.id !== b.dataset.wx); await saveParcel(p); tabBound(p, c); });
  const clr = $('#clr', c); if (clr) clr.onclick = async () => { if (await ask('Remove the boundary? (it stays in History)', 'Clear', true)) { pushHistory(p, 'previous', p.pts); p.pts = []; await saveNow(); tabBound(p, c); } };
}
async function setBoundary(p, pts) {
  if (p.pts.length && !await ask(`Replace the existing ${p.pts.length} corners with ${pts.length} new ones?`, 'Replace')) return;
  pushHistory(p, 'previous', p.pts);
  p.pts = pts.map((q, i) => ({ lat: q.lat, lng: q.lng, acc: q.acc || null, src: q.src, label: q.label || 'C' + (i + 1), t: Date.now() }));
  await saveParcel(p); toast(pts.length + ' corners set'); route();
}
async function importGeoFile(p, f) {
  try {
    let text;
    if (/\.kmz$/i.test(f.name)) { const z = await JSZip.loadAsync(f); const k = Object.keys(z.files).find(n => /\.kml$/i.test(n)); text = await z.file(k).async('string'); }
    else text = await f.text();
    let rings = G.parseGeoFile(text, f.name.replace(/\.kmz$/i, '.kml'));
    rings = rings.filter(r => r.length);
    if (!rings.length) return toast('No shapes found in file');
    if (rings.length === 1) return setBoundary(p, rings[0]);
    sheet(`<h2>${rings.length} shapes found — pick one</h2>${rings.map((r, i) => `<div class="fld"><button class="btn full" data-i="${i}">Shape ${i + 1}: ${r.length} points${r.length >= 3 ? ', ' + G.fmtN(G.areaM2(r) * G.U.SQFT_PER_M2 / G.U.DECIMAL_SQFT, 2) + ' dec' : ''}</button></div>`).join('')}<button class="btn full" data-close>Cancel</button>`, (el, close) => {
      el.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; close(); const r = rings[+b.dataset.i]; setBoundary(p, r); };
    });
  } catch (e) { toast('Could not read file: ' + e.message); }
}
function locateOnce(map) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => { try { map.setView([pos.coords.latitude, pos.coords.longitude], 17); } catch (e) { } }, () => { }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
}

function pushHistory(p, kind, pts, gap) {
  if (!pts || pts.length < 3) return;
  const same = w => w.pts.length === pts.length && w.pts[0].lat === pts[0].lat && w.pts[pts.length - 1].lng === pts[pts.length - 1].lng;
  if ((p.walks || []).some(same)) return; // already in history
  p.walks = (p.walks || []).concat([{ id: uid(), t: Date.now(), kind, gap: gap != null ? +gap.toFixed(1) : null, area: G.areaM2(pts), perim: G.perimeter(pts), pts: pts.map(q => Object.assign({}, q)) }]).slice(-12);
}
// ---------------------------------------------------------------- CAPTURE (full screen)
function viewCapture(p) {
  document.body.classList.add('fs'); $('header.top').style.display = 'none';
  main().innerHTML = `<div id="fsmap"></div>
  <div class="fsui top"><div class="panel gpsbar"><button class="btn s" id="cBack">←</button><span class="dot" id="gDot"></span><span class="grow" id="gTxt">Starting GPS…</span><button class="btn s" id="cMe" title="Centre on me">◎</button></div></div>
  <div class="fsui bot"><div class="panel" id="cp"></div></div>`;
  const map = makeMap('fsmap', { fs: true });
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPosition('bottomleft');
  const st = { fix: null, rec: null, walk: null, addMode: false, edit: false, sel: -1, first: true, layers: L.layerGroup().addTo(map), me: null, meC: null, track: null };
  if (p.pts.length) { map.fitBounds(L.latLngBounds(p.pts.map(q => [q.lat, q.lng])).pad(0.4), { maxZoom: 20 }); st.first = false; }
  keepAwake(true);
  $('#cBack').onclick = () => { if (st.rec || st.walk) return toast('Stop recording first'); location.hash = '#/p/' + p.id + '/bound'; };
  $('#cMe').onclick = () => st.fix && map.setView([st.fix.lat, st.fix.lng], Math.max(map.getZoom(), 19));

  const redraw = () => {
    st.layers.clearLayers();
    const ll = p.pts.map(q => [q.lat, q.lng]);
    if (ll.length >= 3) L.polygon(ll, { color: p.color || '#e53935', weight: 3, fillOpacity: .15, interactive: false }).addTo(st.layers);
    else if (ll.length === 2) L.polyline(ll, { color: p.color, weight: 3, interactive: false }).addTo(st.layers);
    if (!many(p)) G.edges(p.pts).forEach(e => { const a = p.pts[e.i], b = p.pts[e.j]; L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, icon: L.divIcon({ className: 'lbl', html: ft(e.len) + ' ft', iconSize: null }) }).addTo(st.layers); });
    p.pts.forEach((q, i) => {
      if (q.src === 'walk' && !st.edit && !isKey(q, i)) return;
      if (q.acc && q.src !== 'walk') L.circle([q.lat, q.lng], { radius: q.acc, color: '#fff', weight: 1, fillOpacity: .08, interactive: false }).addTo(st.layers);
      const m = L.marker([q.lat, q.lng], { icon: vxIcon(i, (i === st.sel ? 'sel ' : '') + (q.adj ? 'adj ' : '') + (q.src === 'walk' ? 'sm' : '')), draggable: st.edit, autoPan: true }).addTo(st.layers);
      m.on('click', () => vertexSheet(i));
      m.on('dragend', () => { const l = m.getLatLng(); q.lat = l.lat; q.lng = l.lng; q.adj = true; saveParcel(p); redraw(); panel(); });
    });
    if (st.edit && p.pts.length >= 2 && p.pts.length <= 60) G.edges(p.pts).forEach(e => {
      const a = p.pts[e.i], b = p.pts[e.j];
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { icon: L.divIcon({ className: 'mid', html: '+', iconSize: null }), zIndexOffset: -100 })
        .on('click', () => { p.pts.splice(e.i + 1, 0, { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2, acc: null, src: 'map', label: 'C' + (p.pts.length + 1), t: Date.now() }); saveParcel(p); redraw(); panel(); }).addTo(st.layers);
    });
  };
  const summary = () => {
    const n = p.pts.length; const g = gpsSqft(p);
    return `<div class="small"><b>${n}</b> point${n === 1 ? '' : 's'}${n >= 3 ? ` · <b>${fmtA(p, g)}</b> · ${G.fmtN(g / G.U.DECIMAL_SQFT, 2)} dec` : ''}${n >= 2 ? ` · perimeter ${ft(G.perimeter(p.pts))} ft` : ''}</div>`;
  };
  const panel = () => {
    const cp = $('#cp'); if (!cp) return;
    if (st.rec) {
      const r = st.rec, el = (Date.now() - r.t0) / 1000, pct = Math.min(100, el / r.dur * 100);
      const a = G.averageFix(r.samples, S.settings.maxAcc);
      cp.innerHTML = `<b>${r.idx != null ? 'Re-measuring corner ' + (r.idx + 1) : 'Recording corner ' + (p.pts.length + 1)}</b> — hold the phone still, right over the mark
        <div class="prog"><i style="width:${pct}%"></i></div>
        <div class="small">${r.samples.length} readings · ${Math.max(0, Math.ceil(r.dur - el))} s left${a ? ` · spread ${a.spread} m · phone ±${a.medAcc} m` : ''}</div>
        <div class="row" style="margin-top:10px"><button class="btn grow" id="rCancel">Cancel</button><button class="btn p grow" id="rStop" ${r.samples.length ? '' : 'disabled'}>Save now</button></div>`;
      $('#rCancel').onclick = () => { clearInterval(r.timer); clearInterval(r.poll); st.rec = null; panel(); };
      $('#rStop').onclick = finishRec;
      return;
    }
    if (st.walk) {
      const w = st.walk, len = w.pts.length > 1 ? w.pts.reduce((a, q, i) => i ? a + G.dist(w.pts[i - 1], q) : 0, 0) : 0;
      cp.innerHTML = `<b>〰️ Walking the boundary</b> — walk slowly along the ail/edge
        <div class="small" style="margin:6px 0">${w.pts.length} points · ${ft(len)} ft walked · ${w.skipped} poor readings skipped</div>
        <div class="row"><button class="btn grow" id="wCancel">Cancel</button><button class="btn grow" id="wCorner">◆ Corner here</button><button class="btn p grow" id="wStop">■ Stop & add</button></div>
        <div class="hint">Every point you walk is kept exactly as recorded — nothing is straightened. A point is added each ${S.settings.walkStep} m you move (standing still adds nothing). Come back to where you started to close the loop. "Corner here" just marks a named point (pillar, tree) on the way.</div>`;
      $('#wCancel').onclick = async () => { if (w.pts.length > 5 && !await ask('Discard this walked track?', 'Discard', true)) return; st.walk = null; if (st.track) { map.removeLayer(st.track); st.track = null; } panel(); };
      $('#wCorner').onclick = () => { if (st.fix) { const q = Object.assign({}, st.fix, { pin: true }); w.pts.push(q); w.last = q; try { navigator.vibrate && navigator.vibrate(40); } catch (e) { } panel(); } };
      $('#wStop').onclick = () => finishWalk();
      return;
    }
    cp.innerHTML = `${summary()}
      <div class="row" style="margin-top:8px"><button class="btn p bigbtn grow" id="cRec" ${st.fix ? '' : 'disabled'}>● Record corner here</button><button class="btn bigbtn" id="cWalk" ${st.fix ? '' : 'disabled'} title="Walk a curved boundary">〰️ Walk</button></div>
      <div class="row" style="margin-top:8px">
        <button class="btn s grow ${st.addMode ? 'p' : ''}" id="cAdd">✚ Tap map</button>
        <button class="btn s grow ${st.edit ? 'p' : ''}" id="cEdit">✋ Move pts</button>
        <button class="btn s grow" id="cUndo" ${p.pts.length ? '' : 'disabled'}>↶ Undo</button>
        <button class="btn s grow" id="cDone">✓ Done</button></div>
      ${st.addMode ? '<div class="hint">Tap on the satellite image to drop a corner (use where GPS is poor, e.g. under trees). </div>' : st.edit ? '<div class="hint">Drag corners to the visible ail/bund. Tap ＋ to insert a corner on a side.</div>' : `<div class="hint">Go round the plot in order. <b>● Record</b> at each corner (stand still ${S.settings.avgSec}s, most accurate). For a curved ail/nala edge use <b>〰️ Walk</b> along it. The shape closes itself from the last point back to point 1.</div>`}`;
    $('#cRec').onclick = () => startRec(null);
    $('#cWalk').onclick = async () => {
      let newLoop = !p.pts.length;
      if (p.pts.length >= 3) {
        const ch = await new Promise(res => sheet(`<h2>Walk the boundary</h2><p class="small">This parcel already has ${p.pts.length} boundary points.</p>
          <div class="fld"><button class="btn p full" data-v="new">Start a fresh loop (current boundary is kept in History)</button></div>
          <div class="fld"><button class="btn full" data-v="add">Continue from the last point</button></div><button class="btn full" data-v="">Cancel</button>`, (el, close) => { el.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { close(); res(b.dataset.v); } }; }));
        if (!ch) return; newLoop = ch === 'new';
      }
      st.walk = { pts: [], last: null, skipped: 0, newLoop }; st.addMode = st.edit = false; st.track = L.polyline([], { color: '#ffeb3b', weight: 4, dashArray: '4 6' }).addTo(map); redraw(); panel(); };
    $('#cAdd').onclick = () => { st.addMode = !st.addMode; if (st.addMode) st.edit = false; redraw(); panel(); };
    $('#cEdit').onclick = () => { st.edit = !st.edit; if (st.edit) st.addMode = false; redraw(); panel(); };
    $('#cUndo').onclick = async () => { if (!p.pts.length) return; if (await ask('Remove the last corner (' + p.pts.length + ')?', 'Remove')) { p.pts.pop(); await saveParcel(p); redraw(); panel(); } };
    $('#cDone').onclick = () => location.hash = '#/p/' + p.id + '/bound';
  };
  const startRec = idx => {
    if (!st.fix) return toast('Waiting for GPS');
    st.rec = { idx, samples: [], t0: Date.now(), dur: +S.settings.avgSec || 20 };
    if (st.fix && Date.now() - st.fix.t < 3000) st.rec.samples.push(st.fix);
    // some phones only report on movement — also poll once a second while standing still
    st.rec.poll = setInterval(() => navigator.geolocation.getCurrentPosition(pos => {
      if (!st.rec) return; const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp || Date.now() };
      const last = st.rec.samples[st.rec.samples.length - 1]; if (last && last.t === f.t && last.lat === f.lat) return; st.rec.samples.push(f);
    }, () => { }, { enableHighAccuracy: true, maximumAge: 0, timeout: 1500 }), 1000);
    st.rec.timer = setInterval(() => { if (!st.rec) return; if ((Date.now() - st.rec.t0) / 1000 >= st.rec.dur) finishRec(); else panel(); }, 500);
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) { }
    panel();
  };
  const finishRec = async () => {
    const r = st.rec; if (!r) return; clearInterval(r.timer); clearInterval(r.poll); st.rec = null;
    if (!r.samples.length && st.fix && Date.now() - st.fix.t < 15000) r.samples.push(st.fix);
    const a = G.averageFix(r.samples, S.settings.maxAcc);
    if (!a) { toast('No GPS readings'); return panel(); }
    const sess = { lat: a.lat, lng: a.lng, acc: a.acc, n: a.n, spread: a.spread, medAcc: a.medAcc, t: Date.now() };
    if (r.idx != null) {
      const q = p.pts[r.idx]; q.sessions = (q.sessions || []).concat([sess]);
      const gpsSess = q.sessions; const m = G.mergeSessions(gpsSess);
      Object.assign(q, { lat: m.lat, lng: m.lng, acc: m.acc, src: 'gps', adj: false });
      toast(`Corner ${r.idx + 1} updated · ±${m.acc} m from ${gpsSess.length} sessions`);
    } else {
      p.pts.push({ lat: a.lat, lng: a.lng, acc: a.acc, src: 'gps', label: 'C' + (p.pts.length + 1), mon: '', t: Date.now(), sessions: [sess] });
      toast(`Corner ${p.pts.length} saved · ±${a.acc} m (${a.used}/${a.n} readings)`);
    }
    try { navigator.vibrate && navigator.vibrate([60, 60, 60]); } catch (e) { }
    await saveParcel(p); redraw(); panel();
  };
  const finishWalk = async (force) => {
    const w = st.walk; if (!w) return;
    if (w.pts.length < 3) { toast('Walk a bit more — too few points'); return; }
    const start = w.newLoop || !p.pts.length ? w.pts[0] : p.pts[0];
    const end = w.pts[w.pts.length - 1], gap = G.dist(end, start), tol = Math.max(5, 2 * (end.acc || 3));
    if (force !== true && gap > tol) {
      const go = await new Promise(res => sheet(`<h2>Loop not closed yet</h2><p>You are <b>${G.fmtN(gap, 1)} m</b> (${ft(gap)} ft) from the starting point.</p>
        <p class="small">Keep walking back to the start for the best result. If you finish now, the area is calculated by joining your end point straight to the start.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn p" data-v="k">Keep walking</button><button class="btn" data-v="f">Finish anyway</button></div>`, (el, close) => { el.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { close(); res(b.dataset.v); } }; }));
      if (go !== 'f') return;
    }
    st.walk = null; if (st.track) { map.removeLayer(st.track); st.track = null; }
    let pts = w.pts.slice();
    // remove only the duplicate overlap where you arrive back at the start — nothing is straightened or smoothed
    while (pts.length > 3 && G.dist(pts[pts.length - 1], start) < 2) pts.pop();
    if (w.newLoop && p.pts.length) pushHistory(p, 'previous', p.pts);
    if (w.newLoop) p.pts = [];
    if (p.pts.length) { const last = p.pts[p.pts.length - 1]; while (pts.length && G.dist(pts[0], last) < 1) pts.shift(); }
    pts.forEach(q => p.pts.push({ lat: q.lat, lng: q.lng, acc: +(+q.acc).toFixed(1), src: 'walk', label: q.pin ? 'K' + (p.pts.length + 1) : '', t: q.t || Date.now() }));
    if (w.newLoop) pushHistory(p, 'walk', p.pts, gap);
    await saveParcel(p); redraw(); panel();
    toast(`Saved ${pts.length} walked points · loop gap ${G.fmtN(gap, 1)} m`, 3500);
  };
  const vertexSheet = i => {
    const q = p.pts[i]; st.sel = i; redraw();
    sheet(`<h2>Corner ${i + 1}</h2>
      <div class="grid2">${`<div class="fld"><label class="f">Name</label><input class="i" id="vl" value="${h(q.label || '')}"></div>`}
      <div class="fld"><label class="f">Mark on ground</label><select class="i" id="vm">${MONUMENT.map(m => `<option ${q.mon === m ? 'selected' : ''}>${h(m)}</option>`).join('')}</select></div></div>
      <div class="fld"><label class="f">Note (e.g. "near Ramesh's well")</label><input class="i" id="vn" value="${h(q.note || '')}"></div>
      <div class="small mute">${q.lat.toFixed(7)}, ${q.lng.toFixed(7)} · ${q.acc != null ? '±' + q.acc + ' m' : 'accuracy unknown'}${q.sessions ? ' · ' + q.sessions.length + ' GPS session(s)' : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn p grow" id="vre">📡 Re-measure here (averages in)</button></div>
      <div class="row" style="margin-top:8px"><button class="btn grow" id="vfirst">Make corner 1</button><button class="btn d grow" id="vdel">Delete</button><button class="btn grow" id="vok">Save</button></div>`, (el, close) => {
      const saveMeta = () => { q.label = $('#vl', el).value; q.mon = $('#vm', el).value; q.note = $('#vn', el).value; };
      $('#vok', el).onclick = async () => { saveMeta(); await saveParcel(p); st.sel = -1; close(); redraw(); };
      $('#vre', el).onclick = async () => { saveMeta(); await saveParcel(p); close(); startRec(i); };
      $('#vfirst', el).onclick = async () => { saveMeta(); p.pts = p.pts.slice(i).concat(p.pts.slice(0, i)); p.tape.sides = []; p.tape.diags = []; await saveParcel(p); st.sel = -1; close(); redraw(); panel(); toast('Corner order rotated (tape entries reset)'); };
      $('#vdel', el).onclick = async () => { if (!await ask('Delete corner ' + (i + 1) + '?', 'Delete', true)) return; p.pts.splice(i, 1); await saveParcel(p); st.sel = -1; close(); redraw(); panel(); };
    });
  };
  map.on('click', e => {
    if (!st.addMode) return;
    p.pts.push({ lat: e.latlng.lat, lng: e.latlng.lng, acc: null, src: 'map', label: 'C' + (p.pts.length + 1), t: Date.now() });
    saveParcel(p); redraw(); panel();
  });
  startWatch(fix => {
    st.fix = fix;
    $('#gDot').className = 'dot ' + accClass(fix.acc);
    $('#gTxt').innerHTML = `GPS ±<b>${G.fmtN(fix.acc, 1)} m</b> ${fix.acc <= 5 ? '— good' : fix.acc <= 12 ? '— fair, wait a bit' : '— poor, move to open sky'}`;
    const ll = [fix.lat, fix.lng];
    if (!st.me) { st.meC = L.circle(ll, { radius: fix.acc, color: '#1a73e8', weight: 1, fillOpacity: .12, interactive: false }).addTo(map); st.me = L.marker(ll, { icon: L.divIcon({ className: 'me', iconSize: null }), interactive: false }).addTo(map); }
    else { st.me.setLatLng(ll); st.meC.setLatLng(ll).setRadius(fix.acc); }
    if (st.first) { map.setView(ll, 19); st.first = false; }
    if (st.rec) st.rec.samples.push(fix);
    if (st.walk) {
      const w = st.walk;
      if (fix.acc > S.settings.maxAcc) w.skipped++;
      else if (!w.last || G.dist(w.last, fix) >= (+S.settings.walkStep || 1)) { w.pts.push(fix); w.last = fix; if (st.track) st.track.addLatLng([fix.lat, fix.lng]); panel(); }
    }
    if (!st.rec && $('#cRec') && $('#cRec').disabled) panel();
  }, e => { $('#gTxt').textContent = gpsErrText(e); $('#gDot').className = 'dot r'; });
  S.cleanup.push(() => { if (st.rec) { clearInterval(st.rec.timer); clearInterval(st.rec.poll); } st.walk = null; });
  redraw(); panel();
}

// ---------------------------------------------------------------- FIND / STAKEOUT
function viewFind(p) {
  document.body.classList.add('fs'); $('header.top').style.display = 'none';
  const opts = p.pts.map((q, i) => [i, q]).filter(([i, q]) => !many(p) || isKey(q, i)).map(([i, q]) => [i, `Point ${i + 1} ${q.label && q.label !== 'C' + (i + 1) ? '– ' + q.label : ''}`]);
  main().innerHTML = `<div id="fsmap"></div>
  <div class="fsui top"><div class="panel gpsbar"><button class="btn s" id="fBack">←</button><span class="dot" id="gDot"></span><span class="grow" id="gTxt">Starting GPS…</span></div></div>
  <div class="fsui bot"><div class="panel">
    <div class="row"><select class="i grow" id="tgt">${opts.map(([v, t]) => `<option value="${v}">${h(t)}</option>`).join('')}${p.pts.length >= 3 ? '<option value="c">Centre of plot</option>' : ''}</select><button class="btn s" id="cmp" hidden>Enable compass</button></div>
    <div class="row" style="margin-top:8px;align-items:center">
      <svg class="arrow" id="arr" viewBox="0 0 100 100" style="width:84px;height:84px;margin:0"><circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="3"/><path d="M50 8 L70 62 L50 52 L30 62 Z" fill="#d32"/></svg>
      <div class="grow"><div class="bignum" id="dist" style="text-align:left">—</div><div class="small" id="dir"></div></div></div>
    <div class="banner i" id="inout" style="margin:8px 0 0">Locating…</div>
  </div></div>`;
  const map = makeMap('fsmap', { fs: true }); L.control.zoom({ position: 'topright' }).addTo(map); map.attributionControl.setPosition('bottomleft');
  const g = drawParcel(map, p); if (p.pts.length) map.fitBounds(g.getBounds().pad(0.4), { maxZoom: 20 });
  let fix = null, heading = null, me = null, line = null;
  $('#fBack').onclick = () => location.hash = '#/p/' + p.id + '/bound';
  const target = () => { const v = $('#tgt').value; return v === 'c' ? G.centroid(p.pts) : p.pts[+v]; };
  const upd = () => {
    if (!fix) return; const t = target(); if (!t) return;
    const d = G.dist(fix, t), b = G.bearing(fix, t);
    $('#dist').textContent = d < 100 ? G.fmtN(d, 1) + ' m' : G.fmtN(d / 1000, 2) + ' km';
    $('#dir').innerHTML = `${ft(d)} ft · towards <b>${G.compass8(b)}</b> (${G.hindiDir(G.compass8(b))}) ${Math.round(b)}°${heading == null ? '<br><span class="tiny mute">Arrow assumes top of phone points North. Tap "Enable compass" if shown.</span>' : ''}`;
    $('#arr').style.transform = `rotate(${b - (heading || 0)}deg)`;
    if (line) line.setLatLngs([[fix.lat, fix.lng], [t.lat, t.lng]]); else line = L.polyline([[fix.lat, fix.lng], [t.lat, t.lng]], { color: '#fff', dashArray: '6 6', weight: 2 }).addTo(map);
    const ps = G.pointStatus(fix, p.pts);
    if (ps) {
      const e = G.edges(p.pts)[ps.edge];
      $('#inout').className = 'banner ' + (ps.inside ? 'i' : 'w');
      $('#inout').innerHTML = `${ps.inside ? '✅ You are <b>inside</b> the plot' : '⚠️ You are <b>outside</b> the plot'} — <b>${G.fmtN(ps.d, 1)} m</b> (${ft(ps.d)} ft) from side ${e.i + 1}→${e.j + 1} (${e.f8} side)${fix.acc > ps.d ? `<br><span class="tiny">GPS ±${G.fmtN(fix.acc, 0)} m is larger than this distance — not conclusive.</span>` : ''}`;
    } else $('#inout').textContent = 'Add at least 3 corners to check inside/outside.';
  };
  $('#tgt').onchange = upd;
  const onOri = e => { let hd = null; if (e.webkitCompassHeading != null) hd = e.webkitCompassHeading; else if (e.absolute && e.alpha != null) hd = 360 - e.alpha; if (hd != null) { heading = hd; upd(); } };
  window.addEventListener('deviceorientationabsolute', onOri); window.addEventListener('deviceorientation', onOri);
  S.cleanup.push(() => { window.removeEventListener('deviceorientationabsolute', onOri); window.removeEventListener('deviceorientation', onOri); });
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { const b = $('#cmp'); b.hidden = false; b.onclick = async () => { try { await DeviceOrientationEvent.requestPermission(); b.hidden = true; } catch (e) { toast('Compass not allowed'); } }; }
  keepAwake(true);
  startWatch(f => {
    fix = f; $('#gDot').className = 'dot ' + accClass(f.acc); $('#gTxt').innerHTML = `GPS ±<b>${G.fmtN(f.acc, 1)} m</b>`;
    if (!me) me = L.marker([f.lat, f.lng], { icon: L.divIcon({ className: 'me', iconSize: null }), interactive: false }).addTo(map); else me.setLatLng([f.lat, f.lng]);
    upd();
  }, e => { $('#gTxt').textContent = gpsErrText(e); });
}

// ---------------------------------------------------------------- ALL MAP
function viewAllMap() {
  setHeader('All parcels', '#/');
  main().innerHTML = `<div class="minimap" id="am" style="height:calc(100vh - 150px)"></div><div class="small mute" style="margin-top:8px" id="amn"></div>`;
  setTimeout(() => {
    const map = makeMap('am'); const all = L.featureGroup().addTo(map);
    const withB = S.parcels.filter(p => p.pts.length >= 1);
    withB.forEach(p => {
      const g = drawParcel(map, p, { lengths: false, corners: false });
      const c = G.centroid(p.pts);
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'lbl', html: h(pTitle(p)), iconSize: null }) }).addTo(g);
      g.eachLayer(l => l.on && l.on('click', () => location.hash = '#/p/' + p.id + '/bound'));
      g.addTo(all);
    });
    if (withB.length) map.fitBounds(all.getBounds().pad(0.2), { maxZoom: 19 }); else locateOnce(map);
    $('#amn').textContent = `${withB.length} of ${S.parcels.length} parcels have coordinates. Tap a parcel to open it.`;
  }, 0);
}

// ---------------------------------------------------------------- CHAUHADDI
function sketchSVG(p) {
  const W = 500, H = 420, MX = 112, MY = 62;
  const lab = d => { const c = p.chau[d] || {}; return c.ground || c.deed || ''; };
  const cut = (s, n = 26) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const wrap = (s, x, y, anchor, per = 26) => { s = cut(s, per * 3); const words = s.split(' '); const lines = []; let L1 = ''; words.forEach(w => { if ((L1 + ' ' + w).trim().length > per && L1) { lines.push(L1.trim()); L1 = w; } else L1 += ' ' + w; }); lines.push(L1.trim()); return lines.slice(0, 3).map((l, i) => `<text x="${x}" y="${(+y + i * 13).toFixed(1)}" text-anchor="${anchor}" font-size="11.5" fill="#245c2f" font-weight="600">${h(l)}</text>`).join(''); };
  let body = '';
  const north = `<g transform="translate(${W - 26},28)"><path d="M0 -16 L7 6 L0 2 L-7 6 Z" fill="#b3261e"/><text y="20" text-anchor="middle" font-size="11" font-weight="700">N</text></g>`;
  if (p.pts.length >= 3) {
    const pr = G.projector(G.centroid(p.pts)); const xy = p.pts.map(pr.fwd);
    const minX = Math.min(...xy.map(q => q.x)), maxX = Math.max(...xy.map(q => q.x)), minY = Math.min(...xy.map(q => q.y)), maxY = Math.max(...xy.map(q => q.y));
    const sc = Math.min((W - 2 * MX) / (maxX - minX || 1), (H - 2 * MY) / (maxY - minY || 1));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const T = q => ({ X: W / 2 + (q.x - cx) * sc, Y: H / 2 - (q.y - cy) * sc });
    const P = xy.map(T);
    body += `<polygon points="${P.map(q => q.X.toFixed(1) + ',' + q.Y.toFixed(1)).join(' ')}" fill="${h(p.color)}" fill-opacity=".14" stroke="${h(p.color)}" stroke-width="2.5"/>`;
    const E = G.edges(p.pts); const best = {};
    E.forEach(e => { if (!best[e.f4] || e.len > best[e.f4].len) best[e.f4] = e; });
    if (many(p)) {
      const xs = P.map(q => q.X), ys = P.map(q => q.Y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), t = dirTotals(p);
      const lb = (d, x, y, a, per) => body += wrap((lab(d) ? lab(d) + ' · ' : '') + ft(t[d]) + '′', x, y, a, per);
      lb('N', (x0 + x1) / 2, y0 - 26, 'middle', 34); lb('S', (x0 + x1) / 2, y1 + 18, 'middle', 34); lb('E', x1 + 8, (y0 + y1) / 2, 'start', 15); lb('W', x0 - 8, (y0 + y1) / 2, 'end', 15);
    }
    if (!many(p)) E.forEach(e => {
      const a = P[e.i], b = P[e.j], mx = (a.X + b.X) / 2, my = (a.Y + b.Y) / 2;
      const nx = Math.sin(e.facing * Math.PI / 180), ny = -Math.cos(e.facing * Math.PI / 180);
      body += `<text x="${(mx - nx * 12).toFixed(1)}" y="${(my - ny * 12 + 4).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#333" paint-order="stroke" stroke="#fff" stroke-width="3">${ft(e.len)}′</text>`;
      if (best[e.f4] === e && lab(e.f4)) {
        const side = Math.abs(nx) >= .4, lx = mx + nx * (side ? 10 : 30), ly = my + ny * 26 - (ny < -.4 ? 14 : 0);
        body += wrap(lab(e.f4), lx.toFixed(1), ly.toFixed(1), !side ? 'middle' : nx > 0 ? 'start' : 'end', side ? 15 : 34);
      }
    });
    P.forEach((q, i) => { if (many(p) && !isKey(p.pts[i], i)) return; body += `<circle cx="${q.X.toFixed(1)}" cy="${q.Y.toFixed(1)}" r="4" fill="#fff" stroke="#b3261e" stroke-width="2"/><text x="${(q.X + 6).toFixed(1)}" y="${(q.Y - 6).toFixed(1)}" font-size="10" font-weight="700" fill="#b3261e">${i + 1}</text>`; });
  } else {
    const a = MX, b = W - MX, t = MY + 10, bt = H - MY - 10;
    body += `<rect x="${a}" y="${t}" width="${b - a}" height="${bt - t}" fill="${h(p.color)}" fill-opacity=".12" stroke="${h(p.color)}" stroke-width="2.5" stroke-dasharray="6 4"/>
      <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="#555">${h(cut(pTitle(p), 30))}</text>
      <text x="${W / 2}" y="${H / 2 + 16}" text-anchor="middle" font-size="10" fill="#888">(schematic — no GPS boundary yet)</text>`;
    body += wrap(lab('N') || 'North: —', W / 2, t - 30, 'middle', 34) + wrap(lab('S') || 'South: —', W / 2, bt + 18, 'middle', 34) + wrap(lab('E') || 'East: —', b + 8, H / 2, 'start', 15) + wrap(lab('W') || 'West: —', a - 8, H / 2, 'end', 15);
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${north}${body}</svg>`;
}
function tabChau(p, c) {
  const E = G.edges(p.pts);
  c.innerHTML = `
  <div class="card"><h3>Sketch (नक्शा)</h3><div class="sketch" id="sk">${sketchSVG(p)}</div>
    <div class="hint">Drawn from your GPS corners with side lengths. Neighbours are taken from the "on ground" entry (or the deed if ground is blank).</div></div>
  ${many(p) ? `<div class="card"><h3>Which side faces where</h3><div class="small">${dirTotalsHTML(p)}</div></div>` : ''}
  ${E.length >= 3 && !many(p) ? `<div class="card"><h3>Which side faces where</h3><div class="small">${DIRS.map(([d, en, hi]) => { const es = E.filter(e => e.f4 === d); return `<div><span class="dirtag">${d}</span>${hi}: ${es.length ? es.map(e => `side ${e.i + 1}→${e.j + 1} (${ft(e.len)} ft)`).join(', ') : '—'}</div>`; }).join('')}</div></div>` : ''}
  <div class="chau">${DIRS.map(([d, en, hi]) => `<div class="card"><h3><span class="dirtag">${d}</span>${en} · ${hi}<span class="sp"></span><label class="chk small"><input type="checkbox" data-k="chau.${d}.mis" data-re ${p.chau[d] && p.chau[d].mis ? 'checked' : ''}>Mismatch</label></h3>
    ${fld('As per deed / khatiyan (दस्तावेज़ अनुसार)', `chau.${d}.deed`, { re: 1, ph: 'e.g. Ram Prasad Singh ka khet, khesra 410' })}
    ${fld('On ground today (वर्तमान में)', `chau.${d}.ground`, { re: 1, ph: 'e.g. Pucca road / Mohan Yadav (bought 2019)' })}
    ${fld('Neighbour mobile / note', `chau.${d}.note`)}</div>`).join('')}</div>
  <div class="card">${ta('Boundary notes (disputes, encroachment, shifted ail, common nala…)', 'chau.note')}</div>`;
  bindAutosave(c, () => { $('#sk').innerHTML = sketchSVG(p); });
}

// ---------------------------------------------------------------- OWNERSHIP
function tabOwn(p, c) {
  const hist = p.history.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  c.innerHTML = `
  <div class="card"><h3>Current owner(s) (वर्तमान रैयत)<span class="sp"></span><button class="btn s" id="addO">+ Owner</button></h3>
    ${p.owners.map((o, i) => `<div style="border-top:${i ? '1px solid var(--line)' : '0'};padding-top:${i ? 10 : 0}px;margin-bottom:6px">
      <div class="grid2">${fld('Name', `owners.${i}.name`)}${fld('Father / husband (पिता/पति)', `owners.${i}.guardian`)}${fld('Share (हिस्सा)', `owners.${i}.share`, { ph: '1/2' })}${fld('Mobile', `owners.${i}.mobile`, { type: 'tel' })}</div>
      ${p.owners.length > 1 ? `<button class="btn s d" data-ro="${i}">Remove</button>` : ''}</div>`).join('')}
  </div>
  <div class="card"><h3>Chain of title (स्वामित्व इतिहास)<span class="sp"></span><button class="btn s p" id="addH">+ Add entry</button></h3>
    ${hist.length ? `<div class="tl">${hist.map(e => `<div class="e ${e.mode === 'sale' ? 'sold' : ''}"><div class="small mute">${h(e.date ? fmtDate(e.date) : 'Date unknown')} · ${h((MODE_T[e.mode] || e.mode || '').split(' (')[0])}</div>
      <div><b>${h(e.from || '?')}</b> → <b>${h(e.to || '?')}</b></div>
      <div class="small">${[e.deedNo && 'Deed ' + e.deedNo, e.office, e.volPage && 'Vol/Page ' + e.volPage, e.amount && '₹' + G.fmtN(+e.amount, 0), e.mutNo && 'Mutation ' + e.mutNo].filter(Boolean).map(h).join(' · ')}</div>
      ${e.notes ? `<div class="small mute">${h(e.notes)}</div>` : ''}<button class="btn s" data-eh="${h(e.id)}" style="margin-top:4px">Edit</button></div>`).join('')}</div>`
      : `<div class="small mute">Record how the land came to you — CS/RS khatiyan holder → inheritance/partition → purchases (kewala) — with deed numbers. This is what a buyer, bank or court will ask for.</div>`}
  </div>`;
  bindAutosave(c);
  $('#addO').onclick = async () => { p.owners.push({ name: '', guardian: '', share: '', mobile: '' }); await saveNow(); tabOwn(p, c); };
  $$('[data-ro]', c).forEach(b => b.onclick = async () => { p.owners.splice(+b.dataset.ro, 1); await saveNow(); tabOwn(p, c); });
  $('#addH').onclick = () => histSheet(p, null, () => tabOwn(p, c));
  $$('[data-eh]', c).forEach(b => b.onclick = () => histSheet(p, p.history.find(x => x.id === b.dataset.eh), () => tabOwn(p, c)));
}
async function histSheet(p, e, done) {
  const isNew = !e; e = e ? Object.assign({}, e) : { id: uid(), date: '', mode: 'purchase', from: '', to: '', deedNo: '', office: '', volPage: '', amount: '', mutNo: '', docId: '', notes: '' };
  const docs = await DB.docsOf(p.id);
  const F = (l, k, t = 'text', ph = '') => `<div class="fld"><label class="f">${l}</label><input class="i" name="${k}" type="${t}" value="${h(e[k] || '')}" placeholder="${h(ph)}"></div>`;
  sheet(`<h2>${isNew ? 'Add' : 'Edit'} ownership entry</h2>
    <div class="grid2">${F('Date', 'date', 'date')}<div class="fld"><label class="f">How</label><select class="i" name="mode">${MODES.map(([v, t]) => `<option value="${v}" ${e.mode === v ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></div></div>
    ${F('From (seller / previous holder / deceased)', 'from', 'text', 'e.g. Late Shivnath Mishra')}
    ${F('To (buyer / heir / new holder)', 'to')}
    <div class="grid2">${F('Deed / document no.', 'deedNo')}${F('Registry office', 'office', 'text', 'e.g. Motihari')}${F('Book / Vol / Page', 'volPage')}${F('Consideration ₹', 'amount', 'number')}${F('Mutation case no.', 'mutNo')}
    <div class="fld"><label class="f">Linked document</label><select class="i" name="docId"><option value="">—</option>${docs.map(d => `<option value="${d.id}" ${e.docId === d.id ? 'selected' : ''}>${h(d.title || d.type)}</option>`).join('')}</select></div></div>
    <div class="fld"><label class="f">Notes (area transferred, witnesses, conditions…)</label><textarea class="i" name="notes">${h(e.notes || '')}</textarea></div>
    <div class="row" style="justify-content:space-between">${isNew ? '<span></span>' : '<button class="btn d" id="hd">Delete</button>'}<div class="row"><button class="btn" data-close>Cancel</button><button class="btn p" id="hs">Save</button></div></div>`, (el, close) => {
    $('#hs', el).onclick = async () => {
      $$('[name]', el).forEach(i => e[i.name] = i.value);
      const i = p.history.findIndex(x => x.id === e.id); if (i >= 0) p.history[i] = e; else p.history.push(e);
      await saveParcel(p); close(); done();
    };
    const hd = $('#hd', el); if (hd) hd.onclick = async () => { if (!await ask('Delete this entry?', 'Delete', true)) return; p.history = p.history.filter(x => x.id !== e.id); await saveParcel(p); close(); done(); };
  });
}

// ---------------------------------------------------------------- DOCUMENTS
async function shrinkImage(file, max = 2200, q = .82) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
  const ts = Math.min(1, 300 / Math.max(bmp.width, bmp.height)); const tc = document.createElement('canvas'); tc.width = Math.round(bmp.width * ts); tc.height = Math.round(bmp.height * ts);
  tc.getContext('2d').drawImage(bmp, 0, 0, tc.width, tc.height);
  return { blob: s < 1 || file.size > blob.size ? blob : file, thumb: tc.toDataURL('image/jpeg', .7) };
}
const quickFix = () => new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }); });
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function tabDocs(p, c) {
  const docs = (await DB.docsOf(p.id)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.added - a.added);
  const have = new Set(docs.map(d => d.type));
  const checklist = ['Kewala / Sale deed (केवाला)', 'Khatiyan (खतियान)', 'Jamabandi / Register-II (जमाबंदी)', 'Lagan receipt (लगान रसीद)', 'Bhu-naksha / Map (नक्शा)', 'Mutation order (दाखिल-खारिज)'];
  c.innerHTML = `
  <div class="card"><div class="row"><label class="btn p grow">📷 Camera<input type="file" accept="image/*" capture="environment" id="dcam" hidden></label>
    <label class="btn grow">📎 Files / PDF<input type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" multiple id="dfile" hidden></label></div>
    <label class="chk small" style="margin-top:8px"><input type="checkbox" id="dorig">Keep original image quality (bigger)</label>
    <div class="small" style="margin-top:8px">${checklist.map(t => `<span class="badge ${have.has(t) ? '' : 'g'}">${have.has(t) ? '✓' : '○'} ${h(t.split(' (')[0].split(' /')[0])}</span>`).join('')}</div></div>
  ${docs.length ? `<div class="docs">${docs.map(d => `<div class="doc" data-d="${d.id}"><div class="th" style="${d.thumb ? `background-image:url('${d.thumb}')` : ''}">${d.thumb ? '' : (/pdf/.test(d.mime) ? '📕' : '📄')}</div>
    <div class="m"><b>${h(d.title || d.type)}</b><span class="mute">${h(d.type.split(' (')[0])}${d.date ? ' · ' + h(d.date) : ''}</span></div></div>`).join('')}</div>` : '<div class="empty">No documents yet. Photograph each page of the kewala, khatiyan, jamabandi and lagan receipts.</div>'}`;
  const handle = async files => {
    if (!files.length) return;
    const meta = await new Promise(res => sheet(`<h2>${files.length} file${files.length > 1 ? 's' : ''} — what are they?</h2>
      <div class="fld"><label class="f">Type</label><select class="i" id="dt">${DOCTYPES.map(t => `<option>${h(t)}</option>`).join('')}</select></div>
      <div class="fld"><label class="f">Title (e.g. "Kewala 1987 – page 1")</label><input class="i" id="dn" value="${files.length === 1 ? h(files[0].name.replace(/\.[^.]+$/, '')) : ''}"></div>
      <div class="grid2"><div class="fld"><label class="f">Document date</label><input type="date" class="i" id="dd"></div><div class="fld"><label class="f">Number / ref</label><input class="i" id="dr"></div></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="dx">Cancel</button><button class="btn p" id="dok">Save</button></div>`, (el, close) => {
      $('#dok', el).onclick = () => { const m = { type: $('#dt', el).value, title: $('#dn', el).value, date: $('#dd', el).value, ref: $('#dr', el).value }; close(); res(m); };
      $('#dx', el).onclick = () => { close(); res(null); };
    }));
    if (!meta) return;
    toast('Saving…');
    const geo = /photo/i.test(meta.type) ? await quickFix() : null;
    let k = 0;
    for (const f of files) {
      let blob = f, thumb = '';
      try { if (/^image\//.test(f.type) && !/svg/.test(f.type)) { const r = await shrinkImage(f, $('#dorig') && $('#dorig').checked ? 99999 : 2200); blob = r.blob; thumb = r.thumb; } } catch (e) { }
      k++;
      await DB.put('docs', { id: uid(), parcelId: p.id, type: meta.type, title: files.length > 1 ? `${meta.title || meta.type.split(' (')[0]} – ${k}` : meta.title, date: meta.date, ref: meta.ref, fileName: f.name, mime: blob.type || f.type, size: blob.size, blob, thumb, geo, added: Date.now() });
    }
    touch(true); await saveParcel(p);
    toast(files.length + ' saved'); tabDocs(p, c);
  };
  $('#dcam', c).onchange = e => handle(Array.from(e.target.files));
  $('#dfile', c).onchange = e => handle(Array.from(e.target.files));
  $$('[data-d]', c).forEach(el => el.onclick = () => docSheet(docs.find(d => d.id === el.dataset.d), () => tabDocs(p, c)));
}
function docSheet(d, done) {
  const url = URL.createObjectURL(d.blob);
  const isImg = /^image\//.test(d.mime);
  const close0 = sheet(`<h2>${h(d.title || d.type)}</h2>
    ${isImg ? `<img src="${url}" style="width:100%;border-radius:10px;margin-bottom:10px" alt="">` : `<div class="empty" style="font-size:40px">${/pdf/.test(d.mime) ? '📕' : '📄'}</div>`}
    <div class="small mute" style="margin-bottom:10px">${h(d.fileName || '')} · ${kb(d.size)}${d.geo ? ` · 📍 ${d.geo.lat.toFixed(6)}, ${d.geo.lng.toFixed(6)}` : ''}</div>
    <div class="fld"><label class="f">Type</label><select class="i" id="dt">${DOCTYPES.map(t => `<option ${t === d.type ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></div>
    <div class="fld"><label class="f">Title</label><input class="i" id="dn" value="${h(d.title || '')}"></div>
    <div class="grid2"><div class="fld"><label class="f">Date</label><input type="date" class="i" id="dd" value="${h(d.date || '')}"></div><div class="fld"><label class="f">Number / ref</label><input class="i" id="dr" value="${h(d.ref || '')}"></div></div>
    <div class="row"><a class="btn grow" href="${url}" target="_blank" rel="noopener">Open</a><button class="btn grow" id="dsh">Share / save</button><button class="btn d grow" id="ddel">Delete</button><button class="btn p grow" id="dsv">Save</button></div>`, (el, close) => {
    $('#dsv', el).onclick = async () => { Object.assign(d, { type: $('#dt', el).value, title: $('#dn', el).value, date: $('#dd', el).value, ref: $('#dr', el).value }); await DB.put('docs', d); touch(true); close(); URL.revokeObjectURL(url); done(); };
    $('#dsh', el).onclick = () => saveOrShare(d.blob, safeName(d.title || d.type) + extOf(d));
    $('#ddel', el).onclick = async () => { if (!await ask('Delete this document from the phone?', 'Delete', true)) return; await DB.del('docs', d.id); touch(true); close(); URL.revokeObjectURL(url); done(); };
  });
}
const extOf = d => { const m = (d.fileName || '').match(/\.[a-z0-9]+$/i); return /jpeg/.test(d.mime) ? '.jpg' : /png/.test(d.mime) ? '.png' : /pdf/.test(d.mime) ? '.pdf' : m ? m[0] : ''; };
const safeName = s => String(s || 'file').replace(/[\\/:*?"<>|#^\[\]]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

// ---------------------------------------------------------------- TASKS & NOTES
function tabMore(p, c) {
  const tasks = (p.tasks || []).slice().sort((a, b) => a.done - b.done || (a.due || '9').localeCompare(b.due || '9'));
  c.innerHTML = `
  <div class="card"><h3>To-do & reminders<span class="sp"></span><button class="btn s p" id="addT">+ Task</button></h3>
    ${tasks.length ? tasks.map(t => `<div class="row" style="border-bottom:1px solid var(--line);padding:6px 0"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''} style="width:22px;height:22px">
      <div class="grow" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${h(t.text)}${t.due ? `<div class="tiny ${!t.done && t.due < today() ? '' : 'mute'}" style="${!t.done && t.due < today() ? 'color:var(--bad)' : ''}">Due ${h(fmtDate(t.due))}</div>` : ''}</div><button class="btn s" data-tx="${t.id}">✕</button></div>`).join('')
      : `<div class="small mute">Ideas: pay lagan for ${fyList()[1]}, apply for mutation, get LPC, call amin for napi, fix boundary pillar, renew bataidari.</div>`}
  </div>
  <div class="card">${ta('Notes (anything else — local history, who to contact, crop records…)', 'notes')}</div>
  <div class="card small mute">Created ${fmtDate(p.createdAt)} · last edited ${new Date(p.updatedAt).toLocaleString('en-IN')}</div>`;
  bindAutosave(c);
  $('#addT').onclick = () => sheet(`<h2>New task</h2><div class="fld"><input class="i" id="tt" placeholder="What needs doing?"></div><div class="fld"><label class="f">Due date</label><input type="date" class="i" id="td"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn p" id="ts">Add</button></div>`, (el, close) => {
    $('#tt', el).focus();
    $('#ts', el).onclick = async () => { const t = $('#tt', el).value.trim(); if (!t) return; (p.tasks = p.tasks || []).push({ id: uid(), text: t, due: $('#td', el).value, done: false }); await saveNow(); close(); tabMore(p, c); };
  });
  $$('[data-t]', c).forEach(b => b.onchange = async () => { const t = p.tasks.find(x => x.id === b.dataset.t); t.done = b.checked; await saveNow(); tabMore(p, c); });
  $$('[data-tx]', c).forEach(b => b.onclick = async () => { p.tasks = p.tasks.filter(x => x.id !== b.dataset.tx); await saveNow(); tabMore(p, c); });
}

// ---------------------------------------------------------------- REPORT
async function viewReport(p) {
  setHeader('Record — ' + pTitle(p), '#/p/' + p.id + '/info', `<button class="ib" onclick="window.print()" aria-label="Print">🖨️</button>`);
  const docs = await DB.docsOf(p.id);
  const r = recSqft(p), g = gpsSqft(p), cA = chainSqft(p);
  const kv = rows => `<table class="kv">${rows.filter(x => x[1] !== '' && x[1] != null).map(([k, v]) => `<tr><td>${h(k)}</td><td>${v}</td></tr>`).join('')}</table>`;
  const E = G.edges(p.pts);
  const st = STATUS.find(s => s[0] === p.status);
  main().innerHTML = `<div class="noprint row" style="margin-bottom:10px"><button class="btn p" onclick="window.print()">🖨️ Print / Save as PDF</button><span class="small mute">Choose "Save as PDF" in the print dialog.</span></div>
  <div class="report">
    <h1>${h(pTitle(p))}</h1><div style="color:#555">Land parcel record · generated ${new Date().toLocaleString('en-IN')}</div>
    <h2>Location & revenue record</h2>
    ${kv([['Status', h(st ? st[1] : p.status)], ['State / District', h([p.loc.state, p.loc.district].filter(Boolean).join(' / '))], ['Anchal / Halka', h([p.loc.anchal, p.loc.halka].filter(Boolean).join(' / '))], ['Mauza / Thana no.', h([p.loc.mauza, p.loc.thana].filter(Boolean).join(' / '))], ['Panchayat', h(p.loc.panchayat)],
      ['Khata / Khesra', h([p.rec.khata, p.rec.khesra].filter(Boolean).join(' / '))], ['Survey', h(p.rec.survey)], ['ULPIN', h(p.rec.ulpin)], ['Jamabandi / Bhag-Pristha', h([p.rec.jamabandi, p.rec.bhag].filter(Boolean).join(' / '))], ['Land type / class', h([p.rec.landType, p.rec.landClass].filter(Boolean).join(' / '))],
      ['CS / RS raiyat', h([p.rec.csRaiyat, p.rec.rsRaiyat].filter(Boolean).join(' / '))], ['Current use', h(p.rec.use)], ['Lagan', h([p.rev.lagan && '₹' + p.rev.lagan, p.rev.laganFY && 'paid up to ' + p.rev.laganFY].filter(Boolean).join(', '))], ['LPC', h(p.rev.lpc)], ['Mutation', h([p.rev.mutCase, p.rev.mutStatus].filter(Boolean).join(' – '))]])}
    <h2>Area</h2>
    ${kv([['As per record', isFinite(r) ? `${G.fmtBKD(r, ks(p))} = ${G.fmtAcre(r)} = ${G.fmtN(r, 0)} sq ft` : '—'], ['GPS measured', isFinite(g) ? `${G.fmtBKD(g, ks(p))} = ${G.fmtAcre(g)} = ${G.fmtN(g, 0)} sq ft${isFinite(r) ? ` (${((g - r) / r * 100).toFixed(1)}% vs record)` : ''}` : '—'], ['Tape / chain', isFinite(cA) ? `${G.fmtBKD(cA, ks(p))} = ${G.fmtAcre(cA)}` : ''], ['Share', h(p.area.share)], ['Kattha used', ks(p) + ' sq ft']])}
    <h2>Boundary sketch & chauhaddi</h2>
    <div style="display:flex;gap:14px;flex-wrap:wrap"><div style="flex:1 1 320px;max-width:420px;border:1px solid #ccc">${sketchSVG(p)}</div>
    <div style="flex:1 1 260px"><table><tr><th>Dir</th><th>As per deed</th><th>On ground</th></tr>${DIRS.map(([d, en, hi]) => `<tr><td><b>${d}</b> ${hi}</td><td>${h((p.chau[d] || {}).deed || '')}</td><td>${h((p.chau[d] || {}).ground || '')}${(p.chau[d] || {}).mis ? ' ⚠️' : ''}</td></tr>`).join('')}</table>
    ${p.chau.note ? `<p>${h(p.chau.note)}</p>` : ''}</div></div>
    ${p.pts.length ? `<h2>${many(p) ? `Boundary: walked track of ${p.pts.length} points — key points below (full coordinates in KML / backup)` : 'Corner coordinates (WGS84)'}</h2><table><tr><th>#</th><th>Name / mark</th><th>Latitude</th><th>Longitude</th><th>±m</th></tr>${p.pts.map((q, i) => many(p) && !isKey(q, i) ? '' : `<tr><td>${i + 1}</td><td>${h(q.label || '')} ${h(q.mon || '')}</td><td>${q.lat.toFixed(7)}</td><td>${q.lng.toFixed(7)}</td><td>${q.acc ?? '—'}</td></tr>`).join('')}</table>
    ${many(p) ? `<h2>Boundary length by direction</h2><div>${dirTotalsHTML(p)}</div>` : `<h2>Sides</h2><table><tr><th>Side</th><th>Faces</th><th>GPS length</th><th>Tape</th></tr>${E.map(e => `<tr><td>${e.i + 1}→${e.j + 1}</td><td>${e.f8}</td><td>${ft(e.len)} ft (${G.fmtN(e.len, 2)} m)</td><td>${p.tape.sides[e.i] ? h(p.tape.sides[e.i]) + ' ' + p.tape.unit : ''}</td></tr>`).join('')}</table>`}
    <p style="color:#666;font-size:11px">Coordinates from phone GPS (typ. ±3–10 m) — indicative, not a legal survey. Official boundary: amin measurement against the Bhu-Naksha.</p>` : ''}
    <h2>Owners</h2><table><tr><th>Name</th><th>Father/Husband</th><th>Share</th><th>Mobile</th></tr>${p.owners.filter(o => o.name).map(o => `<tr><td>${h(o.name)}</td><td>${h(o.guardian)}</td><td>${h(o.share)}</td><td>${h(o.mobile)}</td></tr>`).join('') || '<tr><td colspan=4>—</td></tr>'}</table>
    <h2>Chain of title</h2><table><tr><th>Date</th><th>Mode</th><th>From → To</th><th>Deed / Office / Vol-Page</th><th>₹</th><th>Mutation</th></tr>
    ${p.history.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => `<tr><td>${h(e.date)}</td><td>${h((MODE_T[e.mode] || '').split(' (')[0])}</td><td>${h(e.from)} → ${h(e.to)}${e.notes ? `<br><i>${h(e.notes)}</i>` : ''}</td><td>${h([e.deedNo, e.office, e.volPage].filter(Boolean).join(' / '))}</td><td>${e.amount ? G.fmtN(+e.amount, 0) : ''}</td><td>${h(e.mutNo)}</td></tr>`).join('') || '<tr><td colspan=6>—</td></tr>'}</table>
    <h2>Documents held (${docs.length})</h2><table><tr><th>Type</th><th>Title</th><th>Date</th><th>Ref</th></tr>${docs.map(d => `<tr><td>${h(d.type.split(' (')[0])}</td><td>${h(d.title)}</td><td>${h(d.date)}</td><td>${h(d.ref || '')}</td></tr>`).join('') || '<tr><td colspan=4>—</td></tr>'}</table>
    ${p.notes ? `<h2>Notes</h2><p style="white-space:pre-wrap">${h(p.notes)}</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- EXPORTS
async function saveOrShare(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return true;
}
const xml = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function kmlColor(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, 'e53935']; const r = m[1].slice(0, 2), g = m[1].slice(2, 4), b = m[1].slice(4, 6); return { line: 'ff' + b + g + r, fill: '55' + b + g + r }; }
function toKML(ps) {
  const pm = ps.filter(p => p.pts.length).map(p => {
    const c = kmlColor(p.color), r = recSqft(p), g = gpsSqft(p);
    const desc = `<table><tr><td>Mauza</td><td>${xml(p.loc.mauza)}</td></tr><tr><td>Khata/Khesra</td><td>${xml(p.rec.khata)} / ${xml(p.rec.khesra)}</td></tr><tr><td>Record area</td><td>${xml(G.fmtBKD(r, ks(p)))}</td></tr><tr><td>GPS area</td><td>${xml(G.fmtBKD(g, ks(p)))} (${xml(G.fmtAcre(g))})</td></tr><tr><td>Owner</td><td>${xml(p.owners.map(o => o.name).filter(Boolean).join(', '))}</td></tr>${DIRS.map(([d]) => `<tr><td>${d}</td><td>${xml((p.chau[d] || {}).ground || (p.chau[d] || {}).deed || '')}</td></tr>`).join('')}</table>`;
    const geom = p.pts.length >= 3 ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p.pts.concat([p.pts[0]]).map(q => `${q.lng.toFixed(8)},${q.lat.toFixed(8)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : `<LineString><coordinates>${p.pts.map(q => `${q.lng.toFixed(8)},${q.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString>`;
    return `<Folder><name>${xml(pTitle(p))}</name><Placemark><name>${xml(pTitle(p))}</name><description><![CDATA[${desc}]]></description><Style><LineStyle><color>${c.line}</color><width>3</width></LineStyle><PolyStyle><color>${c.fill}</color></PolyStyle></Style>${geom}</Placemark>
      ${p.pts.map((q, i) => `<Placemark><name>${i + 1}</name><description>${xml((q.label || '') + ' ' + (q.mon || '') + (q.acc ? ' ±' + q.acc + 'm' : ''))}</description><Point><coordinates>${q.lng.toFixed(8)},${q.lat.toFixed(8)},0</coordinates></Point></Placemark>`).join('')}</Folder>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(S.settings.title)}</name>\n${pm}\n</Document></kml>`;
}
function toGeoJSON(ps) {
  return JSON.stringify({
    type: 'FeatureCollection', features: ps.filter(p => p.pts.length >= 3).map(p => ({
      type: 'Feature', properties: { name: pTitle(p), status: p.status, ...Object.fromEntries(Object.entries(p.loc).map(([k, v]) => ['loc_' + k, v])), khata: p.rec.khata, khesra: p.rec.khesra, record_sqft: recSqft(p) || null, gps_sqft: Math.round(gpsSqft(p)) },
      geometry: { type: 'Polygon', coordinates: [p.pts.concat([p.pts[0]]).map(q => [+q.lng.toFixed(8), +q.lat.toFixed(8)])] }
    }))
  }, null, 1);
}
function toCSV(ps) {
  const cols = ['Name', 'Status', 'State', 'District', 'Anchal', 'Halka', 'Mauza', 'Thana', 'Khata', 'Khesra', 'ULPIN', 'Jamabandi', 'Record area', 'Record sqft', 'GPS area', 'GPS sqft', 'Owners', 'North', 'East', 'South', 'West', 'Lagan paid up to', 'Mutation', 'Centre lat', 'Centre lng', 'Corners'];
  const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = ps.map(p => { const c = G.centroid(p.pts); const r = recSqft(p), g = gpsSqft(p); return [pTitle(p), p.status, p.loc.state, p.loc.district, p.loc.anchal, p.loc.halka, p.loc.mauza, p.loc.thana, p.rec.khata, p.rec.khesra, p.rec.ulpin, p.rec.jamabandi, fmtA(p, r), isFinite(r) ? Math.round(r) : '', fmtA(p, g), isFinite(g) ? Math.round(g) : '', p.owners.map(o => o.name).filter(Boolean).join('; '), ...DIRS.map(([d]) => (p.chau[d] || {}).ground || (p.chau[d] || {}).deed || ''), p.rev.laganFY, p.rev.mutStatus, c ? c.lat.toFixed(7) : '', c ? c.lng.toFixed(7) : '', p.pts.map(x => x.lat.toFixed(7) + ' ' + x.lng.toFixed(7)).join(' | ')]; });
  return '﻿' + [cols, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}
function toMD(p, docs, docPrefix) {
  const c = G.centroid(p.pts), r = recSqft(p), g = gpsSqft(p);
  const y = v => JSON.stringify(v == null ? '' : String(v));
  const fm = ['---', `title: ${y(pTitle(p))}`, `status: ${p.status}`, `state: ${y(p.loc.state)}`, `district: ${y(p.loc.district)}`, `anchal: ${y(p.loc.anchal)}`, `mauza: ${y(p.loc.mauza)}`, `thana: ${y(p.loc.thana)}`, `khata: ${y(p.rec.khata)}`, `khesra: ${y(p.rec.khesra)}`, `record_area: ${y(fmtA(p, r))}`, `gps_area: ${y(isFinite(g) ? fmtA(p, g) : '')}`,
    c ? `location: [${c.lat.toFixed(7)}, ${c.lng.toFixed(7)}]` : null, `tags: [land, ${y(p.loc.mauza || 'parcel').replace(/\s+/g, '-')}]`, '---'].filter(Boolean).join('\n');
  const row = (k, v) => v ? `| ${k} | ${String(v).replace(/\|/g, '/')} |\n` : '';
  let md = `${fm}\n# ${pTitle(p)}\n\n| Field | Value |\n|---|---|\n` + row('Status', (STATUS.find(s => s[0] === p.status) || [])[1]) + row('Anchal / Halka', [p.loc.anchal, p.loc.halka].filter(Boolean).join(' / ')) + row('Khata / Khesra', [p.rec.khata, p.rec.khesra].filter(Boolean).join(' / ')) + row('Jamabandi', p.rec.jamabandi) + row('ULPIN', p.rec.ulpin) + row('Record area', isFinite(r) ? `${G.fmtBKD(r, ks(p))} (${G.fmtAcre(r)})` : '') + row('GPS area', isFinite(g) ? `${G.fmtBKD(g, ks(p))} (${G.fmtAcre(g)})` : '') + row('Lagan paid up to', p.rev.laganFY) + row('Mutation', [p.rev.mutCase, p.rev.mutStatus].filter(Boolean).join(' – '));
  md += `\n## Chauhaddi\n| Dir | Deed | Ground |\n|---|---|---|\n` + DIRS.map(([d, en]) => `| ${en} | ${(p.chau[d] || {}).deed || ''} | ${(p.chau[d] || {}).ground || ''}${(p.chau[d] || {}).mis ? ' ⚠️' : ''} |`).join('\n') + '\n';
  if (p.chau.note) md += `\n${p.chau.note}\n`;
  md += `\n## Owners\n` + p.owners.filter(o => o.name).map(o => `- ${o.name}${o.guardian ? ' (' + o.guardian + ')' : ''}${o.share ? ' — ' + o.share : ''}${o.mobile ? ' · ' + o.mobile : ''}`).join('\n') + '\n';
  md += `\n## Chain of title\n` + p.history.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => `- **${e.date || '?'}** ${(MODE_T[e.mode] || '').split(' (')[0]}: ${e.from || '?'} → ${e.to || '?'}${e.deedNo ? ', deed ' + e.deedNo : ''}${e.office ? ', ' + e.office : ''}${e.amount ? ', ₹' + e.amount : ''}${e.notes ? ' — ' + e.notes : ''}`).join('\n') + '\n';
  if (p.pts.length) md += `\n## Corners (lat, lng, ±m)\n` + p.pts.map((q, i) => `${i + 1}. ${q.lat.toFixed(7)}, ${q.lng.toFixed(7)} ±${q.acc ?? '?'} ${q.label || ''} ${q.mon || ''}`).join('\n') + '\n';
  if (docs.length) md += `\n## Documents\n` + docs.map(d => docPrefix != null ? `- ![[${docPrefix}${docFileName(d)}]] ${d.title || d.type}` : `- ${d.type.split(' (')[0]}: ${d.title || ''} ${d.date || ''}`).join('\n') + '\n';
  if ((p.tasks || []).length) md += `\n## Tasks\n` + p.tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.text}${t.due ? ' 📅 ' + t.due : ''}`).join('\n') + '\n';
  if (p.notes) md += `\n## Notes\n${p.notes}\n`;
  return md;
}
const docFileName = d => safeName(`${d.title || d.type.split(' (')[0]}-${d.id.slice(0, 6)}`) + extOf(d);

async function buildZip(withDocs) {
  const zip = new JSZip();
  const docs = await DB.all('docs');
  const meta = docs.map(({ blob, ...m }) => ({ ...m, file: 'docs/' + m.parcelId + '/' + docFileName(m) }));
  const settings = Object.assign({}, S.settings, { tg: Object.assign({}, S.settings.tg, { token: '' }) }); // never put the bot token in a backup
  zip.file('data.json', JSON.stringify({ app: 'zameen-register', version: 1, exportedAt: new Date().toISOString(), withDocs, settings, parcels: S.parcels, docs: meta }, null, 1));
  if (withDocs) docs.forEach((d, i) => zip.file(meta[i].file, d.blob));
  zip.file('parcels.kml', toKML(S.parcels));
  zip.file('parcels.geojson', toGeoJSON(S.parcels));
  zip.file('parcels.csv', toCSV(S.parcels));
  for (const p of S.parcels) {
    const pd = docs.filter(d => d.parcelId === p.id);
    zip.file('obsidian/' + safeName(pTitle(p)) + '.md', toMD(p, pd, withDocs ? '' : null));
    if (withDocs) pd.forEach(d => zip.file('obsidian/attachments/' + docFileName(d), d.blob));
  }
  zip.file('README.txt', 'Zameen Register backup' + (withDocs ? ' (FULL: data + documents)' : ' (DATA ONLY: documents are in the latest FULL backup)') + '\n\nRestore: open the app > Settings > Restore backup and pick this ZIP (select all .001/.002 parts together if split).\nparcels.kml opens in Google Earth. parcels.csv opens in Excel/Sheets.\nobsidian/ can be copied into your Obsidian vault.\n');
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`; };
async function fullBackup() {
  toast('Preparing backup…', 8000);
  const blob = await buildZip(true);
  const ok = await saveOrShare(blob, `zameen-full-${stamp()}.zip`);
  if (ok) { S.settings.lastBackup = Date.now(); await saveSettings(); toast(`Backup ready (${kb(blob.size)})`); }
}
// ---------- Telegram backup
const TG_PART = 45 * 1024 * 1024; // bot upload limit is 50 MB
async function tgCall(method, body) {
  const t = S.settings.tg; if (!t.token) throw new Error('Bot token not set');
  const r = await fetch(`https://api.telegram.org/bot${t.token.trim()}/${method}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({ ok: false, description: 'HTTP ' + r.status }));
  if (!j.ok) throw new Error(j.description || 'Telegram error');
  return j.result;
}
async function tgSendBlob(blob, name, caption) {
  const parts = blob.size <= TG_PART ? [[blob, name]] : Array.from({ length: Math.ceil(blob.size / TG_PART) }, (_, i) => [blob.slice(i * TG_PART, (i + 1) * TG_PART), `${name}.${String(i + 1).padStart(3, '0')}`]);
  for (let i = 0; i < parts.length; i++) {
    const fd = new FormData(); fd.append('chat_id', S.settings.tg.chat.trim());
    fd.append('document', new File([parts[i][0]], parts[i][1], { type: 'application/zip' }));
    fd.append('caption', caption + (parts.length > 1 ? `\nPart ${i + 1}/${parts.length} — select all parts together to restore` : ''));
    fd.append('disable_notification', 'true');
    await tgCall('sendDocument', fd);
  }
  return parts.length;
}
let tgBusy = false;
async function tgBackup(opts = {}) {
  const t = S.settings.tg; if (!t.token || !t.chat) { if (!opts.silent) toast('Set bot token and chat ID first'); return false; }
  if (tgBusy) return false; tgBusy = true;
  try {
    const withDocs = !!opts.full || !S.settings.lastTgFull || S.settings.lastDocChange > S.settings.lastTgFull;
    if (!opts.silent) toast('Sending to Telegram…', 20000);
    const t0 = Date.now();
    const blob = await buildZip(withDocs);
    const nd = (await DB.all('docs')).length;
    const n = await tgSendBlob(blob, `zameen-${withDocs ? 'full' : 'data'}-${stamp()}.zip`,
      `🌾 ${S.settings.title} — ${withDocs ? 'FULL backup' : 'data-only backup'}\n${S.parcels.length} parcels · ${nd} documents · ${kb(blob.size)}\n${new Date().toLocaleString('en-IN')}`);
    S.settings.lastTg = t0; S.settings.lastBackup = t0; if (withDocs) S.settings.lastTgFull = t0;
    S.settings.tgErr = ''; await saveSettings();
    if (!opts.silent) toast(`✅ Sent to Telegram (${withDocs ? 'full' : 'data only'}, ${kb(blob.size)}${n > 1 ? ', ' + n + ' parts' : ''})`, 4000);
    else toast(`☁️ Auto-backup sent to Telegram`, 2500);
    return true;
  } catch (e) {
    S.settings.tgErr = e.message + ' (' + new Date().toLocaleString('en-IN') + ')'; saveSettings();
    if (!opts.silent) toast('Telegram: ' + e.message, 5000);
    return false;
  } finally { tgBusy = false; }
}
async function autoTg() {
  const st = S.settings; if (!st || !st.tg || !st.tg.auto || !st.tg.token || !st.tg.chat) return;
  if (!navigator.onLine || st.lastChange <= st.lastTg) return;
  if (location.hash.startsWith('#/cap/') || location.hash.startsWith('#/find/')) return; // don't interrupt field work
  await tgBackup({ silent: true });
}
async function restore(files) {
  try {
    files = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
    const src = files.length > 1 ? new Blob(files) : files[0];
    const zip = await JSZip.loadAsync(src);
    const data = JSON.parse(await zip.file('data.json').async('string'));
    if (data.app !== 'zameen-register') throw new Error('Not a Zameen Register backup');
    if (data.settings && data.settings.tg) delete data.settings.tg;
    const mode = await new Promise(res => sheet(`<h2>Restore ${data.parcels.length} parcels${data.withDocs === false ? ' (data-only backup — documents not included; use Merge to keep the ones on this phone)' : ', ' + data.docs.length + ' documents'}?</h2><p class="small">Backup from ${h(new Date(data.exportedAt).toLocaleString('en-IN'))}.</p>
      <div class="fld"><button class="btn p full" id="m1">Merge — keep newer version of each parcel</button></div><div class="fld"><button class="btn d full" id="m2">Replace everything on this phone</button></div><button class="btn full" id="m0">Cancel</button>`, (el, close) => {
      $('#m1', el).onclick = () => { close(); res('merge'); }; $('#m2', el).onclick = () => { close(); res('replace'); }; $('#m0', el).onclick = () => { close(); res(null); };
    }));
    if (!mode) return;
    toast('Restoring…', 10000);
    if (mode === 'replace') { await DB.clear('parcels'); await DB.clear('docs'); S.parcels = []; }
    const have = Object.fromEntries(S.parcels.map(p => [p.id, p]));
    let np = 0, nd = 0;
    for (const p of data.parcels) { if (!have[p.id] || (p.updatedAt || 0) > (have[p.id].updatedAt || 0)) { await DB.put('parcels', p); np++; } }
    const existing = new Set((await DB.all('docs')).map(d => d.id));
    for (const m of data.docs) { if (existing.has(m.id)) continue; const f = zip.file(m.file); if (!f) continue; const blob = await f.async('blob'); const { file: _f, ...rest } = m; await DB.put('docs', { ...rest, blob: new Blob([blob], { type: m.mime || '' }) }); nd++; }
    S.parcels = await DB.all('parcels'); touch(true);
    toast(`Restored ${np} parcels, ${nd} documents`); location.hash = '#/'; route();
  } catch (e) { toast('Restore failed: ' + e.message, 5000); }
}

// ---------------------------------------------------------------- SETTINGS
async function viewSettings() {
  setHeader('Backup & settings', '#/');
  let est = null; try { est = await navigator.storage.estimate(); } catch (e) { }
  let persisted = false; try { persisted = await navigator.storage.persisted(); } catch (e) { }
  const docs = await DB.all('docs');
  const s = S.settings;
  main().innerHTML = `
  <div class="card"><h3>💾 Backup (do this after every field visit)</h3>
    <p class="small">One ZIP with everything: data, all document files, KML for Google Earth, CSV for Excel and Obsidian notes. Share it to your Telegram backup channel / Google Drive.</p>
    <button class="btn p full" id="bk">Create full backup ZIP</button>
    <div class="small mute" style="margin-top:6px">Last backup: ${s.lastBackup ? new Date(s.lastBackup).toLocaleString('en-IN') : 'never'}</div>
    <label class="btn full" style="margin-top:10px">♻️ Restore from backup ZIP<input type="file" multiple id="rs" hidden></label>
    <div class="hint">If a Telegram backup came in parts (.zip.001, .002…), download all and select them together.</div></div>
  <div class="card"><h3>☁️ Auto-backup to Telegram</h3>
    <div class="small">Uses your own bot. Whenever records change, a backup is sent to your private channel/chat (when online): a small <b>data-only</b> ZIP normally, a <b>full</b> ZIP with documents whenever documents changed. Files over 45 MB are split.</div>
    <div class="fld" style="margin-top:8px"><label class="f">Bot token (from @BotFather)</label><input class="i" id="tgt" type="password" autocomplete="off" value="${h(s.tg.token)}" placeholder="123456:ABC-…"></div>
    <div class="fld"><label class="f">Chat / channel ID</label><div class="row"><input class="i grow" id="tgc" value="${h(s.tg.chat)}" placeholder="-100… or @channelname" style="width:auto"><button class="btn s" id="tgf">Find</button></div></div>
    <label class="chk"><input type="checkbox" id="tga" ${s.tg.auto ? 'checked' : ''}>Send automatically after changes</label>
    <div class="row" style="margin-top:10px"><button class="btn s grow" id="tgs">Save</button><button class="btn s grow" id="tgx">Test message</button><button class="btn s p grow" id="tgb">Send full backup now</button></div>
    <div class="small mute" style="margin-top:6px">Last Telegram backup: ${s.lastTg ? new Date(s.lastTg).toLocaleString('en-IN') : 'never'}${s.lastTgFull ? ' · last full: ' + new Date(s.lastTgFull).toLocaleString('en-IN') : ''}${s.lastChange > s.lastTg && s.lastTg ? ' · <b>changes pending</b>' : ''}</div>
    ${s.tgErr ? `<div class="banner d small" style="margin-top:6px">Last error: ${h(s.tgErr)}</div>` : ''}
    <div class="hint">Setup: add the bot as <b>admin</b> of your private channel → post any message in the channel → tap <b>Find</b>. The token is stored only on this phone and is never put inside backup files. Phones can't run web apps in the background, so auto-backup happens while the app is open or as you leave it.</div></div>
  <div class="card"><h3>Exports</h3><div class="row">
    <button class="btn s grow" id="xk">🌍 KML (all)</button><button class="btn s grow" id="xg">GeoJSON</button><button class="btn s grow" id="xc">📊 CSV</button></div></div>
  <div class="card"><h3>Defaults</h3>
    <div class="fld"><label class="f">App title</label><input class="i" id="st" value="${h(s.title)}"></div>
    <div class="grid2"><div class="fld"><label class="f">Default state for new parcels</label><input class="i" id="sst" list="dlS2" value="${h(s.state)}"></div><div class="fld"><label class="f">Default district</label><input class="i" id="sdi" list="dlD2" value="${h(s.district)}"></div>
    <datalist id="dlS2">${STATES.map(x => `<option value="${x}">`).join('')}</datalist><datalist id="dlD2">${BIHAR_D.concat(JHAR_D).map(x => `<option value="${x}">`).join('')}</datalist></div>
    <div class="grid2"><div class="fld"><label class="f">Default unit system</label><select class="i" id="ss"><option value="bkd" ${s.sys === 'bkd' ? 'selected' : ''}>Bigha–Kattha–Dhur</option><option value="acre" ${s.sys === 'acre' ? 'selected' : ''}>Acre–Decimal</option><option value="sqft" ${s.sys === 'sqft' ? 'selected' : ''}>Sq ft</option></select></div>
    <div class="fld"><label class="f">Default 1 Kattha = sq ft</label><input class="i" id="sk" inputmode="decimal" value="${h(s.katthaSqft)}"></div>
    <div class="fld"><label class="f">GPS averaging per corner (sec)</label><input class="i" id="sa" inputmode="numeric" value="${h(s.avgSec)}"></div>
    <div class="fld"><label class="f">Ignore readings worse than (m)</label><input class="i" id="sm" inputmode="numeric" value="${h(s.maxAcc)}"></div></div>
    <button class="btn p" id="sv">Save defaults</button></div>
  <div class="card"><h3>Storage on this phone</h3>
    <div class="small">${S.parcels.length} parcels · ${docs.length} documents (${kb(docs.reduce((a, d) => a + (d.size || 0), 0))})${est ? ` · browser storage used ${kb(est.usage || 0)} of ${kb(est.quota || 0)}` : ''}</div>
    <div class="small" style="margin-top:6px">${persisted ? '✅ Protected storage is on (browser will not auto-clear).' : '⚠️ Storage not yet protected.'}</div>
    ${persisted ? '' : '<button class="btn s" id="ps" style="margin-top:6px">Protect storage</button>'}
    <div class="hint">Do not "Clear site data" for this site in browser settings — that erases records. Install the app (browser menu → Add to Home screen) so it works offline.</div></div>
  <div class="card"><h3>About GPS accuracy</h3><div class="small">Phone GPS is typically good to a few metres in open fields; dual-frequency phones do better. This app averages ${s.avgSec}s of readings per corner, lets you re-measure and merge sessions, nudge points onto the satellite image, and cross-check with tape lengths. Treat results as a strong personal record, not a legal survey — for disputes, get an amin/surveyor measurement against the Bhu-Naksha.</div></div>
  <div class="card"><button class="btn d full" id="wipe">Erase all data on this phone</button></div>`;
  $('#bk').onclick = fullBackup;
  $('#rs').onchange = e => { const f = e.target.files; if (f.length) restore(f); e.target.value = ''; };
  const tgRead = () => { s.tg = { token: $('#tgt').value.trim(), chat: $('#tgc').value.trim(), auto: $('#tga').checked }; };
  $('#tgs').onclick = async () => { tgRead(); await saveSettings(); toast('Saved'); };
  $('#tgx').onclick = async () => { tgRead(); await saveSettings(); try { const fd = new FormData(); fd.append('chat_id', s.tg.chat); fd.append('text', '🌾 Zameen Register connected. Backups will arrive here.'); await tgCall('sendMessage', fd); toast('✅ Test message sent'); } catch (e) { toast('Telegram: ' + e.message, 5000); } };
  $('#tgb').onclick = async () => { tgRead(); await saveSettings(); if (await tgBackup({ full: true })) viewSettings(); };
  $('#tgf').onclick = async () => {
    tgRead(); await saveSettings();
    try {
      const ups = await tgCall('getUpdates', new FormData());
      const chats = {}; ups.forEach(u => { const m = u.message || u.channel_post || u.my_chat_member || u.edited_channel_post || {}; const c = m.chat; if (c) chats[c.id] = c.title || c.username || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.id; });
      const ids = Object.keys(chats);
      if (!ids.length) return toast('No chats seen yet — post a message in the channel (bot must be admin), then tap Find again.', 6000);
      sheet(`<h2>Pick the backup chat</h2>${ids.map(id => `<div class="fld"><button class="btn full" data-c="${h(id)}">${h(chats[id])} <span class="mute small">${h(id)}</span></button></div>`).join('')}<button class="btn full" data-close>Cancel</button>`, (el, close) => {
        el.onclick = async e => { const b = e.target.closest('[data-c]'); if (!b) return; $('#tgc').value = b.dataset.c; tgRead(); await saveSettings(); close(); toast('Chat set — tap Test message'); };
      });
    } catch (e) { toast('Telegram: ' + e.message + (/conflict/i.test(e.message) ? ' — another program is polling this bot; copy the chat ID from there instead.' : ''), 7000); }
  };
  $('#xk').onclick = () => saveOrShare(new Blob([toKML(S.parcels)], { type: 'application/vnd.google-earth.kml+xml' }), 'parcels.kml');
  $('#xg').onclick = () => saveOrShare(new Blob([toGeoJSON(S.parcels)], { type: 'application/geo+json' }), 'parcels.geojson');
  $('#xc').onclick = () => saveOrShare(new Blob([toCSV(S.parcels)], { type: 'text/csv' }), 'parcels.csv');
  $('#sv').onclick = async () => { Object.assign(s, { state: $('#sst').value, district: $('#sdi').value, title: $('#st').value || 'Zameen Register', sys: $('#ss').value, katthaSqft: +$('#sk').value || 1361.25, avgSec: Math.max(3, +$('#sa').value || 20), maxAcc: Math.max(3, +$('#sm').value || 20) }); await saveSettings(); toast('Saved'); };
  const ps = $('#ps'); if (ps) ps.onclick = async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Storage protected' : 'Browser declined — install the app to home screen and try again'); viewSettings(); } catch (e) { toast('Not supported'); } };
  $('#wipe').onclick = () => sheet(`<h2>Erase everything?</h2><p class="small">Type <b>ERASE</b> to confirm. Take a backup first.</p><input class="i" id="cf"><div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn d" id="go">Erase</button></div>`, (el, close) => {
    $('#go', el).onclick = async () => { if ($('#cf', el).value !== 'ERASE') return toast('Type ERASE'); await DB.clear('parcels'); await DB.clear('docs'); S.parcels = []; close(); location.hash = '#/'; toast('All data erased'); };
  });
}

// ---------------------------------------------------------------- GLOSSARY
function viewHelp() {
  setHeader('Land terms · भूमि शब्दावली', '#/');
  const GL = window.GLOSSARY || [];
  main().innerHTML = `<input class="i" id="gq" placeholder="🔎 Search a term — खेसरा, LPC, kistwar…" style="margin-bottom:12px"><div id="gl"></div>
    <div class="card small mute">Meanings are general guidance for Bihar (and Jharkhand where noted). Local usage varies — confirm with the anchal office or a revenue lawyer for anything legal.</div>`;
  const render = q => {
    q = (q || '').toLowerCase().trim();
    $('#gl').innerHTML = GL.map(([sec, items]) => {
      const it = items.filter(t => !q || t.join(' ').toLowerCase().includes(q));
      if (!it.length) return '';
      return `<details class="card" ${q ? 'open' : ''}><summary>${h(sec)} <span class="mute small">(${it.length})</span></summary><div style="margin-top:8px">${it.map(([hi, en, m]) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><b>${h(hi)}</b> <span class="mute">· ${h(en)}</span><div class="small">${m}</div></div>`).join('')}</div></details>`;
    }).join('') || '<div class="empty">No match</div>';
  };
  render(); $('#gq').oninput = e => render(e.target.value);
}

// ---------------------------------------------------------------- boot
async function boot() {
  try { await DB.open(); } catch (e) { main().innerHTML = `<div class="banner d">Storage unavailable: ${h(e.message)}. Private/incognito mode does not keep data.</div>`; return; }
  S.settings = Object.assign({}, DEF_SETTINGS, (await DB.get('kv', 'settings')) || {});
  S.parcels = await DB.all('parcels');
  S.parcels.forEach(p => { // forward-compat defaults
    const d = newParcel(); for (const k of Object.keys(d)) if (p[k] == null) p[k] = d[k];
    ['loc', 'rec', 'area', 'rev', 'chau', 'tape', 'lease'].forEach(k => p[k] = Object.assign({}, d[k], p[k]));
  });
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) navigator.storage.persist(); } catch (e) { }
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.cur) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoTg(); });
  window.addEventListener('online', () => autoTg());
  setInterval(autoTg, 10 * 60 * 1000);
  setTimeout(autoTg, 8000);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
window.ZR = { S, G, DB, toKML, toCSV, toMD, sketchSVG }; // for debugging
boot();
})();
