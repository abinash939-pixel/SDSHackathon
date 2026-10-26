// ------------------------------------------------------------
// Safe cross-file fallbacks so ui.js never crashes regardless
// of script load order or cached files
// ------------------------------------------------------------
if (typeof window.PREDICT_GAP_MS === "undefined") window.PREDICT_GAP_MS = 110;
if (typeof window.CIRCLE_CLOSE_RATIO === "undefined") window.CIRCLE_CLOSE_RATIO = 0.32;
if (typeof window.CIRCLE_MIN_METRIC === "undefined") window.CIRCLE_MIN_METRIC = 0.70;
if (typeof window.CIRCLE_MAX_RAD_ERR === "undefined") window.CIRCLE_MAX_RAD_ERR = 0.22;
if (typeof window.ZIGZAG_MIN_TURNS === "undefined") window.ZIGZAG_MIN_TURNS = 3;
if (typeof window.ZIGZAG_MIN_ANGLE === "undefined") window.ZIGZAG_MIN_ANGLE = 0.65;
if (typeof window.LABEL_SHOW_MS === "undefined") window.LABEL_SHOW_MS = 3200;
if (typeof window.showLabels === "undefined") window.showLabels = true;

function getShowLabels() {
  try {
    if (typeof showLabels !== "undefined") return showLabels;
  } catch (e) {
    // ignore
  }
  return window.showLabels !== false;
}

function setShowLabels(val) {
  window.showLabels = !!val;
  try {
    if (typeof showLabels !== "undefined") showLabels = !!val;
  } catch (e) {
    // ignore
  }
}

const drawingColorInput = document.getElementById("drawingColor");
if (drawingColorInput) {
  drawingColorInput.addEventListener("input", () => {
    drawingColor = drawingColorInput.value;
    saveSettings();
  });
}

if (typeof window.smoothCurve !== "function") {
  window.smoothCurve = function (points) {
    if (!points || points.length < 3) return points || [];
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
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
  };
}

if (typeof window.makeCirclePoints !== "function") {
  window.makeCirclePoints = function (center, radius, count = 32) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push({
        x: center.x + Math.cos(a) * radius,
        y: center.y + Math.sin(a) * radius
      });
    }
    return pts;
  };
}

function addBackgroundDecorations() {
  const layer = document.getElementById("backgroundDecorations");
  if (!layer) return;

  const colors = ["#ff777b", "#b99af5", "#62d5c1", "#f3c64e"];
  const shapes = ["circle", "square", "triangle"];
  for (let i = 0; i < 14; i++) {
    const shape = document.createElement("span");
    shape.className = "backgroundShape " + shapes[Math.floor(Math.random() * shapes.length)];
    shape.style.left = (Math.random() * 94) + "%";
    shape.style.top = (Math.random() * 92) + "%";
    shape.style.setProperty("--shape-size", (30 + Math.random() * 42) + "px");
    shape.style.setProperty("--shape-color", colors[Math.floor(Math.random() * colors.length)]);
    shape.style.setProperty("--shape-rotation", (Math.random() * 50 - 25) + "deg");
    layer.appendChild(shape);
  }
}
addBackgroundDecorations();

// ------------------------------------------------------------
// Populate SVG icons on the toolbar buttons
// ------------------------------------------------------------
function initToolbarIcons() {
  if (typeof ICONS === "undefined") return;
  document.querySelectorAll("[data-icon]").forEach((btn) => {
    const ic = ICONS[btn.dataset.icon];
    const svg = btn.querySelector("svg");
    if (!ic || !svg) return;
    svg.innerHTML = "";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ic.d);
    if (ic.dash) path.setAttribute("stroke-dasharray", ic.dash);
    svg.appendChild(path);
  });
}
initToolbarIcons();

const videoStage = document.getElementById("wrap");
const videoLayoutButtons = Array.from(document.querySelectorAll("[data-video-layout]"));
const videoFocusToggle = document.getElementById("videoFocusToggle");
let activeVideoLayout = "pip";
let focusedVideo = "local";

function updateVideoLayout() {
  if (!videoStage) return;
  videoStage.dataset.layout = activeVideoLayout;
  videoStage.dataset.focus = focusedVideo;
  for (const button of videoLayoutButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.videoLayout === activeVideoLayout));
  }
  if (videoFocusToggle) {
    videoFocusToggle.textContent = focusedVideo === "local" ? "Show partner" : "Show me";
    videoFocusToggle.setAttribute("aria-label", focusedVideo === "local"
      ? "Show partner video full screen"
      : "Show your video full screen");
  }
}

for (const button of videoLayoutButtons) {
  button.addEventListener("click", () => {
    activeVideoLayout = button.dataset.videoLayout;
    if (activeVideoLayout === "focus") focusedVideo = "local";
    updateVideoLayout();
  });
}

if (videoFocusToggle) {
  videoFocusToggle.addEventListener("click", () => {
    focusedVideo = focusedVideo === "local" ? "remote" : "local";
    updateVideoLayout();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeVideoLayout === "focus" && focusedVideo === "remote") {
    focusedVideo = "local";
    updateVideoLayout();
  }
});

updateVideoLayout();

// ------------------------------------------------------------
// Drawing on the overlay canvas
// ------------------------------------------------------------
function buildPath(points) {
  if (!points || points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const lastP = points[points.length - 1];
  ctx.lineTo(lastP.x, lastP.y);
}

function buildPolygonPath(points) {
  if (!points || points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

// Neon glow made from three layered strokes. Much cheaper than shadowBlur, so it stays smooth.
function neonStroke(glow, core, wide) {
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = wide + 12;
  ctx.strokeStyle = glow;
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = wide + 5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = wide;
  ctx.strokeStyle = core;
  ctx.stroke();
}

// New drawings pop in: they start slightly small and settle to full size.
// Also handles spring boing oscillation and impact squash-and-stretch.
var POP_MS = 260;
function popScaled(o, pts) {
  if (!pts || pts.length === 0) return [];
  const now = performance.now();
  const age = now - (o.born || 0);
  let sx = 1;
  let sy = 1;

  if (age >= 0 && age < POP_MS) {
    const t = age / POP_MS;
    const sc = 0.55 + 0.45 * (1 - Math.pow(1 - t, 3)) + 0.08 * Math.sin(t * Math.PI);
    sx *= sc;
    sy *= sc;
  }

  // Spring boing oscillation when a Zigzag Spring is triggered
  if (o.kind === "spring" && o.boingUntil && now < o.boingUntil) {
    const rem = (o.boingUntil - now) / 480;
    const wave = Math.sin(now * 0.045) * 0.28 * rem;
    sx *= (1 - wave * 0.6);
    sy *= (1 + wave);
  }

  // Impact squash and stretch
  if (o.impactAt && now - o.impactAt < 220) {
    const k = 1 - (now - o.impactAt) / 220;
    const w = Math.sin((1 - k) * Math.PI * 2) * (o.impactStrength || 0.12) * k;
    sx *= (1 + w);
    sy *= (1 - w);
  }

  if (sx === 1 && sy === 1) return pts;

  let cx;
  let cy;
  if (o.body) {
    cx = o.body.position.x;
    cy = o.body.position.y;
  } else {
    const bb = boundsOf(pts);
    cx = (bb.minX + bb.maxX) / 2;
    cy = (bb.minY + bb.maxY) / 2;
  }
  return pts.map((p) => ({
    x: cx + (p.x - cx) * sx,
    y: cy + (p.y - cy) * sy
  }));
}

// Floating badge above identified objects (or any object when hovered/selected/grabbed)
function drawObjectLabel(o, pts) {
  if (!getShowLabels() || !o || !o.shapeType || !pts || pts.length === 0) return;
  const now = performance.now();
  const age = now - (o.born || 0);
  const selSet = typeof selected !== "undefined" ? selected : null;
  const isHot = (selSet && selSet.has(o)) || hoverObj === o || (grabbed && grabbed.obj === o) ||
    (typeof h2 !== "undefined" && (h2.hoverObj === o || (h2.grab && h2.grab.obj === o)));

  // For generic freeform Blobs and Lines, only show the label when hovered, selected, or held
  const isGeneric = o.shapeType === "Blob" || o.shapeType === "Line";
  if (isGeneric && !isHot) return;

  const maxAge = window.LABEL_SHOW_MS || 3200;
  if (!isHot && age > maxAge) return;

  let alpha = 1;
  if (!isHot && age > maxAge - 600) {
    alpha = Math.max(0, (maxAge - age) / 600);
  }

  const bb = boundsOf(pts);
  const cx = (bb.minX + bb.maxX) / 2;
  const topY = Math.max(24, bb.minY - 14);
  const text = o.shapeType + " - " + (o.behaviorText || "Object");

  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.font = "bold 11px Arial";
  const padX = 8;
  const h = 20;
  const w = Math.round(ctx.measureText(text).width + padX * 2);
  const x = Math.round(cx - w / 2);
  const y = Math.round(topY - h / 2);

  roundRectPath(x, y, w, h, 10);
  ctx.fillStyle = "rgba(10, 14, 22, 0.85)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = o.color || "hsl(" + (o.hue || 190) + ", 100%, 65%)";
  ctx.stroke();

  ctx.fillStyle = "#e8f4ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + 0.5);
  ctx.restore();
}

const livePreviewCaches = new Map();

// Live dotted-line shape preview while drawing a stroke.
// ONLY appears when `info.snapPoints` is non-null (a specific shape was matched).
function drawLiveShapePreview(rawStroke, channel = "primary") {
  try {
    if (!rawStroke || typeof smoothStroke !== "function" || typeof pathLength !== "function") return;
    const minPts = typeof MIN_STROKE_POINTS !== "undefined" ? MIN_STROKE_POINTS : 6;
    const minLen = typeof MIN_STROKE_LENGTH !== "undefined" ? MIN_STROKE_LENGTH : 40;
    if (rawStroke.length < minPts) return;

    if (typeof classifyShape !== "function") return;
    const now = performance.now();
    let cache = livePreviewCaches.get(channel);
    const firstPoint = rawStroke[0];
    if (!cache || cache.firstPoint !== firstPoint || rawStroke.length < cache.len ||
        now - cache.time >= 150 || Math.abs(rawStroke.length - cache.len) > 5) {
      const smoothed = smoothStroke(rawStroke, 2);
      const info = pathLength(smoothed) < minLen ? null : classifyShape(smoothed);
      cache = { time: now, info, len: rawStroke.length, firstPoint };
      livePreviewCaches.set(channel, cache);
    }
    const info = cache.info;
    // Do NOT show any dotted preview if this is a normal freeform line or blob (snapPoints === null)
    if (!info || !info.snapPoints || info.snapPoints.length < 2) return;

    const snap = info.snapPoints;
    const closed = !!info.closed;
    const vertices = info.vertices || [];

    const color = drawingColor;

    ctx.save();

    // Animated marching-ants dotted line showing the exact shape it will snap into
    ctx.beginPath();
    ctx.moveTo(snap[0].x, snap[0].y);
    for (let i = 1; i < snap.length; i++) {
      ctx.lineTo(snap[i].x, snap[i].y);
    }
    if (closed) ctx.closePath();

    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(performance.now() / 28) % 12;
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw small corner dots on snapped geometric vertices (Triangle, Square, Star, Cup, Zigzag, etc.)
    if (vertices.length > 0 && vertices.length <= 16) {
      ctx.fillStyle = "#ffffff";
      for (const v of vertices) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw floating badge above the stroke showing what object it is going to make
    const bb = boundsOf(snap);
    const cx = (bb.minX + bb.maxX) / 2;
    const topY = Math.max(28, bb.minY - 18);
    const badgeText = "Matching: " + (info.label || "Shape") + " (" + (info.behavior || "Object") + ")";

    ctx.font = "bold 12px Arial";
    const padX = 10;
    const h = 22;
    const w = Math.round(ctx.measureText(badgeText).width + padX * 2);
    const x = Math.round(Math.max(8, Math.min(canvas.width - w - 8, cx - w / 2)));
    const y = Math.round(topY - h / 2);

    roundRectPath(x, y, w, h, 11);
    ctx.fillStyle = "rgba(10, 14, 22, 0.9)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  } catch (err) {
    ctx.restore();
  }
}

function getWorldPointsSafe(o) {
  if (typeof worldPoints === "function") return worldPoints(o);
  if (!o || !o.body || !o.local) return (o && o.raw) ? o.raw : [];
  const b = o.body;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return o.local.map((p) => ({
    x: b.position.x + p.x * c - p.y * s,
    y: b.position.y + p.x * s + p.y * c
  }));
}

function drawObject(o) {
  if (!o) return;
  // Alchemist's Scale is an individual weight challenge within the shared match.
  if (window.GameEngine && window.GameEngine.isGameRunning("alchemist-scale") &&
      window.sharedSpace && o.ownerId && o.ownerId !== window.sharedSpace.localOwnerId) return;
  const held = (grabbed && grabbed.obj === o) || (typeof h2 !== "undefined" && h2.grab && h2.grab.obj === o);
  const cand = (grabCandidate && grabCandidate.obj === o) || (typeof h2 !== "undefined" && h2.grabCandidate && h2.grabCandidate.obj === o);
  const glow = held ? "#ffffff" : (o.color || "hsl(" + o.hue + ", 100%, 60%)");
  const core = o.color ? (held ? "#ffffff" : o.color) : "hsl(" + o.hue + ", 100%, " + (held ? 92 : 78) + "%)";
  const wide = held ? 6 : (cand ? 5.5 : 4.5);
  let pts;

  if (o.isMerged && o.subParts && o.body) {
    const body = o.body;
    const c = Math.cos(body.angle), s = Math.sin(body.angle);
    for (const part of o.subParts) {
      const partPts = part.local.map((p) => ({
        x: body.position.x + p.x * c - p.y * s,
        y: body.position.y + p.x * s + p.y * c
      }));
      const scaledPart = popScaled(o, partPts);
      if (scaledPart.length < 2) continue;
      if (part.kind === "solid") {
        buildPolygonPath(scaledPart);
      } else {
        buildPath(scaledPart);
      }
      if (part.kind === "solid" || scaledPart.length > 2) {
        ctx.closePath();
        ctx.fillStyle = "hsla(" + (part.hue || o.hue) + ", 100%, 60%, 0.24)";
        ctx.fill();
      }
      neonStroke(held ? "#ffffff" : "hsl(" + (part.hue || o.hue) + ", 100%, 60%)", core, wide);
    }
    drawObjectLabel(o, popScaled(o, getWorldPointsSafe(o)));
    return;
  }

  if (o.kind === "solid") {
    pts = popScaled(o, getWorldPointsSafe(o));
    if (pts.length < 3) return;
    buildPolygonPath(pts);
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = o.color || "hsl(" + o.hue + ", 100%, 60%)";
    ctx.fill();
    ctx.restore();
    neonStroke(glow, core, wide);
  } else {
    const rawPts = o.kind === "platform" ? o.raw : getWorldPointsSafe(o);
    pts = popScaled(o, rawPts);
    if (!pts || pts.length < 2) return;
    buildPath(pts);
    neonStroke(glow, core, wide);

    // Subtle pulsing pull-ring around Spiral Gravity Wells
    if (o.kind === "spiral" && o.body) {
      const pulseR = (o.wellRadius || 38) * (1.1 + 0.25 * Math.sin(performance.now() / 240));
      ctx.save();
      ctx.beginPath();
      ctx.arc(o.body.position.x, o.body.position.y, pulseR, 0, Math.PI * 2);
      ctx.setLineDash([5, 7]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = o.color || "#c56bff";
      ctx.stroke();
      ctx.restore();
    }
  }
  drawObjectLabel(o, pts);
}

// Dashed green outline around selected objects.
function drawSelection(o) {
  if (o.isMerged && o.subParts && o.body) {
    const body = o.body;
    const c = Math.cos(body.angle), s = Math.sin(body.angle);
    ctx.save();
    ctx.setLineDash([12, 9]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7dffb0";
    for (const part of o.subParts) {
      const pts = part.local.map((p) => ({
        x: body.position.x + p.x * c - p.y * s,
        y: body.position.y + p.x * s + p.y * c
      }));
      if (pts.length < 2) continue;
      buildPath(pts);
      if (part.kind === "solid" || pts.length > 2) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const pts = o.kind === "platform" ? o.raw : getWorldPointsSafe(o);
  if (!pts || pts.length < 2) return;
  buildPath(pts);
  if (o.kind === "solid") ctx.closePath();
  ctx.setLineDash([12, 9]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#7dffb0";
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHitbox(b) {
  if (!b || !b.parts) return;
  const start = b.parts.length > 1 ? 1 : 0;
  for (let k = start; k < b.parts.length; k++) {
    const v = b.parts[k].vertices;
    if (!v || v.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) {
      ctx.lineTo(v[i].x, v[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawShockwaves() {
  if (typeof shockwaves === "undefined" || shockwaves.length === 0) return;
  ctx.save();
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const wave = shockwaves[i];
    wave.r += wave.speed;
    wave.alpha = Math.max(0, 1 - wave.r / wave.maxR);
    if (wave.alpha <= 0) {
      shockwaves.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, 8 * wave.alpha);
    ctx.strokeStyle = "hsla(" + wave.hue + ", 100%, 75%, " + wave.alpha + ")";
    ctx.shadowColor = "hsl(" + wave.hue + ", 100%, 70%)";
    ctx.shadowBlur = 20;
    ctx.stroke();
  }
  ctx.restore();
}

function drawInteractionVisuals(nowMs) {
  if (scaleSession && scaleSession.target && pen && h2.pen) {
    const first = penVis || pen;
    const second = h2.vis || h2.pen;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(second.x, second.y);
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(nowMs / 20) % 12;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#38e8ff";
    ctx.shadowColor = "#38e8ff";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
    drawChip("Scale: " + Math.round((scaleSession.target.scaleMultiplier || 1) * 100) + "%",
      Math.round((first.x + second.x) / 2), Math.round((first.y + second.y) / 2 - 24), "#38e8ff", 1);
  }

  if (mergeCandidate && mergeProgress > 0) {
    const bodyA = mergeCandidate.objA.body || mergeCandidate.objA.bodies[0];
    const bodyB = mergeCandidate.objB.body || mergeCandidate.objB.bodies[0];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bodyA.position.x, bodyA.position.y);
    ctx.lineTo(bodyB.position.x, bodyB.position.y);
    ctx.lineWidth = 3 + mergeProgress * 4;
    ctx.strokeStyle = "rgba(215, 120, 255, " + (0.4 + mergeProgress * 0.6) + ")";
    ctx.shadowColor = "#e077ff";
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
    drawChip("Merging", Math.round(mergeCandidate.midX), Math.round(mergeCandidate.midY - 28), "#e077ff", mergeProgress);
  }

  if (demergeCandidate && demergeProgress > 0.08 && pen && h2.pen) {
    const first = penVis || pen;
    const second = h2.vis || h2.pen;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(second.x, second.y);
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 3 + demergeProgress * 5;
    ctx.strokeStyle = demergeProgress > 0.65 ? "#ff4757" : "#ffa502";
    ctx.stroke();
    ctx.restore();
    drawChip("Splitting", Math.round((first.x + second.x) / 2), Math.round((first.y + second.y) / 2 - 28), "#ffa502", demergeProgress);
  }
}

// A small rounded label, in the same style as the button tooltips.
// fillFrac (0 to 1) fills the label from the left like a progress bar.
function drawChip(text, cx, y, accent, fillFrac) {
  ctx.save();
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const padX = 12;
  const h = 24;
  const w = Math.round(ctx.measureText(text).width + padX * 2);
  const x = Math.round(cx - w / 2);

  roundRectPath(x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(10,12,18,0.82)";
  ctx.fill();

  if (fillFrac !== undefined && fillFrac > 0) {
    ctx.save();
    roundRectPath(x, y, w, h, h / 2);
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w * fillFrac, h);
    ctx.restore();
  }

  roundRectPath(x, y, w, h, h / 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.restore();
}

function drawPoseUI(nowMs) {
  const cx = Math.round(canvas.width / 2);
  if (pausedWorld) {
    drawChip("Paused", cx, 12, "#ffb347");
  }
  if (toast && nowMs < toast.until) {
    drawChip(toast.text, cx, 44, "#7dffb0");
  } else if (swipeProgress > 0.15) {
    drawChip("Swipe", cx, 44, "#38e8ff", swipeProgress);
  } else if (candPose && !candFired && typeof POSE_HOLD_MS !== "undefined") {
    const f = Math.min(1, (nowMs - candStartMs) / POSE_HOLD_MS[candPose]);
    const label = typeof poseLabel === "function" ? poseLabel(candPose) : candPose;
    drawChip(label, cx, 44, "#38e8ff", f);
  } else if (typeof h2 !== "undefined" && h2.candPose && !h2.candFired) {
    const hold = POSE_HOLD_MS[h2.candPose] || 500;
    const f = Math.min(1, (nowMs - h2.candStartMs) / hold);
    const label = typeof poseLabel === "function" ? poseLabel(h2.candPose) : h2.candPose;
    drawChip(label, cx, 44, "#5dff9a", f);
  }
}

function drawTrackedSkeleton(points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    if (!points[a] || !points[b]) continue;
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  for (const point of points) {
    ctx.moveTo(point.x + 3, point.y);
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  }
  ctx.fill();
}

function render() {
  const nowR = performance.now();

  // Ease the on-screen pen toward the tracked pen so the cursor and trail move smoothly at full frame rate.
  if (pen) {
    if (!penVis) {
      penVis = { x: pen.x, y: pen.y };
    } else {
      const f = 1 - Math.exp(-(nowR - lastRenderMs) / 16);
      penVis.x += (pen.x - penVis.x) * f;
      penVis.y += (pen.y - penVis.y) * f;
    }
  } else {
    penVis = null;
  }
  if (typeof h2 !== "undefined" && h2.pen) {
    if (!h2.vis) h2.vis = { x: h2.pen.x, y: h2.pen.y };
    else {
      const f = 1 - Math.exp(-(nowR - lastRenderMs) / 16);
      h2.vis.x += (h2.pen.x - h2.vis.x) * f;
      h2.vis.y += (h2.pen.y - h2.vis.y) * f;
    }
  } else if (typeof h2 !== "undefined") {
    h2.vis = null;
  }
  lastRenderMs = nowR;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // finished physics objects
  if (typeof objects !== "undefined") {
    for (const o of objects) {
      drawObject(o);
    }
  }
  if (window.GameEngine) window.GameEngine.render(ctx);

  // links between objects
  if (typeof links !== "undefined" && links.length > 0) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd36b";
    for (const k of links) {
      if (!k || !k.c || !k.c.bodyA || !k.c.bodyB) continue;
      const A = k.c.bodyA.position;
      const B = k.c.bodyB.position;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // selection outlines
  if (typeof selected !== "undefined" && typeof objects !== "undefined") {
    for (const o of Array.from(selected)) {
      if (!objects.includes(o)) {
        selected.delete(o);
        continue;
      }
      drawSelection(o);
    }
  }

  // grab highlight: a glowing outline on whatever each hand is holding
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 160);
  const glow = (o, color) => {
    if (!o || typeof objects === "undefined" || !objects.includes(o)) return;
    const pts = o.kind === "platform" ? o.raw : getWorldPointsSafe(o);
    if (!pts || pts.length < 2) return;
    ctx.save();
    buildPath(pts);
    if (o.kind === "solid") ctx.closePath();
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();
  };
  try {
    if (grabbed) glow(grabbed.obj, "#38e8ff");
    if (typeof h2 !== "undefined" && h2.grab) glow(h2.grab.obj, "#5dff9a");
  } catch (err) {
    ctx.restore();
    console.error("glow error:", err);
  }

  if (typeof h2 !== "undefined" && secondaryHandPresent && h2.pen && nowR - h2.seen <= 120) {
    const secondPointer = h2.vis || h2.pen;
    ctx.beginPath();
    ctx.arc(secondPointer.x, secondPointer.y, h2.pinching ? 10 : 14, 0, 6.283);
    ctx.lineWidth = 3;
    ctx.strokeStyle = h2.grab ? "#5dff9a" : (h2.pinching ? "#ffb347" : "#ffffff");
    ctx.stroke();
    if (h2.grabCandidate) {
      const progress = Math.min(1, (nowR - h2.grabCandidate.startMs) / GRAB_HOLD_MS);
      ctx.beginPath();
      ctx.arc(secondPointer.x, secondPointer.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = "#ffb020";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  // sparks
  if (typeof particles !== "undefined" && particles.length > 0) {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      if (p.hue !== undefined) {
        ctx.strokeStyle = p.color || "hsl(" + p.hue + ", 100%, 70%)";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = "#bff6ff";
        ctx.lineWidth = 2;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawShockwaves();
  drawInteractionVisuals(nowR);

  // strokes being drawn right now (hand and mouse), smoothed for display + live dotted preview
  if (current && typeof smoothStroke === "function") {
    const rawWithTip = current.slice();
    if (pinching && penVis && rawWithTip.length > 0 && dist(rawWithTip[rawWithTip.length - 1], penVis) > 0.5) {
      rawWithTip.push({ x: penVis.x, y: penVis.y });
    }
    const live = window.smoothCurve(smoothStroke(rawWithTip, 2));
    if (live.length >= 2) {
      buildPath(live);
      neonStroke(drawingColor, drawingColor, 4.5);
      drawLiveShapePreview(rawWithTip);
    }
  }
  if (typeof h2 !== "undefined" && h2.current && typeof smoothStroke === "function") {
    const rawWithTip2 = h2.current.slice();
    const pen2 = h2.vis || h2.pen;
    if (h2.pinching && pen2 && rawWithTip2.length > 0 && dist(rawWithTip2[rawWithTip2.length - 1], pen2) > 0.5) {
      rawWithTip2.push({ x: pen2.x, y: pen2.y });
    }
    const live2 = window.smoothCurve(smoothStroke(rawWithTip2, 2));
    if (live2.length >= 2) {
      buildPath(live2);
      neonStroke("#5dff9a", "#caffd8", 4.5);
      drawLiveShapePreview(rawWithTip2, "secondary");
    }
  }
  if (mouseCurrent && mouseCurrent.length >= 2 && typeof smoothStroke === "function") {
    buildPath(window.smoothCurve(smoothStroke(mouseCurrent, 2)));
    neonStroke(drawingColor, drawingColor, 4.5);
    drawLiveShapePreview(mouseCurrent, "mouse");
  }

  // hitboxes (debug): shows the real physics shapes
  if (showHitboxes && typeof objects !== "undefined") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    for (const o of objects) {
      for (const b of o.bodies) {
        drawHitbox(b);
      }
    }
    if (typeof walls !== "undefined") {
      ctx.strokeStyle = "rgba(255,200,0,0.7)";
      for (const w of walls) {
        drawHitbox(w);
      }
    }
  }

  // thin dotted line from your real fingers to the stretched pen ring
  if (showSkeleton && primaryHandPresent && nowR - lastSeenMs <= 120 && realPen && penVis && typeof REACH_LEVELS !== "undefined" && REACH_LEVELS[reachIdx] !== 1) {
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(realPen.x, realPen.y);
    ctx.lineTo(penVis.x, penVis.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Batch each hand's bones and joints into one stroke and one fill.
  if (showSkeleton && primaryHandPresent && skeletonPts && nowR - lastSeenMs <= 120 && typeof HAND_CONNECTIONS !== "undefined") {
    drawTrackedSkeleton(skeletonPts, "rgba(120,255,160,0.8)");
  }
  if (showSkeleton && typeof h2 !== "undefined" && secondaryHandPresent && h2.skeletonPts && nowR - h2.seen <= 120 && typeof HAND_CONNECTIONS !== "undefined") {
    drawTrackedSkeleton(h2.skeletonPts, "rgba(80,220,255,0.8)");
  }

  // gesture bar buttons
  drawPoseUI(nowR);

  // pen cursor (turns amber while holding an object)
  const pv = penVis || pen;
  if (pv && primaryHandPresent && nowR - lastSeenMs <= 120) {
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, grabbed ? 14 : (pinching ? 10 : 7), 0, Math.PI * 2);
    ctx.strokeStyle = grabbed ? "#ffb020" : (pinching ? "#38e8ff" : "#ffffff");
    ctx.lineWidth = 3;
    ctx.stroke();
    if (grabCandidate) {
      const f = Math.min(1, (nowR - grabCandidate.startMs) / GRAB_HOLD_MS);
      ctx.beginPath();
      ctx.arc(pv.x, pv.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      ctx.strokeStyle = "#ffb020";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    if (hoverObj) {
      const f = Math.min(1, (nowR - hoverStartMs) / SELECT_HOLD_MS);
      ctx.beginPath();
      ctx.arc(pv.x, pv.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      ctx.strokeStyle = "#7dffb0";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }
}

function updateStatus() {
  const nowS = performance.now();
  if (nowS - lastStatusMs < 200) return;
  lastStatusMs = nowS;
  const handCount = (primaryHandPresent && handVisible && nowS - lastSeenMs <= 120 ? 1 : 0) +
    ((typeof h2 !== "undefined" && secondaryHandPresent && h2.visible && nowS - h2.seen <= 120) ? 1 : 0);
  const handText = handCount === 2 ? "2 Hands tracked" : (handCount === 1 ? "1 Hand tracked" : "No hand");
  const actions = [];
  if (grabbed && grabbed.obj) actions.push("H1 holding " + (grabbed.obj.shapeType || "object"));
  else if (pinching) actions.push("H1 drawing");
  if (typeof h2 !== "undefined" && h2.grab && h2.grab.obj) actions.push("H2 holding " + (h2.grab.obj.shapeType || "object"));
  else if (typeof h2 !== "undefined" && h2.pinching) actions.push("H2 drawing");
  let mode = actions.length ? actions.join(" & ") : (tabHold || h1ToolbarTouch || h2ToolbarTouch ? "Button panel" : "Ready");
  if (pausedWorld) mode += " (paused)";
  const objCount = typeof objects !== "undefined" ? objects.length : 0;
  if (statusEl) {
    statusEl.textContent =
      handText +
      "   |   " + mode +
      "   |   " + objCount + " objects" +
      "   |   " + fps + " fps" +
      "   |   Last: " + lastInfo;
    // full details appear when the mouse rests on the status line
    const isConcave = typeof concaveSupport !== "undefined" ? concaveSupport : !!window.decomp;
    statusEl.title =
      "Tracking " + trackMs.toFixed(1) + " ms per frame" +
      "  |  Pinch ratio " + lastRatio.toFixed(2) +
      "  |  Pose " + (candPose || "none") +
      "  |  Gravity " + (gravityOn ? "on" : "off") +
      "  |  Reach " + REACH_LEVELS[reachIdx] + "x" +
      "  |  Concave shapes: " + (isConcave ? "supported" : "NOT loaded (using hulls)") +
      "  |  Deleted false strokes: " + cancelled +
      "  |  Last stroke: " + lastInfo;
  }
}

// ------------------------------------------------------------
// Buttons
// ------------------------------------------------------------
// The same actions are used by the page buttons, the mouse, and the hand.
function clearAll() {
  if (typeof clearObjects === "function") clearObjects();
  if (typeof clearMoves === "function") clearMoves();
  current = null;
  if (typeof h2 !== "undefined") {
    h2.current = null;
    h2.grabCandidate = null;
    h2.pending = [];
    h2.pinching = false;
    h2.pinch = false;
  }
  h1ToolbarTouch = null;
  h2ToolbarTouch = null;
  mouseToolbarTouch = null;
  mouseCurrent = null;
  pinching = false;
  cancelled = 0;
  lastInfo = "none yet";
  if (typeof showToast === "function") showToast("Cleared your shapes");
}

function toggleGravity() {
  if (window.GameEngine && window.GameEngine.isGameRunning()) return;
  setGravityEnabled(!gravityOn);
}

function setGravityEnabled(enabled, broadcast = true) {
  gravityOn = enabled;
  if (typeof engine !== "undefined" && engine.gravity) {
    engine.gravity.y = gravityOn ? 1 : 0;
    // Gravity changes do not automatically wake bodies resting in midair.
    for (const body of Matter.Composite.allBodies(engine.world)) {
      if (!body.isStatic) Matter.Sleeping.set(body, false);
    }
  }
  syncButtons();
  if (broadcast && typeof window.broadcastWorldState === "function") {
    window.broadcastWorldState();
  }
}

function setPausedWorld(paused, broadcast = true) {
  pausedWorld = paused;
  syncButtons();
  if (broadcast && typeof window.broadcastWorldState === "function") {
    window.broadcastWorldState();
  }
}

function toggleLines() {
  setLinesFall(!linesFall);
}

function setLinesFall(enabled, broadcast = true) {
  linesFall = enabled;
  syncButtons();
  if (broadcast && typeof window.broadcastWorldState === "function") {
    window.broadcastWorldState();
  }
}

function setPushFrozen(enabled, broadcast = true) {
  pushFrozen = enabled;
  const button = document.getElementById("pushFrozenBtn");
  if (button) button.textContent = "Push frozen: " + (pushFrozen ? "on" : "off");
  if (broadcast && typeof window.broadcastWorldState === "function") {
    window.broadcastWorldState();
  }
}

function toggleHitboxes() {
  showHitboxes = !showHitboxes;
  syncButtons();
}

function toggleSkeleton() {
  showSkeleton = !showSkeleton;
  syncButtons();
}

function toggleBar() {
  showBar = false;
  dwellTarget = null;
  syncButtons();
}

// Updates the icon buttons under the video: highlight, count badge, and the hover tooltip text.
function setBtn(btn, tip, on, badge) {
  if (!btn) return;
  btn.setAttribute("data-tip", tip);
  btn.setAttribute("aria-label", tip.split("\n")[0]);
  btn.classList.toggle("on", !!on);
  const bd = btn.querySelector(".badge");
  if (bd) {
    bd.textContent = badge ? String(badge) : "";
    bd.style.display = badge ? "block" : "none";
  }
}

function syncButtons() {
  const selSet = typeof selected !== "undefined" ? selected : new Set();
  const n = selSet.size;
  setBtn(
    gravityBtn,
    "Gravity: " + (gravityOn ? "ON" : "OFF") + "\n" + (gravityOn ? "Drawings fall. Click to turn off." : "Drawings float. Click to turn on."),
    gravityOn
  );
  setBtn(
    linesBtn,
    "Open lines: " + (linesFall ? "FALL" : "FIXED") + "\n" + (linesFall ? "Open lines, cups, and springs drop like objects. Click to make them fixed." : "Open lines, cups, and springs stay fixed in the air. Click to let them fall."),
    linesFall
  );
  setBtn(
    reverseBtn,
    n > 0
      ? "Reverse selected (" + n + ")\nSends them back to where you drew them and freezes them until deselected."
      : "Reverse last moved\nSends the last object you moved back to where you drew it.",
    false,
    n
  );
  setBtn(deselectBtn, "Deselect all\nUnselects everything. Frozen objects fall again.", false, n);
  setBtn(
    floatBtn,
    "Float selected\nSelected objects drift up. Press again to let them fall. Thumbs up and thumbs down do the same.",
    Array.from(selSet).some((o) => o && o.floating),
    n
  );
  setBtn(cloneBtn, "Clone selected\nMakes a copy of each selected object.", false, n);
  setBtn(destroyBtn, "Destroy selected\nShatters the selected objects.", false, n);
  setBtn(clearBtn, "Clear your shapes\nDeletes every shape you created.", false);
  setBtn(
    hitboxBtn,
    "Hitboxes: " + (showHitboxes ? "ON" : "OFF") + "\nShows the real physics shapes, to check collisions.",
    showHitboxes
  );
  setBtn(
    skeletonBtn,
    "Hand skeleton: " + (showSkeleton ? "ON" : "OFF") + "\nShows the green hand tracking lines.",
    showSkeleton
  );
  setBtn(
    barBtn,
    "Button panel: " + (showBar ? "OPEN" : "HIDDEN") + "\nThe icon panel on the video. You can also open it with the arrow tab.",
    showBar
  );
  setBtn(
    dockBtn,
    "Panel side: " + (dockRight ? "RIGHT" : "LEFT") + "\nMoves the button panel to the " + (dockRight ? "left" : "right") + " edge.",
    false
  );
  setBtn(
    reachBtn,
    "Reach: " + REACH_LEVELS[reachIdx] + "x\nHow far your hand movement is stretched. Click to change.",
    false,
    REACH_LEVELS[reachIdx] + "x"
  );
  setBtn(
    helpBtn,
    "How to use\nShow or hide the short instructions.",
    helpPanel && helpPanel.classList.contains("open")
  );
}

if (clearBtn) clearBtn.addEventListener("click", () => clearAll());
if (gravityBtn) gravityBtn.addEventListener("click", () => toggleGravity());
if (linesBtn) linesBtn.addEventListener("click", () => toggleLines());
if (hitboxBtn) hitboxBtn.addEventListener("click", () => toggleHitboxes());
if (skeletonBtn) skeletonBtn.addEventListener("click", () => toggleSkeleton());
if (barBtn) barBtn.addEventListener("click", () => toggleBar());
if (reverseBtn) {
  reverseBtn.addEventListener("click", () => {
    if (typeof reverseMove === "function") reverseMove();
  });
}
if (deselectBtn) {
  deselectBtn.addEventListener("click", () => {
    if (typeof clearSelection === "function") clearSelection();
  });
}
if (floatBtn) {
  floatBtn.addEventListener("click", () => {
    if (typeof floatSelected === "function") floatSelected("toggle");
  });
}
if (cloneBtn) {
  cloneBtn.addEventListener("click", () => {
    if (typeof cloneSelected === "function") cloneSelected();
  });
}
if (destroyBtn) {
  destroyBtn.addEventListener("click", () => {
    if (typeof destroySelected === "function") destroySelected();
  });
}
if (dockBtn) dockBtn.addEventListener("click", () => toggleDock());
if (helpBtn) {
  helpBtn.addEventListener("click", () => {
    if (helpPanel) helpPanel.classList.toggle("open");
    syncButtons();
  });
}
if (reachBtn) {
  reachBtn.addEventListener("click", () => {
    reachIdx = (reachIdx + 1) % REACH_LEVELS.length;
    syncButtons();
  });
}
window.airGestureEnabled = false;
window.setAirGestureEnabled = function (enabled) {
  window.airGestureEnabled = !!enabled;
  if (!window.airGestureEnabled && typeof window.resetAirGesture === "function") {
    window.resetAirGesture();
  }
  const button = document.getElementById("airGestureBtn");
  if (button) {
    button.setAttribute("aria-pressed", String(window.airGestureEnabled));
    button.setAttribute("aria-label", "Air Gesture: " + (window.airGestureEnabled ? "ON" : "OFF"));
    button.classList.toggle("on", window.airGestureEnabled);
  }
};
const airGestureToggle = document.getElementById("airGestureBtn");
if (airGestureToggle) {
  airGestureToggle.addEventListener("click", () => {
    window.setAirGestureEnabled(!window.airGestureEnabled);
  });
}

// ------------------------------------------------------------
// Gesture dock: a slim panel on the screen edge. Hold the pen ring over a
// button to press it (dwell selection). The press zone reaches the screen edge.
// ------------------------------------------------------------
var gButtons = [
  {
    icon: "gravity",
    isOn: () => gravityOn,
    action: () => toggleGravity(),
    dwell: DWELL_MS,
    tip: () => [
      "Gravity: " + (gravityOn ? "ON" : "OFF"),
      gravityOn ? "Drawings fall. Hold to turn off." : "Drawings float. Hold to turn on."
    ]
  },
  {
    icon: "lines",
    isOn: () => linesFall,
    action: () => toggleLines(),
    dwell: DWELL_MS,
    tip: () => [
      "Open lines: " + (linesFall ? "FALL" : "FIXED"),
      "Falling lines drop like objects. Fixed lines stay as ramps."
    ]
  },
  {
    icon: "reverse",
    isOn: null,
    action: () => { if (typeof reverseMove === "function") reverseMove(); },
    dwell: DWELL_MS,
    badge: () => (typeof selected !== "undefined" ? selected.size : 0),
    tip: () => {
      const sz = typeof selected !== "undefined" ? selected.size : 0;
      return [
        sz > 0 ? "Reverse " + sz + " selected" : "Reverse last moved",
        "Sends them back to where you drew them and freezes them until deselected."
      ];
    }
  },
  {
    icon: "deselect",
    isOn: null,
    action: () => { if (typeof clearSelection === "function") clearSelection(); },
    dwell: DWELL_MS,
    badge: () => (typeof selected !== "undefined" ? selected.size : 0),
    tip: () => ["Deselect all", "Unselects everything. Frozen objects fall again."]
  },
  {
    icon: "float",
    isOn: () => (typeof selected !== "undefined" ? Array.from(selected).some((o) => o && o.floating) : false),
    action: () => { if (typeof floatSelected === "function") floatSelected("toggle"); },
    dwell: DWELL_MS,
    badge: () => (typeof selected !== "undefined" ? selected.size : 0),
    tip: () => ["Float selected", "Selected objects drift up. Hold again to let them fall."]
  },
  {
    icon: "clone",
    isOn: null,
    action: () => { if (typeof cloneSelected === "function") cloneSelected(); },
    dwell: DWELL_MS,
    badge: () => (typeof selected !== "undefined" ? selected.size : 0),
    tip: () => ["Clone selected", "Makes a copy of each selected object."]
  },
  {
    icon: "destroy",
    isOn: null,
    action: () => { if (typeof destroySelected === "function") destroySelected(); },
    dwell: DWELL_DANGER_MS,
    danger: true,
    badge: () => (typeof selected !== "undefined" ? selected.size : 0),
    tip: () => ["Destroy selected", "Shatters the selected objects. Keep holding to confirm."]
  },
  {
    icon: "hitbox",
    isOn: () => showHitboxes,
    action: () => toggleHitboxes(),
    dwell: DWELL_MS,
    tip: () => ["Hitboxes: " + (showHitboxes ? "ON" : "OFF"), "Shows the real physics shapes."]
  },
  {
    icon: "skeleton",
    isOn: () => showSkeleton,
    action: () => toggleSkeleton(),
    dwell: DWELL_MS,
    tip: () => ["Hand skeleton: " + (showSkeleton ? "ON" : "OFF"), "Shows the green hand tracking lines."]
  },
  {
    icon: "clear",
    isOn: null,
    action: () => clearAll(),
    dwell: DWELL_DANGER_MS,
    danger: true,
    tip: () => ["Clear your shapes", "Deletes every shape you created. Keep holding to confirm."]
  }
];

var toolbarScrollY = 0;
var toolbarTargetScrollY = 0;
var toolbarMinScroll = 0;
var toolbarMaxScroll = 0;

let cachedToolbarPanel = null;
function toolbarPanelRect() {
  if (cachedToolbarPanel && cachedToolbarPanel.width === canvas.width &&
      cachedToolbarPanel.height === canvas.height && cachedToolbarPanel.right === dockRight) return cachedToolbarPanel.rect;
  const width = canvas.width || 1280;
  const height = canvas.height || 720;
  const scale = Math.max(0.85, Math.min(1.15, width / 1100));
  const size = Math.round(48 * scale);
  const gap = Math.round(7 * scale);
  const margin = Math.round(9 * scale);
  const panelH = Math.min(height - 70, 6 * size + 5 * gap + margin * 2);
  const panelW = size + margin * 2;
  const x = dockRight ? width - panelW - 6 : 6;
  const rect = { x: x, y: Math.round((height - panelH) / 2), w: panelW, h: panelH, size: size, gap: gap, margin: margin };
  cachedToolbarPanel = { width: canvas.width, height: canvas.height, right: dockRight, rect };
  return rect;
}

function toolbarPanelAt(point) {
  if (!point || !showBar) return false;
  const rect = toolbarPanelRect();
  return point.x >= rect.x - 8 && point.x <= rect.x + rect.w + 8 &&
    point.y >= rect.y - 6 && point.y <= rect.y + rect.h + 6;
}

function setToolbarScroll(value) {
  toolbarTargetScrollY = Math.max(toolbarMinScroll, Math.min(toolbarMaxScroll, value));
}

function toggleDock() {
  dockRight = !dockRight;
  dwellTarget = null;
  toolbarScrollY = 0;
  toolbarTargetScrollY = 0;
  layoutButtons();
  syncButtons();
}

let lastToolbarLayout = null;
function layoutButtons() {
  const rect = toolbarPanelRect();
  const total = gButtons.length * rect.size + (gButtons.length - 1) * rect.gap;
  const innerH = rect.h - rect.margin * 2;
  toolbarMinScroll = Math.min(0, innerH - total);
  toolbarMaxScroll = 0;
  if (Math.abs(toolbarTargetScrollY - toolbarScrollY) < 0.05) toolbarScrollY = toolbarTargetScrollY;
  else toolbarScrollY += (toolbarTargetScrollY - toolbarScrollY) * 0.32;
  if (lastToolbarLayout && lastToolbarLayout.x === rect.x && lastToolbarLayout.y === rect.y &&
      lastToolbarLayout.size === rect.size && lastToolbarLayout.gap === rect.gap &&
      lastToolbarLayout.margin === rect.margin && lastToolbarLayout.scroll === toolbarScrollY &&
      lastToolbarLayout.buttons.length === gButtons.length &&
      lastToolbarLayout.buttons.every((button, index) => button === gButtons[index])) return;
  lastToolbarLayout = { x: rect.x, y: rect.y, size: rect.size, gap: rect.gap, margin: rect.margin,
    scroll: toolbarScrollY, buttons: gButtons.slice() };
  let y = rect.y + rect.margin + toolbarScrollY;
  for (const b of gButtons) {
    b.x = rect.x + rect.margin;
    b.y = y;
    b.w = rect.size;
    b.h = rect.size;
    y += rect.size + rect.gap;
  }
}

function buttonAt(p) {
  if (!p || !showBar || !toolbarPanelAt(p)) return null;
  const rect = toolbarPanelRect();
  for (const b of gButtons) {
    if (b.x === undefined || b.y === undefined) continue;
    const visible = b.y + b.h >= rect.y + rect.margin && b.y <= rect.y + rect.h - rect.margin;
    if (visible && p.x >= b.x - 8 && p.x <= b.x + b.w + 8 &&
        p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return b;
  }
  return null;
}

function pressButton(b, nowMs) {
  if (b && typeof b.action === "function") {
    b.action();
  }
  flashButton = b;
  flashUntil = nowMs + 350;
}

window.airGestureToolbarButtonAt = function (clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const point = {
    x: (clientX - rect.left) * canvas.width / rect.width,
    y: (clientY - rect.top) * canvas.height / rect.height
  };
  return buttonAt(point);
};

window.setAirGestureToolbarHover = function (button, startedAt) {
  if (!button) return;
  const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / 650));
  button.airGestureProgress = progress;
};

window.activateAirGestureToolbarButton = function (button, nowMs) {
  if (button) pressButton(button, nowMs);
};

function updateDwell(nowMs) {
  // No pressing while the dock is hidden, the hand is gone, or you are drawing (pinching).
  const over = (showBar && pen && !pinching) ? buttonAt(pen) : null;
  if (dwellLock && over !== dwellLock) dwellLock = null;
  if (!over || over === dwellLock) {
    dwellTarget = null;
    return;
  }
  if (over !== dwellTarget) {
    dwellTarget = over;
    dwellStart = nowMs;
    return;
  }
  if (nowMs - dwellStart >= over.dwell) {
    pressButton(over, nowMs);
    dwellLock = over;
    dwellTarget = null;
  }
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draws one of the ICONS on the video canvas.
function drawIcon(name, cx, cy, size, color) {
  if (typeof ICONS === "undefined") return;
  const ic = ICONS[name];
  if (!ic) return;
  if (!ic.p2d) ic.p2d = new Path2D(ic.d);
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  if (!ic.cachedDash) ic.cachedDash = ic.dash ? ic.dash.split(" ").map(Number) : [];
  ctx.setLineDash(ic.cachedDash);
  ctx.stroke(ic.p2d);
  ctx.restore();
}

function wrapText(text, maxW) {
  const words = String(text || "").split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Small label box shown next to a button when the pen ring is moved onto it.
function drawTip(a, title, desc) {
  const fs = Math.max(12, Math.round(13 * Math.max(0.9, Math.min(1.1, canvas.width / 1100))));
  const pad = 10;
  const lineH = fs + 4;
  ctx.save();
  ctx.font = "bold " + fs + "px Arial";
  const titleW = ctx.measureText(title).width;
  ctx.font = (fs - 1) + "px Arial";
  const lines = wrapText(desc, 190);
  let w = titleW;
  for (const l of lines) {
    w = Math.max(w, ctx.measureText(l).width);
  }
  const boxW = Math.round(w + pad * 2);
  const boxH = Math.round(pad * 2 + lineH * (1 + lines.length));
  let x = dockRight ? a.x - 10 - boxW : a.x + a.w + 10;
  x = Math.max(6, Math.min(canvas.width - boxW - 6, x));
  let y = Math.round(a.y + a.h / 2 - boxH / 2);
  y = Math.max(6, Math.min(canvas.height - boxH - 6, y));

  roundRectPath(x, y, boxW, boxH, 8);
  ctx.fillStyle = "rgba(10,12,18,0.9)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold " + fs + "px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(title, x + pad, y + pad + lineH * 0.5);
  ctx.font = (fs - 1) + "px Arial";
  ctx.fillStyle = "#b8c4d6";
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + lineH * (1.5 + i)));
  ctx.restore();
}

function drawGestureBar(nowMs) {
  if (!showBar) return;
  layoutButtons();
  const panel = toolbarPanelRect();
  ctx.save();
  roundRectPath(panel.x, panel.y, panel.w, panel.h, 16);
  ctx.fillStyle = "rgba(12, 16, 24, 0.88)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();

  ctx.save();
  roundRectPath(panel.x, panel.y + 4, panel.w, panel.h - 8, 14);
  ctx.clip();
  for (const b of gButtons) {
    if (b.y + b.h < panel.y || b.y > panel.y + panel.h) continue;
    const on = b.isOn ? b.isOn() : null;
    const hot = dwellTarget === b;
    const r = Math.round(b.h * 0.28);

    roundRectPath(b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = b.danger ? "rgba(120,35,45,0.55)" : "rgba(16,20,28,0.6)";
    ctx.fill();

    // fill rises while the pen is held over the button
    if (hot) {
      const f = Math.min(1, (nowMs - dwellStart) / b.dwell);
      ctx.save();
      roundRectPath(b.x, b.y, b.w, b.h, r);
      ctx.clip();
      ctx.fillStyle = "rgba(56,232,255,0.45)";
      ctx.fillRect(b.x, b.y + b.h * (1 - f), b.w, b.h * f);
      ctx.restore();
    }
    // short flash after a press
    if (flashButton === b && nowMs < flashUntil) {
      roundRectPath(b.x, b.y, b.w, b.h, r);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    }

    roundRectPath(b.x, b.y, b.w, b.h, r);
    ctx.lineWidth = hot ? 2 : 1.5;
    ctx.strokeStyle = hot
      ? "rgba(120,240,255,0.95)"
      : (b.danger ? "rgba(255,140,150,0.6)" : "rgba(255,255,255,0.25)");
    ctx.stroke();

    const color = b.danger
      ? "#ff9aa5"
      : (on === true ? "#5dffa8" : (on === false ? "#8b93a3" : "#ffffff"));
    drawIcon(b.icon, b.x + b.w / 2, b.y + b.h / 2, Math.round(b.h * 0.5), color);

    // small count badge (number of selected objects)
    const n = b.badge ? b.badge() : 0;
    if (n > 0) {
      ctx.beginPath();
      ctx.arc(b.x + b.w - 6, b.y + 6, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#5dffa8";
      ctx.fill();
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#08210f";
      ctx.fillText(String(n), b.x + b.w - 6, b.y + 7);
    }
  }

  ctx.restore();

  if (toolbarMinScroll < 0) {
    const trackH = panel.h - 28;
    const thumbH = Math.max(20, trackH * (panel.h / (panel.h - toolbarMinScroll)));
    const fraction = toolbarTargetScrollY / toolbarMinScroll;
    const thumbY = panel.y + 14 + (trackH - thumbH) * fraction;
    const thumbX = dockRight ? panel.x + 4 : panel.x + panel.w - 8;
    roundRectPath(thumbX, thumbY, 4, thumbH, 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill();
  }

  // tooltip for the button the pen ring is over
  const activePen = (pen && !pinching) ? pen : ((h2.pen && !h2.pinching) ? h2.pen : null);
  const hoverBtn = activePen ? buttonAt(activePen) : null;
  if (hoverBtn) {
    const t = hoverBtn.tip();
    drawTip(hoverBtn, t[0], t[1]);
  }
  ctx.restore();
}

// ------------------------------------------------------------
// Arrow tab on the screen edge: pinch and hold on it to open or hide the dock.
// ------------------------------------------------------------
function tabRect() {
  const panel = toolbarPanelRect();
  const scale = Math.max(0.85, Math.min(1.15, canvas.width / 1100));
  const w = Math.round(28 * scale);
  const h = Math.round(64 * scale);
  let x;
  if (!showBar) {
    x = dockRight ? canvas.width - w : 0;                 // hugging the screen edge
  } else {
    x = dockRight ? panel.x - w - 4 : panel.x + panel.w + 4;
  }
  return { x: x, y: Math.round(canvas.height / 2 - h / 2), w: w, h: h };
}

function tabAt(p) {
  return false;
}

function drawTab(nowMs) {
  const t = tabRect();
  const r = Math.round(t.w * 0.4);
  const over = pen ? tabAt(pen) : false;
  const holding = !!(tabHold && !tabHold.done && over);

  roundRectPath(t.x, t.y, t.w, t.h, r);
  ctx.fillStyle = "rgba(16,20,28,0.55)";
  ctx.fill();

  if (holding) {
    const f = Math.min(1, (nowMs - tabHold.startMs) / TAB_HOLD_MS);
    ctx.save();
    roundRectPath(t.x, t.y, t.w, t.h, r);
    ctx.clip();
    ctx.fillStyle = "rgba(56,232,255,0.45)";
    ctx.fillRect(t.x, t.y + t.h * (1 - f), t.w, t.h * f);
    ctx.restore();
  }

  roundRectPath(t.x, t.y, t.w, t.h, r);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = (holding || over) ? "rgba(120,240,255,0.95)" : "rgba(255,255,255,0.35)";
  ctx.stroke();

  // arrow: points toward the side it will move the panel
  const pointsLeft = dockRight !== showBar;
  const d = pointsLeft ? -1 : 1;
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - d * 4, cy - 9);
  ctx.lineTo(cx + d * 4, cy);
  ctx.lineTo(cx - d * 4, cy + 9);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  if (over) {
    drawTip(
      t,
      "Button panel",
      showBar ? "Pinch and hold to hide the panel." : "Pinch and hold to open the panel."
    );
  }
}

// ------------------------------------------------------------
// Settings, materials, sound, save/load, redo
// ------------------------------------------------------------
var audioCtx = null;
var lastToneMs = 0;

function playTone(freq, dur) {
  const t = performance.now();
  if (!soundOn || t - lastToneMs < 60) return;
  lastToneMs = t;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.05;
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {
    // no audio
  }
}

function serObj(o) {
  if (o.isMerged && o.body && o.subParts) {
    const b = o.body;
    const c = Math.cos(b.angle), sn = Math.sin(b.angle);
    const toWorld = (arr) => arr.map((p) => ({
      x: b.position.x + p.x * c - p.y * sn,
      y: b.position.y + p.x * sn + p.y * c
    }));
    return {
      k: "compound",
      shapeType: o.shapeType,
      behaviorText: o.behaviorText,
      hue: o.hue,
      scaleMultiplier: o.scaleMultiplier || 1,
      components: o.subParts.map((part) => ({
        k: part.kind,
        shapeType: part.shapeType,
        behaviorText: part.behaviorText,
        hue: part.hue,
        wellRadius: part.wellRadius,
        spiralDir: part.spiralDir,
        v: toWorld(part.local),
        s: toWorld(part.polyLocal)
      }))
    };
  }
  if (o.kind === "platform") {
    return {
      k: "platform",
      shapeType: o.shapeType,
      color: o.color,
      raw: o.raw.map((p) => ({ x: p.x, y: p.y }))
    };
  }
  const b = o.body;
  const c = Math.cos(b.angle);
  const sn = Math.sin(b.angle);
  const w = (arr) => arr.map((p) => ({
    x: b.position.x + p.x * c - p.y * sn,
    y: b.position.y + p.x * sn + p.y * c
  }));
  return {
    k: o.kind,
    shapeType: o.shapeType,
    behaviorText: o.behaviorText,
    color: o.color,
    hue: o.hue,
    wellRadius: o.wellRadius,
    spiralDir: o.spiralDir,
    v: w(o.local),
    s: w(o.kind === "solid" ? o.polyLocal : (o.lineLocal || o.local))
  };
}

function deserObj(d) {
  let ok = false;
  if (d.k === "compound" && typeof addCompoundObject === "function") {
    ok = addCompoundObject(d.components);
  } else if (d.k === "platform") {
    ok = addPlatform(d.raw, d.raw, d.shapeType);
  } else if (d.k === "spring" && typeof addSpring === "function") {
    ok = addSpring(d.v, d.s);
  } else if (d.k === "cup" && typeof addCup === "function") {
    ok = addCup(d.v, d.s);
  } else if (d.k === "spiral" && typeof addSpiralWell === "function") {
    ok = addSpiralWell(d.v, {
      center: centroid(d.v),
      radius: d.wellRadius || 38,
      dir: d.spiralDir || 1
    });
  } else if (d.k === "solid") {
    if (d.shapeType === "Circle" && typeof addCircleObject === "function") {
      const bb = boundsOf(d.s);
      ok = addCircleObject(d.v, {
        center: centroid(d.s),
        radius: Math.max(12, (bb.w + bb.h) / 4),
        poly: d.s
      });
    } else {
      ok = addSolid(d.v, d.s, d.shapeType, d.behaviorText);
    }
  } else {
    ok = addFallingLine(d.v, d.s, d.shapeType);
  }
  if (ok && d.hue !== undefined && typeof objects !== "undefined" && objects.length > 0) {
    objects[objects.length - 1].hue = d.hue;
  }
  if (ok && typeof objects !== "undefined" && objects.length > 0) {
    if (isValidDrawingColor(d.color)) objects[objects.length - 1].color = d.color;
    if (Number.isFinite(d.scaleMultiplier)) objects[objects.length - 1].scaleMultiplier = d.scaleMultiplier;
    assignLocalObjectIdentity(objects[objects.length - 1]);
  }
  return ok;
}

function saveScene() {
  try {
    localStorage.setItem("physdraw.scene", JSON.stringify(objects.map(serObj)));
    if (typeof showToast === "function") showToast("Saved");
  } catch (e) {
    if (typeof showToast === "function") showToast("Could not save");
  }
}

function loadScene() {
  try {
    const d = JSON.parse(localStorage.getItem("physdraw.scene") || "null");
    if (!d) {
      if (typeof showToast === "function") showToast("Nothing saved");
      return;
    }
    if (typeof clearObjects === "function") clearObjects();
    if (typeof clearMoves === "function") clearMoves();
    for (const x of d) {
      if (deserObj(x)) {
        const created = objects[objects.length - 1];
        if (typeof window.broadcastObjectCreation === "function") {
          window.broadcastObjectCreation(created);
        }
      }
    }
    if (typeof showToast === "function") showToast("Loaded");
  } catch (e) {
    if (typeof showToast === "function") showToast("Could not load");
  }
}

function redoLast() {
  const d = redoStack.pop();
  if (!d) {
    if (typeof showToast === "function") showToast("Nothing to redo");
    return;
  }
  if (deserObj(d) && typeof window.broadcastObjectCreation === "function") {
    window.broadcastObjectCreation(objects[objects.length - 1]);
  }
  if (typeof showToast === "function") showToast("Redid drawing");
}

function saveSettings() {
  try {
    localStorage.setItem("physdraw.settings", JSON.stringify({
      v: SETTINGS.map((x) => x[4]()),
      matIdx: matIdx,
      soundOn: soundOn,
      perfMode: perfMode,
      drawingColor: drawingColor
    }));
  } catch (e) {
    // ignore
  }
}

function applyPerf() {
  if (typeof MAX_PARTICLES !== "undefined") {
    MAX_PARTICLES = perfMode ? 80 : 360;
  }
}

function ensureDomElement(id, tag, text) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (text) el.innerHTML = text;
    document.body.appendChild(el);
  }
  return el;
}

function buildPanel() {
  try {
    const d = JSON.parse(localStorage.getItem("physdraw.settings") || "null");
    if (d && typeof SETTINGS !== "undefined") {
      SETTINGS.forEach((x, i) => {
        if (d.v && typeof d.v[i] === "number") x[5](d.v[i]);
      });
      matIdx = d.matIdx | 0;
      soundOn = d.soundOn !== false;
      perfMode = !!d.perfMode;
      if (isValidDrawingColor(d.drawingColor)) drawingColor = d.drawingColor;
      if (drawingColorInput) drawingColorInput.value = drawingColor;
      applyPerf();
    }
  } catch (e) {
    // ignore
  }
  const btn = ensureDomElement("cfgBtn", "button", "&#9881;");
  const box = ensureDomElement("cfg", "div");
  box.innerHTML = "";
  btn.onclick = () => {
    box.style.display = box.style.display === "block" ? "none" : "block";
  };
  if (typeof SETTINGS !== "undefined") {
    for (const [label, mn, mx, st, get, set] of SETTINGS) {
      const l = document.createElement("label");
      const out = document.createElement("span");
      const r = document.createElement("input");
      r.type = "range";
      r.min = mn;
      r.max = mx;
      r.step = st;
      r.value = get();
      out.textContent = " " + get();
      l.textContent = label;
      l.appendChild(out);
      r.oninput = () => {
        set(Number(r.value));
        out.textContent = " " + r.value;
        saveSettings();
      };
      box.appendChild(l);
      box.appendChild(r);
    }
  }
  const lm = document.createElement("label");
  lm.textContent = "Next object material";
  const sel = document.createElement("select");
  if (typeof MATERIALS !== "undefined") {
    MATERIALS.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m.n;
      sel.appendChild(o);
    });
  }
  sel.value = matIdx;
  sel.onchange = () => {
    matIdx = Number(sel.value);
    saveSettings();
  };
  box.appendChild(lm);
  box.appendChild(sel);

  const mk = (t, f) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = f;
    box.appendChild(b);
    return b;
  };
  mk("Save", saveScene);
  mk("Load", loadScene);
  mk("Redo", redoLast);
  const snd = mk("Sound: " + (soundOn ? "on" : "off"), () => {
    soundOn = !soundOn;
    snd.textContent = "Sound: " + (soundOn ? "on" : "off");
    saveSettings();
  });
  const pf = mk("Performance: " + (perfMode ? "on" : "off"), () => {
    perfMode = !perfMode;
    applyPerf();
    pf.textContent = "Performance: " + (perfMode ? "on" : "off");
    saveSettings();
  });
  const lb = mk("Shape labels: " + (getShowLabels() ? "on" : "off"), () => {
    setShowLabels(!getShowLabels());
    lb.textContent = "Shape labels: " + (getShowLabels() ? "on" : "off");
  });
}

function extraPanel() {
  const box = ensureDomElement("cfg", "div");
  const mk = (t, f) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = f;
    box.appendChild(b);
    return b;
  };
  const lab = document.createElement("label");
  lab.textContent = "Link type (select 2 objects first)";
  const sel = document.createElement("select");
  ["Spring", "Rope", "Hinge"].forEach((n) => {
    const o = document.createElement("option");
    o.textContent = n;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    linkType = sel.value;
  };
  box.appendChild(lab);
  box.appendChild(sel);
  mk("Link", () => {
    if (typeof linkSelected === "function") linkSelected();
  });
  mk("Unlink", () => {
    if (typeof unlinkSelected === "function") unlinkSelected();
  });
  const rt = mk("Hand rotation: on", () => {
    rotateOn = !rotateOn;
    rt.textContent = "Hand rotation: " + (rotateOn ? "on" : "off");
  });
  const rl = document.createElement("label");
  rl.textContent = "Rotation strength";
  const rr = document.createElement("input");
  rr.type = "range";
  rr.min = 0.5;
  rr.max = 2;
  rr.step = 0.1;
  rr.value = 1;
  rr.oninput = () => {
    rotGain = Number(rr.value);
  };
  box.appendChild(rl);
  box.appendChild(rr);
  const fz = mk("Push frozen: " + (pushFrozen ? "on" : "off"), () => {
    setPushFrozen(!pushFrozen);
  });
  fz.id = "pushFrozenBtn";
}

// ------------------------------------------------------------
// Lighting / tracking hint
// ------------------------------------------------------------
function lightingHint() {
  const el = ensureDomElement("hint", "div");
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 24;
  const cx = c.getContext("2d", { willReadFrequently: true });
  let luma = 128;
  let since = 0;
  setInterval(() => {
    const now = performance.now();
    try {
      if (video && video.readyState >= 2) {
        cx.drawImage(video, 0, 0, 32, 24);
        const d = cx.getImageData(0, 0, 32, 24).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        luma = luma * 0.5 + (sum / (d.length / 4)) * 0.5;
      }
    } catch (e) {
      return;
    }
    while (handLosses.length && now - handLosses[0] > 10000) {
      handLosses.shift();
    }
    let m = "";
    if (luma < 55) {
      m = "Too dark \u2013 turn on a light or face a window so your hand is easier to see";
    } else if (luma > 210) {
      m = "Too bright or backlit \u2013 avoid a bright window behind your hand";
    } else if (handLosses.length >= 5) {
      m = "Hand keeps getting lost \u2013 keep it fully in view and move a bit slower";
    }
    // show only after the problem lasts 2 s, hide once it is gone
    if (m) {
      if (!since) since = now;
    } else {
      since = 0;
    }
    if (m && now - since > 2000) {
      el.textContent = m;
      el.style.display = "block";
    } else if (!m) {
      el.style.display = "none";
    }
  }, 600);
}

// ------------------------------------------------------------
// Main loop
// ------------------------------------------------------------
const interpolationScratch = [];
let lastMainLoopAt = -Infinity;
const MAIN_FRAME_INTERVAL_MS = 1000 / 60;
const CANVAS_RENDER_INTERVAL_MS = 1000 / 60;
let lastCanvasRenderAt = -Infinity;

function loop() {
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  if (document.hidden || nowMs - lastMainLoopAt < MAIN_FRAME_INTERVAL_MS - 0.5) return;
  lastMainLoopAt = nowMs;

  // Fallback for browsers without requestVideoFrameCallback: check for a new frame every screen frame.
  if (!useVFC && video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    if (typeof trackFrame === "function") trackFrame();
  }

  updateDwell(nowMs);
  if (typeof updateHoverSelect === "function") updateHoverSelect(nowMs);
  if (typeof stepPhysics === "function") stepPhysics(nowMs);
  if (window.GameEngine) window.GameEngine.update(nowMs);

  // Keep simulation, dwell controls, and canvas rendering at 60 Hz.
  if (nowMs - lastCanvasRenderAt < CANVAS_RENDER_INTERVAL_MS - 1) return;
  lastCanvasRenderAt = nowMs;

  // Draw bodies between their last two physics states so motion stays smooth on any refresh rate.
  const saved = interpolationScratch;
  let savedCount = 0;
  const stepDur = typeof STEP_MS !== "undefined" ? STEP_MS : (1000 / 60);
  const acc = typeof accumulator !== "undefined" ? accumulator : 0;
  const alpha = pausedWorld ? 1 : Math.min(1, acc / stepDur);
  if (alpha < 1 && typeof objects !== "undefined") {
    for (const o of objects) {
      for (const b of o.bodies) {
        const q = b._ip;
        const heldBy1 = grabbed && grabbed.obj && grabbed.obj.body === b;
        const heldBy2 = typeof h2 !== "undefined" && h2.grab && h2.grab.obj && h2.grab.obj.body === b;
        if (
          b.isStatic || b.isSleeping ||
          !q ||
          heldBy1 ||
          heldBy2 ||
          Math.abs(b.position.x - q.x) > 150 ||
          Math.abs(b.position.y - q.y) > 150
        ) {
          continue;
        }
        const record = saved[savedCount] || (saved[savedCount] = []);
        record[0] = b;
        record[1] = b.position.x;
        record[2] = b.position.y;
        record[3] = b.angle;
        savedCount++;
        b.position.x = q.x + (b.position.x - q.x) * alpha;
        b.position.y = q.y + (b.position.y - q.y) * alpha;
        b.angle = q.a + (b.angle - q.a) * alpha;
      }
    }
  }
  try {
    render();
  } catch (err) {
    console.error("render error:", err);
  } finally {
    for (let index = 0; index < savedCount; index++) {
      const r = saved[index];
      r[0].position.x = r[1];
      r[0].position.y = r[2];
      r[0].angle = r[3];
      r[0] = null;
    }
  }
  updateStatus();

  fpsFrames++;
  if (nowMs - fpsStart >= 500) {
    fps = Math.round((fpsFrames * 1000) / (nowMs - fpsStart));
    fpsFrames = 0;
    fpsStart = nowMs;
  }
}

// ------------------------------------------------------------
// Start (waits until all scripts and DOM elements are ready)
// ------------------------------------------------------------
async function init() {
  try {
    if (statusEl) statusEl.textContent = "Starting camera. Click Allow if the browser asks.";
    if (typeof startCamera === "function") await startCamera();
    if (typeof buildWalls === "function") buildWalls();
    layoutButtons();
    syncButtons();
    if (statusEl) statusEl.textContent = "Loading hand tracker. This needs internet and takes a few seconds.";
    if (typeof startTracker === "function") await startTracker();
    if (statusEl) statusEl.textContent = "Ready. Show your hand to the camera.";
    if (typeof lastFrameMs !== "undefined") lastFrameMs = performance.now();
    if (useVFC && video && typeof onVideoFrame === "function") {
      video.requestVideoFrameCallback(onVideoFrame);
    }
    loop();
  } catch (err) {
    if (statusEl) statusEl.textContent = err.friendly || ("Error: " + err.message);
  }
}

function startUiWhenReady() {
  initToolbarIcons();
  buildPanel();
  extraPanel();
  lightingHint();
  syncButtons();
  if (new URLSearchParams(window.location.search).get("embedded") !== "1") {
    init();
    return;
  }

  if (statusEl) statusEl.textContent = "Video call ready. Waiting for the transition.";
  const startCall = (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== window.location.origin ||
      event.data !== "sketch2ism:start-call"
    ) return;
    window.removeEventListener("message", startCall);
    init();
  };
  window.addEventListener("message", startCall);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startUiWhenReady);
} else {
  setTimeout(startUiWhenReady, 0);
}
