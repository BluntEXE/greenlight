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
