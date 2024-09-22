"use strict";

const EventEmitter = require("events");

class ZoneManager extends EventEmitter {
  constructor() {
    super();
    this.transport = null;
    this.imageDriver = null;
    this.zones = {};
  }

  getZones() {
    return Object.values(this.zones);
  }

  updateTransport(transport) {
    this.transport = transport;
  }

  updateImageDriver(imageDriver) {
    this.imageDriver = imageDriver;
  }

  updateZones(data) {
    console.log(JSON.stringify(data, null, 2));

    if (data && data.zones) {
      console.log(`all zones: ${data.zones.length}`);
      this.emit("zonesUpdated", data.zones);
      for (let zone of data.zones) {
        this.zones[zone.zone_id] = zone;
      }
    }

    if (data && data.zones_changed) {
      console.log(`zones changed: ${data.zones_changed.length}`);
      this.emit("zonesChanged", data.zones_changed);
      for (let zone of data.zones_changed) {
        this.zones[zone.zone_id] = zone;
      }
    }

    if (data && data.zones_removed) {
      console.log(`zones removed: ${data.zones_removed.length}`);
      this.emit("zonesRemoved", data.zones_removed);
      for (let zoneId of data.zones_removed) {
        delete this.zones[zoneId];
      }
    }

    if (data && data.zones_added) {
      console.log(`zones added: ${data.zones_added.length}`);
      this.emit("zonesAdded", data.zones_added);
      for (let zone of data.zones_added) {
        this.zones[zone.zone_id] = zone;
      }
    }

    if (data && data.zones_seek_changed) {
      this.emit("zonesSeekChanged", data.zones_seek_changed);
    }
  }
}

module.exports = new ZoneManager();
