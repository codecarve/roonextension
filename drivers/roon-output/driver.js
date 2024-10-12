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
    const transport = zoneManager.getTransport();
    if (transport == null) {
      // check for null or undefined
      throw new Error(
        "Roon is not connected. Make sure the Roon Server is running, and enable the Homey extension in Settings -> Extensions.",
      );
    }

    return new Promise((resolve, reject) => {
      transport.get_outputs((success, body) => {
        if (
          !body ||
          !Array.isArray(body.outputs) ||
          body.outputs.length === 0
        ) {
          reject(new Error("No outputs found."));
        }

        const devices = body.outputs.map((output) => {
          if (!output.display_name || !output.output_id) {
            throw new Error("Invalid output data.");
          }
          return {
            name: output.display_name,
            data: {
              id: output.output_id,
            },
            store: {},
            settings: {},
          };
        });

        resolve(devices);
      });
    });
  }
}

module.exports = RoonOutputDriver;
