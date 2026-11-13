/* geo.js — geometry, units, parsers. Pure functions, no DOM except parsers. */
(function (G) {
  const R = 6371008.8; // mean earth radius, m
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

  // ---------- units ----------
  const SQFT_PER_M2 = 10.7639104;
  const U = {
    SQFT_PER_M2,
    ACRE_SQFT: 43560,
    DECIMAL_SQFT: 435.6,
    HECTARE_SQFT: 107639.104,
    FT_PER_M: 3.28083989,
    LINK_FT: 0.66,        // Gunter's link (kadi) = 7.92 in
    CHAIN_FT: 66,
    GAJ_FT: 3
  };
  G.U = U;

  G.lenToFt = (v, unit) => {
    v = +v; if (!isFinite(v)) return NaN;
    return unit === 'm' ? v * U.FT_PER_M : unit === 'kadi' ? v * U.LINK_FT : unit === 'gaj' ? v * U.GAJ_FT : unit === 'chain' ? v * U.CHAIN_FT : v;
  };

  // area in sqft from a record entry {sys:'bkd'|'acre'|'sqft', b,k,d, acre, dec, sqft, katthaSqft}
  G.recordSqft = (a) => {
    if (!a) return NaN;
    const ks = +a.katthaSqft || 1361.25;
    if (a.sys === 'acre') {
      const v = (+a.acre || 0) * U.ACRE_SQFT + (+a.dec || 0) * U.DECIMAL_SQFT;
      return v || NaN;
    }
    if (a.sys === 'sqft') return +a.sqft || NaN;
    const v = (+a.b || 0) * 20 * ks + (+a.k || 0) * ks + (+a.d || 0) * ks / 20;
    return v || NaN;
  };

  const fmtN = (v, dp = 2) => (isFinite(v) ? (+v).toLocaleString('en-IN', { maximumFractionDigits: dp, minimumFractionDigits: 0 }) : '—');
  G.fmtN = fmtN;

  G.fmtBKD = (sqft, ks = 1361.25) => {
    if (!isFinite(sqft) || sqft <= 0) return '—';
    const totalDhur = sqft / (ks / 20);
    const b = Math.floor(totalDhur / 400);
    const k = Math.floor((totalDhur - b * 400) / 20);
    const d = totalDhur - b * 400 - k * 20;
    const parts = [];
    if (b) parts.push(b + ' बीघा');
    if (k || b) parts.push(k + ' कट्ठा');
    parts.push(fmtN(d, 1) + ' धुर');
    return parts.join(' ');
  };
  G.fmtAcre = sqft => isFinite(sqft) && sqft > 0 ? fmtN(sqft / U.DECIMAL_SQFT, 2) + ' dec (' + fmtN(sqft / U.ACRE_SQFT, 3) + ' ac)' : '—';
  G.fmtArea = (sqft, sys, ks) => sys === 'acre' ? G.fmtAcre(sqft) : sys === 'sqft' ? fmtN(sqft, 0) + ' sq ft' : G.fmtBKD(sqft, ks);
  G.fmtAllUnits = (sqft, ks = 1361.25) => !isFinite(sqft) || sqft <= 0 ? [] : [
    ['बीघा-कट्ठा-धुर', G.fmtBKD(sqft, ks)],
    ['Decimal / Acre', G.fmtAcre(sqft)],
    ['Kattha', fmtN(sqft / ks, 3)],
    ['Sq ft', fmtN(sqft, 0)],
    ['Sq m', fmtN(sqft / SQFT_PER_M2, 1)],
    ['Hectare', fmtN(sqft / U.HECTARE_SQFT, 4)]
  ];

  // ---------- spherical basics ----------
  G.dist = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  G.bearing = (a, b) => {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  };
  const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const C8H = { N: 'उत्तर', NE: 'ईशान', E: 'पूरब', SE: 'अग्नि', S: 'दक्षिण', SW: 'नैऋत्य', W: 'पश्चिम', NW: 'वायव्य' };
  G.compass8 = d => C8[Math.round(((d % 360) + 360) % 360 / 45) % 8];
  G.compass4 = d => ['N', 'E', 'S', 'W'][Math.round(((d % 360) + 360) % 360 / 90) % 4];
  G.hindiDir = c => C8H[c] || c;

  // local tangent-plane projection (metres), good for parcels up to several km
  G.projector = (origin) => {
    const k = Math.cos(rad(origin.lat));
    return {
      fwd: p => ({ x: rad(p.lng - origin.lng) * R * k, y: rad(p.lat - origin.lat) * R }),
      inv: q => ({ lat: origin.lat + deg(q.y / R), lng: origin.lng + deg(q.x / (R * k)) })
    };
  };
  G.centroid = pts => {
    if (!pts || !pts.length) return null;
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return { lat, lng };
  };
  const signedAreaXY = xy => {
    let s = 0;
    for (let i = 0; i < xy.length; i++) { const a = xy[i], b = xy[(i + 1) % xy.length]; s += a.x * b.y - b.x * a.y; }
    return s / 2;
  };
  G.areaM2 = pts => {
    if (!pts || pts.length < 3) return 0;
    const pr = G.projector(G.centroid(pts));
    return Math.abs(signedAreaXY(pts.map(pr.fwd)));
  };
  G.perimeter = pts => {
    if (!pts || pts.length < 2) return 0;
    let s = 0; for (let i = 0; i < pts.length; i++) { if (pts.length === 2 && i === 1) break; s += G.dist(pts[i], pts[(i + 1) % pts.length]); }
    return s;
  };
  // edges with length, forward bearing, outward-facing direction
  G.edges = pts => {
    const n = pts ? pts.length : 0; if (n < 2) return [];
    const pr = G.projector(G.centroid(pts));
    const xy = pts.map(pr.fwd);
    const ccw = signedAreaXY(xy) > 0;
    const out = [];
    const m = n === 2 ? 1 : n;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n, a = xy[i], b = xy[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      // outward normal: CCW -> (dy,-dx); CW -> (-dy,dx)
      const nx = ccw ? dy : -dy, ny = ccw ? -dx : dx;
      const facing = (deg(Math.atan2(nx, ny)) + 360) % 360;
      out.push({ i, j, len: G.dist(pts[i], pts[j]), bearing: G.bearing(pts[i], pts[j]), facing, f8: G.compass8(facing), f4: G.compass4(facing) });
    }
    return out;
  };
  // 1-sigma area uncertainty (m²) from independent per-vertex errors (m):
  // Var(A) = Σ σi² · |p(i+1) − p(i−1)|² / 4
  G.areaSigma = (pts, sig) => {
    const n = pts.length; if (n < 3) return NaN;
    const pr = G.projector(G.centroid(pts)); const xy = pts.map(pr.fwd);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const a = xy[(i - 1 + n) % n], b = xy[(i + 1) % n];
      const s = sig[i]; if (!(s >= 0)) continue;
      v += s * s * ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) / 4;
    }
    return Math.sqrt(v);
  };

  // point vs polygon: inside? and distance to nearest edge (m)
  G.pointStatus = (p, pts) => {
    if (!pts || pts.length < 3) return null;
    const pr = G.projector(G.centroid(pts)); const xy = pts.map(pr.fwd); const q = pr.fwd(p);
    let inside = false;
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
      const a = xy[i], b = xy[j];
      if (((a.y > q.y) !== (b.y > q.y)) && (q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    }
    let best = { d: Infinity, edge: -1 };
    for (let i = 0; i < xy.length; i++) {
      const a = xy[i], b = xy[(i + 1) % xy.length];
      const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy || 1e-9;
      let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
      if (d < best.d) best = { d, edge: i };
    }
    return { inside, d: best.d, edge: best.edge };
  };

  // ---------- GPS averaging ----------
  // samples: [{lat,lng,acc}] -> {lat,lng,acc,spread,n,used}
  G.averageFix = (samples, maxAcc = 20) => {
    if (!samples.length) return null;
    let used = samples.filter(s => s.acc <= maxAcc);
    if (used.length < 3) { // fall back to best half
      used = samples.slice().sort((a, b) => a.acc - b.acc).slice(0, Math.max(1, Math.ceil(samples.length / 2)));
    }
    let W = 0, lat = 0, lng = 0;
    used.forEach(s => { const w = 1 / Math.max(1, s.acc) ** 2; W += w; lat += s.lat * w; lng += s.lng * w; });
    const mean = { lat: lat / W, lng: lng / W };
    const d = used.map(s => G.dist(mean, s));
    const spread = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
    const accs = used.map(s => s.acc).sort((a, b) => a - b);
    const medAcc = accs[Math.floor(accs.length / 2)];
    // honest estimate: phone errors are time-correlated, so don't divide by sqrt(n)
    const est = Math.max(spread, medAcc * 0.6);
    return { lat: mean.lat, lng: mean.lng, acc: +est.toFixed(1), medAcc: +medAcc.toFixed(1), spread: +spread.toFixed(1), n: samples.length, used: used.length };
  };
  // merge several sessions of the same corner (each {lat,lng,acc})
  G.mergeSessions = sessions => {
    if (!sessions.length) return null;
    let W = 0, lat = 0, lng = 0;
    sessions.forEach(s => { const w = 1 / Math.max(0.5, s.acc) ** 2; W += w; lat += s.lat * w; lng += s.lng * w; });
    const m = { lat: lat / W, lng: lng / W };
    const within = sessions.length > 1 ? Math.max(...sessions.map(s => G.dist(m, s))) : 0;
    const acc = Math.max(1 / Math.sqrt(W), within * 0.7);
    return { lat: m.lat, lng: m.lng, acc: +acc.toFixed(1) };
  };

  // ---------- chain-survey (tape) area ----------
  G.heron = (a, b, c) => { const s = (a + b + c) / 2; const v = s * (s - a) * (s - b) * (s - c); return v > 0 ? Math.sqrt(v) : (v > -1e-6 ? 0 : NaN); };
  // sides[i] = edge i->i+1 (n sides), diags[k] = corner1 -> corner(k+3) (n-3 diagonals). Same unit in, unit² out.
  G.chainArea = (sides, diags) => {
    const n = sides.length; if (n < 3) return NaN;
    if (sides.some(v => !(v > 0))) return NaN;
    if (n === 3) return G.heron(sides[0], sides[1], sides[2]);
    if (diags.length < n - 3 || diags.slice(0, n - 3).some(v => !(v > 0))) return NaN;
    let A = 0;
    for (let t = 0; t < n - 2; t++) {
      // triangle (0, t+1, t+2)
      const s1 = t === 0 ? sides[0] : diags[t - 1];
      const s2 = sides[t + 1];
      const s3 = t === n - 3 ? sides[n - 1] : diags[t];
      const a = G.heron(s1, s2, s3); if (isNaN(a)) return NaN; A += a;
    }
    return A;
  };

  // ---------- import parsers ----------
  G.parsePasted = text => {
    const pts = [];
    text.split(/\n|;/).forEach(line => {
      const nums = line.match(/-?\d+(?:\.\d+)?/g);
      if (nums && nums.length >= 2) {
        let a = +nums[0], b = +nums[1];
        // India: lat ~ 6-37, lng ~ 68-98. Swap if given as lng,lat
        if (Math.abs(a) > 60 && Math.abs(b) < 60) [a, b] = [b, a];
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) pts.push({ lat: a, lng: b, acc: 0, src: 'paste' });
      }
    });
    return pts;
  };
  G.parseGeoFile = (text, name = '') => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.geojson') || lower.endsWith('.json') || text.trim().startsWith('{')) {
      const j = JSON.parse(text); const out = [];
      const walk = g => {
        if (!g) return;
        if (g.type === 'FeatureCollection') g.features.forEach(f => walk(f.geometry));
        else if (g.type === 'Feature') walk(g.geometry);
        else if (g.type === 'Polygon') out.push(g.coordinates[0]);
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => out.push(p[0]));
        else if (g.type === 'LineString') out.push(g.coordinates);
        else if (g.type === 'Point') out.push([g.coordinates]);
      };
      walk(j);
      return out.map(r => dedupeClose(r.map(c => ({ lat: c[1], lng: c[0], acc: 0, src: 'import' }))));
    }
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const rings = [];
    if (doc.getElementsByTagName('gpx').length) {
      const grab = tag => Array.from(doc.getElementsByTagName(tag)).map(e => ({ lat: +e.getAttribute('lat'), lng: +e.getAttribute('lon'), acc: 0, src: 'import', label: (e.getElementsByTagName('name')[0] || {}).textContent || '' }));
      const w = grab('wpt'); if (w.length) rings.push(w);
      const t = grab('trkpt'); if (t.length) rings.push(t);
      const r = grab('rtept'); if (r.length) rings.push(r);
      return rings;
    }
    // KML
    const polys = Array.from(doc.getElementsByTagName('Polygon'));
    const take = el => {
      const c = el.getElementsByTagName('coordinates')[0]; if (!c) return null;
      return c.textContent.trim().split(/\s+/).map(t => t.split(',')).filter(a => a.length >= 2).map(a => ({ lat: +a[1], lng: +a[0], acc: 0, src: 'import' }));
    };
    polys.forEach(p => { const outer = p.getElementsByTagName('outerBoundaryIs')[0] || p; const r = take(outer); if (r) rings.push(dedupeClose(r)); });
    if (!rings.length) Array.from(doc.getElementsByTagName('LineString')).forEach(l => { const r = take(l); if (r) rings.push(r); });
    if (!rings.length) {
      const pts = Array.from(doc.getElementsByTagName('Point')).map(take).filter(Boolean).map(r => r[0]);
      if (pts.length) rings.push(pts);
    }
    return rings;
  };
  function dedupeClose(r) {
    if (r.length > 1) { const a = r[0], b = r[r.length - 1]; if (Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9) r = r.slice(0, -1); }
    return r;
  }

  // simplify a walked track to corners (Douglas–Peucker, tolerance m)
  G.simplify = (pts, tol = 2) => {
    if (pts.length < 3) return pts.slice();
    const pr = G.projector(G.centroid(pts)); const xy = pts.map(pr.fwd);
    const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [s, e] = st.pop(); let md = 0, mi = -1;
      const a = xy[s], b = xy[e], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-9;
      for (let i = s + 1; i < e; i++) { const d = Math.abs(dy * xy[i].x - dx * xy[i].y + b.x * a.y - b.y * a.x) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = true; st.push([s, mi], [mi, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
})(window.Geo = window.Geo || {});
