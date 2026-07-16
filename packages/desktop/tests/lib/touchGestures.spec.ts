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
