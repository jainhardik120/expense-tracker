import { LegalShell } from '@/components/legal-shell';

import type { Metadata } from 'next';

const CONTACT_EMAIL = 'jainhardik120@gmail.com';

export const metadata: Metadata = {
  title: 'Delete Account | Expense Tracker',
  description: 'Instructions for requesting account deletion for Expense Tracker.',
};

export default function DeleteAccountPage() {
  return (
    <LegalShell
      eyebrow="Expense Tracker"
      intro={
        <p>
            If you want your Expense Tracker account and associated cloud data removed, send a
            deletion request from the email address associated with your account.
          </p>
      }
      sections={[
        {
          title: 'How to Request Deletion',
          body: (
            <>
              <p>
                Email{' '}
                <a
                  className="font-medium text-rose-700 underline underline-offset-4"
                  href={`mailto:${CONTACT_EMAIL}?subject=Expense%20Tracker%20Account%20Deletion`}
                >
                  {CONTACT_EMAIL}
                </a>{' '}
                with the subject line <strong>Expense Tracker Account Deletion</strong>.
              </p>
              <p>
                To help us verify the request, send it from your registered account email and
                include your name plus the platform you use.
              </p>
            </>
          ),
        },
        {
          title: 'What Gets Deleted',
          body: (
            <p>
                We will delete your account profile and data associated with Expense Tracker,
                including synced transaction records, account entries, friend entries, and related
                app data stored for your account.
              </p>
          ),
        },
        {
          title: 'Retention Exceptions',
          body: (
            <p>
                Minimal records may be retained where required for security, fraud prevention,
                abuse handling, or legal compliance. Backups may persist for a limited period before
                expiring naturally.
              </p>
          ),
        },
      ]}
      title="Account Deletion"
    />
  );
}
