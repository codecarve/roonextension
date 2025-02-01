'use strict'

const Homey = require('homey')

const zoneManager = require('../../lib/zone-manager')
const imageUtil = require('../../lib/image-util')
const RoonApiBrowse = require('node-roon-api-browse')

const { browseAndLoadAllArtists, browseAndLoadAllInternetRadios } = require('../../lib/browser')

class RoonOutputDevice extends Homey.Device {
  async onInit () {
    this.zone = null
    this.browse = null

    this.currentImageKey = ''
    const data = this.getData()
    if (!data || !data.id) {
      this.error('Device data or ID is undefined')
      return
    }
    this.imagePath = `/userdata/${data.id}.jpeg`

    this.albumArtImage = await imageUtil.createAlbumArtImage(
      this.homey,
      this.imagePath,
    )
    await this.setAlbumArtImage(this.albumArtImage)
    this.log('Album art image created')

    this._boundOnZonesUpdated = this.onZonesUpdated.bind(this)
    zoneManager.on('zonesUpdated', this._boundOnZonesUpdated)
    this._boundOnZonesChanged = this.onZonesChanged.bind(this)
    zoneManager.on('zonesChanged', this._boundOnZonesChanged)
    this._boundOnZonesSeekChanged = this.onZonesSeekChanged.bind(this)
    zoneManager.on('zonesSeekChanged', this._boundOnZonesSeekChanged)

    this.registerCapabilityListener(
      'speaker_playing',
      this.onCapabilitySpeakerPlaying.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_shuffle',
      this.onCapabilitySpeakerShuffle.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_repeat',
      this.onCapabilitySpeakerRepeat.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_next',
      this.onCapabilitySpeakerNext.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_prev',
      this.onCapabilitySpeakerPrevious.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_position',
      this.onCapabilitySpeakerPosition.bind(this),
    )

    this.registerCapabilityListener(
      'volume_up',
      this.onCapabilityVolumeUp.bind(this),
    )

    this.registerCapabilityListener(
      'volume_down',
      this.onCapabilityVolumeDown.bind(this),
    )

    this.registerCapabilityListener(
      'volume_mute',
      this.onCapabilityVolumeMute.bind(this),
    )

    this.registerCapabilityListener(
      'volume_set',
      this.onCapabilityVolumeSet.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_wake_up',
      this.onCapabilitySpeakerWakeUp.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_sleep',
      this.onCapabilitySpeakerSleep.bind(this),
    )

    this.registerCapabilityListener(
      'speaker_auto_radio',
      this.onCapabilityAutoRadio.bind(this),
    )

    const speakerWakeUpActionCard =
      this.homey.flow.getActionCard('speaker_wake_up')

    speakerWakeUpActionCard.registerRunListener(async (args, state) => {
      await this.onCapabilitySpeakerWakeUp(true, null)
    })

    const speakerSleepActionCard =
      this.homey.flow.getActionCard('speaker_sleep')

    speakerSleepActionCard.registerRunListener(async (args, state) => {
      await this.onCapabilitySpeakerSleep(true, null)
    })

    // now we want the state of the output to be updated
    const transport = zoneManager.getTransport()
    if (transport !== null) {
      this.zone = transport.zone_by_output_id(this.getData().id)
      if (this.zone !== null) {
        await this.updateZones([this.zone])
      }
    }

    const autoRadioAction = this.homey.flow.getActionCard(
      'speaker_auto_radio_output',
    )
    autoRadioAction.registerRunListener(async (args, state) => {
      await this.onCapabilityAutoRadio(args.enabled, null)
    })

    // Register a new flow action for browsing content
    const artistRadioOutputActionCard = this.homey.flow.getActionCard(
      'artist_radio_output',
    )

    artistRadioOutputActionCard.registerArgumentAutocompleteListener(
      'artist',
      this.onRegisterArgumentAutocompleteListenerArtistRadio.bind(this),
    )

    artistRadioOutputActionCard.registerRunListener(
      this.onRunListenerArtistRadioOutputActionCard.bind(this),
    )

    // Register a new flow action for browsing content
    const internetRadioOutputActionCard = this.homey.flow.getActionCard(
      'internet_radio_output',
    )

    internetRadioOutputActionCard.registerArgumentAutocompleteListener(
      'internet_radio',
      this.onRegisterArgumentAutocompleteListenerInternetRadio.bind(this),
    )

    internetRadioOutputActionCard.registerRunListener(
      this.onRunListenerInternetRadioOutputActionCard.bind(this),
    )

    this.log('RoonOutputDevice has been initialized')
  }

  async onAdded () {
    this.log('RoonOutputDevice has been added')
  }

  async onSettings ({ oldSettings, newSettings, changedKeys }) {
    this.log('RoonOutputDevice settings where changed')
  }

  async onRenamed (name) {
    this.log('RoonOutputDevice was renamed')
  }

  async onDeleted () {
    zoneManager.off('zonesUpdated', this._boundOnZonesUpdated)
    zoneManager.off('zonesChanged', this._boundOnZonesChanged)
    zoneManager.off('zonesSeekChanged', this._boundOnZonesSeekChanged)

    this.log('RoonZone has been deleted')
  }

  updateZones = async (zones) => {
    let found = false
    for (let zone of zones) {
      for (let output of zone.outputs) {
        if (output.output_id === this.getData().id) {
          found = true

          this.zone = Object.assign({}, zone)

          if (zone.state) {
            let isPlaying = zone.state === 'playing'
            this.log(`Zone state: ${zone.state}, playing: ${isPlaying}`)
            await this.setCapabilityValue('speaker_playing', isPlaying).catch(
              this.error,
            )
          }

          if (zone.settings) {
            await this.setCapabilityValue(
              'speaker_shuffle',
              zone.settings.shuffle,
            ).catch(this.error)

            if (this.hasCapability('speaker_auto_radio')) {
              await this.setCapabilityValue(
                'speaker_auto_radio',
                zone.settings.auto_radio,
              ).catch(this.error)
            } else {
              this.log('Auto radio is not available')
            }

            try {
              const loopMap = {
                disabled: 'none',
                loop: 'playlist',
                loop_one: 'track',
              }

              const repeatValue = loopMap[zone.settings.loop]

              if (repeatValue) {
                await this.setCapabilityValue('speaker_repeat', repeatValue)
              }
            } catch (error) {
              this.error('Error setting repeat value', error)
            }
          }

          if (zone.now_playing?.seek_position) {
            await this.setCapabilityValue(
              'speaker_position',
              +zone.now_playing.seek_position,
            ).catch(this.error)
          }

          if (zone.now_playing?.three_line) {
            await this.setCapabilityValue(
              'speaker_track',
              zone.now_playing.three_line.line1,
            ).catch(this.error)

            await this.setCapabilityValue(
              'speaker_artist',
              zone.now_playing.three_line.line2,
            ).catch(this.error)

            await this.setCapabilityValue(
              'speaker_album',
              zone.now_playing.three_line.line3,
            ).catch(this.error)
          }

          if (zone.now_playing?.length) {
            await this.setCapabilityValue(
              'speaker_duration',
              +zone.now_playing.length,
            ).catch(this.error)
          }

          if (zone.queue_items_remaining) {
            await this.setCapabilityValue(
              'speaker_queue_items_remaining',
              +zone.queue_items_remaining,
            ).catch(this.error)
          }

          if (zone.queue_time_remaining) {
            await this.setCapabilityValue(
              'speaker_queue_time_remaining',
              zone.queue_time_remaining,
            ).catch(this.error)
          }

          if (output.volume) {
            await this.setCapabilityValue(
              'volume_mute',
              output.volume.is_muted,
            ).catch(this.error)
            await this.setCapabilityValue(
              'volume_set',
              +output.volume.value / 100,
            )
            await this.setCapabilityValue(
              'volume_soft_limit',
              +output.volume.soft_limit,
            )
          }

          try {
            const imageDriver = zoneManager.getImageDriver()

            if (imageDriver && zone && zone.now_playing) {
              const newImageKey = zone.now_playing.image_key
              if (newImageKey !== this.currentImageKey) {
                await imageUtil.fetchAndSaveImage(
                  imageDriver,
                  newImageKey,
                  this.imagePath,
                )
                await this.albumArtImage.update()
                this.currentImageKey = newImageKey
              }
            }
          } catch (err) {
            this.error(`Error setting image. Error: ${err.message}`)
          }

          break
        }
      }
    }
  }

  onZonesUpdated = async (zones) => {
    this.log('onZonesUpdated')
    await this.updateZones(zones)
  }

  onZonesChanged = async (zones) => {
    this.log('onZonesChanged')
    await this.updateZones(zones)
  }

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (!this.zone) {
      return
    }

    for (let zone of zones_seek_changed) {
      if (zone.zone_id === this.zone.zone_id) {
        if (zone.seek_position !== undefined) {
          await this.setCapabilityValue(
            'speaker_position',
            zone.seek_position,
          ).catch((err) =>
            this.error(
              `onZonesChanged - Error setting speaker_position! Error: ${err.message}`,
            ),
          )
        }
        if (zone.queue_time_remaining !== undefined) {
          await this.setCapabilityValue(
            'speaker_queue_time_remaining',
            zone.queue_time_remaining,
          ).catch((err) =>
            this.error(
              `onZonesChanged -Error setting speaker_queue_time_remaining! Error: ${err.message}`,
            ),
          )
        }
        break
      }
    }
  }

  onCapabilitySpeakerPlaying = (value, opts) => {
    this.log('onCapabilitySpeakerPlaying', value, opts)

    const action = value ? 'play' : 'pause'

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerPlaying - Transport is not available')
      }

      transport.control(this.getData().id, action)
      this.log(`Setting speaker playing to ${action}`)
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPlaying - Setting speaker playing to ${action} failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerShuffle = (value, opts) => {
    this.log('onCapabilitySpeakerShuffle', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerShuffle - Transport is not available')
      }
      transport.change_settings(this.getData().id, {
        shuffle: value,
      })
    } catch (err) {
      this.error(
        `onCapabilitySpeakerShuffle - Setting shuffle to ${value} failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerRepeat = (value, opts) => {
    this.log('onCapabilitySpeakerRepeat', value, opts)

    const loopMap = {
      none: 'disabled',
      playlist: 'loop',
      track: 'loop_one',
    }

    const loop = loopMap[value] || 'disabled'

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerRepeat - Transport is not available')
      }
      transport.change_settings(this.getData().id, { loop })
    } catch (err) {
      this.error(
        `onCapabilitySpeakerRepeat - Setting loop to ${value} failed! Error:  ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerNext = (value, opts) => {
    this.log('onCapabilitySpeakerNext', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerNext - Transport is not available')
      }
      transport.control(this.getData().id, 'next')
    } catch (err) {
      this.error(
        `onCapabilitySpeakerNext - Setting speaker playing to next failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerPrevious = (value, opts) => {
    this.log('onCapabilitySpeakerPrevious', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('Transport is not available')
      }
      transport.control(this.getData().id, 'previous')
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPrevious- Setting speaker playing to previous failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerPosition = (value, opts) => {
    this.log('onCapabilitySpeakerPosition', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerPrevious - Transport is not available')
      }
      transport.seek(this.getData().id, 'absolute', value)
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPrevious - Setting speaker position ${value} failed! Error: ${err.message}`,
      )
    }
  }

  changeVolume = async (direction) => {
    const transport = zoneManager.getTransport()
    if (!transport) {
      this.error('changeVolume - Transport is not available')
      return
    }
    const volumeChangePromises = this.zone.outputs
    .filter((output) => output.output_id === this.getData().id) // Only this output!
    .filter((output) =>
      direction > 0
        ? +output.volume.value < +output.volume.soft_limit
        : +output.volume.value > 0,
    )
    .map((output) => {
      return new Promise((resolve, reject) => {
        transport.change_volume(
          output.output_id,
          'relative',
          direction,
          (err) => {
            if (err) {
              reject(
                new Error(
                  `changeVolume - Failed to change volume! Error: ${err.message}`,
                ),
              )
            } else {
              resolve()
            }
          },
        )
      })
    })

    try {
      await Promise.all(volumeChangePromises)
    } catch (err) {
      this.error(`changeVolume - Error changing volume. Error: ${err.message}`)
    }
  }

  onCapabilityVolumeUp = async (value, opts) => {
    this.log('onCapabilityVolumeUp', value, opts)
    await this.changeVolume(1)
  }

  onCapabilityVolumeDown = async (value, opts) => {
    this.log('onCapabilityVolumeDown', value, opts)
    await this.changeVolume(-1)
  }

  onCapabilityVolumeMute = async (value, opts) => {
    this.log('onCapabilityVolumeMute', value, opts)

    const transport = zoneManager.getTransport()
    if (!transport) {
      this.error('onCapabilityVolumeMute - Transport is not available')
      return
    }

    if (!this.zone) {
      this.error('onCapabilityVolumeMute - Zone is not available')
      return
    }

    if (!Array.isArray(this.zone.outputs)) {
      this.error(
        'onCapabilityVolumeMute - Zone outputs are not available or invalid.',
      )
      return
    }

    const volumeMutePromises = this.zone.outputs
    .filter((output) => output.output_id === this.getData().id) // only this output!
    .map((output) =>
      transport.mute(output.output_id, value ? 'mute' : 'unmute'),
    )

    try {
      await Promise.all(volumeMutePromises)
    } catch (error) {
      this.error(error)
    }
  }

  onCapabilityVolumeSet = async (value, opts) => {
    this.log('onCapabilityVolumeSet', value, opts)

    const transport = zoneManager.getTransport()
    if (!transport) {
      this.error('onCapabilityVolumeSet - Transport is not available')
      return
    }

    if (!this.zone) {
      return
    }

    if (+value < 0 || +value > 1) {
      this.error('onCapabilityVolumeSet - Volume must be between 0 and 1')
      return
    }

    const output = this.zone.outputs.find(
      (output) => output.output_id === this.getData().id,
    )
    if (!output) {
      this.error('onCapabilityVolumeSet - Output not found')
      return
    }

    const volumeToSet = Math.min(+value * 100, output.volume.soft_limit)

    try {
      await new Promise((resolve, reject) => {
        transport.change_volume(
          this.getData().id,
          'absolute',
          volumeToSet,
          (err) => {
            if (err) {
              reject(
                new Error(
                  `onCapabilityVolumeSet - Failed to set volume! Error: ${err.message}`,
                ),
              )
            } else {
              resolve()
            }
          },
        )
      })
      await this.setCapabilityValue('volume_set', volumeToSet / 100)
    } catch (err) {
      this.error(
        `onCapabilityVolumeSet - Setting volume failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerWakeUp = (value, opts) => {
    this.log('onCapabilitySpeakerWakeUp', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerWakeUp - Transport is not available')
      }
      transport.convenience_switch(this.getData().id, {})
    } catch (err) {
      this.error(
        `onCapabilitySpeakerWakeUp - Triggering wake up failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilitySpeakerSleep = (value, opts) => {
    this.log('onCapabilitySpeakerSleep', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilitySpeakerSleep - Transport is not available')
      }
      transport.standby(this.getData().id, {})
    } catch (err) {
      this.error(
        `onCapabilitySpeakerSleep - Triggering stand by failed! Error: ${err.message}`,
      )
    }
  }

  onCapabilityAutoRadio = (value, opts) => {
    this.log('onCapabilityAutoRadio', value, opts)

    try {
      const transport = zoneManager.getTransport()
      if (!transport) {
        this.error('onCapabilityAutoRadio - Transport is not available')
      }
      transport.change_settings(this.getData().id, {
        auto_radio: value,
      })
    } catch (err) {
      this.error(
        `onCapabilityAutoRadio - Setting auto_radio to ${value} failed! Error: ${err.message}`,
      )
    }
  }

  async onRegisterArgumentAutocompleteListenerArtistRadio (query, args) {
    this.log('autocompleting: ', query)

    if (query.length === 0) {
      return []
    }

    const { core } = this.homey.app
    const browse = new RoonApiBrowse(core)

    if (!browse) {
      this.error('Browse instance is not available')
      return
    }

    const artists = await browseAndLoadAllArtists(browse)

    console.log('artists: ', artists)

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    artists.items = artists.items.sort(() => 0.5 - Math.random())

    artists.items = artists.items.filter((a) =>
      a.title.toLowerCase().includes(query.toLowerCase()),
    )

    this.log(`found ${artists.items.length} artists`)
    this.log('first item: ', artists.items[0])
    // artists.items[0]:
    // {
    //   action: 'list',
    //       list: {
    //   level: 0,
    //       title: 'Artists',
    //       subtitle: null,
    //       image_key: null,
    //       count: 584,
    //       display_offset: null
    // }

    this.log('offset: ', artists.offset)
    this.log('list: ', artists.list)
    // artists.list:
    // {
    //   level: 0,
    //       title: 'Artists',
    //     subtitle: null,
    //     image_key: null,
    //     count: 584,
    //     display_offset: null
    // }

    return artists.items.map((artist) => {
      return {
        id: artist.item_key,
        name: artist.title,
      }
    })
  }

  async onRunListenerArtistRadioOutputActionCard (args, state) {
    // artist: { id: '17:314', name: 'Lenny Kravitz' },
    const { artist } = args

    this.log(`Play artist action - ${artist.name}`)

    if (!artist || !artist.name || artist.name.length === 0) {
      this.error('Artist is not defined')
      return
    }

    const { core } = this.homey.app
    const browse = new RoonApiBrowse(core)

    if (!browse) {
      this.error('Browse instance is not available')
      return
    }

    // we cannot trust this number so let's just search again for the artist
    const artists = await browseAndLoadAllArtists(browse)
    artists.items = artists.items.filter((a) =>
      a.title.toLowerCase().includes(artist.name.toLowerCase()),
    )
    this.log(`found ${artists.items.length} artists`)
    if (artists.items.length === 0) {
      this.error(`Artist ${artist} was not found`)
      return
    }

    const artistItem = artists.items[0]
    this.log('item: ', artistItem)

    browse.browse(
      { hierarchy: 'artists', item_key: artistItem.item_key },
      (error, body) => {
        if (error) {
          this.error(error)
        }
        this.log('browse', body)
        // body:
        // {
        //   action: 'list',
        //   list: {
        //     level: 1,
        //     title: 'Abbaba Soul',
        //     subtitle: '1 Album',
        //     image_key: '30a6939e65742b638ebf00d0c80d9958',
        //     count: 2,
        //     display_offset: null
        //   }
        // }

        //
        browse.load(
          { hierarchy: 'artists', level: 1, count: +body.count },
          (error2, body2) => {
            if (error2) {
              this.error(error2)
            }
            this.log('load2', body2)
            // load2:
            // {
            //   items: [
            //     {
            //       title: 'Play Artist',
            //       subtitle: null,
            //       image_key: null,
            //       item_key: '8:0',
            //       hint: 'action_list'
            //     },
            //     {
            //       title: 'Babylon Kingdom Fall',
            //       subtitle: 'Abbaba Soul / Mad Professor',
            //       image_key: '9349f5955847b82c506951429008264a',
            //       item_key: '8:1',
            //       hint: 'list'
            //     }
            //   ],
            //       offset: 0,
            //     list: {
            //   level: 1,
            //       title: 'Abbaba Soul',
            //       subtitle: '1 Album',
            //       image_key: '30a6939e65742b638ebf00d0c80d9958',
            //       count: 2,
            //       display_offset: null
            // }
            // }

            const playArtistItem = body2.items.find(
              (i) => i.title === 'Play Artist',
            )

            if (!playArtistItem) {
              this.error('Play Artist Item was not found')
              return
            }

            browse.browse(
              {
                hierarchy: 'artists',
                item_key: playArtistItem.item_key,
              },
              (error3, body3) => {
                if (error3) {
                  this.error(error3)
                }
                this.log('browse3', body3)
                // browse3:
                // {
                //   action: 'list',
                //       list: {
                //   level: 2,
                //       title: 'Play Artist',
                //       subtitle: null,
                //       image_key: null,
                //       count: 2,
                //       display_offset: null,
                //       hint: 'action_list'
                // }
                // }

                browse.load(
                  { hierarchy: 'artists', level: 2, count: +body3.count },
                  (error4, body4) => {
                    if (error4) {
                      this.error(error4)
                    }
                    this.log('load4', body4)
                    // load4:
                    // {
                    //   items: [
                    //     {
                    //       title: 'Shuffle',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '9:0',
                    //       hint: 'action'
                    //     },
                    //     {
                    //       title: 'Start Radio',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '9:1',
                    //       hint: 'action'
                    //     }
                    //   ],
                    //       offset: 0,
                    //     list: {
                    //   level: 2,
                    //       title: 'Play Artist',
                    //       subtitle: null,
                    //       image_key: null,
                    //       count: 2,
                    //       display_offset: null,
                    //       hint: 'action_list'
                    // }
                    // }

                    const startRadioItem = body4.items.find(
                      (i) => i.title === 'Start Radio',
                    )

                    if (!startRadioItem) {
                      this.error('Start Radio was not found')
                      return
                    }

                    this.log('the title: ', startRadioItem.title)
                    this.log('the item key:', startRadioItem.item_key)

                    // start playing the artist
                    browse.browse(
                      {
                        hierarchy: 'artists',
                        zone_or_output_id: this.zone.zone_id,
                        item_key: startRadioItem.item_key,
                      },
                      (error5, body5) => {
                        if (error5) {
                          this.error(error5)
                        }
                        this.log('browse5', body5)
                        // browse5:
                        // {
                        //   action: 'list',
                        //       list: {
                        //   level: 1,
                        //       title: 'Abbaba Soul',
                        //       subtitle: '1 Album',
                        //       image_key: '30a6939e65742b638ebf00d0c80d9958',
                        //       count: 2,
                        //       display_offset: null
                        // }
                        // }
                      },
                    )
                  },
                )
              },
            )
          },
        )
      },
    )
  }

  async onRegisterArgumentAutocompleteListenerInternetRadio (query, args) {
    this.log('autocompleting: ', query)

    if (query.length === 0) {
      return []
    }

    const { core } = this.homey.app
    const browse = new RoonApiBrowse(core)

    if (!browse) {
      this.error('Browse instance is not available')
      return
    }

    const internet_radios = await browseAndLoadAllInternetRadios(browse)

    console.log('internet_radios: ', internet_radios)

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    internet_radios.items = internet_radios.items.sort(() => 0.5 - Math.random())

    internet_radios.items = internet_radios.items.filter((a) =>
      a.title.toLowerCase().includes(query.toLowerCase()),
    )

    this.log(`found ${internet_radios.items.length} internet radios`)
    this.log('first item: ', internet_radios.items[0])
    // artists.items[0]:
    // {
    //   action: 'list',
    //       list: {
    //   level: 0,
    //       title: 'Artists',
    //       subtitle: null,
    //       image_key: null,
    //       count: 584,
    //       display_offset: null
    // }

    this.log('offset: ', internet_radios.offset)
    this.log('list: ', internet_radios.list)
    // artists.list:
    // {
    //   level: 0,
    //       title: 'Artists',
    //     subtitle: null,
    //     image_key: null,
    //     count: 584,
    //     display_offset: null
    // }

    return internet_radios.items.map((radio) => {
      return {
        id: radio.item_key,
        name: radio.title,
      }
    })
  }

  async onRunListenerInternetRadioOutputActionCard (args, state) {
    // artist: { id: '17:314', name: 'Lenny Kravitz' },
    const { internet_radio } = args

    this.log(`Play internet radio action - ${internet_radio.name}`)

    if (!internet_radio || !internet_radio.name || internet_radio.name.length === 0) {
      this.error('Internet radio is not defined')
      return
    }

    const { core } = this.homey.app
    const browse = new RoonApiBrowse(core)

    if (!browse) {
      this.error('Browse instance is not available')
      return
    }

    // we cannot trust this number so let's just search again for the artist
    const internetRadios = await browseAndLoadAllInternetRadios(browse)

    console.log('internetRadios: ', JSON.stringify(internetRadios, null, 2))

    internetRadios.items = internetRadios.items.filter((a) =>
      a.title.toLowerCase().includes(internet_radio.name.toLowerCase()),
    )
    console.log(`found ${internetRadios.items.length} internet radios`)
    if (internetRadios.items.length === 0) {
      this.error(`Internet radio ${internetRadios} was not found`)
      return
    }

    const internetRadioItem = internetRadios.items[0]
    this.log('item: ', internetRadioItem)

    browse.browse(
      {
        hierarchy: 'internet_radio',
        zone_or_output_id: this.zone.zone_id,
        item_key: internetRadioItem.item_key,
      },
      (error5, body5) => {
        if (error5) {
          this.error(error5)
        }
        this.log('browse5', body5)
      },
    )
  }
}

module.exports = RoonOutputDevice
