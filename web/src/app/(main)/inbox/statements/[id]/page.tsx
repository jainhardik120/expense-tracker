import { api } from '@/server/server';

import { ImportReview } from './_components/import-review';

export default async function StatementReviewPage(
  props: Readonly<PageProps<'/inbox/statements/[id]'>>,
) {
  const { id } = await props.params;
  const [review, accounts, categories, tags] = await Promise.all([
    api.statementImports.getReview({ id }),
    api.accounts.getAccounts(),
    api.statements.getCategories({}),
    api.statements.getTags({}),
  ]);
  return (
    <ImportReview
      key={review.suggestions.map((suggestion) => suggestion.id).join()}
      accounts={accounts}
      categories={categories}
      review={review}
      tags={tags}
    />
  );
}
