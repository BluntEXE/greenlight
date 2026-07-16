# Clarity Boost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-adjustable video sharpening/clarity setting to Greenlight, matching Better xCloud's "Clarity Boost" feature, using a CSS filter applied to the stream's `<video>` element.

**Architecture:** A pure function computes a CSS `filter` string from a 0-1 strength setting (unit-testable, no DOM/Electron dependencies). The strength setting is stored/read through Greenlight's existing `electron-store`-backed settings system and exposed as a slider on the Settings → Video & Audio page. `[serverid].tsx` (the stream page) locates the `<video>` element rendered by the `xbox-xcloud-player` dependency after `xPlayer.bind()` and applies the computed filter string to it directly — no changes to the dependency itself.

**Tech Stack:** TypeScript, React (Next.js/Nextron renderer), Electron, mocha + chai + tsx (new to `packages/desktop`, already used in `packages/player`).

---

## Context for the engineer

This is a yarn workspace monorepo (`~/Projects/greenlight-fork`, cloned from `github.com/unknownskl/greenlight`). The app you're actually modifying is `packages/desktop` (package name `greenlight-desktop`, currently version 2.4.2) — **not** `packages/player` or `packages/desktop-v3`, which are an unreleased 3.0.0-alpha rewrite that a different, larger investigation in this project mistakenly targeted first. `packages/desktop` depends on a separate npm package, `xbox-xcloud-player` (pinned `^0.2.11`), which does the actual WebRTC/video-rendering work. That package renders a plain `<video>` element with no shader or canvas pipeline — there is nothing existing to repurpose here, this is genuinely new code.

`packages/desktop` currently has **no working test runner** — `"test"` in its `package.json` is a no-op stub (`echo "Error: no test specified" && exit 0"`), and the one `.spec.ts` file present (`tests/boot.spec.ts`) is a Playwright E2E test that launches the full Electron app and needs real Xbox credentials — not something to run per-task. `packages/player` already has a working mocha+chai+tsx unit test setup; Task 1 replicates that same setup in `packages/desktop` for the one piece of this feature that's actually pure-function-testable.

The DOM-wiring part (finding the `<video>` element, applying the filter) can't be meaningfully unit-tested without a real Electron renderer process — those steps are manual-verification, not automated, and are called out explicitly as such rather than faked.

## File Structure

- Create: `packages/desktop/lib/clarityBoost.ts` — pure function, strength (0-1) → CSS filter string
- Create: `packages/desktop/tests/lib/clarityBoost.spec.ts` — unit tests for the above
- Create: `packages/desktop/.mocharc.json` — test runner config (copy of `packages/player`'s)
- Modify: `packages/desktop/package.json` — add `mocha`/`chai`/`tsx` devDependencies, fix the `test` script
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts` — add `clarity_boost_strength: 0` default
- Modify: `packages/desktop/renderer/pages/settings/video.tsx` — add the strength slider control
- Modify: `packages/desktop/renderer/languages/en-US.json` — add the slider's label strings
- Modify: `packages/desktop/renderer/pages/stream/[serverid].tsx` — locate the `<video>` element and apply the computed filter

---

### Task 1: Test harness for `packages/desktop`

**Files:**
- Create: `packages/desktop/.mocharc.json`
- Modify: `packages/desktop/package.json`

- [ ] **Step 1: Add test tooling to `packages/desktop/package.json`**

Open `packages/desktop/package.json`. In `"devDependencies"`, add (matching the exact versions already used in `packages/player/package.json`):

```json
    "chai": "^6.2.1",
    "mocha": "^11.7.5",
    "tsx": "^4.21.0",
    "@types/chai": "^5.2.3",
    "@types/mocha": "^10.0.10",
```

Replace the existing `"test"` script line:

```json
    "test": "echo \"Error: no test specified\" && exit 0",
```

with:

```json
    "test": "mocha",
```

- [ ] **Step 2: Create the mocha config**

Create `packages/desktop/.mocharc.json`. Note: unlike `packages/player`'s
config, the spec glob is narrowed to `tests/lib/**/*.spec.ts` rather than
`tests/**/*.spec.ts` — `packages/desktop/tests/boot.spec.ts` is a
pre-existing Playwright e2e test that would otherwise match the same glob
and crash mocha trying to load `@playwright/test` as a unit test file:

```json
{
    "extension": ["ts"],
    "spec": "tests/lib/**/*.spec.ts",
    "require": "tsx"
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd packages/desktop && yarn install`
Expected: completes without errors, `node_modules/.bin/mocha` and `node_modules/.bin/tsx` exist.

- [ ] **Step 4: Verify the runner executes (no tests yet)**

Run: `yarn workspace greenlight-desktop test`
Expected output: mocha 11.7.5 errors with `Error: No test files found: "tests/lib/**/*.spec.ts"` (exit code 1) — this version has no flag to tolerate a zero-match glob (verified: `packages/player`'s existing, already-working mocha config produces the identical error today, since it also has no test files yet). That error is the correct, expected state here — it confirms mocha itself runs and resolves the config correctly. Task 2 adds the real test file immediately after, which will make it pass for real.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/package.json packages/desktop/.mocharc.json packages/desktop/yarn.lock
git commit -m "test: add mocha test runner to packages/desktop"
```

---

### Task 2: `getClarityBoostFilter` pure function

**Files:**
- Create: `packages/desktop/tests/lib/clarityBoost.spec.ts`
- Create: `packages/desktop/lib/clarityBoost.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/desktop/tests/lib/clarityBoost.spec.ts`:

```ts
import { expect } from 'chai'
import { getClarityBoostFilter } from '../../lib/clarityBoost'

describe('getClarityBoostFilter', () => {
    it('returns an empty string (no filter) at strength 0', () => {
        expect(getClarityBoostFilter(0)).to.equal('')
    })

    it('returns a mid-strength filter at strength 0.5', () => {
        expect(getClarityBoostFilter(0.5)).to.equal('contrast(1.10) saturate(1.05)')
    })

    it('returns the max-strength filter at strength 1', () => {
        expect(getClarityBoostFilter(1)).to.equal('contrast(1.20) saturate(1.10)')
    })

    it('clamps negative strength to 0 (no filter)', () => {
        expect(getClarityBoostFilter(-0.5)).to.equal('')
    })

    it('clamps strength above 1 to the max-strength filter', () => {
        expect(getClarityBoostFilter(1.5)).to.equal('contrast(1.20) saturate(1.10)')
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace greenlight-desktop test`
Expected: FAIL — `Cannot find module '../../lib/clarityBoost'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/desktop/lib/clarityBoost.ts`:

```ts
/**
 * Computes a CSS `filter` value approximating Better xCloud's "Clarity Boost"
 * for a plain <video> element. `strength` is 0 (off) to 1 (max).
 * Contrast scales 1.00-1.20, saturation scales 1.00-1.10.
 */
export function getClarityBoostFilter(strength: number): string {
    const clamped = Math.min(1, Math.max(0, strength))

    if (clamped === 0) {
        return ''
    }

    const contrast = (1 + 0.2 * clamped).toFixed(2)
    const saturate = (1 + 0.1 * clamped).toFixed(2)

    return `contrast(${contrast}) saturate(${saturate})`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace greenlight-desktop test`
Expected: `5 passing`.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/lib/clarityBoost.ts packages/desktop/tests/lib/clarityBoost.spec.ts
git commit -m "feat: add getClarityBoostFilter pure function"
```

---

### Task 3: Settings default + Settings UI slider

**Files:**
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts`
- Modify: `packages/desktop/renderer/pages/settings/video.tsx`
- Modify: `packages/desktop/renderer/languages/en-US.json`

- [ ] **Step 1: Add the setting default**

In `packages/desktop/renderer/context/userContext.defaults.ts`, add a new key to the `defaultSettings` object (alongside `app_lowresolution`):

```ts
    app_lowresolution: false,
    clarity_boost_strength: 0,
```

- [ ] **Step 2: Add i18n strings**

In `packages/desktop/renderer/languages/en-US.json`, inside the `"videoAudio"` object (after `"forceLowResDescription"`, before `"audioTitle"`), add:

```json
        "forceLowResDescription": "(This option is useful on the Steam Deck and enables the application to render in a low resolution so FSR can be enabled.)",
        "clarityBoostLabel": "Clarity Boost",
        "clarityBoostDescription": "(Sharpens the video image. Higher values increase contrast and color saturation.)",
        "audioTitle": "Audio",
```

- [ ] **Step 3: Add the slider control**

In `packages/desktop/renderer/pages/settings/video.tsx`, add a new handler function alongside `setVideoSize`:

```ts
    function setClarityBoost(e){
        setSettings({
            ...settings,
            clarity_boost_strength: parseFloat(e.target.value),
        })
    }
```

Then add a new `<p>` block in the first `<Card>`, after the "Force low resolution video" block (after the `</p>` following `forceLowResDescription`, before the closing `</Card>`):

```tsx
                    <p>
                        <label>{t('settings.videoAudio.clarityBoostLabel')}</label>
                        <input type="range" min="0" max="1" step="0.05" value={settings.clarity_boost_strength} onChange={ setClarityBoost } />
                        ({ settings.clarity_boost_strength })
                        <br />
                        <small>{t('settings.videoAudio.clarityBoostDescription')}</small>
                    </p>
```

- [ ] **Step 4: Manual verification**

Run: `yarn desktop dev`
Expected: app launches. Navigate to Settings → Video & Audio. Confirm a "Clarity Boost" slider appears below "Force low resolution video", moves between 0 and 1 in steps of 0.05, and shows the current value next to it. Restart the app and confirm the value persists (it's read from `electron-store` via the existing `getSettings`/`setSettings` IPC round-trip already used by every other setting on this page).

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/renderer/context/userContext.defaults.ts packages/desktop/renderer/pages/settings/video.tsx packages/desktop/renderer/languages/en-US.json
git commit -m "feat: add Clarity Boost setting to Video & Audio settings page"
```

---

### Task 4: Apply the filter to the live stream

**Files:**
- Modify: `packages/desktop/renderer/pages/stream/[serverid].tsx`

- [ ] **Step 1: Import the pure function**

In `packages/desktop/renderer/pages/stream/[serverid].tsx`, add to the top imports:

```ts
import { getClarityBoostFilter } from '../../../lib/clarityBoost'
```

- [ ] **Step 2: Locate the video element and apply the filter**

The `<video>` element is created asynchronously by `xbox-xcloud-player` inside the container div (`id="streamComponent"`) once the WebRTC video track arrives — it doesn't exist immediately after `xPlayer.bind()` returns. Use a `MutationObserver` to catch it as soon as it's added, matching the existing effect block structure. In the same `React.useEffect` block that calls `xPlayer.bind()` (right after the `xPlayer.setControllerRumble(settings.controller_vibration)` line), add:

```ts
            const streamHolder = document.getElementById('streamComponent')
            if (streamHolder) {
                const applyFilterIfPresent = () => {
                    const videoElement = streamHolder.querySelector('video')
                    if (videoElement) {
                        videoElement.style.filter = getClarityBoostFilter(settings.clarity_boost_strength)
                        return true
                    }
                    return false
                }

                if (!applyFilterIfPresent()) {
                    const observer = new MutationObserver(() => {
                        if (applyFilterIfPresent()) {
                            observer.disconnect()
                        }
                    })
                    observer.observe(streamHolder, { childList: true, subtree: true })
                }
            }
```

If `streamHolder` is `null` (DOM not ready yet, or structure changed), this block is skipped entirely — the stream still plays, just unfiltered. This matches the design spec's error-handling requirement: never block the stream over a missing filter target.

- [ ] **Step 3: Manual verification**

Run: `yarn desktop dev`, connect to an active Remote Play or xCloud session with Clarity Boost set to a non-zero value in Settings first. Once the stream is playing, open Electron DevTools (the app already has a debug overlay reachable via the bug icon in the in-stream gamebar — DevTools is separate, use the app's existing dev-mode shortcut) and inspect the `<video>` element's computed `style.filter` — confirm it matches the value `getClarityBoostFilter` would produce for the configured strength. Visually confirm the stream looks sharper/more saturated at higher strength values and unmodified at strength 0.

- [ ] **Step 4: Commit**

```bash
git add "packages/desktop/renderer/pages/stream/[serverid].tsx"
git commit -m "feat: apply Clarity Boost CSS filter to the stream video element"
```

---

## Self-Review Notes

- **Spec coverage:** covers the Clarity Boost section of `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md` in full — pure-function approach, Settings UI, DOM-filter application, fail-open error handling.
- **No placeholders:** all code blocks are complete and copy-pasteable; manual-verification steps are labeled as such rather than presented as automated tests, since no DOM/Electron test harness exists in this package to genuinely automate them.
- **Type consistency:** `getClarityBoostFilter(strength: number): string` is defined once in Task 2 and imported with that exact name/signature in Task 4 — no renaming across tasks.
