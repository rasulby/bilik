import { timingSafeEqual } from "node:crypto";
export function verifyPassword(input, expected) {
  if (typeof input !== "string" || input.length > 200) return false;
  const a = Buffer.from(input),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
