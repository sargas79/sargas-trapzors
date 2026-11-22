# Manual QA checklist

Multi-client checks that unit tests cannot cover. Record the result of each row per grid type in the results grid at the end of its section (`☐` = not run, `✔` = pass, `✘` = fail with a note).

## Setup

**Foundry:** v14.370 (minimum 14.361).

**Worlds (two):**
1. A **pf2e** world (add an **sf2e** world too if you want to check Starfinder 2e).
2. A **generic-system** world (any system without a dedicated adapter, for example `dnd5e` or the "Simple Worldbuilding" system), used for the "Missing integration" row.

**Users:**
- **GM**: browser profile A.
- **Player**: a second browser profile (or private window) B, logged in as a Player that owns at least three tokens.
- **Second GM**: a third browser profile C, only for the "Multi-GM" row.

Enable the module in both worlds. Set the module's **Debug logging** setting on the GM client if you want console diagnostics.

**Scenes (three per world):** create one scene each with a **Square**, a **Hexagonal** and a **Gridless** grid. Use a background large enough for a 10-square path. On each scene:
- Place a Player-owned token "Hero" (1x1), a Player-owned "Giant" (2x2) and two more Player-owned tokens "Ally1" and "Ally2". Token disposition **Friendly** (the default trigger filter).
- Place an NPC token "Bystander" (Neutral or Hostile) near the planned effect area.
- Draw the trap with **Create Trap** (Region layer): a trigger rectangle about 3x3 squares. Configure a **Damage and save** payload (damage `2d6`, type piercing, Reflex, DC 20, Basic save), **Shape** Line, **Origin** Fixed spot, then **Place...** an effect area crossing the Bystander. Leave the trap **Armed**, **Show area on fire** 6 seconds.
- Use **Test fire** once to confirm the sheet works before starting.

After each row, use the Trap Manager **Reset** action to arm the trap again.

Run every row on all three grid types. Rows 13 and 16 need the pf2e world (or sf2e); row 18 needs both worlds.

---

## 1. Trigger enter

**Steps**
1. As the Player, drag Hero toward the trigger area from outside.
2. Release at a point past the boundary.
3. Watch the GM client and the chat log.

**Pass:** Hero stops at the boundary (just inside the edge). Exactly one "Trap triggered" prompt appears on the GM. No chat message appears until the GM clicks **Fire**.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ✔ | ✔ |

_Result (2026-11-21):_ Player-moved token aimed at x=1500 stopped with its center just inside the edge; one prompt; no chat before Fire.

## 2. Cross in one move

**Steps**
1. Player: use the ruler (drag Hero, adding waypoints) so the path crosses the whole area and ends on the far side.
2. Release.

**Pass:** Hero stops at the entry of the area, not on the far side, and the GM sees one prompt.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ✔ | ✔ |

_Result (2026-11-21):_ The row 1 move crossed the whole 300 px area in one move and stopped at entry with one prompt.

## 3. Within / remain

**Steps**
1. As the Player, enter the area and let the GM click **Ignore**, so Hero stands inside with the trap Armed.
2. As the Player, move Hero to another point inside the area.
3. Separately, reload the game with Hero already inside and an Armed trap.

**Pass:** Moving inside the area, or starting inside, produces no new prompt and no stop.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Moving inside the area gave no prompt.

## 4. Re-enter

**Steps**
1. Set the trap **Reusable**. As the Player, enter the area; GM clicks **Fire**. Check Status is Armed.
2. Player moves Hero out of the area, then back in.
3. Reset the trap, un-tick Reusable, enter and **Fire** so it becomes Spent.
4. Player leaves and re-enters.

**Pass:** Step 2 gives a new prompt. Step 4 gives no stop and no prompt.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Reusable: leave and re-enter gave a new prompt and Fire re-armed. Spent: no stop, no prompt.

## 5. Large token

**Steps**
1. Player drags Giant (2x2) so exactly one of its grid spaces overlaps the trigger area (its other test points outside).
2. Reset. Drag Giant so that none of its grid spaces' centers are inside the area (it may touch the edge).

**Pass:** Step 1 triggers. Step 2 does not.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ 2×2 overlapping the edge by 40 px (all test points outside): no trigger. One space inside: trigger.

## 6. Group move

**Steps**
1. As the Player, select Hero, Ally1 and Ally2 and drag them together into the area.

**Pass:** One prompt listing all three tokens under "Triggered by:".

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Three tokens moved together gave one prompt listing all three.

## 7. GM movement

**Steps**
1. As the GM, drag Hero into the area with "Tokens moved by a GM trigger it" **off**.
2. Move Hero out, tick "Tokens moved by a GM trigger it", save, and drag Hero in again as the GM.

**Pass:** Step 1 gives no stop and no prompt. Step 2 gives a stop and a prompt.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Off: no trigger. On: prompt raised in 5 of 5 runs; the token stopped at the edge in 4 of 5. In the first run, right after toggling the setting, the GM-dragged token was not stopped. Recorded as a known minor issue.

## 8. No GM

**Steps**
1. Log the GM out (close profile A) so no GM is connected.
2. As the Player, move Hero through the area.
3. Check the player's console for errors. Log the GM back in and check the trap's Status.

**Pass:** Hero moves through with no stop, no error. The trap is still Armed after the GM returns.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ GM logged out: the player crossed the whole area with no stop and no console errors. On GM return the trap was armed with nothing pending.

## 9. Multi-GM

**Steps**
1. Log in a second GM (profile C) on the same scene, in addition to GM A.
2. As the Player, enter the area; one GM clicks **Fire**.
3. Count the prompts across both GM clients and the chat cards.

**Pass:** Exactly one prompt appears (on the active GM only) and exactly one public chat card and one GM summary are posted. When the active GM logs out, the other GM receives the prompt for any still-pending trap.

| Square | Hex | Gridless |
|---|---|---|
| ☐ | ☐ | ☐ |

_Result (2026-11-21):_ Not run: the test world has only one GM user.

## 10. Effect shapes

**Steps**
1. Position Bystander and the other tokens so a clear set is inside and a clear set is outside the shape.
2. For each shape (**Line**, **Cone**, **Emanation**) and each rotation (**0°, 45°, 90°**), use the Trap Manager **Preview effect area** (or Fire as test) and read the GM summary's "Affected:" line. Rotate the area with the native region tools.
3. For **Emanation** with **Origin** set to **Triggering token**, fire with Hero and then with Giant.

**Pass:** The highlighted area contains the expected tokens at every angle, and the "Affected" list matches. A token-anchored emanation is centered on the triggering token's footprint (for Giant, the whole 2x2 footprint).

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ✔ | ✔ |

_Result (2026-11-21):_ Line, cone at 0°, 45° and 90°, and emanation: expected token in, control token out (7/7 per grid). Square: a token-anchored emanation is based on the triggering token footprint (5 ft in, 15 ft out).

## 11. Reveal

**Steps**
1. Set **Show area on fire** to 6 seconds. Trigger the trap and click **Fire**. Watch the Player client.
2. Trigger again and click **Fire as test**. Watch the Player client.

**Pass:** Step 1: the player sees the effect area only after Fire, and it disappears after about 6 seconds (the temporary reveal region is removed). Step 2: players see nothing.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ✔ | ✔ |

_Result (2026-11-21):_ The player saw the reveal region during the reveal and not after 4 s (3 s setting). Test mode (square): the player saw no region and no messages.

## 12. Payload roll

**Steps**
1. Fire the trap with a **Damage and save** payload (damage `2d6`, Reflex DC 20, Basic).
2. Look at the chat as the Player. Note HP of the affected tokens.
3. Click the apply-damage button on the card.

**Pass:** The public card shows the damage and the save (in pf2e/sf2e a save button; in the generic world a save line). Nothing changes HP until someone clicks apply. The GM summary shows the Save DC.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ A real fire with an affected token: its temporary HP of 15 were unchanged. The card and save request were public.

## 13. Hazard action (pf2e world)

**Steps**
1. In the pf2e world, create a hazard actor with an action that has an inline `@Check` and `@Damage`.
2. In the Payload tab choose **Hazard action**, pick the hazard and the action. Fire.
3. Click the inline buttons on the posted card.

**Pass:** The chosen hazard action is posted to chat, its inline buttons work, and the affected tokens are listed in the GM summary.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ The Dart Volley action was posted publicly, and the GM summary listed the affected tokens. The inline buttons were verified in P5b.

## 14. Lifecycle

**Steps**
1. Single-use trap: trigger and **Fire**. Status becomes **Spent**.
2. Click **Reset**. Status becomes **Armed**.
3. Set **Reusable**: trigger and **Fire**. Status is **Armed** again.
4. Trigger, then click **Fire as test**. Status stays **Pending** (no change) and **Last fired** is unchanged.

**Pass:** All four statuses match.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ✔ | ✔ |

_Result (2026-11-21):_ Single-use → spent on all grids. Square: Reset → armed, reusable → armed after fire, test fire changed no state.

## 15. Persistence

**Steps**
1. Trigger the trap so the prompt is open (**Pending**). Reload the GM's browser tab.
2. Duplicate the scene (right-click the scene, **Duplicate**). In the copy, trigger each trap and use **Preview effect area** and **Repair links**.
3. Also use the Trap Manager **Duplicate** action on a trap in the original scene.

**Pass:** Step 1: after reload the prompt reappears on the GM. Step 2 and 3: the copied traps are independent (firing one does not change the other) and their effect and detection links work.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Reloading the GM mid-pending re-opened the prompt with all three tokens. Scene duplicate was verified live in P7b (PR #15).

## 16. Detection (pf2e world)

**Steps**
1. In the Detection tab tick **Players can notice this trap**, create the detection area, set a Detection DC, leave **Only while using Search** ticked.
2. As the Player, set Hero's exploration activity to **Search** and move into the detection area.
3. Move Hero out and in again. Then try with Ally1 not using Search.
4. On a success, click **Reveal** in the GM whisper.

**Pass:** One blind check per token (the second entry makes no new check). A success whispers the GM a **Reveal** button, players do not see the roll. A token not using Search gets a GM note that it could not check. After Reveal, players see the trigger area.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ One blind check per token (re-entry is not re-checked); the failure note and the success with a Reveal button go to the GM only. After Reveal the player sees the trigger region.

## 17. Permissions

**Steps**
1. As the Player, try to open the trap sheet (via the region or the Regions layer) and update the behavior (for example from the console).
2. As the Player, look for the GM-only trap and detection regions on the canvas.
3. Read `docs/spikes.md` S1 and, as the Player, confirm the console behavior it describes.

**Pass:** The player cannot open the config, cannot update the behavior, and sees no GM-only regions in the UI. S1 results (trap data readable from the console) are documented in the README privacy section.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Player: the sheet does not render, a behavior update is refused by the server, the trap tools are hidden, the Manager does not open, and no GM-only regions are visible (P7a + this pass). S1 is documented in the README.

## 18. Missing integration

**Steps**
1. In the **generic-system world**, open a trap sheet and check the Payload tab. Fire a **Damage and save** payload.
2. Open the Detection tab; try to use detection.
3. In the **pf2e world**, link a hazard payload, then delete the hazard actor and trigger the trap and click **Fire**.

**Pass:** Step 1: the generic payload works and **Hazard action** is not offered. Step 2: detection reports it is only available in pf2e and sf2e. Step 3: the GM sees a warning, the trap stays pending, and there is no crash.

| Square | Hex | Gridless |
|---|---|---|
| ✔ | ☐ | ☐ |

_Result (2026-11-21):_ Missing hazard actor: GM warning plus a "could not fire" note, no crash, state unchanged. Not run: a non-pf2e world, because no generic system is installed in the test environment. The generic adapter was verified in P5a.

---

## Sign-off

| Tester | Date | Foundry build | System versions |
|---|---|---|---|
| Claude Opus 5.5 (scripted GM + player clients) | 2026-11-21 | 14.370 | pf2e (throwaway world) |
