# Better xCloud Feature Parity — Design

## Goal

Bring the Greenlight desktop client to feature parity with the subset of
Better xCloud's userscript features it's genuinely missing, implemented as
native Greenlight functionality (own settings UI, own persistence, own code)
rather than by injecting or depending on Better xCloud's script. Target: a
public fork maintained well enough to contribute back upstream.

## Non-goals

- Feature parity with Better xCloud items Greenlight already covers
  (bitrate control, H.264 profile forcing, region override, touch/MKB
  toggles, vibration, friends list, local WebUI). See "Existing coverage"
  below — these are explicitly out of scope.
- Local co-op on true xCloud (cloud-hosted) sessions. Scoped to Remote Play
  (streaming from the user's own console) only — cloud sessions are tied to
  a single account profile and can't reliably support a second local player
  signing in, which is a game/platform limitation no client-side code fixes.
- UI decluttering / ad-hiding — not applicable, Greenlight has its own
  native UI, it doesn't render Microsoft's xbox.com page.

## Existing coverage (confirmed via screenshots of running app + source read)

Settings → Streaming: xCloud/xHome bitrate sliders, H.264 profile dropdown,
region override, preferred game language.
Settings → Input: vibration, touch input, mouse & keyboard, keyboard-to-gamepad toggles.
Settings → Video & Audio: aspect ratio, force low-res (Steam Deck FSR path), disable video/audio.
Settings → Web UI: local web server for remote config (port 9003).

## Build order

1. Clarity Boost (video sharpening)
2. AV1/HEVC codec selection
3. Custom per-game touch layouts
4. Screenshot capture
5. Local co-op (Remote Play only)

## Architecture, per feature

### 1. Clarity Boost

**File:** `packages/player/src/client/lib/render/webgpu.ts`

`WebGpuComponent` already pulls raw `VideoFrame`s via
`MediaStreamTrackProcessor` and runs every frame through a hardcoded WGSL
fragment shader doing Sobel edge-detection with adaptive sharpen/smooth
blending (see `create()`, the `fragmentModule` shader source). This is
already a clarity-boost implementation — it's just permanently on with
fixed constants, not exposed to the user.

**Approach:** parameterize the shader via a uniform buffer holding
edge-threshold and sharpen-strength values, sourced from a new setting.
Default the uniform values to the current hardcoded constants (edge
threshold 0.1, sharpen multiplier 1.1/0.025) so existing behavior doesn't
regress. Add a slider (off / low / medium / high, or a raw 0-1 strength
value — implementation plan to decide) under Settings → Video & Audio.

**Rejected alternative:** CSS filters (`contrast`/`saturate`) on the canvas
element. Cheaper to build but strictly worse quality than the existing
edge-aware shader, and would fight with the WebGPU pipeline that's already
rendering there. Not worth it when a real sharpen pipeline already exists.

### 2. AV1/HEVC codec selection

**Files:** `packages/player/src/client/lib/sdp.ts`,
`packages/player/src/client/lib/player.ts` (line ~39: single call site
`videoTransceiver.setCodecPreferences(this._sdpHelper.getDefaultCodecPreferences())`).

`Sdp.getDefaultCodecPreferences()` currently tiers H.264 profiles
(`t1`/`t2`/`t3` by `profile-level-id`) and dumps VP8/VP9/FEC into an
unordered low-priority `t4` bucket. AV1 and HEVC aren't represented at all
even though `RTCRtpReceiver.getCapabilities('video')` may report them
depending on browser/hardware.

**Approach:** add explicit AV1 and HEVC tiers, orderable ahead of or
between the H.264 tiers based on a new setting. Expose a codec-preference
dropdown next to the existing "Set H.264 Profile" control in Settings →
Streaming.

**Constraint to document in the UI copy:** this sets a *preference*, not a
guarantee. Actual codec used still depends on what Microsoft's xCloud
encoder offers for that session — same ceiling Better xCloud has, and not
fixable client-side.

### 3. Custom per-game touch layouts

**Files:** new overlay component (pattern: `render/overlay.ts`), extends
`input/touch.ts`, storage via `main/ipc/settings.ts` +
`main/helpers/titlemanager.ts` (title ID lookup).

Real gap — nothing to repurpose. `Touch.onPointer()` today forwards raw
pointer events straight to `queuePointerFrame`, same path as mouse. There's
no concept of a positioned virtual button.

**Approach:**
- New overlay layer (same DOM/canvas-over-stream pattern as the existing
  stats `Overlay` class) rendering positioned virtual buttons/sticks.
- Each virtual control, on touch, calls `Gamepad.sendButtonState(button,
  value)` — the exact override mechanism `_gamepadOverride.buttons` already
  uses for keyboard-to-gamepad mapping. Reuses an existing input path
  instead of adding a new one.
- Layout data (button positions/sizes per control) persisted via
  `electron-store` through `main/ipc/settings.ts`, keyed by title ID
  (available from `titlemanager`'s cached title metadata).
- A layout editor (drag-to-position buttons, add/remove/resize) is the
  actual scope-heavy part of this feature — everything downstream
  (persistence, input dispatch) already exists.

### 4. Screenshot capture

**Files:** `render/webgpu.ts` (capture source), new `main/ipc/*.ts` handler
(pattern matches existing IPC handlers).

Smallest feature. `WebGpuComponent` already renders every frame into an
`HTMLCanvasElement`. On a keybind, call `canvas.toBlob()`, pass the blob to
the main process over IPC, write to disk via a native save dialog. No new
rendering or input work — just wiring an existing render target to a save
path.

### 5. Local co-op (Remote Play only)

**Files:** `packages/player/src/client/index.tsx` (`VirtualGamepad`),
`packages/player/src/client/lib/input/gamepad.ts` (`Gamepad`).

`VirtualGamepad` currently hardcodes exactly one `Gamepad` instance at
`index=0` (`attach(index = 0)`). But `Gamepad.detectActiveGamepad()`
already contains dedup logic that walks
`this._player._channels.control.getGamepadHandlers()` to skip physical
controllers already claimed by another `Gamepad` instance — logic that
only makes sense if multiple concurrent instances were the original
design intent. It was built for this and never wired past index 0.

**Approach:** extend `VirtualGamepad` to hold an array of `Gamepad`
instances instead of one, auto-assigning each newly-detected physical
controller (via the existing `gamepadconnected` listener path) the next
free index. Gate activation behind a Remote Play session check — this
must never activate on xCloud-library sessions, per scope decision above.

**Open risk, not resolvable from source alone:** whether the console/game
itself actually recognizes >1 controller over a Remote Play session at the
protocol level. This needs a real-hardware validation spike (two
controllers against an actual console session) before committing to full
layout/UI work for this feature — flagged for the implementation plan as a
first step, not assumed.

## Data flow summary

- Settings (codec preference, clarity boost strength, touch layouts) live
  in `electron-store`, written/read through `main/ipc/settings.ts`,
  surfaced in the renderer's Settings pages.
- Touch layout button state flows through the existing `Gamepad` override
  path (`sendButtonState` → `_gamepadOverride.buttons` → `getGamepadState()`
  → input channel), not a new channel.
- Codec preference feeds `Sdp.getDefaultCodecPreferences()`, applied once
  per session via `setCodecPreferences()` at connection time — not
  renegotiable mid-stream without reconnecting.
- Screenshot capture reads the existing WebGPU canvas render target
  directly; no changes to the render pipeline's data flow.

## Error handling

- Clarity Boost: if uniform buffer setup fails, fall back to current
  hardcoded shader behavior (fail open, not off — matches today's
  always-on behavior).
- Codec preference: if the requested codec isn't in
  `RTCRtpReceiver.getCapabilities()`, silently fall back to the existing
  H.264 tier order. Never hard-fail a session over a missing codec.
- Touch layouts: missing/corrupt layout data for a title falls back to the
  existing blanket touch-input toggle behavior (no custom layout, not "no
  touch").
- Local co-op: if a second controller can't be verified as recognized
  (per the open risk above), the feature stays single-player-only and
  should surface that state rather than silently dropping input from the
  second controller.

## Testing

- Codec + Clarity Boost: verifiable via WebRTC stats
  (`RTCRtpReceiver` codec in use, frame timing) — no real console needed.
- Touch layouts: overlay positioning and persistence testable without a
  live stream (mock the video element).
- Screenshot: unit-testable in isolation (canvas → blob → IPC write).
- Local co-op: requires the hardware validation spike above; cannot be
  meaningfully unit tested until that's resolved.
