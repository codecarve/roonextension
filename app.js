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
      display_version: "1.1.6",
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

    const playQueueAction = this.homey.flow.getActionCard("play_queue");
    playQueueAction.registerRunListener(async (args, state) => {
      return this.playQueue(args.device);
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

  async playQueue(device) {
    this.log("=== Play Queue Action Started ===");
    this.log("Device:", device.getName());

    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    const deviceData = device.getData();
    let zoneId;

    if (device.driver.id === "roon-zone") {
      zoneId = deviceData.id;
    } else if (device.driver.id === "roon-output") {
      const outputId = deviceData.id;
      const allZones = Object.values(zoneManager.zones);
      const zoneWithOutput = allZones.find(
        (zone) =>
          zone.outputs &&
          zone.outputs.some((output) => output.output_id === outputId),
      );

      if (zoneWithOutput) {
        zoneId = zoneWithOutput.zone_id;
      } else {
        throw new Error("No zone found containing this output");
      }
    } else {
      throw new Error(`Unknown driver type: ${device.driver.id}`);
    }

    return new Promise((resolve, reject) => {
      this.log("Getting queue for zone:", zoneId);
      this.log("Transport available:", !!this.transport);

      let unsubscribeQueue = null;

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (unsubscribeQueue && typeof unsubscribeQueue === 'function') {
          try {
            unsubscribeQueue();
          } catch (error) {
            this.error("Error unsubscribing from queue:", error);
          }
        }
        this.error("Queue subscription timed out after 10 seconds");
        reject(new Error("Queue subscription timeout"));
      }, 10000);

      try {
        unsubscribeQueue = this.transport.subscribe_queue(zoneId, 10, (response, data) => {
          clearTimeout(timeout);
          
          // Safely unsubscribe after getting the data
          if (unsubscribeQueue && typeof unsubscribeQueue === 'function') {
            try {
              unsubscribeQueue();
              unsubscribeQueue = null;
            } catch (error) {
              this.error("Error unsubscribing from queue:", error);
            }
          }

        this.log("=== QUEUE SUBSCRIPTION CALLBACK ===");
        this.log("Response:", response);
        this.log("Data:", data ? JSON.stringify(data, null, 2) : "null");

        if (
          response === "Subscribed" &&
          data &&
          data.items &&
          data.items.length > 0
        ) {
          const firstItem = data.items[0];
          this.log("Queue has", data.items.length, "items");
          this.log("First item:", JSON.stringify(firstItem, null, 2));
          this.log("Playing from queue item:", firstItem.queue_item_id);

          // Add timeout for play_from_here operation
          const playTimeout = setTimeout(() => {
            this.error("play_from_here timed out after 5 seconds");
            reject(new Error("Play from queue timeout"));
          }, 5000);

          this.transport.play_from_here(
            zoneId,
            firstItem.queue_item_id,
            (msg, body) => {
              clearTimeout(playTimeout);
              this.log("=== PLAY_FROM_HERE CALLBACK ===");
              this.log("Message:", msg);
              this.log("Body:", body ? JSON.stringify(body, null, 2) : "null");
              if (msg === "Success") {
                this.log("Successfully started queue playback");
                resolve();
              } else {
                this.error("play_from_here failed:", msg, body);
                reject(new Error(`Failed to play from queue: ${msg}`));
              }
            },
          );
        } else if (response === "Subscribed") {
          this.log("Queue appears empty or malformed, data:", data);
          this.log("Using simple play command instead");
          
          // Promisify the control command for empty queue
          try {
            this.transport.control(zoneId, "play");
            // Add small delay to allow the command to process
            setTimeout(() => {
              this.log("Simple play command sent for empty queue");
              resolve();
            }, 100);
          } catch (error) {
            this.error("Failed to send play command:", error);
            reject(new Error(`Failed to play: ${error.message}`));
          }
        } else {
          this.error("Failed to subscribe to queue, response:", response);
          reject(new Error(`Queue subscription failed: ${response}`));
        }
        });

        this.log("subscribe_queue call made, waiting for callback...");
      } catch (error) {
        clearTimeout(timeout);
        this.error("Error subscribing to queue:", error);
        reject(new Error(`Failed to subscribe to queue: ${error.message}`));
      }
    });
  }
}

module.exports = RoonApp;
