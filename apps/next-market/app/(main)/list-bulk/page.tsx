import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function ListBulkAliasPage({ searchParams }: PageProps) {
  const resolved = await searchParams
  const query = new URLSearchParams()

  for (const [k, v] of Object.entries(resolved)) {
    if (v !== undefined) {
      if (Array.isArray(v)) {
        v.forEach(val => query.append(k, val))
      } else {
        query.append(k, v)
      }
    }
  }

  const queryString = query.toString()
  const destination = queryString ? `/list_bulk?${queryString}` : '/list_bulk'

  redirect(destination)
}
