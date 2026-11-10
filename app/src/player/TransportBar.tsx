import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RotaryKnob from './RotaryKnob';
import { SCALE_MAX, type SignalQuality } from '@/hooks/useSignal';
import type { PlayerStatus } from '@/hooks/usePlayer';
import { useTheme } from '@/theme/ThemeContext';

export type TvFocusZone = 'power' | 'mute' | 'tabs' | 'panel';

export interface TransportBarProps {
  tunedIn: boolean;
  status: PlayerStatus;
  onTune: () => void;
  offline: boolean;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  latencyMs: number | null;
  signalQuality: SignalQuality;
  listeners: number | null;
  /** Cast device name while a session is active, else null. Swaps the Signal
   *  label for a "Cast · <device>" read. */
  castingTo?: string | null;
  /** Active TV remote focus target so TV users always see which control OK clicks. */
  tvFocus?: TvFocusZone | null;
}

const QUALITY_LABEL: Record<SignalQuality, string> = {
  offline: 'Offline',
  idle: 'Standby',
  acquiring: 'Acquiring',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const RULER = [0, 50, 100, 150, 200, 250];
const TICKS = 26;

export default function TransportBar({
  tunedIn,
  status,
  onTune,
  offline,
  volume,
  setVolume,
  muted,
  onToggleMute,
  latencyMs,
  signalQuality,
  listeners,
  castingTo,
  tvFocus,
}: TransportBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const isTvMode = Platform.isTV || winW > winH || tvFocus != null;
  const connecting = status === 'connecting';
  const [powerFocused, setPowerFocused] = useState(false);
  const [muteFocused, setMuteFocused] = useState(false);

  const isPowerHighlighted = powerFocused || tvFocus === 'power';
  const isMuteHighlighted = muteFocused || tvFocus === 'mute';

  const gripPct =
    latencyMs != null
      ? Math.min(100, (Math.min(latencyMs, SCALE_MAX) / SCALE_MAX) * 100)
      : signalQuality === 'poor'
        ? 100
        : 2;
  const qualityLabel = QUALITY_LABEL[signalQuality];
  const latencyText = latencyMs != null ? `${latencyMs} ms` : '—';
  const qualityActive = signalQuality !== 'idle' && signalQuality !== 'offline';
  const readout = tunedIn
    ? listeners != null
      ? `${listeners} ♪ · ${latencyText}`
      : latencyText
    : '—';

  const handleTune = () => {
    if (offline) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onTune();
  };
  const handleMute = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggleMute();
  };

  const powerColor = offline ? colors.muted : tunedIn || isPowerHighlighted ? colors.accent : colors.ink;
  const tvButtonProps = Platform.OS === 'android' ? ({ hasTVPreferredFocus: true } as Record<string, unknown>) : {};

  return (
    <View style={{ marginHorizontal: 16, marginBottom: insets.bottom + 12 }}>
      <View style={{ borderWidth: 1, borderColor: `${colors.ink}59`, overflow: 'hidden' }}>
        <BlurView
          intensity={mode === 'light' ? 40 : 26}
          tint={mode === 'light' ? 'light' : 'dark'}
          blurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: mode === 'light' ? 'rgba(255,255,255,0.22)' : `${colors.ink}12` },
          ]}
        />
        <View className="flex-row">
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 13 }}>
            <Pressable
              {...tvButtonProps}
              onPress={handleTune}
              onFocus={() => setPowerFocused(true)}
              onBlur={() => setPowerFocused(false)}
              focusable
              disabled={offline}
              accessibilityRole="button"
              accessibilityLabel={offline ? 'Stream offline' : tunedIn ? 'Tune out' : 'Tune in'}
              accessibilityState={{ disabled: offline, selected: tunedIn }}
              style={{
                minWidth: isTvMode ? 128 : 50,
                height: 50,
                paddingHorizontal: isTvMode ? 14 : 0,
                borderRadius: 25,
                borderWidth: isPowerHighlighted ? 2.5 : 1.5,
                borderColor: powerColor,
                backgroundColor: isPowerHighlighted ? `${colors.accent}2e` : 'transparent',
                flexDirection: 'row',
                 gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: offline ? 0.4 : 1,
                shadowColor: colors.accent,
                shadowOpacity: tunedIn || isPowerHighlighted ? 0.6 : 0,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              {connecting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: powerColor }} />
                  <View
                    style={{ position: 'absolute', top: 0, left: '50%', marginLeft: -1, width: 2, height: 8, backgroundColor: powerColor }}
                  />
                </View>
              )}
              {isTvMode ? (
                <Text
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                    color: powerColor,
                  }}
                >
                  {connecting ? 'WAIT…' : tunedIn ? 'STOP (OK)' : 'PLAY (OK)'}
                </Text>
              ) : null}
            </Pressable>
          </View>

          <View
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.softBorder }}
          >
            <View className="flex-row items-baseline justify-between" style={{ gap: 6 }}>
              <Text className="font-mono text-ink" style={{ fontSize: 10, flexShrink: 1 }} numberOfLines={1}>
                {castingTo ? 'Cast · ' : ''}
                <Text
                  style={{
                    color: castingTo || qualityActive ? colors.accent : colors.muted,
                    fontWeight: '700',
                  }}
                >
                  {castingTo || qualityLabel}
                </Text>
              </Text>
              <Text className="font-mono text-muted" style={{ fontSize: 10 }} numberOfLines={1}>
                {readout}
              </Text>
            </View>

            <View style={{ height: 20, marginTop: 7 }}>
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
                {Array.from({ length: TICKS }).map((_, i) => (
                  <View
                    key={i}
                    style={{ width: 1, backgroundColor: i % 2 === 0 ? colors.muted : colors.softBorder, opacity: i % 2 === 0 ? 0.5 : 1 }}
                  />
                ))}
              </View>
              <View style={{ position: 'absolute', top: -2, bottom: -2, left: `${gripPct}%`, width: 10, marginLeft: -5, alignItems: 'center' }}>
                <View style={{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: colors.accent }} />
                <View
                  style={{
                    position: 'absolute',
                    top: '50%',
                    marginTop: -6.5,
                    width: 10,
                    height: 13,
                    borderRadius: 1,
                    backgroundColor: colors.accent,
                    shadowColor: colors.accent,
                    shadowOpacity: 0.5,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
              </View>
            </View>

            <View className="flex-row justify-between" style={{ marginTop: 4 }}>
              {RULER.map((n) => (
                <Text key={n} className="font-mono text-muted" style={{ fontSize: 8.5 }}>
                  {n}
                </Text>
              ))}
            </View>
          </View>

          <View className="flex-row items-center" style={{ gap: 9, paddingHorizontal: 11, paddingVertical: 13 }}>
            <RotaryKnob value={muted ? 0 : volume} onChange={(v) => { setVolume(v); if (muted) handleMute(); }} />
            <Pressable
              onPress={handleMute}
              onFocus={() => setMuteFocused(true)}
              onBlur={() => setMuteFocused(false)}
              focusable
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Unmute' : 'Mute'}
              accessibilityState={{ selected: muted }}
              style={{
                width: 36,
                height: 36,
                borderWidth: isMuteHighlighted ? 2.5 : 1,
                borderColor: muted || isMuteHighlighted ? colors.accent : colors.muted,
                backgroundColor: muted || isMuteHighlighted ? `${colors.accent}24` : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DotGrille color={muted || isMuteHighlighted ? colors.accent : colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function DotGrille({ color }: { color: string }) {
  return (
    <View style={{ width: 26, height: 26, justifyContent: 'space-between' }}>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2, 3].map((c) => (
            <View key={c} style={{ width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: color }} />
          ))}
        </View>
      ))}
    </View>
  );
}
