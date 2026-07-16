# Screenshot Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users capture a screenshot of the current stream via a gamebar button or a keybind, auto-saved silently to `Pictures/Greenlight/` — no save dialog, no interruption to the stream.

**Architecture:** The renderer locates the live `<video>` element, draws its current frame to an offscreen `<canvas>`, and converts it to a base64 PNG data URL. That string is sent over the existing generic Electron IPC channel pattern to a new main-process handler, which decodes it and writes the file to `app.getPath('pictures')/Greenlight/greenlight-<timestamp>.png`, creating the folder if it doesn't exist.

**Tech Stack:** TypeScript, React (renderer), Electron main process (Node `fs`/`path`, Electron `app.getPath`).

---

## Context for the engineer

This is a yarn workspace monorepo (`~/Projects/greenlight-fork`, cloned from `github.com/unknownskl/greenlight`). You're modifying `packages/desktop` (the real, shipping Greenlight app). Three prior features (Clarity Boost, AV1/HEVC codec selection, custom touch layouts Phase A) are already merged to `main-v2`.

**Design correction already made before this plan was written:** the original design spec draft said screenshots would save via "Electron's native save dialog." That was wrong — checked the actual codebase, and `dialog` is only ever used here for blocking message/error boxes (`main/authentication.ts`, `main/helpers/updater.ts`), never a save-file prompt. A save dialog popping up over the stream on every screenshot would be bad UX no real game does that. The corrected, current design (in `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md`) auto-saves silently, matching Steam/Xbox screenshot-hotkey conventions. Follow that, not the original literal spec wording if you happen to read the git history.

**No automated tests in this plan.** Every prior feature in this project extracted pure, DOM-free logic into `lib/*.ts` and TDD'd it. This feature has no such logic — it's entirely DOM canvas capture (needs a real `<video>` element with actual pixel data) and real filesystem I/O (needs a real Electron `app` object and a real disk). There's no meaningful pure function to extract, and no main-process test infrastructure exists anywhere in this codebase to begin with (confirmed: zero `.spec.ts` files under `packages/desktop/main/`). This is a deliberate scope decision, not an oversight — manual verification is the correct bar here, same as every DOM-timing detail in prior features that couldn't be automated.

**IPC pattern reference:** every existing IPC handler (e.g. `packages/desktop/main/ipc/settings.ts`) extends `IpcBase`, defines methods that return `Promise`s, and gets registered by name in `packages/desktop/main/ipc.ts`'s `_channels` map. The renderer calls it via `Ipc.send('channelName', 'methodName', { ...args })` (from `packages/desktop/renderer/lib/ipc.ts`), which round-trips through both the real Electron IPC bridge (`main/preload.ts`) and a WebSocket fallback used by the WebUI feature — **this is why the payload must be a plain, JSON-serializable value (a base64 string), not a `Blob`/`ArrayBuffer`/`Buffer`** — the WebSocket fallback path JSON-serializes everything, and a base64 string is the one format guaranteed to survive both transports identically.

**Keybind reference:** the existing debug-toggle keybind in `streamcomponent.tsx` uses a `window.addEventListener('keypress', ...)` listener switching on `e.keyCode` (legacy `keypress`, not `keydown` — only fires for printable characters). It uses `126` (the `~` character). This plan uses `112` (the `p` character, for "picture") — confirmed unused by grepping the default keyboard-to-gamepad mapping (`Driver/Keyboard.ts`'s `defaultMapping()`: `ArrowLeft/Up/Right/Down, Enter, a, Backspace, b, x, y, [, ], -, =, v, m` — no `p`).

## File Structure

- Create: `packages/desktop/main/ipc/screenshot.ts` — IPC handler, decodes + writes the PNG
- Modify: `packages/desktop/main/ipc.ts` — register the new channel
- Modify: `packages/desktop/renderer/components/ui/streamcomponent.tsx` — capture logic, gamebar button, keybind
- Modify: `packages/desktop/renderer/languages/en-US.json` — button title string

---

### Task 1: Main-process screenshot save handler

**Files:**
- Create: `packages/desktop/main/ipc/screenshot.ts`
- Modify: `packages/desktop/main/ipc.ts`

- [ ] **Step 1: Write the IPC handler**

Create `packages/desktop/main/ipc/screenshot.ts`:

```ts
import IpcBase from './base'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

interface saveScreenshotArgs {
    image: string; // base64-encoded PNG data (no data: URL prefix)
}

export default class IpcScreenshot extends IpcBase {

    saveScreenshot(args: saveScreenshotArgs) {
        return new Promise((resolve, reject) => {
            const screenshotDir = path.join(app.getPath('pictures'), 'Greenlight')

            fs.promises.mkdir(screenshotDir, { recursive: true }).then(() => {
                const filename = 'greenlight-' + Date.now() + '.png'
                const filePath = path.join(screenshotDir, filename)
                const buffer = Buffer.from(args.image, 'base64')

                fs.promises.writeFile(filePath, buffer).then(() => {
                    this._application.log('screenshot', 'Saved screenshot to:', filePath)
                    resolve({ path: filePath })
                }).catch((error) => {
                    this._application.log('screenshot', 'Failed to write screenshot:', error)
                    reject(error)
                })
            }).catch((error) => {
                this._application.log('screenshot', 'Failed to create screenshot directory:', error)
                reject(error)
            })
        })
    }
}
```

- [ ] **Step 2: Register the channel**

In `packages/desktop/main/ipc.ts`, add the import:

```ts
import IpcScreenshot from './ipc/screenshot'
```

Add to the `IpcChannels` interface:

```ts
interface IpcChannels {
    streaming: IpcStreaming;
    consoles: IpcConsoles;
    app: IpcApp;
    xCloud: IpcxCloud;
    settings: IpcSettings;
    screenshot: IpcScreenshot;
}
```

Add to the `_channels` object in the constructor:

```ts
        this._channels = {
            streaming: new IpcStreaming(this._application),
            consoles: new IpcConsoles(this._application),
            app: new IpcApp(this._application),
            xCloud: new IpcxCloud(this._application),
            settings: new IpcSettings(this._application),
            screenshot: new IpcScreenshot(this._application),
        }
```

- [ ] **Step 3: Manual verification**

No automated test exists for this (see "Context for the engineer" above — no main-process test infra in this codebase, and this handler needs real Electron `app`/filesystem to do anything meaningful). Do what's checkable without a live app: run `npx yarn@1.22.22 lint` from `packages/desktop`, confirm it passes clean on the new/modified files, and re-read `screenshot.ts` to confirm the promise chain correctly rejects on either the `mkdir` or `writeFile` failure path (not just the happy path) — this matters because `IpcBase.onEvent` (in `main/ipc/base.ts`) expects every handler method to return a `Promise` and routes rejection into an error response back to the renderer; a swallowed rejection here would make the renderer see a silent hang instead of a clear failure if, say, the Pictures folder is read-only.

If a live app is available: trigger `Ipc.send('screenshot', 'saveScreenshot', { image: '<some base64 PNG>' })` from a DevTools console once Task 2 exists, confirm a file actually appears at the OS's Pictures/Greenlight folder.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/main/ipc/screenshot.ts packages/desktop/main/ipc.ts
git commit -m "feat: add screenshot save IPC handler"
```

---

### Task 2: Capture trigger — gamebar button + keybind

**Files:**
- Modify: `packages/desktop/renderer/components/ui/streamcomponent.tsx`
- Modify: `packages/desktop/renderer/languages/en-US.json`

- [ ] **Step 1: Add the i18n string**

In `packages/desktop/renderer/languages/en-US.json`, find the `"streamWindow"` object (used by the existing gamebar buttons — `debugTitle`, `menuTitle`, etc.) and add a new key alongside `debugTitle`:

```json
        "debugTitle": "Debug",
        "screenshotTitle": "Take Screenshot",
```

- [ ] **Step 2: Write the capture function**

In `packages/desktop/renderer/components/ui/streamcomponent.tsx`, add a new function alongside `toggleDebug()` (around line 299):

```ts
    function takeScreenshot() {
        const videoElement = document.querySelector('#streamComponent video') as HTMLVideoElement
        if (videoElement === null) {
            console.log('takeScreenshot: no video element found, stream may not be connected yet')
            return
        }

        const canvas = document.createElement('canvas')
        canvas.width = videoElement.videoWidth
        canvas.height = videoElement.videoHeight

        const context = canvas.getContext('2d')
        if (context === null) {
            console.log('takeScreenshot: failed to get 2d canvas context')
            return
        }

        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

        const dataUrl = canvas.toDataURL('image/png')
        const base64Image = dataUrl.replace('data:image/png;base64,', '')

        Ipc.send('screenshot', 'saveScreenshot', { image: base64Image }).then((result: any) => {
            console.log('Screenshot saved:', result.path)
        }).catch((error) => {
            console.log('Failed to save screenshot:', error)
        })
    }
```

Note: this queries `#streamComponent video` fresh at call time (button click or keypress), not via a `MutationObserver` like Clarity Boost needed — by the time a user can click a gamebar button or press a key during an active stream, the video element already exists. No async waiting needed here, unlike Clarity Boost's problem of applying a filter as soon as the stream *starts* connecting.

- [ ] **Step 3: Wire the keybind**

Find the existing `keyboardPressEvent` handler (around line 247-253):

```ts
        const keyboardPressEvent = (e) => {
            switch (e.keyCode) {
                case 126:
                    toggleDebug()
                    break
            }
        }
```

Add a case for `112` (the `p` key):

```ts
        const keyboardPressEvent = (e) => {
            switch (e.keyCode) {
                case 126:
                    toggleDebug()
                    break
                case 112:
                    takeScreenshot()
                    break
            }
        }
```

- [ ] **Step 4: Add the gamebar button**

Find the existing debug button (around line 421):

```tsx
                            <Button label={<i className="fa-solid fa-bug"></i>} title={t("streamWindow.debugTitle")} onClick={(e) => {
                                e.target.blur(); toggleDebug()
                            }}></Button>
```

Add a new button immediately before it, using the `fa-camera` FontAwesome icon (the same icon font family — `@fortawesome/fontawesome-free` — is already a dependency, used by every other gamebar button):

```tsx
                            <Button label={<i className="fa-solid fa-camera"></i>} title={t("streamWindow.screenshotTitle")} onClick={(e) => {
                                e.target.blur(); takeScreenshot()
                            }}></Button> &nbsp;
                            <Button label={<i className="fa-solid fa-bug"></i>} title={t("streamWindow.debugTitle")} onClick={(e) => {
                                e.target.blur(); toggleDebug()
                            }}></Button>
```

- [ ] **Step 5: Manual verification**

Same environment caveat as every prior DOM/UI task in this project: needs a live Electron GUI and an active stream to actually exercise canvas capture against a real video frame. If unavailable, do what's checkable: confirm `npx yarn@1.22.22 lint` passes clean, confirm the `112`/`p` keycode doesn't collide with anything by re-checking `Driver/Keyboard.ts`'s default mapping (already checked during planning — no `p` key bound — but re-verify against the actual installed dependency version rather than trusting the plan's claim), and re-read `takeScreenshot()` for the two null-guard paths (missing video element, failed canvas context) to confirm neither would throw an unhandled exception if the stream state is unusual (e.g. screenshot attempted right as a stream is disconnecting).

If a GUI is available: connect to a stream, press `p` and separately click the new camera gamebar button, confirm a `greenlight-<timestamp>.png` file appears in the OS's Pictures/Greenlight folder each time, and that the image actually shows the current stream frame (not a black/blank frame — a common canvas-capture gotcha with cross-origin or DRM-protected video, verify this isn't an issue here since the WebRTC video track isn't subject to those restrictions, but confirm on a real screen rather than assuming).

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/renderer/components/ui/streamcomponent.tsx packages/desktop/renderer/languages/en-US.json
git commit -m "feat: add screenshot capture button and keybind"
```

---

## Self-Review Notes

- **Spec coverage:** covers the corrected "Screenshot capture" section of `docs/superpowers/specs/2026-07-16-better-xcloud-parity-design.md` in full: DOM video lookup, canvas capture, IPC handoff, silent auto-save to `Pictures/Greenlight/`, trigger via both button and keybind matching the existing debug-toggle pattern.
- **No placeholders:** all code blocks are complete; the lack of automated tests is an explicit, justified scope decision (no pure logic to extract, no main-process test infra exists anywhere in this codebase), not a gap glossed over.
- **Type consistency:** `saveScreenshot(args: { image: string })` in Task 1 is called with `Ipc.send('screenshot', 'saveScreenshot', { image: base64Image })` in Task 2 — matching argument shape and channel/method names.
- **No dependency changes:** doesn't touch `xbox-xcloud-player`, matches the non-goal established in every prior feature's spec.
