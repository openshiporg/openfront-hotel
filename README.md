![Openfront Hotel](https://openship.org/og/openfront-hotel.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-hotel&env=DATABASE_URL%2CSESSION_SECRET%2CHOTEL_DATA_ENCRYPTION_KEY%2CHOTEL_QUOTE_SECRET%2CNEXT_PUBLIC_SITE_URL)

Openfront Hotel is a self-hostable hotel property-management and direct-booking application. Guests can browse rooms, compare stay quotes, book direct, and review their booking and folio. Staff use the dashboard for reservations, room assignments, rates, housekeeping, maintenance, guest bills, and daily hotel operations.

## Demo

<a href="https://alder.openship.org"><img src="public/images/hotel/the-alder-house-lobby-hero.webp" alt="Lobby image used by The Alder House storefront" width="600"></a>

The Alder House

| | |
|---|---|
| **Storefront** | [alder.openship.org](https://alder.openship.org) |
| **Dashboard** | [alder.openship.org/dashboard](https://alder.openship.org/dashboard) |
| **User** | `alder@openship.org` |
| **Password** | `yxKiycgc2Qxagi5rPtbA` |

[Learn more →](https://openship.org/products/openfront-hotel)

[Documentation →](https://docs.openship.org/docs/openfront/hotel/)

## The Openfront Ecosystem

Openfront is part of an ecosystem of open-source commerce tools:

- **[Openfront E-commerce](https://github.com/openshiporg/openfront)**: Headless e-commerce for retail.
- **[Openfront Restaurant](https://github.com/openshiporg/openfront-restaurant)**: Restaurant ordering, point of sale, and kitchen operations.
- **[Openship](https://github.com/openshiporg/openship)**: Order routing for multi-channel fulfillment.
- **Openfront Hotel**: (This repository) Hotel reservations, direct booking, and property operations.

## Core Features

### Admin Dashboard
Manage reservations, room types, physical rooms, rates, guests, and payment providers. Dedicated workspaces cover the front desk, housekeeping, maintenance, folios, cashier work, receivables, groups, and reporting.

### Storefront
Guests can browse rooms, choose dates and guest counts, get a stay quote, and book direct. Booking lookup and guest account screens provide access to booking details, folios, cancellation, and modification requests. Public pages cover amenities, gallery, location, policies, and contact.

### Reservations & Room Inventory
Room types, physical rooms, nightly inventory, rate plans, and seasonal rates are separate records. Staff can create and amend bookings, assign rooms, check guests in and out, and manage group blocks and allocations.

### Folios & Payments
Folios record charges, payments, and reversals. Staff workflows include payment recording, refund requests, cashier operations, receivables, and night audit. Stripe and PayPal adapters are included; enabled state and encrypted credentials are configured in dashboard payment-provider records.

### Housekeeping & Property Operations
Track cleaning tasks, room operational status, and maintenance requests. Business dates, night-audit runs, daily metrics, audit events, and an outbox support property operations. Channel records and configured HTTP exchange are available; they are not native Booking.com or Expedia adapters.

## Architecture

### Technology Stack
- **Frontend**: Next.js 16 with App Router and React 19.
- **Backend**: KeystoneJS 6 with a GraphQL API.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Tailwind CSS 4 with shared shadcn/ui components.
- **Authentication**: Session-based with role-based permissions.

### Application Structure
```text
openfront-hotel/
├── app/
│   ├── (storefront)/        # Guest discovery, booking, lookup, and accounts
│   ├── dashboard/          # Staff workspaces and first-admin setup
│   └── api/                # Health, payment, and integration endpoints
├── features/
│   ├── keystone/           # Models, booking commands, access, and workers
│   ├── platform/           # Staff workspaces and onboarding
│   ├── storefront/         # Guest components and screens
│   └── integrations/       # Stripe and PayPal adapters
├── instrumentation.ts      # In-process worker startup
└── components/             # Shared UI components
```

### Data Models
The [Keystone model registry](features/keystone/models/index.ts) and [Prisma schema](schema.prisma) cover:

- Users, roles, hotel settings, guests, and guest documents.
- Room types, images, physical rooms, nightly inventory, and assignments.
- Rate plans, seasonal rates, bookings, reservation lines, and modification requests.
- Payment providers, sessions, payments, events, and refund intents.
- Folios, folio entries, business dates, and night-audit runs.
- Housekeeping tasks, maintenance requests, group blocks, and allocations.
- Channels, channel reservations, synchronization events, daily metrics, audit events, and outbox records.

## Getting Started

### Prerequisites
- Node.js 20.9 or later, compatible with Next.js 16.
- A PostgreSQL database you can migrate.
- npm.

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-hotel.git
   cd openfront-hotel
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your database and newly generated secrets:
   ```env
   DATABASE_URL=postgresql://user:password@host/database
   SESSION_SECRET=replace-with-a-new-random-value-of-at-least-32-characters
   HOTEL_DATA_ENCRYPTION_KEY=replace-with-a-separate-random-value-of-at-least-32-characters
   HOTEL_QUOTE_SECRET=replace-with-another-random-value-of-at-least-32-characters
   PUBLIC_SIGNUPS_ALLOWED=false
   ```

   Generate each secret separately, for example with `openssl rand -hex 32`. Do not use the placeholder text as a secret.

   The checked-in `.env.example` is a production template. Do not retain its `NODE_ENV=production` or placeholder infrastructure settings for local development. Set `NEXT_PUBLIC_SITE_URL` to your application origin; if `NEXTAUTH_URL` is also set, both must agree. Production requires a canonical HTTPS origin and rejects placeholder secrets. Keep `HOTEL_DATA_ENCRYPTION_KEY` stable to preserve access to encrypted provider credentials. Configure SMTP and S3 using the template when enabling email and uploads; payment-provider credentials belong in the dashboard.

   Replace URL examples and internal routing overrides with your actual application origin, or remove optional overrides you do not need. Never commit your `.env` file.

3. **Start development server:**
   ```bash
   npx keystone build --no-ui
   npm run migrate
   npm run dev
   ```

   Apply migrations explicitly: Hotel's `dev` command builds Keystone, generates dashboard view ordering, and starts Next.js, but does not apply migrations.

4. **Access the application:**
   Open the URL `npm run dev` prints, then use these paths:

   - **Storefront**: `/`
   - **Staff dashboard**: `/dashboard`
   - **Booking lookup**: `/bookings/lookup`
   - **GraphQL API**: `/api/graphql`

5. **Create your first admin user:**
   Visit `/dashboard/init` on that application URL to create the initial administrator.

6. **Run hotel onboarding:**
   Use dashboard onboarding and property settings to configure the hotel, rooms, nightly inventory, rates, and business date. Payment providers, mail, and image storage are configured separately.

## Development Commands

- `npm run dev` - Build Keystone, generate view ordering, and start Next.js development.
- `npm run build` - Build Keystone and Next.js for production; does not apply migrations.
- `npm start` - Start the production Next.js server.
- `npm run generate:view-order` - Generate dashboard model view ordering.
- `npm run migrate:gen` - Build Keystone, generate view ordering, and generate/apply development migrations.
- `npm run migrate` - Apply checked-in Prisma migrations.
- `npm run lint` - Run ESLint.

Use a development database for `migrate:gen`; it generates and applies schema changes.

### Payment Integration
The registered [payment adapters](features/integrations/payment/index.ts) are Stripe and PayPal. Configure them in **Dashboard > Payment providers**. Provider callbacks enter through `/api/payment-providers/[providerCode]/webhook`; operator-recorded payments are handled by separate booking-payment commands.

### Channel Integration
[Channel mutations](features/keystone/mutations) support inventory push, reservation pull, and retry operations against configured channel endpoints. A local channel row or synchronization record is not proof of an external OTA connection.

## Documentation

See the [Openfront Hotel documentation](https://docs.openship.org/docs/openfront/hotel/) for the vertical's application guide, data model, access boundaries, and integration notes. The [source models](features/keystone/models) and [business commands](features/keystone/mutations) describe the implementation in this repository.

## Security & Permissions

### Role-Based Access Control
- `canAccessDashboard` - Staff dashboard access.
- `canManageRooms` - Rooms and room types.
- `canManageBookings` - Reservations and front-desk actions.
- `canManageHousekeeping` - Cleaning tasks and room service state.
- `canManageGuests` - Guest records.
- `canManagePayments` - Payments and refunds.
- `canManageGuestPrivacy` - Guest privacy requests and identity evidence.
- `canApproveHotelExceptions` - Independent approval of hotel exceptions.

### Security Features
- Session-based authentication with current account and role checks.
- Staff MFA support and session invalidation through account authorization versions.
- Guest booking access checked separately from staff dashboard permissions.
- Encrypted payment-provider credentials and verified payment webhooks.
- Controlled booking and folio commands with audit records.

Hotel settings and staff roles apply to a single property database; this is not a multi-property tenant system.

## Platform Components

### Admin Platform (`/dashboard`)
- **Front desk & reservations**: Stay dates, room assignment, check-in, and check-out.
- **Rooms & rates**: Room inventory, rate plans, seasonal rates, and publication.
- **Housekeeping & maintenance**: Task progress and room operational status.
- **Folios & cashier**: Guest bills, charges, reversals, and reconciliation.
- **Guests & groups**: Guest profiles, group blocks, and allocations.
- **Payments & operations**: Providers, refunds, receivables, analytics, and event delivery.

### Storefront Experience
- **Room discovery**: Room listings, detail pages, amenities, and gallery.
- **Direct booking**: Availability, stay quotes, dates, guest counts, and checkout.
- **Guest access**: Booking lookup, account, owned booking details, and folios.
- **Stay changes**: Cancellation and modification requests.

## Deployment

### Production Deployment
The Vercel button imports this repository. Provision PostgreSQL and configure the environment, storage, and any enabled integrations separately.

Build the application, apply migrations as a release step, and start the production server:

```bash
npm run build
npm run migrate
npm start
```

Back up an existing database before applying migrations. The included [`railway.toml`](railway.toml) builds without migrations and applies them when the application starts.

### Scaling Considerations
The application starts hotel workers through Next.js instrumentation. Use a long-running process for these jobs; importing the repository into Vercel does not supply a persistent worker runtime. Keep one property's database and encryption keys consistent across processes.

## Contributing

Use the development commands above when preparing changes. Keep model changes and their migrations together, and describe any workflow or permission changes in your pull request.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Support

- **Documentation**: [Openfront Hotel guide](https://docs.openship.org/docs/openfront/hotel/).
- **Issues**: [Report bugs and feature requests](https://github.com/openshiporg/openfront-hotel/issues).
- **Product**: [Learn more about Openfront Hotel](https://openship.org/products/openfront-hotel).

---

Built with [Next.js](https://nextjs.org) and [KeystoneJS](https://keystonejs.com).
