/**
 * What the server works out about a bank message that the phone could not.
 *
 * The parser knows the name a payment went to; only the server knows whose
 * accounts those names belong to.
 */

/**
 * The message types the SMS parser produces.
 *
 * Restated rather than imported from `sms-bulk-import`: this module is covered
 * by the node test runner, which resolves no path aliases, and every other
 * tested module here is likewise free of local imports. Drift is caught at the
 * router, where `resolveSmsType` takes the request's zod enum and its result
 * goes straight into the column's own enum.
 */
type SmsType = 'income' | 'expense' | 'credit' | 'transfer' | 'investment';

/** Lowercased, with runs of whitespace and surrounding punctuation removed. */
const nameTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token !== '');

/**
 * Whether a payment went to, or came from, the account holder themselves.
 *
 * Money moved between one's own accounts is a transfer, and a bank has no way
 * to say so — it reports the payee name, which for a self transfer is the name
 * on the account. Compared as a set of words because banks disagree about the
 * order ("HARDIK JAIN", "JAIN HARDIK") and about how much whitespace to pad
 * with, and never loosely: a partial match would swallow every relative who
 * shares a surname.
 */
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
  // A single-word name is too weak to identify anyone by.
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

/**
 * The type to store for a message, once the account holder's own name is known.
 *
 * A self transfer has no single-statement form, so `transfer` is not a guess at
 * where the money went — it is the grid's signal to the user that this row needs
 * redirecting rather than filing.
 */
export const resolveSmsType = (
  parsedType: SmsType,
  merchant: string | null | undefined,
  accountHolder: string | null | undefined,
): SmsType =>
  parsedType !== 'investment' && isOwnAccountTransfer(merchant, accountHolder)
    ? 'transfer'
    : parsedType;
