"use strict";

const Homey = require("homey");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const RoonApiBrowse = require("node-roon-api-browse");

const zoneManager = require("./lib/zone-manager");

class RoonApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.core = null;
    this.transport = null;
    this.imageDriver = null;
    this.unsubscribe = null;
    this.browse = null;

    this.log("RoonApp has been initialized");

    const corePairedTrigger = this.homey.flow.getTriggerCard("core_paired");
    const coreUnpairedTrigger = this.homey.flow.getTriggerCard("core_unpaired");

    this.roonApi = new RoonApi({
      extension_id: "nl.codecarve.roonextension",
      display_name: "Homey",
      display_version: "1.1.5",
      publisher: "CodeCarve",
      email: "help@codecarve.nl",
      website: "https://github.com/codecarve/roonextension/issues",
      log_level: "none",
      force_server: true,
      core_paired: (core) => {
        this.log("Roon core is pairing...");

        try {
          this.core = core;
          this.transport = core.services.RoonApiTransport;
          this.imageDriver = core.services.RoonApiImage;

          this.unsubscribe = this.transport.subscribe_zones(
            (response, data) => {
              zoneManager.updateZones(response, data);
            },
          );

          zoneManager.updateTransport(this.transport);
          zoneManager.updateImageDriver(this.imageDriver);
        } catch (error) {
          this.error("Error handling core pairing", error);
        }

        corePairedTrigger
          .trigger({
            name: core.display_name,
            ip: core.registration.extension_host,
            port: core.registration.http_port,
          })
          .then()
          .catch(this.error);

        this.log("Roon core is paired");
      },
      core_unpaired: (core) => {
        this.log("Roon Core is unpairing...");

        try {
          this.core = null;
          this.transport = null;
          this.imageDriver = null;
          this.browse = null;

          if (this.unsubscribe) {
            if (typeof this.unsubscribe === "function") {
              this.unsubscribe();
            }
            this.unsubscribe = null;
          }
          zoneManager.updateTransport(null);
          zoneManager.updateImageDriver(null);
        } catch (error) {
          this.error("Error handling core unpairing", error);
        }

        coreUnpairedTrigger
          .trigger({
            name: core.display_name,
            ip: core.registration.extension_host,
            port: core.registration.http_port,
          })
          .then()
          .catch(this.error);
        this.log("Roon core is unpaired");
      },
      set_persisted_state: (state) => {
        this.homey.settings.set("roonstate", state);
      },
      get_persisted_state: () => {
        const state = this.homey.settings.get("roonstate") || {};
        if (typeof state !== "object") {
          throw new Error("Persisted state is not an object");
        }
        return state;
      },
    });

    const svc_status = new RoonApiStatus(this.roonApi);
    this.roonApi.init_services({
      required_services: [RoonApiTransport, RoonApiImage, RoonApiBrowse],
      provided_services: [svc_status],
    });

    this.roonApi.start_discovery();

    svc_status.set_status("All is good", false);

    this.registerFlowActions();
  }

  registerFlowActions() {
    const muteAllAction = this.homey.flow.getActionCard("mute_all");
    muteAllAction.registerRunListener(async (args, state) => {
      return this.muteAllZones();
    });

    const pauseAllAction = this.homey.flow.getActionCard("pause_all");
    pauseAllAction.registerRunListener(async (args, state) => {
      return this.pauseAllZones();
    });
  }

  async muteAllZones() {
    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    // Add small delay to allow any pending operations to settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    const zones = Object.values(zoneManager.zones);
    const mutePromises = [];

    for (const zone of zones) {
      for (const output of zone.outputs || []) {
        // Always attempt to mute if output has volume control - don't check is_muted state to avoid race conditions
        if (output.volume) {
          mutePromises.push(
            new Promise((resolve, reject) => {
              this.transport.mute(output.output_id, "mute", (err) => {
                if (err) {
                  this.error(
                    `Failed to mute output ${output.display_name || output.output_id}:`,
                    err,
                  );
                  reject(
                    new Error(`Failed to mute output ${output.output_id}`),
                  );
                } else {
                  this.log(
                    `Muted output: ${output.display_name || output.output_id}`,
                  );
                  resolve();
                }
              });
            }),
          );
        }
      }
    }

    if (mutePromises.length === 0) {
      this.log("No outputs with volume control found to mute");
      return true;
    }

    try {
      const results = await Promise.allSettled(mutePromises);
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      this.log(
        `Mute all completed: ${successful} successful, ${failed} failed`,
      );
      return true;
    } catch (error) {
      this.error("Error in mute all operation:", error);
      return true; // Don't throw to avoid flow failure
    }
  }

  async pauseAllZones() {
    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    // Add small delay to allow any pending operations to settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    const zones = Object.values(zoneManager.zones);
    let pausedCount = 0;
    let errorCount = 0;

    for (const zone of zones) {
      if (zone.state === "playing") {
        try {
          this.transport.control(zone.zone_id, "pause");
          pausedCount++;
          this.log(`Paused zone: ${zone.display_name || zone.zone_id}`);
        } catch (error) {
          errorCount++;
          this.error(
            `Failed to pause zone ${zone.display_name || zone.zone_id}:`,
            error,
          );
        }
      }
    }

    if (pausedCount === 0 && errorCount === 0) {
      this.log("No zones to pause");
      return true;
    }

    this.log(`Paused ${pausedCount} zones, ${errorCount} errors`);
    return true;
  }
}

module.exports = RoonApp;
