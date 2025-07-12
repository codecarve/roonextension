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
- Both drivers use `zoneManager` for Roon API access during device pairing

### Flow System

**Triggers:**
- `core_paired`: Fired when Roon Core connects
- `core_unpaired`: Fired when Roon Core disconnects

**Actions:** Extensive flow actions for playback control:
- Sleep/wake outputs, auto radio toggle
- Play artist/playlist/genre/internet radio
- Zone-level auto radio control

### Capabilities Architecture

**Custom Capabilities:** Defined in `.homeycompose/app.json`:
- `speaker_auto_radio`: Roon radio toggle
- `speaker_queue_items_remaining`/`speaker_queue_time_remaining`: Queue info
- `speaker_sleep`/`speaker_wake_up`: Output power control
- `volume_soft_limit`: Volume limit display

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

### Important Files

- `.homeycompose/app.json`: Source manifest (edit this, not `app.json`)
- `drivers/*/device.js`: Device-specific capability implementations
- `lib/browser-util.js`: Roon browsing utilities for autocomplete
- `lib/image-util.js`: Image handling utilities


### Api documentation
Always use the following documentation

- https://apps-sdk-v3.developer.homey.app/
- 