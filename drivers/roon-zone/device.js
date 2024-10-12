"use strict";

const Homey = require("homey");

const { writeFile } = require("../../lib/image-util");

const zoneManager = require("../../lib/zone-manager");

class RoonZoneDevice extends Homey.Device {
  async onInit() {
    this.zone = null;

    this.currentImage = "";
    const data = this.getData();
    if (!data || !data.id) {
      this.error("Device data or ID is undefined");
      return;
    }
    this.imagePath = `/userdata/${data.id}.jpeg`;

    this.albumArtImage = await this.homey.images.createImage();
    if (this.albumArtImage) {
      this.albumArtImage.setPath(this.imagePath);
      await this.setAlbumArtImage(this.albumArtImage);
      this.log("Album art image created");
    } else {
      this.error("Failed to create album art image");
    }

    this._boundOnZonesUpdated = this.onZonesUpdated.bind(this);
    zoneManager.on("zonesUpdated", this._boundOnZonesUpdated);
    this._boundOnZonesChanged = this.onZonesChanged.bind(this);
    zoneManager.on("zonesChanged", this._boundOnZonesChanged);
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

    // now we want the state of the zone to be updated
    const transport = zoneManager.getTransport();
    if (transport) {
      this.zone = transport.zone_by_zone_id(this.getData().id);
      if (this.zone != null) {
        await this.updateZones([this.zone]);
      }
    }

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
    zoneManager.off("zonesSeekChanged", this._boundOnZonesSeekChanged);
    this.log("RoonZoneDevice has been deleted");
  }

  updateZones = async (zones) => {
    let found = false;

    for (let zone of zones) {
      if (zone.zone_id === this.getData().id) {
        found = true;

        this.zone = Object.assign({}, zone);

        if (zone.state) {
          let isPlaying = zone.state === "playing";
          this.log(`zone state: ${zone.state}, playing: ${isPlaying}`);

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

        if (Array.isArray(zone.outputs)) {
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
        } else {
          this.error("Zone outputs are not available or invalid.");
        }

        try {
          if (zone && zone.now_playing) {
            const newImage = zone.now_playing.image_key;
            if (newImage !== this.currentImage) {
              const buffer = await new Promise((resolve, reject) => {
                zoneManager.getImageDriver()?.get_image(
                  zone.now_playing.image_key,
                  {
                    format: "image/jpeg",
                  },
                  (err, contentType, buffer) => {
                    if (err) return reject(err);
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
  };

  onZonesUpdated = async (zones) => {
    this.log("onZonesUpdated");

    await this.updateZones(zones, true);
  };

  onZonesChanged = async (zones) => {
    this.log("onZonesChanged");
    await this.updateZones(zones, false);
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
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

  onCapabilitySpeakerPlaying = (value, opts) => {
    this.log("onCapabilitySpeakerPlaying", value, opts);

    const action = value ? "play" : "pause";
    try {
      zoneManager.getTransport()?.control(this.getData().id, action);
    } catch (err) {
      this.error(`Setting speaker playing to ${action} failed! ${err}`);
    }
  };

  onCapabilitySpeakerShuffle = (value, opts) => {
    this.log("onCapabilitySpeakerShuffle", value, opts);

    try {
      zoneManager.getTransport()?.change_settings(this.getData().id, {
        shuffle: value,
      });
    } catch (err) {
      this.error(`Setting shuffle to ${value} failed! ${err}`);
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
      zoneManager.getTransport()?.change_settings(this.getData().id, { loop });
    } catch (err) {
      this.error(`Setting loop to ${value} failed! ${err}`);
    }
  };

  onCapabilitySpeakerNext = (value, opts) => {
    this.log("onCapabilitySpeakerNext", value, opts);

    try {
      zoneManager.getTransport()?.control(this.getData().id, "next");
    } catch (err) {
      this.error(`Setting speaker playing to next failed! ${err}`);
    }
  };

  onCapabilitySpeakerPrevious = (value, opts) => {
    this.log("onCapabilitySpeakerPrevious", value, opts);

    try {
      zoneManager.getTransport()?.control(this.getData().id, "previous");
    } catch (err) {
      this.error(`Setting speaker playing to previous failed! ${err}`);
    }
  };

  onCapabilitySpeakerPosition = (value, opts) => {
    this.log("onCapabilitySpeakerPosition", value, opts);

    try {
      zoneManager.getTransport()?.seek(this.getData().id, "absolute", value);
    } catch (err) {
      this.error(`Setting speaker position ${value} failed! ${err}`);
    }
  };

  changeVolume = async (direction) => {
    if (!this.zone) {
      this.error("changeVolume - Zone is not available");
      return;
    }
    if (!Array.isArray(this.zone.outputs)) {
      this.error("changeVolume - Zone outputs are not available or invalid.");
      return;
    }

    const volumeChangePromises = this.zone.outputs
      .filter((output) =>
        direction > 0
          ? +output.volume.value < +output.volume.soft_limit
          : +output.volume.value > 0,
      )
      .map(
        (output) =>
          new Promise((resolve, reject) => {
            const transport = zoneManager.getTransport();
            if (transport) {
              transport.change_volume(
                output.output_id,
                "relative",
                direction,
                (error) => {
                  if (error) {
                    reject(new Error("Failed to change volume: " + error));
                  } else {
                    resolve();
                  }
                },
              );
            } else {
              reject(new Error("Transport is not available"));
            }
          }),
      );

    try {
      await Promise.all(volumeChangePromises);
    } catch (error) {
      this.error("Error changing volume: " + error.message);
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

    const volumeMutePromises = this.zone.outputs.map(
      (output) =>
        new Promise((resolve, reject) => {
          const transport = zoneManager.getTransport();
          if (transport) {
            transport.mute(
              output.output_id,
              value ? "mute" : "unmute",
              (error) => {
                if (error) {
                  reject(new Error("Failed to mute/unmute: " + error));
                } else {
                  resolve();
                }
              },
            );
          } else {
            reject(new Error("Transport is not available"));
          }
        }),
    );

    try {
      await Promise.all(volumeMutePromises);
    } catch (error) {
      this.error("Error handling mute/unmute: " + error.message);
    }
  };
}

module.exports = RoonZoneDevice;
