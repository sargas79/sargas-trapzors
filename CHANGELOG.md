# Changelog

## Unreleased

### Added

- **Victory Counter challenges** (optional, active only while Victory Counter is active; ids `sargas-victory-counter` and `victory-counter` are both supported; any game system). A new **Challenge** tab on the trap sheet holds up to 3 **triggers** (a track reaches a value, lands on a named step, enters a band, or completes) that ask the GM, or fire the trap at once, at the party through **Fire at…**; each trigger fires once per crossing and re-arms by itself. Three **effects** adjust a track by ±N when the trap fires (real fires only), is noticed (detection success) or is disabled (**End hazard**, or the new **Mark disabled** in the Trap Manager). A deleted track shows a note and never fires. The Trap Manager shows a **Challenge** pill. The active GM watches Victory Counter's tracks setting and diffs it with the pure, unit-tested `crossedTriggers`.
- Trap data gains `challenge` (`triggers`, `effects`); defaults are filled in for existing traps (no schema version change).

- **Blocked by walls on multi-level scenes**: the area is clipped by the walls of the triggering token's level (or, for a fixed area, the trigger region's level that holds the token, else its lowest level), even when the GM views another level, and tokens on other levels are not affected through it. If the trap's scene is not the viewed scene the area is used unclipped (on that level only) and the GM summary says so. Single-level scenes behave as before.
- **Sargas Visual Automation support**: when it is active, trap animations play through it (same placement as the built-in player; Fire as test and Preview for GMs only). New world setting **Animation player** (Automatic or Built-in player). **Browse Visual Automation...** picks a JB2A database path, which needs Visual Automation to play. **Stay until reset** keeps the animation on the map until the trap is reset, re-arms, is disabled or deleted. A hazard actor the module imported has Visual Automation's own animation switched off when the trap fires with its own animation, to avoid two animations.
- **Glow when revealed** (Detection tab): a Detect Magic circle in several colours or a divination rune pulse plays once over the trigger area for everyone when the trap is revealed, with a GM-only **Preview glow**. None by default.
- Docs: animations were tested with JB2A Patreon (`jb2a_patreon`); the free JB2A is supported but untested.
- Trap data gains `effect.animation.persist` and `detection.revealGlow` (defaults filled in for existing traps; no schema version change).

- **Theater of the mind**: **Fire at…** (Trap Manager row menu and trap sheet) fires a trap at party members, player characters or targeted/selected tokens without moving tokens; the map effect area is skipped, the GM summary lists the targets and the trap's state changes as for any manual fire. **Fire as test (GM only)** changes nothing. Hazard strikes at a character with no token are rolled with no target and the GM gets a whispered hit or miss line against the actor's AC (degree computed with the pf2e rules).
- **Detection check…** rolls chosen characters' Perception against the trap's Stealth DC with the usual rules (Search, minimum rank, one check per target) and posts the usual GM result with Reveal.
- Trap Manager **This scene** / **All scenes** switch, so traps on a "library" scene can be fired from any scene.
- **Complex hazards** (pf2e/sf2e): a trap made from a complex hazard now starts an encounter when it fires, if the new **Encounter** setting on the Payload tab is on (the default). The hazard's reaction or strike runs first, then a hidden hazard token is placed in the trigger area, added with the triggering (default) or affected creatures to the scene's encounter (one is created, not started, if needed) and its Stealth initiative is rolled. The trap cannot trigger again until the hazard ends.
- **Routine card**: on the hazard's turn the active GM gets a whispered card with the routine text (checks and rolls are clickable), the action count, **Strike** and **Post** buttons for the hazard's strikes and actions, **Disable checks** and **End hazard**. Players never see it. Strikes roll against your targeted tokens, else the effect area, else the trigger area.
- **End hazard** removes the hazard from the encounter and deletes its token; a re-arm timer then restarts. Also available in the Trap Manager, which shows an **In encounter** badge. Deleting the encounter or resetting the trap removes the token too.
- Fire as test previews the encounter (who would be added, the hazard's Stealth modifier, the routine) to GMs only, with no token or encounter.
- Schema version 3 (adds the encounter settings and state; existing traps keep their behavior).

### Fixed

- Chat buttons (Reveal, Select tokens, the routine card's buttons) now work on messages rendered before the module was ready, such as the chat history after a reload.
- A trap with **Blocked by walls** that fired while the GM viewed another scene hit nobody (a wall-restricted area that cannot be clipped contains nothing). The area is now used unclipped, as the GM note says.

## 0.3.0 — 2026-11-22

### Added

- **Hazard strikes** (pf2e/sf2e): a hazard payload can now link a hazard strike (melee or ranged) as well as an action. The strike is rolled against the AC of each affected token (or the triggering tokens, chosen on the Payload tab), up to 10 targets, with the roll dialog skipped. The system's attack cards carry the Damage and Critical buttons (shown to the GM); damage is never applied automatically. Fire as test whispers a one-line result per target to GMs, with no placeholder for players.

### Known limitations

- A hazard strike rolls only while the active GM is viewing the trap's scene; otherwise each target is skipped with a notice.
- Not yet tested live: ranged hazard strikes, more than 10 targets, and sf2e.

## 0.2.0 — 2026-11-22

### Added

- Haunts and hazards: hazard actors (including haunts) can be turned into configured traps with their action, detection DC and reset time.
- Re-arm timer: a reusable trap can re-arm itself after a set game time; the sheet and the Trap Manager show the time left.
- Compendium browser in the Trap Manager: search and filter hazards across all Actor compendiums and create a trap from one in a click.
- Animations: optional JB2A presets (lines, cones, areas, haunts) or a custom video file, played by a built-in player on every client when a trap fires. Preview animation and Fire as test play on the GM's screen only. Needs no Sequencer.

## 0.1.0 — 2026-11-21

### Added

- Trigger pipeline: eligible tokens stop at the edge of the trigger area, the active GM gets one prompt (Fire, Fire as test, Ignore, Disable), group moves are batched, and pending prompts survive a reload.
- Effect areas: line, cone and emanation, either fixed or anchored on the triggering token, with an optional "Blocked by walls" setting and a timed reveal to players on fire.
- Payloads: generic (flavor, sound, damage roll with save line) for any system; pf2e and sf2e damage cards with save buttons and hazard action posting. Damage is never applied automatically.
- Trap detection for pf2e and sf2e: one blind Perception check per token, GM-only results, and a Reveal button.
- Trap configuration sheet with Effect, Payload, Lifecycle and Detection tabs.
- Trap Manager and Create Trap tools on the Region layer.
- Linked-region lifecycle sync: repair links, duplicate and delete traps together with their effect and detection areas.
- Public API at `game.modules.get("sargas-trapzors").api`.

### Known limitations

See the [README](README.md#known-limitations) and its privacy section (trap data is readable by players, detection systems, wall blocking).
