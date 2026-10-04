import { LegalPage, legalPageMetadata } from '@/components/commerce/legal-page'
import { SiteFooter } from '@/components/commerce/site-footer'

export const metadata = legalPageMetadata({
  file: 'privacy.md',
  title: 'Privacy Policy',
  description: 'What Mudaala collects, what it never does with your number, and how your data is kept safe.',
})

export const dynamic = 'force-dynamic'

export default function PrivacyPage() {
  return (
    <>
      <LegalPage file="privacy.md" title="Privacy Policy" description="What Mudaala collects, what it never does with your number, and how your data is kept safe." />
      <SiteFooter />
    </>
  )
}
