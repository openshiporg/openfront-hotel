// Local 404 crawl as owner. Usage: CRAWL_BASE=http://localhost:3591 node scripts/r6-crawl.mjs
import fs from 'node:fs'
const BASE = process.env.CRAWL_BASE
const p = process.env.CRAWL_EMAIL ? { email: process.env.CRAWL_EMAIL, password: process.env.CRAWL_PASSWORD } : JSON.parse(fs.readFileSync(process.env.HOME + '/Code/Euler/state/qa-loop/demo-logins/hotel-runtime-admin.json', 'utf8'))
const gql = async (query, variables, cookie) => (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) })).json()
const t = (await gql('mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', { e: p.email, p: p.password })).data?.authenticateUserWithPassword?.sessionToken
if (!t) { console.log('FAIL login'); process.exit(1) }
const cookie = 'keystonejs-session=' + t
const get = async (path) => { const r = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' }); await r.arrayBuffer(); return r.status }
const meta = await gql('{keystone{adminMeta{lists{key path}}}}', {}, cookie)
const lists = meta.data?.keystone?.adminMeta?.lists ?? []
const g = (await gql('{guests(take:1){id}}', {}, cookie)).data?.guests?.[0]?.id
let bad = 0, n500 = 0
const check = (name, got, want) => { const ok = want === 200 ? got === 200 : got === want; if (got >= 500) n500++; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${got} (want ${want})`) }
const PAGES_ONLY = process.env.CRAWL_PAGES_ONLY === '1'
if (!PAGES_ONLY) for (const path of ['/dashboard/guests/nope123', '/dashboard/platform/guests/nope123']) check(path, await get(path), 404)
if (g && !PAGES_ONLY) for (const path of ['/dashboard/guests/' + g, '/dashboard/platform/guests/' + g]) check(path, await get(path), 200)
if (!PAGES_ONLY) for (const l of lists) { check(`/dashboard/${l.path}/nope123`, await get(`/dashboard/${l.path}/nope123`), 404) }
if (!PAGES_ONLY) for (const l of lists) { const s = await get(`/dashboard/${l.path}`); if (s >= 500) { n500++; bad++ } console.log(`list ${l.path}: ${s}`) }
const pages = ['/dashboard', '/dashboard/housekeeping', '/dashboard/reservations', ...['cashier','receivables','payments','housekeeping','folios','messages','refund-queue','security','guest-governance','reservations','property','disputes','groups','maintenance','rooms','approvals','payment-providers','payouts','analytics','channels','front-desk','guests','rate-plans'].map(x => '/dashboard/platform/' + x)]
for (const path of pages) check(path, await get(path), 200)
const sf = async (path) => { const r = await fetch(BASE + path, { redirect: 'manual' }); await r.arrayBuffer(); return r.status }
const rt = (await gql('{roomTypes(take:1){id}}', {}, cookie)).data?.roomTypes?.[0]?.id
const bk = (await gql('{bookings(take:1){id}}', {}, cookie)).data?.bookings?.[0]?.id
for (const path of ['/', '/rooms', '/amenities', '/contact', '/location', '/gallery', '/policies', '/book', '/bookings/lookup', '/account']) check('SF ' + path, await sf(path), 200)
for (const path of ['/rooms/nope123', '/nope123']) check('SF ' + path, await sf(path), 404)
const dashDetail = bk ? ['/dashboard/bookings/' + bk] : []
for (const path of dashDetail) check(path, await get(path), 200)
console.log(`lists ${lists.length}, FAIL ${bad}, 500s ${n500}`)
process.exit(bad ? 1 : 0)
