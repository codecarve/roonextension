"use strict";

const Homey = require("homey");


class RoonZoneDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("RoonZoneDriver has been initialized");

    // Register flow action for auto radio
    const autoRadioAction = this.homey.flow.getActionCard(
      "speaker_auto_radio_zone",
    );
    autoRadioAction.registerRunListener(async (args, state) => {
      // Backward compatibility: support both old 'enabled' and new 'onoff' parameters
      let enabled;
      if (args.onoff !== undefined) {
        // New format with dropdown
        enabled = args.onoff === "on";
      } else if (args.enabled !== undefined) {
        // Old format with checkbox (backward compatibility)
        enabled = args.enabled;
        this.log(
          "Warning: Using deprecated 'enabled' parameter in Roon Radio flow action. Please recreate this flow.",
        );
      } else {
        // Default to false if neither parameter exists
        enabled = false;
      }
      return args.device.onCapabilityAutoRadio(enabled, null);
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const zoneManager = this.homey.app.getZoneManager();
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

        const devices = body.zones
          .filter((zone) => zone.outputs && zone.outputs.length > 1)
          .map((zone) => {
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
