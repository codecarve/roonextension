"use strict";

const Homey = require("homey");

const browserUtil = require("../../lib/browser-util");

class RoonOutputDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("RoonOutputDriver has been initialized");

    // Set up browser util logger
    browserUtil.setLogger(this.log.bind(this));

    // Register flow actions for sleep and wake up
    const speakerSleepActionCard =
      this.homey.flow.getActionCard("speaker_sleep");
    speakerSleepActionCard.registerRunListener(async (args, state) => {
      return args.device.onCapabilitySpeakerSleep(true, null);
    });

    const speakerWakeUpActionCard =
      this.homey.flow.getActionCard("speaker_wake_up");
    speakerWakeUpActionCard.registerRunListener(async (args, state) => {
      return args.device.onCapabilitySpeakerWakeUp(true, null);
    });

    // Register flow action for auto radio
    const autoRadioAction = this.homey.flow.getActionCard(
      "speaker_auto_radio_output",
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

    // Register flow action for artist radio
    const artistRadioOutputActionCard = this.homey.flow.getActionCard(
      "artist_radio_output",
    );
    artistRadioOutputActionCard.registerArgumentAutocompleteListener(
      "artist",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerArtistRadio(
          query,
          args,
        );
      },
    );
    artistRadioOutputActionCard.registerRunListener(async (args, state) => {
      return args.device.onRunListenerArtistRadioOutputActionCard(args, state);
    });

    // Register flow action for internet radio
    const internetRadioOutputActionCard = this.homey.flow.getActionCard(
      "internet_radio_output",
    );
    internetRadioOutputActionCard.registerArgumentAutocompleteListener(
      "internet_radio",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerInternetRadio(
          query,
          args,
        );
      },
    );
    internetRadioOutputActionCard.registerRunListener(async (args, state) => {
      return args.device.onRunListenerInternetRadioOutputActionCard(
        args,
        state,
      );
    });

    // Register flow action for playlist
    const playlistOutputActionCard =
      this.homey.flow.getActionCard("playlist_output");
    playlistOutputActionCard.registerArgumentAutocompleteListener(
      "playlist",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerPlaylist(
          query,
          args,
        );
      },
    );
    playlistOutputActionCard.registerRunListener(async (args, state) => {
      return args.device.onRunListenerPlaylistOutputActionCard(args, state);
    });

    // Register flow action for genre shuffle
    const genreOutputActionCard = this.homey.flow.getActionCard(
      "genre_shuffle_output",
    );
    genreOutputActionCard.registerArgumentAutocompleteListener(
      "genre",
      async (query, args) => {
        return args.device.onRegisterArgumentAutocompleteListenerGenre(
          query,
          args,
        );
      },
    );
    genreOutputActionCard.registerRunListener(async (args, state) => {
      return args.device.onRunListenerGenreOutputActionCard(args, state);
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
      transport.get_outputs((success, body) => {
        if (
          !body ||
          !Array.isArray(body.outputs) ||
          body.outputs.length === 0
        ) {
          reject(new Error("No outputs found."));
        }

        const devices = body.outputs.map((output) => {
          if (!output.display_name || !output.output_id) {
            throw new Error("Invalid output data.");
          }
          return {
            name: output.display_name,
            data: {
              id: output.output_id,
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

module.exports = RoonOutputDriver;
