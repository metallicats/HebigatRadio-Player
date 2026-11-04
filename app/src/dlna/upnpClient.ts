export interface UpnpDevice {
  id: string;
  friendlyName: string;
  modelName?: string;
  location: string;
  avTransportControlUrl: string;
  renderingControlUrl: string;
}

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http://') || relative.startsWith('https://')) return relative;
  const parsed = new URL(base);
  if (relative.startsWith('/')) {
    return `${parsed.protocol}//${parsed.host}${relative}`;
  }
  const basePath = parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1);
  return `${parsed.protocol}//${parsed.host}${basePath}${relative}`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function fetchDeviceDescription(locationUrl: string): Promise<UpnpDevice | null> {
  try {
    const res = await fetch(locationUrl, { headers: { Accept: 'text/xml, application/xml' } });
    if (!res.ok) return null;
    const xml = await res.text();

    const friendlyNameMatch = /<friendlyName>([^<]+)<\/friendlyName>/i.exec(xml);
    const friendlyName = friendlyNameMatch ? friendlyNameMatch[1].trim() : 'Denon Receiver';

    const modelMatch = /<modelName>([^<]+)<\/modelName>/i.exec(xml);
    const modelName = modelMatch ? modelMatch[1].trim() : undefined;

    const avTransportMatch = /<serviceType>urn:schemas-upnp-org:service:AVTransport:1<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i.exec(xml);
    const renderingMatch = /<serviceType>urn:schemas-upnp-org:service:RenderingControl:1<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i.exec(xml);

    if (!avTransportMatch) return null;

    return {
      id: locationUrl,
      friendlyName,
      modelName,
      location: locationUrl,
      avTransportControlUrl: resolveUrl(locationUrl, avTransportMatch[1].trim()),
      renderingControlUrl: renderingMatch ? resolveUrl(locationUrl, renderingMatch[1].trim()) : '',
    };
  } catch {
    return null;
  }
}

async function sendSoap(controlUrl: string, serviceType: string, action: string, bodyXml: string): Promise<string> {
  const soapPayload =
    `<?xml version="1.0" encoding="utf-8"?>\r\n` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\r\n` +
    `  <s:Body>\r\n` +
    `    <u:${action} xmlns:u="${serviceType}">\r\n` +
    `      ${bodyXml}\r\n` +
    `    </u:${action}>\r\n` +
    `  </s:Body>\r\n` +
    `</s:Envelope>`;

  const resp = await fetch(controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPACTION: `"${serviceType}#${action}"`,
    },
    body: soapPayload,
  });

  return resp.text();
}

export interface DlnaMeta {
  title?: string;
  artist?: string;
  album?: string;
}

export function getProtocolInfo(streamUrl: string): string {
  // Denon AVR-X2800H (HEOS) live online radio stream requirements:
  // DLNA.ORG_OP=00 (live stream, unseekable)
  // DLNA.ORG_CI=0 (native format)
  // DLNA.ORG_FLAGS=01A00000000000000000000000000000 (streaming transfer mode, unseekable live stream)
  const dlnaParams = 'DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01A00000000000000000000000000000';

  if (streamUrl.includes('.flac') || streamUrl.includes('.ogg')) {
    // For Ogg-encapsulated FLAC or native FLAC, declare DLNA.ORG_PN=FLAC and audio/flac:
    return `http-get:*:audio/flac:DLNA.ORG_PN=FLAC;${dlnaParams}`;
  }
  if (streamUrl.includes('.aac')) {
    return `http-get:*:audio/aac:DLNA.ORG_PN=AAC_ISO;${dlnaParams}`;
  }
  return `http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;${dlnaParams}`;
}

export async function setTransportUri(device: UpnpDevice, streamUrl: string, meta: DlnaMeta): Promise<void> {
  const title = escapeXml(meta.title || 'SUB/WAVE');
  const artist = escapeXml(meta.artist || 'Live Broadcast');
  const album = escapeXml(meta.album || 'SUB/WAVE');
  const escapedUrl = escapeXml(streamUrl);
  const protocolInfo = getProtocolInfo(streamUrl);

  const didl =
    `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">` +
    `<item id="1" parentID="0" restricted="1">` +
    `<dc:title>${title}</dc:title>` +
    `<dc:creator>${artist}</dc:creator>` +
    `<upnp:album>${album}</upnp:album>` +
    `<upnp:class>object.item.audioItem.audioBroadcast</upnp:class>` +
    `<res protocolInfo="${protocolInfo}">${escapedUrl}</res>` +
    `</item>` +
    `</DIDL-Lite>`;

  const escapedDidl = escapeXml(didl);

  await sendSoap(
    device.avTransportControlUrl,
    'urn:schemas-upnp-org:service:AVTransport:1',
    'SetAVTransportURI',
    `<InstanceID>0</InstanceID><CurrentURI>${escapedUrl}</CurrentURI><CurrentURIMetaData>${escapedDidl}</CurrentURIMetaData>`,
  );
}

export async function playDlna(device: UpnpDevice): Promise<void> {
  await sendSoap(
    device.avTransportControlUrl,
    'urn:schemas-upnp-org:service:AVTransport:1',
    'Play',
    `<InstanceID>0</InstanceID><Speed>1</Speed>`,
  );
}

export async function stopDlna(device: UpnpDevice): Promise<void> {
  await sendSoap(
    device.avTransportControlUrl,
    'urn:schemas-upnp-org:service:AVTransport:1',
    'Stop',
    `<InstanceID>0</InstanceID>`,
  );
}

export async function setDlnaVolume(device: UpnpDevice, volume0to1: number): Promise<void> {
  if (!device.renderingControlUrl) return;
  const level = Math.round(Math.max(0, Math.min(1, volume0to1)) * 100);
  await sendSoap(
    device.renderingControlUrl,
    'urn:schemas-upnp-org:service:RenderingControl:1',
    'SetVolume',
    `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${level}</DesiredVolume>`,
  );
}

export async function getDlnaVolume(device: UpnpDevice): Promise<number | null> {
  if (!device.renderingControlUrl) return null;
  try {
    const xml = await sendSoap(
      device.renderingControlUrl,
      'urn:schemas-upnp-org:service:RenderingControl:1',
      'GetVolume',
      `<InstanceID>0</InstanceID><Channel>Master</Channel>`,
    );
    const m = /<CurrentVolume>(\d+)<\/CurrentVolume>/i.exec(xml);
    return m ? parseInt(m[1], 10) / 100 : null;
  } catch {
    return null;
  }
}
