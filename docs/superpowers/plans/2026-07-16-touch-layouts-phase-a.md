# Custom Touch Layouts — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Greenlight's blanket "Enable Touch input" toggle with actual on-screen touch controls: a zone-based overlay rendering one of 3 built-in presets (Standard, Racing, Minimal), dispatching input via direct `queueGamepadState()` injection so it works regardless of the "Enable Keyboard to Gamepad" setting.

**Architecture:** Two pure, fully-testable modules (preset data, touch-gesture-to-axis/direction math) feed a React overlay component that renders 5 fixed zones over the stream and maintains a held-state `InputFrame` object, pushed to the WebRTC input channel on a 16ms interval — matching the channel's own send cadence, independent of any physical-controller or keyboard-merge code path. A global (not yet per-title — that's Phase B) preset picker lives in Settings → Input.

**Tech Stack:** TypeScript, React (Next.js/Nextron renderer), Electron, mocha + chai + tsx (existing `packages/desktop` test harness).

---

## Context for the engineer

This is a yarn workspace monorepo (`~/Projects/greenlight-fork`, cloned from `github.com/unknownskl/greenlight`). You're modifying `packages/desktop` (the real, shipping Greenlight app), which depends on `xbox-xcloud-player@0.2.11`. Two prior features (Clarity Boost, AV1/HEVC codec selection) are already merged to `main-v2` — read `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md` and `docs/superpowers/specs/2026-07-16-custom-touch-layouts-design.md` for full background before starting; this plan assumes you've read the touch-layout design spec, especially its "Input dispatch" section.

**The one thing you must not get wrong:** input dispatch goes through `xPlayer.getChannelProcessor('input').queueGamepadState(frame)` — a public method that pushes directly onto the WebRTC send queue, unconditionally drained every 16ms. **Do not use `GamepadDriver.pressButton()` or `KeyboardDriver.pressButton()`** — both only fire a 60ms pulse (wrong for "hold to walk" D-pad/button behavior), and the keyboard one is gated behind a setting ("Enable Keyboard to Gamepad") some users disable. The design spec traces exactly why in detail; don't re-derive it, just follow it.

**The real `InputFrame` shape** (from `xbox-xcloud-player`'s `Channel/Input.ts`, this is the complete wire protocol — every field must be present in every frame you send, defaulting to `0`):

```ts
{
    GamepadIndex: number
    Nexus: number; Menu: number; View: number
    A: number; B: number; X: number; Y: number
    DPadUp: number; DPadDown: number; DPadLeft: number; DPadRight: number
    LeftShoulder: number; RightShoulder: number
    LeftThumb: number; RightThumb: number
    LeftThumbXAxis: number; LeftThumbYAxis: number
    RightThumbXAxis: number; RightThumbYAxis: number
    LeftTrigger: number; RightTrigger: number
}
```

Buttons and D-pad directions are `0` or `1`. Triggers and stick axes are floats (`0..1` for triggers, `-1..1` for axes).

**A DOM placement trap specific to this file:** `[serverid].tsx` (the stream page) sets `document.getElementById('streamComponentHolder').innerHTML = '<div id="streamComponent">...'` directly (raw DOM, not React) every time a stream starts — this **wipes out any React-rendered content placed inside `#streamComponentHolder`**. The touch overlay must be rendered as a **sibling** of `#streamComponentHolder`, not a child, or it will be silently destroyed the moment a stream connects. Task 5 covers exactly where.

## File Structure

- Create: `packages/desktop/lib/touchLayouts.ts` — preset data + `getTouchLayoutPreset()`
- Create: `packages/desktop/tests/lib/touchLayouts.spec.ts`
- Create: `packages/desktop/lib/touchGestures.ts` — touch-position-to-stick-axes and touch-position-to-dpad-direction math
- Create: `packages/desktop/tests/lib/touchGestures.spec.ts`
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts` — add `touch_layout_preset: 'standard'`
- Modify: `packages/desktop/renderer/pages/settings/input.tsx` — add the preset dropdown
- Modify: `packages/desktop/renderer/languages/en-US.json` — add the dropdown's strings
- Create: `packages/desktop/renderer/components/ui/touchoverlay.tsx` — the overlay component
- Create: `packages/desktop/renderer/components/ui/touchoverlay.css` — zone positioning
- Modify: `packages/desktop/renderer/components/ui/streamcomponent.tsx` — mount the overlay

---

### Task 1: Touch layout preset data

**Files:**
- Create: `packages/desktop/tests/lib/touchLayouts.spec.ts`
- Create: `packages/desktop/lib/touchLayouts.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/desktop/tests/lib/touchLayouts.spec.ts`:

```ts
import { expect } from 'chai'
import { getTouchLayoutPreset } from '../../lib/touchLayouts'

describe('getTouchLayoutPreset', () => {
    it('returns the standard preset with a movement stick in left-inner', () => {
        const layout = getTouchLayoutPreset('standard')
        expect(layout['left-inner']).to.have.lengthOf(1)
        expect(layout['left-inner'][0]).to.deep.equal({ type: 'stick', input: 'left', label: 'Move' })
    })

    it('returns the standard preset with A/B/Y in right-inner', () => {
        const layout = getTouchLayoutPreset('standard')
        const inputs = layout['right-inner'].map((c) => c.input)
        expect(inputs).to.deep.equal(['A', 'B', 'Y'])
    })

    it('returns the racing preset with a steering stick, not a D-pad', () => {
        const layout = getTouchLayoutPreset('racing')
        expect(layout['left-inner'][0]).to.deep.equal({ type: 'stick', input: 'left', label: 'Steer' })
        expect(layout['left-outer']).to.be.undefined
    })

    it('returns the racing preset with gas mapped to RightTrigger and brake to LeftTrigger', () => {
        const layout = getTouchLayoutPreset('racing')
        expect(layout['right-inner']).to.deep.equal([
            { type: 'button', input: 'RightTrigger', label: 'Gas' },
            { type: 'button', input: 'LeftTrigger', label: 'Brake' },
        ])
    })

    it('returns the minimal preset with only a D-pad and two buttons', () => {
        const layout = getTouchLayoutPreset('minimal')
        expect(layout['left-inner']).to.be.undefined
        expect(layout['left-outer']).to.deep.equal([{ type: 'dpad', input: '', label: 'D-Pad' }])
        expect(layout['right-inner']).to.have.lengthOf(2)
    })

    it('defaults to the standard preset for an unrecognized key', () => {
        expect(getTouchLayoutPreset('made-up-preset')).to.deep.equal(getTouchLayoutPreset('standard'))
    })

    it('defaults to the standard preset for an empty string', () => {
        expect(getTouchLayoutPreset('')).to.deep.equal(getTouchLayoutPreset('standard'))
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && npx mocha`
Expected: FAIL — `Cannot find module '../../lib/touchLayouts'`.

- [ ] **Step 3: Write the implementation**

Create `packages/desktop/lib/touchLayouts.ts`:

```ts
export type ZoneName = 'left-inner' | 'left-outer' | 'right-inner' | 'right-outer' | 'top-right'

export type TouchControlType = 'button' | 'dpad' | 'stick'

export interface TouchControl {
    type: TouchControlType
    // 'button': one InputFrame boolean/trigger field name (e.g. 'A', 'RightTrigger').
    // 'stick': 'left' or 'right', selects which pair of InputFrame axis fields to drive.
    // 'dpad': unused (''), a dpad control always drives all 4 DPad* fields.
    input: string
    label: string
}

export type TouchLayout = Partial<Record<ZoneName, TouchControl[]>>

const STANDARD_LAYOUT: TouchLayout = {
    'left-inner': [{ type: 'stick', input: 'left', label: 'Move' }],
    'left-outer': [{ type: 'dpad', input: '', label: 'D-Pad' }],
    'right-inner': [
        { type: 'button', input: 'A', label: 'A' },
        { type: 'button', input: 'B', label: 'B' },
        { type: 'button', input: 'Y', label: 'Y' },
    ],
    'right-outer': [
        { type: 'button', input: 'RightShoulder', label: 'RB' },
        { type: 'button', input: 'RightTrigger', label: 'RT' },
    ],
}

const RACING_LAYOUT: TouchLayout = {
    'left-inner': [{ type: 'stick', input: 'left', label: 'Steer' }],
    'right-inner': [
        { type: 'button', input: 'RightTrigger', label: 'Gas' },
        { type: 'button', input: 'LeftTrigger', label: 'Brake' },
    ],
    'top-right': [{ type: 'button', input: 'RightShoulder', label: 'Handbrake' }],
}

const MINIMAL_LAYOUT: TouchLayout = {
    'left-outer': [{ type: 'dpad', input: '', label: 'D-Pad' }],
    'right-inner': [
        { type: 'button', input: 'A', label: 'A' },
        { type: 'button', input: 'B', label: 'B' },
    ],
}

const TOUCH_LAYOUT_PRESETS: { [key: string]: TouchLayout } = {
    standard: STANDARD_LAYOUT,
    racing: RACING_LAYOUT,
    minimal: MINIMAL_LAYOUT,
}

/**
 * Looks up a built-in touch layout preset by key. Falls back to the
 * standard preset for anything unrecognized, so a corrupt/missing
 * setting never leaves touch controls empty.
 */
export function getTouchLayoutPreset(preset: string): TouchLayout {
    return TOUCH_LAYOUT_PRESETS[preset] || TOUCH_LAYOUT_PRESETS.standard
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha`
Expected: `7 passing` (plus the pre-existing Clarity Boost + codec tests, so the total will be higher — confirm no failures, don't worry about the exact total).

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/lib/touchLayouts.ts packages/desktop/tests/lib/touchLayouts.spec.ts
git commit -m "feat: add touch layout preset data"
```

---

### Task 2: Touch gesture math

**Files:**
- Create: `packages/desktop/tests/lib/touchGestures.spec.ts`
- Create: `packages/desktop/lib/touchGestures.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/desktop/tests/lib/touchGestures.spec.ts`:

```ts
import { expect } from 'chai'
import { getStickAxes, getDpadDirection } from '../../lib/touchGestures'

describe('getStickAxes', () => {
    it('returns zero axes when touch is at center', () => {
        expect(getStickAxes(100, 100, 100, 100, 50)).to.deep.equal({ x: 0, y: 0 })
    })

    it('returns positive x for a touch to the right of center', () => {
        const result = getStickAxes(100, 100, 125, 100, 50)
        expect(result.x).to.equal(0.5)
        expect(result.y).to.equal(0)
    })

    it('returns positive y for a touch below center (screen-space down)', () => {
        const result = getStickAxes(100, 100, 100, 150, 50)
        expect(result.x).to.equal(0)
        expect(result.y).to.equal(1)
    })

    it('clamps to the unit circle when touch is dragged beyond the radius', () => {
        const result = getStickAxes(100, 100, 200, 100, 50)
        expect(result.x).to.equal(1)
        expect(result.y).to.equal(0)
    })

    it('returns zero axes for a zero radius (defensive)', () => {
        expect(getStickAxes(100, 100, 150, 150, 0)).to.deep.equal({ x: 0, y: 0 })
    })
})

describe('getDpadDirection', () => {
    it('returns all false when touch is exactly at center', () => {
        expect(getDpadDirection(100, 100, 100, 100)).to.deep.equal({ up: false, down: false, left: false, right: false })
    })

    it('detects pure right', () => {
        expect(getDpadDirection(100, 100, 150, 100)).to.deep.equal({ up: false, down: false, left: false, right: true })
    })

    it('detects pure down', () => {
        expect(getDpadDirection(100, 100, 100, 150)).to.deep.equal({ up: false, down: true, left: false, right: false })
    })

    it('detects pure left', () => {
        expect(getDpadDirection(100, 100, 50, 100)).to.deep.equal({ up: false, down: false, left: true, right: false })
    })

    it('detects pure up', () => {
        expect(getDpadDirection(100, 100, 100, 50)).to.deep.equal({ up: true, down: false, left: false, right: false })
    })

    it('detects a diagonal (down-right) as two simultaneous flags', () => {
        expect(getDpadDirection(100, 100, 150, 150)).to.deep.equal({ up: false, down: true, left: false, right: true })
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha`
Expected: FAIL — `Cannot find module '../../lib/touchGestures'`.

- [ ] **Step 3: Write the implementation**

Create `packages/desktop/lib/touchGestures.ts`:

```ts
export interface StickAxes {
    x: number
    y: number
}

/**
 * Converts a touch position relative to a stick control's center into
 * clamped -1..1 axis values matching InputFrame's LeftThumbXAxis/YAxis
 * (or Right* equivalents) convention. +y is down (screen-space), same
 * as how native gamepad axes are already treated elsewhere in this
 * codebase (no inversion applied there either).
 */
export function getStickAxes(centerX: number, centerY: number, touchX: number, touchY: number, radius: number): StickAxes {
    if (radius <= 0) {
        return { x: 0, y: 0 }
    }

    let x = (touchX - centerX) / radius
    let y = (touchY - centerY) / radius

    const magnitude = Math.sqrt(x * x + y * y)
    if (magnitude > 1) {
        x = x / magnitude
        y = y / magnitude
    }

    return { x, y }
}

export interface DpadDirection {
    up: boolean
    down: boolean
    left: boolean
    right: boolean
}

/**
 * Converts a touch position relative to a D-pad control's center into
 * up to 2 simultaneously-active directions (e.g. up+right for a
 * diagonal touch), using 8-way detection: each direction is "active"
 * across a 135-degree arc centered on itself, so adjacent directions
 * overlap by 45 degrees exactly where a diagonal should register both.
 */
export function getDpadDirection(centerX: number, centerY: number, touchX: number, touchY: number): DpadDirection {
    const dx = touchX - centerX
    const dy = touchY - centerY

    if (dx === 0 && dy === 0) {
        return { up: false, down: false, left: false, right: false }
    }

    const angle = Math.atan2(dy, dx) * (180 / Math.PI) // -180..180, 0 = right, 90 = down (screen-space)

    return {
        right: angle > -67.5 && angle <= 67.5,
        down: angle > 22.5 && angle <= 157.5,
        left: angle > 112.5 || angle <= -112.5,
        up: angle > -157.5 && angle <= -22.5,
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha`
Expected: `11 passing` for these two new spec files combined, no failures anywhere.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/lib/touchGestures.ts packages/desktop/tests/lib/touchGestures.spec.ts
git commit -m "feat: add touch gesture math for sticks and D-pad"
```

---

### Task 3: Settings default + preset dropdown

**Files:**
- Modify: `packages/desktop/renderer/context/userContext.defaults.ts`
- Modify: `packages/desktop/renderer/pages/settings/input.tsx`
- Modify: `packages/desktop/renderer/languages/en-US.json`

- [ ] **Step 1: Add the setting default**

In `packages/desktop/renderer/context/userContext.defaults.ts`, add a new key next to `input_touch`:

```ts
    input_touch: false,
    touch_layout_preset: 'standard',
```

- [ ] **Step 2: Add i18n strings**

In `packages/desktop/renderer/languages/en-US.json`, inside the `"input"` object, immediately after `"enableTouch"` (line ~76) and before `"enableMouseKeyboard"`, add:

```json
        "enableTouch": "Enable Touch input",
        "touchLayoutPresetLabel": "Touch Layout Preset",
        "touchLayoutPresetValueStandard": "Standard",
        "touchLayoutPresetValueRacing": "Racing",
        "touchLayoutPresetValueMinimal": "Minimal",
        "enableMouseKeyboard": "Enable Mouse & Keyboard",
```

- [ ] **Step 3: Add the dropdown control**

In `packages/desktop/renderer/pages/settings/input.tsx`, add a new handler function alongside `setTouchInput`:

```ts
    function setTouchLayoutPreset(preset){
        setSettings({
            ...settings,
            touch_layout_preset: preset,
        })
    }
```

Then add a new `<p>` block immediately after the existing "Enable Touch input" `<p>` block (after its closing `</p>`, still inside the same first `<Card>`):

```tsx
                    <p>
                        <label>{t('settings.input.touchLayoutPresetLabel')}</label>
                        <select value={ settings.touch_layout_preset || 'standard' } onChange={ (e) => setTouchLayoutPreset(e.target.value) }>
                            <option value='standard'>{t('settings.input.touchLayoutPresetValueStandard')}</option>
                            <option value='racing'>{t('settings.input.touchLayoutPresetValueRacing')}</option>
                            <option value='minimal'>{t('settings.input.touchLayoutPresetValueMinimal')}</option>
                        </select>
                    </p>
```

Note on quote style: `input.tsx` uses **single-quoted** JSX attributes throughout (confirmed: `type='checkbox'` appears repeatedly in this file) — the code above already uses single quotes correctly, don't change them to double.

- [ ] **Step 4: Manual verification**

Run: `yarn desktop dev` (or `npx yarn@1.22.22 desktop dev` if `yarn` isn't on PATH). If no GUI is available in this environment, run the fallback instead: `npx yarn@1.22.22 lint` from `packages/desktop`, confirm clean, and re-read the JSX against the "Enable Touch input" block for structural/quote-style consistency.

If a GUI is available: navigate to Settings → Input, confirm the new "Touch Layout Preset" dropdown appears right below "Enable Touch input" with 3 options, and that selecting a value persists across an app restart.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/renderer/context/userContext.defaults.ts packages/desktop/renderer/pages/settings/input.tsx packages/desktop/renderer/languages/en-US.json
git commit -m "feat: add touch layout preset setting to Input settings page"
```

---

### Task 4: Touch overlay component

**Files:**
- Create: `packages/desktop/renderer/components/ui/touchoverlay.tsx`
- Create: `packages/desktop/renderer/components/ui/touchoverlay.css`

- [ ] **Step 1: Write the component**

Create `packages/desktop/renderer/components/ui/touchoverlay.tsx`:

```tsx
import React from 'react'
import { getTouchLayoutPreset, TouchControl, ZoneName } from '../../../lib/touchLayouts'
import { getStickAxes, getDpadDirection } from '../../../lib/touchGestures'
import './touchoverlay.css'

interface TouchOverlayProps {
    xPlayer: any
    preset: string
}

const ZONES: ZoneName[] = ['left-inner', 'left-outer', 'right-inner', 'right-outer', 'top-right']

function createEmptyFrame() {
    return {
        GamepadIndex: 0,
        Nexus: 0, Menu: 0, View: 0,
        A: 0, B: 0, X: 0, Y: 0,
        DPadUp: 0, DPadDown: 0, DPadLeft: 0, DPadRight: 0,
        LeftShoulder: 0, RightShoulder: 0,
        LeftThumb: 0, RightThumb: 0,
        LeftThumbXAxis: 0, LeftThumbYAxis: 0,
        RightThumbXAxis: 0, RightThumbYAxis: 0,
        LeftTrigger: 0, RightTrigger: 0,
    }
}

function TouchOverlay({ xPlayer, preset }: TouchOverlayProps) {
    const frameRef = React.useRef(createEmptyFrame())
    const layout = getTouchLayoutPreset(preset)

    React.useEffect(() => {
        const interval = setInterval(() => {
            xPlayer?.getChannelProcessor('input')?.queueGamepadState({ ...frameRef.current })
        }, 16)

        return () => {
            clearInterval(interval)
        }
    }, [xPlayer])

    function handleButtonStart(input: string) {
        frameRef.current[input] = 1
    }

    function handleButtonEnd(input: string) {
        frameRef.current[input] = 0
    }

    function handleStickMove(side: 'left' | 'right', e: React.PointerEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const { x, y } = getStickAxes(centerX, centerY, e.clientX, e.clientY, rect.width / 2)

        if (side === 'left') {
            frameRef.current.LeftThumbXAxis = x
            frameRef.current.LeftThumbYAxis = y
        } else {
            frameRef.current.RightThumbXAxis = x
            frameRef.current.RightThumbYAxis = y
        }
    }

    function handleStickEnd(side: 'left' | 'right') {
        if (side === 'left') {
            frameRef.current.LeftThumbXAxis = 0
            frameRef.current.LeftThumbYAxis = 0
        } else {
            frameRef.current.RightThumbXAxis = 0
            frameRef.current.RightThumbYAxis = 0
        }
    }

    function handleDpadMove(e: React.PointerEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const direction = getDpadDirection(centerX, centerY, e.clientX, e.clientY)

        frameRef.current.DPadUp = direction.up ? 1 : 0
        frameRef.current.DPadDown = direction.down ? 1 : 0
        frameRef.current.DPadLeft = direction.left ? 1 : 0
        frameRef.current.DPadRight = direction.right ? 1 : 0
    }

    function handleDpadEnd() {
        frameRef.current.DPadUp = 0
        frameRef.current.DPadDown = 0
        frameRef.current.DPadLeft = 0
        frameRef.current.DPadRight = 0
    }

    function renderControl(control: TouchControl, key: string) {
        if (control.type === 'stick') {
            const side = control.input as 'left' | 'right'
            return (
                <div
                    key={key}
                    className='touch-control touch-stick'
                    onPointerDown={(e) => handleStickMove(side, e)}
                    onPointerMove={(e) => { if (e.buttons > 0) handleStickMove(side, e) }}
                    onPointerUp={() => handleStickEnd(side)}
                    onPointerLeave={() => handleStickEnd(side)}
                >{control.label}</div>
            )
        }

        if (control.type === 'dpad') {
            return (
                <div
                    key={key}
                    className='touch-control touch-dpad'
                    onPointerDown={handleDpadMove}
                    onPointerMove={(e) => { if (e.buttons > 0) handleDpadMove(e) }}
                    onPointerUp={handleDpadEnd}
                    onPointerLeave={handleDpadEnd}
                >{control.label}</div>
            )
        }

        return (
            <div
                key={key}
                className='touch-control touch-button'
                onPointerDown={() => handleButtonStart(control.input)}
                onPointerUp={() => handleButtonEnd(control.input)}
                onPointerLeave={() => handleButtonEnd(control.input)}
            >{control.label}</div>
        )
    }

    return (
        <div className='touch-overlay'>
            {ZONES.map((zone) => (
                <div key={zone} className={'touch-zone touch-zone-' + zone}>
                    {(layout[zone] || []).map((control, i) => renderControl(control, zone + '-' + i))}
                </div>
            ))}
        </div>
    )
}

export default TouchOverlay
```

Note: `xPlayer?.getChannelProcessor('input')?.queueGamepadState(...)` uses optional chaining defensively — `xPlayer` can legitimately be in a not-yet-bound state during connection setup, and this must never throw and interrupt the interval.

- [ ] **Step 2: Write the CSS**

Create `packages/desktop/renderer/components/ui/touchoverlay.css`:

Note: `streamcomponent.css` positions every existing overlay (the video
container, the debug panel, the gamebar) with `position: fixed` and a
z-index ladder (video = 95/96, debug = 97, gamebar = 98) — not
`position: relative` ancestors with `position: absolute` children. Match
that convention; the CSS below uses `position: fixed` and picks `z-index:
99` (above all three existing layers), since touch controls are the
primary gameplay interaction surface and must never be visually or
functionally blocked by the debug panel or gamebar, both of which are
normally hidden/auto-hidden during actual play anyway.

```css
.touch-overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
    pointer-events: none;
}

.touch-zone {
    position: absolute;
    display: flex;
    gap: 12px;
    pointer-events: none;
}

.touch-zone-left-inner {
    bottom: 8%;
    left: 6%;
}

.touch-zone-left-outer {
    top: 12%;
    left: 6%;
}

.touch-zone-right-inner {
    bottom: 8%;
    right: 6%;
    flex-direction: column-reverse;
    align-items: flex-end;
}

.touch-zone-right-outer {
    top: 12%;
    right: 6%;
}

.touch-zone-top-right {
    top: 2%;
    right: 6%;
}

.touch-control {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.12);
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    user-select: none;
    touch-action: none;
}

.touch-stick {
    width: 96px;
    height: 96px;
}

.touch-dpad {
    width: 84px;
    height: 84px;
    border-radius: 8px;
}

.touch-button {
    width: 56px;
    height: 56px;
}
```

Exact pixel sizing and zone positioning here is a starting point, not a final answer — this is genuinely a visual/feel question that needs to be judged on an actual touchscreen, same category as things flagged for manual verification elsewhere in this plan. Don't spend more time hand-tuning CSS values without being able to see it rendered.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/renderer/components/ui/touchoverlay.tsx packages/desktop/renderer/components/ui/touchoverlay.css
git commit -m "feat: add touch overlay component"
```

---

### Task 5: Mount the overlay in the stream

**Files:**
- Modify: `packages/desktop/renderer/components/ui/streamcomponent.tsx`

- [ ] **Step 1: Import what's needed**

In `packages/desktop/renderer/components/ui/streamcomponent.tsx`, add to the imports:

```ts
import TouchOverlay from './touchoverlay'
import { useSettings } from '../../context/userContext'
```

- [ ] **Step 2: Read settings inside the component**

Find the top of the `StreamComponent` function body (where `const { t } = useTranslation()` is declared) and add:

```ts
    const { settings } = useSettings()
```

- [ ] **Step 3: Mount the overlay as a sibling of `#streamComponentHolder`, not a child**

Find the returned JSX. It currently looks like:

```tsx
    return (
        <React.Fragment>
            <div>
                <div id="streamComponentHolder">
                </div>

                <div id="component_streamcomponent_loader">
```

**Critical:** `[serverid].tsx` sets `#streamComponentHolder`'s `innerHTML` directly via raw DOM manipulation every time a stream connects — anything rendered *inside* that div by React gets wiped out. Add the `TouchOverlay` as a sibling immediately after the `#streamComponentHolder` div closes, not inside it:

```tsx
    return (
        <React.Fragment>
            <div>
                <div id="streamComponentHolder">
                </div>

                { settings.input_touch ? <TouchOverlay xPlayer={ xPlayer } preset={ settings.touch_layout_preset } /> : null }

                <div id="component_streamcomponent_loader">
```

This only renders the overlay when the existing "Enable Touch input" setting is on — no new top-level toggle, matches the design spec's scope decision. No positioning changes are needed on the wrapping `<div>` itself: `touchoverlay.css` uses `position: fixed; inset: 0;` (confirmed to match this file's existing convention — `streamcomponent.css` positions the video container, debug panel, and gamebar the same way, not via a `position: relative` ancestor), so the overlay sizes itself against the viewport directly, same as its siblings already do.

- [ ] **Step 4: Manual verification**

Same environment caveat as every prior DOM/UI task in this project: needs a live Electron GUI, ideally an actual touchscreen or Chrome DevTools' touch-emulation mode, and a real stream session. If unavailable, do what you can: confirm lint passes, confirm `TouchOverlay` only renders when `settings.input_touch` is true by re-reading the conditional, and confirm the sibling (not child) placement relative to `#streamComponentHolder` by re-reading the JSX structure carefully — this placement detail is the one thing in this task most likely to silently break if placed wrong (renders fine on first load, then vanishes the moment a stream actually connects and the raw `innerHTML` assignment fires), so trace through the timing explicitly rather than just checking it compiles.

If a GUI/touchscreen is available: enable touch input, pick each of the 3 presets in Settings, connect to a stream, and confirm the on-screen controls appear, respond to touch, and that holding a D-pad direction or dragging the stick actually moves/acts continuously rather than pulsing once.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/renderer/components/ui/streamcomponent.tsx
git commit -m "feat: mount touch overlay in the stream component"
```

---

## Self-Review Notes

- **Spec coverage:** covers the "Phase A scope" list in `docs/superpowers/specs/2026-07-16-custom-touch-layouts-design.md` in full: zone-based rendering, 3 presets, global Settings dropdown (not an in-stream picker, per the follow-up scope decision), held-state dispatch via `queueGamepadState()`, gated on the existing `input_touch` setting.
- **No placeholders:** all code blocks are complete; the CSS is explicitly flagged as a starting point needing visual tuning rather than presented as finished, matching how this plan treats every other unautomatable visual/DOM verification step.
- **Type consistency:** `getTouchLayoutPreset(preset: string): TouchLayout` (Task 1), `getStickAxes(...)`/`getDpadDirection(...)` (Task 2), and `TouchControl`/`ZoneName` types are defined once and imported with identical names/signatures in Task 4 — no renaming across tasks.
- **The DOM placement trap** (sibling vs child of `#streamComponentHolder`) is called out explicitly in both the shared context section and Task 5's own steps, since it's the one mistake in this plan that would compile clean, look fine on first render, and then silently break the moment a real stream connects — exactly the kind of bug that's cheap to prevent by stating it plainly and expensive to debug after the fact.
