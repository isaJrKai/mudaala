const BASE = 'http://localhost:3000'
const jar: Record<string, string> = {}
function storeCookie(j: Record<string, string>, res: Response) {
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean) as string[]
  for (const c of setCookies) { const [pair] = c.split(';'); const eq = pair.indexOf('='); j[pair.slice(0, eq)] = pair.slice(eq + 1) }
}
async function call(method: string, path: string, body?: any, j?: Record<string, string>) {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  const cookie = Object.entries(j ?? {}).map(([k, v]) => `${k}=${v}`).join('; ')
  if (cookie) headers.cookie = cookie
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  storeCookie(j ?? {}, res)
  let json: any = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}
async function main() {
  const phone = `+2567${String(Math.floor(10000000 + Math.random() * 89999999))}`
  const reg = await call('POST', '/api/auth/register', { phone, name: 'Repro Rara', password: 'password789', country: 'UG' }, jar)
  console.log('register:', reg.status, JSON.stringify(reg.json)?.slice(0, 200))
  const prof = await call('PUT', '/api/profile', { businessName: 'Twin Name Market', photoUrl: null, category: 'other', description: null, county: 'Kampala', area: 'Ntinda', phone: `+2567${String(Math.floor(10000000 + Math.random() * 89999999))}`, whatsapp: null, hours: null }, jar)
  console.log('profile:', prof.status, JSON.stringify(prof.json)?.slice(0, 300))
  const lis = await call('POST', '/api/listings', { type: 'OFFER', title: 'Twin market greens offer', description: 'Clean test copper scrap for validating the publishing pipeline end to end.', category: 'scrap-recyclables', price: 500, currency: 'UGX', priceNegotiable: false, unit: 'kg', quantity: 100, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256712345678', contactWhatsapp: null }, jar)
  console.log('listing:', lis.status, JSON.stringify(lis.json)?.slice(0, 300))
}
main()
