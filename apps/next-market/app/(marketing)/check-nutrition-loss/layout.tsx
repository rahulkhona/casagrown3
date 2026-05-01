import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check Your Produce Nutrition Loss | CasaGrown',
  description: 'Find out exactly how many nutrients your store-bought produce loses before it hits the grocery shelf. Stop eating depleted food and start buying local.',
  openGraph: {
    title: 'Check Your Produce Nutrition Loss | CasaGrown',
    description: 'Find out exactly how many nutrients your store-bought produce loses before it hits the grocery shelf.',
    images: ['/og-marketing.jpg'],
  },
}

export default function NutritionLossLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
