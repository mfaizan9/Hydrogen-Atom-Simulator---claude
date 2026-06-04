"use strict";
/* ============================================================================
 * Hydrogen Atom Simulator  -  HTML5 replica of hydrogenAtom033.swf  (NAAP)
 *
 * Faithful port of the original ActionScript-1 prototype classes:
 *   The Simulator, Atom Diagram, Energy Bar, Energy Scale Component,
 *   Log Component / Generic Entry, Streaming Photons Component, Title Bar,
 *   Dialog Window v2, Scientific Notation Number, plus the drawArc/toFixed helpers.
 *
 * The whole movie is code-drawn vector art, so the entire stage (950x640) is
 * reproduced on a single 2D canvas, recreating the AS beginFill/lineTo/drawArc calls
 * with identical coordinates, colors, and alpha.  Native-widget behavior (buttons,
 * slider, scrollbar, dialogs) is reproduced by hit-testing on the same canvas.
 *
 * Timing: getTimer() -> performance.now()-relative ms; all original ms constants kept.
 * Animation: onEnterFrame handlers -> a single requestAnimationFrame loop ("tickers").
 * ========================================================================== */

const DEBUG = false;
const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");

/* ---- getTimer() : ms since load (matches Flash getTimer semantics) ---------- */
const _t0 = performance.now();
function getTimer() { return performance.now() - _t0; }

/* ---- AS Number.prototype.toFixed polyfill (verbatim behavior) --------------- */
function toFixed(x, f) {
  if (f < 0 || f > 20) return "Range Error";
  if (isNaN(x)) return "NaN";
  let s = "";
  if (x < 0) { s = "-"; x = -x; }
  let m = "";
  if (x < 1e21) {
    const n = Math.round(x * Math.pow(10, f));
    m = (n === 0) ? "0" : n.toString();
    if (f > 0) {
      let k = m.length;
      if (k <= f) {
        let z = "";
        for (let i = 0; i < f + 1 - k; i++) z += "0";
        m = z + m; k = f + 1;
      }
      const a = m.substr(0, k - f);
      const b = m.substr(k - f);
      m = a + "." + b;
    }
  } else {
    m = x.toString();
  }
  return s + m;
}

/* ============================================================================
 * GEOMETRY (stage coordinates, derived verbatim from the SWF PlaceObject matrices)
 * The Simulator is placed at (0,30); Title Bar at (0,0).
 * ========================================================================== */
const STAGE_W = 950, STAGE_H = 640;
const SIM_Y = 30;                       // The Simulator y-offset
const TITLE_H = 30;

// --- Atom Diagram --- placed at sim-local (7.1,132) -> stage origin (proton/center)
const AD = {
  ox: 7.1, cy: 132 + SIM_Y,             // proton/orbit-center on stage = (7.1, 162)
  width: 769, halfHeight: 125,
  // black background shape (char193) bounds x[-0.1,768.9] y[-125,125]
  boxL: 7.1 - 0.1, boxT: 132 + SIM_Y - 125, boxW: 769, boxH: 250,
  occupiedOrbitAlpha: 80, unoccupiedOrbitAlpha: 30,
  levelPositions: [22, 78, 175, 310, 486, 700],
  transitionProgressDotSpacing: 12,
  photonSpeed: 500,
  transitionTime: 1500,
  ionizationAngleSpread: 2.6,
  ionizationSpeedRate: 0.05,
  minIonizationSpeed: 0.1,
  recombinationSpeed: 0.15,
  // ionized symbol (char192) at diagram-local (737.2,-100.5)
  ionizedX: 7.1 + 737.2, ionizedY: 162 - 100.5
};
AD.orbitAlphaRange = AD.occupiedOrbitAlpha - AD.unoccupiedOrbitAlpha;
AD.nullAnimationTime = 1000 * AD.width / AD.photonSpeed;   // 1538 ms

// --- Energy Bar (Photon Selection) --- placed at sim-local (45,524.1) -> (45,554.1)
const EB = {
  ox: 45, oy: 524.1 + SIM_Y,            // local origin on stage = (45, 554.1)
  maxSnapLevel: 3, maxLevel: 6,
  barWidth: 584, snapDistance: 3, maxSnapLevelPx: 3,
  // axis vertical positions on stage (red readout tick centers): freq/wave/energy
  freqTickY: 554.1 - 201, waveTickY: 554.1 - 137, energyTickY: 554.1 - 72,
  freqNameY: 554.1 - 235.2, waveNameY: 554.1 - 170.1, energyNameY: 554.1 - 105,
  freqReadoutY: 554.1 - 206.9, waveReadoutY: 554.1 - 151.8, energyReadoutY: 554.1 - 86.8,
  freqValueY: 554.1 - 191.2 + 12, waveValueY: 554.1 - 126.2 + 12, energyValueY: 554.1 - 61.1 + 12,
  regionY: 554.1 - 37.3,
  sliderY: 554.1,
  autoDelay: 500, autoSpeed: 0.02
};
EB.scale = EB.barWidth / 15;            // 38.9333 px per eV
// The three bordered axis boxes (shape char215, white fill + #cccccc border),
// in Energy Bar local coords -> converted to stage. Verbatim from the SWF shape.
EB.boxes = {
  freq:  { x: EB.ox - 31, y: EB.oy - 220, w: 648, h: 45 },   // stage y[334,379]
  wave:  { x: EB.ox - 31, y: EB.oy - 155, w: 648, h: 45 },   // stage y[399,444]
  energy:{ x: EB.ox - 31, y: EB.oy - 90,  w: 648, h: 45 }    // stage y[464,509]
};
// Tick rows (shape chars 230/219/225), x offsets in EB-local; long ticks (labeled values).
EB.freqTicks  = [16.1, 161.0, 322.1, 483.1];                 // 1e14,1e15,2e15,3e15 Hz
EB.waveTicks  = [4.8, 48.3, 96.6, 241.4, 482.7];             // 10µm,1µm,500nm,200nm,100nm
EB.energyTicks = [];                                          // every 1 eV (0..15)
for (let i = 0; i <= 15; i++) EB.energyTicks.push(EB.scale * i);
EB.energyLongTicks = [0, 5*EB.scale, 10*EB.scale, 15*EB.scale];

// --- Energy Scale (Energy Level Diagram) --- component origin sim(863,243.6)->(863,273.6)
const ES = {
  ox: 863, oy: 243.6 + SIM_Y,           // level-1 baseline (e=13.6) at stage (863,273.6)
  maxLevel: 20, ionizationHeight: 175, highestLevelHeight: 150,
  panelL: 783, panelR: 943, panelT: 37, panelB: 287
};
ES.yScale = -ES.highestLevelHeight / 13.6;

// --- Event Log --- Log Component at sim(665.9,242)->(665.9,272); content area (char178)
const LOG = {
  ox: 665.9, oy: 242 + SIM_Y,
  areaX: 18.1, areaY: 59, areaWidth: 234, areaHeight: 245,   // 7*35
  entryHeight: 35, numVisible: 7,
  // panel (Panel Background "Event Log") rectangle on stage.  Right edge aligns with
  // the Energy Level Diagram panel above it (both at the stage's right margin).
  panelL: 676, panelT: 264.1 + SIM_Y, panelR: 943, panelB: 628
};
LOG.contentL = LOG.ox + LOG.areaX;       // 684
LOG.contentT = LOG.oy + LOG.areaY;       // 331
LOG.scrollbarX = 922;                    // scrollbar at the panel's right edge

// --- Photon Selection panel rectangle ---
const PS_PANEL = { L: 7, T: 264.1 + SIM_Y, R: 668, B: 628 };

// Colors (decimal RGB from AS) -> css
function rgb(n){ return "#" + (n & 0xffffff).toString(16).padStart(6, "0"); }
const C = {
  panelBg: rgb(16448250),    // #FAFAFA
  panelBorder: rgb(6710886), // #666666
  panelTitle: rgb(3355443),  // #333333
  panelBar: rgb(13421772),   // #CCCCCC
  white: "#ffffff",
  red: "#cc0000",
  black: "#000000",
  gray666: "#666666"
};

/* ============================================================================
 * Greek-subscript mapping.  The source labels Lyman/Balmer/Paschen lines with a
 * WordPerfect-Greek font where the ASCII chars below render as Greek letters.
 * We map them to Unicode Greek so the on-screen text is identical (Lα, Lβ, ...).
 * ========================================================================== */
const GREEK = { '"': "α", "$": "β", "(": "γ", "*": "δ", "g": "ε" };
function greekSub(ch){ return GREEK[ch] || ch; }

/* transitionsTable (Generic Entry) - letter + raw subscript char (verbatim) ----- */
const transitionsTable = [
  {letter:"L",subscript:'"'},{letter:"L",subscript:"$"},{letter:"L",subscript:"("},
  {letter:"L",subscript:"*"},{letter:"L",subscript:"g"},{letter:"H",subscript:'"'},
  {letter:"H",subscript:"$"},{letter:"H",subscript:"("},{letter:"H",subscript:"*"},
  {letter:"P",subscript:'"'},{letter:"P",subscript:"$"},{letter:"P",subscript:"("}
];

/* ============================================================================
 * STREAMING PHOTONS COMPONENT  (squiggly photon wave that streams along a path)
 * ========================================================================== */
class StreamingPhotons {
  constructor() {
    this._photonList = [];
    this._timeLast = getTimer();
    this._speed = 500 / 1000;            // setSpeed(500)
  }
  setSpeed(arg){ this._speed = arg / 1000; }
  // addPhoton: start->end, style{thickness,color}, def{wavelength,amplitude}
  addPhoton(startPoint, endPoint, style, definition) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const angle = Math.atan2(dy, dx);
    this._photonList.push({
      startX: startPoint.x, startY: startPoint.y,
      lastX: startPoint.x, lastY: startPoint.y,
      pos: 0, length: Math.sqrt(dx*dx + dy*dy),
      freq: (2*Math.PI) / definition.wavelength,
      amp: definition.amplitude,
      color: style.color, thickness: style.thickness,
      cos: Math.cos(angle), sin: Math.sin(angle)
    });
  }
  // advance photon positions (called each frame). Drawing is done in draw().
  // Speed matches AS: dpos = speed*(dt); the squiggle "head" advances along the path.
  tick() {
    const timeNow = getTimer();
    const dpos = this._speed * (timeNow - this._timeLast);
    const list = this._photonList;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.pos += dpos;
      if (p.pos >= p.length) { p.pos = p.length; list.splice(i, 1); }
    }
    this._timeLast = timeNow;
  }
  // Render the streaming photon: a wavy packet of fixed length (the original's 10
  // cycling segment-clips at 30 fps = ~167 px) that travels along the path with its
  // tail fading to transparent.  This reproduces the AS "streaming" look exactly.
  draw(g, offX, offY) {
    const TRAIL = StreamingPhotons.TRAIL_LEN;
    const list = this._photonList;
    g.lineCap = "round";
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const head = p.pos;
      const tail = Math.max(0, head - TRAIL);
      const span = head - tail;
      if (span <= 0) continue;
      const steps = Math.max(2, Math.ceil(span / 1.2));
      g.lineWidth = p.thickness;
      g.strokeStyle = rgb(p.color);
      let prevX, prevY, have = false;
      for (let k = 0; k <= steps; k++) {
        const x_ = tail + span * (k / steps);
        const y_ = p.amp * Math.sin(x_ * p.freq);
        const X = p.startX + x_ * p.cos - y_ * p.sin + offX;
        const Y = p.startY + x_ * p.sin + y_ * p.cos + offY;
        if (have) {
          // alpha increases toward the head (tail fades to 0), matching the segment fade
          g.globalAlpha = (x_ - tail) / span;
          g.beginPath(); g.moveTo(prevX, prevY); g.lineTo(X, Y); g.stroke();
        }
        prevX = X; prevY = Y; have = true;
      }
    }
    g.globalAlpha = 1;
  }
}
// 10 cycling segments x (speed 0.5 px/ms) x (1000/30 ms per frame) = ~167 px trail.
StreamingPhotons.TRAIL_LEN = 10 * 0.5 * (1000 / 30);

/* getPhotonStyleFromWavelength (Atom Diagram) - photon color by wavelength (nm) -- */
function getPhotonStyleFromWavelength(wavelength) {
  const dw = (wavelength - 380) / 340;
  let color;
  if (dw < 0) color = 9044223;           // UV  (#8a07ff)
  else if (dw > 1) color = 16711738;     // IR  (#ff003a)
  else {
    const spectrum = [
      [0,138,0,255],[0.24313725490196078,90,27,255],[0.28627450980392155,16,151,223],
      [0.4196078431372549,0,255,192],[0.5058823529411764,36,255,0],
      [0.5529411764705883,233,236,0],[0.6823529411764706,255,23,0],[1,255,0,58]
    ];
    let k = 0;
    while (dw > spectrum[++k][0]) {}
    const frac = (dw - spectrum[k-1][0]) / (spectrum[k][0] - spectrum[k-1][0]);
    const r = frac*(spectrum[k][1]-spectrum[k-1][1]) + spectrum[k-1][1];
    const gg = frac*(spectrum[k][2]-spectrum[k-1][2]) + spectrum[k-1][2];
    const b = frac*(spectrum[k][3]-spectrum[k-1][3]) + spectrum[k-1][3];
    color = (r<<16) | (gg<<8) | b;
  }
  return { thickness: 2, color: color };
}

/* ============================================================================
 * ATOM DIAGRAM
 * ========================================================================== */
class AtomDiagram {
  constructor(sim) {
    this.sim = sim;
    this.electronLevel = 1;
    this.levelPositions = AD.levelPositions;
    // orbit alpha state (0..100) per orbit (index 0 == level 1)
    this.orbitAlpha = [AD.occupiedOrbitAlpha, AD.unoccupiedOrbitAlpha, AD.unoccupiedOrbitAlpha,
                       AD.unoccupiedOrbitAlpha, AD.unoccupiedOrbitAlpha, AD.unoccupiedOrbitAlpha];
    // electron1 (real) and electron2 (ghost) in diagram-local coords (origin at proton)
    this.e1 = { x: AD.levelPositions[0], y: 0, alpha: 100 };
    this.e2 = { x: 0, y: 0, alpha: 0 };
    this.ionizedVisible = false;
    this.photons = new StreamingPhotons();
    this.onEnterFrame = null;
    // transition progress dots
    this.transitionProgressVisible = false;
    this.transitionProgressX = 0;
    this.transitionProgressAlpha = 100;
    this.transitionProgressMaskX0 = 0; this.transitionProgressMaskX1 = 0;
  }
  get animationIsInProgress() { return this.onEnterFrame != null; }

  setOrbitAlpha(level, a) { if (isFinite(level) && level>=1 && level<=6) this.orbitAlpha[level-1] = a; }

  // ---- electron drag support ----
  draggingStart() {
    this.onEnterFrame = null;
    this.transitionProgressVisible = false;
    this.e1.alpha = 40; this.e1.y = 0;
    this.e2.alpha = 100; this.e2.x = this.e1.x; this.e2.y = 0;
  }
  draggingEnd() { this.e1.alpha = 100; this.e2.alpha = 0; }

  // ---- transition animation (electron + progress dots crossfade) ----
  startElectronTransition(newLevel) {
    const oldLevel = this.electronLevel;
    const xOld = this.levelPositions[oldLevel - 1];
    const xNew = this.levelPositions[newLevel - 1];
    this.transitionProgressMaskX0 = xOld;
    this.transitionProgressMaskX1 = xNew;
    this.transitionProgressVisible = true;
    this.transitionProgressAlpha = 100;
    this.oldLevel = oldLevel; this.newLevel = newLevel;
    if (isFinite(oldLevel)) this.orbitAlpha[oldLevel-1] = AD.occupiedOrbitAlpha;
    if (isFinite(newLevel)) this.orbitAlpha[newLevel-1] = AD.unoccupiedOrbitAlpha;
    this.e1.x = xNew; this.e1.y = 0; this.e1.alpha = 0;
    this.e2.x = xOld; this.e2.y = 0; this.e2.alpha = 100;
    if (newLevel < oldLevel) {
      this.transitionDirection = -1; this.transitionOffset = AD.width;
      this.transitionProgressX = AD.width; this.transitionProgressXScale = -1;
    } else {
      this.transitionDirection = 1; this.transitionOffset = 0;
      this.transitionProgressX = 0; this.transitionProgressXScale = 1;
    }
    this.transitionStart = getTimer();
    this.onEnterFrame = this.transitionTick;
    this.electronLevel = newLevel;
  }
  transitionTick() {
    const dt = getTimer() - this.transitionStart;
    const u = dt / AD.transitionTime;
    if (u > 1) {
      this.transitionProgressVisible = false;
      this.e1.alpha = 100; this.e2.alpha = 0;
      if (isFinite(this.newLevel)) this.orbitAlpha[this.newLevel-1] = AD.occupiedOrbitAlpha;
      if (isFinite(this.oldLevel)) this.orbitAlpha[this.oldLevel-1] = AD.unoccupiedOrbitAlpha;
      this.onEnterFrame = null;
      this.sim.onAnimationFinished();
    } else {
      this.transitionProgressX = this.transitionOffset + this.transitionDirection *
        ((dt * 0.03) % AD.transitionProgressDotSpacing);
      this.e1.alpha = u * 100;
      this.e2.alpha = 100 - this.e1.alpha;
      const dA = u * AD.orbitAlphaRange;
      if (isFinite(this.newLevel)) this.orbitAlpha[this.newLevel-1] = AD.unoccupiedOrbitAlpha + dA;
      if (isFinite(this.oldLevel)) this.orbitAlpha[this.oldLevel-1] = AD.occupiedOrbitAlpha - dA;
      this.transitionProgressAlpha = (u < 0.5) ? 100 : (100 - 200 * (u - 0.5));
    }
  }

  // ---- deexcitation: emit a photon (up-right at 45deg) and transition down ----
  deexciteAtom(energy, newLevel) {
    const mx = this.levelPositions[newLevel-1] +
      (this.levelPositions[this.electronLevel-1] - this.levelPositions[newLevel-1]) / 2;
    const photonStyle = getPhotonStyleFromWavelength(1240 / energy);
    const dx = AD.width / 0.5253219888177297;
    this.photons.addPhoton({x:mx,y:0}, {x:mx+dx,y:-dx}, photonStyle, {wavelength:124/energy, amplitude:8});
    this.sim.onDeexcitation(energy, this.electronLevel, newLevel);
    this.startElectronTransition(newLevel);
  }

  // ---- recombination: electron flies in from outside and is recaptured ----
  recaptureElectron(newLevel) {
    let angle = AD.ionizationAngleSpread * (Math.random() - 0.5);
    const d = 5 + 14 + AD.halfHeight / Math.cos(angle);   // electron width ~14
    if (Math.random() > 0.5) angle += Math.PI/2; else angle -= Math.PI/2;
    this.electronEndX = this.levelPositions[newLevel-1];
    this.electronEndOrbit = newLevel;
    this.electronStartX = this.electronEndX + d * Math.cos(angle);
    this.electronStartY = d * Math.sin(angle);
    this.e1.x = this.electronStartX; this.e1.y = this.electronStartY; this.e1.alpha = 100;
    this.electronAngle = angle + Math.PI;
    this.electronPathLength = d;
    this.electronLevel = newLevel;
    this.recombinationTime = d / AD.recombinationSpeed;
    this.recombinationStart = getTimer();
    this.onEnterFrame = this.recombinationTick;
  }
  recombinationTick() {
    const dt = getTimer() - this.recombinationStart;
    const u = dt / this.recombinationTime;
    if (u > 1) {
      this.e1.x = this.electronEndX; this.e1.y = 0;
      this.orbitAlpha[this.electronEndOrbit-1] = AD.occupiedOrbitAlpha;
      this.ionizedVisible = false;
      this.onEnterFrame = null;
      this.sim.onAnimationFinished();
      this.sim.onRecombination(this.electronLevel);
    } else {
      this.e1.x = this.electronStartX + u * this.electronPathLength * Math.cos(this.electronAngle);
      this.e1.y = this.electronStartY + u * this.electronPathLength * Math.sin(this.electronAngle);
    }
  }

  // ---- ionization: electron flies out of the masked region ----
  ionizeAtom(extraEnergy) {
    const oldLevel = this.electronLevel;
    this.orbitAlpha[this.electronLevel-1] = AD.unoccupiedOrbitAlpha;
    this.ionizedVisible = true;
    this.electronLevel = Infinity;
    this.electronStartX = this.e1.x; this.electronStartY = this.e1.y;
    this.electronSpeed = AD.minIonizationSpeed + AD.photonSpeed/1000 * Math.sqrt(extraEnergy/15);
    this.electronAngle = AD.ionizationAngleSpread * (Math.random() - 0.5);
    if (Math.random() > 0.5) this.electronAngle += Math.PI/2; else this.electronAngle -= Math.PI/2;
    this.ionizationStartTime = getTimer();
    this.onEnterFrame = this.ionizationTick;
    this.sim.onIonization(this.photonEnergy, oldLevel);
  }
  ionizationTick() {
    const d = (getTimer() - this.ionizationStartTime) * this.electronSpeed;
    this.e1.x = this.electronStartX + d * Math.cos(this.electronAngle);
    this.e1.y = this.electronStartY + d * Math.sin(this.electronAngle);
    // hitTest against masked region [0,width]x[-halfHeight,halfHeight]
    const inside = this.e1.x >= 0 && this.e1.x <= AD.width &&
                   this.e1.y >= -AD.halfHeight && this.e1.y <= AD.halfHeight;
    if (!inside) { this.onEnterFrame = null; this.sim.onAnimationFinished(); }
  }

  // ---- no-absorption: photon passes through ----
  noAbsorptionTick() {
    if (getTimer() > this.noAbsorptionTime) {
      this.onEnterFrame = null;
      this.sim.onAnimationFinished();
      this.sim.onNoAbsorption(this.photonEnergy);
    }
  }
  absorptionTick() {
    if (getTimer() > this.absorptionTime) {
      this.onEnterFrame = null;
      if (isFinite(this.newElectronLevel)) {
        this.sim.onExcitation(this.photonEnergy, this.electronLevel, this.newElectronLevel);
        this.startElectronTransition(this.newElectronLevel);
      } else if (this.newElectronLevel === Infinity) {
        this.ionizeAtom(this.extraEnergy);
      }
    }
  }

  // ---- fire a photon at the atom ----
  firePhoton(energy, newLevel, extraEnergy) {
    this.photonEnergy = energy;
    let xEnd;
    if (newLevel != null) {
      xEnd = this.levelPositions[this.electronLevel - 1];
      this.absorptionTime = getTimer() + 1000 * (AD.width - xEnd) / AD.photonSpeed;
      this.newElectronLevel = newLevel;
      this.extraEnergy = extraEnergy;
      this.onEnterFrame = this.absorptionTick;
    } else {
      xEnd = 0;
      this.noAbsorptionTime = getTimer() + AD.nullAnimationTime;
      this.onEnterFrame = this.noAbsorptionTick;
    }
    const photonStyle = getPhotonStyleFromWavelength(1240 / energy);
    this.photons.addPhoton({x:AD.width,y:0}, {x:xEnd,y:0}, photonStyle, {wavelength:124/energy, amplitude:8});
  }

  tick() {
    if (this.onEnterFrame) this.onEnterFrame.call(this);
    this.photons.tick();
  }
}

/* ============================================================================
 * ENERGY SCALE COMPONENT  (right "Energy Level Diagram" panel)
 * ========================================================================== */
class EnergyScale {
  constructor() {
    this.level = 1;                       // 1..20 or Infinity (ionized)
    this.markers = [];
    for (let i = 1; i <= ES.maxLevel; i++) {
      const e = 13.6 / (i*i);
      this.markers.push({
        level: i,
        y: ES.oy + ES.yScale * (13.6 - e),
        levelString: "level " + i,
        energyString: "-" + toFixed(e, 1) + " eV"
      });
    }
    this.ionizedY = ES.oy - ES.ionizationHeight;
  }
  setLevel(level) { this.level = level; }
}

/* ============================================================================
 * SCIENTIFIC NOTATION formatter (frequency readout)  -> {coefficient, exponent}
 * ========================================================================== */
function sciNotation(num, sigFigs) {
  const digs = sigFigs;
  const result = {};
  if (num === 0) {
    let cstr = "0";
    const extra = digs - 1;
    if (extra !== 0) { cstr += "."; for (let i=0;i<extra;i++) cstr += "0"; }
    return { coefficient: cstr, exponent: "0" };
  }
  let coeff = "";
  if (num < 0) { coeff = "-"; num = Math.abs(num); }
  let expo = Math.floor(Math.log(num) / 2.302585092994046);
  const expoFact = Math.pow(10, -expo);
  const fact = Math.pow(10, digs - 1);
  let num2 = Math.round(fact * expoFact * num) / fact;
  if (num2 >= 10) { num2 /= 10; expo++; }
  let cstr = String(num2);
  const dot = cstr.indexOf(".");
  let addDot = (dot === -1);
  let sigfigs = 0;
  for (let i = 0; i < cstr.length; i++) {
    const code = cstr.charCodeAt(i);
    if (code > 47 && code < 58) sigfigs++;
  }
  const numZeros = digs - sigfigs;
  if (numZeros > 0 && addDot) cstr += ".";
  for (let i = 0; i < numZeros; i++) cstr += "0";
  coeff += cstr;
  return { coefficient: coeff, exponent: String(expo) };
}

/* ============================================================================
 * ENERGY BAR  (the frequency/wavelength/energy slider + preset buttons)
 * ========================================================================== */
// snapPointsList: transitions n1<=maxSnapLevel(3), n2<=maxLevel(6)  (E = 13.6*(1/n1^2-1/n2^2))
function buildSnapPoints() {
  const sPL = [];
  for (let i = 1; i <= EB.maxSnapLevel; i++)
    for (let j = i + 1; j <= EB.maxLevel; j++) {
      const e = 13.6 * (1/(i*i) - 1/(j*j));
      sPL.push({ x: EB.scale * e, e: e, n1: i, n2: j });
    }
  return sPL;
}
// init() faint tick marks: n1<=3, n2<=20
function buildFaintTicks() {
  const t = [];
  for (let i = 1; i <= EB.maxSnapLevel; i++)
    for (let j = i + 1; j <= 20; j++)
      t.push(EB.scale * (13.6 * (1/(i*i) - 1/(j*j))));
  return t;
}

// Preset-button placements (sim-local within Energy Bar) + ids, verbatim from SWF.
const BUTTONS = [
  { id:0, label:"fire photon", type:1, lx:279.7, ly:56.9, w:82, h:22 },
  { id:1, n1:1, n2:2, label:'L"', type:2, lx:397.1, ly:32.0 },
  { id:2, n1:1, n2:3, label:"L$",  type:2, lx:461.6, ly:32.0 },
  { id:3, n1:1, n2:4, label:"L(",  type:2, lx:491.1, ly:32.0 },
  { id:4, n1:1, n2:5, label:"L*",  type:2, lx:507.0, ly:59.9 },
  { id:5, n1:1, n2:6, label:"Lg",  type:2, lx:525.1, ly:32.0 },
  { id:6, n1:2, n2:3, label:'H"', type:2, lx:74.0,  ly:59.9 },
  { id:7, n1:2, n2:4, label:"H$",  type:2, lx:94.0,  ly:32.0 },
  { id:8, n1:2, n2:5, label:"H(",  type:2, lx:111.1, ly:59.9 },
  { id:9, n1:2, n2:6, label:"H*",  type:2, lx:128.1, ly:32.0 },
  { id:10, n1:3, n2:4, label:'P"', type:2, lx:20.0,  ly:32.0 },
  { id:11, n1:3, n2:5, label:"P$",  type:2, lx:37.1,  ly:59.9 },
  { id:12, n1:3, n2:6, label:"P(",  type:2, lx:55.1,  ly:32.0 }
];

class EnergyBar {
  constructor(sim) {
    this.sim = sim;
    this.snapPointsList = buildSnapPoints();
    this.faintTicks = buildFaintTicks();
    this.selectedTransition = null;
    this.grabberX = 177.8;                // initial design placement
    this.buttonsMasked = false;
    this.onEnterFrame = null;             // bar auto-scroll while pressed
    // button visual states
    this.buttons = BUTTONS.map(b => {
      const sx = EB.ox + b.lx, sy = EB.oy + b.ly;
      const w = b.w || 26, h = b.h || 18;
      return Object.assign({}, b, { cx: sx, cy: sy, x: sx - w/2, y: sy - h/2, w, h,
        hover:false, depressed:false, activeFill:false, normalBorder:true });
    });
    this.moveGrabber(this.grabberX);
  }
  moveGrabber(newX) {
    if (newX < 1) newX = 1; else if (newX > EB.barWidth) newX = EB.barWidth;
    const sPL = this.snapPointsList;
    let dMin = Infinity, iMin = 0;
    for (let i = 0; i < sPL.length; i++) {
      const d = Math.abs(newX - sPL[i].x);
      if (d < dMin) { dMin = d; iMin = i; }
    }
    if (dMin < EB.snapDistance) {
      newX = sPL[iMin].x; this.selectedTransition = iMin;
    } else {
      this.selectedTransition = null;
    }
    this.grabberX = newX;
    const e = this.grabberX / EB.scale;             // E_n axis: x = scale * eV
    const w = 1240 / e;                              // wavelength (nm):  lambda = 1240/E
    const f = 299792458 / (w * 1e-9);                // frequency (Hz):   f = c / lambda
    this.frequency = f;
    if (w < 100) this.wavelengthString = toFixed(w,1) + " nm";
    else if (w < 1000) this.wavelengthString = Math.round(w) + " nm";
    else this.wavelengthString = toFixed(w/1000, 2) + " µm";
    this.energyString = (e >= 1) ? toFixed(e,1) + " eV" : toFixed(e,2) + " eV";
  }
  reenable() {
    for (const b of this.buttons) { b.activeFill = false; b.depressed = false; b.normalBorder = true; }
    this.buttonsMasked = false;
  }
  onButtonPressed(id) {
    if (id === 0) { this.firePhoton(); }
    else {
      const curr = this.selectedTransition;
      this.selectedTransition = id - 1;
      this.firePhoton();
      this.selectedTransition = curr;
    }
  }
  firePhoton() {
    this.buttonsMasked = true;
    if (this.selectedTransition != null) {
      const p = this.snapPointsList[this.selectedTransition];
      this.sim.firePhoton(p.e, p.n1, p.n2);
    } else {
      const e = this.grabberX / EB.scale;
      this.sim.firePhoton(e);
    }
  }
  // bar press -> nudge grabber toward mouse, then auto-advance after autoDelay
  barPress(mouseX) {
    const oldX = this.grabberX;
    if (this.selectedTransition == null) {
      if (mouseX < EB.ox + oldX) this.moveGrabber(oldX - 1); else this.moveGrabber(oldX + 1);
    } else {
      if (mouseX < EB.ox + oldX) this.moveGrabber(oldX - EB.maxSnapLevelPx - 0.5);
      else this.moveGrabber(oldX + EB.maxSnapLevelPx + 0.5);
    }
    this.timeLast = getTimer();
    this.autoStart = this.timeLast + EB.autoDelay;
    this._barMouseX = mouseX;
    this.onEnterFrame = this.barTick;
  }
  barTick() {
    const timeNow = getTimer();
    if (timeNow > this.autoStart) {
      const oldX = this.grabberX;
      const mouseX = input.x;
      if (this.selectedTransition == null) {
        const delta = EB.autoSpeed * (timeNow - this.timeLast);
        if (mouseX < EB.ox + oldX) this.moveGrabber(oldX - delta); else this.moveGrabber(oldX + delta);
      } else {
        if (mouseX < EB.ox + oldX) this.moveGrabber(oldX - EB.maxSnapLevelPx - 0.5);
        else this.moveGrabber(oldX + EB.maxSnapLevelPx + 0.5);
      }
    }
    this.timeLast = timeNow;
  }
  barRelease() { this.onEnterFrame = null; }
  tick() { if (this.onEnterFrame) this.onEnterFrame.call(this); }
}

/* ============================================================================
 * LOG COMPONENT + entries
 * ========================================================================== */
class LogEntry {
  constructor(entry) {
    this.entry = entry;
    this.transitionDelay = 750;
    this.transitionDuration = 1500;
    this.startColor = {r:204,g:0,b:0};
    this.endColor = {r:80,g:80,b:80};
    this.transitionStart = getTimer() + this.transitionDelay;
    this.color = {r:204,g:0,b:0};
    this.deltaColor = {r:this.endColor.r-this.startColor.r, g:this.endColor.g-this.startColor.g, b:this.endColor.b-this.startColor.b};
    this.onEnterFrame = this.tickFade;
    this.build();
  }
  build() {
    const e = this.entry;
    this.descriptor = null;
    if (e.transitionID != null) {
      const t = transitionsTable[e.transitionID];
      this.descriptor = t.letter + greekSub(t.subscript);
    }
    // mirror GenericEntry switch -> displayed strings
    switch (e.type) {
      case "i":
        this.photonEnergy = toFixed(e.energy,2) + " eV photon";
        this.photonAction = "absorbed"; this.typeText = "ionization";
        this.leftLevel = e.oldLevel; this.rightLevel = ""; this.absorbed = true; break;
      case "e":
        this.photonEnergy = toFixed(e.energy,2) + " eV photon";
        this.photonAction = "absorbed"; this.typeText = "excitation";
        this.leftLevel = e.oldLevel; this.rightLevel = e.newLevel; this.absorbed = true; break;
      case "r":
        this.typeText = "recombination"; this.leftLevel = e.newLevel; this.rightLevel = "";
        this.noPhoton = true; break;
      case "d":
        this.photonEnergy = toFixed(e.energy,2) + " eV photon";
        this.photonAction = "emitted"; this.typeText = "deexcitation";
        this.leftLevel = e.newLevel; this.rightLevel = e.oldLevel; this.absorbed = false; break;
      case "n":
        this.photonEnergy = toFixed(e.energy,2) + " eV photon";
        this.photonAction = "not absorbed"; this.noType = true; break;
    }
  }
  tickFade() {
    const u = (getTimer() - this.transitionStart) / this.transitionDuration;
    if (u >= 1) { this.onEnterFrame = null; this.color = {r:80,g:80,b:80}; }
    else if (u > 0) {
      this.color = {
        r: this.startColor.r + u*this.deltaColor.r,
        g: this.startColor.g + u*this.deltaColor.g,
        b: this.startColor.b + u*this.deltaColor.b
      };
    }
  }
}

class LogComponent {
  constructor() {
    this.mostRecentAtTop = false;
    this.numberOfEntriesVisible = LOG.numVisible;
    this.entryHeight = LOG.entryHeight;
    this.entries = [];            // LogEntry objects (visible ones)
    this.totalEntries = 0;
    this.nextY = 0;
    this.scrollPos = 0;           // 0..maxPos (top entry index)
    this.maxPos = 0;
    this.logY = LOG.areaY;        // scroll offset of the logMC within the area
    this.slideOnEnterFrame = null;
    this.clearEntries();
  }
  clearEntries() {
    this.entries = [];
    this.totalEntries = 0;
    this.nextY = 0;
    this.topEntryShown = null;
    this.scrollPos = 0;
    this.maxPos = 0;
    this.logYOffset = 0;          // pixels the content is shifted up
    this.slideOnEnterFrame = null;
  }
  addEntry(entry) {
    if (entry.type === "f") return;        // "fire" events are not logged
    const le = new LogEntry(entry);
    le.y = this.nextY;
    this.entries.push(le);
    this.nextY += this.entryHeight;
    this.totalEntries++;
    this.maxPos = this.totalEntries - this.numberOfEntriesVisible;
    // auto-scroll to newest at bottom + slide-in animation
    if (this.topEntryShown == null) {
      this.slideIn();
    }
  }
  slideIn() {
    let nEnd = this.totalEntries - this.numberOfEntriesVisible;
    if (nEnd < 0) nEnd = 0;
    let nStart = nEnd - 1; if (nStart < 0) nStart = 0;
    this.slideInStartY = -nStart * this.entryHeight;
    this.slideInEndY = -nEnd * this.entryHeight;
    this.slideInDelta = this.slideInEndY - this.slideInStartY;
    this.slideInDuration = 600;
    this.slideInStart = getTimer();
    this.slideOnEnterFrame = this.slideTick;
  }
  slideTick() {
    const u = (getTimer() - this.slideInStart) / this.slideInDuration;
    if (u >= 1) { this.logYOffset = this.slideInEndY; this.slideOnEnterFrame = null; }
    else { const f = 1 - Math.pow(1 - u, 5); this.logYOffset = this.slideInStartY + f * this.slideInDelta; }
  }
  // scrollbar interaction
  setScrollFromThumb(frac) {
    // frac 0..1 -> top entry index 0..maxPos
    if (this.maxPos <= 0) return;
    const s = Math.round(frac * this.maxPos);
    if (s === this.maxPos) { this.topEntryShown = null; this.logYOffset = -this.maxPos * this.entryHeight; }
    else { this.topEntryShown = s; this.logYOffset = -s * this.entryHeight; }
  }
  tick() {
    if (this.slideOnEnterFrame) this.slideOnEnterFrame.call(this);
    for (const le of this.entries) if (le.onEnterFrame) le.onEnterFrame.call(le);
  }
}

/* ============================================================================
 * THE SIMULATOR  (top-level controller wiring all sub-objects)
 * ========================================================================== */
class Simulator {
  constructor() {
    this.standardDecayTime = 2500;
    this.standardRecombinationTime = 2500;
    this.decayTable = [[],[1],[0.5,0.5],[0.33,0.33,0.34],[0.25,0.25,0.25,0.25],[0.2,0.2,0.2,0.2,0.2]];
    this.recombinationTable = [0.2,0.2,0.2,0.2,0.1,0.1];
    // photonTransitionIDTable[n1][n2] -> transitions-table index
    this.photonTransitionIDTable = [
      [null],
      [null,null,0,1,2,3,4],
      [null,null,null,5,6,7,8],
      [null,null,null,null,9,10,11],
      [null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null]
    ];
    this.electronLevel = 1;
    this.photonIsInQueue = false;
    this.photonTransitionID = null;
    this.onEnterFrame = null;

    this.atomDiagramMC = new AtomDiagram(this);
    this.scaleMC = new EnergyScale();
    this.logMC = new LogComponent();
    this.sliderMC = new EnergyBar(this);
  }

  // ---- electron drag callbacks ----
  onElectronDraggingStart() { this.onEnterFrame = null; this.photonIsInQueue = false; this.clearLog(); }
  onElectronDragged(level) { this.electronLevel = level; this.scaleMC.setLevel(level); }
  onElectronDraggingEnd() { this.onAnimationFinished(); }

  // ---- spontaneous decay / recombination waits ----
  recombinationTick() {
    if (getTimer() > this.waitTime) {
      this.atomDiagramMC.recaptureElectron(this.newElectronLevel);
      this.electronLevel = this.newElectronLevel;
      this.onEnterFrame = null;
    }
  }
  decayTick() {
    if (getTimer() > this.waitTime) {
      const nL = this.newElectronLevel;
      // E = 13.6 * (1/nL^2 - 1/n^2)  -- emitted photon energy
      const energy = 13.6 * (1/(nL*nL) - 1/(this.electronLevel*this.electronLevel));
      this.photonTransitionID = this.photonTransitionIDTable[nL][this.electronLevel];
      this.atomDiagramMC.deexciteAtom(energy, nL);
      this.electronLevel = nL;
      this.onEnterFrame = null;
    }
  }
  onAnimationFinished() {
    if (this.photonIsInQueue) {
      const p = this.queuedPhotonParameters;
      this.firePhoton(p.energy, p.level1, p.level2);
      this.photonIsInQueue = false;
    } else {
      if (this.onEnterFrame == null) {
        if (this.electronLevel === Infinity) {
          // pick recombination target level from recombinationTable
          const dT = this.recombinationTable;
          const pr = Math.random(); let ps = 0, i = 0;
          while (i < dT.length) { ps += dT[i]; if (pr < ps) break; i++; }
          if (i >= dT.length) i = dT.length - 1;
          this.newElectronLevel = i + 1;
          this.waitTime = getTimer() + this.standardRecombinationTime;
          this.onEnterFrame = this.recombinationTick;
        } else if (this.electronLevel > 1) {
          // pick decay target level from decayTable[level-1]
          const dT = this.decayTable[this.electronLevel - 1];
          const pr = Math.random(); let ps = 0, i = 0;
          while (i < dT.length) { ps += dT[i]; if (pr < ps) break; i++; }
          if (i >= dT.length) i = dT.length - 1;
          this.newElectronLevel = i + 1;
          this.waitTime = getTimer() + this.standardDecayTime;
          this.onEnterFrame = this.decayTick;
        }
      }
      this.sliderMC.reenable();
    }
  }

  clearLog() { this.logMC.clearEntries(); }
  onRecombination(newLevel) { this.logMC.addEntry({type:"r",newLevel}); this.scaleMC.setLevel(newLevel); }
  onIonization(energy, oldLevel) {
    this.logMC.addEntry({type:"i",energy,transitionID:this.photonTransitionID,oldLevel});
    this.scaleMC.setLevel(Infinity);
  }
  onExcitation(energy, oldLevel, newLevel) {
    this.logMC.addEntry({type:"e",energy,transitionID:this.photonTransitionID,oldLevel,newLevel});
    this.scaleMC.setLevel(newLevel);
  }
  onDeexcitation(energy, oldLevel, newLevel) {
    this.logMC.addEntry({type:"d",energy,transitionID:this.photonTransitionID,oldLevel,newLevel});
    this.scaleMC.setLevel(newLevel);
  }
  onNoAbsorption(energy) {
    this.logMC.addEntry({type:"n",energy,transitionID:this.photonTransitionID});
  }

  firePhoton(energy, level1, level2) {
    if (this.atomDiagramMC.animationIsInProgress) {
      this.photonIsInQueue = true;
      this.queuedPhotonParameters = {energy, level1, level2};
    } else {
      this.logMC.addEntry({type:"f"});
      const ionizationEnergy = 13.6 / (this.electronLevel * this.electronLevel);  // 13.6/n^2
      if (level1 !== undefined) this.photonTransitionID = this.photonTransitionIDTable[level1][level2];
      else this.photonTransitionID = null;

      if (level1 === this.electronLevel) {
        // resonant absorption -> excitation
        this.electronLevel = level2;
        this.atomDiagramMC.firePhoton(energy, level2);
        this.onEnterFrame = null;
      } else if (isFinite(this.electronLevel) && energy > ionizationEnergy) {
        // photon energy exceeds binding energy -> ionization
        this.electronLevel = Infinity;
        const extraEnergy = energy - ionizationEnergy;
        this.atomDiagramMC.firePhoton(energy, Infinity, extraEnergy);
        this.onEnterFrame = null;
      } else {
        // no absorption -> passes through
        this.atomDiagramMC.firePhoton(energy, null);
        if (isFinite(this.electronLevel))
          this.waitTime = getTimer() + this.standardDecayTime + this.atomDiagramMC.nullAnimationTime;
        else
          this.waitTime = getTimer() + this.standardRecombinationTime + this.atomDiagramMC.nullAnimationTime;
      }
    }
  }

  tick() {
    if (this.onEnterFrame) this.onEnterFrame.call(this);
    this.atomDiagramMC.tick();
    this.sliderMC.tick();
    this.logMC.tick();
  }
}

/* ============================================================================
 * DIALOGS (About / Help) - verbatim copy from texts/*.txt
 * ========================================================================== */
const ABOUT_LINES = [
  { t:"This simulator is part of the Hydrogen Energy Levels Module of the", y:0 },
  { t:"Nebraska Astronomy Applet Project. Supporting materials and", y:18 },
  { t:"additional astronomy education resources can be found at", y:36 },
  { t:"http://astro.unl.edu", y:60, link:true, center:true },
  { t:"Funding for this work was provided by NSF grants #0231270", y:96 },
  { t:"and/or #0404988.", y:114 },
  { t:"Permission is granted to use this file for noncommercial purposes as", y:135 },
  { t:"long as it remains unmodified.", y:153 }
];
// Help text - segments; bold terms are the panel/button names (separate records in src).
const HELP_RUNS = [
  ["This simulator models the interaction of a hydrogen atom with light, ",0],
  ["demonstrating the quantum nature of absorption and emission.",0,true],
  ["Use the ",0],["Photon Selection",1],
  [" panel to fire a photon at the atom. Pressing the ",0],
  ["fire photon",1],
  [" button will fire a photon with the energy selected by the slider. Pressing one of the other preset buttons will fire a photon with the energy corresponding to that particular transition.",0,true],
  ["The ",0],["Energy Level Diagram",1],
  [" panel provides an alternate representation of the atom's state, showing how the energy needed to ionize the atom depends on which level the electron is in.",0,true],
  ["The ",0],["Event Log",1],
  [" provides a history of the events in the simulator. The most recent entries are added at the bottom.",0,true],
  ["For demonstration purposes you can drag the electron between levels. Doing this clears the log, however.",0]
];

class Dialog {
  constructor(title, kind) {
    this.title = title; this.kind = kind; this.visible = false;
    if (kind === "about") { this.w = 408; this.h = 188; }
    else { this.w = 432; this.h = 272; }
    this.titleBarHeight = 26;
    this.x = (STAGE_W - this.w) / 2;
    this.y = (STAGE_H - this.h) / 2;
    this.dragging = false;
  }
  show(){ this.visible = true; }
  hide(){ this.visible = false; }
  contains(px, py) {
    return this.visible && px >= this.x && px <= this.x + this.w &&
           py >= this.y - this.titleBarHeight && py <= this.y + this.h;
  }
  inTitleBar(px, py) {
    return this.visible && px >= this.x && px <= this.x + this.w &&
           py >= this.y - this.titleBarHeight && py <= this.y;
  }
  inClose(px, py) {
    const cx = this.x + this.w - 18, cy = this.y - this.titleBarHeight/2;
    return this.visible && Math.abs(px - cx) <= 10 && Math.abs(py - cy) <= 9;
  }
}

/* ============================================================================
 * GLOBAL STATE + input
 * ========================================================================== */
const sim = new Simulator();
const aboutDialog = new Dialog("About", "about");
const helpDialog = new Dialog("Help", "help");
const dialogs = [aboutDialog, helpDialog];

const input = { x: 0, y: 0, down: false };

// drag state machines
let electronDrag = false, electronDragOffset = 0;
let grabberDrag = false, grabberDragOffset = 0;
let barPressing = false;
let scrollDrag = false, scrollDragOffset = 0;
let dialogDrag = null, dialogDragOffX = 0, dialogDragOffY = 0;
let pressedButton = null;

/* ===================== RENDERING ===================== */
function setAlpha(a){ ctx.globalAlpha = Math.max(0, Math.min(1, a/100)); }

function render() {
  ctx.globalAlpha = 1;
  // stage background
  ctx.fillStyle = "#cccccc";
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  drawPanels();
  drawAtomDiagram();
  drawEnergyScale();
  drawEnergyBar();
  drawLog();
  drawTitleBar();
  for (const d of dialogs) if (d.visible) drawDialog(d);
  ctx.globalAlpha = 1;
}

/* ---- Panel backgrounds (Panel Background.update) ---- */
function panelBox(L, T, R, B, title, centerTitle) {
  ctx.fillStyle = C.panelBg;
  ctx.strokeStyle = C.panelBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(L + 0.5, T + 0.5, (R - L) - 1, (B - T) - 1);
  ctx.fill(); ctx.stroke();
  if (title) {
    ctx.fillStyle = C.panelTitle;
    ctx.font = "14px Verdana";
    ctx.textBaseline = "top";
    const ty = T + 4;
    if (centerTitle) {
      // narrow panel: center the title, no separator bar
      ctx.textAlign = "center";
      ctx.fillText(title, (L + R) / 2, ty);
      ctx.textAlign = "left";
    } else {
      ctx.textAlign = "left";
      const tx = L + 5;
      ctx.fillText(title, tx, ty);
      const tw = ctx.measureText(title).width;
      // title separator bar
      ctx.strokeStyle = C.panelBar; ctx.lineWidth = 1;
      const yBar = ty + 9;
      ctx.beginPath();
      ctx.moveTo(L + 10 + tw, yBar + 0.5);
      ctx.lineTo(R - 5, yBar + 0.5);
      ctx.stroke();
    }
  }
}
function drawPanels() {
  panelBox(PS_PANEL.L, PS_PANEL.T, PS_PANEL.R, PS_PANEL.B, "Photon Selection");
  panelBox(LOG.panelL, LOG.panelT, LOG.panelR, LOG.panelB, "Event Log");
  panelBox(ES.panelL, ES.panelT, ES.panelR, ES.panelB, "Energy Level Diagram", true);
}

/* ---- Atom Diagram ---- */
function drawAtomDiagram() {
  const ad = sim.atomDiagramMC;
  // black background (char193)
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(AD.boxL, AD.boxT, AD.boxW, AD.boxH);

  // clip to the masked region [boxL,boxL+width]x[boxT,boxT+250]
  ctx.save();
  ctx.beginPath();
  ctx.rect(AD.boxL, AD.boxT, AD.width, AD.boxH);
  ctx.clip();

  const cx = AD.ox, cy = AD.cy;
  // orbits (white arcs, 2px), radii = levelPositions
  for (let i = 0; i < AD.levelPositions.length; i++) {
    setAlpha(ad.orbitAlpha[i]);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, AD.levelPositions[i], 0, 2*Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // transition progress dots (small arrows ">") streaming between old/new orbit
  if (ad.transitionProgressVisible) {
    setAlpha(ad.transitionProgressAlpha);
    const x0 = Math.min(ad.transitionProgressMaskX0, ad.transitionProgressMaskX1);
    const x1 = Math.max(ad.transitionProgressMaskX0, ad.transitionProgressMaskX1);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx + x0, cy - 10, x1 - x0, 20); ctx.clip();
    const dx = AD.transitionProgressDotSpacing;
    ctx.fillStyle = "rgba(228,228,228,0.5)";
    for (let i = -2; i < 2 + Math.ceil(AD.width / dx); i++) {
      const px = cx + ad.transitionProgressX + i * dx * (ad.transitionProgressXScale||1);
      drawDot(px, cy, ad.transitionProgressXScale||1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // streaming photons
  ad.photons.draw(ctx, cx, cy);

  // proton (red gradient circle r14) at center
  drawRadial(cx, cy, 14, "#f30101", "#9e0101", 3.95, -5.05);

  // electrons (ghost first, then real) - green gradient circle r7
  if (ad.e2.alpha > 0) {
    setAlpha(ad.e2.alpha);
    drawRadial(cx + ad.e2.x, cy + ad.e2.y, 7, "#02d702", "#017801", 2.0, -2.5);
  }
  if (ad.e1.alpha > 0) {
    setAlpha(ad.e1.alpha);
    drawRadial(cx + ad.e1.x, cy + ad.e1.y, 7, "#02d702", "#017801", 2.0, -2.5);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ionized symbol ("+" and "atom is ionized") - drawn unclipped, top-right
  if (ad.ionizedVisible) {
    ctx.fillStyle = "#cccccc";
    drawPlus(AD.ionizedX, AD.ionizedY);
    ctx.fillStyle = "#cccccc";
    ctx.font = "12px Verdana"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("atom is", AD.ionizedX - 9, AD.ionizedY + 18);
    ctx.fillText("ionized", AD.ionizedX - 9, AD.ionizedY + 32);
  }
}
function drawRadial(x, y, r, c0, c1, gx, gy) {
  const g = ctx.createRadialGradient(x + gx, y + gy, 0, x, y, r * 1.25);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI); ctx.fill();
}
function drawDot(x, y, dir) {
  // small ">" arrow (Transition Progress Dot shape 149), pointing in travel direction
  ctx.beginPath();
  if (dir >= 0) { ctx.moveTo(x-4, y-4.3); ctx.lineTo(x-1.2, y-4.3); ctx.lineTo(x+3.95, y);
                  ctx.lineTo(x-1.2, y+4.35); ctx.lineTo(x-4, y+4.35); ctx.lineTo(x+1.15, y); }
  else { ctx.moveTo(x+4, y-4.3); ctx.lineTo(x+1.2, y-4.3); ctx.lineTo(x-3.95, y);
         ctx.lineTo(x+1.2, y+4.35); ctx.lineTo(x+4, y+4.35); ctx.lineTo(x-1.15, y); }
  ctx.closePath(); ctx.fill();
}
function drawPlus(x, y) {
  // ionized cross (shape190), bounds approx 19.6 wide, registration near center
  ctx.beginPath();
  ctx.moveTo(x+1.3, y-7.35); ctx.lineTo(x+1.3, y+1.2); ctx.lineTo(x-1.3, y+1.2);
  ctx.lineTo(x-1.3, y-7.35); ctx.lineTo(x-9.8, y-7.35); ctx.lineTo(x-9.8, y-9.85);
  ctx.lineTo(x-1.3, y-9.85); ctx.lineTo(x-1.3, y-18.35); ctx.lineTo(x+1.3, y-18.35);
  ctx.lineTo(x+1.3, y-9.85); ctx.lineTo(x+9.8, y-9.85); ctx.lineTo(x+9.8, y-7.35);
  ctx.closePath(); ctx.fill();
}

/* ---- Energy Scale (level diagram) ---- */
function drawEnergyScale() {
  const es = sim.scaleMC;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ES.panelL + 1, ES.panelT + 1, (ES.panelR - ES.panelL) - 2, (ES.panelB - ES.panelT) - 2);
  ctx.clip();

  // marker geometry: tick centered at the component origin (x=863); the active level
  // shows "level N" to the left and "-X.X eV" to the right (as in the original).
  const tickCx = ES.ox, tickL = ES.ox - 15, tickR = ES.ox + 15;
  // inactive ticks (gray) for all non-active levels
  for (const m of es.markers) {
    if (isFinite(es.level) && es.level === m.level) continue;
    ctx.strokeStyle = "#666666"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tickL, m.y + 0.5); ctx.lineTo(tickR, m.y + 0.5); ctx.stroke();
  }
  // active level marker (red line + flanking labels)
  function activeMarker(y, levelText, energyText) {
    ctx.strokeStyle = "#cc0000"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tickL, y); ctx.lineTo(tickR, y); ctx.stroke();
    ctx.fillStyle = "#000000"; ctx.font = "11px Verdana"; ctx.textBaseline = "middle";
    ctx.textAlign = "right"; ctx.fillText(levelText, tickL - 6, y);
    ctx.textAlign = "left"; ctx.fillText(energyText, tickR + 6, y);
  }
  if (isFinite(es.level)) {
    for (const m of es.markers)
      if (es.level === m.level) activeMarker(m.y, m.levelString, m.energyString);
  } else {
    activeMarker(es.ionizedY, "ionized", ">0 eV");
  }
  ctx.restore();
}

/* ---- Energy Bar ---- */
function drawSuperscript(text, exp, x, y, font, supFont, color, align) {
  // draws "text" then a superscript "exp"; returns total width. align 'center' centers whole.
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.font = font;
  const w1 = ctx.measureText(text).width;
  ctx.font = supFont;
  const w2 = exp != null ? ctx.measureText(exp).width : 0;
  let startX = x;
  if (align === "center") startX = x - (w1 + w2) / 2;
  ctx.textAlign = "left";
  ctx.font = font; ctx.fillText(text, startX, y);
  if (exp != null) { ctx.font = supFont; ctx.fillText(exp, startX + w1, y - 5); }
  return w1 + w2;
}
function drawEnergyBar() {
  const eb = sim.sliderMC;

  // --- the three bordered axis boxes (white fill, #cccccc border) ---
  for (const k of ["freq","wave","energy"]) {
    const b = EB.boxes[k];
    ctx.fillStyle = "#ffffff"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }

  // --- axis name labels (italic gray, top-right inside each box) ---
  ctx.fillStyle = "#999999"; ctx.font = "italic 12px Verdana";
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillText("frequency", EB.boxes.freq.x + EB.boxes.freq.w - 6, EB.boxes.freq.y + 4);
  ctx.fillText("wavelength", EB.boxes.wave.x + EB.boxes.wave.w - 6, EB.boxes.wave.y + 4);
  ctx.fillText("energy", EB.boxes.energy.x + EB.boxes.energy.w - 6, EB.boxes.energy.y + 4);

  // --- axis tick marks (exact stage y from SWF tick-row shapes; above the labels) ---
  ctx.strokeStyle = "#666666"; ctx.lineWidth = 1; ctx.lineCap = "round";
  for (const tx of EB.freqTicks) tickMark(EB.ox + tx, 352, 10);
  for (const tx of EB.waveTicks) tickMark(EB.ox + tx, 416, 10);
  for (const tx of EB.energyTicks) {
    const long = EB.energyLongTicks.indexOf(tx) >= 0;
    tickMark(EB.ox + tx, 481, long ? 10 : 6);
  }
  ctx.lineCap = "butt";

  // --- axis value labels (top baseline, just below the ticks) ---
  ctx.fillStyle = "#000000"; ctx.textBaseline = "top";
  drawFreqLabel("1", "14", 1e14, 363); drawFreqLabel("1", "15", 1e15, 363);
  drawFreqLabel("2", "15", 2e15, 363); drawFreqLabel("3", "15", 3e15, 363);
  drawAxisText("10 µm", eVfromWavelength(10000), 428);
  drawAxisText("1 µm", eVfromWavelength(1000), 428);
  drawAxisText("500 nm", eVfromWavelength(500), 428);
  drawAxisText("200 nm", eVfromWavelength(200), 428);
  drawAxisText("100 nm", eVfromWavelength(100), 428);
  drawAxisText("0 eV", 0, 493); drawAxisText("5 eV", 5, 493);
  drawAxisText("10 eV", 10, 493); drawAxisText("15 eV", 15, 493);

  // --- region labels ---
  ctx.fillStyle = "#000000"; ctx.font = "11px Verdana";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("infrared", EB.ox + 5, EB.regionY);
  ctx.fillText("visible", EB.ox + 67, EB.regionY);
  ctx.fillText("ultraviolet", EB.ox + 225, EB.regionY);

  // --- visible spectrum strip (drawSpectrum: local x[67,127], y[-23,-18]) ---
  drawSpectrumStrip();

  // --- faint snap-point ticks on the slider ---
  ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
  for (const tx of eb.faintTicks) {
    const X = EB.ox + tx;
    ctx.beginPath(); ctx.moveTo(X + 0.5, EB.sliderY - 10); ctx.lineTo(X + 0.5, EB.sliderY + 10); ctx.stroke();
  }

  // --- slider pill (sliderV5DefaultBar shape207) ---
  drawSliderPill();

  // --- preset buttons + connectors ---
  drawButtons();

  // --- grabber (knob + 3 red axis ticks + readouts) ---
  drawGrabber();
}
function eVfromFreq(f){ return 1240 * f / 299792458e9; }  // E=1240/lambda(nm), lambda(nm)=c/f*1e9
function eVfromWavelength(nm){ return 1240 / nm; }
function xForEv(ev){ return EB.ox + EB.scale * ev; }
function drawAxisText(text, ev, y) {
  ctx.fillStyle = "#000000"; ctx.font = "11px Verdana";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(text, xForEv(ev), y);
}
function drawFreqLabel(coeff, exp, f, y) {
  // "<coeff>x10^<exp> Hz" centered at the x for frequency f
  const x = xForEv(eVfromFreq(f));
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.font = "11px Verdana"; const base = coeff + "×10"; const wBase = ctx.measureText(base).width;
  ctx.font = "8px Verdana";  const wExp = ctx.measureText(exp).width;
  ctx.font = "11px Verdana"; const tail = " Hz"; const wTail = ctx.measureText(tail).width;
  let sx = x - (wBase + wExp + wTail) / 2;
  ctx.fillStyle = "#000000";
  ctx.font = "11px Verdana"; ctx.fillText(base, sx, y);
  ctx.font = "8px Verdana";  ctx.fillText(exp, sx + wBase, y - 5);
  ctx.font = "11px Verdana"; ctx.fillText(tail, sx + wBase + wExp, y);
}
function tickMark(x, top, len) {
  ctx.beginPath(); ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, top + len); ctx.stroke();
}
function drawSpectrumStrip() {
  // visible band on the energy axis: lambda 380..700nm -> E 3.26..1.77 eV
  const xL = EB.ox + 67, xR = EB.ox + 127;
  const yT = EB.sliderY - 23, yB = EB.sliderY - 18;
  const grad = ctx.createLinearGradient(xL, 0, xR, 0);
  // colors/ratios from drawSpectrum() (ARGB ints -> rgb), alpha 0 at ends
  const stops = [
    [0, 16711738, 0],[51/255, 16717568, 1],[76/255, 15330304, 1],[88/255, 2424576, 1],
    [108/255, 65472, 1],[146/255, 1087455, 1],[159/255, 5905407, 1],[1, 9044223, 0]
  ];
  for (const s of stops) {
    const c = s[1];
    const r=(c>>16)&255, g=(c>>8)&255, b=c&255;
    grad.addColorStop(s[0], `rgba(${r},${g},${b},${s[2]})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(xL, yT, xR - xL, yB - yT);
}
function drawSliderPill() {
  const xL = EB.ox - 9, xR = EB.ox + 593, y = EB.sliderY, h = 9;
  const grad = ctx.createLinearGradient(xL, 0, xR, 0);
  grad.addColorStop(0, "#c1c1c1"); grad.addColorStop(1, "#fafafa");
  roundRect(xL, y - h/2, xR - xL, h, 4);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "#999999"; ctx.lineWidth = 1; ctx.stroke();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawButtons() {
  const eb = sim.sliderMC;
  for (const b of eb.buttons) drawButton(b);
}
function drawButton(b) {
  // Fire Photon Button visual states
  const fill = b.activeFill ? "#e0e0e0" : "#e8e8e8";
  const border = b.normalBorder ? "#c8c8c8" : "#b0b0b0";
  ctx.fillStyle = fill;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = border; ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  if (b.depressed) {
    ctx.strokeStyle = "#a0a0a0";
    ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  }
  const dx = b.depressed ? 1 : 0, dy = b.depressed ? 1 : 0;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (b.type === 1) {
    ctx.font = "11px Verdana";
    ctx.fillText("fire photon", b.cx + dx, b.cy + dy);
  } else {
    // letter + greek subscript
    const letter = b.label.charAt(0);
    const sub = greekSub(b.label.charAt(1));
    ctx.font = "11px Verdana";
    const wl = ctx.measureText(letter).width;
    ctx.font = "8px Verdana";
    const ws = ctx.measureText(sub).width;
    const total = wl + ws;
    const sx = b.cx - total/2 + dx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "11px Verdana"; ctx.fillText(letter, sx, b.cy + dy - 1);
    ctx.font = "8px Verdana"; ctx.fillText(sub, sx + wl, b.cy + dy + 2);
    ctx.textAlign = "center";
  }
}
function drawGrabber() {
  const eb = sim.sliderMC;
  const gx = EB.ox + eb.grabberX;
  // 3 red axis ticks
  ctx.strokeStyle = "#cc0000"; ctx.lineWidth = 3; ctx.lineCap = "round";
  for (const ty of [EB.freqTickY, EB.waveTickY, EB.energyTickY]) {
    ctx.beginPath(); ctx.moveTo(gx, ty - 2.5); ctx.lineTo(gx, ty + 2.5); ctx.stroke();
  }
  ctx.lineCap = "butt";
  // knob (rounded rect, gray gradient)
  const ky = EB.sliderY, kh = 27, kw = 12;
  const grad = ctx.createLinearGradient(gx - 6, 0, gx + 6, 0);
  grad.addColorStop(0, "#e4e4e4"); grad.addColorStop(0.525, "#f4f4f4"); grad.addColorStop(1, "#e1e1e1");
  roundRect(gx - kw/2, ky - kh/2, kw, kh, 5);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "#999999"; ctx.lineWidth = 1; ctx.stroke();

  // readouts (red), centered on gx, above each axis
  ctx.fillStyle = "#cc0000";
  // frequency: scientific notation + " Hz"
  const sn = sciNotation(eb.frequency, 2);
  drawSciReadout(sn.coefficient, sn.exponent, " Hz", gx, EB.freqReadoutY);
  ctx.font = "12px Verdana"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#cc0000";
  ctx.fillText(eb.wavelengthString, gx, EB.waveReadoutY);
  ctx.fillText(eb.energyString, gx, EB.energyReadoutY);
}
function drawSciReadout(coeff, exp, tail, x, y) {
  ctx.fillStyle = "#cc0000";
  ctx.font = "12px Verdana"; ctx.textBaseline = "alphabetic";
  const base = coeff + "×10";
  const wBase = ctx.measureText(base).width;
  ctx.font = "9px Verdana"; const wExp = ctx.measureText(exp).width;
  ctx.font = "12px Verdana"; const wTail = ctx.measureText(tail).width;
  const total = wBase + wExp + wTail;
  let sx = x - total/2;
  ctx.textAlign = "left";
  ctx.font = "12px Verdana"; ctx.fillText(base, sx, y);
  ctx.font = "9px Verdana"; ctx.fillText(exp, sx + wBase, y - 5);
  ctx.font = "12px Verdana"; ctx.fillText(tail, sx + wBase + wExp, y);
  ctx.textAlign = "center";
}

/* ---- Event Log ---- */
function drawLog() {
  const log = sim.logMC;
  ctx.save();
  ctx.beginPath();
  ctx.rect(LOG.contentL, LOG.contentT, LOG.areaWidth, LOG.areaHeight);
  ctx.clip();
  for (const le of log.entries) {
    const y = LOG.contentT + le.y + log.logYOffset;
    if (y > LOG.contentT + LOG.areaHeight || y + LOG.entryHeight < LOG.contentT) continue;
    drawLogEntry(le, LOG.contentL, y);
  }
  ctx.restore();
  drawScrollbar();
}
function drawLogEntry(le, x, y) {
  const e = le.entry;
  const c = le.color;
  const col = `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  const y1 = y + 15, y2 = y + 28;

  // dotted separator at the bottom of each entry
  ctx.strokeStyle = "rgba(160,160,160,0.6)"; ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x + 2, y + LOG.entryHeight - 0.5);
  ctx.lineTo(x + LOG.areaWidth - 4, y + LOG.entryHeight - 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = col;
  ctx.textBaseline = "alphabetic";

  // Three evenly-spaced columns: type | transition | photon (energy + action).
  // Column 1: type word (left)
  if (e.type !== "n") {
    ctx.textAlign = "left"; ctx.font = "11px Verdana";
    ctx.fillText(le.typeText, x + 4, y + 22);
  }

  // Column 2: transition (actual electron movement: oldLevel -> newLevel; ionized = ∞)
  let from = null, to = null;
  if (e.type === "e" || e.type === "d") { from = e.oldLevel; to = e.newLevel; }
  else if (e.type === "i") { from = e.oldLevel; to = "∞"; }
  else if (e.type === "r") { from = "∞"; to = e.newLevel; }
  if (from !== null) {
    ctx.font = "11px Verdana"; ctx.textAlign = "center";
    ctx.fillText(from + " → " + to, x + 102, y + 22);
  }

  // Column 3: photon energy (line 1) + action with transition descriptor (line 2)
  if (!le.noPhoton) {
    const rx = x + 126;
    ctx.textAlign = "left"; ctx.font = "10px Verdana";
    ctx.fillText(le.photonEnergy, rx, y1);            // "X.XX eV photon"
    ctx.font = "italic 10px Verdana";
    ctx.fillText(le.photonAction, rx, y2);            // absorbed / emitted / not absorbed
    if (le.descriptor) {
      const aw = ctx.measureText(le.photonAction).width;
      ctx.font = "10px Verdana";
      ctx.fillText(" (" + le.descriptor + ")", rx + aw, y2);
    }
  }
}
function drawScrollbar() {
  const log = sim.logMC;
  const x = LOG.scrollbarX, top = LOG.contentT, h = LOG.areaHeight;
  // track
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, top, 16, h);
  ctx.strokeStyle = "#999999"; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, top + 0.5, 16, h - 1);
  // up/down arrow boxes
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(x, top, 16, 16); ctx.strokeRect(x + 0.5, top + 0.5, 16, 16);
  ctx.fillRect(x, top + h - 16, 16, 16); ctx.strokeRect(x + 0.5, top + h - 16 + 0.5, 16, 16);
  ctx.fillStyle = "#666666";
  drawTri(x + 8, top + 6, 4, -1); drawTri(x + 8, top + h - 10, 4, 1);
  // thumb
  const total = Math.max(log.totalEntries, log.numberOfEntriesVisible);
  const frac = log.numberOfEntriesVisible / total;
  const trackH = h - 32;
  const thumbH = Math.max(16, trackH * frac);
  let pos = 0;
  if (log.maxPos > 0) {
    const s = (log.topEntryShown == null) ? log.maxPos : log.topEntryShown;
    pos = (s / log.maxPos) * (trackH - thumbH);
  }
  if (log.totalEntries > log.numberOfEntriesVisible) {
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(x + 2, top + 16 + pos, 12, thumbH);
    ctx.strokeStyle = "#999999"; ctx.strokeRect(x + 2.5, top + 16 + pos + 0.5, 12, thumbH - 1);
  }
}
function drawTri(cx, cy, r, dir) {
  ctx.beginPath();
  if (dir < 0) { ctx.moveTo(cx - r, cy + r/1.5); ctx.lineTo(cx + r, cy + r/1.5); ctx.lineTo(cx, cy - r/1.5); }
  else { ctx.moveTo(cx - r, cy - r/1.5); ctx.lineTo(cx + r, cy - r/1.5); ctx.lineTo(cx, cy + r/1.5); }
  ctx.closePath(); ctx.fill();
}

/* ---- clear log button + Title Bar ---- */
const CLEARBTN = { x: 748, y: 596, w: 84, h: 20 };
let clearHover = false, clearDepressed = false;
function drawTitleBar() {
  // title bar background
  ctx.fillStyle = C.panelBg;
  ctx.fillRect(0, 0, STAGE_W, TITLE_H);
  ctx.strokeStyle = C.panelBorder; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, TITLE_H - 0.5); ctx.lineTo(STAGE_W, TITLE_H - 0.5); ctx.stroke();
  ctx.fillStyle = "#000000"; ctx.font = "14px Verdana";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText("Hydrogen Atom Simulator", 10, 7);
  // options, laid out right-to-left: "about" rightmost, "help" to its left
  ctx.font = "12px Verdana"; ctx.textBaseline = "top";
  ctx.textAlign = "right";
  drawOption("about", 928, aboutOptHover);
  drawOption("help", 884, helpOptHover);
  ctx.textAlign = "left";

  // clear log button (in event log panel)
  const fill = clearDepressed ? "#e0e0e0" : "#f4f4f4";
  ctx.fillStyle = fill;
  ctx.fillRect(CLEARBTN.x, CLEARBTN.y, CLEARBTN.w, CLEARBTN.h);
  ctx.strokeStyle = clearHover ? "#b0b0b0" : "#999999"; ctx.lineWidth = 1;
  ctx.strokeRect(CLEARBTN.x + 0.5, CLEARBTN.y + 0.5, CLEARBTN.w - 1, CLEARBTN.h - 1);
  ctx.fillStyle = "#000000"; ctx.font = "11px Verdana";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("clear log", CLEARBTN.x + CLEARBTN.w/2, CLEARBTN.y + CLEARBTN.h/2);
  ctx.textAlign = "left";
}
let aboutOptHover = false, helpOptHover = false;
function drawOption(text, rightX, hover) {
  ctx.fillStyle = "#000000"; ctx.font = "12px Verdana";
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillText(text, rightX, 6);
  if (hover) {
    const w = ctx.measureText(text).width;
    ctx.strokeStyle = "#000000"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rightX - w, 20.5); ctx.lineTo(rightX, 20.5); ctx.stroke();
  }
}

/* ---- Dialogs ---- */
function drawDialog(d) {
  // backdrop dim (the original blocks clicks with an invisible background; we keep it subtle)
  ctx.save();
  // title bar
  ctx.fillStyle = "#666666";
  ctx.fillRect(d.x, d.y - d.titleBarHeight, d.w, d.titleBarHeight);
  // content
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.strokeStyle = "#666666"; ctx.lineWidth = 1;
  ctx.strokeRect(d.x + 0.5, d.y - d.titleBarHeight + 0.5, d.w - 1, d.h + d.titleBarHeight - 1);
  ctx.beginPath(); ctx.moveTo(d.x, d.y + 0.5); ctx.lineTo(d.x + d.w, d.y + 0.5); ctx.stroke();
  // title
  ctx.fillStyle = "#ffffff"; ctx.font = "12px Verdana";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText(d.title, d.x + 10, d.y - d.titleBarHeight + 7);
  // close button (X)
  const cx = d.x + d.w - 18, cy = d.y - d.titleBarHeight/2;
  ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
  ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
  ctx.stroke(); ctx.lineCap = "butt";

  ctx.fillStyle = "#000000"; ctx.textBaseline = "top";
  if (d.kind === "about") drawAboutContent(d); else drawHelpContent(d);
  ctx.restore();
}
function drawAboutContent(d) {
  const px = d.x + 12, py = d.y + 10;
  ctx.textAlign = "left";
  for (const ln of ABOUT_LINES) {
    ctx.font = "12px Verdana";
    if (ln.link) {
      ctx.fillStyle = "#0000ee";
      ctx.textAlign = ln.center ? "center" : "left";
      ctx.fillText(ln.t, ln.center ? d.x + d.w/2 : px, py + ln.y);
      ctx.textAlign = "left"; ctx.fillStyle = "#000000";
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillText(ln.t, px, py + ln.y);
    }
  }
}
function drawHelpContent(d) {
  // word-wrap the help runs within the content width, bolding panel/button names.
  // Tokenize keeping whitespace so spaces between runs (e.g. after a bold term) survive.
  const px = d.x + 12, py = d.y + 12;
  const maxW = d.w - 24;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#000000";
  let cx = px, cy = py;
  const lineH = 16;
  for (const run of HELP_RUNS) {
    const text = run[0]; const bold = run[1] === 1; const para = run[2];
    ctx.font = (bold ? "bold " : "") + "12px Verdana";
    const tokens = text.match(/\s+|\S+/g) || [];
    for (const tok of tokens) {
      const w = ctx.measureText(tok).width;
      if (/\S/.test(tok)) {
        if (cx + w > px + maxW) { cx = px; cy += lineH; }
        ctx.fillText(tok, cx, cy);
        cx += w;
      } else {
        // whitespace: collapse at line start, otherwise advance
        if (cx > px) cx += w;
      }
    }
    if (para) { cx = px; cy += lineH + 4; }
  }
}

/* ============================================================================
 * INPUT HANDLING (hit-testing on canvas)
 * ========================================================================== */
function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (STAGE_W / r.width),
           y: (ev.clientY - r.top) * (STAGE_H / r.height) };
}

// hit tests
function hitElectron(p) {
  const ad = sim.atomDiagramMC;
  const ex = AD.ox + ad.e1.x, ey = AD.cy + ad.e1.y;
  return Math.hypot(p.x - ex, p.y - ey) <= 9;
}
function hitGrabber(p) {
  const gx = EB.ox + sim.sliderMC.grabberX;
  return Math.abs(p.x - gx) <= 7 && Math.abs(p.y - EB.sliderY) <= 14;
}
function hitBar(p) {
  return p.x >= EB.ox - 9 && p.x <= EB.ox + 593 && Math.abs(p.y - EB.sliderY) <= 6;
}
function hitButton(p) {
  if (sim.sliderMC.buttonsMasked) return null;
  for (const b of sim.sliderMC.buttons)
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  return null;
}
function hitClear(p) {
  return p.x >= CLEARBTN.x && p.x <= CLEARBTN.x + CLEARBTN.w &&
         p.y >= CLEARBTN.y && p.y <= CLEARBTN.y + CLEARBTN.h;
}
function hitScrollThumb(p) {
  const log = sim.logMC;
  if (log.totalEntries <= log.numberOfEntriesVisible) return false;
  const x = LOG.scrollbarX;
  return p.x >= x + 2 && p.x <= x + 14 && p.y >= LOG.contentT + 16 && p.y <= LOG.contentT + LOG.areaHeight - 16;
}

canvas.addEventListener("mousedown", (ev) => {
  const p = canvasPos(ev);
  input.x = p.x; input.y = p.y; input.down = true;

  // dialogs take priority (modal-ish)
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const d = dialogs[i];
    if (!d.visible) continue;
    if (d.inClose(p.x, p.y)) { d.hide(); return; }
    if (d.inTitleBar(p.x, p.y)) { dialogDrag = d; dialogDragOffX = p.x - d.x; dialogDragOffY = p.y - d.y; return; }
    if (d.contains(p.x, p.y)) return;   // swallow clicks inside dialog
  }

  // title bar options
  if (p.y < TITLE_H) {
    if (overOption(p, "about", 928)) { aboutDialog.show(); helpDialog.hide(); return; }
    if (overOption(p, "help", 884)) { helpDialog.show(); aboutDialog.hide(); return; }
  }

  // clear log
  if (hitClear(p)) { clearDepressed = true; return; }

  // preset / fire buttons
  const b = hitButton(p);
  if (b) { pressedButton = b; b.depressed = true; b.normalBorder = true; return; }

  // electron drag
  if (hitElectron(p)) {
    electronDrag = true;
    sim.onElectronDraggingStart();
    sim.atomDiagramMC.draggingStart();
    electronDragOffset = (p.x - AD.ox) - sim.atomDiagramMC.e1.x;
    return;
  }
  // grabber drag
  if (hitGrabber(p)) {
    grabberDrag = true;
    grabberDragOffset = (p.x - EB.ox) - sim.sliderMC.grabberX;
    return;
  }
  // bar press (nudge + auto-advance)
  if (hitBar(p)) { barPressing = true; sim.sliderMC.barPress(p.x); return; }
  // scrollbar thumb
  if (hitScrollThumb(p)) { scrollDrag = true; scrollDragOffset = p.y; return; }
  // scrollbar arrows
  handleScrollArrows(p);
});

function overOption(p, text, rightX) {
  ctx.font = "12px Verdana";
  const w = ctx.measureText(text).width;
  return p.x >= rightX - w && p.x <= rightX && p.y >= 4 && p.y <= 22;
}

window.addEventListener("mousemove", (ev) => {
  const p = canvasPos(ev);
  input.x = p.x; input.y = p.y;

  if (dialogDrag) {
    dialogDrag.x = clamp(p.x - dialogDragOffX, 0, STAGE_W - dialogDrag.w);
    dialogDrag.y = clamp(p.y - dialogDragOffY, dialogDrag.titleBarHeight + 5, STAGE_H - dialogDrag.h);
    return;
  }
  if (electronDrag) {
    // snap to nearest level position (mirrors onMouseMoveFunc)
    const ad = sim.atomDiagramMC;
    const xm = (p.x - AD.ox) - electronDragOffset;
    let minD = Infinity, x = 0, newLevel = 0;
    for (let i = 0; i < ad.levelPositions.length; i++) {
      const d = Math.abs(xm - ad.levelPositions[i]);
      if (d < minD) { minD = d; newLevel = i + 1; x = ad.levelPositions[i]; }
    }
    const oldLevel = sim.electronLevel;
    ad.e1.x = x; ad.e2.x = xm;
    sim.electronLevel = newLevel;
    sim.onElectronDragged(newLevel);
    ad.orbitAlpha[newLevel-1] = AD.occupiedOrbitAlpha;
    if (newLevel !== oldLevel && isFinite(oldLevel)) ad.orbitAlpha[oldLevel-1] = AD.unoccupiedOrbitAlpha;
    return;
  }
  if (grabberDrag) {
    sim.sliderMC.moveGrabber((p.x - EB.ox) - grabberDragOffset);
    return;
  }
  if (scrollDrag) {
    const trackTop = LOG.contentT + 16;
    const trackH = LOG.areaHeight - 32;
    const frac = clamp((p.y - trackTop) / trackH, 0, 1);
    sim.logMC.setScrollFromThumb(frac);
    return;
  }

  // hover states
  updateHover(p);
});

window.addEventListener("mouseup", (ev) => {
  const p = canvasPos(ev);
  input.down = false;

  if (dialogDrag) { dialogDrag = null; return; }
  if (electronDrag) {
    electronDrag = false;
    sim.atomDiagramMC.draggingEnd();
    sim.onElectronDraggingEnd();
    return;
  }
  if (grabberDrag) { grabberDrag = false; return; }
  if (barPressing) { barPressing = false; sim.sliderMC.barRelease(); return; }
  if (scrollDrag) { scrollDrag = false; return; }

  if (clearDepressed) {
    clearDepressed = false;
    if (hitClear(p)) sim.clearLog();
    return;
  }
  if (pressedButton) {
    const b = pressedButton; pressedButton = null;
    b.depressed = false;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      b.activeFill = true;
      sim.sliderMC.onButtonPressed(b.id);
    } else {
      b.normalBorder = true;
    }
    return;
  }
});

function handleScrollArrows(p) {
  const log = sim.logMC;
  if (log.totalEntries <= log.numberOfEntriesVisible) return;
  const x = LOG.scrollbarX, top = LOG.contentT, h = LOG.areaHeight;
  if (p.x >= x && p.x <= x + 16) {
    const cur = (log.topEntryShown == null) ? log.maxPos : log.topEntryShown;
    if (p.y >= top && p.y <= top + 16) { log.setScrollFromThumb(Math.max(0, cur - 1) / log.maxPos); }
    else if (p.y >= top + h - 16 && p.y <= top + h) { log.setScrollFromThumb(Math.min(log.maxPos, cur + 1) / log.maxPos); }
  }
}

function updateHover(p) {
  // electron / grabber -> move cursor; buttons/options -> pointer
  let cursor = "textcursor";
  aboutOptHover = overOption(p, "about", 928) && p.y < TITLE_H;
  helpOptHover = overOption(p, "help", 884) && p.y < TITLE_H;
  clearHover = hitClear(p);
  for (const b of sim.sliderMC.buttons) b.hover = false;
  const hb = hitButton(p);
  if (hb) { hb.hover = true; hb.normalBorder = false; }
  else { for (const b of sim.sliderMC.buttons) if (!b.activeFill) b.normalBorder = true; }

  if (hitElectron(p) || hitGrabber(p)) cursor = "dragcursor";
  else if (hb || aboutOptHover || helpOptHover || clearHover || hitBar(p)) cursor = "handcursor";
  // dialog close hover
  for (const d of dialogs) if (d.visible && d.inClose(p.x, p.y)) cursor = "handcursor";
  canvas.className = cursor;
}
function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

/* ============================================================================
 * MAIN LOOP
 * ========================================================================== */
function frame() {
  sim.tick();
  render();
  requestAnimationFrame(frame);
}
// Ensure fonts are loaded before first paint so text metrics/positions match.
if (document.fonts && document.fonts.ready) {
  document.fonts.load('12px "Verdana"').then(() => {}).catch(()=>{});
  document.fonts.ready.then(() => { requestAnimationFrame(frame); });
} else {
  requestAnimationFrame(frame);
}
