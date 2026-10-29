// Each seat's mark as SVG stroke path(s) in a 100×100 box, drawn like a pen.
// Seats 0-3 are the originals; every shape is different, so players can be told
// apart by shape as well as colour (including colour-blind players).
export const MARK_PATHS: Record<number, string[]> = {
  // X
  0: ["M24 24 L76 76", "M76 24 L24 76"],
  // O
  1: ["M50 20 A30 30 0 1 1 49.99 20"],
  // triangle
  2: ["M50 20 L82 76 L18 76 Z"],
  // rounded square
  3: ["M26 24 H74 Q76 24 76 26 V74 Q76 76 74 76 H26 Q24 76 24 74 V26 Q24 24 26 24 Z"],
  // diamond
  4: ["M50 18 L82 50 L50 82 L18 50 Z"],
  // plus
  5: ["M50 22 V78", "M22 50 H78"],
  // star
  6: ["M50 18 L58.2 40.7 L82.3 41.5 L63.3 56.3 L70 79.5 L50 66 L30 79.5 L36.7 56.3 L17.7 41.5 L41.8 40.7 Z"],
  // hexagon
  7: ["M50 18 L77.7 34 L77.7 66 L50 82 L22.3 66 L22.3 34 Z"],
  // heart
  8: ["M50 80 C20 58 18 36 34 30 C42 27 48 31 50 38 C52 31 58 27 66 30 C82 36 80 58 50 80 Z"],
  // lightning bolt
  9: ["M58 16 L30 54 H48 L42 84 L70 44 H52 Z"],
  // crescent moon
  10: ["M66 18 A33 33 0 1 0 66 82 A46 46 0 0 1 66 18 Z"],
  // asterisk
  11: ["M50 18 V82", "M22.3 34 L77.7 66", "M22.3 66 L77.7 34"],
};
