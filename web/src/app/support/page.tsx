import Link from 'next/link';

import { LegalShell } from '@/components/legal-shell';

import type { Metadata } from 'next';

const CONTACT_EMAIL = 'jainhardik120@gmail.com';

export const metadata: Metadata = {
  title: 'Support | Expense Tracker',
  description: 'Support and contact information for Expense Tracker.',
};

export default function SupportPage() {
  return (
    <LegalShell
      eyebrow="Expense Tracker"
      intro={
        <p>
            Need help with sign-in, SMS permissions, transaction sync, or deleting your account?
            This page is the support landing page for the Expense Tracker Android app and web app.
          </p>
      }
      sections={[
        {
          title: 'What the App Does',
          body: (
            <p>
                Expense Tracker helps you monitor expenses, outside transactions, friend
                settlements, balances, and transfers across multiple accounts. On Android, it can
                also parse supported bank SMS messages to speed up transaction logging.
              </p>
          ),
        },
        {
          title: 'Common Issues',
          body: (
            <>
              <p>
                If SMS imports are not working, verify that SMS permissions are granted and that
                your device is receiving supported transaction messages normally.
              </p>
              <p>
                If the app cannot sync, sign out and sign back in, then confirm you can access the
                same account on the web app.
              </p>
            </>
          ),
        },
        {
          title: 'Contact Support',
          body: (
            <p>
                Email{' '}
                <a
                  className="font-medium text-rose-700 underline underline-offset-4"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>{' '}
                and include your device model, Android version, and a short description of the
                issue.
              </p>
          ),
        },
        {
          title: 'Useful Links',
          body: (
            <>
              <p>
                Privacy policy:{' '}
                <Link className="font-medium text-rose-700 underline underline-offset-4" href="/privacy">
                  /privacy
                </Link>
              </p>
              <p>
                Terms of service:{' '}
                <Link className="font-medium text-rose-700 underline underline-offset-4" href="/terms">
                  /terms
                </Link>
              </p>
              <p>
                Account deletion:{' '}
                <Link
                  className="font-medium text-rose-700 underline underline-offset-4"
                  href="/delete-account"
                >
                  /delete-account
                </Link>
              </p>
            </>
          ),
        },
      ]}
      title="Support"
    />
  );
}
