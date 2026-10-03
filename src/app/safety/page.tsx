import { LegalPage, legalPageMetadata } from '@/components/commerce/legal-page'

export const metadata = legalPageMetadata({
  file: 'safety.md',
  title: 'Safety Guide',
  description: 'Meet in public, check the goods before you pay, never pay in advance, and how to report a bad ad.',
})

export const dynamic = 'force-dynamic'

export default function SafetyPage() {
  return <LegalPage file="safety.md" title="Safety Guide" description="Meet in public, check the goods before you pay, never pay in advance. Learn how to report a bad ad." />
}
