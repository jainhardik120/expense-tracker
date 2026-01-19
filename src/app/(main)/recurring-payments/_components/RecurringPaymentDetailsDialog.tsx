'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { Calendar, Eye } from 'lucide-react';

import Modal from '@/components/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import { type RecurringPayment } from '@/types';

const DATE_FORMAT = 'dd MMM yyyy';

type RecurringPaymentDetailsDialogProps = {
  recurringPayment: RecurringPayment;
};

const StatusBadge = ({ status }: { status: 'paid' | 'upcoming' | 'missed' }) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    paid: 'default',
    upcoming: 'outline',
    missed: 'destructive',
  };

  const labels: Record<string, string> = {
    paid: 'Paid',
    upcoming: 'Upcoming',
    missed: 'Missed',
  };

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
};

const LoadingState = () => (
  <div className="text-muted-foreground py-8 text-center text-sm">Loading details...</div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="py-8 text-center text-sm text-red-500">Error loading details: {message}</div>
);

export const RecurringPaymentDetailsDialog = ({
  recurringPayment,
}: RecurringPaymentDetailsDialogProps) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = api.recurringPayments.getRecurringPaymentDetails.useQuery(
    { recurringPaymentId: recurringPayment.id },
    { enabled: open },
  );

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState />;
    }

    if (error !== null) {
      return <ErrorState message={error.message} />;
    }

    if (data === undefined) {
      return null;
    }

    return (
      <ScrollArea className="max-h-[70vh]">
        <div className="space-y-6 pr-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Payment Summary</CardTitle>
              <CardDescription>Overview of this recurring payment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-sm">Expected Amount</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(data.recurringPayment.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Category</p>
                  <p className="text-lg font-semibold">{data.recurringPayment.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Status</p>
                  <Badge variant={data.isActive ? 'default' : 'secondary'}>
                    {data.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Next Payment</p>
                  <div className="flex items-center gap-1">
                    <Calendar className="text-muted-foreground h-4 w-4" />
                    <span className="text-lg font-semibold">
                      {data.nextPaymentDate !== null ? formatDate(data.nextPaymentDate) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Schedule Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Payment Schedule (Current Year)</CardTitle>
              <CardDescription>
                Scheduled payments and their status. Payments within ±25% of the period are matched
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.schedule.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No scheduled payments for the current year.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scheduled Date</TableHead>
                      <TableHead>Expected Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actual Payment</TableHead>
                      <TableHead>Amount Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.schedule.map((entry) => (
                      <TableRow key={entry.scheduledDate.toString()}>
                        <TableCell>{format(entry.scheduledDate, DATE_FORMAT)}</TableCell>
                        <TableCell>{formatCurrency(entry.expectedAmount)}</TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell>
                          {entry.linkedStatementDate !== null
                            ? format(entry.linkedStatementDate, DATE_FORMAT)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {entry.linkedStatementAmount !== null
                            ? formatCurrency(entry.linkedStatementAmount)
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Linked Statements */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Linked Statements</CardTitle>
              <CardDescription>All statements linked to this recurring payment</CardDescription>
            </CardHeader>
            <CardContent>
              {data.linkedStatements.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No statements linked yet. Link statements from the statements page.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.linkedStatements.map((stmt) => (
                      <TableRow key={stmt.id}>
                        <TableCell>{format(stmt.createdAt, DATE_FORMAT)}</TableCell>
                        <TableCell>{formatCurrency(stmt.amount)}</TableCell>
                        <TableCell>{stmt.category}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{stmt.statementKind}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  };

  return (
    <Modal
      className="sm:max-w-3xl"
      open={open}
      setOpen={setOpen}
      title={`${recurringPayment.name} - Payment Schedule`}
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <Eye />
        </Button>
      }
    >
      {renderContent()}
    </Modal>
  );
};
