import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { logoFromImage, LOGO_WIDTH } from "./receiptLogo.js";

test("a logo becomes a centred-width ESC/POS raster and a black and white preview", async () => {
  const src = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const out = await logoFromImage(src);
  assert.equal(out.width, LOGO_WIDTH);
  assert.equal(out.height, 192);
  const raster = Buffer.from(out.raster_b64, "base64");
  assert.deepEqual([...raster.subarray(0, 8)], [0x1d, 0x76, 0x30, 0, 48, 0, 192, 0]);
  assert.equal(raster.length, 8 + 48 * 192);
  assert.equal(raster[8], 0xff);
  const meta = await sharp(Buffer.from(out.png_b64, "base64")).metadata();
  assert.deepEqual([meta.width, meta.height], [384, 192]);
});
