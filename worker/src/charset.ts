export type CharsetTier = "6k" | "24k" | "65k";

import { TIER_24K_CHARS, TIER_6K_CHARS } from "./charset-data.js";

const CHARSET_BY_TIER: Record<Exclude<CharsetTier, "65k">, string> = {
  "6k": TIER_6K_CHARS,
  "24k": TIER_24K_CHARS,
};

function appendMandatoryRanges(set: Set<number>): void {
  for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) {
    set.add(codePoint);
  }
  for (let codePoint = 0x3000; codePoint <= 0x303f; codePoint += 1) {
    set.add(codePoint);
  }
  for (let codePoint = 0xff00; codePoint <= 0xffef; codePoint += 1) {
    set.add(codePoint);
  }
}

export function loadTier(tier: CharsetTier): Set<number> {
  const set = new Set<number>();

  if (tier === "65k") {
    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      set.add(codePoint);
    }
  } else {
    for (const ch of CHARSET_BY_TIER[tier]) {
      const codePoint = ch.codePointAt(0);
      if (codePoint !== undefined) {
        set.add(codePoint);
      }
    }
  }

  appendMandatoryRanges(set);
  return set;
}
