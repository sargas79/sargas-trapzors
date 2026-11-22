# Changelog

## Unreleased

### Added (P9)

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

See the [README](README.md#known-limitations) and its privacy section (trap data is readable by players, hazard strikes, detection systems, wall blocking).
