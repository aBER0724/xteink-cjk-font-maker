import opentype from "opentype.js";

export function buildTestFontBytes(): Uint8Array {
  const path = new opentype.Path();
  path.moveTo(100, 0);
  path.lineTo(900, 0);
  path.lineTo(900, 800);
  path.lineTo(100, 800);
  path.close();

  const glyphA = new opentype.Glyph({
    name: "A",
    unicode: 0x41,
    advanceWidth: 1000,
    path,
  });

  const glyphSpace = new opentype.Glyph({
    name: "space",
    unicode: 0x20,
    advanceWidth: 500,
    path: new opentype.Path(),
  });

  const font = new opentype.Font({
    familyName: "TestFont",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 900,
    descender: -100,
    glyphs: [glyphSpace, glyphA],
  });

  return new Uint8Array(font.toArrayBuffer());
}
