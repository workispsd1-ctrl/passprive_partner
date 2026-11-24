import sharp from "sharp";

export const LOGO_WIDTH = 288;
export const LOGO_MAX_HEIGHT = 56;
export const PAPER_DOTS = 576;
const DARK = 200;

export async function logoFromImage(buffer) {
  const { data, info } = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .resize({ width: LOGO_WIDTH, height: LOGO_MAX_HEIGHT, fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = Math.ceil(info.width / 8) * 8;
  const height = info.height;
  const rowBytes = width / 8;
  const bits = Buffer.alloc(rowBytes * height);
  const mono = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width * info.channels + x * info.channels] < DARK) {
        bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        mono[y * width + x] = 0;
      }
    }
  }
  const raster = Buffer.concat([Buffer.from([0x1d, 0x76, 0x30, 0, rowBytes & 0xff, rowBytes >> 8, height & 0xff, height >> 8]), bits]);
  const png = await sharp(mono, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return { width, height, raster_b64: raster.toString("base64"), png_b64: png.toString("base64") };
}

export async function logoStamp(admin, restaurantId) {
  const { data } = await admin.from("restaurant_receipt_logos").select("updated_at").eq("restaurant_id", restaurantId).maybeSingle();
  return data?.updated_at || null;
}
