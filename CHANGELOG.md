# Changelog

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
