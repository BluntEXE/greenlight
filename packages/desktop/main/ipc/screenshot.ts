import IpcBase from './base'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

interface saveScreenshotArgs {
    image: string; // base64-encoded PNG data (no data: URL prefix)
}

export default class IpcScreenshot extends IpcBase {

    saveScreenshot(args: saveScreenshotArgs) {
        return new Promise((resolve, reject) => {
            let buffer: Buffer

            try {
                buffer = Buffer.from(args.image, 'base64')
            } catch (error) {
                this._application.log('screenshot', 'Failed to decode screenshot image:', error)
                reject(error)
                return
            }

            const screenshotDir = path.join(app.getPath('pictures'), 'Greenlight')

            fs.promises.mkdir(screenshotDir, { recursive: true }).then(() => {
                const filename = 'greenlight-' + Date.now() + '-' + crypto.randomUUID() + '.png'
                const filePath = path.join(screenshotDir, filename)

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
