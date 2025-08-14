"use strict";

const EventEmitter = require("events");

class ZoneManager extends EventEmitter {
  constructor() {
    super();
    this.zones = {};
    this.transport = null;
    this.imageDriver = null;
    this.log = () => {}; // Default no-op logger
  }

  setLogger(logFunction) {
    this.log = logFunction || (() => {});
  }

  updateTransport(transport) {
    this.transport = transport;
  }

  updateImageDriver(imageDriver) {
    this.imageDriver = imageDriver;
  }

  getTransport() {
    return this.transport ? this.transport : null;
  }

  getImageDriver() {
    return this.imageDriver ? this.imageDriver : null;
  }

  updateZones(response, msg) {
    if (response === "Subscribed" && msg && msg.zones) {
      this.log(`zones subscribed: ${msg.zones.length}`);
      this.zones = {};
      this.emit("zonesUpdated", msg.zones);
      for (let zone of msg.zones) {
        this.zones[zone.zone_id] = zone;
      }
    } else if (response === "Changed") {
      if (msg && msg.zones_changed) {
        //console.log(`zones changed: ${msg.zones_changed.length}`);
        this.emit("zonesChanged", msg.zones_changed);
        for (let zone of msg.zones_changed) {
          this.zones[zone.zone_id] = zone;
        }
      }

      if (msg && msg.zones_removed) {
        //console.log(`zones removed: ${msg.zones_removed.length}`);
        this.emit("zonesRemoved", msg.zones_removed);
        for (let zoneId of msg.zones_removed) {
          delete this.zones[zoneId];
        }
      }

      if (msg && msg.zones_added) {
        //console.log(`zones added: ${msg.zones_added.length}`);
        this.emit("zonesAdded", msg.zones_added);
        for (let zone of msg.zones_added) {
          this.zones[zone.zone_id] = zone;
        }
      }

      if (msg && msg.zones_seek_changed) {
        this.emit("zonesSeekChanged", msg.zones_seek_changed);
      }
    } else if (response === "Unsubscribed") {
      this.log("Unsubscribed from zones");
      // Keep zones property defined to avoid downstream errors
      this.zones = {};
    }
  }

  // Helper to find output across all zones
  findOutputById(outputId) {
    for (const zone of Object.values(this.zones)) {
      const output = zone.outputs?.find((o) => o.output_id === outputId);
      if (output) return output;
    }
    return null;
  }

  // Helper to find zone containing an output
  findZoneByOutputId(outputId) {
    for (const zone of Object.values(this.zones)) {
      if (zone.outputs?.find((o) => o.output_id === outputId)) {
        return zone;
      }
    }
    return null;
  }

  // Get all outputs that can group with given output
  getCompatibleOutputs(outputId) {
    const output = this.findOutputById(outputId);
    if (!output || !output.can_group_with_output_ids) {
      return [];
    }

    const compatible = [];
    for (const compatibleId of output.can_group_with_output_ids) {
      if (compatibleId === outputId) continue; // Skip self
      const compatibleOutput = this.findOutputById(compatibleId);
      if (compatibleOutput) {
        const zone = this.findZoneByOutputId(compatibleId);
        compatible.push({
          output: compatibleOutput,
          zone: zone,
          isGrouped: zone && zone.outputs.length > 1,
        });
      }
    }
    return compatible;
  }

  // Wait for zone changes to complete
  waitForZoneUpdate(outputId, timeout = 3000) {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.log(`Zone update timeout for output ${outputId}`);
          resolve();
        }
      }, timeout);

      const checkZoneUpdate = (zones) => {
        // Check if any of the changed zones contain our output
        let outputFound = false;

        if (Array.isArray(zones)) {
          for (const zone of zones) {
            if (
              zone.outputs &&
              zone.outputs.some((o) => o.output_id === outputId)
            ) {
              outputFound = true;
              break;
            }
          }
        }

        if (outputFound && !resolved) {
          resolved = true;
          clearTimeout(timer);
          this.removeListener("zonesChanged", checkZoneUpdate);
          this.removeListener("zonesAdded", checkZoneUpdate);
          this.removeListener("zonesRemoved", checkRemoved);
          // Add small delay to ensure state is fully settled
          setTimeout(() => resolve(), 100);
        }
      };

      const checkRemoved = (zoneIds) => {
        // For removed zones, we just need to know something changed
        // since our output might have been in one of those zones
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.removeListener("zonesChanged", checkZoneUpdate);
          this.removeListener("zonesAdded", checkZoneUpdate);
          this.removeListener("zonesRemoved", checkRemoved);
          setTimeout(() => resolve(), 100);
        }
      };

      this.on("zonesChanged", checkZoneUpdate);
      this.on("zonesAdded", checkZoneUpdate);
      this.on("zonesRemoved", checkRemoved);
    });
  }

  // Group two outputs together
  groupOutputs(outputId1, outputId2) {
    return new Promise(async (resolve, reject) => {
      if (!this.transport) {
        reject(new Error("Transport not available"));
        return;
      }

      const output1 = this.findOutputById(outputId1);
      const output2 = this.findOutputById(outputId2);

      if (!output1 || !output2) {
        reject(new Error("Output not found"));
        return;
      }

      // Check if already in the same zone
      const zone1 = this.findZoneByOutputId(outputId1);
      const zone2 = this.findZoneByOutputId(outputId2);

      if (zone1 && zone2 && zone1.zone_id === zone2.zone_id) {
        this.log(
          `${output1.display_name} and ${output2.display_name} are already grouped`,
        );
        resolve();
        return;
      }

      // Check compatibility
      if (!output1.can_group_with_output_ids?.includes(outputId2)) {
        reject(new Error("Outputs cannot be grouped together"));
        return;
      }

      this.log(`Grouping ${output1.display_name} with ${output2.display_name}`);

      // Output1 (device being acted upon) becomes primary (its queue is preserved)
      this.transport.group_outputs([output1, output2], async (err) => {
        if (err) {
          this.log(`Failed to group outputs: ${err}`);
          reject(new Error(err));
        } else {
          this.log(`Successfully grouped outputs`);
          // Wait for zone update to complete
          await this.waitForZoneUpdate(output1.output_id);
          resolve();
        }
      });
    });
  }

  // Remove output from its group
  ungroupOutput(outputId) {
    return new Promise(async (resolve, reject) => {
      if (!this.transport) {
        reject(new Error("Transport not available"));
        return;
      }

      const output = this.findOutputById(outputId);
      if (!output) {
        reject(new Error("Output not found"));
        return;
      }

      const zone = this.findZoneByOutputId(outputId);
      if (!zone || zone.outputs.length <= 1) {
        // Not grouped - resolve successfully
        this.log(`${output.display_name} is not grouped`);
        resolve({ wasGrouped: false });
        return;
      }

      this.log(`Ungrouping ${output.display_name}`);

      this.transport.ungroup_outputs([output], async (err) => {
        if (err) {
          this.log(`Failed to ungroup: ${err}`);
          reject(new Error(err));
        } else {
          this.log(`Successfully ungrouped ${output.display_name}`);
          // Wait for zone update to complete
          await this.waitForZoneUpdate(output.output_id);
          resolve({ wasGrouped: true });
        }
      });
    });
  }

  // Transfer playback from one zone/output to another
  transferPlayback(fromId, toId) {
    return new Promise((resolve, reject) => {
      if (!this.transport) {
        reject(new Error("Transport not available"));
        return;
      }

      this.log(`Transferring playback from ${fromId} to ${toId}`);

      this.transport.transfer_zone(fromId, toId, (err) => {
        if (err) {
          this.log(`Failed to transfer: ${err}`);
          reject(new Error(err));
        } else {
          this.log(`Successfully transferred playback`);
          resolve();
        }
      });
    });
  }
}

module.exports = ZoneManager;
