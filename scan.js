const PAPER_SCAN_WIDTH = 480;
const PAPER_SCAN_HEIGHT = 270;
const PAPER_SCAN_INTERVAL_MS = 260;
const PAPER_SCAN_HOLD_MS = 700;
const PAPER_SCAN_MIN_PIXELS = 18;
const PAPER_SCAN_MAX_FRACTION = 0.16;

const paperScanCanvas = document.createElement("canvas");
paperScanCanvas.width = PAPER_SCAN_WIDTH;
paperScanCanvas.height = PAPER_SCAN_HEIGHT;
const paperScanContext = paperScanCanvas.getContext("2d", { willReadFrequently: true });
const paperScanButton = document.getElementById("scanToggleBtn");
let paperScanEnabled = false;
let paperScanLastFrame = 0;
let paperScanObjects = [];
let paperScanRegion = null;
let paperScanRegionSamples = [];
let paperScanManualRegion = null;
let paperScanDrag = null;
let paperScanSelection = null;
const paperPickSessions = new Map();

function setPaperScanEnabled(enabled) {
  paperScanEnabled = !!enabled;
  paperScanObjects = [];
  paperScanRegion = null;
  paperScanRegionSamples = [];
  paperScanManualRegion = null;
  paperScanDrag = null;
  paperScanSelection = null;
  paperScanLastFrame = 0;
  if (paperScanButton) {
    paperScanButton.setAttribute("aria-pressed", String(paperScanEnabled));
    paperScanButton.textContent = paperScanEnabled ? "Stop paper scan" : "Scan paper";
    paperScanButton.classList.toggle("on", paperScanEnabled);
  }
  for (const session of paperPickSessions.values()) session.cancelled = true;
  paperPickSessions.clear();
  if (typeof showToast === "function") {
    showToast(paperScanEnabled
      ? "Paper scan on: show a sheet with dark or colored drawings"
      : "Paper scan off");
  }
}

if (paperScanButton) {
  paperScanButton.addEventListener("click", () => {
    setPaperScanEnabled(!paperScanEnabled);
  });
}

function paperScanPointerPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width,
      (event.clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height,
      (event.clientY - rect.top) * canvas.height / rect.height))
  };
}

canvas.addEventListener("pointerdown", (event) => {
  if (!paperScanEnabled || event.button !== 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const point = paperScanPointerPoint(event);
  paperScanDrag = {
    x: point.x * PAPER_SCAN_WIDTH / canvas.width,
    y: point.y * PAPER_SCAN_HEIGHT / canvas.height
  };
  paperScanSelection = { minX: paperScanDrag.x, minY: paperScanDrag.y, maxX: paperScanDrag.x, maxY: paperScanDrag.y };
  canvas.setPointerCapture(event.pointerId);
}, true);

canvas.addEventListener("pointermove", (event) => {
  if (!paperScanEnabled || !paperScanDrag) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const point = paperScanPointerPoint(event);
  const x = point.x * PAPER_SCAN_WIDTH / canvas.width;
  const y = point.y * PAPER_SCAN_HEIGHT / canvas.height;
  paperScanSelection = {
    minX: Math.min(paperScanDrag.x, x),
    minY: Math.min(paperScanDrag.y, y),
    maxX: Math.max(paperScanDrag.x, x),
    maxY: Math.max(paperScanDrag.y, y)
  };
}, true);

function finishPaperScanSelection(event) {
  if (!paperScanEnabled || !paperScanDrag) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const selection = paperScanSelection;
  paperScanDrag = null;
  paperScanSelection = null;
  if (!selection || selection.maxX - selection.minX < 30 || selection.maxY - selection.minY < 30) {
    if (typeof showToast === "function") showToast("Drag a larger box around the sheet");
    return;
  }
  paperScanManualRegion = {
    minX: Math.max(0, Math.floor(selection.minX)),
    minY: Math.max(0, Math.floor(selection.minY)),
    maxX: Math.min(PAPER_SCAN_WIDTH - 1, Math.ceil(selection.maxX)),
    maxY: Math.min(PAPER_SCAN_HEIGHT - 1, Math.ceil(selection.maxY)),
    width: Math.ceil(selection.maxX) - Math.floor(selection.minX),
    height: Math.ceil(selection.maxY) - Math.floor(selection.minY),
    area: (selection.maxX - selection.minX) * (selection.maxY - selection.minY)
  };
  paperScanRegionSamples = [];
  paperScanLastFrame = 0;
  if (typeof showToast === "function") showToast("Scan area locked to your selection");
}

canvas.addEventListener("pointerup", finishPaperScanSelection, true);
canvas.addEventListener("pointercancel", finishPaperScanSelection, true);

function paperScanComponents(mask) {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  let nextLabel = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = ++nextLabel;
    let head = 0, tail = 0;
    const pixels = [];
    let minX = PAPER_SCAN_WIDTH, minY = PAPER_SCAN_HEIGHT, maxX = 0, maxY = 0;
    queue[tail++] = start;
    labels[start] = id;
    while (head < tail) {
      const index = queue[head++];
      const x = index % PAPER_SCAN_WIDTH;
      const y = Math.floor(index / PAPER_SCAN_WIDTH);
      pixels.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= PAPER_SCAN_HEIGHT) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= PAPER_SCAN_WIDTH) continue;
          const neighbor = ny * PAPER_SCAN_WIDTH + nx;
          if (mask[neighbor] && !labels[neighbor]) {
            labels[neighbor] = id;
            queue[tail++] = neighbor;
          }
        }
      }
    }
    components.push({
      id: id,
      pixels: pixels,
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: pixels.length
    });
  }
  return { labels: labels, components: components };
}

function paperScanDilate(mask, radius = 1) {
  const grown = new Uint8Array(mask.length);
  for (let y = radius; y < PAPER_SCAN_HEIGHT - radius; y++) {
    for (let x = radius; x < PAPER_SCAN_WIDTH - radius; x++) {
      const i = y * PAPER_SCAN_WIDTH + x;
      if (!mask[i]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const row = (y + dy) * PAPER_SCAN_WIDTH;
        for (let dx = -radius; dx <= radius; dx++) grown[row + x + dx] = 1;
      }
    }
  }
  return grown;
}

function paperScanPaperRegion(image) {
  if (paperScanManualRegion) return paperScanManualRegion;
  const data = image.data;
  const lightMask = new Uint8Array(PAPER_SCAN_WIDTH * PAPER_SCAN_HEIGHT);
  const lumaHistogram = new Uint32Array(256);
  let neutralCount = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (max - min < 78) {
      lumaHistogram[Math.min(255, Math.floor(luma))]++;
      neutralCount++;
    }
  }
  let cumulative = 0;
  let upperLuma = 180;
  const target = neutralCount * 0.78;
  for (let value = 0; value < lumaHistogram.length; value++) {
    cumulative += lumaHistogram[value];
    if (cumulative >= target) {
      upperLuma = value;
      break;
    }
  }
  const paperLumaFloor = Math.max(72, Math.min(140, upperLuma * 0.43));
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma > paperLumaFloor && max - min < 78) lightMask[p] = 1;
  }
  const grouped = paperScanComponents(paperScanDilate(lightMask, 2));
  const imageArea = PAPER_SCAN_WIDTH * PAPER_SCAN_HEIGHT;
  const candidates = [];
  for (const component of grouped.components) {
    const ratio = component.width / component.height;
    const boundsArea = component.width * component.height;
    const portrait = ratio >= 0.38 && ratio <= 0.98 &&
      component.width >= PAPER_SCAN_WIDTH * 0.20 &&
      component.height >= PAPER_SCAN_HEIGHT * 0.48;
    const landscape = ratio >= 1.02 && ratio <= 1.55 &&
      component.width >= PAPER_SCAN_WIDTH * 0.44 &&
      component.height >= PAPER_SCAN_HEIGHT * 0.30;
    const clipped = component.minX < 3 || component.minY < 3 ||
      component.maxX > PAPER_SCAN_WIDTH - 4;
    if (clipped || (!portrait && !landscape) ||
        boundsArea <= imageArea * 0.09 || boundsArea >= imageArea * 0.76) continue;

    let lumaSum = 0, lightPixels = 0;
    for (const p of component.pixels) {
      if (!lightMask[p]) continue;
      const i = p * 4;
      lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lightPixels++;
    }
    const fill = lightPixels / Math.max(1, boundsArea);
    const meanLuma = lumaSum / Math.max(1, lightPixels);
    if (fill > 0.48 && meanLuma > 82) {
      candidates.push({ component, ratio, boundsArea, fill, meanLuma, portrait, landscape });
    }
  }
  if (candidates.length === 0) {
    paperScanRegionSamples = [];
    return null;
  }
  const centerX = PAPER_SCAN_WIDTH / 2, centerY = PAPER_SCAN_HEIGHT / 2;
  const score = (candidate) => {
    const component = candidate.component;
    const cx = (component.minX + component.maxX) / 2;
    const cy = (component.minY + component.maxY) / 2;
    const centerPenalty = Math.hypot((cx - centerX) / centerX, (cy - centerY) / centerY);
    const aspectPenalty = candidate.portrait
      ? Math.abs(Math.log(candidate.ratio / 0.72))
      : Math.abs(Math.log(candidate.ratio / 1.2)) + 0.4;
    return candidate.boundsArea * candidate.fill * (candidate.meanLuma / 255) /
      (1 + centerPenalty * 1.8 + aspectPenalty * 0.55);
  };
  candidates.sort((a, b) => score(b) - score(a));
  const sheet = candidates[0].component;
  const candidateRegion = {
    minX: sheet.minX,
    minY: sheet.minY,
    maxX: sheet.maxX,
    maxY: sheet.maxY,
    width: sheet.width,
    height: sheet.height,
    area: sheet.area
  };
  paperScanRegionSamples.push(candidateRegion);
  if (paperScanRegionSamples.length > 5) paperScanRegionSamples.shift();
  const matches = paperScanRegionSamples.filter((sample) =>
    paperScanRegionOverlap(sample, candidateRegion) >= 0.45
  );
  if (matches.length < 2) return null;
  return {
    minX: Math.round(matches.reduce((sum, sample) => sum + sample.minX, 0) / matches.length),
    minY: Math.round(matches.reduce((sum, sample) => sum + sample.minY, 0) / matches.length),
    maxX: Math.round(matches.reduce((sum, sample) => sum + sample.maxX, 0) / matches.length),
    maxY: Math.round(matches.reduce((sum, sample) => sum + sample.maxY, 0) / matches.length),
    width: Math.round(matches.reduce((sum, sample) => sum + sample.width, 0) / matches.length),
    height: Math.round(matches.reduce((sum, sample) => sum + sample.height, 0) / matches.length),
    area: Math.round(matches.reduce((sum, sample) => sum + sample.area, 0) / matches.length)
  };
}

function paperScanRegionOverlap(a, b) {
  const left = Math.max(a.minX, b.minX);
  const top = Math.max(a.minY, b.minY);
  const right = Math.min(a.maxX, b.maxX);
  const bottom = Math.min(a.maxY, b.maxY);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function paperScanInkMask(image, sheet) {
  if (!sheet) return new Uint8Array(PAPER_SCAN_WIDTH * PAPER_SCAN_HEIGHT);
  const data = image.data;
  const mask = new Uint8Array(PAPER_SCAN_WIDTH * PAPER_SCAN_HEIGHT);
  const xPad = Math.max(3, Math.round(sheet.width * 0.035));
  const yPad = Math.max(3, Math.round(sheet.height * 0.035));
  const stride = PAPER_SCAN_WIDTH + 1;
  const integral = new Float64Array(stride * (PAPER_SCAN_HEIGHT + 1));
  for (let y = 1; y <= PAPER_SCAN_HEIGHT; y++) {
    let rowTotal = 0;
    for (let x = 1; x <= PAPER_SCAN_WIDTH; x++) {
      const source = ((y - 1) * PAPER_SCAN_WIDTH + x - 1) * 4;
      rowTotal += 0.299 * data[source] + 0.587 * data[source + 1] + 0.114 * data[source + 2];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowTotal;
    }
  }
  const localRadius = 8;
  const localMeanAt = (x, y) => {
    const x1 = Math.max(0, x - localRadius), y1 = Math.max(0, y - localRadius);
    const x2 = Math.min(PAPER_SCAN_WIDTH, x + localRadius + 1);
    const y2 = Math.min(PAPER_SCAN_HEIGHT, y + localRadius + 1);
    const sum = integral[y2 * stride + x2] - integral[y1 * stride + x2] -
      integral[y2 * stride + x1] + integral[y1 * stride + x1];
    return sum / ((x2 - x1) * (y2 - y1));
  };
  for (let y = sheet.minY + yPad; y <= sheet.maxY - yPad; y++) {
    for (let x = sheet.minX + xPad; x <= sheet.maxX - xPad; x++) {
      const i = (y * PAPER_SCAN_WIDTH + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const localMean = localMeanAt(x, y);
      const darkInk = localMean - luma > Math.max(17, localMean * 0.14);
      const colorInk = max - min > 38 && luma < 248;
      if (darkInk || colorInk) mask[y * PAPER_SCAN_WIDTH + x] = 1;
    }
  }
  return mask;
}

function paperScanHull(points) {
  const sorted = points
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function paperScanBoundary(pixels, componentId, labels) {
  const edges = [];
  const add = (x1, y1, x2, y2) => edges.push([x1, y1, x2, y2]);
  for (const index of pixels) {
    const x = index % PAPER_SCAN_WIDTH;
    const y = Math.floor(index / PAPER_SCAN_WIDTH);
    if (y === 0 || labels[index - PAPER_SCAN_WIDTH] !== componentId) add(x, y, x + 1, y);
    if (x === PAPER_SCAN_WIDTH - 1 || labels[index + 1] !== componentId) add(x + 1, y, x + 1, y + 1);
    if (y === PAPER_SCAN_HEIGHT - 1 || labels[index + PAPER_SCAN_WIDTH] !== componentId) add(x + 1, y + 1, x, y + 1);
    if (x === 0 || labels[index - 1] !== componentId) add(x, y + 1, x, y);
  }
  return edges;
}

function paperScanTraceContour(edges) {
  const starts = new Map();
  const key = (x, y) => x + "," + y;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const from = key(edge[0], edge[1]);
    if (!starts.has(from)) starts.set(from, []);
    starts.get(from).push(i);
  }
  const visited = new Uint8Array(edges.length);
  let largest = null;
  let largestArea = 0;
  const direction = (edge) => {
    if (edge[2] > edge[0]) return 0;
    if (edge[3] > edge[1]) return 1;
    if (edge[2] < edge[0]) return 2;
    return 3;
  };
  const priority = (dir) => [(dir + 1) % 4, dir, (dir + 3) % 4, (dir + 2) % 4];

  for (let start = 0; start < edges.length; start++) {
    if (visited[start]) continue;
    const first = edges[start];
    const startKey = key(first[0], first[1]);
    const contour = [];
    let edgeIndex = start;
    let closed = false;
    for (let steps = 0; steps <= edges.length; steps++) {
      if (visited[edgeIndex]) break;
      visited[edgeIndex] = 1;
      const edge = edges[edgeIndex];
      contour.push({ x: edge[0], y: edge[1] });
      const endKey = key(edge[2], edge[3]);
      if (endKey === startKey) {
        closed = true;
        break;
      }
      const options = (starts.get(endKey) || []).filter((i) => !visited[i]);
      if (options.length === 0) break;
      const preference = priority(direction(edge));
      options.sort((a, b) =>
        preference.indexOf(direction(edges[a])) - preference.indexOf(direction(edges[b]))
      );
      edgeIndex = options[0];
    }
    if (!closed || contour.length < 3) continue;
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    if (area > largestArea) {
      largest = contour;
      largestArea = area;
    }
  }
  return largest;
}

function detectPaperScanObjects() {
  const videoEl = document.getElementById("video");
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return [];
  paperScanContext.save();
  paperScanContext.setTransform(-1, 0, 0, 1, PAPER_SCAN_WIDTH, 0);
  paperScanContext.drawImage(videoEl, 0, 0, PAPER_SCAN_WIDTH, PAPER_SCAN_HEIGHT);
  paperScanContext.restore();

  const image = paperScanContext.getImageData(0, 0, PAPER_SCAN_WIDTH, PAPER_SCAN_HEIGHT);
  const sheet = paperScanPaperRegion(image);
  paperScanRegion = sheet;
  if (!sheet) return [];
  const ink = paperScanInkMask(image, sheet);
  const grouped = paperScanComponents(paperScanDilate(ink, 2));
  const objectsFound = [];
  const maxPixels = PAPER_SCAN_WIDTH * PAPER_SCAN_HEIGHT * PAPER_SCAN_MAX_FRACTION;

  for (const component of grouped.components) {
    if (component.area < PAPER_SCAN_MIN_PIXELS || component.area > maxPixels ||
        component.width < 3 || component.height < 3) continue;
    const hullPoints = component.pixels
      .filter((_, index) => (index & 1) === 0)
      .map((index) => ({
        x: index % PAPER_SCAN_WIDTH + 0.5,
        y: Math.floor(index / PAPER_SCAN_WIDTH) + 0.5
      }));
    const hull = paperScanHull(hullPoints);
    if (hull.length < 3) continue;
    const edges = paperScanBoundary(component.pixels, component.id, grouped.labels);
    const traced = paperScanTraceContour(edges);
    let outline = traced || hull;
    if (traced && typeof simplify === "function") {
      outline = simplify(traced.concat([traced[0]]), 1.4);
      if (outline.length > 1 && Math.hypot(
        outline[0].x - outline[outline.length - 1].x,
        outline[0].y - outline[outline.length - 1].y
      ) < 2) outline.pop();
    }
    objectsFound.push({
      id: component.id,
      pixels: component.pixels,
      hull: outline,
      minX: component.minX,
      minY: component.minY,
      maxX: component.maxX,
      maxY: component.maxY,
      area: component.width * component.height
    });
  }
  return objectsFound;
}

window.capturePaperScanShapes = function () {
  try {
    return detectPaperScanObjects().map((object) => ({
      hull: object.hull.map((point) => ({
        x: point.x * canvas.width / PAPER_SCAN_WIDTH,
        y: point.y * canvas.height / PAPER_SCAN_HEIGHT
      })),
      area: object.area
    }));
  } catch (error) {
    console.error("Paper arsenal scan failed:", error);
    if (typeof showToast === "function") showToast("Paper arsenal scan failed. Check the webcam and try again.");
    return [];
  }
};

function updatePaperScan(nowMs) {
  if (!paperScanEnabled || nowMs - paperScanLastFrame < PAPER_SCAN_INTERVAL_MS) return;
  paperScanLastFrame = nowMs;
  try {
    paperScanObjects = detectPaperScanObjects();
  } catch (error) {
    console.error("Paper scan failed:", error);
    setPaperScanEnabled(false);
    if (typeof showToast === "function") showToast("Paper scan stopped: camera frame could not be read");
  }
}

function renderPaperScan(nowMs) {
  updatePaperScan(nowMs);
  if (!paperScanEnabled) return;
  const sx = canvas.width / PAPER_SCAN_WIDTH;
  const sy = canvas.height / PAPER_SCAN_HEIGHT;
  ctx.save();
  if (!paperScanRegion) {
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffb347";
    ctx.shadowColor = "#ffb347";
    ctx.shadowBlur = 5;
    ctx.strokeRect(
      PAPER_SCAN_WIDTH * 0.18 * sx,
      PAPER_SCAN_HEIGHT * 0.08 * sy,
      PAPER_SCAN_WIDTH * 0.64 * sx,
      PAPER_SCAN_HEIGHT * 0.84 * sy
    );
    ctx.setLineDash([]);
    if (paperScanSelection) {
      ctx.strokeStyle = "#38e8ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        paperScanSelection.minX * sx,
        paperScanSelection.minY * sy,
        (paperScanSelection.maxX - paperScanSelection.minX) * sx,
        (paperScanSelection.maxY - paperScanSelection.minY) * sy
      );
    }
    ctx.restore();
    if (typeof drawChip === "function") {
      drawChip("Show sheet or drag a box around it", Math.round(canvas.width / 2), 74, "#ffb347");
    }
    return;
  }
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 179, 71, 0.8)";
  ctx.strokeRect(
    paperScanRegion.minX * sx,
    paperScanRegion.minY * sy,
    paperScanRegion.width * sx,
    paperScanRegion.height * sy
  );
  ctx.setLineDash([]);
  ctx.strokeStyle = "#38e8ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#38e8ff";
  ctx.shadowBlur = 7;
  for (const object of paperScanObjects) {
    if (object.hull.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(object.hull[0].x * sx, object.hull[0].y * sy);
    for (let i = 1; i < object.hull.length; i++) {
      ctx.lineTo(object.hull[i].x * sx, object.hull[i].y * sy);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  if (paperScanObjects.length === 0 && typeof drawChip === "function") {
    drawChip("Sheet found - move drawings into view", Math.round(canvas.width / 2), 74, "#ffb347");
  }

  for (const [handId, session] of paperPickSessions) {
    if (!session.spawned) {
      const progress = Math.min(1, (nowMs - session.startedAt) / PAPER_SCAN_HOLD_MS);
      const center = paperScanCanvasPoint(session.object.hull[0]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = handId === 1 ? "#7dffb0" : "#38e8ff";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
}

function paperScanCanvasPoint(point) {
  return {
    x: point.x * canvas.width / PAPER_SCAN_WIDTH,
    y: point.y * canvas.height / PAPER_SCAN_HEIGHT
  };
}

function paperScanContains(object, point) {
  const x = point.x * PAPER_SCAN_WIDTH / canvas.width;
  const y = point.y * PAPER_SCAN_HEIGHT / canvas.height;
  let inside = false;
  for (let i = 0, j = object.hull.length - 1; i < object.hull.length; j = i++) {
    const a = object.hull[i], b = object.hull[j];
    if ((a.y > y) !== (b.y > y) &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (inside) return true;
  const margin = 3;
  return x >= object.minX - margin && x <= object.maxX + margin &&
    y >= object.minY - margin && y <= object.maxY + margin;
}

function beginPaperPick(handId, point, nowMs) {
  if (!paperScanEnabled || !point || paperPickSessions.has(handId)) return false;
  const candidates = paperScanObjects
    .filter((object) => paperScanContains(object, point))
    .sort((a, b) => a.area - b.area);
  if (candidates.length === 0) return false;
  paperPickSessions.set(handId, {
    object: candidates[0],
    startedAt: nowMs,
    startPoint: { x: point.x, y: point.y },
    spawned: false
  });
  return true;
}

function isPaperScanEnabled() {
  return paperScanEnabled;
}

function isPaperPickActive(handId) {
  return paperPickSessions.has(handId);
}

function updatePaperPick(handId, point, nowMs) {
  const session = paperPickSessions.get(handId);
  if (!session || session.spawned) return !!session;
  if (!paperScanEnabled || !point ||
      Math.hypot(point.x - session.startPoint.x, point.y - session.startPoint.y) > 24) {
    paperPickSessions.delete(handId);
    return false;
  }
  if (nowMs - session.startedAt >= PAPER_SCAN_HOLD_MS) {
    let outline = session.object.hull;
    if (typeof simplifyCapped === "function") outline = simplifyCapped(outline, 1.2, 80);
    const points = outline.map(paperScanCanvasPoint);
    if (points.length >= 3) {
      points.push({ x: points[0].x, y: points[0].y });
      commitStroke(points);
      session.spawned = true;
      if (typeof showToast === "function") showToast("Scanned drawing added");
    } else {
      paperPickSessions.delete(handId);
      return false;
    }
  }
  return true;
}

function endPaperPick(handId) {
  paperPickSessions.delete(handId);
}

function cancelPaperPick(handId) {
  paperPickSessions.delete(handId);
}
