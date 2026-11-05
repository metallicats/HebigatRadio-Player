import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDlnaDeviceListener,
  startDlnaDiscovery,
  startFlacRelay,
  stopDlnaDiscovery,
  stopFlacRelay,
} from '../../modules/dlna-cast';
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

/** Host part of an http(s) URL, without relying on a full URL polyfill. */
function hostOf(url: string): string {
  const m = /^https?:\/\/\[?([^\]/:]+)/i.exec(url);
  return m ? m[1] : '';
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

  /** Point `device` at the station in the selected format and start it.
   *  FLAC goes through the on-phone relay: the station serves Ogg-FLAC, which
   *  the Denon cannot open, and the relay re-serves it as native FLAC. */
  const castTo = useCallback(async (device: UpnpDevice) => {
    const api = apiRef.current;
    if (!api) throw new Error('No station');
    const format = streamFormatRef.current ?? 'mp3';
    const upstream = api.streamUrl(format);
    let url = upstream;
    let mime = 'audio/mpeg';
    if (format === 'flac') {
      url = await startFlacRelay(upstream, api.streamHeaders() ?? {}, hostOf(device.avTransportControlUrl));
      mime = 'audio/flac';
    } else {
      stopFlacRelay();
      if (format === 'aac') mime = 'audio/aac';
      else if (format === 'opus') mime = 'audio/ogg';
    }
    await setTransportUri(
      device,
      url,
      { title: metaRef.current.stationName, artist: metaRef.current.djName },
      mime,
    );
    await playDlna(device);
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
          await castTo(device);
        } catch {
          stopFlacRelay();
          setDlnaTunedIn(false);
        }
      }
    },
    [castTo],
  );

  const disconnect = useCallback(() => {
    if (activeDevice && dlnaTunedIn) {
      stopDlna(activeDevice).catch(() => {});
    }
    stopFlacRelay();
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
      stopFlacRelay();
      setDlnaTunedIn(false);
      return;
    }
    setDlnaTunedIn(true);
    try {
      await castTo(activeDevice);
    } catch {
      stopFlacRelay();
      setDlnaTunedIn(false);
    }
  }, [activeDevice, dlnaTunedIn, castTo]);

  const stop = useCallback(() => {
    if (activeDevice) stopDlna(activeDevice).catch(() => {});
    stopFlacRelay();
    setDlnaTunedIn(false);
  }, [activeDevice]);

  // Don't leave the relay (and its notification) running if the player goes away.
  useEffect(() => () => stopFlacRelay(), []);

  // Ensure local playback never runs simultaneously while a DLNA renderer is
  // active (e.g. if an in-flight local load finished after connectDevice or a
  // lock-screen/headset remote Play triggered localPlayer).
  useEffect(() => {
    if (!activeDevice || !local.tunedIn) return;
    local.stop();
    if (!dlnaTunedIn) {
      setDlnaTunedIn(true);
      castTo(activeDevice).catch(() => {
        stopFlacRelay();
        setDlnaTunedIn(false);
      });
    }
  }, [activeDevice, local, dlnaTunedIn, castTo]);

  // Retune the DLNA renderer if the user switches format while already casting.
  const prevFormatRef = useRef(streamFormat);
  useEffect(() => {
    if (prevFormatRef.current === streamFormat) return;
    prevFormatRef.current = streamFormat;
    if (!activeDevice || !dlnaTunedIn) return;
    castTo(activeDevice).catch(() => {
      stopFlacRelay();
      setDlnaTunedIn(false);
    });
  }, [streamFormat, activeDevice, dlnaTunedIn, castTo]);

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
