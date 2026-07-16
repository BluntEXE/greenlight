import React from 'react'
import Head from 'next/head'
import SettingsSidebar from '../../components/settings/sidebar'
import Card from '../../components/ui/card'
import Ipc from '../../lib/ipc'
import { useSettings } from '../../context/userContext'
import { useTranslation } from 'react-i18next'


function SettingsVideo() {
    const { settings, setSettings} = useSettings()
    const { t } = useTranslation()

    React.useEffect(() => {
    //
    })

    function setVideoSize(e){
        setSettings({
            ...settings,
            video_size: e,
        })
    }

    function forceLowResolution(){
        Ipc.send('settings', 'setLowResolution').then(() => {
            console.log('Resizing main window...')
            setSettings({
                ...settings,
                app_lowresolution: (!settings.app_lowresolution),
            })
        })
    }

    function setClarityBoost(e){
        setSettings({
            ...settings,
            clarity_boost_strength: parseFloat(e.target.value),
        })
    }

    function setAudioEnabled(){
        setSettings({
            ...settings,
            audio_enabled: (!settings.audio_enabled),
        })
    }

    function setVideoEnabled(){
        setSettings({
            ...settings,
            video_enabled: (!settings.video_enabled),
        })
    }

    return (
        <React.Fragment>
            <Head>
                <title>Greenlight - {t('settings.videoAudio.pageTitle')}</title>
            </Head>

            <SettingsSidebar>
                <Card>
                    <h1>{t('settings.videoAudio.title')}</h1>

                    <p>
                        <label>{t('settings.videoAudio.disableVideoLabel')}</label>
                        <label style={{ minWidth: 0 }}>
                            <input type='checkbox' onChange={ setVideoEnabled } checked={!settings.video_enabled} />&nbsp; ({ !settings.video_enabled ? t('settings.videoAudio.enabledLabel') : t('settings.videoAudio.disabledLabel')})
                        </label>
                    </p>

                    <p>
                        <label>{t('settings.videoAudio.aspectSizeLabel')}</label>
                        <select value={ settings.video_size } onChange={(e) => {
                            setVideoSize(e.target.value)
                        }}>
                            <option value='default'>{t('settings.videoAudio.aspectSizeValueDefault')}</option>
                            <option value='stretch'>{t('settings.videoAudio.aspectSizeValueStretch')}</option>
                            <option value='zoom'>{t('settings.videoAudio.aspectSizeValueZoom')}</option>
                        </select>
                    </p>

                    <p>
                        <label>{t('settings.videoAudio.forceLowResLabel')}</label>
                        <label style={{ minWidth: 0 }}>
                            <input type='checkbox' onChange={ forceLowResolution } checked={settings.app_lowresolution} />&nbsp; ({ settings.app_lowresolution ? t('settings.videoAudio.enabledLabel') : t('settings.videoAudio.disabledLabel')})
                        </label><br />
                        <small>{t('settings.videoAudio.forceLowResDescription')}</small>
                    </p>

                    <p>
                        <label>{t('settings.videoAudio.clarityBoostLabel')}</label>
                        <input type='range' min='0' max='1' step='0.05' value={settings.clarity_boost_strength} onChange={ setClarityBoost } />
                        ({ settings.clarity_boost_strength })
                        <br />
                        <small>{t('settings.videoAudio.clarityBoostDescription')}</small>
                    </p>
                </Card>

                <Card>
                    <h1>{t('settings.videoAudio.audioTitle')}</h1>

                    <p>
                        <label>{t('settings.videoAudio.disableAudioLabel')}</label>
                        <label style={{ minWidth: 0 }}>
                            <input type='checkbox' onChange={ setAudioEnabled } checked={!settings.audio_enabled} />&nbsp; ({ !settings.audio_enabled ? t('settings.videoAudio.enabledLabel') : t('settings.videoAudio.disabledLabel')})
                        </label>
                    </p>
                </Card>
            </SettingsSidebar>


        </React.Fragment>
    )
}

export default SettingsVideo
