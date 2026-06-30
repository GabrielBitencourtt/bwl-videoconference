/**
 * Collaborative whiteboard powered by tldraw.
 * - Loads the persisted document snapshot from the backend on mount.
 * - Syncs incremental document deltas in real time over the room WebSocket.
 * - canEdit=false → "follow" mode: read-only AND the camera is locked to the
 *   host's viewport (the host broadcasts its view; followers track it, like a
 *   screen broadcast). No edits, no broadcast, no persist.
 * - readOnly (recording view): passive viewer that also follows the host's view.
 */
import { useCallback, useRef } from "react";
import { Tldraw, Box, type Editor, type TLRecord, type TLRecordId } from "tldraw";
import "tldraw/tldraw.css";
import { useSDK } from "../../lib/sdk-context";

export default function Whiteboard({
  roomId, readOnly = false, canEdit = true, isHost = false,
}: { roomId: string; readOnly?: boolean; canEdit?: boolean; isHost?: boolean }) {
  const sdk = useSDK();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const following = !readOnly && !canEdit;   // segue o host (sem editar)
  const passive = readOnly || following;     // não desenha nem transmite deltas

  const onMount = useCallback((editor: Editor) => {
    if (passive) editor.updateInstanceState({ isReadonly: true });
    let applyingRemote = false;
    let lastCam = "";

    const applyView = (b: any) => {
      if (!b) return;
      try { editor.zoomToBounds(new Box(b.x, b.y, b.w, b.h), { inset: 0, force: true }); } catch {}
    };
    const sendCam = () => {
      try {
        const b = editor.getViewportPageBounds();
        conn.send("wb-camera", { x: b.x, y: b.y, w: b.w, h: b.h });
      } catch {}
    };

    // 1) Initial document load.
    sdk.whiteboard.get(roomId).then(({ state }) => {
      if (state && state.store && Object.keys(state.store).length > 0) {
        try { editor.store.loadStoreSnapshot(state); } catch (e) { console.warn("wb load", e); }
      }
    }).catch(() => {});

    // 2) Real-time channel.
    const conn = sdk.connect(roomId, (event, payload) => {
      if (event === "wb-delta") {
        applyingRemote = true;
        try {
          editor.store.mergeRemoteChanges(() => {
            if (payload.put?.length) editor.store.put(payload.put as TLRecord[]);
            if (payload.remove?.length) editor.store.remove(payload.remove as TLRecordId[]);
          });
        } catch (e) { console.warn("wb merge", e); }
        finally { applyingRemote = false; }
      } else if (event === "wb-sync-request" && !passive) {
        conn.send("wb-delta", { put: editor.store.allRecords(), remove: [] });
      } else if (event === "wb-camera" && passive) {
        applyView(payload);                         // segue a câmera do host
      } else if (event === "wb-camera-request" && isHost) {
        sendCam();
      }
    });

    conn.send("wb-sync-request", {});

    // 3) Followers/recorder: lock the camera and request the host's current view.
    if (passive) {
      if (following) {
        try { editor.setCameraOptions({ ...editor.getCameraOptions(), isLocked: true }); } catch {}
      }
      conn.send("wb-camera-request", {});
      return () => { conn.close(); };
    }

    // 4) Editors: broadcast document deltas + debounced persist.
    const unlisten = editor.store.listen(
      (entry) => {
        if (applyingRemote) return;
        const { added, updated, removed } = entry.changes;
        const put = [
          ...Object.values(added),
          ...Object.values(updated).map((u) => u[1]),
        ] as TLRecord[];
        const remove = Object.keys(removed) as TLRecordId[];
        if (put.length || remove.length) conn.send("wb-delta", { put, remove });

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          try { sdk.whiteboard.save(roomId, editor.store.getStoreSnapshot() as any).catch(() => {}); } catch {}
        }, 1000);
      },
      { source: "user", scope: "document" },
    );

    // 5) Host: transmit the viewport so followers track it (like a screen share).
    let camTimer: ReturnType<typeof setInterval> | null = null;
    if (isHost) {
      sendCam();
      camTimer = setInterval(() => {
        const c = editor.getCamera();
        const key = `${Math.round(c.x)},${Math.round(c.y)},${c.z.toFixed(3)}`;
        if (key !== lastCam) { lastCam = key; sendCam(); }
      }, 120);
    }

    return () => {
      unlisten();
      conn.close();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (camTimer) clearInterval(camTimer);
    };
  }, [roomId, readOnly, canEdit, isHost]);

  return (
    <div className="vr-wb">
      {/* key força remontar quando a permissão de edição muda ao vivo */}
      <Tldraw key={`${roomId}-${canEdit ? "e" : "f"}`} onMount={onMount} hideUi={readOnly || following} />
    </div>
  );
}
