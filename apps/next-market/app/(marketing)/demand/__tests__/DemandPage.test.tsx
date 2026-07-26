import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DemandPage, { generateMetadata } from '../page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'localhost:3002' : null),
  }),
}))

vi.mock('../../../components/Navbar', () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}))

vi.mock('../../../components/BottomNav', () => ({
  BottomNav: () => <footer data-testid="bottom-nav">BottomNav</footer>,
}))

describe('DemandPage (Shared Buyer Wishlist)', () => {
  it('generates dynamic metadata with Option A primary item image and summary', async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({
        items: 'Organic Strawberries, Hass Avocados',
        name: 'Rahul',
        location: 'San Jose',
      }),
    })

    expect(meta.title).toContain('Rahul is looking for Organic Strawberries & Hass Avocados in San Jose')
    expect(meta.openGraph?.images).toBeDefined()
    expect(meta.openGraph?.url).toContain('/demand?')
  })

  it('renders requested items with List Item Now CTA buttons', async () => {
    const pageJsx = await DemandPage({
      searchParams: Promise.resolve({
        items: 'Strawberries, Hass Avocados',
        name: 'Rahul',
        location: 'San Jose',
      }),
    })

    render(pageJsx)

    expect(screen.getByText(/Would you be interested in sharing or selling any of these items to Rahul\?/i)).toBeInTheDocument()
    expect(screen.getByText('Strawberries')).toBeInTheDocument()
    expect(screen.getByText('Hass Avocados')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    const produceLinks = links.filter((l) => l.getAttribute('href')?.includes('/create-listing'))
    expect(produceLinks.length).toBeGreaterThanOrEqual(2)
    expect(produceLinks[0].getAttribute('href')).toContain('/create-listing?produce=Strawberries')
    expect(produceLinks[1].getAttribute('href')).toContain('/create-listing?produce=Hass%20Avocados')
  })
})
