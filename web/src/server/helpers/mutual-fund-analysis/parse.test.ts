import { expect, test } from 'vitest';

import { parseCroreValue, parseEtfPage } from './parse';

test('parseCroreValue reads Groww market caps in crore', () => {
  expect(parseCroreValue('₹9,94,760Cr')).toBe(994_760);
  expect(parseCroreValue('₹1,234.5 Cr')).toBe(1234.5);
  expect(parseCroreValue(null)).toBeNull();
});

const etfPage = (pageProps: unknown) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps },
  })}</script></html>`;

test('parseEtfPage reads holdings and links them to stock pages', () => {
  const portfolio = parseEtfPage(
    etfPage({
      etfData: { header: { displayName: 'Nifty ETF', searchId: 'nifty-etf' } },
      etfInfoData: { amc: 'Nippon', category: 'EQUITY', benchmarkIndex: 'Nifty 50 TRI' },
      etfHoldingsData: {
        holdings: [
          { isin: 'INE1', holdingSharePercentage: 10.38 },
          { isin: 'INE2', holdingSharePercentage: 2 },
          { isin: 'INE3', holdingSharePercentage: null },
        ],
      },
      companyHeadersByIsin: { INE1: { displayName: 'HDFC Bank', searchId: 'hdfc-bank-ltd' } },
    }),
  );
  expect(portfolio).toMatchObject({
    providerId: 'nifty-etf',
    schemeName: 'Nifty ETF',
    fundHouse: 'Nippon',
    holdings: [
      {
        companyName: 'HDFC Bank',
        stockRef: 'hdfc-bank-ltd',
        assetType: 'EQUITY',
        weightPercent: 10.38,
      },
      { companyName: 'INE2', stockRef: null, assetType: 'EQUITY', weightPercent: 2 },
    ],
  });
});

test('parseEtfPage returns null when the page has no ETF data', () => {
  expect(parseEtfPage('<html></html>')).toBeNull();
  expect(parseEtfPage(etfPage({}))).toBeNull();
});
