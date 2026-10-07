import '@/features/storefront/styles/redesign.css';
import { StayProvider } from '@/features/storefront/components/StayProvider';
import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { DM_Sans } from 'next/font/google';
import { Header } from '@/components/storefront/Header';
import { Footer } from '@/components/storefront/Footer';
import { HotelSettingsProvider } from '@/features/storefront/components/HotelSettingsProvider';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';
import { resolveStorefrontAccentPreset, storefrontAccentCssVariables } from '@/features/storefront/lib/storefront-theme';

const lodgingBody = DM_Sans({
  variable: '--font-lodging-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getHotelSettings();
  const configured = identity.state === 'configured';

  return {
    title: configured
      ? {
          default: `${identity.name} · Direct reservations`,
          template: `%s · ${identity.name}`,
        }
      : 'Direct hotel reservations',
    description: configured
      ? `Reserve directly at ${identity.name}. Review live room rates, stay details, and reservation information from the property.`
      : 'Review live room rates, stay details, and direct reservation information.',
    applicationName: configured ? identity.name : 'Direct reservations',
    other: {
      'storefront-accent-preset': identity.accentPreset,
      'storefront-settings-state': identity.state,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const identity = await getHotelSettings();
  return {
    colorScheme: 'light',
    themeColor: resolveStorefrontAccentPreset(identity.accentPreset).swatch,
  };
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getHotelSettings();

  return (
    <HotelSettingsProvider identity={identity}>
      <StayProvider><div
        className={`${lodgingBody.variable} hotel-storefront lodging-page flex min-h-screen flex-col`}
        data-storefront-accent={identity.accentPreset}
        data-storefront-settings-state={identity.state}
        style={{ ...storefrontAccentCssVariables(identity.accentPreset), '--font-lodging-display': 'Georgia, "Times New Roman"' } as CSSProperties}
      >
        <Header />
        <div id="storefront-content" tabIndex={-1} className="flex-1">{children}</div>
        <Footer />
      </div></StayProvider>
    </HotelSettingsProvider>
  );
}
