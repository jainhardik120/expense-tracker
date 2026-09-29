import FriendsCard from './_components/friends-card';
import InboxCard from './_components/inbox-card';
import InvitationsCard from './_components/invitations-card';

export default function FriendsPage() {
  return (
    <div className="flex flex-col gap-4">
      <InvitationsCard />
      <InboxCard />
      <FriendsCard />
    </div>
  );
}
