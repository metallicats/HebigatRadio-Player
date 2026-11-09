// Project links, the same whichever station is tuned in. None of them is a
// payment page: the Ko-fi link lives on the site, never in the binary, because
// an in-app donation call-to-action fails App Store 3.1.1 and Play's Payments
// policy outside the US.

import { Linking } from 'react-native';

export const PROJECT_LINKS = {
  station: 'https://radio.didaskitchen.com',
  setup: 'https://www.getsubwave.com/setup',
  about: 'https://radio.didaskitchen.com',
  source: 'https://github.com/metallicats/HebigatRadio-Player',
  upstream: 'https://github.com/perminder-klair/subwave',
  community: 'https://discord.gg/vjVbVKnMBa',
} as const;

/** Hand a URL to the system browser; a refusal is not worth surfacing. */
export function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {});
}
