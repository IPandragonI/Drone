/** Live render statistics, written by PerfProbe inside the Canvas and read by the F3 overlay (never through React state). */
export const perfStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
