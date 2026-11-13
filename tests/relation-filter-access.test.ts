// Relation where-filters must not read through a list the caller cannot read.
// Needs a migrated scratch database: DATABASE_URL=... node --import tsx --test tests/relation-filter-access.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getContext } from '@keystone-6/core/context'
import { isListType, isNonNullType, type GraphQLNamedType } from 'graphql'
import config from '../features/keystone/index'
import * as PrismaModule from '@prisma/client'

const skip = !process.env.DATABASE_URL
const perms = ['canAccessDashboard', 'canManageRooms', 'canManageBookings', 'canManageHousekeeping', 'canManageGuests', 'canManagePayments', 'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canManageOnboarding', 'canManageAudit', 'canManageIntegrations', 'canManageGuestPrivacy', 'canApproveHotelExceptions']
const role = (name: string, on: string[]) => ({ id: name, name, ...Object.fromEntries(perms.map((p) => [p, on.includes(p)])) })
const roles: Record<string, any> = {
  anonymous: undefined,
  guestAccount: role('none', []),
  frontDesk: role('Front Desk', ['canAccessDashboard', 'canManageBookings', 'canManageGuests']),
  housekeeping: role('Housekeeping', ['canAccessDashboard', 'canManageHousekeeping']),
  maintenance: role('Maintenance', ['canAccessDashboard', 'canManageRooms']),
  accountant: role('Accountant', ['canAccessDashboard', 'canManagePayments']),
}
const admin = role('Admin', perms)

test('relation filters follow read access', { skip }, async () => {
  const base = getContext(config, PrismaModule)
  const sudo = base.sudo()
  const schema = base.graphql.schema
  const types = schema.getTypeMap()
  const queryFields = schema.getQueryType()!.getFields()
  const countFor: Record<string, string> = {}
  for (const [name, f] of Object.entries(queryFields)) {
    const w = f.args.find((a) => a.name === 'where')
    if (name.endsWith('Count') && w) countFor[w.type.toString().replace(/!$/, '').replace(/WhereInput$/, '')] = name
  }
  const run = async (ctx: any, query: string) => {
    const r: any = await ctx.graphql.raw({ query })
    return r.errors?.length ? { error: String(r.errors[0].message) } : { data: r.data }
  }

  // Seed one booking graph so counts can differ.
  const stamp = Date.now().toString(36)
  const user = await sudo.query.User.createOne({ data: { name: 'Zora Zeta', email: `zora.${stamp}@example.com`, password: 'Zeta-pass-98765-xx' }, query: 'id' })
  const guest = await sudo.query.Guest.createOne({ data: { firstName: 'Zed', lastName: 'Zeta', email: `zed.${stamp}@example.com` }, query: 'id' })
  await (sudo as any).prisma.booking.create({ data: { checkInDate: new Date('2031-01-01'), checkOutDate: new Date('2031-01-02'), confirmationNumber: 'RF' + stamp, guestProfileId: guest.id, guestId: user.id } })

  // 1. Every relation filter into a list the caller cannot read errors (or reads the same on every probe).
  for (const [who, r] of Object.entries(roles)) {
    const ctx = r ? base.withSession({ itemId: 'caller-' + who, listKey: 'User', data: { name: who, isActive: true, authVersion: 1, role: r } } as any) : base
    const readable = new Map<string, boolean>()
    const canRead = async (listKey: string) => {
      if (!readable.has(listKey)) readable.set(listKey, !(await run(ctx, `{ ${countFor[listKey]} }`)).error)
      return readable.get(listKey)!
    }
    for (const [typeName, t] of Object.entries(types)) {
      if (!typeName.endsWith('WhereInput') || typeName === 'WhereInput') continue
      const listKey = typeName.replace(/WhereInput$/, '')
      if (!countFor[listKey] || !(await canRead(listKey))) continue
      for (const [field, f] of Object.entries((t as any).getFields() as Record<string, any>)) {
        let named: GraphQLNamedType = f.type
        while (isNonNullType(named) || isListType(named)) named = (named as any).ofType
        const n = named.name
        const many = n.endsWith('ManyRelationFilter')
        const target = many ? n.replace(/ManyRelationFilter$/, '') : n.endsWith('WhereInput') ? n.replace(/WhereInput$/, '') : ''
        if (!target || !countFor[target] || ['AND', 'OR', 'NOT'].includes(field)) continue
        if (await canRead(target)) continue
        const inner = '{ createdAt: { lt: "2999-01-01T00:00:00.000Z" } }'
        const other = '{ createdAt: { gt: "2999-01-01T00:00:00.000Z" } }'
        const q = (w: string) => `{ ${countFor[listKey]}(where: { ${field}: ${many ? `{ some: ${w} }` : w} }) }`
        const a = await run(ctx, q(inner)); const b = await run(ctx, q(other))
        assert.ok(a.error || JSON.stringify(a.data) === JSON.stringify(b.data), `${who}: ${listKey}.${field} -> ${target} filters through an unreadable list`)
      }
    }
  }

  // 2. Fields nobody can read are not filterable or orderable by anyone.
  for (const [typeName, fields] of Object.entries({ User: ['mfaSecret', 'mfaPendingSecret', 'mfaEnabled', 'mfaRecoveryHashes', 'mfaLastCounter', 'mfaPendingExpiresAt', 'password'], Guest: ['idNumber'], GuestDocument: ['documentNumber', 'frontImage', 'backImage'], Booking: ['guestAccessTokenHash', 'guestAccessTokenIssuedAt'], Channel: ['credentials'], PaymentProvider: ['credentials'] })) {
    const w: any = (types[`${typeName}WhereInput`] as any).getFields(); const o: any = (types[`${typeName}OrderByInput`] as any).getFields()
    for (const f of fields) { assert.equal(w[f], undefined, `${typeName}.${f} must not be filterable`); assert.equal(o[f], undefined, `${typeName}.${f} must not be orderable`) }
  }

  // 3. Data attack: a front desk caller cannot learn user names through bookings; admin keeps real filters.
  const hit = (w: string) => `{ bookingsCount(where: { guest: { name: { startsWith: "${w}" } } }) }`
  const front = base.withSession({ itemId: 'fd', listKey: 'User', data: { name: 'fd', isActive: true, authVersion: 1, role: roles.frontDesk } } as any)
  const present = await run(front, hit('Zora')); const absent = await run(front, hit('Qqq'))
  assert.ok(present.error || JSON.stringify(present.data) === JSON.stringify(absent.data))
  const adm = base.withSession({ itemId: 'adm', listKey: 'User', data: { name: 'adm', isActive: true, authVersion: 1, role: admin } } as any)
  const real = await run(adm, hit('Zora'))
  assert.ok(!real.error && (real.data as any).bookingsCount >= 1, 'admin keeps the real filter')
  assert.equal((await run(adm, hit('Qqq')).then((r) => r.data as any)).bookingsCount, 0)
})
