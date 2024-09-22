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

    zoneManager.on("zonesUpdated", this.onZonesUpdated);
    zoneManager.on("zonesChanged", this.onZonesChanged);
    zoneManager.on("zonesRemoved", this.onZonesRemoved);
    zoneManager.on("zonesSeekChanged", this.onZonesSeekChanged);

    this.registerCapabilityListener(
      "speaker_playing",
      this.onCapabilitySpeakerPlaying,
    );

    this.registerCapabilityListener(
      "speaker_shuffle",
      this.onCapabilitySpeakerShuffle,
    );

    this.registerCapabilityListener(
      "speaker_repeat",
      this.onCapabilitySpeakerRepeat,
    );

    this.registerCapabilityListener(
      "speaker_next",
      this.onCapabilitySpeakerNext,
    );

    this.registerCapabilityListener(
      "speaker_prev",
      this.onCapabilitySpeakerPrevious,
    );

    this.registerCapabilityListener(
      "speaker_position",
      this.onCapabilitySpeakerPosition,
    );

    this.registerCapabilityListener("volume_up", this.onCapabilityVolumeUp);
    this.registerCapabilityListener("volume_down", this.onCapabilityVolumeDown);
    this.registerCapabilityListener("volume_mute", this.onCapabilityVolumeMute);

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
    zoneManager.off("zonesUpdated", this.onZonesUpdated);
    zoneManager.off("zonesChanged", this.onZonesChanged);
    zoneManager.off("zonesRemoved", this.onZonesRemoved);
    zoneManager.off("zonesSeekChanged", this.onZonesSeekChanged);
    this.log("RoonZoneDevice has been deleted");
  }

  onZonesUpdated = async (zones) => {
    this.log("onZonesUpdated");

    let found = false;
    for (let zone of zones) {
      if (zone.zone_id === this.getData().id) {
        found = true;

        this.zone = Object.assign({}, zone);

        await this.setCapabilityValue(
          "speaker_playing",
          zone.state === "playing",
        ).catch(this.error);

        await this.setCapabilityValue(
          "speaker_shuffle",
          zone.settings.shuffle,
        ).catch(this.error);

        await this.setCapabilityValue(
          "speaker_shuffle",
          zone.settings.shuffle,
        ).catch(this.error);

        try {
          let repeatValue;
          switch (zone.settings.loop) {
            case "disabled":
              repeatValue = "none";
              break;

            case "loop":
              repeatValue = "playlist";
              break;

            case "loop_one":
              repeatValue = "track";
              break;
          }

          if (repeatValue !== undefined) {
            await this.setCapabilityValue("speaker_repeat", repeatValue);
          }
        } catch (error) {
          this.error("Error setting repeat value", error);
        }

        await this.setCapabilityValue(
          "speaker_position",
          zone.now_playing.seek_position,
        ).catch(this.error);

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

        await this.setCapabilityValue(
          "speaker_duration",
          zone.now_playing.length,
        ).catch(this.error);

        await this.setCapabilityValue(
          "speaker_position",
          zone.now_playing.seek_position,
        ).catch(this.error);

        await this.setCapabilityValue(
          "speaker_queue_items_remaining",
          zone.queue_items_remaining,
        ).catch(this.error);

        await this.setCapabilityValue(
          "speaker_queue_time_remaining",
          zone.queue_time_remaining,
        ).catch(this.error);

        try {
          for (let output of zone.outputs) {
            let is_muted = false;
            if (output.volume.is_muted) {
              is_muted = true;
            }
            await this.setCapabilityValue("volume_mute", is_muted).catch(
              this.error,
            );
          }
        } catch (error) {
          this.error("Error setting volume_mute", error);
        }

        try {
          if (zone && zone.now_playing && zone.now_playing.image_key) {
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
    // if (!found) {
    //   await this.setUnavailable("Roon zone unavailable");
    // }
  };

  onZonesChanged = async (zones) => {
    return this.onZonesUpdated(zones);
  };

  onZonesRemoved = async (data) => {
    for (let zoneId of data) {
      if (zoneId === this.getData().id) {
        this.log("Zone removed -", zoneId);
        await this.setUnavailable("The zone is removed from Roon");
      }
    }
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (this.zone === null) {
      return Promise.resolve();
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
    // value is true or false
    const action = value ? "play" : "pause";
    return new Promise((res, rej) => {
      zoneManager.transport.control(this.getData().id, action, (err) => {
        if (err) {
          return Promise.reject(
            new Error(
              "Setting speaker playing to " + action + " failed!" + err,
            ),
          );
        }
        res();
      });
    });
  };

  onCapabilitySpeakerShuffle = async (value, opts) => {
    this.log("onCapabilitySpeakerShuffle", value, opts);

    return new Promise((res, rej) => {
      zoneManager.transport.change_settings(
        this.getData().id,
        { shuffle: value },
        (err) => {
          if (err) {
            return Promise.reject(
              new Error("Setting shuffle to " + value + " failed!" + err),
            );
          }
          res();
        },
      );
    });
  };

  onCapabilitySpeakerRepeat = async (value, opts) => {
    this.log("onCapabilitySpeakerRepeat", value, opts);

    let loop = "disabled";

    switch (value) {
      case "none":
        loop = "disabled";
        break;
      case "playlist":
        loop = "loop";
        break;
      case "track":
        loop = "loop_one";
        break;
    }

    return new Promise((res, rej) => {
      zoneManager.transport.change_settings(
        this.getData().id,
        { loop },
        (err) => {
          if (err) {
            return Promise.reject(
              new Error("Setting loop to " + value + " failed!" + err),
            );
          }
          res();
        },
      );
    });
  };

  onCapabilitySpeakerNext = async (value, opts) => {
    this.log("onCapabilitySpeakerNext", value, opts);

    return new Promise((res, rej) => {
      zoneManager.transport.control(this.getData().id, "next", (err) => {
        if (err) {
          return Promise.reject(
            new Error("Setting speaker playing to next failed!" + err),
          );
        }
        res();
      });
      res();
    });
  };

  onCapabilitySpeakerPrevious = async (value, opts) => {
    this.log("onCapabilitySpeakerPrevious", value, opts);

    return new Promise((res, rej) => {
      zoneManager.transport.control(this.getData().id, "previous", (err) => {
        if (err) {
          return Promise.reject(
            new Error("Setting speaker playing to previous failed!" + err),
          );
        }
        res();
      });
      res();
    });
  };

  onCapabilitySpeakerPosition = async (value, opts) => {
    this.log("onCapabilitySpeakerPosition", value, opts);

    return new Promise((res, rej) => {
      zoneManager.transport.seek(
        this.getData().id,
        "absolute",
        value,
        (err) => {
          if (err) {
            return Promise.reject(
              new Error("Setting speaker position " + value + " failed!" + err),
            );
          }
          res();
        },
      );
      res();
    });
  };

  onCapabilityVolumeUp = async (value, opts) => {
    this.log("onCapabilityVolumeUp", value, opts);

    const volumeChangePromises = this.zone.outputs
      .filter((output) => +output.volume.value < +output.volume.soft_limit)
      .map((output) => {
        return new Promise((res, rej) => {
          zoneManager.transport.change_volume(
            output.output_id,
            "relative",
            1,
            (err) => {
              if (err) {
                rej(new Error("Setting volume up failed! " + err));
              } else {
                res();
              }
            },
          );
        });
      });

    try {
      await Promise.all(volumeChangePromises);
    } catch (error) {
      this.error(error);
    }
  };

  onCapabilityVolumeDown = async (value, opts) => {
    this.log("onCapabilityVolumeDown", value, opts);

    const volumeChangePromises = this.zone.outputs
      .filter((output) => +output.volume.value < +output.volume.soft_limit)
      .map((output) => {
        return new Promise((resolve, reject) => {
          zoneManager.transport.change_volume(
            output.output_id,
            "relative",
            -1,
            (err) => {
              if (err) {
                reject(new Error("Setting volume down failed! " + err));
              } else {
                resolve();
              }
            },
          );
        });
      });

    try {
      await Promise.all(volumeChangePromises);
    } catch (error) {
      this.error(error);
    }
  };

  onCapabilityVolumeMute = async (value, opts) => {
    this.log("onCapabilityVolumeMute", value, opts);

    const volumeMutePromises = this.zone.outputs.map((output) => {
      return new Promise((resolve, reject) => {
        zoneManager.transport.mute(
          output.output_id,
          value ? "mute" : "unmute",
          (err) => {
            if (err) {
              reject(
                new Error(`${value ? "Unmuting" : "Muting"} failed! ` + err),
              );
            } else {
              resolve();
            }
          },
        );
      });
    });

    try {
      await Promise.all(volumeMutePromises);
    } catch (error) {
      this.error(error);
    }
  };
}

module.exports = RoonZoneDevice;
