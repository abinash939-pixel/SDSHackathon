# SDSHackathon
# Sketch2Sim

Sketch2Sim is a browser-based physics sandbox. Draw in front of your camera and the app turns your strokes into objects that move and collide in a Matter.js simulation. Hand tracking supports two hands; mouse controls are available as a fallback.

## Run locally

The project has no build step or package installation. It loads Matter.js, poly-decomp, and MediaPipe from public CDNs, so an internet connection is needed.

1. Open this folder in VS Code and serve it with an extension such as Live Server, or start a local server from the project directory:

	```powershell
	py -m http.server 8000
	```

2. Open [http://localhost:8000](http://localhost:8000) in a modern browser.
3. Allow camera access when prompted. Camera access requires `localhost` or HTTPS; opening `index.html` directly as a `file:` URL will not work for hand tracking.

The tracker tries GPU acceleration first and falls back to CPU. If camera access is unavailable, the mouse controls still let you draw and test the simulation.

## Using the app

### Draw and manipulate

- Pinch thumb and index finger, then move your hand to draw. Recognized strokes snap to shapes; other closed strokes become solid blobs and open strokes become lines or ramps.
- Hold a pinch steady over an object to grab and move it. Releasing it lets the object continue moving.
- Hold the unpinched cursor ring over an object to select it. Selected objects can be reversed, floated, cloned, or destroyed.
- Use the toolbar for gravity, line behavior, reverse, selection, float, clone, destroy, clear, hitbox/skeleton display, panel placement, reach, and help.
- Open Settings with the gear button to adjust settings and material, toggle sound/performance mode, and save, load, or redo a scene. Settings and the saved scene use this browser's local storage.

### Hand gestures

Hold each pose steady until its on-screen action label appears:

| Gesture | Action |
| --- | --- |
| Open palm | Pause/resume when nothing is selected; otherwise deselect all |
| Thumbs up/down | Float selected objects or turn gravity off/on when none are selected |
| Peace sign | Clone selected objects |
| Fist | Destroy selected objects |
| Shaka up/down | Select all / deselect all |
| Sideways open-hand swipe | Undo the last drawing, or erase a hovered/selected object |

### Mouse controls

- Click and drag on the canvas to draw.
- Shift-click an object to select or deselect it.
- Double-click the canvas to drop a test ball.
- Click the toolbar and edge tab to use the same controls as the hand interface.

### Recognized shapes

The shape classifier can identify circles, triangles, squares, rectangles, pentagons, hexagons, diamonds, stars, spirals, zigzags, and cups. They receive behaviors such as rolling, bouncing, gravity wells, springs, bumpers, and catcher bowls. Other closed loops become solid bodies; open strokes become falling lines or fixed ramps, depending on the line setting.

## Project files

| File | Responsibility |
| --- | --- |
| `index.html` | Page structure, external library loading, and application script order |
| `styles.css` | Layout and visual styling |
| `config.js` | Tunable tracking, drawing, physics, and gesture settings; shared state and icons |
| `geometry.js` | Stroke smoothing, geometric helpers, and shape recognition |
| `physics.js` | Matter.js world, object construction, collisions, and simulation updates |
| `tracking.js` | Camera and MediaPipe setup, hand gestures, and mouse fallback input |
| `ui.js` | Canvas rendering, toolbar/settings behavior, and scene save/load |

To adjust thresholds or gesture mappings, edit the corresponding values near the top of `config.js`. Keep the script order in `index.html`: the app loads configuration and geometry before physics, tracking, and UI.
