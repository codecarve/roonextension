"use strict";

const Homey = require("homey");

const zoneManager = require("../../lib/zone-manager");
const { writeFile } = require("../../lib/image-util");

class RoonZoneDevice extends Homey.Device {
  async onInit() {
    this.zone = null;

    this.currentImage = "";
    this.imagePath = `/userdata/${this.getData().id}.jpeg`;

    this.albumArtImage = await this.homey.images.createImage();
    this.albumArtImage.setPath(this.imagePath);
    await this.setAlbumArtImage(this.albumArtImage);

    this._boundOnZonesUpdated = this.onZonesUpdated.bind(this);
    zoneManager.on("zonesUpdated", this._boundOnZonesUpdated);
    this._boundOnZonesChanged = this.onZonesChanged.bind(this);
    zoneManager.on("zonesChanged", this._boundOnZonesChanged);
    this._boundOnZonesRemoved = this.onZonesRemoved.bind(this);
    zoneManager.on("zonesRemoved", this._boundOnZonesRemoved);
    this._boundOnZonesSeekChanged = this.onZonesSeekChanged.bind(this);
    zoneManager.on("zonesSeekChanged", this._boundOnZonesSeekChanged);

    this.registerCapabilityListener(
      "speaker_playing",
      this.onCapabilitySpeakerPlaying.bind(this),
    );

    this.registerCapabilityListener(
      "speaker_shuffle",
      this.onCapabilitySpeakerShuffle.bind(this),
    );

    this.registerCapabilityListener(
      "speaker_repeat",
      this.onCapabilitySpeakerRepeat.bind(this),
    );

    this.registerCapabilityListener(
      "speaker_next",
      this.onCapabilitySpeakerNext.bind(this),
    );

    this.registerCapabilityListener(
      "speaker_prev",
      this.onCapabilitySpeakerPrevious.bind(this),
    );

    this.registerCapabilityListener(
      "speaker_position",
      this.onCapabilitySpeakerPosition.bind(this),
    );

    this.registerCapabilityListener(
      "volume_up",
      this.onCapabilityVolumeUp.bind(this),
    );

    this.registerCapabilityListener(
      "volume_down",
      this.onCapabilityVolumeDown.bind(this),
    );

    this.registerCapabilityListener(
      "volume_mute",
      this.onCapabilityVolumeMute.bind(this),
    );

    this.log("RoonZoneDevice has been initialized");
  }

  async onAdded() {
    this.log("RoonZoneDevice has been added");
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log("RoonZoneDevice settings where changed");
  }

  async onRenamed(name) {
    this.log("RoonZoneDevice was renamed");
  }

  async onDeleted() {
    zoneManager.off("zonesUpdated", this._boundOnZonesUpdated);
    zoneManager.off("zonesChanged", this._boundOnZonesChanged);
    zoneManager.off("zonesRemoved", this._boundOnZonesRemoved);
    zoneManager.off("zonesSeekChanged", this._boundOnZonesSeekChanged);
    this.log("RoonZoneDevice has been deleted");
  }

  updateZones = async (zones, disableNonExistingZones) => {
    let found = false;

    for (let zone of zones) {
      if (zone.zone_id === this.getData().id) {
        found = true;

        this.zone = Object.assign({}, zone);

        if (zone.state) {
          let isPlaying = zone.state === "playing";
          this.log(`zone state: ${zone.state} playing: ${isPlaying}`);

          await this.setCapabilityValue("speaker_playing", isPlaying).catch(
            this.error,
          );
        }

        if (zone.settings) {
          await this.setCapabilityValue(
            "speaker_shuffle",
            zone.settings.shuffle,
          ).catch(this.error);

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
            zone.now_playing.length,
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
            +zone.queue_time_remaining,
          ).catch(this.error);
        }

        for (let output of zone.outputs) {
          if (output.volume) {
            try {
              let is_muted = output.volume.is_muted;
              await this.setCapabilityValue("volume_mute", is_muted);
            } catch (error) {
              this.error(
                `Error setting volume_mute for output ${output.output_id}`,
                error,
              );
            }
          }
        }

        try {
          if (zone && zone.now_playing) {
            const newImage = zone.now_playing.image_key;
            if (newImage !== this.currentImage) {
              const buffer = await new Promise((resolve, reject) => {
                zoneManager.imageDriver.get_image(
                  zone.now_playing.image_key,
                  {
                    format: "image/jpeg",
                  },
                  (err, contentType, buffer) => {
                    if (err) throw reject(err);
                    resolve(buffer);
                  },
                );
              });
              await writeFile(this.imagePath, buffer, "binary");
              await this.albumArtImage.update();
              this.currentImage = newImage;
            }
          }
        } catch (error) {
          this.error("Error setting image", error);
        }

        break;
      }
    }
    if (!found && disableNonExistingZones) {
      // at startup, a full zone update will be sent and if we don't find the zone, we need to set it unavailable
      // await this.setUnavailable("This zone was not found in Roon");
      // zoneManager.off("zonesUpdated", this._boundOnZonesUpdated);
      // zoneManager.off("zonesChanged", this._boundOnZonesChanged);
      // zoneManager.off("zonesRemoved", this._boundOnZonesRemoved);
      // zoneManager.off("zonesSeekChanged", this._boundOnZonesSeekChanged);
    }
  };

  onZonesUpdated = async (zones) => {
    this.log("onZonesUpdated");

    await this.updateZones(zones, true);
  };

  onZonesChanged = async (zones) => {
    await this.updateZones(zones, false);
  };

  onZonesRemoved = async (zones) => {
    for (let zoneId of zones) {
      if (zoneId === this.getData().id) {
        this.log("Zone removed -", zoneId);
        await this.setUnavailable("The zone is removed from Roon");
      }
    }
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (!this.zone) {
      return;
    }
    for (let zone of zones_seek_changed) {
      if (zone.zone_id === this.getData().id) {
        if (zone.seek_position !== undefined) {
          this.setCapabilityValue("speaker_position", zone.seek_position).catch(
            this.error,
          );
        }
        if (zone.queue_time_remaining !== undefined) {
          this.setCapabilityValue(
            "speaker_queue_time_remaining",
            zone.queue_time_remaining,
          ).catch(this.error);
        }
        break;
      }
    }
  };

  onCapabilitySpeakerPlaying = async (value, opts) => {
    this.log("onCapabilitySpeakerPlaying", value, opts);

    if (!this.zone) {
      return;
    }

    const action = value ? "play" : "pause";
    try {
      await zoneManager.transport.control(this.getData().id, action);
    } catch (err) {
      throw new Error(`Setting speaker playing to ${action} failed! ${err}`);
    }
  };

  onCapabilitySpeakerShuffle = async (value, opts) => {
    this.log("onCapabilitySpeakerShuffle", value, opts);

    try {
      await zoneManager.transport.change_settings(this.getData().id, {
        shuffle: value,
      });
    } catch (err) {
      throw new Error(`Setting shuffle to ${value} failed! ${err}`);
    }
  };

  onCapabilitySpeakerRepeat = async (value, opts) => {
    this.log("onCapabilitySpeakerRepeat", value, opts);

    const loopMap = {
      none: "disabled",
      playlist: "loop",
      track: "loop_one",
    };

    const loop = loopMap[value] || "disabled";

    try {
      await zoneManager.transport.change_settings(this.getData().id, { loop });
    } catch (err) {
      throw new Error(`Setting loop to ${value} failed! ${err}`);
    }
  };

  onCapabilitySpeakerNext = async (value, opts) => {
    this.log("onCapabilitySpeakerNext", value, opts);

    try {
      await zoneManager.transport.control(this.getData().id, "next");
    } catch (err) {
      throw new Error(`Setting speaker playing to next failed! ${err}`);
    }
  };

  onCapabilitySpeakerPrevious = async (value, opts) => {
    this.log("onCapabilitySpeakerPrevious", value, opts);

    try {
      await zoneManager.transport.control(this.getData().id, "previous");
    } catch (err) {
      throw new Error(`Setting speaker playing to previous failed! ${err}`);
    }
  };

  onCapabilitySpeakerPosition = async (value, opts) => {
    this.log("onCapabilitySpeakerPosition", value, opts);

    try {
      await zoneManager.transport.seek(this.getData().id, "absolute", value);
    } catch (err) {
      throw new Error(`Setting speaker position ${value} failed! ${err}`);
    }
  };

  changeVolume = async (direction) => {
    const volumeChangePromises = this.zone.outputs
      .filter((output) =>
        direction > 0
          ? +output.volume.value < +output.volume.soft_limit
          : +output.volume.value > 0,
      )
      .map((output) =>
        zoneManager.transport.change_volume(
          output.output_id,
          "relative",
          direction,
        ),
      );

    try {
      await Promise.all(volumeChangePromises);
    } catch (error) {
      this.error(error);
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

    const volumeMutePromises = this.zone.outputs.map((output) =>
      zoneManager.transport.mute(output.output_id, value ? "mute" : "unmute"),
    );

    try {
      await Promise.all(volumeMutePromises);
    } catch (error) {
      this.error(error);
    }
  };
}

module.exports = RoonZoneDevice;
