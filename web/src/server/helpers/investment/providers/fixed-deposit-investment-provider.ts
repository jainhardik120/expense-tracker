import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  ProviderTarget,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import { createInstrumentKey } from '../shared';

const fdInstruments = [
  { code: 'SBI_FD', name: 'State Bank of India FD' },
  { code: 'HDFC_FD', name: 'HDFC Bank FD' },
  { code: 'ICICI_FD', name: 'ICICI Bank FD' },
  { code: 'AXIS_FD', name: 'Axis Bank FD' },
  { code: 'KOTAK_FD', name: 'Kotak Mahindra Bank FD' },
  { code: 'BOB_FD', name: 'Bank of Baroda FD' },
  { code: 'PNB_FD', name: 'Punjab National Bank FD' },
  { code: 'IDFC_FD', name: 'IDFC FIRST Bank FD' },
  { code: 'INDUSIND_FD', name: 'IndusInd Bank FD' },
  { code: 'YES_FD', name: 'Yes Bank FD' },
];

export class FixedDepositInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'fixed-deposit';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'fd';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const normalized = query.toLowerCase().trim();
    return fdInstruments
      .filter((fd) => {
        return (
          fd.code.toLowerCase().includes(normalized) || fd.name.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 20)
      .map((fd) => ({
        code: fd.code,
        name: fd.name,
        kind: 'fd',
        source: 'internal',
      }));
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const fdNameByCode = new Map(
      fdInstruments.map((instrument) => [instrument.code, instrument.name]),
    );
    const names = new Map<string, string>();

    for (const instrument of instruments) {
      const normalizedCode = instrument.code.trim();
      if (normalizedCode === '') {
        continue;
      }
      const resolvedName = fdNameByCode.get(normalizedCode);
      if (resolvedName !== undefined) {
        names.set(createInstrumentKey('fd', normalizedCode, null), resolvedName);
      }
    }

    return names;
  }
}
