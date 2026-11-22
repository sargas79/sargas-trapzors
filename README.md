# Sargas Trapzors

Region-based traps for Foundry VTT v14. A token that walks into a trap's trigger area is stopped at the edge, the GM gets a prompt (Fire, Fire as test, Ignore, Disable), and when the GM fires it the module shows an effect area (line, cone or emanation), finds who is inside, and posts a public chat card. Damage is never applied automatically: players or the GM click to apply it. Optional detection lets characters notice a trap before they walk into it.

## Compatibility

- **Foundry VTT v14 only** (minimum 14.361, verified on 14.370).
- **Any game system** works with the generic payloads (flavor text, sound, and a damage roll with a save line).
- **Pathfinder 2e (`pf2e`) and Starfinder 2e (`sf2e`)** have dedicated support: a damage roll card with a save button, posting a hazard actor's action to chat, and trap detection.

## Installation

In Foundry's **Add-on Modules** screen choose **Install Module** and paste this manifest URL:

```
https://github.com/sargas79/sargas-trapzors/releases/latest/download/module.json
```

Then enable **Sargas Trapzors** in your world.

## Quick start (GM guide)

1. **Create the trap.** Open the Region layer in the scene controls and click **Create Trap**, then draw a region (this is the *trigger area*). It becomes a GM-only trap and its sheet opens. You can also select an existing region and click **Create Trap**. Click the tool again to cancel.
2. **Configure it** in the sheet, which has four tabs:
   - **Effect**: choose the **Shape** (Line, Cone, Emanation) and **Origin** (Fixed spot or Triggering token). Use **Place...** to create the effect area, then move, resize and rotate it with Foundry's native region tools. **Preview** shows it to you only. **Show area on fire** sets how many seconds everyone sees it. **Blocked by walls** clips the area to movement walls.
   - **Payload**: **Flavor only**, **Damage and save**, or **Hazard action** (pf2e/sf2e only). Flavor text is shown to everyone; a sound can be added. A damage payload takes a damage formula, damage type, save, save DC and Basic save. A hazard payload links a hazard actor and one of its actions.
   - **Lifecycle**: **Enabled**, **Reusable**, the current **Status** with **Reset**, **Last fired**, and **Who sets it off** (token dispositions, actor types, whether hidden tokens or tokens moved by a GM trigger it).
   - **Detection**: **Players can notice this trap**, the detection area (a GM-only emanation around the trigger), the Stealth DC (set here or from the linked hazard), **Only while using Search**, **Minimum rank**, and **Reveal now**.
3. **Test it.** **Test fire** posts to GMs only and changes nothing.
4. **Play.** When an eligible token moves into the trigger area it stops just inside the edge. The active GM sees a prompt:
   - **Fire**: reveals the effect area, posts the public chat card and a GM-only summary (who triggered it, who was affected, a **Select affected** button).
   - **Fire as test**: the same, but GM-only and with no state change.
   - **Ignore**: the trap goes back to armed.
   - **Disable**: the trap is switched off.

   The chat card shows the damage and, in pf2e/sf2e, a save button. Nothing changes HP until a player or the GM clicks apply.
5. **Manage traps** with the **Trap Manager** tool on the Region layer: statuses, Fire / Test / Open prompt / Edit / Reset / Enable / Disable, Pan to trap, Preview effect area, Duplicate, Delete trap and its areas, and **Repair links** when a linked region was deleted.
6. **Reset** a spent trap from the Lifecycle tab or the Trap Manager to arm it again.

## Concepts

- **Trigger area vs effect area vs payload.** The *trigger area* is the region that stops tokens and starts the prompt. The *effect area* is a separate linked region (line, cone or emanation) used only to decide who is affected. The *payload* is what gets posted to chat.
- **Fixed vs token-anchored effect.** A fixed effect stays where you placed it. A token-anchored effect is centered on the footprint of the token that set the trap off (rotation is kept).
- **Reveal on fire.** When fired, the effect area is shown to all players for the configured number of seconds, then removed. In test mode only GMs see it.
- **Single-use vs reusable.** A single-use trap becomes spent after firing. A reusable trap goes back to armed.
- **Statuses.** *Armed* (waiting), *Pending* (triggered, waiting for the GM's decision), *Spent* (fired, single-use), *Disabled* (switched off). A spent trap does not stop tokens and does not prompt.
- **Detection.** Entering the detection area makes one blind Perception check per token. A success whispers the GM a **Reveal** button; once revealed, players see the trigger area.

## Multiplayer and authority

- Only the **active GM** acts on triggers, shows prompts and changes trap state. With two GMs online, exactly one handles each trap.
- With **no GM connected**, tokens are not stopped and nothing fires.
- Tokens moved together (a group move) are batched into **one prompt** listing all of them.
- A trap that was pending when the world was reloaded gets its prompt back on the active GM.
- Tokens moved by a GM do not trigger traps unless **Tokens moved by a GM trigger it** is ticked.

## Animations (JB2A)

Traps can play a video animation over their effect area when they fire. This is optional and needs no Sequencer: the module has its own small player.

- **Presets** use the [JB2A](https://jb2a.com) library when `jb2a_patreon` or `JB2A_DnD5e` is active (the Patreon version wins). Pick one in the **Animation** menu on the Effect tab: lines (darts, arrows, jets, lightning), cones, areas (explosion, gas, falling rocks, spikes ...) and haunt effects. Presets whose file is missing from your JB2A version (the free one has fewer) are greyed out as "not installed".
- **Fit:** line animations are stretched along the effect line, cone animations scale to the cone radius, and area animations fill the bounds of the effect area. Token-anchored traps animate at the token.
- **Custom file:** choose **Custom file...** to use any video or image from your data folder, and pick how it fits (stretch along a line, fit a cone or fill the area).
- **Preview animation** plays the current selection on your screen only, even before you save. **Fire as test** also plays locally only (GM). A real fire plays on every connected client viewing the scene.
- Hazard traps made from a haunt get the "Haunting spirits" preset when JB2A is installed and no animation is set yet. Other hazards get a suggestion from their damage traits and effect shape.
- Animations last up to six seconds and are never saved to the scene. Without JB2A you can still use a custom file.

## Privacy and limits

**Hiding a trap is a UI matter, not a security boundary.** Foundry sends region and region-behavior data to every connected client, including regions set to GM-only. A player can read trap configuration from the browser console: save DCs, damage formulas, linked hazard actors, detection DCs and which tokens have been checked. Hazard actors the player has no ownership of are also sent to their client. This was verified in spike S1 (see [docs/spikes.md](docs/spikes.md)). **Do not put secrets in trap data.** The module does not encode or obscure it.

## Known limitations

- **Hazard strikes are not supported**, only hazard **actions** (a linked hazard item that is not an action is rejected with a notice).
- **Detection works only in pf2e and sf2e.** In other systems it is unavailable.
- **Blocked by walls** needs the effect region to have exactly one level, and is computed on the viewing GM's client.
- Foundry splits a long drag into several movement segments; the module treats them as one movement (it dedupes on the root movement id). A token repositioned across a trap by a direct edit or teleport also counts as crossing it.
- Verified on Foundry 14.370 only. sf2e (1.7) shares the pf2e adapter: its save request, damage card and hazard action were checked live, but the full multi-client pass ([docs/qa-checklist.md](docs/qa-checklist.md)) ran in pf2e only, and sf2e detection was not tested live.
- With **Tokens moved by a GM trigger it** on, a GM-dragged token was once not stopped at the edge right after the setting was toggled (the prompt still appeared). It stopped correctly in every later run.
- Not yet tested: two GMs online at once, and a world with a system other than pf2e/sf2e (the generic payloads were checked by forcing the generic adapter). For 0.2.0 animations and hazards: the free JB2A version (`JB2A_DnD5e`), sf2e hazards, and 14 of the 17 animation presets (fire cone, darts and haunt spirits were checked on the map).

## API

Available at `game.modules.get("sargas-trapzors").api`. `trap` is a trap `RegionBehavior` (or its UUID). Most functions are GM-only.

- `createTrapFromRegion(region)`: turn a region into a trap (GM-only visibility) and open its sheet.
- `openTrapManager()`: open the Trap Manager for the viewed scene.
- `createEffectArea(trap, { kind, anchor, origin })`: create the linked effect region.
- `setBlockedByWalls(trap, on)`: toggle wall blocking on the trap and its effect region.
- `previewEffect(trap, token)`: show the effect area to GMs only.
- `resolveAffectedTokens(trap, anchorToken)`: the token documents inside the effect area.
- `createDetectionArea(trap, { radiusFt })`: create the GM-only detection region (default 10 ft) and enable detection.
- `reveal(trap)`: reveal the trap to players (marks it revealed and makes the trigger area visible).
- `getLinkStatus(trap)`: link status (`none`, `ok`, `missing`, `foreign`) of the effect and detection areas.
- `repairLinks(trap)`: relink or clear broken links.
- `duplicateTrap(trap, { dx, dy })`: duplicate a trap with fresh state and fresh linked regions.
- `deleteTrap(trap, { confirm })`: delete a trap and its linked regions (asks for confirmation by default).

## Development

```
npm test
```

Tests use the built-in Node test runner with no dependencies. Layout:

- `scripts/core/`: pure logic (eligibility, state machine, dedupe, geometry, text builders). Unit-tested, no Foundry globals.
- `scripts/foundry/`, `scripts/adapters/`, `scripts/apps/`: Foundry-dependent code (behaviors, services, system adapters, sheets and tools). Verified by hand with [docs/qa-checklist.md](docs/qa-checklist.md).
- `npm run package` builds `dist/module.zip` from `HEAD`.

## Credits

Built with Claude Code: Opus 5.5 planned, reviewed and tested; Sonnet 5.5 implemented; Haiku 5.5 maintained the GitHub issues.

## License

[MIT](LICENSE)
