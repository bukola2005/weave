import { domainEvents, domainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { TAB_ID } from './clock';
import { DISPLAY_NAME } from './identity';
import { mergeData, type DomainData } from './ops';
import { createBroadcastTransport, type Envelope } from './sync';
import { createLocalStorageBoardApi } from '../api/boardApi';

// App wiring for "real-time": BroadcastChannel transport, the join handshake,
// presence, the persistence API, and turning domain events into toasts.
// Called once from main.tsx — kept out of React so StrictMode's double effects
// can't open two channels.

const CHANNEL = 'weave-sync-v2';
const HEARTBEAT_MS = 4000;
const PEER_TIMEOUT_MS = 10_000;

const pickData = (): DomainData => {
  const s = domainStore.getState();
  return {
    boards: s.boards,
    columns: s.columns,
    cards: s.cards,
    comments: s.comments,
    commentsByCard: s.commentsByCard,
  };
};

export function startRealtime({ handshakeMs = 300 }: { handshakeMs?: number } = {}) {
  const ui = useUIStore.getState;
  const peers = new Map<string, number>();
  const snapshots: DomainData[] = [];
  const pendingOps: Envelope[] = [];
  let hydrated = false;

  const markPeer = (id: string) => {
    peers.set(id, Date.now());
    ui().setPeerCount(peers.size);
  };

  // Persistence goes through the API (a localStorage mock for now). The store
  // only calls it for confirmed ops; nothing here writes storage directly.
  const api = createLocalStorageBoardApi();
  domainStore.getState().setApi(api);
  void api.loadWorkspace().then((saved) => {
    // Peers may already have answered; their snapshot wins (see below).
    if (saved && !hydrated && snapshots.length === 0) domainStore.getState().replaceData(saved);
  });

  const transport = createBroadcastTransport({
    channelName: CHANNEL,
    tabId: TAB_ID,
    failureRate: () => (ui().simulateFailures ? 0.35 : 0),
    onMessage: (message) => {
      switch (message.kind) {
        case 'op':
          // Ops that arrive mid-handshake are replayed after the snapshot
          // merge, otherwise they'd be overwritten by an older snapshot.
          if (hydrated) domainStore.getState().receive(message.env);
          else pendingOps.push(message.env);
          break;
        case 'hello':
          markPeer(message.from);
          // Only a hydrated tab's state is worth sending to a newcomer.
          if (hydrated) transport.post({ kind: 'snapshot', from: TAB_ID, to: message.from, data: pickData() });
          transport.post({ kind: 'presence', from: TAB_ID, name: DISPLAY_NAME });
          break;
        case 'snapshot':
          markPeer(message.from);
          if (!hydrated) snapshots.push(message.data);
          break;
        case 'presence':
          markPeer(message.from);
          break;
        case 'bye':
          peers.delete(message.from);
          ui().setPeerCount(peers.size);
          break;
      }
    },
  });

  domainStore.getState().setTransport(transport);
  transport.post({ kind: 'hello', from: TAB_ID });

  setTimeout(() => {
    // Live peers are more current than our saved copy (which may predate
    // a delete). Snapshots have no tombstones, so union-ing them with stale
    // storage could resurrect deleted cards — prefer peers when any answered.
    if (snapshots.length > 0) {
      domainStore.getState().replaceData(snapshots.reduce(mergeData));
    }
    hydrated = true;
    for (const env of pendingOps.splice(0)) domainStore.getState().receive(env);
    ui().setHydrated(true);
  }, handshakeMs);

  // Presence heartbeat + pruning of tabs that closed without saying bye.
  const heartbeat = setInterval(() => {
    transport.post({ kind: 'presence', from: TAB_ID, name: DISPLAY_NAME });
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    for (const [id, seen] of peers) if (seen < cutoff) peers.delete(id);
    ui().setPeerCount(peers.size);
  }, HEARTBEAT_MS);

  const onPageHide = () => {
    transport.post({ kind: 'bye', from: TAB_ID });
    api.flush(); // don't lose a write still sitting in the debounce
  };
  window.addEventListener('pagehide', onPageHide);

  const unwire = wireDomainToasts();

  return () => {
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', onPageHide);
    unwire();
    transport.close();
    api.flush();
  };
}

export function wireDomainToasts() {
  return domainEvents.subscribe((event) => {
    const { pushToast, announce } = useUIStore.getState();
    switch (event.type) {
      case 'rollback': {
        // Only fires when a send actually fails. Today that's only the
        // "Simulate flaky sync" toggle, so name it when it's the cause.
        const what = event.label.charAt(0).toUpperCase() + event.label.slice(1);
        const why = useUIStore.getState().simulateFailures
          ? '“Simulate flaky sync” is on. Try again, or turn it off.'
          : 'Try again.';
        pushToast({ tone: 'error', message: `${what} didn’t sync, so it was undone in this tab. ${why}` });
        break;
      }
      case 'conflict':
        pushToast({
          tone: 'info',
          message: `Another tab edited ${event.label} at the same time. The most recent change was kept.`,
        });
        break;
      case 'undo':
        announce(`Undid: ${event.label}`);
        pushToast({ tone: 'info', message: `Undid: ${event.label}` }, 3000);
        break;
      case 'redo':
        announce(`Redid: ${event.label}`);
        pushToast({ tone: 'info', message: `Redid: ${event.label}` }, 3000);
        break;
      case 'history-stale':
        pushToast({
          tone: 'error',
          message: `Couldn’t undo/redo ${event.label} — it was changed or deleted in another tab.`,
        });
        break;
      case 'card-deleted':
        pushToast({
          tone: 'success',
          message: `Deleted ${event.label}.`,
          action: { label: 'Undo', run: () => domainStore.getState().undo() },
        });
        break;
    }
  });
}
