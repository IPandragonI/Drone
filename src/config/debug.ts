/**
 * Debug hooks (window.__session, window.__audio, teleport) exist for end-to-end tests only.
 * They are available in development and in builds made with NEXT_PUBLIC_ENABLE_DEBUG=1; a normal production build ignores `?debug=1`,
 * so nobody can teleport through missions on the deployed site.
 */
export const DEBUG_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEBUG === "1" || process.env.NODE_ENV !== "production";
