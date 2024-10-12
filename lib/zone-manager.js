"use strict";

const EventEmitter = require("events");

class ZoneManager extends EventEmitter {
  constructor() {
    super();
    this.transport = null;
    this.imageDriver = null;
  }

  updateTransport(transport) {
    this.transport = transport;
  }

  updateImageDriver(imageDriver) {
    this.imageDriver = imageDriver;
  }

  getTransport() {
    return this.transport;
  }

  getImageDriver() {
    return this.imageDriver;
  }

  // getZones() {
  //   if (this.transport) {
  //     return this.transport.get_zones();
  //   }
  //   return null;
  // }

  updateZones(response, msg) {
    //console.log(JSON.stringify(msg, null, 2));

    if (response === "Subscribed" && msg && msg.zones) {
      console.log(`all zones: ${msg.zones.length}`);
      this.zones = {};
      this.emit("zonesUpdated", msg.zones);
      for (let zone of msg.zones) {
        this.zones[zone.zone_id] = zone;
      }
    } else if (response === "Changed") {
      if (msg && msg.zones_changed) {
        console.log(`zones changed: ${msg.zones_changed.length}`);
        this.emit("zonesChanged", msg.zones_changed);
        for (let zone of msg.zones_changed) {
          this.zones[zone.zone_id] = zone;
        }
      }

      if (msg && msg.zones_removed) {
        console.log(`zones removed: ${msg.zones_removed.length}`);
        this.emit("zonesRemoved", msg.zones_removed);
        for (let zoneId of msg.zones_removed) {
          delete this.zones[zoneId];
        }
      }

      if (msg && msg.zones_added) {
        console.log(`zones added: ${msg.zones_added.length}`);
        this.emit("zonesAdded", msg.zones_added);
        for (let zone of msg.zones_added) {
          this.zones[zone.zone_id] = zone;
        }
      }

      if (msg && msg.zones_seek_changed) {
        this.emit("zonesSeekChanged", msg.zones_seek_changed);
      }
    } else if (response === "Unsubscribed") {
      console.log("Unsubscribed from zones");
      delete this.zones;
    }
  }
}

module.exports = new ZoneManager();
