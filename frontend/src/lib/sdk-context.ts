import { createContext, useContext } from "react";
import type { VideoRoomsSDK } from "./video-rooms-sdk";

export const SDKContext = createContext<VideoRoomsSDK | null>(null);

export function useSDK(): VideoRoomsSDK {
  const sdk = useContext(SDKContext);
  if (!sdk) throw new Error("Wrap your tree in <SDKContext.Provider value={sdk}>");
  return sdk;
}
