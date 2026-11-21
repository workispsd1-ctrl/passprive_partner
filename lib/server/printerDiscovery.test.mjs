import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFound, isIp } from "./printerDiscovery.js";

test("only real IPv4 printers are kept from a POS scan", () => {
  assert.equal(isIp("192.168.100.103"), true);
  assert.equal(isIp("192.168.100.256"), false);
  assert.equal(isIp("printer.local"), false);
  assert.deepEqual(
    cleanFound(["192.168.8.22", { ip: "192.168.8.22", port: 9100 }, { ip: "10.0.0.5", port: 9101 }, "bad", { ip: "1.2.3.4", port: 70000 }]),
    [{ ip: "192.168.8.22", port: 9100 }, { ip: "10.0.0.5", port: 9101 }]
  );
  assert.equal(cleanFound(Array.from({ length: 100 }, (_, i) => `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`)).length, 64);
});
