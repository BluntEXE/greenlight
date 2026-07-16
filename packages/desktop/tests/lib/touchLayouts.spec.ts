import { expect } from 'chai'
import { getTouchLayoutPreset } from '../../lib/touchLayouts'

describe('getTouchLayoutPreset', () => {
    it('returns the standard preset with a movement stick in left-inner', () => {
        const layout = getTouchLayoutPreset('standard')
        expect(layout['left-inner']).to.have.lengthOf(1)
        expect(layout['left-inner'][0]).to.deep.equal({ type: 'stick', input: 'left', label: 'Move' })
    })

    it('returns the standard preset with a right stick and all 4 face buttons in right-inner', () => {
        const layout = getTouchLayoutPreset('standard')
        expect(layout['right-inner'][0]).to.deep.equal({ type: 'stick', input: 'right', label: 'Look' })
        const buttonInputs = layout['right-inner'].slice(1).map((c) => c.input)
        expect(buttonInputs).to.deep.equal(['A', 'B', 'X', 'Y'])
    })

    it('returns the standard preset with a full button set (minus Nexus)', () => {
        const layout = getTouchLayoutPreset('standard')
        const allInputs = Object.values(layout).flat().map((c) => c.input)
        expect(allInputs).to.include.members([
            'left', 'right', 'A', 'B', 'X', 'Y',
            'LeftShoulder', 'RightShoulder', 'LeftTrigger', 'RightTrigger',
            'LeftThumb', 'RightThumb', 'Menu', 'View',
        ])
        expect(allInputs).to.not.include('Nexus')
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
