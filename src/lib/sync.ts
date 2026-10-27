import type { Stamp } from '../types';
import type { DomainData, Op } from './ops';

// One op on the wire: what changed, when, and a unique id for this write.
export interface Envelope {
  opId: string;
  op: Op;
  stamp: Stamp;
}

export type SyncMessage =
  | { kind: 'op'; from: string; env: Envelope }
  | { kind: 'hello'; from: string } // "I just opened — someone send me the board"
  | { kind: 'snapshot'; from: string; to: string; data: DomainData }
  | { kind: 'presence'; from: string; name: string }
  | { kind: 'bye'; from: string };

// What the domain store needs from "the network". The store applies every
// local op optimistically and then calls send(); if the promise rejects, the
// store rolls the op back. Swapping BroadcastChannel for a WebSocket later
// only means writing another Transport.
export interface Transport {
  send(env: Envelope): Promise<void>;
}

export interface BroadcastTransport extends Transport {
  post(message: SyncMessage): void;
  close(): void;
}

export interface BroadcastOptions {
  channelName: string;
  tabId: string;
  onMessage: (message: SyncMessage) => void;
  // Simulated network conditions. BroadcastChannel itself is synchronous-ish
  // and never fails, which would make "optimistic UI" meaningless — so ops
  // are delayed and can be made to fail, to exercise the rollback path.
  latencyMs?: () => number;
  failureRate?: () => number;
}

export function createBroadcastTransport(options: BroadcastOptions): BroadcastTransport {
  const { channelName, tabId, onMessage } = options;
  const latency = options.latencyMs ?? (() => 60 + Math.random() * 120);
  const failureRate = options.failureRate ?? (() => 0);

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  channel?.addEventListener('message', (event: MessageEvent<SyncMessage>) => {
    const message = event.data;
    if (!message || message.from === tabId) return;
    if (message.kind === 'snapshot' && message.to !== tabId) return;
    onMessage(message);
  });

  return {
    post(message) {
      channel?.postMessage(message);
    },
    send(env) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < failureRate()) {
            reject(new Error('Simulated network failure'));
            return;
          }
          channel?.postMessage({ kind: 'op', from: tabId, env } satisfies SyncMessage);
          resolve();
        }, latency());
      });
    },
    close() {
      channel?.close();
    },
  };
}
