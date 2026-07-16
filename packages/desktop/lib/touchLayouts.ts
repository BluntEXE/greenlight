export type ZoneName = 'left-inner' | 'left-outer' | 'right-inner' | 'right-outer' | 'top-right'

export type TouchControlType = 'button' | 'dpad' | 'stick'

// Every InputFrame field a 'button' control is allowed to target. Kept in
// sync with InputFrame manually (touchoverlay.tsx's createEmptyFrame() has
// the matching field list) since importing InputFrame's real type here
// would pull in the xbox-xcloud-player dependency for a lib module that's
// otherwise dependency-free.
export type InputFrameKey =
    | 'GamepadIndex' | 'Nexus' | 'Menu' | 'View'
    | 'A' | 'B' | 'X' | 'Y'
    | 'DPadUp' | 'DPadDown' | 'DPadLeft' | 'DPadRight'
    | 'LeftShoulder' | 'RightShoulder'
    | 'LeftThumb' | 'RightThumb'
    | 'LeftThumbXAxis' | 'LeftThumbYAxis'
    | 'RightThumbXAxis' | 'RightThumbYAxis'
    | 'LeftTrigger' | 'RightTrigger'

export type StickSide = 'left' | 'right'

export interface TouchButtonControl {
    type: 'button'
    input: InputFrameKey
    label: string
}

export interface TouchDpadControl {
    type: 'dpad'
    // Unused: a dpad control always drives all 4 DPad* fields directly.
    input: ''
    label: string
}

export interface TouchStickControl {
    type: 'stick'
    // Selects which pair of InputFrame axis fields (Left*/Right*) this stick drives.
    input: StickSide
    label: string
}

export type TouchControl = TouchButtonControl | TouchDpadControl | TouchStickControl

export type TouchLayout = Partial<Record<ZoneName, TouchControl[]>>

// Full parity with a real Xbox controller, minus Nexus (already reachable
// by holding View+Menu together - see design spec). LB/LT cluster with the
// D-pad on the left, RB/RT/R3 cluster with face buttons on the right,
// matching which hand operates which control on a physical controller.
// Menu/View are the two genuinely rare-use controls, so they're the ones
// placed in the lift-your-thumb top-right zone.
const STANDARD_LAYOUT: TouchLayout = {
    'left-inner': [{ type: 'stick', input: 'left', label: 'Move' }],
    'left-outer': [
        { type: 'dpad', input: '', label: 'D-Pad' },
        { type: 'button', input: 'LeftShoulder', label: 'LB' },
        { type: 'button', input: 'LeftTrigger', label: 'LT' },
        { type: 'button', input: 'LeftThumb', label: 'L3' },
    ],
    'right-inner': [
        { type: 'stick', input: 'right', label: 'Look' },
        { type: 'button', input: 'A', label: 'A' },
        { type: 'button', input: 'B', label: 'B' },
        { type: 'button', input: 'X', label: 'X' },
        { type: 'button', input: 'Y', label: 'Y' },
    ],
    'right-outer': [
        { type: 'button', input: 'RightShoulder', label: 'RB' },
        { type: 'button', input: 'RightTrigger', label: 'RT' },
        { type: 'button', input: 'RightThumb', label: 'R3' },
    ],
    'top-right': [
        { type: 'button', input: 'Menu', label: 'Menu' },
        { type: 'button', input: 'View', label: 'View' },
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
