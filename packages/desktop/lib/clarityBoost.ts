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
