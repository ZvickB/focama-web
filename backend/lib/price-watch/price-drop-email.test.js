import { describe, expect, it, vi } from 'vitest'

import {
  createResendPriceDropSender,
  formatPriceWatchMoney,
  getPriceDropSummary,
  getPriceWatchEmailConfig,
  renderPriceDropEmail,
} from './price-drop-email.js'

describe('price-drop email', () => {
  it('formats USD and CAD prices', () => {
    expect(formatPriceWatchMoney(19.99, 'USD')).toBe('$19.99')
    expect(formatPriceWatchMoney(19.99, 'CAD')).toBe('$19.99')
  })

  it('calculates compact price-drop savings', () => {
    expect(getPriceDropSummary(22.97, 21.36)).toEqual({ amount: 1.61, percentage: 7 })
  })

  it('uses explicit price watch email config before fallbacks', () => {
    const config = getPriceWatchEmailConfig({
      PRICE_WATCH_FROM_EMAIL: 'alerts@focamai.com',
      PRICE_WATCH_MANAGE_URL: 'https://focamai.com/watches',
    })

    expect(config).toEqual({
      from: 'Focamai <alerts@focamai.com>',
      manageUrl: 'https://focamai.com/watches',
    })
  })

  it('renders the premium product, price, savings, and management copy', () => {
    const html = renderPriceDropEmail({
      manageUrl: 'https://focamai.com/watches',
      newPrice: 90,
      oldPrice: 100,
      imageUrl: 'https://images-na.ssl-images-amazon.com/images/I/product.jpg',
      productTitle: 'Sony headphones',
      productUrl: 'https://www.amazon.com/dp/B001?tag=focamai-20',
    })

    expect(html).toContain('Sony headphones')
    expect(html).toContain('$100.00')
    expect(html).toContain('$90.00')
    expect(html).toContain('Price dropped!')
    expect(html).toContain('The price of an item you’re watching just went down.')
    expect(html).toContain('Previously')
    expect(html).toContain('Save $10.00 (10%)')
    expect(html).toContain('↓ 10%')
    expect(html).toContain('https://images-na.ssl-images-amazon.com/images/I/product.jpg')
    expect(html).toContain('We’ll let you know if the price drops again.')
    expect(html).toContain('https://www.amazon.com/dp/B001?tag=focamai-20')
    expect(html).toContain('https://focamai.com/watches')
  })

  it('sends a Resend email payload', async () => {
    const send = vi.fn(async () => ({ data: { id: 'email-1' } }))
    const sender = createResendPriceDropSender({
      resend: {
        emails: {
          send,
        },
      },
    })

    await expect(sender({
      from: 'Focamai <contact@focamai.com>',
      manageUrl: 'https://focamai.com/watches',
      newPrice: 90,
      oldPrice: 100,
      imageUrl: 'https://images-na.ssl-images-amazon.com/images/I/product.jpg',
      productTitle: 'Sony headphones',
      productUrl: 'https://www.amazon.com/dp/B001',
      to: 'person@example.com',
    })).resolves.toEqual({ id: 'email-1' })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Focamai <contact@focamai.com>',
      subject: expect.stringContaining('$90.00'),
      to: 'person@example.com',
    }))
  })
})
