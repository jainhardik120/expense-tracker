import { Badge } from '@/components/ui/badge';
import { type PaymentStatus } from '@/types';

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid',
  upcoming: 'Upcoming',
  missed: 'Missed',
};

const VARIANT: Record<PaymentStatus, 'default' | 'outline' | 'destructive'> = {
  paid: 'default',
  upcoming: 'outline',
  missed: 'destructive',
};

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge variant={VARIANT[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
);
