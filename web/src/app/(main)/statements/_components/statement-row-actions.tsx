'use client';

import { Link2, SquarePen, SquareSlash, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { api } from '@/server/react';
import {
  type Account,
  type Friend,
  isSharedStatement,
  type SelfTransferStatement,
  type Statement,
} from '@/types';

import { UpdateSelfTransferStatementForm } from './self-transfer-statement-forms';
import { SendBackToReview } from './send-back-to-review';
import { UpdateStatementForm } from './statement-forms';
import { StatementLinkDialog } from './statement-link-dialog';
import { StatementSplitsDialog } from './statement-splits';

const DeleteButton = ({
  mutation,
  id,
  onRefresh,
}: {
  mutation: ReturnType<typeof api.statements.deleteStatement.useMutation>;
  id: string;
  onRefresh: () => void;
}) => (
  <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
    <RowActionTrigger destructive icon={Trash} label="Delete" />
  </DeleteConfirmationDialog>
);

export const StatementActions = ({
  statement,
  onRefresh,
  accountsData,
  friendsData,
  categories,
}: {
  statement: Statement;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const mutation = api.statements.deleteStatement.useMutation();
  const { id } = statement;

  if (isSharedStatement(statement)) {
    return (
      <RowActions>
        <UpdateStatementForm
          accountsData={accountsData}
          categories={categories}
          friendsData={friendsData}
          initialData={statement}
          refresh={onRefresh}
          statementId={id}
          trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
        />
        {statement.shareKind === 'answer' ? (
          <SendBackToReview id={id} onRefresh={onRefresh} />
        ) : null}
      </RowActions>
    );
  }

  return (
    <RowActions>
      {statement.statementKind === 'expense' ? (
        <StatementSplitsDialog
          statementData={statement}
          statementId={id}
          trigger={<RowActionTrigger icon={SquareSlash} label="Splits" />}
        />
      ) : null}
      <StatementLinkDialog
        statement={statement}
        trigger={<RowActionTrigger icon={Link2} label="Links" />}
        onRefresh={onRefresh}
      />
      <UpdateStatementForm
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
  );
};

export const SelfTransferStatementActions = ({
  statement,
  onRefresh,
  accountsData,
}: {
  statement: SelfTransferStatement;
  onRefresh: () => void;
  accountsData: Account[];
}) => {
  const mutation = api.statements.deleteSelfTransferStatement.useMutation();
  const { id } = statement;
  return (
    <RowActions>
      <UpdateSelfTransferStatementForm
        accountsData={accountsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
  );
};
