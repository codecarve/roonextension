# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.12] - 2025-08-02

### Added

- Speaker repeat capability
- Support for three repeat modes: Off, Repeat Track, and Repeat Playlist
- Icon for speaker_repeat capability
- Enhanced logging for Roon API browse operations for better debugging

### Changed

- Refactored autocomplete handling for artist radio, internet radio, playlist, and genre flow actions
- Introduced helper method `_genericBrowseAutocomplete` to reduce code duplication across all browse-based autocomplete listeners
- Improved error handling in autocomplete functions with consistent error responses
- Flow action titles now use simplified format without [[device]] placeholder for better readability
- Removed randomization of browse results to ensure consistent item ordering

### Fixed

- Corrected flow action title formatting to prevent device name duplication in UI
- Enhanced null checks and error handling for Roon service availability in autocomplete functions
- Improved robustness of browse operations with proper core and browse service validation

### Technical Details

- Removed direct `RoonApiBrowse` import from device.js, now using app-level browse instance
- Added comprehensive logging to browser-util.js for API call debugging
- Consolidated autocomplete logic for artists, playlists, internet radio, and genres into a single reusable method
- All autocomplete functions now return empty arrays on error instead of undefined

## [1.1.11] - 2025-07-27

### Added

- Full Homey speaker device class integration with standard speaker capabilities
- Standard media control capabilities: `speaker_playing`, `speaker_next`, `speaker_prev`, `speaker_shuffle`, `speaker_repeat`, `speaker_position`
- Standard volume control capabilities: `volume_up`, `volume_down`, `volume_mute`
- Direct volume setting capability: `volume_set` (outputs only)
- Volume soft limit control capability: `volume_soft_limit` (outputs only)
- Queue information capabilities: `speaker_queue_items_remaining` and `speaker_queue_time_remaining` (both device types)
- Multilingual support: Added Spanish, French, and German translations (5 languages total)
- New "Turn Off All Outputs" flow action that puts all audio outputs into standby mode one by one
- This action processes outputs sequentially with a small delay between each to avoid overwhelming the system

### Fixed

- Fixed issue where Roon Radio, shuffle, and repeat actions on outputs would affect the wrong zone
- Output devices now correctly use zone_id instead of output_id for `change_settings` API calls

### Enhanced

- Roon devices now integrate seamlessly with Homey's speaker ecosystem
- "Turn off all speakers" zone commands now include Roon devices
- Google Assistant and Alexa voice commands recognize Roon devices as speakers
- Standard Homey media controls work with Roon devices
- Flow cards for "all speakers" automatically include Roon devices
- Full internationalization with translations for app name, tagline, device names, and all UI elements

### Fixed

- Fixed issue where output action cards were controlling the wrong outputs due to flow actions being registered at device level instead of driver level
- Added transport availability checks to prevent execution on missing transport objects in flow actions
- Prevented driver crashes when transport object is unavailable
- Moved all flow action registrations from device.js to driver.js for both roon-output and roon-zone drivers
- Flow actions now properly use args.device parameter to target the correct device instance

### Removed

- Removed `convenience_switch` capability and associated flow action from roon-output devices

### Technical Details

- Updated `.homeycompose/app.json` to include all standard speaker capabilities
- Enhanced capability listeners in both roon-output and roon-zone device implementations
- Added `onCapabilityVolumeSoftLimit` method for volume limit control
- All devices maintain backward compatibility - existing devices gain new capabilities automatically
- Added null checks for transport object in flow action handlers
- Added locale files for de.json, es.json, and fr.json

### Benefits for Users

- Voice assistant integration works naturally with Roon speakers
- Enhanced flow automation possibilities with standard speaker capabilities
- Improved stability when Roon Core connection is lost
- Native language support for German, Spanish, and French speakers

## [1.1.10] - 2025-07-18

### Added

- Flow condition "Core is connected/disconnected" - Monitor Roon Core connection status in real-time flows
- Added Dutch translations for queue and volume capabilities
- Enhanced capability consistency with proper bilingual support (English/Dutch)

### Technical Details

- Added `registerFlowConditions()` method in app.js to handle core connection status conditions
- Added flow condition `core_is_paired` with multilingual support for connection monitoring
- Updated capability definitions to include Dutch translations:
  - `speaker_queue_items_remaining`: "Queue items resterend"
  - `speaker_queue_time_remaining`: "Queue tijd resterend"
  - `volume_soft_limit`: "Volume soft limiet"
- Flow condition returns boolean based on `this.core !== null` status
- Enables automation flows that depend on Roon Core availability

## [1.1.9] - 2025-07-14

### Added

- Play Queue flow action - Resume playback from the current queue position
- Supports both zone and output devices as targets
- Intelligent queue handling with fallback to simple play command for empty queues
- Timeout protection (10s for queue subscription, 5s for playback command)
- Comprehensive error handling and resource cleanup

### Technical Details

- Added `playQueue()` method in app.js with robust queue subscription handling
- Uses `transport.subscribe_queue()` to get current queue state and `play_from_here()` for precise playback control
- Automatic unsubscribe cleanup to prevent memory leaks
- Fallback to `transport.control(zoneId, "play")` when queue is empty or malformed
- Added play_queue flow action definition in .homeycompose/app.json with multilingual support (English/Dutch)

## [1.1.5] - 2025-07-13

### Added

- Global audio controls for emergency scenarios and bedtime routines
- `mute_all()` flow action - Mutes all zones at once for emergency silence
- `pause_all()` flow action - Pauses all zones simultaneously for bedtime routines
- Both actions handle multiple zones concurrently and provide graceful error handling when no zones are active

### Technical Details

- Added `registerFlowActions()` method in app.js to handle global flow actions
- Added `muteAllZones()` method that iterates through all zones and mutes non-muted outputs
- Added `pauseAllZones()` method that pauses all currently playing zones
- Both methods use Promise.all() for concurrent execution and proper error handling
- Added appropriate flow action definitions in .homeycompose/app.json with multilingual support

## [1.1.4] - 2025-07-13

### Fixed

- Fixed issue where flow actions would target wrong output when multiple outputs are in the same Roon zone
- Playlist flow actions now correctly target the intended output device instead of starting on a random output in the zone
- Artist radio flow actions now correctly target the intended output device
- Internet radio flow actions now correctly target the intended output device
- Genre shuffle flow actions now correctly target the intended output device

### Technical Details

- Changed `zone_or_output_id` parameter from `this.zone.zone_id` to `this.getData().id` in output device flow actions
- This ensures actions target the specific output device that triggered the flow, not the entire zone

## [1.1.3] - Previous Release

### Added

- Playlist and genre support in flow actions
- Improved device pairing and zone management

### Changed

- Enhanced zone management capabilities
- Updated dependencies

### Fixed

- Various stability improvements
