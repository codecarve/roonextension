"use strict";

const Homey = require("homey");

const zoneManager = require("../../lib/zone-manager");

class RoonZoneDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("RoonZoneDriver has been initialized");
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
      transport.get_zones((success, body) => {
        if (!body || !Array.isArray(body.zones) || body.zones.length === 0) {
          reject(new Error("No zones found."));
        }

        const devices = body.zones.map((zone) => {
          if (!zone.display_name || !zone.zone_id) {
            throw new Error("Invalid zone data.");
          }
          return {
            name: zone.display_name,
            data: {
              id: zone.zone_id,
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

module.exports = RoonZoneDriver;
