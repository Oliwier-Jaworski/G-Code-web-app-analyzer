import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

const DEFAULT_BEAD_WIDTH_MM = 0.4;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let extrusionLines = null;
let travelLines = null;
let layerLines = null;
let solidLines = null;
let solidMaterial = null;
let solidContour = null;
let canvas = null;
let resizeObs = null;
let currentView = "extrusion";
let extLayerOffsets = null;
let travLayerOffsets = null;
let layerCount = 0;

const init = (canvasEl) => {
  if (renderer) return;
  canvas = canvasEl;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  // Exponential fog matching the background colour: far parts of the solid
  // model fade toward the background, giving the otherwise flat silhouette
  // a clear depth cue. Density is set in updateFog() once we know the model
  // size; defaults to a no-op until then.
  scene.fog = new THREE.FogExp2(0x0f172a, 0);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Reference grid on the bed plane (XY).
  const grid = new THREE.GridHelper(220, 22, 0x334155, 0x1f2937);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(canvas);
  resize();

  const tick = () => {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();
};

const resize = () => {
  if (!renderer || !canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (solidMaterial) {
    // LineMaterial needs the renderer resolution to compute pixel-perfect
    // anti-aliased widths even when worldUnits is on.
    solidMaterial.resolution.set(w, h);
  }
};

const disposeObject = (obj) => {
  if (!obj) return;
  scene.remove(obj);
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
    else obj.material.dispose();
  }
};

const buildLineSegments = (coords, color, opacity = 1) => {
  if (!coords || coords.length === 0) return null;
  const positions = new Float32Array(coords);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
  const lines = new THREE.LineSegments(geo, mat);
  return lines;
};

const buildSolid = (coords, beadWidth) => {
  if (!coords || coords.length === 0) return null;
  const positions = new Float32Array(coords);

  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);

  // Single neutral off-white that reads well as a "printed object" silhouette
  // against the slate-900 background.
  const mat = new LineMaterial({
    color: 0xe2e8f0,
    worldUnits: true,
    linewidth: beadWidth,
    transparent: false,
  });
  // resolution is updated in resize(); seed it now so first frame is correct.
  if (canvas) {
    mat.resolution.set(canvas.clientWidth || 1, canvas.clientHeight || 1);
  }
  solidMaterial = mat;

  return new Line2(geo, mat);
};

const buildLayerColored = (coords) => {
  if (!coords || coords.length === 0) return null;
  const positions = new Float32Array(coords);
  const colors = new Float32Array(positions.length);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    const z = positions[i];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const range = Math.max(zMax - zMin, 1e-6);
  const c = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    const t = (z - zMin) / range;
    c.setHSL(0.66 - 0.66 * t, 0.85, 0.55);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true });
  return new THREE.LineSegments(geo, mat);
};

const frameCamera = (bounds) => {
  const cx = (bounds.x[0] + bounds.x[1]) / 2;
  const cy = (bounds.y[0] + bounds.y[1]) / 2;
  const cz = (bounds.z[0] + bounds.z[1]) / 2;
  const sx = bounds.x[1] - bounds.x[0];
  const sy = bounds.y[1] - bounds.y[0];
  const sz = bounds.z[1] - bounds.z[0];
  const span = Math.max(sx, sy, sz, 10);
  controls.target.set(cx, cy, cz);
  camera.position.set(cx + span * 1.4, cy - span * 1.6, cz + span * 1.2);
  camera.near = Math.max(span / 1000, 0.1);
  camera.far = span * 50;
  camera.updateProjectionMatrix();
  controls.update();
  // Remember the target fog density for the solid view; applyView() toggles
  // it on/off so other views stay unfogged.
  fogDensityForSolid = 0.7 / Math.max(span, 1);
};

let fogDensityForSolid = 0;

// Limit rendering to the first `n` layers. Segments arrive in file order,
// so "up to layer N" is a prefix of each buffer: drawRange for plain
// LineSegments (2 vertices per segment), instanceCount for Line2 (its
// LineSegmentsGeometry is instanced - one instance per segment).
const applyLayerLimit = (n) => {
  const extSegs =
    extLayerOffsets && n < extLayerOffsets.length
      ? extLayerOffsets[n]
      : Infinity;
  const travSegs =
    travLayerOffsets && n < travLayerOffsets.length
      ? travLayerOffsets[n]
      : Infinity;
  const extVerts = extSegs === Infinity ? Infinity : extSegs * 2;
  const travVerts = travSegs === Infinity ? Infinity : travSegs * 2;
  if (extrusionLines) extrusionLines.geometry.setDrawRange(0, extVerts);
  if (layerLines) layerLines.geometry.setDrawRange(0, extVerts);
  if (solidContour) solidContour.geometry.setDrawRange(0, extVerts);
  if (solidLines) solidLines.geometry.instanceCount = extSegs;
  if (travelLines) travelLines.geometry.setDrawRange(0, travVerts);
};

const applyView = (view) => {
  currentView = view;
  if (extrusionLines) {
    extrusionLines.visible =
      view === "all" || view === "extrusion";
    if (extrusionLines.material) {
      extrusionLines.material.opacity = view === "extrusion" ? 1 : 0.85;
      extrusionLines.material.transparent = view !== "extrusion";
    }
  }
  if (travelLines) {
    travelLines.visible = view === "all";
  }
  if (layerLines) {
    layerLines.visible = view === "layers";
  }
  if (solidLines) {
    solidLines.visible = view === "solid";
  }
  if (solidContour) {
    solidContour.visible = view === "solid";
  }
  if (scene && scene.fog) {
    scene.fog.density = view === "solid" ? fogDensityForSolid : 0;
  }
};

export const renderToolpath = (toolpath, bounds, opts = {}) => {
  if (!renderer) return;
  disposeObject(extrusionLines);
  disposeObject(travelLines);
  disposeObject(layerLines);
  disposeObject(solidLines);
  disposeObject(solidContour);
  solidMaterial = null;

  extrusionLines = buildLineSegments(toolpath.extrusion, 0x60a5fa, 1);
  travelLines = buildLineSegments(toolpath.travel, 0x94a3b8, 0.25);
  layerLines = buildLayerColored(toolpath.extrusion);
  const beadWidth = opts.beadWidthMm || DEFAULT_BEAD_WIDTH_MM;
  solidLines = buildSolid(toolpath.extrusion, beadWidth);
  // Thin dark "contour" overlay drawn on top of the solid bead — etches
  // every extrusion path into the silhouette, making layer build-up and
  // tight crevices readable. Uses the same 1px gl.LINES path so it costs
  // almost nothing.
  solidContour = buildLineSegments(toolpath.extrusion, 0x1e293b, 0.55);
  if (solidContour) {
    // Disable depth test so the contour lines accumulate through the solid
    // silhouette. Dark, semi-transparent strokes naturally darken regions
    // with high line density (crevices, internal walls, dense infill) —
    // giving an SSAO-like "shadow in tight spaces" effect for free.
    solidContour.renderOrder = 2;
    solidContour.material.depthTest = false;
    solidContour.material.depthWrite = false;
    solidContour.material.blending = THREE.NormalBlending;
  }
  if (extrusionLines) scene.add(extrusionLines);
  if (travelLines) scene.add(travelLines);
  if (layerLines) {
    layerLines.visible = false;
    scene.add(layerLines);
  }
  if (solidLines) {
    solidLines.visible = false;
    scene.add(solidLines);
  }
  if (solidContour) {
    solidContour.visible = false;
    scene.add(solidContour);
  }
  extLayerOffsets = toolpath.extrusionLayerOffsets || null;
  travLayerOffsets = toolpath.travelLayerOffsets || null;
  layerCount =
    toolpath.layers ||
    (extLayerOffsets ? extLayerOffsets.length - 1 : 0);

  if (bounds) frameCamera(bounds);
  applyView(currentView);
  applyLayerLimit(layerCount);
};

export const initViewer = (canvasEl) => init(canvasEl);
export const setView = (view) => applyView(view);
export const setLayerLimit = (n) => applyLayerLimit(n);
export const getLayerCount = () => layerCount;
