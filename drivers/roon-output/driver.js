"use strict";

const Homey = require("homey");

const zoneManager = require("../../lib/zone-manager");

class RoonOutputDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("RoonOutputDriver has been initialized");
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    if (zoneManager.transport === null) {
      throw new Error(
        "Roon is not connected. Make sure the Roon Server is running, and enable the Homey extension in Settings -> Extensions.",
      );
    }
    const zones = zoneManager.getZones();
    const outputs = [];

    for (let zone of zones) {
      for (let output of zone.outputs) {
        outputs.push(output);
      }
    }
    return outputs.map((output) => {
      return {
        name: output.display_name,
        data: {
          id: output.output_id,
        },
        store: {},
        settings: {},
      };
    });
  }
}

module.exports = RoonOutputDriver;
