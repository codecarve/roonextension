"use strict";

const Homey = require("homey");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");

const zoneManager = require("../../lib/zone-manager");

class RoonCoreDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.roonApi = new RoonApi({
      extension_id: "nl.codecarve.homeyroon",
      display_name: "Homey",
      display_version: "0.3.0",
      publisher: "CodeCarve",
      email: "help@codecarve.nl",
      website: "https://codecarve.nl",
      log_level: "none",
      force_server: true,
      core_paired: (core) => {
        this.log("Roon core is pairing...");

        this.getDevices().map((device) => {
          device.setAvailable();
        });

        this.handleCorePaired(core);

        this.log("Roon core is paired");
      },
      core_unpaired: (core) => {
        this.log("Roon Core is unpairing...");

        this.getDevices().map((device) => {
          device.setUnavailable("Roon core is unpaired");
        });
      },
      set_persisted_state: (state) => {
        this.log("set_persisted_state", JSON.stringify(state, null, 2));
        this.homey.settings.set("roonstate", state);
      },
      get_persisted_state: () => {
        const state = this.homey.settings.get("roonstate") || {};
        this.log("get_persisted_state", JSON.stringify(state, null, 2));
        return state;
      },
    });

    const svc_status = new RoonApiStatus(this.roonApi);
    this.roonApi.init_services({
      required_services: [RoonApiTransport, RoonApiImage],
      provided_services: [svc_status],
    });

    this.roonApi.start_discovery();

    const core = this.roonApi.core;
    if (core) {
      this.handleCorePaired(core);
    }

    svc_status.set_status("All is good", false);

    this.log("RoonCoreDriver has been initialized");
  }

  handleCorePaired(core) {
    this.transport = core.services.RoonApiTransport;
    this.imageDriver = core.services.RoonApiImage;
    zoneManager.updateTransport(this.transport);
    zoneManager.updateImageDriver(this.imageDriver);
    zoneManager.updateCore(core);

    this.transport.subscribe_zones((response, data) => {
      // this.log(
      //   `handleCorePaired - ${response} - `,
      //   JSON.stringify(data, null, 2),
      // );

      zoneManager.updateZones(data);
      zoneManager.updateCore(null);
    });
  }
}

module.exports = RoonCoreDriver;
