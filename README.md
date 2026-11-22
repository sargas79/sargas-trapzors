# Sargas Trapzors

Region-based traps for Foundry VTT v14. Draw a trigger area. When a token walks into it, the token stops at the edge and the GM chooses whether the trap fires. Damage is never applied automatically.

## Compatibility

- **Foundry VTT v14** (verified on 14.370).
- **Any game system:** flavor text, sound, and a damage roll with a save line.
- **Pathfinder 2e and Starfinder 2e** add save buttons, hazard actions and strikes, complex hazards, and trap detection.

## Installation

In Foundry's **Add-on Modules** screen choose **Install Module** and paste this manifest URL:

```
https://github.com/sargas79/sargas-trapzors/releases/latest/download/module.json
```

Then enable **Sargas Trapzors** in your world.

## Features

### Traps on the map
- **Create Trap** (Region layer): draw a region, or convert a selected one, into a GM-only trigger area.
- **GM prompt:** an eligible token is stopped just inside the edge, and the GM picks **Fire**, **Fire as test** (GM-only, changes nothing), **Ignore** or **Disable**. Tokens moved together share one prompt.
- **Effect area:** a separate line, cone or emanation decides who is affected. It sits at a fixed spot or follows the triggering token. It's shown briefly to everyone when the trap fires, and **Blocked by walls** clips it to walls on the token's level.
- **Who sets it off:** filter by token disposition and actor type, and choose whether hidden tokens or tokens moved by the GM trigger the trap.
- **Lifecycle:** single-use or reusable. A **re-arm timer** in game time can re-arm the trap, for example a haunt that reforms after a minute.

### Payloads
- **Flavor only:** text and an optional sound, posted to everyone.
- **Damage and save:** a damage formula and type, with a save, DC and basic-save option. In pf2e/sf2e the card has a save button, and players or the GM apply damage themselves.
- **Hazard action or strike** (pf2e/sf2e): link a hazard actor and one of its actions or strikes. A strike is rolled with no dialog against the affected or triggering tokens (up to 10). The GM rolls damage from the system's attack card.

### Hazards and haunts (pf2e/sf2e)
- **Compendium browser:** a tab in the Trap Manager. Search every hazard in your compendiums by kind (traps, haunts, environmental), level, complexity and pack, and create a trap from one in one click.
- **Configured from the hazard:** the trap takes the hazard's trigger reaction, its Stealth DC and minimum rank for detection, its re-arm time, and its disable checks.
- **Complex hazards:** when the trap fires, a hidden hazard token joins the scene's encounter and rolls Stealth initiative. On each of its turns the GM gets a private routine card with **Strike**, **Post**, **Disable checks** and **End hazard** buttons. You run the routine with the buttons and move the hazard yourself.

### Detection (pf2e/sf2e)
- **Detection area:** a GM-only area around the trap. Each character who enters it makes one blind Perception check against the trap's Stealth DC, with an optional Search requirement and minimum proficiency rank.
- **Results:** a success whispers the GM a **Reveal** button and the disable checks. **Reveal** shows the trigger area to players.
- **Glow when revealed** (optional): a JB2A glow plays over the trap when it's revealed.

### Theater of the mind
- **Fire at…:** fire any trap at chosen party members, player characters or targeted tokens, with no tokens on the map needed. A strike at a character with no token gives the GM its hit or miss against that character's AC.
- **Detection check…:** roll chosen characters' Perception against a trap.
- **All scenes:** the Trap Manager can list every scene's traps, so you can keep a "library" scene and fire its traps from anywhere.

### Animations (JB2A)
- **Presets:** 17 trap and haunt presets, such as darts, arrows, fire jets, explosions, poison gas, falling rocks, spikes and haunting spirits. Each is fitted to the effect line, cone or area. Tested with JB2A Patreon.
- **Custom files:** use any video or image file instead of a preset.
- **Who sees them:** a real fire plays for everyone; **Preview** and **Fire as test** play for the GM only.
- **[Sargas Visual Automation](https://github.com/sargas79/sargas-visual-automation)** (optional): when it's active, animations play through it. Its JB2A browser picks any animation, and **Stay until reset** leaves an effect, such as the deployed spikes, on the map until the trap resets. Its own strike animation is switched off for hazards whose trap has an animation.

### Victory Counter challenges
Optional, with [Victory Counter](https://github.com/sargas79/sargas-victory-counter) active. It works in any system.
- **Tracks fire traps:** on the trap's **Challenge** tab, a track reaching a value, landing on a named step, entering a band or completing can ask the GM to fire the trap, or fire it straight away, at the party. Each trigger fires once per crossing.
- **Traps move tracks:** firing, noticing or disabling a trap can move a track up or down.

### Trap Manager
- **List:** every trap on the scene (or all scenes), with its status.
- **Actions:** Fire, Test, Fire at…, Edit, Reset, Enable/Disable, Pan to trap, Preview effect area, Duplicate, Delete trap and its areas, **Repair links**, and **End hazard** for a hazard in an encounter.

## Quick start

1. On the Region layer, click **Create Trap** and draw the trigger area.
2. In the trap sheet, set the **Effect** (use **Place...** for the area), the **Payload**, the **Lifecycle** and, optionally, **Detection** and **Challenge**.
3. Click **Test fire** to check it privately.
4. Play. When the prompt appears, choose **Fire**, **Ignore** or **Disable**.
5. Use the **Trap Manager** to manage traps, and **Reset** to re-arm a spent one.

## Good to know

- **The GM must be online.** The GM's client handles triggers, prompts, detection and challenges. With no GM connected, tokens aren't stopped and nothing fires.
- **Trap data is not secret.** Foundry sends region data to every client, so a player can read trap settings (DCs, damage, linked hazards) from the browser console. Don't put secrets in trap data.
- **pf2e and walls:** in pf2e, line, cone and circle areas never hit tokens through a wall; the system checks walls itself.

## API

`game.modules.get("sargas-trapzors").api`. `trap` is a trap `RegionBehavior` or its UUID; most functions are GM-only.

`createTrapFromRegion(region)`, `openTrapManager()`, `createEffectArea(trap, { kind, anchor, origin })`, `setBlockedByWalls(trap, on)`, `previewEffect(trap, token)`, `resolveAffectedTokens(trap, anchorToken)`, `createDetectionArea(trap, { radiusFt })`, `reveal(trap)`, `getLinkStatus(trap)`, `repairLinks(trap)`, `duplicateTrap(trap, { dx, dy })`, `deleteTrap(trap, { confirm })`.

## Development

`npm test` runs the unit tests (Node's built-in runner, no dependencies). `npm run package` builds `dist/module.zip`. Pure logic lives in `scripts/core/`; Foundry code lives in `scripts/foundry/`, `scripts/adapters/` and `scripts/apps/`.

## Credits

Built with Claude Code: Opus planned, reviewed and tested; Sonnet implemented; Haiku maintained the GitHub issues.

## License

[MIT](LICENSE)
