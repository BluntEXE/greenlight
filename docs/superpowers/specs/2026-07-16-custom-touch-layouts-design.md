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
  existing public `GamepadDriver.pressButton(index, button)` method
  (already used internally for the keyboard-driven Nexus trick) — same
  non-goal established in the Clarity Boost and codec-selection specs.

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

### Input dispatch

Each on-screen control, on touch, calls the existing
`GamepadDriver.pressButton(index, button)` method (index `0`, since touch
input plays as the primary local player) for discrete buttons. Analog
controls (sticks, triggers) need a continuous value rather than a single
press/release — `pressButton` as it exists today only supports discrete
taps (it sets a value then clears it after 60ms, per
`Driver/Gamepad.ts:102-110`). **This is a real gap Phase A's plan must
address**: either extend `GamepadDriver` with a method that sets a
continuous value until touch-release (not just a timed pulse), or feed
analog state through the `_shadowGamepad` mechanism `pressButton` already
writes to, holding the value rather than the timeout-and-clear pattern.
This needs to be resolved as an early implementation task, not assumed —
call it out explicitly in the Phase A plan.

### Phase A scope (this is the plan written next)

1. Zone-based rendering component, overlaid on the stream (sibling to the
   existing gamebar/debug overlays in `streamcomponent.tsx`, not inside
   `xbox-xcloud-player`'s own DOM).
2. The 3 built-in presets as static data.
3. A simple preset picker (shown when touch is enabled and no
   customization exists yet for the current title) defaulting to Standard.
4. Discrete-button dispatch via `pressButton()`.
5. Resolve the analog-input dispatch gap above (sticks/triggers) — at
   minimum for the Standard and Racing presets, which both need it.
6. Only active when `settings.input_touch` is already enabled (existing
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
