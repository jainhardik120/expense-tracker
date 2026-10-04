import type { RouterOutput } from '@/server/routers';

export type YearDetail = RouterOutput['budget']['getYearDetail'];
export type CardsWithOutstanding = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];
export type PendingSmsEstimate = RouterOutput['smsNotifications']['getPendingEstimate'];
export type CreditCards = RouterOutput['accounts']['getCreditCards'];
export type CreditCard = CreditCards[number];
