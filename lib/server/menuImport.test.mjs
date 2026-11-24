import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedPhoto, cleanMenu } from "./menuImport.js";

test("AI menu answers are cleaned: prices, variants, empty sections and bad rows dropped", () => {
  const out = cleanMenu({
    is_menu: true,
    sections: [
      {
        name: "  Burgers ",
        group: "Kitchen",
        items: [
          { name: "Beef Please!", description: "  ", price: 690, variants: [], is_veg: false, photo_query: "beef burger" },
          { name: "Panier Gajak", description: null, price: 350, variants: [{ name: "6pc", price: 350 }, { name: "12pc", price: 650 }, { name: "", price: 1 }], is_veg: null, photo_query: "" },
          { name: "No price", description: null, price: null, variants: [], is_veg: null, photo_query: "x" },
        ],
      },
      { name: "Empty", group: "Bar", items: [] },
    ],
  });
  assert.equal(out.sections.length, 1);
  assert.equal(out.sections[0].name, "Burgers");
  assert.deepEqual(out.sections[0].items.map((i) => [i.name, i.price, i.variants.length, i.description, i.photo_query]), [
    ["Beef Please!", 690, 0, null, "beef burger"],
    ["Panier Gajak", null, 2, null, "Panier Gajak"],
  ]);
  assert.equal(cleanMenu({ is_menu: false, sections: [] }).is_menu, false);
});

test("only Pexels image addresses can be downloaded", () => {
  assert.equal(allowedPhoto("https://images.pexels.com/photos/1/a.jpeg?w=800"), true);
  assert.equal(allowedPhoto("http://images.pexels.com/x.jpg"), false);
  assert.equal(allowedPhoto("https://169.254.169.254/latest"), false);
  assert.equal(allowedPhoto("https://images.pexels.com.evil.com/x.jpg"), false);
});
