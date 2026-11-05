import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface SsdpDeviceEvent {
  location: string;
  usn: string;
}

const DlnaCastModule = Platform.OS === 'android' ? requireNativeModule('DlnaCast') : null;

export function startDlnaDiscovery(): void {
  DlnaCastModule?.startDiscovery();
}

export function stopDlnaDiscovery(): void {
  DlnaCastModule?.stopDiscovery();
}

export function addDlnaDeviceListener(callback: (event: SsdpDeviceEvent) => void): EventSubscription | null {
  if (!DlnaCastModule) return null;
  return DlnaCastModule.addListener('onDeviceDiscovered', callback);
}

/** Start the on-phone relay that re-serves the station's Ogg-FLAC mount as
 *  native FLAC (bit-perfect, no transcoding). Resolves to the URL to hand the
 *  renderer. `rendererHost` picks the phone's Wi-Fi address that reaches it. */
export async function startFlacRelay(
  upstreamUrl: string,
  headers: Record<string, string>,
  rendererHost: string,
): Promise<string> {
  if (!DlnaCastModule) throw new Error('The FLAC relay is Android-only');
  return DlnaCastModule.startRelay(upstreamUrl, headers, rendererHost);
}

export function stopFlacRelay(): void {
  DlnaCastModule?.stopRelay();
}
