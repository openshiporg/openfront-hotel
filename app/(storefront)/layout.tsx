import '@/features/storefront/styles/tokens.css';
import '@/features/storefront/styles/storefront.css';
import '@/features/storefront/styles/rigel.css';
import { StayProvider } from '@/features/storefront/components/StayProvider';
import type { Metadata, Viewport } from 'next';
import { EB_Garamond, Jost } from 'next/font/google';
import { SiteHeader } from '@/features/storefront/components/chrome/SiteHeader';
import { SiteFooter } from '@/features/storefront/components/chrome/SiteFooter';
import { TabBar } from '@/features/storefront/components/chrome/TabBar';
import { HotelSettingsProvider } from '@/features/storefront/components/HotelSettingsProvider';
import { getHotelSettings } from '@/features/storefront/lib/hotel-settings';
import { STOREFRONT_THEME_PRIMARY } from '@/features/storefront/lib/storefront-theme';
import { GuestAccountProvider } from '@/features/storefront/components/GuestAccountProvider';
import { getGuestAccountStatus } from '@/features/storefront/lib/guest-account';
import { configuredSiteOrigin } from '@/features/keystone/lib/productionConfig';

// Rigel: a book serif for headings, room copy and prices; a geometric sans for labels and controls.
const display = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

const sans = Jost({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
  return {
    colorScheme: 'light',
    themeColor: STOREFRONT_THEME_PRIMARY,
  };
}

/** Font tokens live on :root so dialogs and popovers portalled outside the shell match it.
 * The Rigel palette is fixed in tokens.css; the saved logo keeps its own colour in the header. */
function storefrontRootStyle() {
  const tokens = {
    '--sf-font-display': display.style.fontFamily,
    '--sf-font-sans': sans.style.fontFamily,
    '--sf-font-wordmark': display.style.fontFamily,
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
        <style dangerouslySetInnerHTML={{ __html: storefrontRootStyle() }} />
        <div
          className="sf"
          data-storefront-accent={identity.accentPreset}
          data-storefront-settings-state={identity.state}
        >
          <SiteHeader />
          <main id="storefront-content" tabIndex={-1} className="sf-main">{children}</main>
          <SiteFooter />
          <TabBar />
        </div>
      </StayProvider>
      </GuestAccountProvider>
    </HotelSettingsProvider>
  );
}
