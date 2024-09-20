'use strict';

const Homey = require('homey');

class RoonApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('RoonApp has been initialized');
  }

}

module.exports = RoonApp;
