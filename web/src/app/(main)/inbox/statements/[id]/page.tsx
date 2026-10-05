import { api } from '@/server/server';

import { ImportReview } from './_components/import-review';

export default async function StatementReviewPage(
  props: Readonly<PageProps<'/inbox/statements/[id]'>>,
) {
  const { id } = await props.params;
  const [review, accounts, categories] = await Promise.all([
    api.statementImports.getReview({ id }),
    api.accounts.getAccounts(),
    api.statements.getCategories({}),
  ]);
  return <ImportReview accounts={accounts} categories={categories} review={review} />;
}
