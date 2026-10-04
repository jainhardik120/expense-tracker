type SmsType = 'income' | 'expense' | 'credit' | 'transfer' | 'investment';

const nameTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token !== '');

export const isOwnAccountTransfer = (
  merchant: string | null | undefined,
  accountHolder: string | null | undefined,
): boolean => {
  if (merchant === null || merchant === undefined) {
    return false;
  }
  if (accountHolder === null || accountHolder === undefined) {
    return false;
  }
  const holder = nameTokens(accountHolder);
  if (holder.length < 2) {
    return false;
  }
  const payee = nameTokens(merchant);
  if (payee.length !== holder.length) {
    return false;
  }
  const sorted = (tokens: string[]) => [...tokens].sort((a, b) => a.localeCompare(b)).join(' ');
  return sorted(payee) === sorted(holder);
};

export const resolveSmsType = (
  parsedType: SmsType,
  merchant: string | null | undefined,
  accountHolder: string | null | undefined,
): SmsType =>
  parsedType !== 'investment' && isOwnAccountTransfer(merchant, accountHolder)
    ? 'transfer'
    : parsedType;
