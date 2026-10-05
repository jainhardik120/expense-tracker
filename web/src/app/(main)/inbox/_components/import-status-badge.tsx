import { Badge } from '@/components/ui/badge';

export const ImportStatusBadge = ({ status }: { status: 'review' | 'applied' | 'discarded' }) => {
  if (status === 'review') {
    return <Badge>To review</Badge>;
  }
  if (status === 'applied') {
    return <Badge variant="secondary">Applied</Badge>;
  }
  return <Badge variant="outline">Discarded</Badge>;
};
