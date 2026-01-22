# Nimble Action Tracker

A simple encounter and action tracker for the Nimble v2 system in Foundry VTT.

## Features

- **Separate GM Tracker and Player Tracker**: The GM gets all the knobs, while players see a streamlined view focused on what they need to know. No clutter, no confusion.

- **Smart Initiative**: The GM can ping players to roll initiative, and it automatically hooks into the Dice So Nice! module for those beautiful dice animations. (Highly Recommended!)

- **Manual Initiative**: If your players don't like to roll digitally, no problem! Nothing quite beats the tactile feel of those physical dice. Players can manually enter in their roll!

- **Standard or Alternative**: The tracker can switch between the Core Rules Initiative rolling and the Alternative Initiative, whichever your table prefers! 

- **No more "Where is that guy?"**: In the GM tracker, hover over any card and it highlights their token on the map. Just as if you hovered your mouse right over them. Super handy for big messy brawls where tokens are everywhere. Plus, there are nice pings letting all players know what tokens have a turn this upcoming round. (I recommend setting showing health and names on tokens on hover) 

- **One-click Status**: Added "Turn" and "Death" toggles that use Foundry's dynamic rings to automatically change colors based on friend, foe, or NPC (Green/Red/Blue). The death toggle does a nice little fade-out effect with a skull overlay. Clean and clear visual feedback!

- **Keeps Your Secrets**: The tracker automatically skips hidden or dead tokens, so you don't accidentally spoil any 'hidden' creature(s) or ruin an ambush. Perfect for keeping the trap a surprise until the very last second. 😉

- **Fun Pips**: There's a "Refill Pips" button for an easy "end turn" that fills empty pips up with standard actions. Also:
  - **Shift+Click** adds an Inspired Pip
  - **Ctrl+Click** adds a Bane Pip
  - Every pip is *synced* live, so the GM can help manage pips if a player is getting overwhelmed, or the players can manage them and the GM can be fully aware of what they have.

- **Clean Reset**: A "Next Round" button resets the ring colors to a "turn available" state and gives them a ping so you know where they are. An easy "End Combat" wipes everything back to default ring colors in one click, to let your players know the encounter is over (and hopefully won!). 

- **Two Initiative Modes**:
  - **Standard** (default): Traditional Nimble core rules without readiness mechanics.
  - **Alternative**: Uses readiness statuses and zipper initiative (like legendary monster fights) for a more chess like experience. Check out the "Alternative Initiative" rules in over on the Nimble RPG discord!

- **Easy Access**: Pop open the tracker from the dice icon in the token controls toolbar.

## Installation

### Method 1: Via Manifest URL (Recommended)
1. Open Foundry VTT
2. Go to "Add-on Modules" and click "Install Module"
3. Paste this URL in the "Manifest URL" field:
   ```
   https://github.com/tristin-albers/nimble-action-tracker/releases/latest/download/module.json
   ```
4. Click "Install"

### Method 2: Via Foundry Package Manager (After Approval)
1. Open Foundry VTT
2. Go to "Add-on Modules" and click "Install Module"
3. Search for "Nimble Action Tracker"
4. Click "Install"

## Compatibility

- **Foundry VTT**: Version 13+
- **Game System**: Nimble v2 (required)

## Usage

1. Enable the module in your world's module settings
2. Open the tracker using the dice icon button in the token controls toolbar
3. Configure your preferred initiative type in module settings

## Settings

- **Initiative Type**: Choose between Standard (default) or Alternative (with readiness)
- **Dice So Nice! Integration**: Automatically detected (read-only setting shows status)

## License

This module is licensed under the MIT License. See the LICENSE file for details.

## Support & Issues

Found a bug or have a feature request? Please report it on our [GitHub Issues](https://github.com/tristin-albers/nimble-action-tracker/issues) page.

## Changelog

See the [Releases](https://github.com/tristin-albers/nimble-action-tracker/releases) page for version history and changes.
