// ------------------------------------------------------------
// One Euro filter: smooths a shaky value for Hand 1 and Hand 2.
// Slow movement = strong smoothing, fast movement = light smoothing.
// ------------------------------------------------------------
class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.tPrev = null;
    this.xPrev = 0;
    this.dxPrev = 0;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, t) {
    if (this.tPrev === null) {
      this.tPrev = t;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(t - this.tPrev, 0.001);
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.tPrev = t;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

// Independent OneEuro filters for Hand 1 and Hand 2
const filterX = new OneEuro(1.2, 0.04, 1.0);
const filterY = new OneEuro(1.2, 0.04, 1.0);
const filterX2 = new OneEuro(1.2, 0.04, 1.0);
const filterY2 = new OneEuro(1.2, 0.04, 1.0);

// ------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Ramer-Douglas-Peucker: removes points that are not needed to keep the shape.
function simplify(points, eps) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx !== -1) {
      keep[idx] = true;
      stack.push([a, idx]);
      stack.push([idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function simplifyCapped(points, eps, maxN) {
  let e = eps;
  let s = simplify(points, e);
  let guard = 0;
  while (s.length > maxN && guard < 25) {
    e *= 1.4;
    s = simplify(points, e);
    guard++;
  }
  return s;
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i], points[i - 1]);
  }
  return total;
}

// Light smoothing of a stroke (1-2-1 average, endpoints kept).
function smoothStroke(points, passes) {
  let p = points;
  for (let k = 0; k < passes; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      q.push({
        x: (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4,
        y: (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4
      });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// Catmull-Rom spline interpolation for smooth curves between tracked points
function smoothCurve(points) {
  if (!points || points.length < 3) return points;
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const d = dist(p1, p2);
    const steps = Math.min(4, Math.max(1, Math.floor(d / 8)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      out.push({ x: x, y: y });
    }
  }
  return out;
}
window.smoothCurve = smoothCurve;

function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return { x: sx / poly.length, y: sy / poly.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function boundsOf(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function hullOf(poly) {
  const copy = poly.map((p) => ({ x: p.x, y: p.y }));
  return Matter.Vertices.hull(copy).map((p) => ({ x: p.x, y: p.y }));
}

function segmentCross(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return { x: a.x + t * rx, y: a.y + t * ry };
  }
  return null;
}

function findCrossing(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const pt = segmentCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]);
      if (pt) return { i, j, pt };
    }
  }
  return null;
}

function repairLoop(poly) {
  let p = poly.slice();
  if (p.length > 3 && dist(p[0], p[p.length - 1]) < 6) p.pop();
  for (let iter = 0; iter < 6; iter++) {
    const hit = findCrossing(p);
    if (!hit) return p;
    const A = [hit.pt].concat(p.slice(hit.i + 1, hit.j + 1));
    const B = [hit.pt].concat(p.slice(hit.j + 1), p.slice(0, hit.i + 1));
    p = polygonArea(A) >= polygonArea(B) ? A : B;
    if (p.length < 3) return null;
  }
  if (p.length < 3) return null;
  return findCrossing(p) ? hullOf(p) : p;
}

// ------------------------------------------------------------
// Clean geometric point generators
// ------------------------------------------------------------
function makeCirclePoints(center, radius, count = 32) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}
window.makeCirclePoints = makeCirclePoints;

function makeStarPoints(center, outerR, innerR, spikes = 5, rotOffset = -Math.PI / 2) {
  const pts = [];
  const total = spikes * 2;
  for (let i = 0; i < total; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const a = rotOffset + (i / total) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  return pts;
}
window.makeStarPoints = makeStarPoints;

function makeSpiralPoints(center, maxR, turns = 2.4, dir = 1, count = 42) {
  const pts = [];
  const startR = Math.max(6, maxR * 0.14);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = dir * t * turns * Math.PI * 2;
    const r = startR + (maxR - startR) * t;
    pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  return pts;
}
window.makeSpiralPoints = makeSpiralPoints;

function subdividePolygon(corners, stepsPerEdge = 6) {
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    for (let s = 0; s < stepsPerEdge; s++) {
      const t = s / stepsPerEdge;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
window.subdividePolygon = subdividePolygon;

function subdivideOpenLine(pts, stepsPerSeg = 5) {
  if (!pts || pts.length < 2) return pts ? pts.slice() : [];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}
window.subdivideOpenLine = subdivideOpenLine;

// ------------------------------------------------------------
// Corner Reduction & Fit Scoring
// ------------------------------------------------------------
function reduceToKCorners(poly, k) {
  if (!poly || poly.length <= k) return poly ? poly.slice() : [];
  const pts = poly.map((p) => ({ x: p.x, y: p.y }));
  while (pts.length > k) {
    let minArea = Infinity, removeIdx = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], curr = pts[i], next = pts[(i + 1) % n];
      const area = Math.abs(
        prev.x * (curr.y - next.y) + curr.x * (next.y - prev.y) + next.x * (prev.y - curr.y)
      ) * 0.5;
      if (area < minArea) { minArea = area; removeIdx = i; }
    }
    pts.splice(removeIdx, 1);
  }
  return pts;
}

function polygonFitError(samplePts, corners) {
  const n = corners.length;
  if (n < 3 || samplePts.length === 0) return { mean: Infinity, max: Infinity };
  let sum = 0, maxD = 0;
  for (const p of samplePts) {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = segDist(p, corners[i], corners[(i + 1) % n]);
      if (d < best) best = d;
    }
    sum += best;
    if (best > maxD) maxD = best;
  }
  for (const c of corners) {
    let bestC = Infinity;
    for (const p of samplePts) {
      const d = dist(c, p);
      if (d < bestC) bestC = d;
    }
    if (bestC > maxD) maxD = bestC;
  }
  return { mean: sum / samplePts.length, max: maxD };
}

function cornerTurnStatsDeg(corners) {
  const n = corners.length;
  let minTurn = 180, maxTurn = 0;
  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n], curr = corners[i], next = corners[(i + 1) % n];
    const l1 = dist(prev, curr), l2 = dist(curr, next);
    if (l1 < 14 || l2 < 14) return { min: 0, max: 180 };
    const ux = (curr.x - prev.x) / l1, uy = (curr.y - prev.y) / l1;
    const vx = (next.x - curr.x) / l2, vy = (next.y - curr.y) / l2;
    const dot = Math.max(-1, Math.min(1, ux * vx + uy * vy));
    const turnDeg = (Math.acos(dot) * 180) / Math.PI;
    if (turnDeg < minTurn) minTurn = turnDeg;
    if (turnDeg > maxTurn) maxTurn = turnDeg;
  }
  return { min: minTurn, max: maxTurn };
}

// ------------------------------------------------------------
// Specific Shape Detectors (only match intentional shapes)
// ------------------------------------------------------------
function detectSpiral(points, len, gap) {
  if (len < 200 || points.length < 22) return null;
  const bb = boundsOf(points);
  const diag = Math.hypot(bb.w, bb.h);
  if (diag < 50 || gap < diag * 0.22) return null;

  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  const c = { x: sx / points.length, y: sy / points.length };

  let totalAngle = 0, sameSignSteps = 0;
  let prevA = Math.atan2(points[0].y - c.y, points[0].x - c.x);
  const radii = [dist(points[0], c)];

  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i].y - c.y, points[i].x - c.x);
    let da = a - prevA;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    totalAngle += da;
    if (Math.abs(da) > 0.01 && ((totalAngle >= 0 && da > 0) || (totalAngle < 0 && da < 0))) {
      sameSignSteps++;
    }
    prevA = a;
    radii.push(dist(points[i], c));
  }

  const turns = Math.abs(totalAngle) / (Math.PI * 2);
  if (turns < 1.75 || sameSignSteps < points.length * 0.68) return null;

  const third = Math.max(3, Math.floor(radii.length / 3));
  let rStart = 0, rEnd = 0;
  for (let i = 0; i < third; i++) rStart += radii[i];
  for (let i = radii.length - third; i < radii.length; i++) rEnd += radii[i];
  rStart /= third; rEnd /= third;

  const maxR = Math.max(rStart, rEnd, Math.min(bb.w, bb.h) * 0.45);
  const minR = Math.min(rStart, rEnd);
  if (maxR < 26 || minR / maxR > 0.66) return null;

  const dir = totalAngle >= 0 ? 1 : -1;
  return {
    center: c,
    radius: maxR,
    turns: turns,
    dir: dir,
    spiralPts: makeSpiralPoints(c, maxR, Math.min(3.0, Math.max(1.8, turns)), dir, 44)
  };
}

function detectStar(poly) {
  if (!poly || poly.length < 9) return null;
  const area = polygonArea(poly);
  if (area < 1100) return null;
  const hull = hullOf(poly);
  const hullArea = polygonArea(hull);
  if (hullArea <= 0) return null;
  const solidity = area / hullArea;
  if (solidity > 0.60 || solidity < 0.25) return null;

  const c = centroid(hull);
  const corners = simplify(poly, 5);
  if (corners.length < 8 || corners.length > 14) return null;

  const dists = corners.map((p) => dist(p, c));
  let peaks = 0, valleys = 0, peakSum = 0, valleySum = 0;
  const n = dists.length;
  for (let i = 0; i < n; i++) {
    const prev = dists[(i - 1 + n) % n], curr = dists[i], next = dists[(i + 1) % n];
    if (curr > prev * 1.18 && curr > next * 1.18) { peaks++; peakSum += curr; }
    else if (curr < prev * 0.84 && curr < next * 0.84) { valleys++; valleySum += curr; }
  }
  if (peaks === 5 && valleys >= 4 && valleys <= 6) {
    const outerR = peakSum / peaks, innerR = valleySum / valleys;
    if (outerR > 26 && innerR / outerR < 0.65) {
      return {
        center: c,
        outerR: outerR,
        innerR: outerR * 0.42,
        spikes: 5,
        poly: makeStarPoints(c, outerR, outerR * 0.42, 5)
      };
    }
  }
  return null;
}

function detectCircle(points, len, gap) {
  if (len <= MIN_LOOP_LENGTH || gap >= len * 0.28) return null;
  let poly = simplifyCapped(points, SIMPLIFY_EPSILON, MAX_VERTS);
  poly = repairLoop(poly);
  if (!poly || poly.length < 6) return null;

  const area = polygonArea(poly);
  if (area < MIN_AREA) return null;
  const bb = boundsOf(poly);
  const diag = Math.hypot(bb.w, bb.h);
  if (diag < 32) return null;

  const c3 = reduceToKCorners(poly, 3);
  if (polygonFitError(poly, c3).mean < diag * 0.036 && cornerTurnStatsDeg(c3).min > 48) return null;
  const c4 = reduceToKCorners(poly, 4);
  if (polygonFitError(poly, c4).mean < diag * 0.034 && cornerTurnStatsDeg(c4).min > 62) return null;

  const perim = pathLength(poly) + dist(poly[0], poly[poly.length - 1]);
  const circularity = (4 * Math.PI * area) / (perim * perim);
  if (circularity < 0.78) return null;

  const c = centroid(poly);
  let rSum = 0;
  const radii = poly.map((p) => { const r = dist(p, c); rSum += r; return r; });
  const rMean = rSum / poly.length;
  if (rMean < 15) return null;

  let varSum = 0;
  for (const r of radii) varSum += (r - rMean) * (r - rMean);
  const rStd = Math.sqrt(varSum / poly.length) / rMean;
  const aspect = Math.max(bb.w, bb.h) / Math.max(1, Math.min(bb.w, bb.h));

  if (rStd <= 0.14 && aspect <= 1.24) {
    return { center: c, radius: rMean, poly: makeCirclePoints(c, rMean, 32) };
  }
  return null;
}

function detectPolygonShape(points, len, gap) {
  const bb = boundsOf(points);
  const diag = Math.hypot(bb.w, bb.h);
  if (len < MIN_LOOP_LENGTH || diag < 36) return null;
  if (gap > len * 0.28 && gap > diag * 0.32) return null;

  let poly = simplifyCapped(points, 3.0, 40);
  poly = repairLoop(poly);
  if (!poly || poly.length < 3) return null;

  const baseArea = polygonArea(poly);
  if (baseArea < MIN_AREA) return null;
  const hull = hullOf(poly);
  const hullArea = polygonArea(hull);
  if (hullArea <= 0 || baseArea / hullArea < 0.78) return null;

  const c3 = reduceToKCorners(hull.length >= 3 ? hull : poly, 3);
  if (c3.length === 3) {
    const fit3 = polygonFitError(poly, c3);
    const turns3 = cornerTurnStatsDeg(c3);
    if (fit3.mean < diag * 0.038 && fit3.max < diag * 0.095 && polygonArea(c3) / hullArea >= 0.84 && turns3.min >= 45 && turns3.max <= 148) {
      return { type: "triangle", label: "Triangle", behavior: "Solid Wedge", corners: c3, visualPts: subdividePolygon(c3, 6) };
    }
  }

  const c4 = reduceToKCorners(hull.length >= 4 ? hull : poly, 4);
  if (c4.length === 4) {
    const fit4 = polygonFitError(poly, c4);
    const turns4 = cornerTurnStatsDeg(c4);
    if (fit4.mean < diag * 0.036 && fit4.max < diag * 0.090 && polygonArea(c4) / hullArea >= 0.86 && turns4.min >= 58 && turns4.max <= 122) {
      const sides = [], angles = [];
      for (let i = 0; i < 4; i++) {
        const a = c4[i], b = c4[(i + 1) % 4];
        sides.push(dist(a, b));
        angles.push(Math.atan2(b.y - a.y, b.x - a.x));
      }
      const diff02 = Math.abs(sides[0] - sides[2]) / Math.max(1, Math.max(sides[0], sides[2]));
      const diff13 = Math.abs(sides[1] - sides[3]) / Math.max(1, Math.max(sides[1], sides[3]));
      if (diff02 <= 0.30 && diff13 <= 0.30) {
        const s02 = (sides[0] + sides[2]) * 0.5, s13 = (sides[1] + sides[3]) * 0.5;
        const aspect = Math.max(s02, s13) / Math.max(1, Math.min(s02, s13));
        const deg0 = Math.abs(((angles[0] * 180) / Math.PI) % 90);
        const tiltFromAxis = Math.min(deg0, 90 - deg0);
        const center = centroid(c4);

        if (tiltFromAxis >= 28 && aspect <= 1.30) {
          const rx = bb.w / 2, ry = bb.h / 2;
          const dc = [{ x: center.x, y: center.y - ry }, { x: center.x + rx, y: center.y }, { x: center.x, y: center.y + ry }, { x: center.x - rx, y: center.y }];
          return { type: "diamond", label: "Diamond", behavior: "Bouncy Gem", corners: dc, visualPts: subdividePolygon(dc, 6) };
        }
        if (turns4.min >= 65 && turns4.max <= 115 && tiltFromAxis <= 22) {
          if (aspect <= 1.26) {
            const half = (bb.w + bb.h) * 0.25;
            const sq = [{ x: center.x - half, y: center.y - half }, { x: center.x + half, y: center.y - half }, { x: center.x + half, y: center.y + half }, { x: center.x - half, y: center.y + half }];
            return { type: "square", label: "Square", behavior: "Balanced Block", corners: sq, visualPts: subdividePolygon(sq, 6) };
          } else {
            const hw = bb.w / 2, hh = bb.h / 2;
            const rc = [{ x: center.x - hw, y: center.y - hh }, { x: center.x + hw, y: center.y - hh }, { x: center.x + hw, y: center.y + hh }, { x: center.x - hw, y: center.y + hh }];
            return { type: "rectangle", label: "Rectangle", behavior: "Heavy Plank", corners: rc, visualPts: subdividePolygon(rc, 6) };
          }
        }
      }
    }
  }

  for (const k of [5, 6]) {
    if (hull.length >= k) {
      const ck = reduceToKCorners(hull, k);
      const fitK = polygonFitError(poly, ck);
      const turnsK = cornerTurnStatsDeg(ck);
      if (fitK.mean < diag * 0.028 && fitK.max < diag * 0.072 && polygonArea(ck) / hullArea >= 0.89 && turnsK.min >= 38 && turnsK.max <= 95) {
        return {
          type: k === 5 ? "pentagon" : "hexagon",
          label: k === 5 ? "Pentagon" : "Hexagon",
          behavior: k + "-Side Block",
          corners: ck,
          visualPts: subdividePolygon(ck, 5)
        };
      }
    }
  }
  return null;
}

function detectCup(points, len) {
  if (len < 130 || points.length < 12) return null;
  const bb = boundsOf(points);
  const diag = Math.hypot(bb.w, bb.h);
  if (bb.w < 48 || bb.h < 48) return null;

  const p0 = points[0], pEnd = points[points.length - 1];
  const topLimit = bb.minY + bb.h * 0.24;
  if (p0.y > topLimit || pEnd.y > topLimit || Math.abs(pEnd.x - p0.x) < bb.w * 0.65) return null;

  const topY = Math.min(p0.y, pEnd.y), inset = Math.min(bb.w * 0.08, 10);
  const cupCorners = [
    { x: bb.minX, y: topY },
    { x: bb.minX + inset, y: bb.maxY },
    { x: bb.maxX - inset, y: bb.maxY },
    { x: bb.maxX, y: topY }
  ];
  let errSum = 0;
  for (const p of points) {
    errSum += Math.min(
      segDist(p, cupCorners[0], cupCorners[1]),
      segDist(p, cupCorners[1], cupCorners[2]),
      segDist(p, cupCorners[2], cupCorners[3])
    );
  }
  if (errSum / points.length > diag * 0.040) return null;
  return { corners: cupCorners, visualPts: subdivideOpenLine(cupCorners, 6) };
}

function detectZigzag(points, len, gap) {
  if (len < 110 || gap > len * 0.78 || gap < len * 0.25) return null;
  const corners = simplify(points, 9);
  if (corners.length < 6 || corners.length > 18) return null;

  let altTurns = 0, prevSign = 0;
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1], b = corners[i], c = corners[i + 1];
    const seg1 = dist(a, b), seg2 = dist(b, c);
    if (seg1 < 16 || seg2 < 16) return null;
    const v1x = (b.x - a.x) / seg1, v1y = (b.y - a.y) / seg1;
    const v2x = (c.x - b.x) / seg2, v2y = (c.y - b.y) / seg2;
    const cross = v1x * v2y - v1y * v2x;
    const dot = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y));
    if (Math.acos(dot) >= 0.84 && Math.abs(cross) > 0.35) {
      const sign = cross > 0 ? 1 : -1;
      if (prevSign !== 0 && sign !== prevSign) altTurns++;
      else if (prevSign === 0) altTurns = 1;
      else return null;
      prevSign = sign;
    }
  }
  if (altTurns >= 4) {
    return { corners: corners, turns: altTurns, visualPts: subdivideOpenLine(corners, 5) };
  }
  return null;
}

function detectStraightLine(points, len) {
  if (points.length < 4) return null;
  const a = points[0], b = points[points.length - 1];
  const endSpan = dist(a, b);
  if (endSpan < 45 || len / endSpan > 1.032) return null;
  let maxDev = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxDev) maxDev = d;
  }
  if (maxDev > endSpan * 0.032) return null;
  return [a, b];
}

// ------------------------------------------------------------
// Master Shape Classifier (works for both Hand 1 and Hand 2)
// ------------------------------------------------------------
function classifyShape(points) {
  const len = pathLength(points);
  const gap = dist(points[0], points[points.length - 1]);

  const spiralData = detectSpiral(points, len, gap);
  if (spiralData) {
    return { type: "spiral", label: "Spiral", behavior: "Gravity Well", closed: false, snapPoints: spiralData.spiralPts, vertices: [spiralData.center], data: spiralData };
  }
  const zigzagData = detectZigzag(points, len, gap);
  if (zigzagData) {
    return { type: "zigzag", label: "Zigzag", behavior: "Bouncy Spring", closed: false, snapPoints: zigzagData.visualPts, vertices: zigzagData.corners, data: zigzagData };
  }
  const circleData = detectCircle(points, len, gap);
  if (circleData) {
    return { type: "circle", label: "Circle", behavior: "Roller Ball", closed: true, snapPoints: circleData.poly, vertices: [], data: circleData };
  }
  const polySnap = detectPolygonShape(points, len, gap);
  if (polySnap) {
    return { type: polySnap.type, label: polySnap.label, behavior: polySnap.behavior, closed: true, snapPoints: polySnap.visualPts, vertices: polySnap.corners, data: { poly: polySnap.corners } };
  }
  if (len > MIN_LOOP_LENGTH && gap < len * CLOSE_RATIO) {
    let poly = simplifyCapped(points, SIMPLIFY_EPSILON, MAX_VERTS);
    poly = repairLoop(poly);
    if (poly && poly.length >= 3 && polygonArea(poly) >= MIN_AREA) {
      const starData = detectStar(poly);
      if (starData) {
        return { type: "star", label: "Star", behavior: "Super Bumper", closed: true, snapPoints: subdividePolygon(starData.poly, 4), vertices: starData.poly, data: starData };
      }
      return { type: "blob", label: "Blob", behavior: "Solid Body", closed: true, snapPoints: null, vertices: [], data: { poly: poly } };
    }
  }
  const cupData = detectCup(points, len);
  if (cupData) {
    return { type: "cup", label: "Cup", behavior: "Catcher Bowl", closed: false, snapPoints: cupData.visualPts, vertices: cupData.corners, data: cupData };
  }
  const straightEnds = detectStraightLine(points, len);
  if (straightEnds) {
    return { type: "line", label: "Straight Line", behavior: linesFall ? "Falling Rod" : "Fixed Ramp", closed: false, snapPoints: subdivideOpenLine(straightEnds, 8), vertices: straightEnds, data: { line: straightEnds } };
  }
  const line = simplifyCapped(points, PLATFORM_EPSILON, MAX_SEGMENTS + 1);
  return { type: "line", label: "Line", behavior: linesFall ? "Falling Line" : "Fixed Ramp", closed: false, snapPoints: null, vertices: [], data: { line: line } };
}
