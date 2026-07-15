import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacyPage from '@/pages/PrivacyPage.jsx'

describe('PrivacyPage', () => {
  it('describes the implemented account, voice, service, retention, and contact behavior', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: 'How Focamai handles your information.' })).toBeInTheDocument()
    expect(screen.getByText(/email address, Supabase user identifier/i)).toBeInTheDocument()
    expect(screen.getByText(/Users may sign in using email and password or Google Sign-In/i)).toBeInTheDocument()
    expect(screen.queryByText(/OAuth options are not currently available in the mobile app/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sends it through the Focamai backend to OpenAI for transcription/i)).toBeInTheDocument()
    expect(screen.getByText(/Rainforest API/i)).toBeInTheDocument()
    expect(screen.getByText(/Mobile crash reports/i)).toBeInTheDocument()
    expect(screen.getByText(/performance tracing, profiling/i)).toBeInTheDocument()
    expect(screen.getByText(/preferences, saved searches, price watches, and price comparison usage record/i)).toBeInTheDocument()
    expect(screen.getByText(/Anonymous operational search logs/i)).toBeInTheDocument()
    expect(screen.getByText(/does not automatically purge the underlying database row/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contact@focamai.com' })).toHaveAttribute(
      'href',
      'mailto:contact@focamai.com',
    )
  })
})
