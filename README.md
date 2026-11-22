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
   - **Payload**: **Flavor only**, **Damage and save**, or **Hazard action or strike** (pf2e/sf2e only). Flavor text is shown to everyone; a sound can be added. A damage payload takes a damage formula, damage type, save, save DC and Basic save. A hazard payload links a hazard actor and one of its actions or strikes. A strike is rolled against the AC of each affected (or triggering) token, up to 10 targets; the system posts its attack cards, the GM rolls damage from them (pf2e shows the Damage buttons to the hazard's owner), and anyone can then apply it from the damage card. Damage is never applied automatically. Fire as test whispers a one-line result per target to GMs instead.
     - **Encounter** (complex hazards only): when the linked hazard is complex, an **Encounter** group appears. **Start an encounter when it fires** is on by default; **Add to the encounter** chooses the triggering creatures (default), the affected creatures, or nobody. When the trap fires, its reaction or strike runs as usual, then the module places a hidden hazard token at the middle of the trigger area (and reuses it if it placed one before), adds it and the chosen creatures to the scene's active encounter (creating one, not started, if there is none), and rolls the hazard's Stealth initiative without a dialog; players roll their own. The GM summary notes the initiative. While the hazard is in the encounter the trap cannot trigger again. On the hazard's turn the active GM's chat gets a whispered **routine card** (players never see it) with the routine text (its checks and rolls are clickable), the action count when the text names one, a **Strike** button per strike, a **Post** button per non-passive action, **Disable checks** and **End hazard**. Strikes roll against your targeted tokens, else the creatures in the effect area, else those in the trigger area (up to 10, first attack variant, no dialog). **End hazard** (also in the Trap Manager row menu) removes the hazard from the encounter and deletes its token; the trap keeps the status the fire gave it, and a re-arm timer restarts from that moment. Deleting the encounter or resetting the trap also removes the token. Fire as test only whispers a preview (who would be added, the Stealth modifier and the routine) and creates no token or encounter. The module does not run the routine for you or move the hazard.
   - **Lifecycle**: **Enabled**, **Reusable**, the current **Status** with **Reset**, **Last fired**, and **Who sets it off** (token dispositions, actor types, whether hidden tokens or tokens moved by a GM trigger it).
   - **Detection**: **Players can notice this trap**, the detection area (a GM-only emanation around the trigger), the Stealth DC (set here or from the linked hazard), **Only while using Search**, **Minimum rank**, and **Reveal now**.
3. **Test it.** **Test fire** posts to GMs only and changes nothing.
4. **Play.** When an eligible token moves into the trigger area it stops just inside the edge. The active GM sees a prompt:
   - **Fire**: reveals the effect area, posts the public chat card and a GM-only summary (who triggered it, who was affected, a **Select affected** button).
   - **Fire as test**: the same, but GM-only and with no state change.
   - **Ignore**: the trap goes back to armed.
   - **Disable**: the trap is switched off.

   The chat card shows the damage and, in pf2e/sf2e, a save button. Nothing changes HP until a player or the GM clicks apply.
5. **Manage traps** with the **Trap Manager** tool on the Region layer: statuses, Fire / Test / Open prompt / Edit / Reset / Enable / Disable, Pan to trap, Preview effect area, Duplicate, Delete trap and its areas, **Repair links** when a linked region was deleted. A trap whose hazard is in an encounter shows an **In encounter** badge and an **End hazard** menu item.
6. **Reset** a spent trap from the Lifecycle tab or the Trap Manager to arm it again.

## Theater of the mind

You can fire a trap, or run its detection check, at chosen characters without moving any token.

- **Fire at…** is in the Trap Manager row menu and next to Test fire on the trap sheet. The picker lists the party's members (the pf2e Party actor), other characters owned by players, and the tokens you have targeted or selected on the current scene; everything starts unchecked. If an actor is also shown as a token, only the token is listed. **Fire as test (GM only)** whispers everything to GMs and changes nothing.
- A real fire skips the map effect area: the chosen targets are the affected creatures, the GM summary lists them, and the trap's state changes as for any manual fire (Spent, or armed again when Reusable).
- Flavor, sound, damage and save, and hazard actions work as usual. A **hazard strike** at a token on the viewed scene rolls as before. For a character with no token (or a token on another scene) the strike is rolled with no target: the public attack card shows no hit or miss, and GMs get a whispered line with the total against the actor's AC and the degree of success the module worked out (natural 20 and 1 included). Your targeted tokens are released for that roll and restored afterwards.
- **Detection check…** rolls each chosen character's Perception against the trap's Stealth DC with the usual rules (Search requirement, minimum rank, one check per target; a token's check is stored under the token, an actor's under the actor) and posts the usual GM result with **Reveal** and the disable checks.
- The Trap Manager has a **This scene** / **All scenes** switch. **All scenes** lists every scene's traps, so you can keep traps on an unused "library" scene and fire them from anywhere. **Pan to trap** and **Preview effect area** are disabled for traps on other scenes.

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

Traps can play a video animation over their effect area when they fire. This is optional and needs no Sequencer: the module has its own small player, and it can use [Sargas Visual Automation](https://github.com/sargas79/sargas-visual-automation) instead (see below).

**Tested with JB2A Patreon (`jb2a_patreon`).** The free JB2A (`JB2A_DnD5e`) is supported but untested: presets whose file it lacks are greyed out.

- **Presets** use the [JB2A](https://jb2a.com) library when `jb2a_patreon` or `JB2A_DnD5e` is active (the Patreon version wins). Pick one in the **Animation** menu on the Effect tab: lines (darts, arrows, jets, lightning), cones, areas (explosion, gas, falling rocks, spikes ...) and haunt effects. Presets whose file is missing from your JB2A version (the free one has fewer) are greyed out as "not installed".
- **Fit:** line animations are stretched along the effect line, cone animations scale to the cone radius, and area animations fill the bounds of the effect area. Token-anchored traps animate at the token.
- **Custom file:** choose **Custom file...** to use any video or image from your data folder, and pick how it fits (stretch along a line, fit a cone or fill the area).
- **Preview animation** plays the current selection on your screen only, even before you save. **Fire as test** also plays locally only (GM). A real fire plays on every connected client viewing the scene.
- Hazard traps made from a haunt get the "Haunting spirits" preset when JB2A is installed and no animation is set yet. Other hazards get a suggestion from their damage traits and effect shape.
- The built-in player's animations last up to six seconds and are never saved to the scene. Without JB2A you can still use a custom file.

### Sargas Visual Automation

When Sargas Visual Automation (0.6.3 tested for the API) is active, trap animations and reveal glows play through it, with the same placement as the built-in player. Set **Animation player** in the module settings to **Built-in player** to keep using the built-in one. Without Visual Automation nothing changes.

- A real fire plays for everyone through Visual Automation (it syncs the animation itself). **Fire as test** and **Preview animation** play for GMs only.
- **Browse Visual Automation...** (Effect tab, only when it is active) opens its animation picker and stores a JB2A database path such as `jb2a.spike_trap...` as the trap's custom animation. A database path needs Visual Automation to play: with it inactive, or the setting on Built-in, the animation is skipped with a GM warning and the sheet says so.
- **Stay until reset** (Visual Automation only) keeps the animation on the map as a persistent effect named `sargas-trapzors:<trap id>`, for example deployed spikes. It ends when the trap is reset, re-arms, is disabled or is deleted, and survives scene reloads.
- **Double animations:** Visual Automation's pf2e automation may also animate a hazard strike that a trap rolls. When a trap with its own animation fires a hazard strike, the module switches Visual Automation's animation off for that hazard actor (`SVA.automation.setActorDisabled`), but only for hazards the module imported into the "Sargas Trapzors hazards" world folder. Re-enable it from Visual Automation's actor overview if you want that actor animated by Visual Automation again, or change `SUPPRESS_SVA_HAZARD_ANIMATION` in `scripts/foundry/animations.js`. Whether Visual Automation really animates these rolls has to be confirmed in a live game.

### Glow when revealed

On the Detection tab, **Glow when revealed** plays a JB2A Patreon effect once over the trigger area, for everyone, when the trap is revealed (the **Reveal** chat button or **Reveal now**; not when it was already revealed). Choose a Detect Magic circle (blue, green, purple, yellow, dark red) or a divination rune pulse. **None** is the default and changes nothing. **Preview glow** plays it for you only. It plays through Visual Automation when that is in use.

## Victory Counter challenges

Optional, and active only while [Victory Counter](https://github.com/sargas79/sargas-victory-counter) is active (module id `sargas-victory-counter` or `victory-counter`; the first active one is used). It works in any system. With Victory Counter off, nothing changes and the **Challenge** tab is hidden.

- **Triggers (track fires trap).** The trap sheet's **Challenge** tab holds up to 3 triggers. Each names a track and a condition: **reaches** a value (progress and step tracks, going up), **lands on a step** (step tracks), **enters a band** (threshold tracks, in either direction) or **completes**. The action is **Ask the GM** (default: a whispered chat card with **Fire at the party** and **Ignore**) or **Fire at once**. Firing goes through **Fire at…** at the party's members, or at player-owned characters when there is no party, so no tokens are needed.
- **Once per crossing.** A trigger watches for the moment its condition becomes true, so it re-arms by itself. **Reaches 3** fires again only after the track has dropped below 3 and risen to it again; a step or band fires again after the track has left it and come back; **completes** after the track is no longer complete. A trap that is disabled, spent or in a hazard encounter is never fired or asked about.
- **Effects (trap moves track).** For **Fired**, **Noticed** (a successful detection check; applied once per character who notices the trap) and **Disabled** (End hazard, or **Mark disabled** in the Trap Manager row menu) the trap adjusts a chosen track by a whole number, positive or negative, and the GMs get a whispered note. **Mark disabled** only applies the effect; it does not change the trap's state. **Fire as test** adjusts nothing.
- **Broken links.** If a linked track is deleted, the sheet shows a note, the Trap Manager's **Challenge** pill turns red, and the trigger never fires.
- The Trap Manager shows a **Challenge** pill on traps with any trigger or effect.

## Privacy and limits

**Hiding a trap is a UI matter, not a security boundary.** Foundry sends region and region-behavior data to every connected client, including regions set to GM-only. A player can read trap configuration from the browser console: save DCs, damage formulas, linked hazard actors, detection DCs and which tokens have been checked. Hazard actors the player has no ownership of are also sent to their client. This was verified in spike S1 (see [docs/spikes.md](docs/spikes.md)). **Do not put secrets in trap data.** The module does not encode or obscure it.

## Known limitations

- **Victory Counter challenges** need the active GM online: the GM's client watches the tracks and applies every effect. Victory Counter fires no hooks, so the module diffs the tracks setting each time it changes. A track that was created or changed while no GM was connected is not diffed. Not yet tested live.
- **Detection works only in pf2e and sf2e.** In other systems it is unavailable.
- **Hazard strikes need the GM on the trap's scene for map targets.** A strike against a token is rolled on the active GM's client, which must be viewing that token's scene. Characters with no token (Fire at…) are rolled without a target, so the public attack card shows no degree; only the GM's whispered line does. Routine-card strikes against tokens on other scenes are rolled the same way.
- **Theater of the mind** (Fire at… and Detection check…) needs the active GM. Not yet tested live: sf2e, and firing a trap that is stored on another scene when it has an effect area or an encounter (the map effect area is skipped; an encounter only adds tokens on the trap's scene).
- **Blocked by walls** is computed on the viewing GM's client, on the scene the GM is viewing. On a scene with several levels the walls of one level clip the area: the triggering token's level (token origin), else the trigger region's level that holds the token, else its lowest level, else the scene's first. Only tokens on that level are affected. If the trap's scene is not the viewed one, the area is used unclipped (still only that level) and the GM summary says so. In pf2e, line, cone and circle areas never hit tokens through a wall anyway: the system checks walls itself for those shapes, even with **Blocked by walls** off. The red area shown on the map during a fire is clipped by Foundry only when its level is the one the GM views. See S7 in [docs/spikes.md](docs/spikes.md).
- Foundry splits a long drag into several movement segments; the module treats them as one movement (it dedupes on the root movement id). A token repositioned across a trap by a direct edit or teleport also counts as crossing it.
- Verified on Foundry 14.370 only. sf2e (1.7) shares the pf2e adapter: its save request, damage card and hazard action were checked live, but the full multi-client pass ([docs/qa-checklist.md](docs/qa-checklist.md)) ran in pf2e only, and sf2e detection was not tested live.
- With **Tokens moved by a GM trigger it** on, a GM-dragged token was once not stopped at the edge right after the setting was toggled (the prompt still appeared). It stopped correctly in every later run.
- Not yet tested: two GMs online at once, and a world with a system other than pf2e/sf2e (the generic payloads were checked by forcing the generic adapter). For 0.2.0 animations and hazards: the free JB2A version (`JB2A_DnD5e`), sf2e hazards, and 14 of the 17 animation presets (fire cone, darts and haunt spirits were checked on the map). For 0.3.0 hazard strikes: ranged strikes, more than 10 targets, and sf2e.
- **Complex hazards (encounters)** need the pf2e or sf2e system and the active GM. The module does not follow the routine for you: buttons roll or post, and you move the hazard yourself. Routine strikes use the first attack variant (no multiple attack penalty choice) and, like payload strikes, only roll tokens on the scene the GM is viewing. If you delete the hazard's combatant by hand the trap stays locked as "In encounter" until you use **End hazard** or **Reset**. While a hazard is in an encounter its re-arm timer is paused. Not yet tested live: sf2e complex hazards and hazards with several strikes.

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
