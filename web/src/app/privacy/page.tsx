import Link from 'next/link';

import { LegalShell } from '@/components/legal-shell';

import type { Metadata } from 'next';

const CONTACT_EMAIL = 'jainhardik120@gmail.com';

export const metadata: Metadata = {
  title: 'Privacy Policy | Expense Tracker',
  description: 'Privacy policy for the Expense Tracker Android app and web app.',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Expense Tracker"
      footer={
        <p>
          If we make material changes to this policy, we will update this page with a new effective
          date.
        </p>
      }
      intro={
        <>
          <p>
            Expense Tracker helps you monitor balances, track spending, log self transfers, and
            manage shared expenses with friends. This policy explains what information the app
            processes, why it is used, and how you can contact us.
          </p>
          <p>
            Effective date: March 14, 2026.
          </p>
        </>
      }
      sections={[
        {
          title: 'Information We Process',
          body: (
            <>
              <p>
                Expense Tracker can process account names, balances, manually entered transactions,
                shared-expense details, tags, categories, and authentication data needed to sign you
                in and sync your data.
              </p>
              <p>
                If you grant SMS access on Android, the app also processes incoming transaction SMS
                messages so it can detect spending activity, identify accounts, and help you record
                transactions faster. Notification permission is used to surface relevant app
                activity.
              </p>
            </>
          ),
        },
        {
          title: 'How We Use Information',
          body: (
            <>
              <p>
                We use processed information to authenticate your account, sync your data across
                devices, detect transactions from supported SMS formats, calculate balances,
                generate summaries, and improve reliability and security.
              </p>
              <p>
                We do not use your financial data for advertising profiles, and the app does not
                request the Google advertising ID for ad targeting.
              </p>
            </>
          ),
        },
        {
          title: 'Sharing and Storage',
          body: (
            <>
              <p>
                Your data is stored on infrastructure used to operate Expense Tracker. Data may be
                processed by service providers that support authentication, hosting, analytics, or
                email delivery, strictly for operating the service.
              </p>
              <p>
                We do not sell your personal data. We may disclose information if required by law,
                to protect users, or to secure the service.
              </p>
            </>
          ),
        },
        {
          title: 'Permissions',
          body: (
            <>
              <p>
                <strong>READ_SMS</strong> and <strong>RECEIVE_SMS</strong> are used to parse
                transaction messages and help you record account activity.
              </p>
              <p>
                <strong>POST_NOTIFICATIONS</strong> is used to show app notifications where
                supported by Android.
              </p>
            </>
          ),
        },
        {
          title: 'Your Choices',
          body: (
            <p>
                You can revoke SMS or notification permissions from Android settings at any time.
                You can also contact us to request account deletion using the instructions on the{' '}
                <Link className="font-medium text-rose-700 underline underline-offset-4" href="/delete-account">
                  account deletion page
                </Link>
                .
              </p>
          ),
        },
        {
          title: 'Contact',
          body: (
            <p>
                For privacy questions, email{' '}
                <a
                  className="font-medium text-rose-700 underline underline-offset-4"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
          ),
        },
      ]}
      title="Privacy Policy"
    />
  );
}
