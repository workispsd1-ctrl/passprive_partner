import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { logoFromImage } from "./receiptLogo.js";

test("a logo is shrunk to the size of the old name text and becomes an ESC/POS raster", async () => {
  const src = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const out = await logoFromImage(src);
  assert.equal(out.width, 112);
  assert.equal(out.height, 56);
  const raster = Buffer.from(out.raster_b64, "base64");
  assert.deepEqual([...raster.subarray(0, 8)], [0x1d, 0x76, 0x30, 0, 14, 0, 56, 0]);
  assert.equal(raster.length, 8 + 14 * 56);
  assert.equal(raster[8], 0xff);
  const meta = await sharp(Buffer.from(out.png_b64, "base64")).metadata();
  assert.deepEqual([meta.width, meta.height], [112, 56]);
});
