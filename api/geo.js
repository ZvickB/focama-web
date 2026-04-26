export async function GET(request) {
  const raw = request.headers.get('x-vercel-ip-country')
  const countryCode =
    typeof raw === 'string' && /^[A-Z]{2}$/.test(raw.trim()) ? raw.trim() : 'US'

  return new Response(JSON.stringify({ countryCode }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
