'use client';

import { useState } from 'react';

import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { authClient } from '@/lib/auth-client';

type Passkey = {
  id: string;
  name?: string;
  publicKey: string;
  userId: string;
  credentialID: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string;
  createdAt: Date;
};

const Passkeys = () => {
  const { data, refetch } = authClient.useListPasskeys();
  const [isLoading, setIsLoading] = useState(false);
  const handleAddPasskey = async (values: { name: string }) => {
    setIsLoading(true);
    await authClient.passkey.addPasskey(values);
    setIsLoading(false);
  };
  const [isDeletePasskey, setIsDeletePasskey] = useState<boolean>(false);

  const { table } = useDataTable({
    data: data ?? [],
    columns: [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row: Passkey) => row.name ?? 'My Passkey',
      },
      {
        id: 'actions',
        header: '',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) => (
          <div className="text-right">
            <DeleteConfirmationDialog
              description="Are you sure you want to delete this passkey?"
              mutation={{
                mutateAsync: async () => {
                  await authClient.passkey.deletePasskey({
                    id: row.original.id,
                    fetchOptions: {
                      onRequest: () => {
                        setIsDeletePasskey(true);
                      },
                      onSuccess: () => {
                        setIsDeletePasskey(false);
                      },
                      onError: (error) => {
                        toast.error(error.error.message);
                        setIsDeletePasskey(false);
                      },
                    },
                  });
                },
                isPending: isDeletePasskey,
              }}
              mutationInput={{
                id: row.original.id,
              }}
              refresh={refetch}
              successToast={() => 'Passkey deleted successfully'}
              title="Delete Passkey"
            >
              <Button size="sm" variant="destructive">
                Delete
              </Button>
            </DeleteConfirmationDialog>
          </div>
        ),
      },
    ],
    pageCount: -1,
  });

  return (
    <div>
      {data !== null && data.length > 0 ? (
        <DataTable
          background={false}
          enablePagination={false}
          getItemValue={(r) => r.id}
          table={table}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No passkeys found</p>
      )}
      <MutationModal
        button={
          <Button className="text-xs md:text-sm" variant="outline">
            <Fingerprint className="mr-2 h-4 w-4" />
            Create Passkey
          </Button>
        }
        defaultValues={{
          name: '',
        }}
        fields={[
          {
            name: 'name',
            label: 'Passkey Name',
            type: 'input',
            placeholder: 'Passkey Name',
          },
        ]}
        mutation={{
          mutateAsync: handleAddPasskey,
          isPending: isLoading,
        }}
        refresh={refetch}
        schema={z.object({
          name: z.string(),
        })}
        submitButtonText="Create Passkey"
        successToast={() => 'Passkey created successfully'}
        titleText="Create Passkey"
      />
    </div>
  );
};

export default Passkeys;
