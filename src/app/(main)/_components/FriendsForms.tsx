import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { createFriendSchema, type Friend } from '@/types';

const fields: FormField<z.infer<typeof createFriendSchema>>[] = [
  {
    name: 'name',
    label: 'Name',
    type: 'input',
    placeholder: 'Name',
  },
];

export const CreateFriendForm = ({ refresh }: { refresh?: () => void }) => {
  const mutation = api.friends.createFriend.useMutation();
  return (
    <MutationModal
      button={<Button variant="outline">New Friend</Button>}
      defaultValues={{
        name: '',
      }}
      fields={fields}
      mutation={mutation}
      refresh={refresh}
      schema={createFriendSchema}
      successToast={(result) => `${result.length} friend(s) created`}
      titleText="Create Friend"
    />
  );
};

export const UpdateFriendForm = ({
  refresh,
  friendId,
  initialData,
}: {
  refresh?: () => void;
  friendId: string;
  initialData: Friend;
}) => {
  const mutation = api.friends.updateFriend.useMutation();
  return (
    <MutationModal
      button={<Button variant="outline">Update Friend</Button>}
      defaultValues={initialData}
      fields={fields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: friendId,
            createFriendSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createFriendSchema}
      successToast={(result) => `${result.length} friend(s) updated`}
      titleText="Update Friend"
    />
  );
};
