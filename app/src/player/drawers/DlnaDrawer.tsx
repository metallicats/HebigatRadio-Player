import { Check, ChevronLeft, Plus, Radio, RefreshCw, Speaker } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { UpnpDevice } from '@/dlna/upnpClient';
import { useTheme } from '@/theme/ThemeContext';

export interface DlnaDrawerProps {
  devices: UpnpDevice[];
  connected: boolean;
  activeDeviceName: string | null;
  onScan: () => void;
  onConnect: (device: UpnpDevice) => void;
  onDisconnect: () => void;
  onAddManualIp: (ip: string) => Promise<boolean>;
  onBack?: () => void;
}

export default function DlnaDrawer({
  devices,
  connected,
  activeDeviceName,
  onScan,
  onConnect,
  onDisconnect,
  onAddManualIp,
  onBack,
}: DlnaDrawerProps) {
  const { colors } = useTheme();
  const [ipInput, setIpInput] = useState('');
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);

  const handleManualAdd = async () => {
    if (!ipInput.trim()) return;
    setIpLoading(true);
    setIpError(null);
    const success = await onAddManualIp(ipInput.trim());
    setIpLoading(false);
    if (success) {
      setIpInput('');
    } else {
      setIpError('Could not reach UPnP receiver at this address.');
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row items-center justify-between">
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            className="flex-row items-center"
            style={{ gap: 4 }}
          >
            <ChevronLeft size={16} color={colors.accent} />
            <Text className="font-mono" style={{ fontSize: 11, color: colors.accent }}>
              Back to panel
            </Text>
          </Pressable>
        ) : (
          <Text className="font-mono text-muted" style={{ fontSize: 10, letterSpacing: 2 }}>
            NETWORK RECEIVERS &amp; SPEAKERS
          </Text>
        )}
        <Pressable
          onPress={onScan}
          hitSlop={8}
          className="flex-row items-center"
          style={{ gap: 6 }}
        >
          <RefreshCw size={12} color={colors.accent} />
          <Text className="font-mono" style={{ fontSize: 11, color: colors.accent }}>
            Scan LAN
          </Text>
        </Pressable>
      </View>

      {connected && activeDeviceName ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: `${colors.accent}14`,
            padding: 14,
            borderRadius: 4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <Radio size={18} color={colors.accent} />
            <View>
              <Text className="font-body-semibold text-ink" style={{ fontSize: 14 }}>
                {activeDeviceName}
              </Text>
              <Text className="font-mono text-accent" style={{ fontSize: 10 }}>
                Active UPnP Audio Stream
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onDisconnect}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              backgroundColor: colors.field,
              borderWidth: 1,
              borderColor: colors.softBorder,
            }}
          >
            <Text className="font-mono text-ink" style={{ fontSize: 11 }}>
              Disconnect
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {devices.map((device) => {
          const isCurrent = activeDeviceName === device.friendlyName;
          return (
            <Pressable
              key={device.id}
              onPress={() => (isCurrent ? onDisconnect() : onConnect(device))}
              className="flex-row items-center justify-between"
              style={{
                borderWidth: 1,
                borderColor: isCurrent ? colors.accent : colors.softBorder,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: isCurrent ? `${colors.accent}14` : colors.field,
              }}
            >
              <View className="flex-row items-center" style={{ gap: 10, flex: 1 }}>
                <Speaker size={18} color={isCurrent ? colors.accent : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text className="font-body-semibold text-ink" style={{ fontSize: 14 }} numberOfLines={1}>
                    {device.friendlyName}
                  </Text>
                  {device.modelName ? (
                    <Text className="font-mono text-muted" style={{ fontSize: 10 }}>
                      {device.modelName}
                    </Text>
                  ) : null}
                </View>
              </View>
              {isCurrent ? <Check size={16} color={colors.accent} /> : null}
            </Pressable>
          );
        })}

        {devices.length === 0 && !connected ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <Text className="font-mono text-muted" style={{ fontSize: 11, textAlign: 'center' }}>
              No DLNA receivers detected yet. Tap "Scan LAN" or enter IP directly below.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.softBorder, paddingTop: 14 }}>
        <Text className="font-mono text-muted" style={{ fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>
          DIRECT RECEIVER IP (DENON FALLBACK)
        </Text>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <TextInput
            placeholder="e.g. 192.168.1.150"
            placeholderTextColor={colors.muted}
            value={ipInput}
            onChangeText={setIpInput}
            keyboardType="numeric"
            autoCapitalize="none"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.softBorder,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: colors.ink,
              fontFamily: 'monospace',
              fontSize: 12,
              backgroundColor: colors.field,
            }}
          />
          <Pressable
            onPress={handleManualAdd}
            disabled={ipLoading || !ipInput.trim()}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: ipInput.trim() ? colors.accent : colors.field,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ipLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Plus size={16} color={ipInput.trim() ? '#fff' : colors.muted} />
            )}
          </Pressable>
        </View>
        {ipError ? (
          <Text className="font-mono" style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>
            {ipError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
