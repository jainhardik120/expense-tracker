'use client';

import { useRouter } from 'next/navigation';

import { Copy, ExternalLink, Mail, Paperclip, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

type InboxState = RouterOutput['emailForwarding']['getInbox'];
type ActiveInbox = NonNullable<InboxState['inbox']>;
type InboundEmail = RouterOutput['emailForwarding']['listEmails'][number];

const GMAIL_FORWARDING_SETTINGS = 'https://mail.google.com/mail/u/0/#settings/fwdandpop';
const GMAIL_FILTER_SETTINGS = 'https://mail.google.com/mail/u/0/#settings/filters';

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

const EnableCard = () => {
  const router = useRouter();
  const enable = api.emailForwarding.enable.useMutation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forward bank emails to the app</CardTitle>
        <CardDescription>
          You get a private address. Add one filter in Gmail that forwards your bank and card emails
          to it. The app never gets access to your mailbox: it only sees what your filter forwards,
          and you can stop it any time by deleting the filter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
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
      </CardContent>
    </Card>
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

const SetupCard = ({ inbox }: { inbox: ActiveInbox }) => {
  const router = useRouter();
  const rotate = api.emailForwarding.rotate.useMutation();
  const disconnect = api.emailForwarding.disconnect.useMutation();
  const address = inbox.address ?? '';
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Your forwarding address</CardTitle>
          <CardDescription>
            Only emails your Gmail filter forwards reach the app. Raw emails are deleted after
            processing.
          </CardDescription>
        </div>
        <div className="flex gap-2">
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
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
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
              Leave &quot;Disable forwarding&quot; selected on the forwarding page. Instead, create
              a filter whose From field lists your banks&apos; sender addresses, then choose
              &quot;Forward it to&quot; this address. Only matching emails are forwarded.
            </p>
            <Button asChild className="self-start" size="sm" variant="outline">
              <a href={GMAIL_FILTER_SETTINGS} rel="noreferrer" target="_blank">
                <ExternalLink />
                Open Gmail filters
              </a>
            </Button>
          </Step>
        </ol>
      </CardContent>
    </Card>
  );
};

const ReceivedEmails = ({ emails }: { emails: InboundEmail[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Emails received</CardTitle>
      <CardDescription>
        Every email that reached your address, and whether it was accepted. The last 100 are shown.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {emails.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing received yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => (
              <TableRow key={email.id}>
                <TableCell className="whitespace-nowrap">
                  <ZonedDate pattern={DATE_FORMAT.dateTime} value={email.receivedAt} />
                </TableCell>
                <TableCell className="max-w-56 truncate">{email.fromAddress}</TableCell>
                <TableCell className="max-w-96">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{email.subject}</span>
                    {email.attachments.length > 0 ? (
                      <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs">
                        <Paperclip className="size-3" />
                        {email.attachments.length}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge email={email} />
                    {email.rejectReason === null ? null : (
                      <span className="text-muted-foreground text-xs">{email.rejectReason}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

const EmailForwardingView = ({ inbox, emails }: { inbox: InboxState; emails: InboundEmail[] }) => {
  if (!inbox.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email forwarding</CardTitle>
          <CardDescription>Email forwarding is not configured on this server.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {inbox.inbox === null ? <EnableCard /> : <SetupCard inbox={inbox.inbox} />}
      <ReceivedEmails emails={emails} />
    </div>
  );
};

export default EmailForwardingView;
