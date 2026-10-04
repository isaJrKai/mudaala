import { LegalPage, legalPageMetadata } from '@/components/commerce/legal-page'
import { SiteFooter } from '@/components/commerce/site-footer'

export const metadata = legalPageMetadata({
  file: 'terms.md',
  title: 'Terms of Service',
  description: 'The rules of the market: what you may sell, how you must treat people, and what Mudaala is.',
})

export const dynamic = 'force-dynamic'

export default function TermsPage() {
  return (
    <>
      <LegalPage file="terms.md" title="Terms of Service" description="The rules of the market: what you may sell, how you must treat people, and what Mudaala is." />
      <SiteFooter />
    </>
  )
}
