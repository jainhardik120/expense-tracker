'use client';

import { createContext, useContext, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Copy, ExternalLink, FileUp, Mail, Paperclip, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ZonedDate } from '@/components/zoned-date';
import { useDataTable } from '@/hooks/use-data-table';
import { DATE_FORMAT } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { StatementImporter } from '../../_components/statement-importer';

type InboxState = RouterOutput['emailForwarding']['getInbox'];
type ActiveInbox = NonNullable<InboxState['inbox']>;
type InboundEmail = RouterOutput['emailForwarding']['listEmails'][number];

const GMAIL_FORWARDING_SETTINGS = 'https://mail.google.com/mail/u/0/#settings/fwdandpop';
const GMAIL_FILTER_SETTINGS = 'https://mail.google.com/mail/u/0/#settings/filters';

const STATEMENT_SENDERS = [
  'statements@axis.bank.in',
  'statements@axisbank.com',
  'credit_cards@icici.bank.in',
  'credit_cards@icicibank.com',
  'creditcard.estatements@indusind.com',
  'statements@sbicard.com',
  'estatement@yes.bank.in',
];

const GMAIL_FILTER_FROM = `{${STATEMENT_SENDERS.join(' ')}}`;

const copy = async (value: string, label: string) => {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
};

const StatusBadge = ({ email }: { email: InboundEmail }) => {
  if (email.status === 'received') {
    return <Badge variant="secondary">Received</Badge>;
  }
  if (email.status === 'confirmation') {
    return <Badge variant="outline">Gmail confirmation</Badge>;
  }
  return <Badge variant="destructive">Rejected</Badge>;
};

const EnableSection = () => {
  const router = useRouter();
  const enable = api.emailForwarding.enable.useMutation();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        You get a private address. Add one filter in Gmail that forwards your bank and card emails
        to it. The app never gets access to your mailbox: it only sees what your filter forwards,
        and you can stop it any time by deleting the filter.
      </p>
      <Button
        className="self-start"
        disabled={enable.isPending}
        onClick={() => {
          enable.mutate(undefined, {
            onSuccess: router.refresh,
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      >
        <Mail />
        Create my forwarding address
      </Button>
    </div>
  );
};

const Step = ({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) => (
  <li className="flex gap-3">
    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
      {number}
    </span>
    <div className="flex flex-col gap-1.5">
      <p className="font-medium">{title}</p>
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">{children}</div>
    </div>
  </li>
);

const ConfirmationCode = ({ inbox }: { inbox: ActiveInbox }) => {
  if (inbox.confirmationReceivedAt === null) {
    return (
      <p>
        Waiting for Gmail&apos;s confirmation email. It shows up here a few seconds after you add
        the address.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {inbox.confirmationCode === null ? null : (
        <>
          <code className="bg-muted text-foreground rounded px-2 py-1 font-mono text-base">
            {inbox.confirmationCode}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void copy(inbox.confirmationCode ?? '', 'Code');
            }}
          >
            <Copy />
            Copy code
          </Button>
        </>
      )}
      {inbox.confirmationUrl === null ? null : (
        <Button asChild size="sm" variant="outline">
          <a href={inbox.confirmationUrl} rel="noreferrer" target="_blank">
            <ExternalLink />
            Open confirmation link
          </a>
        </Button>
      )}
      <span className="text-xs">
        Received <ZonedDate pattern={DATE_FORMAT.dateTime} value={inbox.confirmationReceivedAt} />
      </span>
    </div>
  );
};

const SetupSection = ({ inbox }: { inbox: ActiveInbox }) => {
  const router = useRouter();
  const rotate = api.emailForwarding.rotate.useMutation();
  const disconnect = api.emailForwarding.disconnect.useMutation();
  const address = inbox.address ?? '';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-muted rounded px-3 py-2 font-mono text-sm break-all">{address}</code>
        <Button
          size="sm"
          onClick={() => {
            void copy(address, 'Address');
          }}
        >
          <Copy />
          Copy
        </Button>
      </div>
      <ol className="flex flex-col gap-5">
        <Step number={1} title="Add the address in Gmail">
          <p>
            Gmail → Settings → Forwarding and POP/IMAP → Add a forwarding address, and paste the
            address above.
          </p>
          <Button asChild className="self-start" size="sm" variant="outline">
            <a href={GMAIL_FORWARDING_SETTINGS} rel="noreferrer" target="_blank">
              <ExternalLink />
              Open Gmail forwarding settings
            </a>
          </Button>
        </Step>
        <Step number={2} title="Confirm it with the link Gmail sends">
          <ConfirmationCode inbox={inbox} />
        </Step>
        <Step number={3} title="Forward only your bank emails with a filter">
          <p>
            Leave &quot;Disable forwarding&quot; selected on the forwarding page. Instead, create a
            filter, paste this into its From field, then choose &quot;Forward it to&quot; this
            address. It covers every bank whose statements the app can read, and only matching
            emails are forwarded.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <code className="bg-muted rounded px-3 py-2 font-mono text-xs break-all">
              {GMAIL_FILTER_FROM}
            </code>
            <Button
              size="sm"
              onClick={() => {
                void copy(GMAIL_FILTER_FROM, 'Filter');
              }}
            >
              <Copy />
              Copy
            </Button>
          </div>
          <p>
            Filters only forward new mail. For statements you already have, download them and upload
            them on the Statements tab.
          </p>
          <Button asChild className="self-start" size="sm" variant="outline">
            <a href={GMAIL_FILTER_SETTINGS} rel="noreferrer" target="_blank">
              <ExternalLink />
              Open Gmail filters
            </a>
          </Button>
        </Step>
      </ol>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <DeleteConfirmationDialog
          description="You get a new address. Mail sent to the old one is dropped, so update the address in Gmail afterwards."
          mutation={rotate}
          mutationInput={undefined}
          refresh={router.refresh}
          successToast={() => 'New address created'}
          title="Create a new address?"
        >
          <Button size="sm" variant="outline">
            <RefreshCw />
            New address
          </Button>
        </DeleteConfirmationDialog>
        <DeleteConfirmationDialog
          description="The address stops working and every received email is deleted from the app. Remove the forwarding filter in Gmail too."
          mutation={disconnect}
          mutationInput={undefined}
          refresh={router.refresh}
          successToast={() => 'Email forwarding disconnected'}
          title="Disconnect email forwarding?"
        >
          <Button size="sm" variant="outline">
            <Unplug />
            Disconnect
          </Button>
        </DeleteConfirmationDialog>
      </div>
    </div>
  );
};

const ForwardingSetup = ({ inbox }: { inbox: ActiveInbox | null }) => {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      className="sm:max-w-2xl"
      description="Only emails your Gmail filter forwards reach the app."
      open={open}
      setOpen={setOpen}
      title={inbox === null ? 'Forward bank emails to the app' : 'Your forwarding address'}
      trigger={
        <Button className="h-8" variant={inbox === null ? 'default' : 'outline'}>
          <Mail className="size-4" />
          {inbox === null ? 'Set up forwarding' : 'Forwarding setup'}
        </Button>
      }
    >
      {inbox === null ? <EnableSection /> : <SetupSection inbox={inbox} />}
    </Modal>
  );
};

type AccountOption = { id: string; accountName: string };

const OUTCOME_HINTS: Partial<Record<string, string>> = {
  password: 'Needs the PDF password',
  account: 'Choose the account',
  failed: 'Could not be read',
};

const EmailStatement = ({
  email,
  accounts,
}: {
  email: InboundEmail;
  accounts: AccountOption[];
}) => {
  const linked =
    email.statementImports.at(0)?.id ??
    email.attachments.find((attachment) => attachment.importId !== undefined)?.importId;
  if (linked !== undefined) {
    const review = email.statementImports.at(0)?.status === 'review';
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={`/inbox/statements/${linked}`}>{review ? 'Review' : 'Open'}</Link>
      </Button>
    );
  }
  const pdfs = email.attachments.flatMap((attachment, index) =>
    (attachment.mimeType === 'application/pdf' ||
      attachment.filename.toLowerCase().endsWith('.pdf')) &&
    attachment.importOutcome !== 'not_statement'
      ? [
          {
            kind: 'email' as const,
            inboundEmailId: email.id,
            attachment: index,
            fileName: attachment.filename,
            outcome: attachment.importOutcome,
          },
        ]
      : [],
  );
  const notStatement = email.attachments.some(
    (attachment) => attachment.importOutcome === 'not_statement',
  );
  if (email.status !== 'received' || !email.storedRaw || pdfs.length === 0) {
    return notStatement ? (
      <span className="text-muted-foreground text-xs">Not a statement</span>
    ) : null;
  }
  const hint = pdfs
    .map((pdf) => (pdf.outcome === undefined ? undefined : OUTCOME_HINTS[pdf.outcome]))
    .find((value) => value !== undefined);
  return (
    <div className="flex items-center gap-2">
      <StatementImporter
        accounts={accounts}
        initialSources={pdfs.map(({ outcome: _outcome, ...source }) => source)}
        trigger={
          <Button size="sm" variant="outline">
            <FileUp className="size-4" />
            Import PDF
          </Button>
        }
      />
      {hint === undefined ? null : (
        <span className="text-xs text-amber-600 dark:text-amber-500">{hint}</span>
      )}
    </div>
  );
};

const AccountsContext = createContext<AccountOption[]>([]);

const StatementCell = ({ email }: { email: InboundEmail }) => (
  <EmailStatement accounts={useContext(AccountsContext)} email={email} />
);

const EMAIL_COLUMNS: Array<ColumnDef<InboundEmail>> = [
  {
    id: 'receivedAt',
    header: 'Received',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <ZonedDate pattern={DATE_FORMAT.dateTime} value={row.original.receivedAt} />
      </span>
    ),
    enableHiding: false,
  },
  {
    id: 'from',
    header: 'From',
    cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.fromAddress}</span>,
    meta: { label: 'From' },
  },
  {
    id: 'subject',
    header: 'Subject',
    cell: ({ row }) => (
      <div className="flex max-w-96 items-center gap-1.5">
        <span className="truncate">{row.original.subject}</span>
        {row.original.attachments.length > 0 ? (
          <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs">
            <Paperclip className="size-3" />
            {row.original.attachments.length}
          </span>
        ) : null}
      </div>
    ),
    meta: { label: 'Subject' },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <StatusBadge email={row.original} />
        {row.original.rejectReason === null ? null : (
          <span className="text-muted-foreground text-xs">{row.original.rejectReason}</span>
        )}
      </div>
    ),
    meta: { label: 'Status' },
  },
  {
    id: 'statement',
    header: 'Statement',
    cell: ({ row }) => <StatementCell email={row.original} />,
    meta: { label: 'Statement' },
  },
];

const EmailForwardingView = ({
  inbox,
  emails,
  accounts,
}: {
  inbox: InboxState;
  emails: InboundEmail[];
  accounts: AccountOption[];
}) => {
  const { table } = useDataTable({
    data: emails,
    columns: EMAIL_COLUMNS,
    pageCount: -1,
  });
  return (
    <AccountsContext value={accounts}>
      <DataTable enablePagination={false} getItemValue={(item) => item.id} table={table}>
        <DataTableToolbar table={table}>
          {inbox.configured ? (
            <ForwardingSetup inbox={inbox.inbox} />
          ) : (
            <span className="text-muted-foreground text-sm">
              Email forwarding is not configured on this server.
            </span>
          )}
        </DataTableToolbar>
      </DataTable>
    </AccountsContext>
  );
};

export default EmailForwardingView;
