# AV1/HEVC Codec Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users prefer AV1 or HEVC over H.264 for the video stream codec, matching Better xCloud's codec-selection feature, by extending Greenlight's existing (but H.264-only) codec preference call to accept a user-chosen codec family.

**Architecture:** A small pure function maps a friendly codec key (`'h264' | 'av1' | 'hevc'`) to the WebRTC mimeType string the `xbox-xcloud-player` dependency's already-generic `setCodecPreferences(mimeType, options)` method expects. The setting is stored/read through Greenlight's existing settings system and exposed as a dropdown on the Settings → Streaming page, next to the existing H.264 profile dropdown. The stream page's call site is updated to use the user's chosen codec instead of a hardcoded `'video/H264'` literal, and its trigger condition is corrected so codec selection actually takes effect even when no H.264 profile is set.

**Tech Stack:** TypeScript, React (Next.js/Nextron renderer), Electron, mocha + chai + tsx (test harness already added to `packages/desktop` by the prior Clarity Boost feature).

---

## Context for the engineer

This is a yarn workspace monorepo (`~/Projects/greenlight-fork`, cloned from `github.com/unknownskl/greenlight`). You're modifying `packages/desktop` (the real, currently-shipping Greenlight app), which depends on a separate npm package, `xbox-xcloud-player` (pinned `^0.2.11`). That dependency already exposes a fully generic method:

```ts
// xbox-xcloud-player's Library.ts (do not modify this dependency)
setCodecPreferences(mimeType: string, options?: { profiles: Array<any> }): void
```

It filters `RTCRtpReceiver.getCapabilities('video')` by whatever `mimeType` string you pass — it is not H.264-specific despite the only current caller hardcoding `'video/H264'`. Read `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md`'s "AV1/HEVC codec selection" section for the full background on why this is a small feature relative to the original estimate.

**Current call site**, `packages/desktop/renderer/pages/stream/[serverid].tsx:44-46`:

```ts
            if(settings.video_profiles.length > 0){
                xPlayer.setCodecPreferences('video/H264', { profiles: settings.video_profiles || [] }) // 4d = high, 42e = mid, 420 = low
            }
```

**Important existing-behavior wrinkle you must preserve while fixing:** today, `setCodecPreferences` is only called at all when `settings.video_profiles.length > 0` — i.e., purely to support the existing H.264 profile picker. If you naively just swap in a dynamic mimeType without touching this guard, a user who selects AV1 or HEVC (but never touches the unrelated H.264 profile dropdown) would have their codec preference silently ignored, because the call would never fire. Task 3 fixes this by widening the guard to also fire when a non-default codec is selected — this is a real, deliberate behavior change, not a refactor, and is called out explicitly in that task so a reviewer doesn't mistake it for scope creep.

There is no existing test infrastructure for renderer UI components or for anything requiring a real Electron/Chromium runtime (confirmed during the prior Clarity Boost feature) — `RTCRtpReceiver` is a browser API unavailable in Node/mocha. The pure mapping function in Task 1 is fully unit-testable; the runtime question of whether AV1/HEVC actually show up in `RTCRtpReceiver.getCapabilities('video').codecs` for this Electron build is not something any task here can automate — it's called out as a manual verification step in Task 3, same treatment as the Clarity Boost plan gave to its own unautomatable DOM/runtime checks.

## File Structure

- Create: `packages/desktop/lib/codecPreference.ts` — pure function, codec key → WebRTC mimeType string
- Create: `packages/desktop/tests/lib/codecPreference.spec.ts` — unit tests for the above
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts` — add `video_codec: 'h264'` default
- Modify: `packages/desktop/renderer/pages/settings/streaming.tsx` — add the codec dropdown
- Modify: `packages/desktop/renderer/languages/en-US.json` — add the dropdown's label/option strings
- Modify: `packages/desktop/renderer/pages/stream/[serverid].tsx` — use the selected codec, fix the trigger guard

---

### Task 1: `getCodecMimeType` pure function

**Files:**
- Create: `packages/desktop/tests/lib/codecPreference.spec.ts`
- Create: `packages/desktop/lib/codecPreference.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/desktop/tests/lib/codecPreference.spec.ts`:

```ts
import { expect } from 'chai'
import { getCodecMimeType } from '../../lib/codecPreference'

describe('getCodecMimeType', () => {
    it('maps "h264" to the H.264 mimeType', () => {
        expect(getCodecMimeType('h264')).to.equal('video/H264')
    })

    it('maps "av1" to the AV1 mimeType', () => {
        expect(getCodecMimeType('av1')).to.equal('video/AV1')
    })

    it('maps "hevc" to the H.265/HEVC mimeType', () => {
        expect(getCodecMimeType('hevc')).to.equal('video/H265')
    })

    it('defaults to H.264 for an empty string', () => {
        expect(getCodecMimeType('')).to.equal('video/H264')
    })

    it('defaults to H.264 for an unrecognized value', () => {
        expect(getCodecMimeType('vp9')).to.equal('video/H264')
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && npx mocha` (or `yarn workspace greenlight-desktop test` if `yarn` is on PATH)
Expected: FAIL — `Cannot find module '../../lib/codecPreference'`.

- [ ] **Step 3: Write the implementation**

Create `packages/desktop/lib/codecPreference.ts`:

```ts
const CODEC_MIME_TYPES: { [key: string]: string } = {
    h264: 'video/H264',
    av1: 'video/AV1',
    hevc: 'video/H265',
}

/**
 * Maps a friendly codec key to the WebRTC mimeType string
 * xbox-xcloud-player's setCodecPreferences() expects. Falls back to
 * H.264 for anything unrecognized so a corrupt/missing setting never
 * breaks stream negotiation.
 */
export function getCodecMimeType(codec: string): string {
    return CODEC_MIME_TYPES[codec] || CODEC_MIME_TYPES.h264
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha`
Expected: `5 passing`.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/lib/codecPreference.ts packages/desktop/tests/lib/codecPreference.spec.ts
git commit -m "feat: add getCodecMimeType pure function"
```

---

### Task 2: Settings default + Settings UI dropdown

**Files:**
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts`
- Modify: `packages/desktop/renderer/pages/settings/streaming.tsx`
- Modify: `packages/desktop/renderer/languages/en-US.json`

- [ ] **Step 1: Add the setting default**

In `packages/desktop/renderer/context/userContext.defaults.ts`, add a new key next to `video_profiles`:

```ts
    video_profiles: [],
    video_codec: 'h264',
```

- [ ] **Step 2: Add i18n strings**

In `packages/desktop/renderer/languages/en-US.json`, inside the `"streaming"` object, immediately after the four `setH264ProfileValue*` keys (`setH264ProfileValueLow`) and before `"forceRegionTitle"`, add:

```json
        "setH264ProfileValueLow": "Low",
        "setVideoCodecLabel": "Preferred Video Codec",
        "setVideoCodecValueH264": "H.264 (default)",
        "setVideoCodecValueAV1": "AV1",
        "setVideoCodecValueHEVC": "HEVC (H.265)",
        "forceRegionTitle": "Force region",
```

- [ ] **Step 3: Add the dropdown control**

In `packages/desktop/renderer/pages/settings/streaming.tsx`, add a new handler function alongside `setVideoProfile`:

```ts
    function setVideoCodec(codec){
        console.log('Set video codec to:', codec)
        setSettings({
            ...settings,
            video_codec: codec,
        })
    }
```

Then add a new `<p>` block in the first `<Card>`, immediately after the existing "Set H.264 Profile" `<p>` block (after its closing `</p>`, before the Card's closing `</Card>`):

```tsx
                    <p>
                        <label>{t('settings.streaming.setVideoCodecLabel')}</label>
                        <select value={ settings.video_codec || 'h264' } onChange={ (e) => setVideoCodec(e.target.value) }>
                            <option value="h264">{t('settings.streaming.setVideoCodecValueH264')}</option>
                            <option value="av1">{t('settings.streaming.setVideoCodecValueAV1')}</option>
                            <option value="hevc">{t('settings.streaming.setVideoCodecValueHEVC')}</option>
                        </select>
                    </p>
```

Note on quote style: `streaming.tsx` uses **double-quoted** JSX attributes for its existing `<option value="...">` elements (confirmed by reading the file — e.g. the H.264 profile and region dropdowns just above/below this insertion point), unlike `video.tsx` (single-quoted), which the Clarity Boost feature got wrong in its first pass and had to fix in review. The code block above already uses double quotes correctly — keep it that way, don't "fix" it to single quotes.

- [ ] **Step 4: Manual verification**

Run: `yarn desktop dev` (or `npx yarn@1.22.22 desktop dev` if `yarn` isn't on PATH). If a live Electron GUI window isn't available in this environment (no display), skip to the fallback verification below rather than forcing it.

Fallback verification (if no GUI available): run the project's lint (`npx yarn@1.22.22 lint` from `packages/desktop`) and confirm it passes clean on all three touched files; re-read the JSX against the existing "Set H.264 Profile" dropdown to confirm structural and quote-style consistency.

If a GUI is available: navigate to Settings → Streaming, confirm the new "Preferred Video Codec" dropdown appears below "Set H.264 Profile" with three options (H.264/AV1/HEVC), and that selecting a value persists across an app restart (same `electron-store` round-trip every other setting on this page already uses).

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/renderer/context/userContext.defaults.ts packages/desktop/renderer/pages/settings/streaming.tsx packages/desktop/renderer/languages/en-US.json
git commit -m "feat: add preferred video codec setting to Streaming settings page"
```

---

### Task 3: Wire the selected codec into the stream, fix the trigger guard

**Files:**
- Modify: `packages/desktop/renderer/pages/stream/[serverid].tsx`

- [ ] **Step 1: Import the pure function**

In `packages/desktop/renderer/pages/stream/[serverid].tsx`, add to the top imports:

```ts
import { getCodecMimeType } from '../../../lib/codecPreference'
```

- [ ] **Step 2: Replace the hardcoded codec call and fix the trigger guard**

Find the existing block (currently around lines 44-46):

```ts
            if(settings.video_profiles.length > 0){
                xPlayer.setCodecPreferences('video/H264', { profiles: settings.video_profiles || [] }) // 4d = high, 42e = mid, 420 = low
            }
```

Replace it with:

```ts
            const codecMimeType = getCodecMimeType(settings.video_codec)
            if(settings.video_profiles.length > 0 || codecMimeType !== 'video/H264'){
                xPlayer.setCodecPreferences(codecMimeType, { profiles: settings.video_profiles || [] }) // profiles only meaningfully filter H.264; harmless no-op for AV1/HEVC
            }
```

This is a deliberate behavior change, not a pure refactor: previously, `setCodecPreferences` was only invoked when an H.264 profile was set (its sole original purpose). Now it also fires whenever the user has selected a non-default codec (`video_codec !== 'h264'`), even with no profile set — otherwise a user who picks AV1/HEVC without touching the unrelated profile dropdown would have their choice silently ignored. When `video_codec` is `'h264'` (the default) and no profile is set, behavior is unchanged from today — the call still doesn't fire, matching existing default behavior exactly.

- [ ] **Step 3: Manual verification**

Same environment caveat as prior tasks: this needs a live Electron GUI, a real Xbox Remote Play/xCloud session, and real credentials, none of which exist in a sandboxed/headless environment — do not fake this if unavailable, report clearly what could and couldn't be checked.

If a GUI/live session is available:
1. Open Electron DevTools during an active stream and run `RTCRtpReceiver.getCapabilities('video').codecs.map(c => c.mimeType)` in the console. Confirm whether `'video/AV1'` and/or `'video/H265'` actually appear in this Electron build's Chromium — if neither does, that's a hard platform limitation (Electron's bundled Chromium version), not a bug in this code, and should be reported as such rather than treated as a failure to fix.
2. If they do appear: set the codec preference to AV1 in Settings, reconnect, and check `RTCRtpReceiver.getStats()` (or the existing debug overlay, if it surfaces codec info) to confirm the negotiated codec actually changed.
3. Confirm setting the codec back to H.264 (or leaving profiles set with the H.264 default) still behaves exactly as it did before this change — no regression to the existing profile-forcing feature.

If no GUI is available, do the checks you can: confirm the lint passes, confirm the guard logic reads correctly by tracing through both cases (default codec + no profile → no call, same as before; non-default codec + no profile → call now fires; default codec + profile set → call fires, same as before), and report explicitly that the live RTCRtpReceiver/codec-negotiation check could not be performed in this environment.

- [ ] **Step 4: Commit**

```bash
git add "packages/desktop/renderer/pages/stream/[serverid].tsx"
git commit -m "feat: apply preferred codec setting, fire codec preference without requiring a profile"
```

---

## Self-Review Notes

- **Spec coverage:** covers the "AV1/HEVC codec selection" section of `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md` in full: pure mapping function, Settings UI, wired call site, and the documented "preference not guarantee" constraint is reflected in Task 3's manual-verification framing (a missing codec in `getCapabilities()` is a platform limit, not a bug to chase).
- **No placeholders:** all code blocks are complete and copy-pasteable; manual-verification steps are explicitly labeled as such, with a fallback path for when no GUI/live session is available, matching how the Clarity Boost plan handled the same environment constraint.
- **Type consistency:** `getCodecMimeType(codec: string): string` is defined once in Task 1 and imported with that exact name/signature in Task 3 — no renaming across tasks.
- **Deviation flagged in advance:** Task 3's guard-condition change is called out explicitly as a deliberate behavior fix, not scope creep, so it doesn't get flagged as an unrequested change during spec compliance review.
