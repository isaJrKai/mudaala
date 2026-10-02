// Legacy ad URLs live on only as permanent redirects to the canonical
// /l/{id} page. Whatever was already shared on WhatsApp, printed on a
// poster or indexed by Google — /listing/{keywords}-{id} and bare
// /listing/{id} both — lands on the same ad, one hop later. Links never rot.

import { notFound, permanentRedirect } from 'next/navigation'

type Params = { params: Promise<{ slug: string }> }

export default async function LegacyAdRedirect({ params }: Params) {
  const { slug } = await params

  // The id is the tail after the last dash; bare-id URLs pass through whole.
  const tail = slug.includes('-') ? slug.slice(slug.lastIndexOf('-') + 1) : slug
  if (tail) permanentRedirect(`/l/${tail}`)
  notFound()
}
