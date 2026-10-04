'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ZonedDate } from '@/components/zoned-date';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

const NEW_FRIEND = 'new';

type Invitation = {
  id: string;
  inviterName: string;
  inviterEmail: string;
  createdAt: Date;
};

const InvitationRow = ({
  invitation,
  friends,
  canAccept,
}: {
  invitation: Invitation;
  friends: { id: string; name: string }[];
  canAccept: boolean;
}) => {
  const utils = api.useUtils();
  const router = useRouter();
  const suggested = friends.find(
    (friend) => friend.name.toLowerCase() === invitation.inviterName.toLowerCase(),
  );
  const [choice, setChoice] = useState(suggested?.id ?? NEW_FRIEND);
  const accept = api.friends.acceptInvitation.useMutation();
  const decline = api.friends.declineInvitation.useMutation();
  const refresh = async () => {
    await Promise.all([
      utils.friends.getInvitations.invalidate(),
      utils.friends.getFriends.invalidate(),
    ]);
    router.refresh();
  };

  const onAccept = () => {
    accept
      .mutateAsync({ id: invitation.id, friendId: choice === NEW_FRIEND ? null : choice })
      .then((result) => {
        toast.success(
          `Connected with ${invitation.inviterName}: ${result.splitsReceived} shared expenses added, ${result.transactionsToReview} transfers to review`,
        );
        return refresh();
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };
  const onDecline = () => {
    decline
      .mutateAsync({ id: invitation.id })
      .then(refresh)
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{invitation.inviterName}</span>
        <span className="text-muted-foreground text-sm">
          {invitation.inviterEmail} · invited <ZonedDate value={invitation.createdAt} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">In your account they are</span>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger className="w-48" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_FRIEND}>A new friend</SelectItem>
            {friends.map((friend) => (
              <SelectItem key={friend.id} value={friend.id}>
                {friend.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!canAccept || accept.isPending}
          size="sm"
          type="button"
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          disabled={decline.isPending}
          size="sm"
          type="button"
          variant="outline"
          onClick={onDecline}
        >
          Decline
        </Button>
      </div>
    </div>
  );
};

const InvitationsCard = () => {
  const { data } = api.friends.getInvitations.useQuery();
  const { data: friends = [] } = api.friends.getFriends.useQuery();
  if (data === undefined || data.incoming.length === 0) {
    return null;
  }
  const unlinked = friends.filter((friend) => friend.linkedUserId === null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>
          {data.canAccept
            ? 'Accepting adds the bills they split with you as expenses they paid, and lists money moved between you for you to review. Pick the friend you already record them as, so their history stays together.'
            : 'Verify your email address to accept invitations.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.incoming.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            canAccept={data.canAccept}
            friends={unlinked}
            invitation={invitation}
          />
        ))}
      </CardContent>
    </Card>
  );
};

export default InvitationsCard;
