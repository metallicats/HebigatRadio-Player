import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDlnaDeviceListener, startDlnaDiscovery, stopDlnaDiscovery } from '../../modules/dlna-cast';
import {
  fetchDeviceDescription,
  getDlnaVolume,
  playDlna,
  setDlnaVolume,
  setTransportUri,
  stopDlna,
  type UpnpDevice,
} from '@/dlna/upnpClient';
import type { Player } from '@/hooks/usePlayer';
import type { StationApi } from '@/lib/api';

export interface DlnaMeta {
  stationName?: string;
  djName?: string;
}

export function useDlna(api: StationApi | null, local: Player, meta: DlnaMeta, streamFormat?: import('@/lib/streamFormat').StreamFormat) {
  const [devices, setDevices] = useState<UpnpDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<UpnpDevice | null>(null);
  const [dlnaTunedIn, setDlnaTunedIn] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const localRef = useRef(local);
  useEffect(() => { localRef.current = local; }, [local]);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  // Keep the stream format in a ref so connectDevice/tune closures always
  // read the latest selection without needing to be recreated.
  const streamFormatRef = useRef(streamFormat);
  useEffect(() => { streamFormatRef.current = streamFormat; }, [streamFormat]);

  const startScan = useCallback(() => {
    setDevices([]);
    startDlnaDiscovery();
  }, []);

  const addManualDevice = useCallback(async (ipOrUrl: string) => {
    let url = ipOrUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Common Denon HEOS DLNA endpoint: port 60006
      url = `http://${url}:60006/upnp/desc/aios_device/aios_device.xml`;
    }
    const dev = await fetchDeviceDescription(url);
    if (dev) {
      setDevices((prev) => (prev.some((d) => d.id === dev.id) ? prev : [...prev, dev]));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const sub = addDlnaDeviceListener(async (event) => {
      const dev = await fetchDeviceDescription(event.location);
      if (dev) {
        setDevices((prev) => {
          if (prev.some((d) => d.id === dev.id)) return prev;
          return [...prev, dev];
        });
      }
    });
    return () => {
      sub?.remove();
      stopDlnaDiscovery();
    };
  }, []);

  const connectDevice = useCallback(
    async (device: UpnpDevice) => {
      setActiveDevice(device);
      const curVol = await getDlnaVolume(device);
      if (curVol !== null) setVolume(curVol);

      if (localRef.current.tunedIn && apiRef.current) {
        localRef.current.stop();
        setDlnaTunedIn(true);
        try {
          await setTransportUri(device, apiRef.current.streamUrl(streamFormatRef.current), {
            title: metaRef.current.stationName,
            artist: metaRef.current.djName,
          });
          await playDlna(device);
        } catch {
          setDlnaTunedIn(false);
        }
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    if (activeDevice && dlnaTunedIn) {
      stopDlna(activeDevice).catch(() => {});
    }
    const wasTuned = dlnaTunedIn;
    setActiveDevice(null);
    setDlnaTunedIn(false);
    if (wasTuned) {
      localRef.current.tune();
    }
  }, [activeDevice, dlnaTunedIn]);

  const tune = useCallback(async () => {
    if (!activeDevice || !apiRef.current) return;
    if (dlnaTunedIn) {
      await stopDlna(activeDevice).catch(() => {});
      setDlnaTunedIn(false);
      return;
    }
    setDlnaTunedIn(true);
    try {
      await setTransportUri(activeDevice, apiRef.current.streamUrl(streamFormatRef.current), {
        title: metaRef.current.stationName,
        artist: metaRef.current.djName,
      });
      await playDlna(activeDevice);
    } catch {
      setDlnaTunedIn(false);
    }
  }, [activeDevice, dlnaTunedIn]);

  const stop = useCallback(() => {
    if (activeDevice) stopDlna(activeDevice).catch(() => {});
    setDlnaTunedIn(false);
  }, [activeDevice]);

  const setDlnaVol = useCallback(
    (v: number) => {
      setVolume(v);
      if (activeDevice) setDlnaVolume(activeDevice, v).catch(() => {});
    },
    [activeDevice],
  );

  const player: Player = useMemo(
    () =>
      activeDevice
        ? {
            tunedIn: dlnaTunedIn || local.tunedIn,
            status: dlnaTunedIn ? 'playing' : 'idle',
            volume,
            setVolume: setDlnaVol,
            tune,
            stop,
            toggleMute: () => setDlnaVol(volume > 0 ? 0 : 0.5),
            muted: volume === 0,
          }
        : local,
    [activeDevice, dlnaTunedIn, local, volume, setDlnaVol, tune, stop],
  );

  return {
    player,
    dlna: {
      connected: !!activeDevice,
      deviceName: activeDevice?.friendlyName ?? null,
      devices,
      startScan,
      connectDevice,
      disconnect,
      addManualDevice,
    },
  };
}
