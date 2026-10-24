import '@/features/storefront/styles/tokens.css';
import '@/features/storefront/styles/storefront.css';
import { StayProvider } from '@/features/storefront/components/StayProvider';
import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans } from 'next/font/google';
import { SiteHeader } from '@/features/storefront/components/chrome/SiteHeader';
import { SiteFooter } from '@/features/storefront/components/chrome/SiteFooter';
import { HotelSettingsProvider } from '@/features/storefront/components/HotelSettingsProvider';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';
import { resolveStorefrontBrand, storefrontBrandCssVariables } from '@/features/storefront/lib/storefront-theme';
import { wordmarkFont } from '@/features/storefront/lib/wordmark-font';
import { GuestAccountProvider } from '@/features/storefront/components/GuestAccountProvider';
import { getGuestAccountStatus } from '@/features/storefront/lib/guest-account';
import { configuredSiteOrigin } from '@/features/keystone/lib/productionConfig';

const display = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getHotelSettings();
  const configured = identity.state === 'configured';
  const siteName = configured ? identity.name : 'Direct reservations';
  const description = configured
    ? `Reserve directly at ${identity.name}. Review live room rates, stay details, and reservation information from the property.`
    : 'Review live room rates, stay details, and direct reservation information.';
  const origin = configuredSiteOrigin();
  let metadataBase: URL | undefined;
  try { metadataBase = origin ? new URL(origin) : undefined; } catch { metadataBase = undefined; }

  return {
    metadataBase,
    title: configured
      ? {
          default: `${identity.name} · Direct reservations`,
          template: `%s · ${identity.name}`,
        }
      : { default: 'Direct hotel reservations', template: '%s · Direct reservations' },
    description,
    applicationName: siteName,
    openGraph: {
      type: 'website',
      siteName,
      title: configured ? `${identity.name} · Direct reservations` : 'Direct hotel reservations',
      description,
      images: [{ url: identity.media.hero.imagePath, alt: identity.media.hero.altText }],
    },
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
    themeColor: resolveStorefrontBrand(identity.accentPreset, identity.logo).swatch,
  };
}

/** Theme tokens live on :root so dialogs and popovers portalled outside the shell match it.
 * Values come only from the accent presets, the normalized saved logo hue and next/font,
 * never from request input. */
function storefrontRootStyle(identity: Awaited<ReturnType<typeof getHotelSettings>>) {
  const tokens = {
    ...storefrontBrandCssVariables(resolveStorefrontBrand(identity.accentPreset, identity.logo)),
    '--sf-font-display': display.style.fontFamily,
    '--sf-font-sans': sans.style.fontFamily,
    '--sf-font-wordmark': wordmarkFont.style.fontFamily,
  };
  return `:root{${Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(';')}}`;
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [identity, account] = await Promise.all([getHotelSettings(), getGuestAccountStatus()]);

  return (
    <HotelSettingsProvider identity={identity}>
      <GuestAccountProvider status={account}>
      <StayProvider>
        <style dangerouslySetInnerHTML={{ __html: storefrontRootStyle(identity) }} />
        <div
          className="sf"
          data-storefront-accent={identity.accentPreset}
          data-storefront-settings-state={identity.state}
        >
          <SiteHeader />
          <main id="storefront-content" tabIndex={-1} className="sf-main">{children}</main>
          <SiteFooter />
        </div>
      </StayProvider>
      </GuestAccountProvider>
    </HotelSettingsProvider>
  );
}
