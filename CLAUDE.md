                                                      # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Formatting:**

```bash
npx prettier --write .
```

**Build/Validation:**

- This is a Homey app - no traditional build process needed
- App validation is done through Homey CLI or Homey Developer Portal
- The `app.json` file is generated from `.homeycompose/app.json` - always edit the compose file, not the generated one
- You can fully ignore the app.json that is in the root folder of the project (since it is generated from .homeycompose/app.json)
- Make sure all translations are there, for all languages
- When there are new capabilities don't forget to update the CLAUDE.md document since the capabilities are listed below
- Always check all icons mentioned in the files in /.homeycompose/capabilities/\*.json actually exist in the /assets folder which lives in the root folder and if the icons are not there create the icons that are missing

## Project Architecture

This is a **Homey smart home app** that integrates with **Roon** music streaming platform. It's built using:

- **Homey SDK v3** for smart home platform integration
- **Roon API** libraries for music control functionality

### Core Components

**Main App (`app.js`):**

- `RoonApp` class extends `Homey.App`
- Manages Roon API connection and core pairing/unpairing
- Sets up zone subscriptions and transport services
- Handles flow triggers for core connection events

**Zone Management (`lib/zone-manager.js`):**

- Central singleton managing all Roon zones and outputs
- EventEmitter for zone state changes (added, removed, changed, seek)
- Bridges between Roon API transport and Homey device drivers
- Maintains zones cache and provides transport/image driver access

**Driver Architecture:**

- **roon-output**: Individual speakers/audio devices with volume/mute control
- **roon-zone**: Groups of speakers for playback control (zones with >1 output only)
- All drivers use `zoneManager` for Roon API access during device pairing
- Flow actions are registered at driver level (not device level) to ensure proper device targeting

### Key Differences Between Outputs and Zones

- **Outputs**: Individual devices, direct volume/mute control, wake/sleep functionality
- **Zones**: Groups of outputs, playback control only, incremental volume changes, filtered to show only multi-output zones during pairing

### State Management

- App uses Homey settings for Roon state persistence
- Zone manager maintains real-time zone cache from Roon subscriptions
- Device drivers access shared transport/image services through zone manager

### Dependencies

All Roon integration uses official Roon Labs packages:

- `node-roon-api`: Core API
- `node-roon-api-transport`: Playback control
- `node-roon-api-image`: Album art/images
- `node-roon-api-browse`: Browsing/search
- `node-roon-api-status`: Extension status

### Current Capabilities

The app implements these capabilities for full Homey speaker integration:

**Standard Speaker Capabilities (both outputs and zones):**

- `speaker_playing`: Play/pause control and state
- `speaker_next`: Skip to next track
- `speaker_prev`: Skip to previous track
- `speaker_shuffle`: Toggle shuffle mode
- `speaker_repeat`: Toggle repeat mode
- `speaker_position`: Track position/seek control
- `speaker_track`: Current track name (read-only)
- `speaker_artist`: Current artist name (read-only)
- `speaker_album`: Current album name (read-only)
- `speaker_duration`: Track duration in seconds (read-only)
- `volume_up`: Increase volume
- `volume_down`: Decrease volume
- `volume_mute`: Mute/unmute control

**Queue Information:**

- `speaker_queue_items_remaining`: Shows remaining items in queue
- `speaker_queue_time_remaining`: Shows remaining time in queue

**Custom Capabilities:**

- `speaker_auto_radio`: Auto radio control for both outputs and zones
- `speaker_wake_up`: Wake up functionality for outputs only
- `speaker_sleep`: Sleep functionality for outputs only

**Volume Control (outputs only):**

- `volume_set`: Direct volume setting
- `volume_soft_limit`: Volume soft limit control

### Important Files

- `.homeycompose/app.json`: Source manifest (edit this, not `app.json`)
- `drivers/*/device.js`: Device-specific capability implementations
- `drivers/*/driver.js`: Driver-level flow action registrations
- `lib/browser-util.js`: Roon browsing utilities for autocomplete
- `lib/image-util.js`: Image handling utilities

### Flow Actions

**Global Flow Actions (registered at app level):**

- `mute_all`: Mutes all audio outputs across all zones
- `pause_all`: Pauses all currently playing zones
- `sleep_all`: Turns off all outputs one by one (puts into standby mode)
- `play_queue`: Resumes playback from current queue position (device-specific)

**Output Device Flow Actions:**

- `speaker_sleep`: Put individual output to sleep
- `speaker_wake_up`: Wake up individual output
- `speaker_auto_radio_output`: Enable/disable Roon Radio for output
- `artist_radio_output`: Play artist radio on output (with autocomplete)
- `internet_radio_output`: Play internet radio station on output (with autocomplete)
- `playlist_output`: Play playlist on output (with autocomplete)
- `genre_shuffle_output`: Shuffle genre on output (with autocomplete)

**Zone Device Flow Actions:**

- `speaker_auto_radio_zone`: Enable/disable Roon Radio for entire zone

### Flow Triggers

- `core_paired`: Fired when Roon Core is paired (with tokens: name, ip, port)
- `core_unpaired`: Fired when Roon Core is unpaired (with tokens: name, ip, port)

### Flow Conditions

- `core_is_paired`: Check if Roon Core is currently connected

### Api documentation

Always use the following documentation

- Homey developer documentation: https://apps-sdk-v3.developer.homey.app/
- Node-roon api documentation: https://roonlabs.github.io/node-roon-api/

## Development Workflow Requirements

Ignore the app.json file that is in the root folder. This file is autogenerated when installing the app to homey, or during release to the Homey App store.

**MANDATORY: For any code changes, ALWAYS update these files:**

1. **Version Updates**:
   - Update version number in `.homeycompose/app.json`
   - Update display_version in `app.js` with the same version number
   - Update version number in `package.json`
2. **Test Plan**: Update `TEST_PLAN.md` with:
   - New test cases for added functionality
   - Regression tests for bug fixes
   - Update version number in title
3. **Change Log**: Update `CHANGELOG.md` with:
   - Clear description of changes (Added/Changed/Fixed/Removed)
   - Version number and date
   - Technical details when relevant
   - Breaking changes if any
4. **Homey Changelog**: Update `.homeychangelog.json` with:
   - User-friendly description in both English and Dutch
   - Concise bullet points for end users
   - Use emojis and clear formatting for the Homey app display
   - Focus on what users can actually do with the new features
   - Keep descriptions short and impactful

**Example workflow for any change:**

1. Make code changes
2. Bump version in `.homeycompose/app.json`
3. Update display_version in `app.js` with same version
4. Update version in `package.json`
5. Add test cases to `TEST_PLAN.md`
6. Document changes in `CHANGELOG.md`
7. **IMPORTANT**: Update `.homeychangelog.json` with user-friendly descriptions in both EN and NL
8. Test changes thoroughly

This ensures proper versioning, testing coverage, and change tracking for the project.

## Coding Guidelines

- Always use descriptive variable names
