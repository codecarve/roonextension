"use strict";

const Homey = require("homey");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const RoonApiBrowse = require("node-roon-api-browse");

const ZoneManager = require("./lib/zone-manager");

// Constants for delays and timeouts
const GLOBAL_OP_DELAY_MS = 150;
const QUEUE_TIMEOUT_MS = 10000;
const OUTPUT_SLEEP_DELAY_MS = 100;

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
    this.zoneManager = new ZoneManager();

    this.log("RoonApp has been initialized");

    // Set up zone manager logger
    this.zoneManager.setLogger(this.log.bind(this));

    const corePairedTrigger = this.homey.flow.getTriggerCard("core_paired");
    const coreUnpairedTrigger = this.homey.flow.getTriggerCard("core_unpaired");

    this.roonApi = new RoonApi({
      extension_id: "nl.codecarve.roonextension",
      display_name: "Homey",
      display_version: "1.1.13",
      publisher: "CodeCarve",
      email: "hello@codecarve.nl",
      website: "https://github.com/codecarve/roonextension/issues",
      log_level: "none",
      force_server: true,
      core_paired: (core) => {
        this.log("Roon core is pairing...");

        try {
          this.core = core;
          this.transport = core.services.RoonApiTransport;
          this.imageDriver = core.services.RoonApiImage;
          this.browse = core.services.RoonApiBrowse;

          this.unsubscribe = this.transport.subscribe_zones(
            (response, data) => {
              this.zoneManager.updateZones(response, data);
            },
          );

          this.zoneManager.updateTransport(this.transport);
          this.zoneManager.updateImageDriver(this.imageDriver);
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
          // Unsubscribe before nulling services
          if (this.unsubscribe) {
            if (typeof this.unsubscribe === "function") {
              this.unsubscribe();
            }
            this.unsubscribe = null;
          }

          // Clear zone manager references
          this.zoneManager.updateTransport(null);
          this.zoneManager.updateImageDriver(null);

          // Now null the service references
          this.core = null;
          this.transport = null;
          this.imageDriver = null;
          this.browse = null;
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
    this.registerFlowConditions();
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

    const sleepAllAction = this.homey.flow.getActionCard("sleep_all");
    sleepAllAction.registerRunListener(async (args, state) => {
      return this.sleepAllOutputs();
    });

    const playQueueAction = this.homey.flow.getActionCard("play_queue");
    playQueueAction.registerRunListener(async (args, state) => {
      return this.playQueue(args.device);
    });

    // Group with output action
    const groupWithOutputAction =
      this.homey.flow.getActionCard("group_with_output");
    groupWithOutputAction.registerRunListener(async (args, state) => {
      const device = args.device;
      const target = args.target; // Autocomplete object with {name, id}
      const targetId = typeof target === "string" ? target : target.id;

      if (!this.transport) {
        throw new Error(this.homey.__("errors.transport_not_available"));
      }

      try {
        const deviceId = device.getData().id;

        this.log(`Grouping device ${deviceId} with target ${targetId}`);

        // Check if already grouped with the target
        const currentZone = this.zoneManager.findZoneByOutputId(deviceId);
        const targetZone = this.zoneManager.findZoneByOutputId(targetId);

        this.log(
          `Current zone for device: ${currentZone?.zone_id}, outputs: ${currentZone?.outputs?.length}`,
        );
        this.log(
          `Target zone: ${targetZone?.zone_id}, outputs: ${targetZone?.outputs?.length}`,
        );

        if (
          currentZone &&
          targetZone &&
          currentZone.zone_id === targetZone.zone_id
        ) {
          this.log(`Devices are already grouped together`);
          return true;
        }

        // Check if target is already in a group
        if (targetZone && targetZone.outputs.length > 1) {
          // Target is grouped - we need to ungroup the target first
          this.log(`Target is grouped, ungrouping target first...`);
          await this.zoneManager.ungroupOutput(targetId);
        }

        // If device is in a group but target isn't, the target will be added to device's group
        // If device is not in a group, a new group will be created
        // The device (being acted upon) will remain the primary output
        this.log(`Grouping with target (device remains primary)...`);
        await this.zoneManager.groupOutputs(deviceId, targetId);

        return true;
      } catch (error) {
        this.error(`Group with output failed: ${error.message}`);
        throw new Error(this.homey.__("errors.grouping_failed"));
      }
    });

    groupWithOutputAction.registerArgumentAutocompleteListener(
      "target",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerGroupWithOutput(
          query,
        );
      },
    );

    // Leave group action
    const leaveGroupAction = this.homey.flow.getActionCard("leave_group");
    leaveGroupAction.registerRunListener(async (args, state) => {
      const device = args.device;

      if (!this.transport) {
        throw new Error(this.homey.__("errors.transport_not_available"));
      }

      try {
        const result = await this.zoneManager.ungroupOutput(
          device.getData().id,
        );

        if (!result.wasGrouped) {
          this.log("Device was not grouped, no action taken");
        }

        return true;
      } catch (error) {
        this.error(`Leave group failed: ${error.message}`);
        throw new Error(this.homey.__("errors.ungrouping_failed"));
      }
    });

    // Transfer playback action
    const transferPlaybackAction = this.homey.flow.getActionCard(
      "transfer_playback_to",
    );
    transferPlaybackAction.registerRunListener(async (args, state) => {
      const device = args.device;
      const target = args.target; // Autocomplete object with {name, id}
      const targetId = typeof target === "string" ? target : target.id;

      if (!this.transport) {
        throw new Error(this.homey.__("errors.transport_not_available"));
      }

      try {
        const fromId = device.getData().id;

        // Check if source and target are the same
        if (fromId === targetId) {
          this.log(
            `Transfer cancelled: source and target are the same (${fromId})`,
          );
          return true; // Silently succeed without doing anything
        }

        this.log(`Transferring playback from ${fromId} to ${targetId}`);
        await this.zoneManager.transferPlayback(fromId, targetId);

        return true;
      } catch (error) {
        this.error(`Transfer playback failed: ${error.message}`);
        throw new Error(this.homey.__("errors.transfer_failed"));
      }
    });

    transferPlaybackAction.registerArgumentAutocompleteListener(
      "target",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerTransferPlayback(
          query,
        );
      },
    );
  }

  registerFlowConditions() {
    this.homey.flow
      .getConditionCard("core_is_paired")
      .registerRunListener(async (args, state) => {
        return this.core !== null;
      });
  }

  async muteAllZones() {
    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    // Add small delay to allow any pending operations to settle
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_OP_DELAY_MS));

    const zones = Object.values(this.zoneManager.zones);
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
      // Only return true if at least some operations succeeded
      if (successful > 0) {
        return true;
      } else if (failed > 0) {
        throw new Error(`All mute operations failed (${failed} devices)`);
      } else {
        // No zones found
        return true;
      }
    } catch (error) {
      this.error("Error in mute all operation:", error);
      throw error; // Propagate error to flow
    }
  }

  async pauseAllZones() {
    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    // Add small delay to allow any pending operations to settle
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_OP_DELAY_MS));

    const zones = Object.values(this.zoneManager.zones);
    const pausePromises = [];

    for (const zone of zones) {
      if (zone.state === "playing") {
        pausePromises.push(
          new Promise((resolve) => {
            this.transport.control(zone.zone_id, "pause", (err) => {
              if (err) {
                this.error(
                  `Failed to pause zone ${zone.display_name || zone.zone_id}: ${err}`,
                );
                resolve({
                  success: false,
                  zone: zone.display_name || zone.zone_id,
                });
              } else {
                this.log(`Paused zone: ${zone.display_name || zone.zone_id}`);
                resolve({
                  success: true,
                  zone: zone.display_name || zone.zone_id,
                });
              }
            });
          }),
        );
      }
    }

    if (pausePromises.length === 0) {
      this.log("No zones to pause");
      return true;
    }

    try {
      const results = await Promise.allSettled(pausePromises);
      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const failed = results.filter(
        (r) => r.status === "fulfilled" && !r.value.success,
      ).length;

      this.log(`Paused ${successful} zones, ${failed} errors`);
      // Only return true if at least some operations succeeded
      if (successful > 0) {
        return true;
      } else if (failed > 0) {
        throw new Error(`All pause operations failed (${failed} zones)`);
      } else {
        // No playing zones found
        return true;
      }
    } catch (error) {
      this.error("Error in pause all operation:", error);
      throw error; // Propagate error to flow
    }
  }

  async sleepAllOutputs() {
    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    // Add small delay to allow any pending operations to settle
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_OP_DELAY_MS));

    // Get all outputs from all zones
    const zones = Object.values(this.zoneManager.zones);
    const outputs = [];

    for (const zone of zones) {
      for (const output of zone.outputs || []) {
        outputs.push(output);
      }
    }

    this.log(`Turning off ${outputs.length} outputs one by one`);

    let successCount = 0;
    let errorCount = 0;

    // Process outputs one by one with a small delay between each
    for (const output of outputs) {
      try {
        await new Promise((resolve, reject) => {
          this.transport.standby(output.output_id, {}, (err) => {
            if (err) {
              errorCount++;
              this.error(
                `Failed to turn off output ${output.display_name}: ${err}`,
              );
              resolve(); // Continue with other outputs even if one fails
            } else {
              successCount++;
              this.log(
                `Successfully sent standby command to output: ${output.display_name}`,
              );
              resolve();
            }
          });
        });

        // Small delay between outputs to avoid overwhelming the system
        await new Promise((resolve) =>
          setTimeout(resolve, OUTPUT_SLEEP_DELAY_MS),
        );
      } catch (error) {
        errorCount++;
        this.error(`Failed to turn off output ${output.display_name}:`, error);
      }
    }

    this.log(
      `Sleep all operation completed. Success: ${successCount}, Errors: ${errorCount}`,
    );
    return true;
  }

  getZoneManager() {
    return this.zoneManager;
  }

  async playQueue(device) {
    this.log("=== Play Queue Action Started ===");
    this.log("Device:", device.getName());

    if (!this.transport) {
      throw new Error("Roon core not connected");
    }

    const deviceData = device.getData();
    let targetId;
    let targetType;

    if (device.driver.id === "roon-zone") {
      targetId = deviceData.id;
      targetType = "zone";
    } else if (device.driver.id === "roon-output") {
      targetId = deviceData.id;
      targetType = "output";
    } else {
      throw new Error(`Unknown driver type: ${device.driver.id}`);
    }

    this.log(`Target: ${targetType} ${targetId}`);

    return new Promise((resolve, reject) => {
      let unsubscribeQueue = null;
      let isResolved = false;

      // Overall timeout to prevent hanging
      const overallTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          if (unsubscribeQueue && typeof unsubscribeQueue === "function") {
            try {
              unsubscribeQueue();
            } catch (error) {
              this.error("Error unsubscribing during timeout:", error);
            }
          }
          // made this log instead of error
          this.log("Play queue operation timed out after 10 seconds");
          resolve();
          //reject(new Error("Play queue operation timeout"));
        }
      }, QUEUE_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(overallTimeout);
        if (unsubscribeQueue && typeof unsubscribeQueue === "function") {
          try {
            unsubscribeQueue();
            unsubscribeQueue = null;
          } catch (error) {
            this.error("Error during cleanup:", error);
          }
        }
      };

      try {
        this.log("Subscribing to queue for target:", targetId);

        unsubscribeQueue = this.transport.subscribe_queue(
          targetId,
          10,
          (response, data) => {
            if (response === "Subscribed") {
              cleanup();

              if (data && data.items && data.items.length > 0) {
                const firstItem = data.items[0];
                this.log("Queue has", data.items.length, "items");
                this.log("First item queue_item_id:", firstItem.queue_item_id);

                this.transport.play_from_here(
                  targetId,
                  firstItem.queue_item_id,
                );
                resolve(true);
              } else {
                // Empty queue - fall back to simple play
                this.log("Queue is empty, using fallback play command");
                this.transport.control(targetId, "play", (err) => {
                  if (err) {
                    this.error(`Failed to execute play command: ${err}`);
                  }
                });
                resolve(true);
              }
            } else {
              cleanup();
              if (!isResolved) {
                isResolved = true;
                this.error("Failed to subscribe to queue, response:", response);
                reject(new Error(`Queue subscription failed: ${response}`));
              }
            }
          },
        );

        this.log("Queue subscription initiated, waiting for callback...");
      } catch (error) {
        cleanup();
        if (!isResolved) {
          isResolved = true;
          this.error("Error subscribing to queue:", error);
          reject(new Error(`Failed to subscribe to queue: ${error.message}`));
        }
      }
    });
  }
}

module.exports = RoonApp;
