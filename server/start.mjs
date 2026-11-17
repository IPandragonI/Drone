import { createRelay, lanAddresses } from "./relay.mjs";

const port = Number(process.env.RELAY_PORT ?? 3101);
const relay = createRelay({ port });
await relay.start();
const lan = lanAddresses();
console.log(`[relay] listening on :${port}`);
console.log(`[relay] LAN addresses: ${lan.length ? lan.join(", ") : "none found"}`);
console.log("[relay] security: LAN only, unencrypted ws://, short-lived random tokens. Do not expose this port to the internet.");
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => relay.close().then(() => process.exit(0)));
