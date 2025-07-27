"use strict";

const Homey = require("homey");

const zoneManager = require("../../lib/zone-manager");
const imageUtil = require("../../lib/image-util");
const RoonApiBrowse = require("node-roon-api-browse");

const {
  browseAndLoadAllHierarchy,
  browseZoneOrOutput,
  browseAndLoadItemLevel,
} = require("../../lib/browser-util");

class RoonOutputDevice extends Homey.Device {
  async onInit() {
    this.zone = null;
    this.browse = null;

    this.currentImageKey = "";
    const data = this.getData();
    if (!data || !data.id) {
      this.error("Device data or ID is undefined");
      return;
    }
    this.imagePath = `/userdata/${data.id}.jpeg`;

    this.albumArtImage = await imageUtil.createAlbumArtImage(
      this.homey,
      this.imagePath,
    );
    await this.setAlbumArtImage(this.albumArtImage);
    this.log("Album art image created");

    this._boundOnZonesUpdated = this.onZonesUpdated.bind(this);
    zoneManager.on("zonesUpdated", this._boundOnZonesUpdated);
    this._boundOnZonesChanged = this.onZonesChanged.bind(this);
    zoneManager.on("zonesChanged", this._boundOnZonesChanged);
    this._boundOnZonesSeekChanged = this.onZonesSeekChanged.bind(this);
    zoneManager.on("zonesSeekChanged", this._boundOnZonesSeekChanged);

    const capabilityListeners = [
      { cap: "speaker_playing", handler: this.onCapabilitySpeakerPlaying },
      { cap: "speaker_shuffle", handler: this.onCapabilitySpeakerShuffle },
      { cap: "speaker_repeat", handler: this.onCapabilitySpeakerRepeat },
      { cap: "speaker_next", handler: this.onCapabilitySpeakerNext },
      { cap: "speaker_prev", handler: this.onCapabilitySpeakerPrevious },
      { cap: "speaker_position", handler: this.onCapabilitySpeakerPosition },
      { cap: "volume_up", handler: this.onCapabilityVolumeUp },
      { cap: "volume_down", handler: this.onCapabilityVolumeDown },
      { cap: "volume_mute", handler: this.onCapabilityVolumeMute },
      { cap: "volume_set", handler: this.onCapabilityVolumeSet },
      { cap: "speaker_wake_up", handler: this.onCapabilitySpeakerWakeUp },
      { cap: "speaker_sleep", handler: this.onCapabilitySpeakerSleep },
      { cap: "speaker_auto_radio", handler: this.onCapabilityAutoRadio },
      { cap: "volume_soft_limit", handler: this.onCapabilityVolumeSoftLimit },
    ];

    capabilityListeners.forEach(({ cap, handler }) => {
      this.registerCapabilityListener(cap, handler.bind(this));
    });

    // now we want the state of the output to be updated
    const transport = zoneManager.getTransport();
    if (transport !== null) {
      this.zone = transport.zone_by_output_id(this.getData().id);
      if (this.zone !== null) {
        await this.updateZones([this.zone]);
      }
    }

    this.log("RoonOutputDevice has been initialized");
  }

  async onAdded() {
    this.log("RoonOutputDevice has been added");
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log("RoonOutputDevice settings where changed");
  }

  async onRenamed(name) {
    this.log("RoonOutputDevice was renamed");
  }

  async onDeleted() {
    zoneManager.off("zonesUpdated", this._boundOnZonesUpdated);
    zoneManager.off("zonesChanged", this._boundOnZonesChanged);
    zoneManager.off("zonesSeekChanged", this._boundOnZonesSeekChanged);

    this.log("RoonZone has been deleted");
  }

  updateZones = async (zones) => {
    let found = false;
    for (let zone of zones) {
      for (let output of zone.outputs) {
        if (output.output_id === this.getData().id) {
          found = true;

          this.zone = Object.assign({}, zone);

          if (zone.state) {
            let isPlaying = zone.state === "playing";
            this.log(`Zone state: ${zone.state}, playing: ${isPlaying}`);
            await this.setCapabilityValue("speaker_playing", isPlaying).catch(
              this.error,
            );
          }

          if (zone.settings) {
            await this.setCapabilityValue(
              "speaker_shuffle",
              zone.settings.shuffle,
            ).catch(this.error);

            if (this.hasCapability("speaker_auto_radio")) {
              await this.setCapabilityValue(
                "speaker_auto_radio",
                zone.settings.auto_radio,
              ).catch(this.error);
            } else {
              this.log("Auto radio is not available");
            }

            try {
              const loopMap = {
                disabled: "none",
                loop: "playlist",
                loop_one: "track",
              };

              const repeatValue = loopMap[zone.settings.loop];

              if (repeatValue) {
                await this.setCapabilityValue("speaker_repeat", repeatValue);
              }
            } catch (error) {
              this.error("Error setting repeat value", error);
            }
          }

          if (zone.now_playing?.seek_position) {
            await this.setCapabilityValue(
              "speaker_position",
              +zone.now_playing.seek_position,
            ).catch(this.error);
          }

          if (zone.now_playing?.three_line) {
            await this.setCapabilityValue(
              "speaker_track",
              zone.now_playing.three_line.line1,
            ).catch(this.error);

            await this.setCapabilityValue(
              "speaker_artist",
              zone.now_playing.three_line.line2,
            ).catch(this.error);

            await this.setCapabilityValue(
              "speaker_album",
              zone.now_playing.three_line.line3,
            ).catch(this.error);
          }

          if (zone.now_playing?.length) {
            await this.setCapabilityValue(
              "speaker_duration",
              +zone.now_playing.length,
            ).catch(this.error);
          }

          if (zone.queue_items_remaining) {
            await this.setCapabilityValue(
              "speaker_queue_items_remaining",
              +zone.queue_items_remaining,
            ).catch(this.error);
          }

          if (zone.queue_time_remaining) {
            await this.setCapabilityValue(
              "speaker_queue_time_remaining",
              zone.queue_time_remaining,
            ).catch(this.error);
          }

          if (output.volume) {
            await this.setCapabilityValue(
              "volume_mute",
              output.volume.is_muted,
            ).catch(this.error);
            await this.setCapabilityValue(
              "volume_set",
              +output.volume.value / 100,
            );
            await this.setCapabilityValue(
              "volume_soft_limit",
              +output.volume.soft_limit,
            );
          }

          try {
            const imageDriver = zoneManager.getImageDriver();

            if (imageDriver && zone && zone.now_playing) {
              const newImageKey = zone.now_playing.image_key;
              if (newImageKey !== this.currentImageKey) {
                await imageUtil.fetchAndSaveImage(
                  imageDriver,
                  newImageKey,
                  this.imagePath,
                );
                await this.albumArtImage.update();
                this.currentImageKey = newImageKey;
              }
            }
          } catch (err) {
            this.error(`Error setting image. Error: ${err.message}`);
          }

          break;
        }
      }
    }
  };

  onZonesUpdated = async (zones) => {
    this.log("onZonesUpdated");
    await this.updateZones(zones);
  };

  onZonesChanged = async (zones) => {
    this.log("onZonesChanged");
    await this.updateZones(zones);
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (!this.zone) {
      return;
    }

    for (let zone of zones_seek_changed) {
      if (zone.zone_id === this.zone.zone_id) {
        if (zone.seek_position !== undefined) {
          await this.setCapabilityValue(
            "speaker_position",
            zone.seek_position,
          ).catch((err) =>
            this.error(
              `onZonesChanged - Error setting speaker_position! Error: ${err.message}`,
            ),
          );
        }
        if (zone.queue_time_remaining !== undefined) {
          await this.setCapabilityValue(
            "speaker_queue_time_remaining",
            zone.queue_time_remaining,
          ).catch((err) =>
            this.error(
              `onZonesChanged -Error setting speaker_queue_time_remaining! Error: ${err.message}`,
            ),
          );
        }
        break;
      }
    }
  };

  onCapabilitySpeakerPlaying = (value, opts) => {
    this.log("onCapabilitySpeakerPlaying", value, opts);

    const action = value ? "play" : "pause";

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerPlaying - Transport is not available");
        return;
      }

      transport.control(this.getData().id, action);
      this.log(`Setting speaker playing to ${action}`);
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPlaying - Setting speaker playing to ${action} failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerShuffle = (value, opts) => {
    this.log("onCapabilitySpeakerShuffle", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerShuffle - Transport is not available");
        return;
      }
      
      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilitySpeakerShuffle - Zone is not available");
        return;
      }
      
      transport.change_settings(this.zone.zone_id, {
        shuffle: value,
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerShuffle - Setting shuffle to ${value} failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerRepeat = (value, opts) => {
    this.log("onCapabilitySpeakerRepeat", value, opts);

    const loopMap = {
      none: "disabled",
      playlist: "loop",
      track: "loop_one",
    };

    const loop = loopMap[value] || "disabled";

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerRepeat - Transport is not available");
        return;
      }
      
      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilitySpeakerRepeat - Zone is not available");
        return;
      }
      
      transport.change_settings(this.zone.zone_id, { loop });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerRepeat - Setting loop to ${value} failed! Error:  ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerNext = (value, opts) => {
    this.log("onCapabilitySpeakerNext", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerNext - Transport is not available");
        return;
      }
      transport.control(this.getData().id, "next");
    } catch (err) {
      this.error(
        `onCapabilitySpeakerNext - Setting speaker playing to next failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerPrevious = (value, opts) => {
    this.log("onCapabilitySpeakerPrevious", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("Transport is not available");
        return;
      }
      transport.control(this.getData().id, "previous");
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPrevious- Setting speaker playing to previous failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerPosition = (value, opts) => {
    this.log("onCapabilitySpeakerPosition", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerPrevious - Transport is not available");
        return;
      }
      transport.seek(this.getData().id, "absolute", value);
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPrevious - Setting speaker position ${value} failed! Error: ${err.message}`,
      );
    }
  };

  changeVolume = async (direction) => {
    const transport = zoneManager.getTransport();
    if (!transport) {
      this.error("changeVolume - Transport is not available");
      return;
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
            "relative",
            direction,
            (err) => {
              if (err) {
                reject(
                  new Error(
                    `changeVolume - Failed to change volume! Error: ${err.message}`,
                  ),
                );
              } else {
                resolve();
              }
            },
          );
        });
      });

    try {
      await Promise.all(volumeChangePromises);
    } catch (err) {
      this.error(`changeVolume - Error changing volume. Error: ${err.message}`);
    }
  };

  onCapabilityVolumeUp = async (value, opts) => {
    this.log("onCapabilityVolumeUp", value, opts);
    await this.changeVolume(1);
  };

  onCapabilityVolumeDown = async (value, opts) => {
    this.log("onCapabilityVolumeDown", value, opts);
    await this.changeVolume(-1);
  };

  onCapabilityVolumeMute = async (value, opts) => {
    this.log("onCapabilityVolumeMute", value, opts);

    const transport = zoneManager.getTransport();
    if (!transport) {
      this.error("onCapabilityVolumeMute - Transport is not available");
      return;
    }

    if (!this.zone) {
      this.error("onCapabilityVolumeMute - Zone is not available");
      return;
    }

    if (!Array.isArray(this.zone.outputs)) {
      this.error(
        "onCapabilityVolumeMute - Zone outputs are not available or invalid.",
      );
      return;
    }

    const volumeMutePromises = this.zone.outputs
      .filter((output) => output.output_id === this.getData().id) // only this output!
      .map((output) =>
        transport.mute(output.output_id, value ? "mute" : "unmute"),
      );

    try {
      await Promise.all(volumeMutePromises);
    } catch (error) {
      this.error(error);
    }
  };

  onCapabilityVolumeSet = async (value, opts) => {
    this.log("onCapabilityVolumeSet", value, opts);

    const transport = zoneManager.getTransport();
    if (!transport) {
      this.error("onCapabilityVolumeSet - Transport is not available");
      return;
    }

    if (!this.zone) {
      return;
    }

    if (+value < 0 || +value > 1) {
      this.error("onCapabilityVolumeSet - Volume must be between 0 and 1");
      return;
    }

    const output = this.zone.outputs.find(
      (output) => output.output_id === this.getData().id,
    );
    if (!output) {
      this.error("onCapabilityVolumeSet - Output not found");
      return;
    }

    const volumeToSet = Math.min(+value * 100, output.volume.soft_limit);

    try {
      await new Promise((resolve, reject) => {
        transport.change_volume(
          this.getData().id,
          "absolute",
          volumeToSet,
          (err) => {
            if (err) {
              reject(
                new Error(
                  `onCapabilityVolumeSet - Failed to set volume! Error: ${err.message}`,
                ),
              );
            } else {
              resolve();
            }
          },
        );
      });
      await this.setCapabilityValue("volume_set", volumeToSet / 100);
    } catch (err) {
      this.error(
        `onCapabilityVolumeSet - Setting volume failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilityVolumeSoftLimit = async (value, opts) => {
    this.log("onCapabilityVolumeSoftLimit", value, opts);
    const softLimitToSet = Math.max(0, Math.min(100, value));
    this.log(`Setting volume soft limit to: ${softLimitToSet}`);

    try {
      await this.setCapabilityValue("volume_soft_limit", softLimitToSet);
    } catch (err) {
      this.error(
        `onCapabilityVolumeSoftLimit - Setting soft limit failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerWakeUp = (value, opts) => {
    this.log("onCapabilitySpeakerWakeUp", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerWakeUp - Transport is not available");
        return;
      }
      transport.convenience_switch(this.getData().id, {});
    } catch (err) {
      this.error(
        `onCapabilitySpeakerWakeUp - Triggering wake up failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerSleep = (value, opts) => {
    this.log("onCapabilitySpeakerSleep", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerSleep - Transport is not available");
        return;
      }
      transport.standby(this.getData().id, {});
    } catch (err) {
      this.error(
        `onCapabilitySpeakerSleep - Triggering stand by failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilityAutoRadio = (value, opts) => {
    this.log("onCapabilityAutoRadio", value, opts);

    try {
      const transport = zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilityAutoRadio - Transport is not available");
        return;
      }
      
      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilityAutoRadio - Zone is not available");
        return;
      }
      
      transport.change_settings(this.zone.zone_id, {
        auto_radio: value,
      });
    } catch (err) {
      this.error(
        `onCapabilityAutoRadio - Setting auto_radio to ${value} failed! Error: ${err.message}`,
      );
    }
  };

  async onRegisterArgumentAutocompleteListenerArtistRadio(query, args) {
    this.log("autocompleting: ", query);

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    const artists = await browseAndLoadAllHierarchy(browse, "artists");

    console.log("artists: ", artists);

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    artists.items = artists.items.sort(() => 0.5 - Math.random());

    // Filter only if query is not empty
    if (query.length > 0) {
      artists.items = artists.items.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()),
      );
    }

    this.log(`found ${artists.items.length} artists`);
    this.log("first item: ", artists.items[0]);
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

    this.log("offset: ", artists.offset);
    this.log("list: ", artists.list);
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
      };
    });
  }

  async onRunListenerArtistRadioOutputActionCard(args, state) {
    try {
      const { artist } = args;

      // artist: { id: '17:314', name: 'Lenny Kravitz' }
      this.log(`Play artist action - ${artist.name}`);

      if (!artist || !artist.name || artist.name.trim().length === 0) {
        throw new Error("Artist is not defined");
      }

      const { core } = this.homey.app;
      const browse = new RoonApiBrowse(core);

      const artistsResult = await browseAndLoadAllHierarchy(browse, "artists");

      const filteredArtists = artistsResult.items.filter((a) =>
        a.title.toLowerCase().includes(artist.name.toLowerCase()),
      );
      this.log(`Found ${filteredArtists.length} artists`);

      if (filteredArtists.length === 0) {
        throw new Error(`Artist ${artist.name} was not found`);
      }
      const artistItem = filteredArtists[0];
      this.log("Artist item:", artistItem);

      const albumsResult = await browseAndLoadItemLevel(
        browse,
        "artists",
        artistItem.item_key,
        1,
      );
      this.log("albumsResult: ", albumsResult);

      const playArtistItem = albumsResult.items.find(
        (i) => i.title === "Play Artist",
      );
      if (!playArtistItem) {
        this.error("Play Artist Item was not found");
        return;
      }

      const radioResult = await browseAndLoadItemLevel(
        browse,
        "artists",
        playArtistItem.item_key,
        2,
      );
      this.log("radioResult: ", radioResult);

      const startRadioItem = radioResult.items.find(
        (i) => i.title === "Start Radio",
      );
      if (!startRadioItem) {
        this.error("Start Radio was not found");
        return;
      }

      this.log("the title: ", startRadioItem.title);
      this.log("the item key:", startRadioItem.item_key);

      // Ensure that the zone exists before attempting to send the command
      if (!this.zone || !this.zone.zone_id) {
        throw new Error("Current zone is not available");
      }

      // Issue a final browse command to trigger starting the artist radio
      await browseZoneOrOutput(
        browse,
        "artists",
        this.getData().id,
        startRadioItem.item_key,
      );
    } catch (error) {
      this.error((error && error.message) || error);
    }
  }

  async onRegisterArgumentAutocompleteListenerInternetRadio(query, args) {
    this.log("autocompleting: ", query);

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    const internet_radios = await browseAndLoadAllHierarchy(
      browse,
      "internet_radio",
    );

    console.log("internet_radios: ", internet_radios);

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    internet_radios.items = internet_radios.items.sort(
      () => 0.5 - Math.random(),
    );

    // Filter only if query is not empty
    if (query.length > 0) {
      internet_radios.items = internet_radios.items.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()),
      );
    }

    this.log(`found ${internet_radios.items.length} internet radios`);
    this.log("first item: ", internet_radios.items[0]);
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

    this.log("offset: ", internet_radios.offset);
    this.log("list: ", internet_radios.list);
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
      };
    });
  }

  async onRunListenerInternetRadioOutputActionCard(args, state) {
    // artist: { id: '17:314', name: 'Lenny Kravitz' },
    const { internet_radio } = args;

    this.log(`Play internet radio action - ${internet_radio.name}`);

    if (
      !internet_radio ||
      !internet_radio.name ||
      internet_radio.name.length === 0
    ) {
      this.error("Internet radio is not defined");
      return;
    }

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    // we cannot trust this number so let's just search again for the artist
    const internetRadios = await browseAndLoadAllHierarchy(
      browse,
      "internet_radio",
    );

    console.log("internetRadios: ", JSON.stringify(internetRadios, null, 2));

    internetRadios.items = internetRadios.items.filter((a) =>
      a.title.toLowerCase().includes(internet_radio.name.toLowerCase()),
    );
    console.log(`found ${internetRadios.items.length} internet radios`);
    if (internetRadios.items.length === 0) {
      this.error(`Internet radio ${internetRadios} was not found`);
      return;
    }

    const internetRadioItem = internetRadios.items[0];
    this.log("item: ", internetRadioItem);

    browse.browse(
      {
        hierarchy: "internet_radio",
        zone_or_output_id: this.getData().id,
        item_key: internetRadioItem.item_key,
      },
      (error5, body5) => {
        if (error5) {
          this.error(error5);
        }
        this.log("browse5", body5);
      },
    );
  }

  async onRegisterArgumentAutocompleteListenerPlaylist(query, args) {
    this.log("autocompleting: ", query);

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    const playlists = await browseAndLoadAllHierarchy(browse, "playlists");

    console.log("playlists: ", playlists);

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    playlists.items = playlists.items.sort(() => 0.5 - Math.random());

    // Filter only if query is not empty
    if (query.length > 0) {
      playlists.items = playlists.items.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()),
      );
    }

    this.log(`found ${playlists.items.length} playlists`);
    this.log("first item: ", playlists.items[0]);
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

    this.log("offset: ", playlists.offset);
    this.log("list: ", playlists.list);
    // artists.list:
    // {
    //   level: 0,
    //       title: 'Artists',
    //     subtitle: null,
    //     image_key: null,
    //     count: 584,
    //     display_offset: null
    // }

    return playlists.items.map((playlist) => {
      return {
        id: playlist.item_key,
        name: playlist.title,
      };
    });
  }

  async onRunListenerPlaylistOutputActionCard(args, state) {
    // artist: { id: '17:314', name: 'Lenny Kravitz' },
    const { playlist } = args;

    this.log(`Play playlist action - ${playlist.name}`);

    if (!playlist || !playlist.name || playlist.name.length === 0) {
      this.error("Playlist is not defined");
      return;
    }

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    // we cannot trust this number so let's just search again for the artist
    const playlists = await browseAndLoadAllHierarchy(browse, "playlists");
    playlists.items = playlists.items.filter((a) =>
      a.title.toLowerCase().includes(playlist.name.toLowerCase()),
    );
    this.log(`found ${playlists.items.length} playlists`);
    if (playlists.items.length === 0) {
      this.error(`Playlist ${playlist} was not found`);
      return;
    }

    const playlistItem = playlists.items[0];
    this.log("item: ", playlistItem);

    browse.browse(
      { hierarchy: "playlists", item_key: playlistItem.item_key },
      (error, body) => {
        if (error) {
          this.error(error);
        }
        this.log("browse", body);
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
          { hierarchy: "playlists", level: 1, count: +body.count },
          (error2, body2) => {
            if (error2) {
              this.error(error2);
            }
            this.log("load2", body2);
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

            const playPlaylistItem = body2.items.find(
              (i) => i.title === "Play Playlist",
            );

            if (!playPlaylistItem) {
              this.error("Play Playlist Item was not found");
              return;
            }

            browse.browse(
              {
                hierarchy: "playlists",
                item_key: playPlaylistItem.item_key,
              },
              (error3, body3) => {
                if (error3) {
                  this.error(error3);
                }
                this.log("browse3", body3);
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
                  { hierarchy: "playlists", level: 2, count: +body3.count },
                  (error4, body4) => {
                    if (error4) {
                      this.error(error4);
                    }
                    this.log("load4", body4);
                    // load4 {
                    //   items: [
                    //     {
                    //       title: 'Play Now',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '64:0',
                    //       hint: 'action'
                    //     },
                    //     {
                    //       title: 'Shuffle',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '64:1',
                    //       hint: 'action'
                    //     },
                    //     {
                    //       title: 'Add Next',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '64:2',
                    //       hint: 'action'
                    //     },
                    //     {
                    //       title: 'Queue',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '64:3',
                    //       hint: 'action'
                    //     },
                    //     {
                    //       title: 'Start Radio',
                    //       subtitle: null,
                    //       image_key: null,
                    //       item_key: '64:4',
                    //       hint: 'action'
                    //     }
                    //   ],
                    //   offset: 0,
                    //   list: {
                    //     level: 2,
                    //     title: 'Play Playlist',
                    //     subtitle: null,
                    //     image_key: null,
                    //     count: 5,
                    //     display_offset: null,
                    //     hint: 'action_list'
                    //   }

                    const startPlaylistItem = body4.items.find(
                      (i) => i.title === "Play Now",
                    );

                    if (!startPlaylistItem) {
                      this.error("Play Playlist was not found");
                      return;
                    }

                    this.log("the title: ", startPlaylistItem.title);
                    this.log("the item key:", startPlaylistItem.item_key);

                    // start playing the artist
                    browse.browse(
                      {
                        hierarchy: "playlists",
                        zone_or_output_id: this.getData().id,
                        item_key: startPlaylistItem.item_key,
                      },
                      (error5, body5) => {
                        if (error5) {
                          this.error(error5);
                        }
                        this.log("browse5", body5);
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
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  async onRegisterArgumentAutocompleteListenerGenre(query, args) {
    this.log(`autocompleting genres: ${query} ${query.length} `);

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    this.log(`Loading all genres`);
    const genres = await browseAndLoadAllHierarchy(browse, "genres");

    console.log("genres: ", genres);

    // now I want to put all items in artists.items in a random order
    // I want to provide a function to shuffle the items

    genres.items = genres.items.sort(() => 0.5 - Math.random());

    // Filter only if query is not empty
    if (query.length > 0) {
      genres.items = genres.items.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()),
      );
    }

    this.log(`found ${genres.items.length} genres`);
    this.log("first item: ", genres.items[0]);
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

    this.log("offset: ", genres.offset);
    this.log("list: ", genres.list);
    // artists.list:
    // {
    //   level: 0,
    //       title: 'Artists',
    //     subtitle: null,
    //     image_key: null,
    //     count: 584,
    //     display_offset: null
    // }

    return genres.items.map((genre) => {
      return {
        id: genre.item_key,
        name: genre.title,
      };
    });
  }

  async onRunListenerGenreOutputActionCard(args, state) {
    // artist: { id: '17:314', name: 'Lenny Kravitz' },
    const { genre } = args;

    this.log(`Play genre action - ${genre.name}`);

    if (!genre || !genre.name || genre.name.length === 0) {
      this.error("Genre is not defined");
      return;
    }

    const { core } = this.homey.app;
    const browse = new RoonApiBrowse(core);

    if (!browse) {
      this.error("Browse instance is not available");
      return;
    }

    // we cannot trust this number so let's just search again for the artist
    const genres = await browseAndLoadAllHierarchy(browse, "genres");
    genres.items = genres.items.filter((a) =>
      a.title.toLowerCase().includes(genre.name.toLowerCase()),
    );
    console.log(`found ${genres.items.length} genres`);
    if (genres.items.length === 0) {
      this.error(`Genre ${genre} was not found`);
      return;
    }

    const genreItem = genres.items[0];
    this.log("item: ", genreItem);

    browse.browse(
      { hierarchy: "genres", item_key: genreItem.item_key },
      (error, body) => {
        if (error) {
          this.error(error);
        }
        this.log("browse", body);
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
          { hierarchy: "genres", level: 1, count: +body.count },
          (error2, body2) => {
            if (error2) {
              this.error(error2);
            }
            this.log("load2", body2);
            // load2:
            // {
            //   items: [
            //     {
            //       title: 'Play Genre',
            //       subtitle: null,
            //       image_key: null,
            //       item_key: '8:0',
            //       hint: 'action_list'
            //     },
            //     {

            const playArtistItem = body2.items.find(
              (i) => i.title === "Play Genre",
            );

            if (!playArtistItem) {
              this.error("Play Genre Item was not found");
              return;
            }

            browse.browse(
              {
                hierarchy: "genres",
                item_key: playArtistItem.item_key,
              },
              (error3, body3) => {
                if (error3) {
                  this.error(error3);
                }
                this.log("browse3", body3);
                // browse3 {
                //   action: 'list',
                //   list: {
                //     level: 2,
                //     title: 'Play Genre',
                //     subtitle: null,
                //     image_key: null,
                //     count: 2,
                //     display_offset: null,
                //     hint: 'action_list'
                //   }
                // }
                //

                browse.load(
                  { hierarchy: "genres", level: 2, count: +body3.count },
                  (error4, body4) => {
                    if (error4) {
                      this.error(error4);
                    }
                    this.log("load4", body4);
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

                    const startGenreItem = body4.items.find(
                      (i) => i.title === "Shuffle",
                    );

                    if (!startGenreItem) {
                      this.error("Shuffle was not found");
                      return;
                    }

                    this.log("the title: ", startGenreItem.title);
                    this.log("the item key:", startGenreItem.item_key);

                    // start playing the artist
                    browse.browse(
                      {
                        hierarchy: "genres",
                        zone_or_output_id: this.getData().id,
                        item_key: startGenreItem.item_key,
                      },
                      (error5, body5) => {
                        if (error5) {
                          this.error(error5);
                        }
                        this.log("browse5", body5);
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
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }
}

module.exports = RoonOutputDevice;
