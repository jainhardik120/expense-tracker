'use client';

import { useState } from 'react';

import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth-client';

const Passkeys = () => {
  const { data, refetch } = authClient.useListPasskeys();
  const [isLoading, setIsLoading] = useState(false);
  const handleAddPasskey = async (values: { name: string }) => {
    setIsLoading(true);
    await authClient.passkey.addPasskey(values);
    setIsLoading(false);
  };
  const [isDeletePasskey, setIsDeletePasskey] = useState<boolean>(false);
  return (
    <div>
      {data !== null && data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((passkey) => {
              return (
                <TableRow key={passkey.id} className="flex items-center justify-between">
                  <TableCell>{passkey.name ?? 'My Passkey'}</TableCell>
                  <TableCell className="text-right">
                    <DeleteConfirmationDialog
                      description="Are you sure you want to delete this passkey?"
                      mutation={{
                        mutateAsync: async () => {
                          await authClient.passkey.deletePasskey({
                            id: passkey.id,
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
                        id: passkey.id,
                      }}
                      refresh={refetch}
                      successToast={() => 'Passkey deleted successfully'}
                      title="Delete Passkey"
                    >
                      <Button size="sm" variant="destructive">
                        Delete
                      </Button>
                    </DeleteConfirmationDialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
