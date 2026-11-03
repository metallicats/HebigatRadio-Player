// AirPlay, Cast and DLNA outputs.

import { AudioLines, ChevronRight, Info, MoonStar, Palette, Radio } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { CastButton } from 'react-native-google-cast';
import AirplayButton from '../../../modules/airplay-route-picker';
import { fmtTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeContext';

export interface BackPanelDrawerProps {
  castAvailable: boolean;
  /** Cast device name while a session is active, else null. */
  castingTo: string | null;
  dlnaConnected?: boolean;
  dlnaDeviceName?: string | null;
  onOpenDlna?: () => void;
  sleepActive: boolean;
  sleepRemainingSec: number | null;
  themeName: string | null;
  /** Label of the current stream format pick, or null to hide the SIGNAL row
   *  when there is nothing to choose. */
  formatLabel: string | null;
  onOpenSleep: () => void;
  onOpenThemes: () => void;
  onOpenFormat: () => void;
  onOpenAbout: () => void;
}

export default function BackPanelDrawer({
  castAvailable,
  castingTo,
  dlnaConnected,
  dlnaDeviceName,
  onOpenDlna,
  sleepActive,
  sleepRemainingSec,
  themeName,
  formatLabel,
  onOpenSleep,
  onOpenThemes,
  onOpenFormat,
  onOpenAbout,
}: BackPanelDrawerProps) {
  const { colors } = useTheme();

  return (
    <View>
      <View style={{ marginBottom: 18 }}>
        <SectionLabel text="OUTPUT" />
        <View className="flex-row" style={{ gap: 12, marginTop: 8 }}>
          {Platform.OS === 'ios' ? (
            <Socket label="AIRPLAY" sub="HomePod · Apple TV">
              <AirplayButton
                tint={colors.ink}
                activeTint={colors.accent}
                style={{ width: 30, height: 30 }}
              />
            </Socket>
          ) : null}
          {castAvailable ? (
            <Socket
              label="CAST"
              sub={castingTo ? `→ ${castingTo}` : 'Chromecast · TV'}
              active={!!castingTo}
            >
              <CastButton
                style={{ width: 30, height: 30, tintColor: castingTo ? colors.accent : colors.ink }}
              />
            </Socket>
          ) : null}
          <Socket
            label="DLNA"
            sub={dlnaDeviceName ? `→ ${dlnaDeviceName}` : 'Denon · UPnP'}
            active={!!dlnaConnected}
            onPress={onOpenDlna}
          >
            <Radio size={22} color={dlnaConnected ? colors.accent : colors.ink} />
          </Socket>
        </View>
      </View>

      <SectionLabel text="TIMER" />
      <PanelRow
        icon={<MoonStar size={18} color={sleepActive ? colors.accent : colors.muted} />}
        title="Sleep timer"
        value={sleepActive ? `${fmtTime(sleepRemainingSec)} left` : 'Off'}
        valueAccent={sleepActive}
        onPress={onOpenSleep}
      />

      {formatLabel != null ? (
        <>
          <View style={{ height: 14 }} />
          <SectionLabel text="SIGNAL" />
          <PanelRow
            icon={<AudioLines size={18} color={colors.muted} />}
            title="Stream format"
            value={formatLabel}
            onPress={onOpenFormat}
          />
        </>
      ) : null}

      <View style={{ height: 14 }} />

      <SectionLabel text="FASCIA" />
      <PanelRow
        icon={<Palette size={18} color={colors.muted} />}
        title="Theme"
        value={themeName ?? 'Station default'}
        onPress={onOpenThemes}
      />

      <View style={{ height: 14 }} />

      <SectionLabel text="ABOUT" />
      <PanelRow
        icon={<Info size={18} color={colors.muted} />}
        title="SUB/WAVE"
        value="Run your own"
        onPress={onOpenAbout}
      />

      <Text
        className="font-mono text-muted"
        style={{ fontSize: 8.5, letterSpacing: 2, textAlign: 'center', marginTop: 26, opacity: 0.7 }}
      >
        MODEL SW-1 · SERIAL ∞ · MADE FOR THE INTERNET
      </Text>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 3, color: colors.muted }}>
      {text}
    </Text>
  );
}

function Socket({
  label,
  sub,
  active,
  onPress,
  children,
}: {
  label: string;
  sub: string;
  active?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={{ alignItems: 'center', width: 104 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderWidth: 1,
          borderColor: active ? colors.accent : `${colors.ink}59`,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? `${colors.accent}14` : colors.field,
        }}
      >
        {children}
      </View>
      <Text
        className="font-mono text-ink"
        style={{ fontSize: 9, letterSpacing: 3, marginTop: 6 }}
      >
        {label}
      </Text>
      <Text
        className="font-mono"
        style={{ fontSize: 8.5, marginTop: 2, color: active ? colors.accent : colors.muted }}
        numberOfLines={1}
      >
        {sub}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

function PanelRow({
  icon,
  title,
  value,
  valueAccent,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  valueAccent?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}`}
      className="flex-row items-center justify-between"
      style={{
        borderWidth: 1,
        borderColor: colors.softBorder,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginTop: 8,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 10 }}>
        {icon}
        <Text className="font-body-semibold text-ink" style={{ fontSize: 14 }}>
          {title}
        </Text>
      </View>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text
          className="font-mono"
          style={{ fontSize: 11, color: valueAccent ? colors.accent : colors.muted }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <ChevronRight size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}
