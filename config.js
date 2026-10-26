// ------------------------------------------------------------
// Settings you can tweak
// ------------------------------------------------------------
// Hand tracking and pinch
const PINCH_START = 0.28;      // pinch begins when thumb-index distance is below this fraction of hand size
const PINCH_STOP = 0.45;       // pinch ends when it goes above this fraction (bigger than start = no flicker)
const DEBOUNCE_FRAMES = 2;     // frames a pinch must hold before it counts
const MIN_POINT_GAP = 5.0;     // pixels the pen must move before a new point is added
const MIN_STROKE_POINTS = 6;   // shorter strokes are treated as false pinches and deleted
const MIN_STROKE_LENGTH = 40;  // pixels, strokes shorter than this are deleted
const DROPOUT_END_MS = 200;    // if the hand disappears this long during a stroke, end the stroke
const PREDICT_GAP_MS = 110;    // short tracking gap over which velocity prediction keeps the cursor smooth

// Stroke to physics
const SIMPLIFY_EPSILON = 4;    // pixels of error allowed when simplifying a closed shape
const PLATFORM_EPSILON = 6;    // pixels of error allowed when simplifying an open line
const MAX_VERTS = 32;          // max corners in a solid shape's hitbox
const MAX_SEGMENTS = 30;       // max straight pieces in a platform
const MIN_LOOP_LENGTH = 100;   // a stroke shorter than this can never be a closed shape
const CLOSE_RATIO = 0.25;      // closed if (gap between ends) < this fraction of the stroke length
const MIN_AREA = 900;          // square pixels, smaller loops become platforms instead
const PLATFORM_THICK = 12;     // thickness of platform hitboxes
const MAX_OBJECTS = 60;        // oldest object is removed when this is exceeded

// Shape classifier thresholds (Phase 2 Object Identifier)
const CIRCLE_CLOSE_RATIO = 0.32;  // forgiving end-gap ratio when testing for a circle
const CIRCLE_MIN_METRIC = 0.70;   // minimum 4*pi*area / perimeter^2 circularity
const CIRCLE_MAX_RAD_ERR = 0.22;  // maximum normalized radial standard deviation
const ZIGZAG_MIN_TURNS = 3;       // minimum alternating sharp corners to classify as a zigzag spring
const ZIGZAG_MIN_ANGLE = 0.65;    // radians (~37 deg) minimum turn angle at each zigzag peak
const LABEL_SHOW_MS = 3200;       // how long the identifier label stays visible on a new object

// Gesture bar (hold the pen over a button to press it)
const DWELL_MS = 700;          // how long to hold over a normal button
const DWELL_DANGER_MS = 1400;  // longer hold for Clear all, so you cannot wipe the screen by accident

// Reach: stretches hand movement so you do not have to lift your arm to the edges
const REACH_LEVELS = [1.0, 1.25, 1.5, 2.0]; // 1.0 = hand position matches the video exactly
const REACH_ANCHOR_Y = 0.55;   // vertical centre of the stretch (0 = top, 1 = bottom)

// Grab: pinch and hold still on an object, then move it
let GRAB_HOLD_MS = 700;        // hold still this long to pick the object up
const GRAB_MOVE_TOL = 22;      // pixels; moving more than this before the time is up means you are drawing instead
let GRAB_MASS_MULT = 40;       // the object you hold counts as this many times heavier, so it pushes other objects instead of being blocked by them
const GRAB_PICK_RADIUS = 16;   // pixels; how close the pen must be to an object (helps with thin lines)
const MERGE_PROXIMITY_PX = 80;
const MERGE_HOLD_MS = 650;
const DEMERGE_PULL_TOL = 45;
let MAX_THROW = 35;            // limit on the speed an object keeps when you let go
const RETURN_MS = 500;         // how long the Reverse animation takes
let SELECT_HOLD_MS = 800;      // hold the ring (not pinching) over an object this long to select or unselect it
const HOVER_TOL = 18;          // pixels the ring may wobble while holding
let SELECT_SETTLE_MS = 1500;   // after selecting, the open-palm "deselect all" is ignored this long, so your selection is not undone instantly

// Pose gestures (open palm, fist, thumbs, shaka, swipe)
const POSE_HOLD_MS = {
  "OPEN PALM": 600,
  "I LOVE YOU": 700,
  "FIST": 1000,
  "PEACE": 500,
  "THUMBS UP": 400,
  "THUMBS DOWN": 400,
  "SHAKA UP": 500,
  "SHAKA DOWN": 500
};
const PINCH_MAX_SPEED = 800;       // pixels per second: a pinch cannot START while the hand is sweeping faster than this (stops stray strokes)
const POSE_GRACE_MS = 150;         // a short tracking glitch does not reset the hold timer
const POSE_MOVE_TOL = 0.5;         // the hand may drift this fraction of its own size during a hold
const POSE_POST_PINCH_MS = 800;    // poses are ignored this long after a pinch ends
const FIST_INDEX_MAX = 0.9;        // index tip must be this close to the wrist (fraction of hand size) for a fist
const FIST_BLOCK_INDEX_MAX = 1.15; // while the hand is closing (other fingers curled and index tip this close), no pinch can start
const ACCIDENT_WINDOW_MS = 900;    // a fist within this time after a short stroke removes that stroke
const ACCIDENT_MAX_LEN = 150;      // only strokes shorter than this (pixels) count as accidents
const SWIPE_WINDOW_MS = 600;       // a swipe can take up to this long (the camera is slow, so be generous)
const SWIPE_MIN_FRACTION = 0.18;   // and must cover at least this fraction of the screen width
const SWIPE_MIN_HANDS = 1.5;       // or this many hand-sizes, whichever is larger
const SWIPE_COOLDOWN_MS = 800;

// What each pose does. Change the names on the right to remap:
// palm, pause, deselect, selectAll, destroyPose, clone, floatUp, fallDown, undo
const GESTURE_ACTIONS = {
  "OPEN PALM": "palm",
  "I LOVE YOU": "pause",
  "FIST": "destroyPose",
  "PEACE": "clone",
  "THUMBS UP": "floatUp",
  "THUMBS DOWN": "fallDown",
  "SHAKA UP": "selectAll",
  "SHAKA DOWN": "deselect"
};
const SWIPE_ACTION = "undo";
const TAB_HOLD_MS = 600;       // pinch and hold on the arrow tab this long to open or hide the panel

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
];

// ------------------------------------------------------------
// Icons (24 x 24 line drawings). The same paths are used on the page and on the video.
// ------------------------------------------------------------
const ICONS = {
  gravity:  { d: "M12 3v13 M6.5 11l5.5 5.5 5.5-5.5 M4 21h16" },
  lines:    { d: "M4 6l16 6 M12 16v5 M9.5 18.5l2.5 2.5 2.5-2.5" },
  reverse:  { d: "M3 12a9 9 0 1 0 3-6.7 M3 4v5h5" },
  deselect: { d: "M4 4h16v16h-16z M9 12h6", dash: "3 3" },
  float:    { d: "M12 21V8 M6.5 13.5l5.5-5.5 5.5 5.5 M7 3.5h10" },
  clone:    { d: "M8 8h12v12h-12z M4 16V4h12" },
  destroy:  { d: "M12 3v5 M12 16v5 M3 12h5 M16 12h5 M5.6 5.6l3.5 3.5 M14.9 14.9l3.5 3.5 M18.4 5.6l-3.5 3.5 M9.1 14.9l-3.5 3.5" },
  clear:    { d: "M4 7h16 M9 7v-3h6v3 M6 7l1 13h10l1-13" },
  hitbox:   { d: "M4 4h16v16h-16z M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", dash: "3 3" },
  skeleton: { d: "M12 21v-8 M12 13l-7-3 M12 13l-3-9 M12 13l2-10 M12 13l5-8 M12 13l7 2" },
  panel:    { d: "M4 5h16v14h-16z M14 5v14" },
  side:     { d: "M7 8l-4 4 4 4 M17 8l4 4-4 4 M3 12h18" },
  reach:    { d: "M4 14v6h6 M20 10v-6h-6 M4 20l7-7 M20 4l-7 7" },
  help:     { d: "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7 M12 17.2v.1" },
  mic:      { d: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3 M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8" },
  micOff:   { d: "M9 9v2a3 3 0 0 0 5.1 2.1 M15 9V5a3 3 0 0 0-5.8-1 M19 10v1a7 7 0 0 1-11.6 5.3 M12 18v4 M8 22h8 M3 3l18 18" }
};

// ------------------------------------------------------------
// Page elements
// ------------------------------------------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clearBtn");
const gravityBtn = document.getElementById("gravityBtn");
const linesBtn = document.getElementById("linesBtn");
const barBtn = document.getElementById("barBtn");
const reverseBtn = document.getElementById("reverseBtn");
const reachBtn = document.getElementById("reachBtn");
const deselectBtn = document.getElementById("deselectBtn");
const floatBtn = document.getElementById("floatBtn");
const cloneBtn = document.getElementById("cloneBtn");
const destroyBtn = document.getElementById("destroyBtn");
const dockBtn = document.getElementById("dockBtn");
const helpBtn = document.getElementById("helpBtn");
const helpPanel = document.getElementById("helpPanel");
const hitboxBtn = document.getElementById("hitboxBtn");
const skeletonBtn = document.getElementById("skeletonBtn");

let dockRight = true;        // gesture dock on the right edge (false = left edge)
let reachIdx = 2;            // index into REACH_LEVELS (starts at 1.5x)
let showBar = false;         // button dock hidden at start (open it with the arrow tab)
let linesFall = true;        // true: open lines fall with gravity, false: open lines stay fixed as platforms
let showSkeleton = true;
let showHitboxes = false;
let gravityOn = true;
let showLabels = true;
let drawingColor = "#5dffa8";

function isValidDrawingColor(color) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
}

// ------------------------------------------------------------
// State (Hand 1 + Independent Hand 2 + Shared World State)
// ------------------------------------------------------------
let landmarker = null;
let lastVideoTime = -1;
let handVisible = false;
let lastSeenMs = 0;
let pinching = false;
let drawModeOn = false;
let onCount = 0;
let offCount = 0;
let pending = [];
let current = null;       // Hand 1 stroke being drawn right now
let mouseCurrent = null;  // mouse stroke being drawn right now
let lastRatio = 0;
let pen = null;           // Hand 1 smoothed pen position {x, y}
let penVel = { vx: 0, vy: 0 };
let skeletonPts = null;   // Hand 1 landmarks in canvas pixels (for the debug skeleton)
let realPen = null;       // Hand 1 real fingertip midpoint (before Reach stretching)
let penVis = null;        // Hand 1 eased copy of the pen, for a smooth on-screen cursor and trail
var handAng = null;       // Hand 1 wrist-to-middle-knuckle angle

// Independent Hand 2 state (full parity with Hand 1 for simultaneous multitasking)
var h2 = {
  visible: false,
  seen: 0,
  pen: null,
  vis: null,
  realPen: null,
  skeletonPts: null,
  penVel: { vx: 0, vy: 0 },
  penSpeed: 0,
  prevPenPos: null,
  prevPenT: 0,
  ang: null,
  lastRatio: 0,
  pinch: false,
  pinching: false,
  on: 0,
  off: 0,
  pending: [],
  current: null,
  grabCandidate: null,
  grab: null,
  tabHold: null,
  hoverObj: null,
  hoverStartMs: 0,
  hoverStartPos: null,
  hoverLock: null,
  candPose: null,
  candStartMs: 0,
  candFired: false,
  candWrist: null,
  lastPoseMs: 0,
  poseBlockUntil: 0,
  swipeCooldownUntil: 0,
  wristHist: [],
  swipeProgress: 0,
  lastStrokeObj: null,
  lastStrokeAt: 0
};

var matIdx = 0, soundOn = true, perfMode = false, redoStack = [];
var links = [];                                     // spring / rope / hinge links
var pushFrozen = true;
var linkType = "Spring";
var rotateOn = true, rotGain = 1;                   // hand rotation -> held object rotation
var _hadHand = false, handLosses = [];              // for the lighting / tracking hint

let lastRenderMs = performance.now();
let lastStatusMs = 0;
let fps = 0;              // screen frames per second (updated twice a second)
let fpsFrames = 0;
let fpsStart = performance.now();
let trackMs = 0;          // average time one hand-tracking pass takes
const useVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

let cancelled = 0;
let lastInfo = "none yet";

// Grab, selection, and pose state (Hand 1)
let grabCandidate = null;  // pinching on an object, waiting to see if you hold still
let grabbed = null;        // object currently held by Hand 1
let lastMoved = null;      // last object you picked up and moved (Reverse uses it when nothing is selected)
let returns = [];          // Reverse animations that are running

let hoverObj = null;       // object Hand 1 ring is holding over (not pinching)
let hoverStartMs = 0;
let hoverStartPos = null;
let hoverLock = null;      // just toggled: move away before it can toggle again
let lastSelectMs = 0;      // when an object was last selected (used for the settle delay)

let pausedWorld = false;
let candPose = null;
let candStartMs = 0;
let candFired = false;
let candWrist = null;
let lastPoseMs = 0;
let poseBlockUntil = 0;
let swipeCooldownUntil = 0;
let wristHist = [];
let swipeProgress = 0;
let lastStrokeObj = null;   // the newest drawing from Hand 1, kept for a moment in case it was an accident
let lastStrokeAt = 0;
let penSpeed = 0;           // how fast Hand 1 pen is moving (pixels per second)
let prevPenPos = null;
let prevPenT = 0;
let toast = { text: "", until: 0 };

let dwellTarget = null;    // button a hand is currently holding over
let dwellStart = 0;        // when the hold started
let dwellLock = null;      // button just pressed: leave it before it can press again
let flashButton = null;
let flashUntil = 0;
let tabHold = null;        // { startMs, done } while Hand 1 pinches on the tab

const MATERIALS = [
  { n: "Normal", o: {} },
  { n: "Bouncy", o: { restitution: 0.9, friction: 0.2 } },
  { n: "Heavy", o: { density: 0.006, restitution: 0.1 } },
  { n: "Icy", o: { friction: 0.01, frictionAir: 0.002 } },
  { n: "Sticky", o: { friction: 1, restitution: 0.05 } }
];

const SETTINGS = [
  ["Select hold (ms)", 300, 2000, 50, () => SELECT_HOLD_MS, (v) => { SELECT_HOLD_MS = v; }],
  ["Deselect delay after select (ms)", 0, 4000, 100, () => SELECT_SETTLE_MS, (v) => { SELECT_SETTLE_MS = v; }],
  ["Grab hold (ms)", 300, 1500, 50, () => GRAB_HOLD_MS, (v) => { GRAB_HOLD_MS = v; }],
  ["Held object weight x", 1, 100, 1, () => GRAB_MASS_MULT, (v) => { GRAB_MASS_MULT = v; }],
  ["Max throw speed", 10, 80, 1, () => MAX_THROW, (v) => { MAX_THROW = v; }]
];