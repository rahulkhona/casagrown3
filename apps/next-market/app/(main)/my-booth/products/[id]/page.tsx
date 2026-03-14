'use client'

import { redirect } from 'next/navigation'
import { useParams } from 'next/navigation'

// Redirect to the unified add/edit form with edit param
export default function EditProductRedirect() {
  const params = useParams()
  redirect(`/my-booth/products/new?edit=${params.id}`)
}
