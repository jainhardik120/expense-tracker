'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/server/react';

import CreateAccountForm from './CreateAccountForm';

const AccountsTable = () => {
  const accounts = api.accounts.getAccounts.useQuery();
  return (
    <div>
      <CreateAccountForm refresh={accounts.refetch} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Account Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.data?.map((account) => (
            <TableRow key={account.id}>
              <TableCell className="font-medium">{account.accountName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AccountsTable;
