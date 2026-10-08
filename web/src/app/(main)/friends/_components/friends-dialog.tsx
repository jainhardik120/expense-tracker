'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import Modal from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

import { CreateFriendForm } from '../../_components/friend-forms';

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

const inviteFields: FormField<z.infer<typeof inviteSchema>>[] = [
  { name: 'email', label: 'Their email', type: 'input', placeholder: 'name@example.com' },
];

const InviteButton = ({
  friend,
  refresh,
}: {
  friend: { id: string; name: string; email: string | null };
  refresh: () => Promise<void>;
}) => {
  const mutation = api.friends.inviteFriend.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Invite
        </Button>
      }
      customDescription={
        <p className="text-muted-foreground text-sm">
          Once {friend.name} accepts, what you split with them appears in their account too, and
          what they record about you appears in yours.
        </p>
      }
      defaultValues={{ email: friend.email ?? '' }}
      fields={inviteFields}
      mapInput={(values) => ({ friendId: friend.id, email: values.email })}
      mutation={mutation}
      refresh={refresh}
      schema={inviteSchema}
      successToast={(result) =>
        result.emailSent
          ? `Invitation sent to ${friend.name}`
          : `Invitation saved; the email could not be sent, but ${friend.name} will see it after signing in`
      }
      titleText={`Invite ${friend.name}`}
    />
  );
};

export const FriendsDialog = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const { data: friends = [] } = api.friends.getFriends.useQuery();
  const { data: invitations } = api.friends.getInvitations.useQuery();
  const revoke = api.friends.revokeInvitation.useMutation();
  const refresh = async () => {
    await Promise.all([
      utils.friends.getFriends.invalidate(),
      utils.friends.getInvitations.invalidate(),
    ]);
    router.refresh();
  };
  const pendingByFriend = new Map(
    (invitations?.outgoing ?? []).map((invitation) => [invitation.friendId, invitation]),
  );

  const onRevoke = (id: string) => {
    revoke
      .mutateAsync({ id })
      .then(refresh)
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const connected = friends.filter((friend) => friend.linkedUserId !== null).length;

  return (
    <Modal
      className="sm:max-w-xl"
      description="Connect a friend to their own account so neither of you types the same bill twice."
      open={open}
      setOpen={setOpen}
      title="Friends"
      trigger={
        <Button className="h-8" variant="outline">
          <Users className="size-4" />
          Friends
          {friends.length > 0 ? (
            <span className="text-muted-foreground">
              {connected}/{friends.length}
            </span>
          ) : null}
        </Button>
      }
    >
      <div className="flex justify-end">
        <CreateFriendForm refresh={refresh} />
      </div>
      <div className="flex max-h-[60svh] flex-col divide-y overflow-y-auto">
        {friends.map((friend) => {
          const pending = pendingByFriend.get(friend.id);
          let status: React.ReactNode;
          if (friend.linkedUserId !== null) {
            status = <Badge>Connected</Badge>;
          } else if (pending === undefined) {
            status = <InviteButton friend={friend} refresh={refresh} />;
          } else {
            status = (
              <>
                <Badge variant="secondary">Invited</Badge>
                <Button
                  disabled={revoke.isPending}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onRevoke(pending.id);
                  }}
                >
                  Cancel
                </Button>
              </>
            );
          }
          return (
            <div key={friend.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex flex-col">
                <span className="font-medium">{friend.name}</span>
                {friend.email !== null && (
                  <span className="text-muted-foreground text-sm">{friend.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2">{status}</div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
