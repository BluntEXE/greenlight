# Better xCloud Feature Parity — Design

> **Correction (same day):** originally grounded in `packages/player` /
> `packages/desktop-v3`, an unreleased 3.0.0-alpha rewrite. The actual
> running app (2.4.x, confirmed via screenshots) is `packages/desktop`,
> which depends on the separate npm package `xbox-xcloud-player` (pinned
> `^0.2.11`, and 0.2.11 is in fact the newest 0.2.x release — the only
> newer versions are the `1.0.0-beta*` line, a different major rewrite).
> Decision: target `0.2.11` as-is. This version rewrites every
> file/approach section below.

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
- Modifying the `xbox-xcloud-player` dependency itself. Every feature below
  turned out to be reachable from Greenlight's own code — either through
  that package's existing public API, or by reaching into the DOM it
  renders into (`packages/desktop/renderer/pages/stream/[serverid].tsx`
  owns the container div the library renders the `<video>` element into).
  Forking/patching that dependency is explicitly out of scope unless a
  task below discovers it's unavoidable.

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

**Files:** `packages/desktop/renderer/pages/stream/[serverid].tsx`,
`packages/desktop/renderer/pages/settings/video.tsx`,
`packages/desktop/main/ipc/settings.ts`,
`packages/desktop/renderer/context/userContext.defaults.ts`.

Genuinely greenfield — confirmed via `xbox-xcloud-player`'s
`src/Component/Video.ts`: it's a plain `<video>` element with
`srcObject = stream`, no canvas, no shader, nothing to parameterize.

**Approach:** don't touch the dependency. From `[serverid].tsx`, after
`xPlayer.bind()`, locate the rendered `<video>` element in the DOM (it's
appended into the container div Greenlight owns — poll or use a
`MutationObserver` on `#streamComponent` since the element appears
asynchronously when the video track arrives) and apply a CSS `filter`
(e.g. `contrast()` + `saturate()`, or an SVG `feConvolveMatrix` unsharp-mask
filter referenced via CSS `filter: url(#sharpen)`) driven by a new setting.
Add a strength control under Settings → Video & Audio.

**Quality note for the plan:** CSS/SVG filters are a real but blunter tool
than a custom shader — expect visibly less refined sharpening than
Better xCloud's or v3's WebGPU approach, but it's the proportionate amount
of work for what 0.2.11 actually is. Revisit if/when the app moves to the
v3 rewrite (which already has a real edge-aware WebGPU shader sitting
unused in `packages/player`).

### 2. AV1/HEVC codec selection

**Files:** `packages/desktop/renderer/pages/stream/[serverid].tsx:43`,
`packages/desktop/renderer/pages/settings/streaming.tsx`,
`packages/desktop/renderer/context/userContext.defaults.ts`.

`xbox-xcloud-player`'s `Library.ts` already exposes
`setCodecPreferences(mimeType, options)` as a generic public method —
it's not H.264-specific, it just filters
`RTCRtpReceiver.getCapabilities('video')` by whatever `mimeType` string
you pass. `[serverid].tsx:43` currently hardcodes the call:

```ts
xPlayer.setCodecPreferences('video/H264', { profiles: settings.video_profiles || [] })
```

**Approach:** make the mimeType come from a new setting
(`settings.video_codec`, default `'video/H264'`) instead of the hardcoded
literal. Add a codec dropdown (H.264 / AV1 / HEVC) next to the existing
profile dropdown in Settings → Streaming. No dependency change needed.

**Constraint to document in the UI copy:** this sets a *preference*, not a
guarantee — actual codec used depends on what both Chromium's WebRTC stack
(`RTCRtpReceiver.getCapabilities`) and Microsoft's xCloud/Remote Play
encoder support for that session. First implementation task should log
`RTCRtpReceiver.getCapabilities('video').codecs` to confirm AV1/HEVC
actually show up in Greenlight's Electron/Chromium build before wiring the
UI — if they don't, this feature is blocked on Electron's bundled Chromium
version, not on anything fixable in this codebase.

### 3. Custom per-game touch layouts

**Files:** new component in `packages/desktop/renderer/components/ui/`,
`packages/desktop/renderer/pages/stream/[serverid].tsx`,
`packages/desktop/main/ipc/settings.ts`,
`packages/desktop/main/helpers/titlemanager.ts` (title ID lookup).

Real gap — `xbox-xcloud-player`'s `Component/Video.ts` only wires
`pointermove`/`pointerdown`/`pointerup`/`wheel` listeners (touch-specific
`touchmove`/`touchstart`/`touchend` handlers exist in the source but are
commented out — Pointer Events already unify mouse/touch/pen, so this
isn't a gap in itself). There's no concept of a positioned virtual button
anywhere in the dependency.

**Approach:**
- New overlay component rendered by Greenlight on top of the video
  container (absolutely-positioned divs/buttons, not inside the library's
  DOM subtree — sibling overlay, same pattern as the existing debug/gamebar
  overlays in `streamcomponent.tsx`).
- Each virtual button, on touch, calls
  `xPlayer._inputDriver.pressButton(0, 'A')` (or the equivalent button
  name) — `pressButton(index, button)` is a real method on `GamepadDriver`,
  already used internally for synthetic presses (e.g. the Nexus-via-N-key
  trick). Reuses an existing mechanism instead of inventing a new one.
  Note: `_inputDriver` is underscore-prefixed (private-by-convention, not
  enforced by JS at runtime) — accessing it from Greenlight code works but
  is coupling to an internal, so pin the exact `xbox-xcloud-player` version
  and note this coupling if that dependency ever gets patched/replaced.
- Layout data (button positions/sizes per control) persisted via
  `electron-store` through `main/ipc/settings.ts`, keyed by title ID
  (available from `titlemanager`'s cached title metadata).
- A layout editor (drag-to-position buttons, add/remove/resize) is the
  actual scope-heavy part of this feature — persistence and input dispatch
  are both small once the editor UI exists.

### 4. Screenshot capture

**Files:** `packages/desktop/renderer/pages/stream/[serverid].tsx` or
`streamcomponent.tsx`, new `packages/desktop/main/ipc/*.ts` handler
(pattern matches existing IPC handlers like `settings.ts`).

Smallest feature. On a keybind: locate the `<video>` element in the DOM
(same lookup as Clarity Boost), draw its current frame to an offscreen
`<canvas>` via `drawImage()`, `canvas.toBlob()`, pass the blob to the main
process over IPC, write to disk via Electron's native save dialog. No
dependency changes, no new rendering pipeline.

### 5. Local co-op (Remote Play only)

**Files:** `packages/desktop/renderer/pages/settings/input.tsx`,
`packages/desktop/renderer/context/userContext.defaults.ts`; likely no
`xbox-xcloud-player` changes needed (see below).

This is the one where the dependency already does most of the work.
`Driver/Gamepad.ts`'s `GamepadDriver`:
- `start()` polls `navigator.getGamepads()` every 500ms and already calls
  `sendGamepadAdded`/`sendGamepadRemoved` on the control channel for
  gamepad indices 1-3 (deliberately skips index 0, per an explicit comment
  "we always keep this one connected" — this is multi-controller-aware by
  design, not accidental).
- `requestStates()` already builds an array of per-controller `InputFrame`s
  tagged with `GamepadIndex`, and `run()` sends all of them via
  `queueGamepadStates()` (plural) every frame.

So: local co-op may already work end-to-end today, just never exercised,
because nothing in Greenlight surfaces or invites a second controller.

**Minor bug found, not yet confirmed to matter:** `mapStateLabels()`
falls back to `this._shadowGamepad[0].X` (etc.) for *every* gamepad index
when a button read is `undefined`, not a per-index shadow state. In
practice this fallback only fires when `buttons[n]` is `undefined`, which
shouldn't happen for a real connected controller with a full button set —
likely dead code, not a real bug, but flag it for the validation spike
below to confirm rather than assume.

**Approach:**
1. **Validation spike first** (per original design's flagged risk): connect
   two physical controllers during a real Remote Play session, confirm the
   console/game actually recognizes both as separate players at the
   protocol level. This is the one thing genuinely not verifiable from
   source — it's a Microsoft/console-side behavior, not a Greenlight one.
2. If it works: this feature may reduce to "add a toggle + do nothing else,"
   possibly plus fixing the `mapStateLabels` fallback if the spike reveals
   it actually causes cross-player input bleed.
3. If it doesn't work: re-scope — this may be a hard blocker outside this
   codebase's control (same category as xCloud-side local co-op being
   scoped out already).

## Data flow summary

- Settings (codec preference, clarity boost strength, touch layouts) live
  in a single `settings` object in `electron-store`, read/written wholesale
  through `main/ipc/settings.ts`'s `getSettings`/`setSettings`, surfaced via
  the renderer's `useSettings()` context hook and defaulted in
  `userContext.defaults.ts`.
- Touch layout button presses call `xPlayer._inputDriver.pressButton()`
  directly — not a new channel, reuses the library's existing synthetic
  input path.
- Codec preference is passed to `xPlayer.setCodecPreferences()` once, at
  the same point bitrate is currently set in `[serverid].tsx` — applied at
  offer-creation time, not renegotiable mid-session without reconnecting.
- Clarity Boost and screenshot capture both operate on the DOM `<video>`
  element Greenlight locates after `bind()`, entirely outside the
  dependency's own code.

## Error handling

- Clarity Boost: if the located `<video>` element lookup fails (timing
  issue, DOM structure changed), skip applying the filter rather than
  throwing — stream still works, just unsharpened.
- Codec preference: if the requested codec isn't in
  `RTCRtpReceiver.getCapabilities()`, `xbox-xcloud-player`'s `_setCodec`
  already logs and no-ops rather than failing the session — Greenlight's
  UI should reflect "not supported on this device" rather than silently
  pretending it applied.
- Touch layouts: missing/corrupt layout data for a title falls back to the
  existing blanket touch-input toggle behavior (no custom layout, not "no
  touch").
- Local co-op: if the validation spike finds it doesn't work, the setting
  should not exist yet rather than existing and silently doing nothing.

## Testing

- Codec: verifiable via `RTCRtpReceiver.getStats()`/`getCapabilities()`
  logging — no real console session needed to confirm codec plumbing,
  though confirming xCloud/Remote Play actually serves AV1/HEVC does need
  a live session.
- Clarity Boost: filter application is DOM/CSS logic, testable by
  asserting the filter style value against a mocked video element.
- Touch layouts: overlay positioning and persistence testable without a
  live stream (mock the video element and `_inputDriver`).
- Screenshot: unit-testable in isolation (canvas → blob → IPC write).
- Local co-op: blocked on the hardware validation spike; not meaningfully
  unit-testable before that.
