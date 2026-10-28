import { domainEvents, domainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { TAB_ID } from './clock';
import { DISPLAY_NAME } from './identity';
import { emptyData, mergeData, rebuildIndexes, type DomainData } from './ops';
import { createBroadcastTransport, type Envelope } from './sync';

// App wiring for "real-time": BroadcastChannel transport, the join handshake,
// presence, localStorage persistence, and turning domain events into toasts.
// Called once from main.tsx — kept out of React so StrictMode's double effects
// can't open two channels.

const STORAGE_KEY = 'weave-data-v2';
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

function loadFromStorage(): DomainData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return rebuildIndexes({ ...emptyData(), ...(JSON.parse(raw) as Partial<DomainData>) });
  } catch {
    return null;
  }
}

function saveToStorage(data: DomainData) {
  try {
    // Derived indexes are rebuilt on load, so only entities are stored.
    const { boards, columns, cards, comments } = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ boards, columns, cards, comments }));
  } catch {
    // Quota exceeded or storage blocked: the app keeps working in memory.
  }
}

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

  const local = loadFromStorage();
  if (local) domainStore.getState().replaceData(local);

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
    // Live peers are more current than our localStorage copy (which may predate
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

  window.addEventListener('pagehide', () => {
    transport.post({ kind: 'bye', from: TAB_ID });
  });

  // Debounced persistence: only when entity tables actually change (history
  // or other non-data updates don't trigger a write).
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = domainStore.subscribe((state, prev) => {
    if (!hydrated) return;
    if (
      state.boards === prev.boards &&
      state.columns === prev.columns &&
      state.cards === prev.cards &&
      state.comments === prev.comments
    ) {
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveToStorage(pickData()), 300);
  });

  const unwire = wireDomainToasts();

  return () => {
    clearInterval(heartbeat);
    unsubscribe();
    unwire();
    transport.close();
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
