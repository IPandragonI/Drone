import type { SignalMsg } from "./protocol";

/**
 * ICE servers. Empty by default: on a LAN, host candidates are enough and nothing leaves the machine.
 * For use across networks, set NEXT_PUBLIC_ICE_SERVERS to a JSON array of RTCIceServer (STUN/TURN). Untested here.
 */
export function iceServersFromEnv(): RTCIceServer[] {
  try {
    const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as RTCIceServer[]) : [];
  } catch {
    return [];
  }
}

export interface RtcPeerEvents {
  sendSignal: (s: Pick<SignalMsg, "k" | "d">) => void;
  onMessage: (text: string) => void;
  onOpen: (open: boolean) => void;
}

/**
 * One RTCPeerConnection with a single unordered, no-retransmit DataChannel ("ctl") for stick frames: a late stick frame
 * is worthless, so retransmission would only add latency. The host creates the channel and the offer; the pad answers.
 * Signaling travels over the relay WebSocket. Failure at any point just leaves the WebSocket path in use.
 */
export class RtcPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(
    private readonly role: "host" | "pad",
    private readonly ev: RtcPeerEvents,
    iceServers: RTCIceServer[] = iceServersFromEnv(),
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.ev.sendSignal({ k: "ice", d: e.candidate.toJSON() as Record<string, unknown> });
    };
    this.pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(this.pc.connectionState)) this.ev.onOpen(false);
    };
    if (role === "pad") this.pc.ondatachannel = (e) => this.bind(e.channel);
  }

  private bind(ch: RTCDataChannel): void {
    this.channel = ch;
    ch.onopen = () => this.ev.onOpen(true);
    ch.onclose = () => this.ev.onOpen(false);
    ch.onmessage = (e) => typeof e.data === "string" && this.ev.onMessage(e.data);
  }

  /** Host only: create the channel and send the offer. */
  async start(): Promise<void> {
    if (this.role !== "host") return;
    this.bind(this.pc.createDataChannel("ctl", { ordered: false, maxRetransmits: 0 }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const d = this.pc.localDescription;
    if (d) this.ev.sendSignal({ k: "offer", d: { type: d.type, sdp: d.sdp } });
  }

  async handleSignal(s: Pick<SignalMsg, "k" | "d">): Promise<void> {
    if (this.closed) return;
    try {
      if (s.k === "offer" && this.role === "pad") {
        await this.pc.setRemoteDescription({ type: "offer", sdp: String(s.d.sdp ?? "") });
        await this.flushIce();
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        const d = this.pc.localDescription;
        if (d) this.ev.sendSignal({ k: "answer", d: { type: d.type, sdp: d.sdp } });
      } else if (s.k === "answer" && this.role === "host") {
        await this.pc.setRemoteDescription({ type: "answer", sdp: String(s.d.sdp ?? "") });
        await this.flushIce();
      } else if (s.k === "ice") {
        const c = s.d as RTCIceCandidateInit;
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(c);
        else this.pendingIce.push(c);
      }
    } catch {
      this.ev.onOpen(false); // malformed or unsupported signalling: stay on the WebSocket
    }
  }

  private async flushIce(): Promise<void> {
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  /** Send over the data channel; false if it is not open (caller falls back to the WebSocket). */
  send(text: string): boolean {
    const ch = this.channel;
    if (!ch || ch.readyState !== "open" || ch.bufferedAmount > 4096) return false;
    ch.send(text);
    return true;
  }

  get isOpen(): boolean {
    return this.channel?.readyState === "open";
  }

  close(): void {
    this.closed = true;
    this.channel?.close();
    this.pc.close();
  }
}
