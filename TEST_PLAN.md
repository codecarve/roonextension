# Test Plan - Homey Roon App v1.1.11

## Prerequisites

- Roon Core running and accessible on network
- Homey hub with app installed
- At least one Roon audio output/zone configured
- Test music library with artists, playlists, genres, and internet radio stations

## 1. Core Connection Tests

### 1.1 Initial Pairing and stability

- [ ] Install app on Homey
- [ ] Verify Roon Core discovery and pairing process
- [ ] Check "Roon core paired" flow trigger fires with correct tokens (name, IP, port)
- [ ] Restart Roon Core, verify reconnection
- [ ] Restart Homey, verify reconnection
- [ ] Network interruption test - disconnect/reconnect network
- [ ] Check "Roon core unpaired" flow trigger fires during disconnection

### 1.2 Roon Core Device (v1.1.10)

- [ ] Add Roon Core device to Homey
- [ ] Verify single instance limitation - attempting to add second core device shows error
- [ ] Verify device displays core name, IP address, and port when connected
- [ ] Verify device shows disconnected state when core is unpaired
- [ ] Test automatic status updates on core connect/disconnect
- [ ] Verify capability values persist after app restart

## 2. Device Discovery & Pairing

### 2.1 Output Devices (Individual Speakers)

- [ ] Pair individual Roon outputs as Homey devices
- [ ] Verify device names match Roon output names
- [ ] Test with multiple different output types (USB, network, etc.)

### 2.2 Zone Devices (Multi-Output Groups)

- [ ] Create multi-output zone in Roon
- [ ] Verify zone appears in Homey device pairing
- [ ] Verify single outputs are filtered out from zone pairing
- [ ] Test zone with 2+ outputs

## 3. Output Device Capabilities

### 3.1 Sleep/Wake Controls

- [ ] Test "speaker_sleep" capability - output goes to standby
- [ ] Test "speaker_wake_up" capability - output becomes active
- [ ] Verify status updates in Homey interface

### 3.2 Auto Radio

- [ ] Test "speaker_auto_radio" toggle on/off
- [ ] Verify Roon Radio state changes in Roon interface
- [ ] Test with music playing and stopped

### 3.4 Standard Speaker Capabilities (v1.1.11)

- [ ] Test "speaker_playing" - verify play/pause state synchronization
- [ ] Test "speaker_next" - skip to next track in queue
- [ ] Test "speaker_prev" - skip to previous track
- [ ] Test "speaker_shuffle" - toggle shuffle mode on/off
- [ ] Test "speaker_repeat" - cycle through repeat modes (off/all/one)
- [ ] Test "speaker_position" - seek to different track positions
- [ ] Test "volume_up" - incremental volume increase
- [ ] Test "volume_down" - incremental volume decrease
- [ ] Test "volume_mute" - mute/unmute toggle
- [ ] Test "volume_set" - direct volume setting (outputs only)

### 3.5 Volume & Queue Info (Read-only)

- [ ] Verify "speaker_queue_items_remaining" displays correctly
- [ ] Verify "speaker_queue_time_remaining" shows accurate time
- [ ] Test "volume_soft_limit" displays and controls soft limit (outputs only)

## 4. Flow Actions - Output Devices

### 4.1 Sleep/Wake Actions

- [ ] Create flow with "Sleep" action - verify output sleeps
- [ ] Create flow with "Wake up" action - verify output wakes

### 4.2 Roon Radio Control

- [ ] Create flow with "Roon Radio" enabled checkbox
- [ ] Test enabling/disabling via flow
- [ ] Verify state changes in both Homey and Roon
- [ ] **Bug fix verification**: Test with multiple outputs in same zone - verify only the selected output's zone is affected
- [ ] **Bug fix verification**: Verify shuffle and repeat settings also target the correct zone

### 4.3 Music Playback Actions

#### Artist Radio

- [ ] Create flow with "Play Artist" action
- [ ] Test autocomplete for artist search
- [ ] Verify artist radio starts playing on correct output device
- [ ] Test with various artist names (with/without special characters)
- [ ] **Regression test**: With multiple outputs in same zone, verify artist radio plays on intended output

#### Internet Radio

- [ ] Create flow with "Play Internet Radio" action
- [ ] Test autocomplete for radio station search
- [ ] Verify internet radio station starts playing on correct output device
- [ ] Test with multiple radio stations
- [ ] **Regression test**: With multiple outputs in same zone, verify internet radio plays on intended output

#### Playlist

- [ ] Create flow with "Play Playlist" action
- [ ] Test autocomplete for playlist search
- [ ] Verify playlist starts playing on correct output device
- [ ] Test with user-created and Roon playlists
- [ ] **Regression test**: With multiple outputs in same zone, verify playlist plays on intended output (not random output in zone)

#### Genre Shuffle

- [ ] Create flow with "Shuffle Genre" action
- [ ] Test autocomplete for genre search
- [ ] Verify genre shuffle starts playing on correct output device
- [ ] Test with various music genres
- [ ] **Regression test**: With multiple outputs in same zone, verify genre shuffle plays on intended output

## 5. Zone Device Capabilities

### 5.1 Auto Radio Control

- [ ] Test "speaker_auto_radio" on zone device
- [ ] Verify affects entire zone (all outputs)
- [ ] Test with zone containing multiple outputs

## 6. Flow Actions - Zone Devices

### 6.1 Roon Radio Control

- [ ] Create flow with zone "Roon Radio" action
- [ ] Verify checkbox enables/disables radio for entire zone
- [ ] Test state synchronization across zone outputs

## 7. Error Handling & Edge Cases

### 7.1 Network Issues

- [ ] Test behavior when Roon Core becomes unavailable
- [ ] Verify graceful error handling in flows
- [ ] Test reconnection after network restoration

### 7.2 Invalid Inputs

- [ ] Test flow actions with non-existent artist names
- [ ] Test with empty autocomplete selections
- [ ] Verify error messages are user-friendly

### 7.3 Concurrent Operations

- [ ] Test multiple flows executing simultaneously
- [ ] Test rapid on/off toggling of capabilities
- [ ] Verify no race conditions or conflicts

## 8. Performance Tests

### 8.1 Response Times

- [ ] Measure flow action execution time (<3 seconds)
- [ ] Test autocomplete response time (<1 second)
- [ ] Verify device status updates are timely

### 8.2 Resource Usage

- [ ] Monitor app memory usage over extended periods
- [ ] Test with large music libraries (>10k tracks)
- [ ] Verify no memory leaks during operation

## 9. Multi-Zone Scenarios

### 9.1 Zone Management

- [ ] Test with multiple zones playing different content
- [ ] Verify individual zone control doesn't affect others
- [ ] Test grouping/ungrouping zones in Roon

### 9.2 Output Switching

- [ ] Move outputs between zones in Roon
- [ ] Verify Homey device states update correctly
- [ ] Test device availability during zone changes

### 9.3 Multi-Output Zone Testing (v1.1.4 Regression)

- [ ] Create zone with 2+ outputs (e.g., "Speaker A" and "Speaker B")
- [ ] Add both outputs as individual Homey devices
- [ ] Test flow action targeting "Speaker A" - verify only "Speaker A" plays, not "Speaker B"
- [ ] Test all playback actions (artist, playlist, genre, internet radio) with multi-output zones
- [ ] Verify output-specific flow actions don't affect other outputs in same zone

## 10. Integration Tests

### 10.1 Complex Flows

- [ ] Create flow: "When motion detected → Wake output → Play artist"
- [ ] Create flow: "At sunset → Enable Roon Radio → Play genre"
- [ ] Create flow: "When leaving home → Sleep all outputs"

### 10.2 Roon Core Flow Conditions (v1.1.10)

- [ ] Create flow with condition "Core is connected" - verify flow runs only when connected
- [ ] Create flow with condition "Core isn't connected" - verify flow runs only when disconnected
- [ ] Create flow with condition "Core name is equal to [name]" - test with correct name
- [ ] Create flow with condition "Core name isn't equal to [name]" - test with wrong name
- [ ] Test condition evaluation during core connect/disconnect transitions
- [ ] Create complex flow: "If core is connected AND time is sunset, play music"

## 11. Global Audio Controls (v1.1.5 & v1.1.11)

### 11.1 Mute All Zones

- [ ] Create flow with "Mute All Zones" action
- [ ] Test with multiple zones playing different content
- [ ] Verify all audio outputs are muted simultaneously
- [ ] Test when some outputs are already muted - verify no errors
- [ ] Test when no zones are active - verify graceful handling
- [ ] Emergency silence scenario: verify rapid muting (<2 seconds)

### 11.2 Pause All Zones

- [ ] Create flow with "Pause All Zones" action
- [ ] Test with multiple zones playing different content
- [ ] Verify all playing zones pause simultaneously
- [ ] Test when some zones are already paused - verify no errors
- [ ] Test when no zones are playing - verify graceful handling
- [ ] Bedtime routine scenario: verify all music stops

### 11.3 Turn Off All Outputs (v1.1.11)

- [ ] Create flow with "Turn Off All Outputs" action
- [ ] Test with multiple outputs across different zones
- [ ] Verify all outputs go to standby one by one
- [ ] Monitor sequential processing with delays between outputs
- [ ] Test with outputs that don't support standby - verify graceful handling
- [ ] Verify appropriate logging shows success/error count
- [ ] Bedtime scenario: verify all connected devices turn off

### 11.4 Error Handling - Global Controls

- [ ] Test global actions when Roon Core is disconnected
- [ ] Verify appropriate error messages for connection issues
- [ ] Test concurrent global actions (rapid mute/pause/sleep sequences)
- [ ] Test turn off all when some outputs are already in standby

### 11.5 Integration with Existing Controls

- [ ] Test mute all → individual unmute per zone
- [ ] Test pause all → individual play per zone
- [ ] Test turn off all → individual wake up per output
- [ ] Verify global actions don't interfere with device-specific controls

## 12. Play Queue Action (v1.1.9)

### 12.1 Queue Playback Control

- [ ] Create flow with "Play Queue" action targeting zone device
- [ ] Create flow with "Play Queue" action targeting output device
- [ ] Test with queue containing multiple tracks
- [ ] Verify playback resumes from current queue position
- [ ] Test after playing different content (artist, playlist, etc.)

### 12.2 Queue State Scenarios

- [ ] Test with empty queue - verify fallback to simple play command
- [ ] Test with queue having single track
- [ ] Test with queue having 50+ tracks
- [ ] Test queue playback after Roon Radio was playing

### 12.3 Error Handling - Queue Actions

- [ ] Test queue action when Roon Core is disconnected
- [ ] Test queue action when target device is unavailable
- [ ] Verify timeout protection (action completes within 15 seconds)
- [ ] Test concurrent queue actions on different zones

### 12.4 Integration Scenarios

- [ ] Bedtime routine: Pause All → morning routine: Play Queue
- [ ] Smart flow: If queue empty, play artist radio; otherwise play queue
- [ ] Party mode: Play playlist → guests leave → resume queue

### 10.2 Voice Commands (if applicable)

- [ ] Test voice control integration with flows
- [ ] Verify natural language processing works

## 13. Homey Ecosystem Integration (v1.1.11)

### 13.1 Speaker Device Class Benefits

- [ ] Test "Turn off all speakers" zone command includes Roon devices
- [ ] Test "Turn on all speakers" zone command includes Roon devices
- [ ] Verify Roon devices appear in speaker-specific flow cards
- [ ] Test zone-based speaker grouping with mixed device types

### 13.2 Voice Assistant Integration

- [ ] Test Google Assistant "Turn off all speakers" command
- [ ] Test Alexa speaker control commands (if configured)
- [ ] Verify voice commands correctly identify Roon devices as speakers
- [ ] Test room-specific voice commands include Roon speakers

### 13.3 Standard Media Controls

- [ ] Verify Homey's built-in media control UI works with Roon devices
- [ ] Test media notifications display correctly for Roon playback
- [ ] Verify album art displays properly in Homey interface
- [ ] Test media control widgets recognize Roon devices

### 13.4 Flow Integration

- [ ] Test "All speakers" flow conditions include Roon devices
- [ ] Verify standard speaker flow actions work with Roon devices
- [ ] Test mixed-device flows (Roon + Sonos + other speakers)
- [ ] Verify flow logic cards recognize Roon speaker capabilities

## Pass/Fail Criteria

- ✅ All core functionality works without errors
- ✅ Flow triggers fire reliably with correct tokens
- ✅ All flow actions execute successfully
- ✅ Device states synchronize with Roon
- ✅ No crashes or memory leaks during testing
- ✅ Autocomplete functions return relevant results
- ✅ Error handling provides clear feedback
- ✅ Performance meets specified thresholds

## Test Environment Notes

- Document Roon Core version used
- Note Homey firmware version
- Record any specific hardware configurations
- Document network topology (WiFi/Ethernet)
