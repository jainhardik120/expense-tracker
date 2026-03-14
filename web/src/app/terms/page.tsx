import Link from 'next/link';

import { LegalShell } from '@/components/legal-shell';

import type { Metadata } from 'next';

const CONTACT_EMAIL = 'jainhardik120@gmail.com';

export const metadata: Metadata = {
  title: 'Terms of Service | Expense Tracker',
  description: 'Terms of service for the Expense Tracker Android app and web app.',
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Expense Tracker"
      footer={
        <p>
          Questions about these terms can be sent to{' '}
          <a className="font-medium text-rose-300 underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      }
      intro={
        <>
          <p>
            These terms govern your use of Expense Tracker on Android and the web. By using the
            service, you agree to these terms.
          </p>
          <p>
            Effective date: March 14, 2026.
          </p>
        </>
      }
      sections={[
        {
          title: 'Using the Service',
          body: (
            <>
              <p>
                Expense Tracker is a personal finance logging and organization tool. You may use it
                to record transactions, manage account balances, parse supported transaction SMS
                messages, and review summaries.
              </p>
              <p>
                You are responsible for keeping your account credentials secure and for the
                accuracy of any information you enter or import.
              </p>
            </>
          ),
        },
        {
          title: 'Acceptable Use',
          body: (
            <p>
                You may not use Expense Tracker to break the law, interfere with service
                availability, access another person&apos;s data without permission, or reverse
                engineer the service in a way that harms the platform or other users.
              </p>
          ),
        },
        {
          title: 'No Financial Advice',
          body: (
            <p>
                Expense Tracker provides organization and reporting tools only. It does not provide
                legal, tax, investment, or financial advice, and you should verify all important
                decisions independently.
              </p>
          ),
        },
        {
          title: 'Availability and Changes',
          body: (
            <p>
                We may update, suspend, or discontinue features as the product evolves. We may also
                update these terms when required by product, legal, or operational changes.
              </p>
          ),
        },
        {
          title: 'Account Closure',
          body: (
            <p>
                You can request account deletion at any time using the instructions on the{' '}
                <Link className="font-medium text-rose-700 underline underline-offset-4" href="/delete-account">
                  account deletion page
                </Link>
                .
              </p>
          ),
        },
      ]}
      title="Terms of Service"
    />
  );
}
