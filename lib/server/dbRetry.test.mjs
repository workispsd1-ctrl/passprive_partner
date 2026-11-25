import { test } from "node:test";
import assert from "node:assert/strict";
import { readRetry } from "./dbRetry.js";

const thenable = (value) => ({ then: (ok) => Promise.resolve(value).then(ok) });

test("works with query builders that only have then(), retries errors, gives up with null", async () => {
  assert.deepEqual(await readRetry(() => thenable({ data: 1, error: null })), { data: 1, error: null });
  let n = 0;
  const flaky = () => thenable(++n < 2 ? { data: null, error: { code: "PGRST002" } } : { data: 2, error: null });
  assert.equal((await readRetry(flaky)).data, 2);
  assert.equal(await readRetry(() => thenable({ data: null, error: { code: "x" } }), 2), null);
  assert.equal(await readRetry(() => { throw new Error("boom"); }, 1), null);
});
