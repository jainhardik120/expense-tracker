'use client';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { authClient } from '@/lib/auth-client';
import type { Row } from '@/lib/table';
import { useTRPCQuery } from '@/server/react';
import type { userSchema } from '@/types/user';

import type { z } from 'zod';

const ImpersonateUserButton = ({ row }: { row: Row<z.infer<typeof userSchema>> }) => {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await authClient.admin.impersonateUser({
          userId: row.original.id,
        });
        window.location.assign(new URL('/', window.location.origin));
      }}
    >
      Impersonate
    </Button>
  );
};

const Table = () => {
  const { data } = useTRPCQuery((trpc) => trpc.admin.getUsers.queryOptions({}));
  const { table } = useDataTable({
    data: data?.users ?? [],
    columns: [
      {
        accessorKey: 'name',
      },
      {
        accessorKey: 'email',
      },
      {
        accessorKey: 'createdAt',
      },
      {
        accessorKey: 'role',
      },
      {
        id: 'actions',
        header: '',
        cell: ImpersonateUserButton,
      },
    ],
    pageCount: -1,
  });
  return <DataTable getItemValue={(row) => row.id} table={table} />;
};

export default Table;
