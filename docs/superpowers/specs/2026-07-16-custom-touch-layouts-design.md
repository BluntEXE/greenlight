# Custom Per-Game Touch Layouts — Design

## Goal

Replace Greenlight's current blanket "Enable Touch input" on/off toggle with
actual on-screen touch controls, matching (and improving on) Better xCloud's
custom touch layout feature — while staying small enough to actually ship,
by adopting the same positioning model Microsoft's own Touch Adaptation Kit
(the tech behind xCloud's official touch controls, and what Better xCloud
builds on) already uses.

## Background research

- `redphx/better-xcloud`'s wiki confirms layouts are built from 3 element
  types (joysticks, buttons, D-pad) positioned into 5 fixed screen regions —
  left-inner, left-outer, right-inner, right-outer, top-right — not
  freeform pixel coordinates. This is Microsoft's own convention (Touch
  Adaptation Kit), not an invention of the userscript.
- `xbox-xcloud-player`'s `Channel/Input.ts` `InputFrame` interface (the
  actual, complete wire protocol Greenlight sends) defines every input
  that can exist on a touch layout: `A B X Y`, `DPadUp/Down/Left/Right`,
  `LeftThumb RightThumb` (L3/R3), `LeftShoulder RightShoulder` (LB/RB),
  `LeftTrigger RightTrigger` (analog), `LeftThumbXAxis/YAxis` and
  `RightThumbXAxis/YAxis` (both sticks, analog), `Menu`, `View`, `Nexus`.
- `Driver/Gamepad.ts:164` (`mapStateLabels`) already does
  `Nexus: buttons[16]?.value || (buttons[8]?.value && buttons[9]?.value) || ...`
  — holding View + Menu together already produces Nexus. **Decision:**
  don't give Nexus its own touch control at all; it's redundant with an
  existing combo, and one less accidental-tap risk on a touchscreen.
- `main/helpers/titlemanager.ts`'s cached title metadata (`titleInfoArgs`)
  has no genre field. **Decision:** preset selection is manual, not
  auto-detected — no genre heuristic to build or get wrong.

## Non-goals

- Freeform pixel-perfect button placement — the 5-zone model is
  deliberately less flexible in exchange for far less editor complexity
  (no collision detection, no arbitrary-position math), and matches a
  real, tested convention instead of inventing one.
- Auto-detecting a genre preset from title metadata — not available.
- A dedicated Nexus/guide-button touch control — already covered by the
  existing View+Menu combo.
- Modifying `xbox-xcloud-player`. All input dispatch goes through its
  existing public `InputChannel.queueGamepadState()` method (see "Input
  dispatch" below for why this specific method, not `pressButton()`) —
  same non-goal established in the Clarity Boost and codec-selection
  specs.

## Architecture

### Positioning model: 5 fixed zones

Every touch layout is a mapping of `zone → control[]`, where zone is one
of `left-inner | left-outer | right-inner | right-outer | top-right`.
A "control" is `{ type: 'button' | 'stick', input: <InputFrame key>,
size?: 'small' | 'medium' | 'large' }`. Rendering lays out each zone's
controls with simple flex/grid positioning — no drag-collision logic
needed, since a zone just arranges whatever's assigned to it.

### Presets (Phase A)

Three built-in presets, each just a zone-assignment map:

- **Standard / Action** (default): left-inner = left stick, left-outer =
  D-pad, right-inner = A/B/Y, right-outer = RB/RT. Fits most 3rd/1st-person
  action, platformers, RPGs.
- **Racing**: left-inner = steering stick, right-inner = stacked gas/brake
  (not side-by-side, so the thumb doesn't need to travel), top-right =
  handbrake.
- **Minimal**: left-outer = D-pad only, right-inner = A (large) + B
  (smaller). Largest touch targets of the three, for puzzle/simple games.

### Input dispatch (corrected after tracing the real send path)

The original draft of this section assumed `GamepadDriver.pressButton()`
(a 60ms pulse-and-clear) was the dispatch mechanism, and flagged "held"
buttons and analog sticks/triggers as an unresolved gap. Tracing
`Channel/Input.ts`'s actual per-frame send loop (`start()`,
`Channel/Input.ts:109-156`, runs every 16ms unconditionally once the
channel opens) found a better foundation:

- `InputChannel.queueGamepadState(input: InputFrame)` /
  `queueGamepadStates(inputs)` (`Channel/Input.ts:296-301`) push directly
  onto `this._gamepadFrames`, which the 16ms interval drains and sends
  every tick — **completely independent of `input_legacykeyboard` /
  `input_newgamepad` mode**, physical controller presence, or any other
  input path. This is the same queue physical gamepads and the
  keyboard-merge path both feed; it's the universal entry point, not an
  internal implementation detail.
- Two mode-*dependent* alternatives exist and were ruled out:
  `GamepadDriver.pressButton()` / `KeyboardDriver.pressButton()` (routed
  correctly by `InputChannel.pressButton(index, button)`, which Greenlight
  itself already calls for its own Nexus gamebar button —
  `renderer/pages/stream/[serverid].tsx:266`) both only fire a **60ms
  pulse**, wrong for "hold to walk" D-pad/face-button behavior. Worse,
  `KeyboardDriver`'s merge path (which `pressButton` routes through when
  `input_legacykeyboard === true`) is gated behind a toggle — **"Enable
  Keyboard to Gamepad" in Settings → Input** — that a meaningful number of
  real users (confirmed: the person building this has it disabled right
  now) turn off specifically because the app's own UI warns that mixing
  it with Mouse & Keyboard mode "will cause conflicts." Building touch
  dispatch on that path would make touch controls silently stop working
  the moment a user (reasonably) disables that toggle.

**Decision:** the touch overlay owns its own `InputFrame`-shaped held-state
object (all fields default `0`, `GamepadIndex: 0`), mutated directly by
touch-start/move/end handlers — buttons set to `0`/`1` and held until
release, analog fields (stick axes, triggers) set to their live float
value, not a pulse. On a ~16ms interval matching the channel's own send
cadence, push the current frame via
`xPlayer.getChannelProcessor('input').queueGamepadState(frame)`. One
mechanism, correct for both digital and analog controls, and unaffected
by any input-mode setting. Same non-goal as before: this doesn't touch
`xbox-xcloud-player`, it only calls two already-public methods
(`getChannelProcessor`, `queueGamepadState`) the way the codebase already
calls sibling methods on the same object.

### Phase A scope (this is the plan written next)

1. Zone-based rendering component, overlaid on the stream (sibling to the
   existing gamebar/debug overlays in `streamcomponent.tsx`, not inside
   `xbox-xcloud-player`'s own DOM).
2. The 3 built-in presets as static data.
3. A simple preset picker (shown when touch is enabled and no
   customization exists yet for the current title) defaulting to Standard.
4. Held-state input dispatch via direct `queueGamepadState()` injection,
   covering both digital and analog controls uniformly (see corrected
   "Input dispatch" section above) — mode-independent, works regardless
   of the "Enable Keyboard to Gamepad" setting.
5. Only active when `settings.input_touch` is already enabled (existing
   setting) — no new top-level toggle needed.

### Phase B scope (future plan, not detailed further here)

- Drag-to-reposition and resize within a zone.
- Add/remove controls from the full 21-input set (minus Nexus).
- Per-title persistence via `electron-store`, keyed by title ID from
  `titlemanager`, falling back to the manually-picked preset when no
  per-title customization exists.
- A "reset to preset" action.

## Error handling

- If touch is enabled but the stream container isn't found yet (same
  async-DOM-availability issue Clarity Boost solved with a
  `MutationObserver`), the overlay simply doesn't render until it is —
  never blocks the stream.
- If a title has no saved customization (Phase B) or the app can't
  determine a title ID, fall back to the manually-selected preset, or
  Standard if none was ever picked.

## Testing

- Zone-assignment data (which controls are in which preset) is a plain
  data structure — trivially unit-testable without any DOM.
- The analog-dispatch mechanism (once designed in Phase A's plan) should
  be unit-testable in isolation the same way, separate from the touch
  event handling itself.
- Actual on-screen rendering and touch-event handling requires a real
  Electron renderer with a touchscreen or touch-emulation — same
  manual-verification treatment as Clarity Boost's DOM wiring and codec
  selection's `RTCRtpReceiver` check, called out explicitly rather than
  faked.
