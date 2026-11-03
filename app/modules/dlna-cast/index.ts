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
