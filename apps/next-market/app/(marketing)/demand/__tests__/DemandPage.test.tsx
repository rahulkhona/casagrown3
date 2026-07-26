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
    expect(meta.openGraph?.url).toContain('/demand?items=')
  })

  it('renders requested items with List Item Now CTA buttons', async () => {
    const pageJsx = await DemandPage({
      searchParams: Promise.resolve({
        items: 'Organic Strawberries, Hass Avocados',
        name: 'Rahul',
        location: 'San Jose',
      }),
    })

    render(pageJsx)

    expect(screen.getByText(/Rahul in San Jose is searching for local produce!/i)).toBeInTheDocument()
    expect(screen.getByText('Organic Strawberries')).toBeInTheDocument()
    expect(screen.getByText('Hass Avocados')).toBeInTheDocument()

    const listButtons = screen.getAllByText(/List .* Now →/)
    expect(listButtons.length).toBe(2)
    expect(listButtons[0].closest('a')).toHaveAttribute(
      'href',
      '/create-listing?produce=Organic%20Strawberries'
    )
    expect(listButtons[1].closest('a')).toHaveAttribute(
      'href',
      '/create-listing?produce=Hass%20Avocados'
    )
  })
})
