import test from "node:test";
import assert from "node:assert/strict";
import { decideMoverAction, decideAuthorityAction } from "../scripts/core/trigger-decisions.js";

const mover = { isSelf: true, hasActiveGM: true, eligible: true, canTrigger: true };
test("mover stops only when every condition holds", () => {
  assert.equal(decideMoverAction(mover), "stop");
  for (const key of Object.keys(mover)) {
    assert.equal(decideMoverAction({ ...mover, [key]: false }), "none", key);
  }
});

const auth = { isActiveGM: true, tokenExists: true, insideRegion: true, eligible: true, canTrigger: true, isDuplicate: false };
test("authority queues when valid", () => {
  assert.deepEqual(decideAuthorityAction(auth), { action: "queue", reason: "ok" });
});
test("authority ignore branches", () => {
  const cases = [
    [{ isActiveGM: false }, "not-authority"],
    [{ tokenExists: false }, "token-missing"],
    [{ insideRegion: false }, "outside-region"],
    [{ eligible: false }, "ineligible"],
    [{ canTrigger: false }, "not-triggerable"],
    [{ isDuplicate: true }, "duplicate"]
  ];
  for (const [patch, reason] of cases) {
    assert.deepEqual(decideAuthorityAction({ ...auth, ...patch }), { action: "ignore", reason });
  }
});
test("authority reason precedence", () => {
  assert.equal(decideAuthorityAction({ ...auth, isActiveGM: false, tokenExists: false }).reason, "not-authority");
  assert.equal(decideAuthorityAction({ ...auth, eligible: false, isDuplicate: true }).reason, "ineligible");
});
