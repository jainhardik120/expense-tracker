'use client';

import { useState } from 'react';

import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { authClient } from '@/lib/auth-client';

import type { ColumnDef } from '@tanstack/react-table';

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

const DeletePasskeyDialog = ({ id, refetch }: { id: string; refetch: () => void }) => {
  const [isDeletePasskey, setIsDeletePasskey] = useState<boolean>(false);
  return (
    <DeleteConfirmationDialog
      description="Are you sure you want to delete this passkey?"
      mutation={{
        mutateAsync: async () => {
          await authClient.passkey.deletePasskey({
            id: id,
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
        id: id,
      }}
      refresh={refetch}
      successToast={() => 'Passkey deleted successfully'}
      title="Delete Passkey"
    >
      <Button size="sm" variant="destructive">
        Delete
      </Button>
    </DeleteConfirmationDialog>
  );
};

const PasskeysColumns = (refetch: () => void): ColumnDef<Passkey>[] => [
  {
    id: 'name',
    header: 'Name',
    accessorFn: (row: Passkey) => row.name ?? 'My Passkey',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="text-right">
        <DeletePasskeyDialog id={row.original.id} refetch={refetch} />
      </div>
    ),
  },
];

const Passkeys = () => {
  const { data, refetch } = authClient.useListPasskeys();
  const [isLoading, setIsLoading] = useState(false);
  const handleAddPasskey = async (values: { name: string }) => {
    setIsLoading(true);
    await authClient.passkey.addPasskey(values);
    setIsLoading(false);
  };
  const columns = PasskeysColumns(refetch);

  const { table } = useDataTable({
    data: data ?? [],
    columns,
    pageCount: -1,
  });

  return (
    <div>
      <DataTable
        background={false}
        enablePagination={false}
        getItemValue={(r) => r.id}
        table={table}
      >
        <DataTableToolbar table={table} viewOptions={false}>
          <MutationModal
            button={
              <Button size="sm" variant="outline">
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
            refresh={async () => {
              await refetch();
            }}
            schema={z.object({
              name: z.string(),
            })}
            submitButtonText="Create Passkey"
            successToast={() => 'Passkey created successfully'}
            titleText="Create Passkey"
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};

export default Passkeys;
