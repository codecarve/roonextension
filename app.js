"use strict";

const Homey = require("homey");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");

const zoneManager = require("./lib/zone-manager");

class RoonApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.roonApi = new RoonApi({
      extension_id: "nl.codecarve.roonextension",
      display_name: "Homey",
      display_version: "1.0.5",
      publisher: "CodeCarve",
      email: "help@codecarve.nl",
      website: "https://github.com/codecarve/roonextension/issues",
      log_level: "none",
      force_server: true,
      core_paired: (core) => {
        this.log("Roon core is pairing...");

        this.handleCorePaired(core);

        this.log("Roon core is paired");
      },
      core_unpaired: (core) => {
        this.log("Roon Core is unpairing...");
        zoneManager.updateTransport(null);
        zoneManager.updateImageDriver(null);
        this.roonApi.start_discovery();
      },
      set_persisted_state: (state) => {
        //this.log("set_persisted_state", JSON.stringify(state, null, 2));
        this.homey.settings.set("roonstate", state);
      },
      get_persisted_state: () => {
        const state = this.homey.settings.get("roonstate") || {};
        //this.log("get_persisted_state", JSON.stringify(state, null, 2));
        return state;
      },
    });

    const svc_status = new RoonApiStatus(this.roonApi);
    this.roonApi.init_services({
      required_services: [RoonApiTransport, RoonApiImage],
      provided_services: [svc_status],
    });

    this.roonApi.start_discovery();

    svc_status.set_status("All is good", false);

    this.log("RoonApp has been initialized");
  }

  async handleCorePaired(core) {
    this.transport = core.services.RoonApiTransport;
    this.imageDriver = core.services.RoonApiImage;

    try {
      zoneManager.updateTransport(core.services.RoonApiTransport);
      zoneManager.updateImageDriver(core.services.RoonApiImage);

      this.transport.subscribe_zones((response, data) => {
        zoneManager.updateZones(data);
      });
    } catch (error) {
      this.error("Error handling core pairing", error);
    }
  }
}

module.exports = RoonApp;
