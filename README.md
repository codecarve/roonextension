# Roon for Homey

Control [Roon](https://roonlabs.com/) directly from your Athom Homey. Manage Roon zones, outputs, and playback, while integrating Roon’s functionality into your Homey flows.

## Functionality

This app pairs with the Roon Core and allows you to control Roon from Homey devices. The app interacts with both **Zones** and **Outputs** in Roon, providing flexible control depending on your use case.

- **Outputs** represent individual speakers or audio devices. You can control their volume and mute them directly.
- **Zones** represent a group of one or more outputs, allowing for group playback control. Zones manage playback (play, pause, next, previous), while volume changes at the zone level are incremental (+/- 1) and cannot be set to an absolute value.
- The app allows you to:
  - Trigger flows when a Roon Zone or Output is changed (e.g., when a new song starts playing).
  - View the title and cover art of the currently playing song.
  - Control playback: pause, play, previous, next, and seek within tracks.

## Usage

To use this app:

1. Install the app on your Homey device.
2. From inside Roon, go to Settings > Extensions and allow Homey to manage Roon.
3. Add a new device for a Roon Output (speaker).
4. And/or add a new Zone (group of one or more speakers).
5. Control these devices directly or integrate them into your Homey flows for automation.

### Drivers and Devices

- **Outputs**: These are individual audio devices or speakers connected to Roon. You can control their volume and mute status through Homey.
- **Zones**: These represent groups of one or more outputs in Roon. They control the playback and queue for the grouped speakers. Volume changes at the zone level are incremental and affect all grouped outputs.

Zones can be grouped or ungrouped from Roon. In this case you need to create a new device for the Zone in Homey, and manually remove the old Zone from Homey.

## Additional Information

- This app is built on [Homey SDK v3](https://apps-sdk-v3.developer.homey.app) by Athom B.V. and the [Roon API](https://github.com/RoonLabs/node-roon-api) by Roon Labs.
- If you have any feature requests or issues, feel free to submit them in the app's [GitHub repository](https://github.com/codecarve/roonextension).
- This software is built by enthusiasts and is provided "as is," with no warranty or liability. By using this app, Homey, or Roon, you accept that you are solely responsible for any potential damage to your equipment (e.g., setting the volume too high).
- Code contributions are welcome. Feel free to send pull requests on GitHub!

## Roadmap

- Create a settings page allowing users to configure the Roon Core IP address and port.
- Add support for multiple Roon cores.
- Implement dynamic zones that automatically update device status in Homey based on changes in Roon.
- Support for grouping and ungrouping zones directly from Homey.

## Version History

### 1.1.3

- Improved: Play Artist Radio flow action with better error handling
- Refactored: Artist browsing logic to use new browser utilities
- Enhanced: Capability listener registration for better maintainability
- Fixed: Code style inconsistencies across driver files
- Improved: Async/await error handling in device implementations

### 1.1.2

- New: play playlists and genres functionality in action cards

### 1.1.1

- New: incorporated latest driver from Roon Labs containing several fixes for stability and maintenance

### 1.1.0

- New: Flow triggers when Roon Core paired or unpaired
- New: Play Artist functionality in action card
- New: Internet Radio functionality in action card
- New: Auto radio capability
- Change: Convenience switch capability renamed to speaker_wake and speaker_sleep
- Added: Reconnection logic for transport driver
- Fix: Cannot read properties of undefined (reading 'ping') causing driver to crash

### 1.0.8

- Added: convenience switch capability
- Added: auto radio capability
- Update: several icons are updated
- Update: community forum topic id

### 1.0.7

- Code refactor for handling images
- Fix for crash when retrying to re-connect to Roon
- Update app Icon for zones
- Update: only show zones with multiple outputs when pairing

### 1.0.6

- Fix label Queue items remaining
- Various bug fixes and refactoring

### 1.0.5

- Fix app store id

### 1.0.4

- Updated manifest and readme
- Improved pairing experience
- Refactored driver for core into library

### 1.0.3

- Add support for Homey SDK v3.
- Reworked app architecture to be more resilient and prevent crashes.

### 0.2.1

- Fixed GitHub link.
- Incorporated bug fixes from `node-roon-api` and `node-roon-api-transport`.

### 0.2.0

- Improved app store image.
- Added settings support.
- Implemented playback controls (previous, next, pause, play).
- Improved device state handling to better reflect output states in Homey.

### 0.1.0

- Initial version with basic Roon integration.
