import { useEffect } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { useSDK } from "../../lib/sdk-context";

/**
 * Listens for moderation events (force-mute, force-camera-off, kick, permission
 * changes) and enforces them on the local participant. The host (isStaff) is
 * never force-controlled — they manage their own devices.
 */
export default function RemoteControlEnforcer({ roomId, identity, isStaff }: { roomId: string; identity: string; isStaff?: boolean }) {
  const sdk = useSDK();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  useEffect(() => {
    return sdk.subscribe(roomId, (event, payload) => {
      if (isStaff) return;                                   // host imune
      if (payload?.user_id && payload.user_id !== identity) return;  // alvo específico
      if (!localParticipant) return;
      if (event === "force-mute") localParticipant.setMicrophoneEnabled(false);
      if (event === "force-unmute") localParticipant.setMicrophoneEnabled(true);
      if (event === "force-camera-off") localParticipant.setCameraEnabled(false);
      if (event === "force-kick") room?.disconnect();
      if (event === "permissions-updated") {
        if (payload.allow_camera === false) localParticipant.setCameraEnabled(false);
        if (payload.allow_mic === false) localParticipant.setMicrophoneEnabled(false);
        if (payload.allow_screen_share === false) localParticipant.setScreenShareEnabled(false);
      }
    });
  }, [roomId, identity, isStaff, localParticipant, room]);

  return null;
}
