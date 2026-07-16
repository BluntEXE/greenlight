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
