import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWaiter } from "./waiters.js";

const list = [{ id: "w1", name: "Anna" }, { id: "w2", name: "Ravi" }];

test("a waiter is always recorded as themselves; others must pick a real waiter", () => {
  assert.deepEqual(pickWaiter(list, { callerId: "w2", callerIsWaiter: true, waiterId: "w1" }).waiter, list[1]);
  assert.deepEqual(pickWaiter(list, { callerId: "c1", callerIsWaiter: false, waiterId: "w1" }).waiter, list[0]);
  assert.match(pickWaiter(list, { callerId: "c1", callerIsWaiter: false }).error, /Pick the waiter/);
  assert.match(pickWaiter(list, { callerId: "c1", callerIsWaiter: false, waiterId: "c1" }).error, /not on your staff/);
  assert.equal(pickWaiter([], { callerId: "c1", callerIsWaiter: false }).waiter, null);
});
