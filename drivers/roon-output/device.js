"use strict";

const Homey = require("homey");

const { writeFile } = require("../../lib/image-util");
const zoneManager = require("../../lib/zone-manager");

class RoonOutputDevice extends Homey.Device {
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

    this.registerCapabilityListener(
      "volume_set",
      this.onCapabilityVolumeSet.bind(this),
    );

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
              try {
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
              } catch (error) {
                this.error("Error setting image", error);
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
      }
      transport.change_settings(this.getData().id, {
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
      }
      transport.change_settings(this.getData().id, { loop });
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
}

module.exports = RoonOutputDevice;
