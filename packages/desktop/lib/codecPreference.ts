const CODEC_MIME_TYPES: { [key: string]: string } = {
    h264: 'video/H264',
    av1: 'video/AV1',
    hevc: 'video/H265',
}

/**
 * Maps a friendly codec key to the WebRTC mimeType string
 * xbox-xcloud-player's setCodecPreferences() expects. Falls back to
 * H.264 for anything unrecognized so a corrupt/missing setting never
 * breaks stream negotiation.
 */
export function getCodecMimeType(codec: string): string {
    return CODEC_MIME_TYPES[codec] || CODEC_MIME_TYPES.h264
}
