"use strict";

const Homey = require("homey");

const zoneManager = require("../../lib/zone-manager");
const { writeFile } = require("../../lib/image-util");

class RoonOutputDevice extends Homey.Device {
  async onInit() {
    this.zone = null;

    this.currentImage = "";
    this.imagePath = `/userdata/${this.getData().id}.jpeg`;

    this.albumArtImage = await this.homey.images.createImage();
    this.albumArtImage.setPath(this.imagePath);
    await this.setAlbumArtImage(this.albumArtImage);

    zoneManager.on("zonesUpdated", this.onZonesUpdated);
    zoneManager.on("zonesChanged", this.onZonesChanged);
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
    this.registerCapabilityListener("volume_set", this.onCapabilityVolumeSet);

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
    zoneManager.off("zonesUpdated", this.onZonesUpdated);
    zoneManager.off("zonesChanged", this.onZonesChanged);
    zoneManager.off("zonesSeekChanged", this.onZonesSeekChanged);

    this.log("RoonZone has been deleted");
  }

  onZonesUpdated = async (zones) => {
    this.log("onZonesUpdated");

    let found = false;
    for (let zone of zones) {
      for (let output of zone.outputs) {
        if (output.output_id === this.getData().id) {
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

          try {
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
          } catch (error) {
            this.error("Error setting image", error);
          }

          break;
        }
      }
    }
    // doesn't work because zones can change
    // if (!found) {
    //   await this.setUnavailable("Roon output unavailable");
    // }
  };

  onZonesChanged = async (zones) => {
    return this.onZonesUpdated(zones);
  };

  onZonesSeekChanged = async (zones_seek_changed) => {
    if (this.zone === null) {
      return Promise.resolve();
    }

    for (let zone of zones_seek_changed) {
      if (zone.zone_id === this.zone.zone_id) {
        if (zone.seek_position !== undefined) {
          await this.setCapabilityValue(
            "speaker_position",
            zone.seek_position,
          ).catch(this.error);
        }
        if (zone.queue_time_remaining !== undefined) {
          await this.setCapabilityValue(
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

    if (this.zone === null) {
      return Promise.resolve();
    }

    // value is true or false
    const action = value ? "play" : "pause";
    return new Promise((res, rej) => {
      zoneManager.transport.control(this.zone.zone_id, action, (err) => {
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

    if (this.zone === null) {
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.change_settings(
        this.zone.zone_id,
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
        this.zone.zone_id,
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

    if (this.zone === null) {
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.control(this.zone.zone_id, "next", (err) => {
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

    if (this.zone === null) {
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.control(this.zone.zone_id, "previous", (err) => {
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

    if (this.zone === null) {
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.seek(
        this.zone.zone_id,
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

    if (+this.getData().volume_set >= this.getData().volume_soft_limit) {
      this.log("Volume is already at or above soft limit");
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.change_volume(
        this.getData().id,
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
  };

  onCapabilityVolumeDown = async (value, opts) => {
    this.log("onCapabilityVolumeUp", value, opts);

    if (+this.getData().volume_set === 0) {
      this.log("Volume is already at 0");
      return Promise.resolve();
    }

    return new Promise((res, rej) => {
      zoneManager.transport.change_volume(
        this.getData().id,
        "relative",
        -1,
        (err) => {
          if (err) {
            rej(new Error("Setting volume up failed! " + err));
          } else {
            res();
          }
        },
      );
    });
  };

  onCapabilityVolumeMute = async (value, opts) => {
    this.log("onCapabilityVolumeMute", value, opts);

    return new Promise((resolve, reject) => {
      zoneManager.transport.mute(
        this.getData().id,
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
  };

  onCapabilityVolumeSet = async (value, opts) => {
    this.log("onCapabilityVolumeSet", value, opts);

    if (this.zone === null) {
      return Promise.resolve();
    }

    if (+value > 1) {
      // for safety, we don't want broken ears
      throw new Error("Volume must be between 0 and 1");
    }

    const output = this.zone.outputs.find(
      (output) => output.output_id === this.getData().id,
    );

    if (output === undefined) {
      throw new Error("Output not found");
    }

    let volumeToSet = +value * 100;
    let currentVolume = output.volume.value;
    let volumeSoftLimit = output.volume.soft_limit;
    let newVolume = 0;

    // if the new volume is within the limit, set it
    // but if the current volume bigger that the soft limit,
    // and the volume to set is bigger than the soft limit,
    // set the new volume to the soft limit
    if (volumeToSet > volumeSoftLimit || currentVolume > volumeSoftLimit) {
      newVolume = volumeSoftLimit;
    } else {
      newVolume = volumeToSet;
    }

    return new Promise((resolve, reject) => {
      zoneManager.transport.change_volume(
        this.getData().id,
        "absolute",
        newVolume,
        (err) => {
          if (err) {
            reject(new Error("Setting volume failed! " + err));
          } else {
            this.setCapabilityValue("volume_set", newVolume / 100);
            resolve();
          }
        },
      );
    });
  };
}

module.exports = RoonOutputDevice;
