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
