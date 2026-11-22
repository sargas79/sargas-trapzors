import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMinRank, hazardKind, pickTriggerAction, parseRearmSeconds, rearmDue, rearmRemaining, formatDuration, stripHtml, parseRoutineActions
} from "../scripts/core/hazard-info.js";

test("parseMinRank", () => {
  assert.equal(parseMinRank("<p>(expert)</p>"), 2);
  assert.equal(parseMinRank("(TRAINED)"), 1);
  assert.equal(parseMinRank("<p>(master) to notice</p>"), 3);
  assert.equal(parseMinRank("legendary"), 4);
  assert.equal(parseMinRank(""), 0);
  assert.equal(parseMinRank(null), 0);
  assert.equal(parseMinRank("<p>a trained eye</p>"), 1);
  assert.equal(parseMinRank("untrained"), 0);
});

test("hazardKind priority", () => {
  assert.equal(hazardKind(["haunt", "trap", "magical"]), "haunt");
  assert.equal(hazardKind(["mechanical", "Trap"]), "trap");
  assert.equal(hazardKind(["environmental"]), "environmental");
  assert.equal(hazardKind(["magical"]), "other");
  assert.equal(hazardKind(undefined), "other");
});

test("pickTriggerAction", () => {
  const items = [
    { id: "a", type: "melee", actionType: null },
    { id: "b", type: "action", actionType: "passive" },
    { id: "c", type: "action", actionType: "reaction" },
    { id: "d", type: "action", actionType: "reaction" }
  ];
  assert.equal(pickTriggerAction(items), "c");
  assert.equal(pickTriggerAction(items.slice(0, 2)), "b");
  assert.equal(pickTriggerAction([{ id: "m", type: "melee", actionType: null }]), null);
  assert.equal(pickTriggerAction([]), null);
  assert.equal(pickTriggerAction(undefined), null);
});

test("parseRearmSeconds", () => {
  assert.equal(parseRearmSeconds("<p>Resets after 1 round.</p>"), 6);
  assert.equal(parseRearmSeconds("The trap re-forms after 1 minute"), 60);
  assert.equal(parseRearmSeconds("resets in 10 minutes"), 600);
  assert.equal(parseRearmSeconds("after 1 hour"), 3600);
  assert.equal(parseRearmSeconds("after 24 hours"), 86400);
  assert.equal(parseRearmSeconds("after 2 days"), 172800);
  assert.equal(parseRearmSeconds("after an hour"), 3600);
  assert.equal(parseRearmSeconds("It re-forms the next night"), 86400);
  assert.equal(parseRearmSeconds("at dawn"), 86400);
  assert.equal(parseRearmSeconds("at dusk"), 86400);
  assert.equal(parseRearmSeconds("after 1 minute, or at dawn"), 60);
  assert.equal(parseRearmSeconds("The trap must be reset manually"), null);
  assert.equal(parseRearmSeconds(""), null);
  assert.equal(parseRearmSeconds(null), null);
});

test("rearmDue", () => {
  const base = { status: "spent", rearmSeconds: 60, firedWorldTime: 100, now: 160 };
  assert.equal(rearmDue(base), true);
  assert.equal(rearmDue({ ...base, now: 159 }), false);
  assert.equal(rearmDue({ ...base, status: "armed" }), false);
  assert.equal(rearmDue({ ...base, rearmSeconds: null }), false);
  assert.equal(rearmDue({ ...base, firedWorldTime: null }), false);
});

test("rearmRemaining and formatDuration", () => {
  assert.equal(rearmRemaining({ rearmSeconds: 60, firedWorldTime: 100, now: 130 }), 30);
  assert.equal(rearmRemaining({ rearmSeconds: 60, firedWorldTime: 100, now: 500 }), 0);
  assert.equal(rearmRemaining({ rearmSeconds: null, firedWorldTime: 100, now: 1 }), null);
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(5400), "1h 30m");
  assert.equal(formatDuration(90061), "1d 1h");
  assert.equal(formatDuration(0), "0s");
  assert.equal(stripHtml("<p>a&nbsp;<b>b</b></p>"), "a b");
});

test("parseRoutineActions", () => {
  assert.equal(parseRoutineActions("<p><strong>Routine</strong> (3 actions) The pillar spins.</p>"), 3);
  assert.equal(parseRoutineActions("(1 action) The pit fills."), 1);
  assert.equal(parseRoutineActions("<p>(2&nbsp;actions)</p>".replace("&nbsp;", " ")), 2);
  assert.equal(parseRoutineActions("<p>(<em>3</em> actions)</p>"), null);
  assert.equal(parseRoutineActions("<p>The hazard acts on its initiative.</p>"), null);
  assert.equal(parseRoutineActions("(0 actions)"), null);
  assert.equal(parseRoutineActions(""), null);
  assert.equal(parseRoutineActions(undefined), null);
});
