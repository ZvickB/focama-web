import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account deletion route deployment', () => {
  it('registers the public SPA route and preserves the direct-navigation fallback', () => {
    const appSource = readFileSync(`${process.cwd()}/src/App.jsx`, 'utf8')
    const vercelConfig = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, 'utf8'))

    expect(appSource).toContain('path="/delete-account"')
    expect(vercelConfig.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' })
  })
})
