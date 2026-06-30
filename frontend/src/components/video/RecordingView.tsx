/**
 * Egress recording template — egress launches headless Chrome on this page and
 * records exactly what it shows. It mirrors the meeting stage (participant
 * videos + screen share + the live whiteboard), so the recording captures
 * everything that happened, like a screen recording of the call.
 *
 * Egress passes the LiveKit url/token as query params (read via EgressHelper)
 * and our backend adds ?roomDbId=...&wb=0|1 so we can sync the whiteboard.
 */
import { useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom, GridLayout, ParticipantTile, useTracks, RoomAudioRenderer,
} from "@livekit/components-react";
import { Room, Track, RoomEvent } from "livekit-client";
import EgressHelper from "@livekit/egress-sdk";
import "@livekit/components-styles";
import "../../styles/room.css";
import { createVideoRoomsSDK, type VideoRoomsSDK } from "../../lib/video-rooms-sdk";
import { SDKContext } from "../../lib/sdk-context";
import Whiteboard from "./Whiteboard";

function RecGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

export default function RecordingView() {
  const params = new URLSearchParams(location.search);
  const roomDbId = params.get("roomDbId") || "";
  const [showBoard, setShowBoard] = useState(params.get("wb") === "1");

  const url = EgressHelper.getLiveKitURL();
  const token = EgressHelper.getAccessToken();

  const room = useMemo(() => new Room({ adaptiveStream: false, dynacast: false }), []);
  const sdk = useMemo<VideoRoomsSDK>(
    () =>
      createVideoRoomsSDK({
        apiBase: import.meta.env.VITE_API_BASE || "",
        wsBase: import.meta.env.VITE_WS_BASE || "",
        headers: () => ({}),
      }),
    [],
  );

  // Signal egress once connected.
  useEffect(() => {
    const onConn = () => {
      EgressHelper.setRoom(room);
      EgressHelper.startRecording();
    };
    room.on(RoomEvent.Connected, onConn);
    return () => {
      room.off(RoomEvent.Connected, onConn);
    };
  }, [room]);

  // Show/hide the whiteboard as the presenter toggles it during the call.
  useEffect(() => {
    if (!roomDbId) return;
    return sdk.subscribe(roomDbId, (event, payload) => {
      if (event === "whiteboard-toggle") setShowBoard(!!payload.active);
    });
  }, [roomDbId]);

  return (
    <SDKContext.Provider value={sdk}>
      <LiveKitRoom room={room} serverUrl={url} token={token} connect audio={false} video={false} className="vr-root">
        <div className="vr-stage" style={{ padding: 8 }}>
          <div className="vr-grid-wrap">
            <RecGrid />
            {showBoard && roomDbId && (
              <div className="vr-wb-overlay">
                <Whiteboard roomId={roomDbId} readOnly />
              </div>
            )}
          </div>
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
    </SDKContext.Provider>
  );
}
