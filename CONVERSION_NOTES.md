# Hydrogen Atom Simulator — Flash → HTML5 Conversion Notes

Source: `hydrogenAtom033.swf` / `hydrogenAtom033.fla` (decompiled with JPEXS).
Original: Nebraska Astronomy Applet Project (NAAP), *Hydrogen Energy Levels* module.
Stage: **950 × 640 px**, background `#CCCCCC` (SWF `SetBackgroundColor`).

## Behavior model (plain language)

This simulator teaches the quantum (Bohr) model of the hydrogen atom: how it
absorbs and emits light. A single electron orbits a proton in one of six quantized
levels (drawn as nested white arcs centered on the proton, left side of the black
"Atom Diagram").

The user picks a photon energy in the **Photon Selection** panel — either by dragging
the slider (which reads out the same photon three ways: **frequency**, **wavelength**,
**energy**) or by pressing one of the preset transition buttons (Lyman Lα…Lε,
Balmer Hα…Hδ, Paschen Pα…Pγ). Pressing **fire photon** sends a photon (a colored
squiggle whose color depends on its wavelength) at the atom. Outcomes:

* **Excitation** — if the photon energy exactly matches a transition from the
  electron's current level, the electron jumps up.
* **Ionization** — if the energy exceeds the binding energy `13.6/n²`, the electron
  is ejected (the atom shows a "+" / "atom is ionized" symbol).
* **No absorption** — otherwise the photon passes straight through.

After excitation the atom **spontaneously de-excites** (emitting a photon) after a
delay; an ionized atom **recombines** (the electron flies back in) and then cascades
down. The randomized target levels come from fixed probability tables in the source.

The right **Energy Level Diagram** panel shows every level as a tick on a `-13.6 … 0`
eV scale, highlighting the current level in red (or an "ionized / >0 eV" marker). The
**Event Log** records every absorption/emission/ionization/recombination verbatim,
with each new entry sliding in red and fading to gray. You may also drag the electron
directly between levels (this clears the log).

## Rendering architecture

The original is **entirely code-drawn vector art** (createEmptyMovieClip / beginFill /
lineTo / curveTo / drawArc / attachMovie), so the whole stage is reproduced on **one
`<canvas>`** (`index.html` → `simulation.js`), recreating each drawing call with the
same coordinates, colors, and alpha. Native-widget behavior (preset buttons, slider,
scrollbar, draggable dialogs) is reproduced by hit-testing on that same canvas. No
HTML form controls, no frameworks, no build step, no network requests. Opens from
`index.html` over `file://`.

Coordinates were taken verbatim from the SWF `PlaceObject` matrices (e.g. The
Simulator at stage `(0,30)`, Atom Diagram center `(7.1,162)`, Energy Bar origin
`(45,554.1)`, Energy Scale level-1 baseline `(863,273.6)`, Log component `(665.9,272)`).

### AS-construct → HTML5 mapping

| ActionScript 1 construct | HTML5 implementation |
|---|---|
| `Object.registerClass` + `prototype = new MovieClip()` | plain JS class with the same methods (`Simulator`, `AtomDiagram`, `EnergyBar`, `EnergyScale`, `LogComponent`, `StreamingPhotons`, …) |
| `onEnterFrame = func` | a single `requestAnimationFrame` loop calling each object's active `onEnterFrame` |
| `getTimer()` | `performance.now()` relative to load; **all ms constants kept** (`standardDecayTime=2500`, `transitionTime=1500`, `nullAnimationTime=1538`, `slideInDuration=600`, …) |
| `drawArc` (curveTo tessellation) | `ctx.arc` (same center/radius) |
| `beginFill/lineTo` rectangles & masks | `ctx.fill`/`fillRect` + `ctx.clip()` for `setMask` |
| radial-gradient electron/proton fills | `ctx.createRadialGradient` with the exported stop colors (`#02d702→#017801`, `#f30101→#9e0101`) |
| `_x,_y,_alpha,_rotation` | object properties applied at draw time; `_rotation` degrees → radians |
| `attachMovie(...,initObj)` | construct JS object, copy init props |
| `Number.prototype.toFixed` polyfill | ported verbatim (`toFixed()` in JS) |
| `trace(...)` | dropped (gated behind `const DEBUG=false`) |
| `_root/_parent` chains | explicit references (`sim.atomDiagramMC`, `sim.logMC`, …) |
| FUIComponent / FPushButton / FScrollBar | only the observable look & behavior reproduced (not the component framework) |

### Verbatim physics constants/tables (copied, never rounded)

* `E_n = -13.6/n²` eV; ionization energy `13.6/n²`; emitted/absorbed `13.6·(1/n₁²−1/n₂²)`.
* `decayTable`, `recombinationTable`, `photonTransitionIDTable` — copied exactly.
* `levelPositions = [22,78,175,310,486,700]`; `scale = 584/15` px/eV.
* Photon color spectrum table and `getPhotonStyleFromWavelength` thresholds — copied exactly.
* Wavelength↔frequency: `λ(nm)=1240/E`, `f=c/λ` with `c=299792458`.
* Scientific-notation and `toFixed` formatting reproduce the source's exact digits/output.

### Fonts

Verdana (the embedded "Interface Font" / "Dialog Window Font") is self-hosted from
`assets/fonts/Verdana.ttf` via `@font-face` and used at the source's sizes. The
embedded "WP Greek Century" font is also copied to `assets/fonts/`.

### Greek transition subscripts (forced, faithful substitution)

The source labels Lyman/Balmer/Paschen lines with a WordPerfect-Greek font where the
ASCII bytes `" $ ( * g` render as `α β γ δ ε`. Those raw bytes appear in the source
(`label="L\""`, the `transitionsTable`, etc.). To guarantee the **on-screen glyphs
match what users saw** regardless of browser cmap handling, JS maps those bytes to the
Unicode Greek letters (`GREEK` table) so the buttons and log read `Lα, Lβ, …, Hα, …,
Pα, …`. This is a fidelity-preserving substitution, not a content change.

## Notes on the design-time screenshot (`frames/1.png`)

`frames/1.png` is JPEXS's **static** render of frame 1, before the `registerClass`
constructors run. It therefore differs from the live initial state in expected ways,
all handled correctly at runtime:

* The Energy-Scale tick markers are absent in the PNG (they are `attachMovie`'d in the
  constructor); the live app draws all 20 ticks + the active "level 1 / -13.6 eV" marker.
* The "atom is ionized" "+" symbol is visible in the PNG but `._visible=false` at runtime.
* The slider readouts in the PNG ("8.88×10⁸ Hz", "12.32 eV") are design placeholders;
  the live app computes them from the initial grabber position (x≈177.8 → "4.6 eV",
  "272 nm", "1.1×10¹⁵ Hz").

## Layout details (verified against a screenshot of the original runtime)

* **Panel rectangles.** The right-hand panels (Energy Level Diagram, top; Event Log,
  bottom) share a right edge at the stage's right margin; the Event Log is wider and
  extends further left. The three **Photon Selection axis boxes** (frequency / wavelength
  / energy) are the white, `#cccccc`-bordered rectangles from SWF shape `char215`, in
  Energy-Bar-local `y[−220,−45]`. Their tick rows are SWF shapes `char230/219/225`
  (frequency at 1e14/1e15/2e15/3e15 Hz; wavelength at 10µm/1µm/500nm/200nm/100nm; energy
  every 1 eV with longer ticks at 0/5/10/15).
* **Energy-axis tick labels** are positioned by their physical value
  (`x = origin + scale·E(value)`), which is exact and matches the SWF tick positions.
* **Title-bar options** are laid out right-to-left (`about` rightmost, `help` to its
  left), matching the source `Title Bar` layout loop.
* **Energy Level Diagram markers.** Each level is a tick at `oy + yScale·(13.6−E_n)`;
  the active level is a red line with `level N` to its left and `−X.X eV` to its right
  (and an `ionized / >0 eV` marker when ionized), matching the original. Energies, level
  numbers, and vertical positions are exact.
* **Event Log entries** reproduce the source `Generic Entry` content: type word, the
  electron transition (`oldLevel → newLevel`, with `∞` for the ionized/continuum state),
  the photon energy + transition descriptor (e.g. `(Lβ)`), and the action in italics
  (`absorbed` / `emitted` / `not absorbed`), with dotted separators and the red→gray fade.
* **Preset buttons** use the exact SWF placement coordinates and ids; their drawn size
  is matched to the original.

---

## DEFERRED ACCESSIBILITY (do not implement now)

A later ADA/WCAG pass should address — none of these are implemented in this fidelity pass:

* **Color-only signaling.** Active energy level / ionized state is conveyed only by red
  (`#cc0000`); log recency only by red→gray color fade; photon type only by color.
  Needs a non-color cue.
* **Palette contrast.** Gray-on-light-gray axis names (`#999999` on `#FAFAFA`), faint
  slider ticks (black @ 20% alpha), and the unoccupied orbits (white @ 30% alpha on black)
  are below WCAG contrast minimums.
* **Missing controls.** No Pause, no Reset, no speed control. Animations (orbit decay,
  photon streaming, log fade) run unconditionally — a **reduced-motion** option and a
  Pause/Reset are needed.
* **Keyboard support / focus.** All interaction is mouse hit-testing on the canvas:
  electron drag, slider, preset buttons, scrollbar, dialog drag/close, about/help. None
  are keyboard-reachable or focusable. Needs tab order, key handlers, visible focus rings.
* **Screen-reader semantics.** The canvas exposes no roles/labels. Needs ARIA: live-region
  for the Event Log, labels for buttons/slider (with current value), descriptions for the
  atom diagram and energy-level diagram, and alt/long-desc text for the simulation state.
* **Dialogs.** About/Help are not focus-trapped, not announced, and the close button has
  no accessible name; the `http://astro.unl.edu` text is not a real, focusable link.
* **Hit targets.** Preset buttons and scrollbar arrows are small (~26×18 / 16×16 px).
