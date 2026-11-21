# P0 spike results

Run on 2026-11-21 by Claude Opus 5.5, driving a live Foundry instance in the built-in browser.

- **Environment:** Foundry VTT **14.370** (stable), pf2e **8.7.0**, throwaway world `trapzors-spike-throwaway`.
- **Users:** `Spike GM` (Gamemaster) and `Spike Player` (Player), both without passwords.
- **Scene:** square grid, 100 px per square, 5 ft per square.
- **Probe module:** a throwaway `sargas-trapzors-spike` in `Data/modules`. It registers a `probe` RegionBehavior sub-type and records every region event plus the `moveToken` hook.
- **Not tested:**
  - hex and gridless scenes
  - a non-pf2e system (none is installed)
  - sf2e live
  - two clients connected at the same time (GM and player were logged in one after the other in the same browser)

| Spike | Result |
|---|---|
| S1 Privacy | **Broadcast.** Player clients receive hidden trap data. |
| S2 Sub-type registration | **Works** through `documentTypes`. Manifest `relationships.systems` semantics not tested. |
| S3 Stop and teleport | **Stops just inside the boundary.** Direct x/y edits and jumps also fire `tokenMoveIn`. Movement IDs change per segment. |
| S4 Transient shapes, IDs, reveal | **Works.** Scene duplication keeps region and behavior IDs. |
| S5 pf2e APIs | **Works** for damage, saves, hazard actions, secret Perception and Search. **Strikes deferred.** |
| S6 Wall constraints | **Native and works** (`restriction` on the region). |

## S1: Do player clients receive hidden region and behavior data? Broadcast

As `Spike Player`, I read the scene from the player's client. It contained the GM-only region (`visibility: GAMEMASTER (1)`, ownership `default: NONE`) with:
- its full `behaviors[].system` data, including the probe's `secret: "SPIKE-SECRET-DC-25"` value
- its `flags`, including the link flags

A hazard actor with ownership NONE was also fully present: its Stealth value and its items.

What the UI did hide:
- The region was not drawn for the player (`placeable.visible === false`).
- A `secret`-trait roll was shown to the player as "privately rolled some dice ???".

But the roll's total was still in the message data on the player's client.

**Consequence:** a player who opens the browser console can read trap configuration: DCs, damage, hazard links and detection results. As far as I found, a client-side module has no supported way to keep such data off player clients. Actors, settings and regions all reach every client. **Needs your decision** (see the end of this file).

## S2: Behavior sub-type registration: works

- `module.json` declared `"documentTypes": {"RegionBehavior": {"probe": {}}}`. The type registers as `sargas-trapzors-spike.probe` in both `game.documentTypes.RegionBehavior` and `CONFIG.RegionBehavior.dataModels`.
- Subclassing `foundry.data.regionBehaviors.RegionBehaviorType`, with `_createEventsField` for the event set, works for creating behaviors and receiving events.
- Dispatch rules, from `client/documents/region-behavior.mjs:101-113`:
  - Static `events` handlers run for every event.
  - `_handleRegionEvent` runs only for events in the instance's `events` set.
- Module `sargas-trapzors` (P1 skeleton) loaded in the pf2e world without console errors, on both the GM and the player client.
- **Not tested:** whether `relationships.systems` restricts which systems the module loads in. P1 doesn't declare it, so the module stays system-agnostic.

## S3: Movement, stop position, teleports

All on a square grid. The trigger region is a rectangle at x 1000–1300. The test token is 1×1 and starts at x 500.

- **Segmentation:** one `token.move([{x:1600}])` became **three separate movement updates**, each with **its own `movement.id`**, stopping at x 951, 1251 and 1600. Events per segment:
  - x 951: `tokenEnter`, `tokenMoveIn`
  - x 1251: `tokenMoveWithin`, `tokenExit`, `tokenMoveOut`
- **Movement chain:** `movement.chain` lists the IDs of the earlier segments of the same movement. **The plan must change:** the dedupe key should use the root ID `movement.chain[0] ?? movement.id`, not `movement.id`.
- **Stop:** calling `event.data.token.stopMovement()` in `tokenMoveIn` on the mover's client **stops the token at the entry point** (x 951, center just inside the boundary). The rest of the path is cancelled. No errors.
- **Direct edits:** both `token.update({x})` with no action and `update(..., {action: "displace"})` are split at region boundaries the same way and fire `tokenMoveIn`. A direct jump into the area fires `tokenEnter` and `tokenMoveIn`. Repositioning a token *across* a trap counts as crossing it.
  - For GM moves, plan A3 already ignores GM movement by default.
  - Core's Teleport behavior wasn't tested. That's a P3 check.
- **Large tokens:**
  - A 2×2 token is inside when **any** of its grid-space centers is inside: x 900 → in, x 800 → out, off-grid x 850 → in.
  - For a 1×1 token the center decides: x 949 → out, x 951 → in.

## S4: Transient shapes, scene duplication, reveal

- **Transient regions:** a **non-persisted** `RegionDocument` created with `{parent: scene}` works with `TokenDocument#testInsideRegion` (`persisted: false`). Verified shapes:
  - `cone` (radius 600, angle 90, rotation 180, round)
  - `line` (length 3000, width 100, `gridBased`)
  - `emanation` with `base: {type: "token", ...}`, radius 100, `gridBased`. Its bounds come out as the token's footprint plus one square on every side.

  Token-anchored effects therefore need no saved document to resolve their targets.
- **Scene duplication:** `scene.clone({}, {save: true})` **keeps the region ID, behavior ID, behavior system data and flags.** `toCompendium(..., {keepId: false})` also kept the embedded region `_id`. So ID-based links between regions in the same scene survive scene duplication and export. Only the in-scene "duplicate trap" action needs relinking.
- **Reveal on fire:** creating and deleting a `visibility: ALWAYS` region is ordinary document CRUD. The timed display wasn't run end to end; it gets tested in P4.

## S5: pf2e 8.7 APIs

| Need | Verified API | Result |
|---|---|---|
| Damage roll card | `CONFIG.Dice.rolls.find(r => r.name === "DamageRoll")`, then `new DamageRoll("2d6[piercing]")` and `.toMessage({flavor, speaker})` | The card comes with pf2e's `applyDamage` buttons (×3) and `shieldBlock`. Nothing is applied automatically. |
| Save request | Enrich `@Check[reflex\|dc:20\|basic]` | Becomes an inline check link (`data-pf2-check="reflex"`, `data-pf2-dc="20"`, `data-roller-role="target"`), with **`data-pf2-show-dc="gm"` by default** and a repost-to-chat icon. |
| Damage inline | `@Damage[2d6[piercing]]` | Becomes an inline damage roll link. |
| DC visibility | settings `pf2e.metagame_showDC`, `metagame_secretChecks`, `metagame_secretDamage`, and others | They exist. The enricher respects them. |
| Hazard Stealth DC | `hazard.system.attributes.stealth.dc` | `value: 12` gives `dc: 22`. |
| Hazard action | `item.toMessage()` on a hazard `action` item | Posts a card with its inline `@Check` and `@Damage`. |
| Hazard strike | `hazard.system.actions[0].variants[0].roll({skipDialog: true})` | **Opened a modifier dialog anyway** ("Always Show Dialog") and needs per-target AC. **Q2 answer: actions-only MVP; strikes deferred.** |
| Secret Perception | `actor.perception.roll({dc: {value}, skipDialog: true, ...})` | `rollMode: "blindroll"` was **ignored** (the message was public). `traits: ["secret"]` makes it a GM whisper that players see as "???". `createMessage: false` returns the roll without posting. **Use `createMessage: false` and post our own GM whisper**, or `traits: ["secret"]`. |
| Perception rank | `actor.perception.rank` | Number (0 = untrained). |
| Search exploration | `actor.system.exploration` (array of item IDs); Search action `Compendium.pf2e.actionspf2e.Item.TiNDYUGlMmxzxBYU`, slug `search` | `exploration.some(id => actor.items.get(id)?.slug === "search")` gives `true` once Search is set as the activity. |

sf2e 1.7 wasn't tested live. It's built from the same codebase and registers the same region behaviors. Verify it in P5b.

## S6: Wall-constrained effect areas: native

A region with `restriction: {enabled: true, type: "move"}` and exactly one level (`levels: ["defaultLevel0000"]`) gets `_shapeConstraints` computed at creation. Its shapes are clipped by walls from each shape's origin (`client/documents/region.mjs:1062-1140`).

- **Test:** a line from x 1150, 1500 px long, with a wall at x 1450.
  - Resulting bounds: x 1150, width 300.
  - Token at x 1300 → inside. Token at x 1600 (behind the wall) → outside.
- **Requirements:**
  - The region has exactly one level, and that level `isView` on the client that computes it (the active GM, who views the scene).
  - Transient regions would call `updateShapeConstraints()` (no save) to compute it.
- **Not verified:** whether `restriction.enabled` also makes the region block token movement. Check this before relying on it.

## Proposed plan amendments (need approval)

1. **Dedupe key** (§10 4c, `core/dedupe.js`): key on `movement.chain[0] ?? movement.id` (the root movement ID), not `movement.id`. This is a correctness fix within the approved behavior (A6).
2. **Q2:** the MVP supports hazard **actions** only. Hazard **strikes** move to deferred.
3. **Detection rolls:** use `createMessage: false` plus our own GM-only whisper, not `rollMode`.
4. **A8, wall blocking:** native support exists. Proposal: a per-trap "Blocked by walls" toggle (default off) on the effect region, using `restriction`. It's a small scope addition to P4, only with your OK.
5. **S1 privacy outcome:** your decision.
   - **(a)** Accept and document that trap configuration can be read from the browser console (the plan's stated fallback).
   - **(b)** Also lightly encode the sensitive fields. This deters casual inspection but is **not** security.

## Decisions (plan owner, 2026-11-21)

- **Privacy (S1):** option (a). Keep trap configuration in the region behavior. The README states plainly that it can be read from the browser console. No secrecy claims, no encoding.
- **Amendments 1–4: all approved.**
  1. Dedupe on the root movement ID.
  2. Hazard actions only; strikes deferred.
  3. Detection rolls use `createMessage: false` plus a GM whisper.
  4. Per-trap "Blocked by walls" toggle (default off) in P4.
- **Gate:** passed. P3 and P4 may start.

## P1 checks done in the same session

- `sargas-trapzors` 0.1.0 loads in the pf2e world with no console errors on either the GM or the player client. A generic-system world wasn't available, so that wasn't tested.
- Defect found and fixed: `main.js` logged during `init`, when `game.user` isn't set yet, so nothing printed. The log line moved to `ready`.
- After the fix:
  - GM with `debug` on → `sargas-trapzors | ready {version: 0.1.0}`
  - Player with `debug` on → no module output (checked with a console marker before reload)
  - Player with `debug` off → no module output

## Test fixtures left in place

These stay for P3/P4 testing. Remove them when no longer needed:
- `Data/modules/sargas-trapzors` (a directory junction to `D:\sargas-trapzors`)
- `Data/modules/sargas-trapzors-spike` (the throwaway probe)
- the `trapzors-spike-throwaway` world
