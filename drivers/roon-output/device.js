"use strict";

const Homey = require("homey");

const imageUtil = require("../../lib/image-util");

const {
  browseAndLoadAllHierarchy,
  browseZoneOrOutput,
  browseAndLoadItemLevel,
} = require("../../lib/browser-util");

class RoonOutputDevice extends Homey.Device {
  async onInit() {
    this.zone = null;
    this.browse = null;
    this.zoneManager = this.homey.app.getZoneManager();

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
    this.zoneManager.on("zonesUpdated", this._boundOnZonesUpdated);
    this._boundOnZonesChanged = this.onZonesChanged.bind(this);
    this.zoneManager.on("zonesChanged", this._boundOnZonesChanged);
    this._boundOnZonesSeekChanged = this.onZonesSeekChanged.bind(this);
    this.zoneManager.on("zonesSeekChanged", this._boundOnZonesSeekChanged);

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
    const transport = this.zoneManager.getTransport();
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
    this.zoneManager.off("zonesUpdated", this._boundOnZonesUpdated);
    this.zoneManager.off("zonesChanged", this._boundOnZonesChanged);
    this.zoneManager.off("zonesSeekChanged", this._boundOnZonesSeekChanged);

    this.log("RoonOutputDevice has been deleted");
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
            const imageDriver = this.zoneManager.getImageDriver();

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

    // Track grouping status for this output
    const myOutputId = this.getData().id;
    let groupStatus = {
      isGrouped: false,
      groupSize: 1,
      isPrimary: false,
    };

    for (const zone of zones) {
      const outputIndex = zone.outputs?.findIndex(
        (o) => o.output_id === myOutputId,
      );
      if (outputIndex !== -1) {
        groupStatus.isGrouped = zone.outputs.length > 1;
        groupStatus.groupSize = zone.outputs.length;
        groupStatus.isPrimary = outputIndex === 0;
        break;
      }
    }

    // Store for potential UI updates
    await this.setStoreValue("group_status", groupStatus).catch(this.error);

    // Update device subtitle if supported
    if (groupStatus.isGrouped) {
      const subtitle = groupStatus.isPrimary
        ? `Primary in group of ${groupStatus.groupSize}`
        : `Grouped (${groupStatus.groupSize} outputs)`;
      // Note: setSubtitle may not be available in all Homey versions
      if (typeof this.setSubtitle === "function") {
        await this.setSubtitle(subtitle).catch(this.error);
      }
    } else {
      if (typeof this.setSubtitle === "function") {
        await this.setSubtitle(null).catch(this.error);
      }
    }
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (
      !this.zone ||
      !zones_seek_changed ||
      !Array.isArray(zones_seek_changed)
    ) {
      return;
    }

    for (let zone of zones_seek_changed) {
      if (!zone || zone.zone_id !== this.zone.zone_id) {
        continue;
      }
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
            `onZonesChanged - Error setting speaker_queue_time_remaining! Error: ${err.message}`,
          ),
        );
      }
      break;
    }
  };

  onCapabilitySpeakerPlaying = (value, opts) => {
    this.log("onCapabilitySpeakerPlaying", value, opts);

    const action = value ? "play" : "pause";

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerPlaying - Transport is not available");
        return;
      }

      transport.control(this.getData().id, action, (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerPlaying - Control command '${action}' failed: ${err}`,
          );
        } else {
          this.log(`Setting speaker playing to ${action}`);
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPlaying - Setting speaker playing to ${action} failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerShuffle = (value, opts) => {
    this.log("onCapabilitySpeakerShuffle", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerShuffle - Transport is not available");
        return;
      }

      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilitySpeakerShuffle - Zone is not available");
        return;
      }

      transport.change_settings(
        this.zone.zone_id,
        {
          shuffle: value,
        },
        (err) => {
          if (err) {
            this.error(
              `onCapabilitySpeakerShuffle - Failed to set shuffle to ${value}: ${err}`,
            );
          }
        },
      );
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
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerRepeat - Transport is not available");
        return;
      }

      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilitySpeakerRepeat - Zone is not available");
        return;
      }

      transport.change_settings(this.zone.zone_id, { loop }, (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerRepeat - Failed to set loop to ${loop}: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerRepeat - Setting loop to ${value} failed! Error:  ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerNext = (value, opts) => {
    this.log("onCapabilitySpeakerNext", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerNext - Transport is not available");
        return;
      }
      transport.control(this.getData().id, "next", (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerNext - Control command 'next' failed: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerNext - Setting speaker playing to next failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerPrevious = (value, opts) => {
    this.log("onCapabilitySpeakerPrevious", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("Transport is not available");
        return;
      }
      transport.control(this.getData().id, "previous", (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerPrevious - Control command 'previous' failed: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPrevious- Setting speaker playing to previous failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerPosition = (value, opts) => {
    this.log("onCapabilitySpeakerPosition", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerPosition - Transport is not available");
        return;
      }
      transport.seek(this.getData().id, "absolute", value, (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerPosition - Seek to position ${value} failed: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerPosition - Setting speaker position ${value} failed! Error: ${err.message}`,
      );
    }
  };

  changeVolume = async (direction) => {
    const transport = this.zoneManager.getTransport();
    if (!transport) {
      this.error("changeVolume - Transport is not available");
      return;
    }
    if (!this.zone) {
      this.error("changeVolume - Zone is not available");
      return;
    }
    if (!Array.isArray(this.zone.outputs)) {
      this.error("changeVolume - Zone outputs are not available or invalid.");
      return;
    }
    const volumeChangePromises = this.zone.outputs
      .filter((output) => output.output_id === this.getData().id) // Only this output!
      .filter((output) => {
        if (!output.volume) return false;
        return direction > 0
          ? +output.volume.value < +output.volume.soft_limit
          : +output.volume.value > 0;
      })
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

    const transport = this.zoneManager.getTransport();
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
      .map(
        (output) =>
          new Promise((resolve, reject) => {
            transport.mute(
              output.output_id,
              value ? "mute" : "unmute",
              (err) => {
                if (err) {
                  this.error(
                    `onCapabilityVolumeMute - Failed to ${value ? "mute" : "unmute"} output ${output.output_id}: ${err}`,
                  );
                  reject(err);
                } else {
                  resolve();
                }
              },
            );
          }),
      );

    try {
      await Promise.all(volumeMutePromises);
    } catch (error) {
      this.error(
        `onCapabilityVolumeMute - Error during mute operation: ${error}`,
      );
    }
  };

  onCapabilityVolumeSet = async (value, opts) => {
    this.log("onCapabilityVolumeSet", value, opts);

    const transport = this.zoneManager.getTransport();
    if (!transport) {
      this.error("onCapabilityVolumeSet - Transport is not available");
      return;
    }

    if (!this.zone) {
      this.error("onCapabilityVolumeSet - Zone is not available");
      return;
    }

    if (!Array.isArray(this.zone.outputs)) {
      this.error("onCapabilityVolumeSet - Zone outputs are not available");
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

    if (!output.volume) {
      this.error("onCapabilityVolumeSet - Output volume control not available");
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
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerWakeUp - Transport is not available");
        return;
      }
      transport.convenience_switch(this.getData().id, {}, (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerWakeUp - Wake up command failed: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerWakeUp - Triggering wake up failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilitySpeakerSleep = (value, opts) => {
    this.log("onCapabilitySpeakerSleep", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilitySpeakerSleep - Transport is not available");
        return;
      }
      transport.standby(this.getData().id, {}, (err) => {
        if (err) {
          this.error(
            `onCapabilitySpeakerSleep - Standby command failed: ${err}`,
          );
        }
      });
    } catch (err) {
      this.error(
        `onCapabilitySpeakerSleep - Triggering stand by failed! Error: ${err.message}`,
      );
    }
  };

  onCapabilityAutoRadio = (value, opts) => {
    this.log("onCapabilityAutoRadio", value, opts);

    try {
      const transport = this.zoneManager.getTransport();
      if (!transport) {
        this.error("onCapabilityAutoRadio - Transport is not available");
        return;
      }

      if (!this.zone || !this.zone.zone_id) {
        this.error("onCapabilityAutoRadio - Zone is not available");
        return;
      }

      transport.change_settings(
        this.zone.zone_id,
        {
          auto_radio: value,
        },
        (err) => {
          if (err) {
            this.error(
              `onCapabilityAutoRadio - Failed to set auto_radio to ${value}: ${err}`,
            );
          }
        },
      );
    } catch (err) {
      this.error(
        `onCapabilityAutoRadio - Setting auto_radio to ${value} failed! Error: ${err.message}`,
      );
    }
  };

  // Helper method for browse autocomplete to reduce code duplication
  async _genericBrowseAutocomplete(query, hierarchy, typeName, errorContext) {
    this.log(`autocompleting ${typeName}: `, query);

    try {
      const app = this.homey.app;
      if (!app) {
        this.error("App instance is not available");
        return [];
      }

      const core = app.core;
      if (!core) {
        this.error("Roon core is not available - is Roon paired?");
        return [];
      }

      const browse = app.browse;
      if (!browse) {
        this.error("Browse service is not available - is Roon paired?");
        return [];
      }

      const items = await browseAndLoadAllHierarchy(browse, hierarchy);

      // Filter only if query is not empty
      if (query.length > 0) {
        items.items = items.items.filter((item) =>
          item.title.toLowerCase().includes(query.toLowerCase()),
        );
      }

      this.log(`found ${items.items.length} ${typeName}`);

      return items.items.map((item) => ({
        id: item.item_key,
        name: item.title,
      }));
    } catch (error) {
      this.error(`Error in ${errorContext} autocomplete:`, error);
      return [];
    }
  }

  // Helper method for action validation and setup
  async _validateAndGetBrowse(args, argName) {
    const item = args[argName];

    if (!item || !item.name || item.name.trim().length === 0) {
      throw new Error(
        `${argName.charAt(0).toUpperCase() + argName.slice(1)} is not defined`,
      );
    }

    const app = this.homey.app;
    if (!app || !app.browse) {
      throw new Error("Browse service is not available");
    }

    return app.browse;
  }

  async onRegisterArgumentAutocompleteListenerArtistRadio(query, args) {
    return this._genericBrowseAutocomplete(
      query,
      "artists",
      "artists",
      "artist radio",
    );
  }

  async onRunListenerArtistRadioOutputActionCard(args, state) {
    try {
      const { artist } = args;

      this.log("===== ARTIST RADIO ACTION START =====");
      this.log(`Play artist action - ${artist.name}`);
      this.log("Artist args:", JSON.stringify(artist, null, 2));

      const browse = await this._validateAndGetBrowse(args, "artist");

      const artistsResult = await browseAndLoadAllHierarchy(browse, "artists");

      const filteredArtists = artistsResult.items.filter((a) =>
        a.title.toLowerCase().includes(artist.name.toLowerCase()),
      );
      this.log(`Found ${filteredArtists.length} artists`);

      if (filteredArtists.length === 0) {
        throw new Error(`Artist "${artist.name}" was not found`);
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
        throw new Error("'Play Artist' action was not found in artist menu");
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
        throw new Error("'Start Radio' option was not found in play modes");
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
      this.log("===== ARTIST RADIO ACTION END =====");
    } catch (error) {
      this.error((error && error.message) || error);
      this.log("===== ARTIST RADIO ACTION ERROR =====");
      throw error;
    }
  }

  async onRegisterArgumentAutocompleteListenerInternetRadio(query, args) {
    return this._genericBrowseAutocomplete(
      query,
      "internet_radio",
      "internet radios",
      "internet radio",
    );
  }

  async onRunListenerInternetRadioOutputActionCard(args, state) {
    try {
      const { internet_radio } = args;

      this.log("===== INTERNET RADIO ACTION START =====");
      this.log(`Play internet radio action - ${internet_radio.name}`);
      this.log("Internet radio args:", JSON.stringify(internet_radio, null, 2));

      const browse = await this._validateAndGetBrowse(args, "internet_radio");

      // Re-search is required - Roon API item keys are dynamic and change between calls
      const internetRadiosResult = await browseAndLoadAllHierarchy(
        browse,
        "internet_radio",
      );

      const filteredRadios = internetRadiosResult.items.filter((a) =>
        a.title.toLowerCase().includes(internet_radio.name.toLowerCase()),
      );
      this.log(`Found ${filteredRadios.length} internet radios`);

      if (filteredRadios.length === 0) {
        throw new Error(
          `Internet radio station "${internet_radio.name}" was not found`,
        );
      }

      const internetRadioItem = filteredRadios[0];
      this.log("Internet radio item:", internetRadioItem);

      // Ensure that the zone exists before attempting to send the command
      if (!this.zone || !this.zone.zone_id) {
        throw new Error("Current zone is not available");
      }

      // Internet radio plays directly without navigation
      await browseZoneOrOutput(
        browse,
        "internet_radio",
        this.getData().id,
        internetRadioItem.item_key,
      );

      this.log("===== INTERNET RADIO ACTION END =====");
    } catch (error) {
      this.error((error && error.message) || error);
      this.log("===== INTERNET RADIO ACTION ERROR =====");
      throw error;
    }
  }

  async onRegisterArgumentAutocompleteListenerPlaylist(query, args) {
    return this._genericBrowseAutocomplete(
      query,
      "playlists",
      "playlists",
      "playlist",
    );
  }

  async onRunListenerPlaylistOutputActionCard(args, state) {
    try {
      const { playlist } = args;

      this.log("===== PLAYLIST ACTION START =====");
      this.log(`Play playlist action - ${playlist.name}`);
      this.log("Playlist args:", JSON.stringify(playlist, null, 2));

      const browse = await this._validateAndGetBrowse(args, "playlist");

      // Re-search is required - Roon API item keys are dynamic and change between calls
      const playlistsResult = await browseAndLoadAllHierarchy(
        browse,
        "playlists",
      );

      const filteredPlaylists = playlistsResult.items.filter((a) =>
        a.title.toLowerCase().includes(playlist.name.toLowerCase()),
      );
      this.log(`Found ${filteredPlaylists.length} playlists`);

      if (filteredPlaylists.length === 0) {
        throw new Error(`Playlist "${playlist.name}" was not found`);
      }

      const playlistItem = filteredPlaylists[0];
      this.log("Playlist item:", playlistItem);

      // Navigate into the playlist
      const playlistDetailsResult = await browseAndLoadItemLevel(
        browse,
        "playlists",
        playlistItem.item_key,
        1,
      );
      this.log("[PLAYLIST-STEP2] Playlist details:", playlistDetailsResult);

      const playPlaylistItem = playlistDetailsResult.items.find(
        (i) => i.title === "Play Playlist",
      );
      if (!playPlaylistItem) {
        throw new Error(
          "'Play Playlist' action was not found in playlist menu",
        );
      }

      // Get play mode options
      const playOptionsResult = await browseAndLoadItemLevel(
        browse,
        "playlists",
        playPlaylistItem.item_key,
        2,
      );
      this.log("[PLAYLIST-STEP3] Play options:", playOptionsResult);

      const playNowItem = playOptionsResult.items.find(
        (i) => i.title === "Play Now",
      );
      if (!playNowItem) {
        throw new Error("'Play Now' option was not found in play modes");
      }

      // Ensure that the zone exists before attempting to send the command
      if (!this.zone || !this.zone.zone_id) {
        throw new Error("Current zone is not available");
      }

      // Execute the play action
      await browseZoneOrOutput(
        browse,
        "playlists",
        this.getData().id,
        playNowItem.item_key,
      );

      this.log("===== PLAYLIST ACTION END =====");
    } catch (error) {
      this.error((error && error.message) || error);
      this.log("===== PLAYLIST ACTION ERROR =====");
      throw error;
    }
  }

  async onRegisterArgumentAutocompleteListenerGenre(query, args) {
    return this._genericBrowseAutocomplete(query, "genres", "genres", "genre");
  }

  async onRunListenerGenreOutputActionCard(args, state) {
    try {
      const { genre } = args;

      this.log("===== GENRE SHUFFLE ACTION START =====");
      this.log(`Play genre action - ${genre.name}`);
      this.log("Genre args:", JSON.stringify(genre, null, 2));

      const browse = await this._validateAndGetBrowse(args, "genre");

      // Re-search is required - Roon API item keys are dynamic and change between calls
      const genresResult = await browseAndLoadAllHierarchy(browse, "genres");

      const filteredGenres = genresResult.items.filter((a) =>
        a.title.toLowerCase().includes(genre.name.toLowerCase()),
      );
      this.log(`Found ${filteredGenres.length} genres`);

      if (filteredGenres.length === 0) {
        throw new Error(`Genre "${genre.name}" was not found`);
      }

      const genreItem = filteredGenres[0];
      this.log("Genre item:", genreItem);

      // Navigate into the genre
      const genreDetailsResult = await browseAndLoadItemLevel(
        browse,
        "genres",
        genreItem.item_key,
        1,
      );
      this.log("[GENRE-STEP2] Genre details:", genreDetailsResult);

      const playGenreItem = genreDetailsResult.items.find(
        (i) => i.title === "Play Genre",
      );
      if (!playGenreItem) {
        throw new Error("'Play Genre' action was not found in genre menu");
      }

      // Get play mode options
      const playOptionsResult = await browseAndLoadItemLevel(
        browse,
        "genres",
        playGenreItem.item_key,
        2,
      );
      this.log("[GENRE-STEP3] Play options:", playOptionsResult);

      const shuffleItem = playOptionsResult.items.find(
        (i) => i.title === "Shuffle",
      );
      if (!shuffleItem) {
        throw new Error("'Shuffle' option was not found in play modes");
      }

      // Ensure that the zone exists before attempting to send the command
      if (!this.zone || !this.zone.zone_id) {
        throw new Error("Current zone is not available");
      }

      // Execute the shuffle action
      await browseZoneOrOutput(
        browse,
        "genres",
        this.getData().id,
        shuffleItem.item_key,
      );

      this.log("===== GENRE SHUFFLE ACTION END =====");
    } catch (error) {
      this.error((error && error.message) || error);
      this.log("===== GENRE SHUFFLE ACTION ERROR =====");
      throw error;
    }
  }

  async onRegisterArgumentAutocompleteListenerGroupWithOutput(query) {
    const zoneManager = this.homey.app.getZoneManager();
    const myOutputId = this.getData().id;

    const compatible = zoneManager.getCompatibleOutputs(myOutputId);
    const results = [];

    for (const item of compatible) {
      if (
        item.output.display_name.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          name: item.output.display_name,
          id: item.output.output_id,
        });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async onRegisterArgumentAutocompleteListenerTransferPlayback(query) {
    const zoneManager = this.homey.app.getZoneManager();
    const results = [];

    // Add all outputs except self
    const myOutputId = this.getData().id;

    for (const zone of Object.values(zoneManager.zones)) {
      // Add individual outputs only (no zones)
      for (const output of zone.outputs || []) {
        if (output.output_id !== myOutputId) {
          if (output.display_name.toLowerCase().includes(query.toLowerCase())) {
            // Check if we already added this output (in case it appears in multiple zones)
            if (!results.find((r) => r.id === output.output_id)) {
              results.push({
                name: output.display_name,
                id: output.output_id,
              });
            }
          }
        }
      }
    }

    // Remove duplicates and sort
    const unique = Array.from(
      new Map(results.map((item) => [item.id, item])).values(),
    );
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }
}

module.exports = RoonOutputDevice;
