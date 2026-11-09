import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as Updates from 'expo-updates';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Code,
  FileText,
  Radio,
  Share2,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { PROJECT_LINKS, openExternal } from '@/lib/links';
import { playbackLog, playbackLogReport, type PlaybackLogSource } from '@/lib/playback-log';
import { useTheme } from '@/theme/ThemeContext';

const BANNER_IMAGE = require('../../../assets/hebigat-banner.jpg');

const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 Parminder Klair (SUB/WAVE original project)
Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)
Modifications & DLNA Lossless FLAC Relay Copyright (c) 2026 Hebigat Radio / Dida's Kitchen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const OPEN_SOURCE_CREDITS = [
  { name: 'SUB/WAVE', license: 'MIT', desc: 'Original open-source internet radio station & mobile client architecture by Parminder Klair' },
  { name: 'Expo & React Native', license: 'MIT', desc: 'Cross-platform native mobile runtime, navigation, and device APIs' },
  { name: 'React Native Track Player', license: 'Apache-2.0', desc: 'Background media session, lock-screen controls, and ExoPlayer audio engine' },
  { name: 'react-native-google-cast', license: 'MIT', desc: 'Google Cast / Chromecast discovery and remote media session control' },
  { name: 'React Native Skia & Reanimated', license: 'MIT', desc: '60fps GPU-accelerated animations and graphics' },
  { name: 'NativeWind & Tailwind CSS', license: 'MIT', desc: 'Utility-first styling for React Native' },
  { name: 'Lucide Icons', license: 'ISC', desc: 'Vector iconography' },
] as const;

const stripProto = (u: string) => u.replace(/^https?:\/\//, '');

function appSource(): PlaybackLogSource {
  const id = Updates.updateId?.slice(0, 8);
  const bundle = Updates.isEnabled && id
    ? [`${Updates.isEmbeddedLaunch ? 'built-in' : 'OTA'} ${id}`, Updates.channel].filter(Boolean).join(', ')
    : null;
  return {
    version: Constants.expoConfig?.version ?? 'unknown',
    bundle,
    platform: Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS,
    osVersion: Platform.OS === 'android'
      ? `${Platform.constants.Release} (API ${Platform.Version})`
      : String(Platform.Version),
  };
}

function sharePlaybackLog() {
  Share.share(
    { title: 'Hebigat Radio playback log', message: playbackLogReport(appSource(), playbackLog.lines()) },
    { dialogTitle: 'Share playback log', subject: 'Hebigat Radio playback log' },
  ).catch(() => {});
}

export interface AboutDrawerProps {
  onAddStation: () => void;
  initialShowLicenses?: boolean;
}

export default function AboutDrawer({ onAddStation, initialShowLicenses = false }: AboutDrawerProps) {
  const { colors } = useTheme();
  const [showLicenses, setShowLicenses] = useState(initialShowLicenses);

  return (
    <View>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.softBorder,
          overflow: 'hidden',
          marginBottom: 14,
          backgroundColor: '#0b101b',
        }}
      >
        <Image
          source={BANNER_IMAGE}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          contentFit="cover"
          accessibilityLabel="Hebigat Radio — The Philippines' First & Only Lossless Stream"
        />
      </View>

      <Text className="font-body text-ink" style={{ fontSize: 14, fontWeight: '600', lineHeight: 20 }}>
        The Philippines&apos; First &amp; Only Lossless Stream
      </Text>
      <Text className="font-body text-muted" style={{ fontSize: 13, lineHeight: 21, marginTop: 6 }}>
        Hebigat Radio broadcasts 100% lossless Hi-Fi audio — 90s Alternative, Rock, Pop, New Wave,
        and Dance — live from radio.didaskitchen.com, with gapless bit-perfect FLAC streaming and
        DLNA/UPnP receiver casting.
      </Text>

      <Pressable
        onPress={() => openExternal(PROJECT_LINKS.station)}
        accessibilityRole="link"
        accessibilityLabel="Visit radio.didaskitchen.com"
        className="flex-row items-center justify-center"
        style={{ gap: 8, marginTop: 14, backgroundColor: colors.accent, paddingVertical: 14 }}
      >
        <Radio size={16} color="#fff" />
        <Text className="font-body-semibold" style={{ color: '#fff', fontSize: 14, letterSpacing: 0.3 }}>
          Listen live at radio.didaskitchen.com
        </Text>
      </Pressable>

      <Pressable
        onPress={onAddStation}
        accessibilityRole="button"
        accessibilityLabel="Switch or add another station"
        className="flex-row items-center justify-center"
        style={{ gap: 8, marginTop: 8, paddingVertical: 13, borderWidth: 1, borderColor: colors.muted, borderStyle: 'dashed' }}
      >
        <Text className="text-accent" style={{ fontSize: 18, fontWeight: '700', lineHeight: 18 }}>
          +
        </Text>
        <Text className="font-mono text-ink" style={{ fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' }}>
          Connect to another station
        </Text>
      </Pressable>

      <View style={{ height: 18 }} />
      <SectionLabel text="OPEN SOURCE LICENSES" />
      <Pressable
        onPress={() => setShowLicenses((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showLicenses }}
        accessibilityLabel="Open Source Licenses and MIT License notice"
        className="flex-row items-center justify-between"
        style={{
          borderWidth: 1,
          borderColor: showLicenses ? colors.accent : colors.softBorder,
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginTop: 8,
        }}
      >
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <FileText size={18} color={showLicenses ? colors.accent : colors.muted} />
          <View>
            <Text className="font-body-semibold text-ink" style={{ fontSize: 14 }}>
              Open Source Licenses
            </Text>
            <Text className="font-mono text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
              MIT License · Upstream &amp; Third-Party Notices
            </Text>
          </View>
        </View>
        {showLicenses ? (
          <ChevronUp size={16} color={colors.accent} />
        ) : (
          <ChevronDown size={16} color={colors.muted} />
        )}
      </Pressable>

      {showLicenses ? (
        <View
          style={{
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: colors.softBorder,
            backgroundColor: colors.field,
            padding: 14,
            gap: 12,
          }}
        >
          <Text className="font-mono text-ink" style={{ fontSize: 10.5, lineHeight: 16 }}>
            {MIT_LICENSE_TEXT}
          </Text>

          <View style={{ height: 1, backgroundColor: colors.softBorder }} />
          <Text className="font-mono text-muted" style={{ fontSize: 9.5, letterSpacing: 2 }}>
            THIRD-PARTY SOFTWARE CREDITS
          </Text>
          {OPEN_SOURCE_CREDITS.map((item) => (
            <View
              key={item.name}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.softBorder,
                paddingBottom: 8,
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-body-semibold text-ink" style={{ fontSize: 13 }}>
                  {item.name}
                </Text>
                <Text className="font-mono text-accent" style={{ fontSize: 10 }}>
                  {item.license}
                </Text>
              </View>
              <Text className="font-body text-muted" style={{ fontSize: 11.5, lineHeight: 17, marginTop: 2 }}>
                {item.desc}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ height: 18 }} />
      <SectionLabel text="LINKS & SOURCE" />
      <LinkRow
        icon={<Radio size={18} color={colors.muted} />}
        title="Hebigat Radio"
        url={PROJECT_LINKS.station}
      />
      <LinkRow
        icon={<Code size={18} color={colors.muted} />}
        title="HebigatRadio Player Source"
        url={PROJECT_LINKS.source}
      />
      <LinkRow
        icon={<Code size={18} color={colors.muted} />}
        title="Upstream SUB/WAVE Project"
        url={PROJECT_LINKS.upstream}
      />

      <View style={{ height: 18 }} />
      <SectionLabel text="PLAYBACK LOG" />
      <Text className="font-body text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>
        Sound dropping out or playing twice? This shares the app&apos;s last few hundred
        playback events for a bug report. Passwords and logins are taken out first, and
        nothing leaves your phone unless you share it.
      </Text>
      <Pressable
        onPress={sharePlaybackLog}
        accessibilityRole="button"
        accessibilityLabel="Share playback log"
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
          <ClipboardList size={18} color={colors.muted} />
          <Text className="font-body-semibold text-ink" style={{ fontSize: 14 }}>
            Share playback log
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6, flexShrink: 1, marginLeft: 12 }}>
          <Text className="font-mono" style={{ fontSize: 11, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
            v{Constants.expoConfig?.version ?? '?'}
          </Text>
          <Share2 size={14} color={colors.muted} />
        </View>
      </Pressable>
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

function LinkRow({ icon, title, url }: { icon: ReactNode; title: string; url: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => openExternal(url)}
      accessibilityRole="link"
      accessibilityLabel={`${title}, opens ${stripProto(url)}`}
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
      <View className="flex-row items-center" style={{ gap: 6, flexShrink: 1, marginLeft: 12 }}>
        <Text className="font-mono" style={{ fontSize: 11, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
          {stripProto(url)}
        </Text>
        <ArrowUpRight size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}
