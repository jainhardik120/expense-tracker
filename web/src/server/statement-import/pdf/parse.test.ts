import { describe, expect, test } from 'vitest';

import { type PdfLine } from './extract';
import { isReconciled, parseStatementLines, UnsupportedStatementError } from './parse';
import { parseAmount, parseDate } from './values';

type Cells = Array<[number, string]>;

const page = (number: number, rows: Array<[number, Cells]>): PdfLine[] =>
  rows.map(([y, cells]) => ({
    page: number,
    y,
    cells: cells.map(([x, text]) => ({ x, text })),
    text: cells.map(([, text]) => text).join('  '),
  }));

describe('values', () => {
  test('parses statement dates and amounts', () => {
    expect(parseDate('05/01/2026')).toBe('2026-01-05');
    expect(parseDate('September 30, 2026')).toBe('2026-09-30');
    expect(parseAmount('`2,70,000.00')).toEqual({ value: 270000, marker: null });
    expect(parseAmount('Rs. 12,573.92 Dr')).toEqual({ value: 12573.92, marker: 'dr' });
    expect(parseAmount('834.00 CR')).toEqual({ value: 834, marker: 'cr' });
    expect(parseAmount('14')).toBeNull();
  });
});

describe('ICICI credit card', () => {
  const lines = [
    ...page(1, [
      [800, [[38, 'CREDIT CARD STATEMENT']]],
      [790, [[38, 'MR TEST USER']]],
      [700, [[79, 'STATEMENT DATE']]],
      [690, [[64, 'September 12, 2026']]],
      [680, [[75, 'PAYMENT DUE DATE']]],
      [670, [[63, 'September 30, 2026']]],
      [
        660,
        [
          [81, 'Total Amount due'],
          [221, 'Previous Balance'],
          [306, 'Purchases / Charges'],
          [404, 'Cash Advances'],
          [488, 'Payments / Credits'],
        ],
      ],
      [650, [[87, '`900.00']]],
      [
        645,
        [
          [229, '`1,000.00'],
          [318, '`1,400.00'],
          [418, '`0.00'],
          [496, '`1,500.00'],
        ],
      ],
      [640, [[73, 'Minimum Amount due']]],
      [635, [[92, '`100.00']]],
      [630, [[208, 'Credit Limit (Including cash)']]],
      [625, [[222, '`50,000.00']]],
      [
        600,
        [
          [89, 'SPENDS OVERVIEW'],
          [208, 'Date'],
          [262, 'SerNo.'],
          [305, 'Transaction Details'],
          [443, 'Reward'],
          [486, 'Intl.'],
          [522, 'Amount (in`)'],
        ],
      ],
      [590, [[208, '1234XXXXXXXX5678']]],
      [
        580,
        [
          [91, '17%'],
          [208, '14/08/2026'],
          [252, '111'],
          [305, 'FOOD STORE BANGALORE'],
          [450, '37'],
          [538, '1,400.00'],
        ],
      ],
      [571, [[305, 'IN']]],
      [
        560,
        [
          [208, '25/08/2026'],
          [252, '112'],
          [305, 'BBPS Payment received'],
          [452, '0'],
          [520, '1,500.00 CR'],
        ],
      ],
      [540, [[38, 'Statement period : August 13, 2026 to September 12, 2026']]],
    ]),
    ...page(2, [[700, [[38, 'ICICI Bank Tower, registered office']]]]),
  ];

  test('reads the summary, dates and transactions', () => {
    const statement = parseStatementLines(lines);
    expect(statement).toMatchObject({
      issuer: 'icici',
      cardLast4: '5678',
      statementDate: '2026-09-12',
      dueDate: '2026-09-30',
      periodStart: '2026-08-13',
      periodEnd: '2026-09-12',
      previousBalance: 1000,
      totalDue: 900,
      minimumDue: 100,
      creditLimit: 50000,
      declared: { debits: 1400, credits: 1500 },
    });
    expect(statement.transactions).toEqual([
      {
        date: '2026-08-14',
        description: 'FOOD STORE BANGALORE IN',
        category: null,
        amount: 1400,
        direction: 'debit',
        emi: null,
      },
      {
        date: '2026-08-25',
        description: 'BBPS Payment received',
        category: null,
        amount: 1500,
        direction: 'credit',
        emi: null,
      },
    ]);
    expect(isReconciled(statement)).toBe(true);
    expect(statement.balanceCheck?.difference).toBe(0);
  });

  test('flags a statement whose rows do not add up to its totals', () => {
    const statement = parseStatementLines(lines.filter((line) => !line.text.includes('BBPS')));
    expect(isReconciled(statement)).toBe(false);
    expect(statement.reconciliation).toEqual({ debitsDifference: 0, creditsDifference: -1500 });
  });
});

describe('YES BANK credit card', () => {
  const header: Cells = [
    [48, 'Date'],
    [93, 'Transaction Details'],
    [377, 'Merchant Category'],
    [491, 'Amount (Rs.)'],
  ];
  const lines = [
    ...page(1, [
      [800, [[228, 'Credit Card Statement']]],
      [790, [[259, 'YES BANK KLICK']]],
      [780, [[73, 'Statement for YES BANK Card Number 1234XXXXXXXX4321']]],
      [770, [[400, 'Previous Balance :']]],
      [760, [[400, 'Rs. 100.00 Dr']]],
      [
        750,
        [
          [128, 'Statement Period:'],
          [325, 'Credit Limit:'],
        ],
      ],
      [
        740,
        [
          [102, '15/08/2026 To 14/09/2026'],
          [316, 'Rs. 50,000.00'],
        ],
      ],
      [730, [[400, 'Current Purchases / Cash Advance']]],
      [720, [[400, '& Other Charges :']]],
      [
        710,
        [
          [91, 'Statement Date : 14/09/2026'],
          [400, 'Rs. 1,370.00 Dr'],
        ],
      ],
      [700, [[125, 'Total Amount Due:']]],
      [690, [[146, 'Rs. 470.00']]],
      [680, [[400, 'Payment & Credits Received :']]],
      [
        670,
        [
          [109, 'Minimum Amount Due:'],
          [400, 'Rs. 1,000.00 Cr'],
        ],
      ],
      [660, [[151, 'Rs. 50.00']]],
      [650, [[81, 'Payment Due Date: 04/10/2026']]],
      [600, header],
      [
        590,
        [
          [48, '16/08/2026 UPI_SHOP IND - Ref No: RT1'],
          [377, 'Retail Outlet Services'],
          [512, '370.00 Dr'],
        ],
      ],
      [580, [[376, 'Schools and Educational']]],
      [
        572,
        [
          [48, '23/08/2026 UPI_COLLEGE IND - Ref No: RT2'],
          [376, 'Services ( Not Elsewhere'],
          [516, '1,000.00 Dr'],
        ],
      ],
      [564, [[376, 'Classified)']]],
    ]),
    ...page(2, [
      [800, [[227, 'Credit Card Statement']]],
      [790, header],
      [780, [[93, 'PAYMENT RECEIVED BBPS - Ref No:']]],
      [
        772,
        [
          [48, '25/08/2026'],
          [500, '1,000.00 Cr'],
        ],
      ],
      [764, [[93, '0999']]],
    ]),
  ];

  test('joins wrapped descriptions and categories to the right rows', () => {
    const statement = parseStatementLines(lines);
    expect(statement).toMatchObject({
      issuer: 'yes',
      cardLast4: '4321',
      statementDate: '2026-09-14',
      dueDate: '2026-10-04',
      periodStart: '2026-08-15',
      periodEnd: '2026-09-14',
      previousBalance: 100,
      totalDue: 470,
      minimumDue: 50,
      creditLimit: 50000,
    });
    expect(
      statement.transactions.map((row) => [row.description, row.category, row.direction]),
    ).toEqual([
      ['UPI_SHOP IND - Ref No: RT1', 'Retail Outlet Services', 'debit'],
      [
        'UPI_COLLEGE IND - Ref No: RT2',
        'Schools and Educational Services ( Not Elsewhere Classified)',
        'debit',
      ],
      ['PAYMENT RECEIVED BBPS - Ref No: 0999', null, 'credit'],
    ]);
    expect(isReconciled(statement)).toBe(true);
  });
});

describe('IndusInd credit card', () => {
  const lines = page(1, [
    [800, [[24, 'CRED IndusInd Bank RuPay Credit Card']]],
    [790, [[478, 'Previous Balance']]],
    [785, [[484, '255.00 DR']]],
    [780, [[462, 'Purchases & Other Charges']]],
    [775, [[491, '274.00']]],
    [770, [[483, 'Cash Advance']]],
    [765, [[495, '0.00']]],
    [760, [[463, 'Payments & Other Credits']]],
    [
      755,
      [
        [89, 'Credit Limit'],
        [166, 'Available Credit Limit'],
      ],
    ],
    [750, [[491, '255.00']]],
    [745, [[87, '50,000.00']]],
    [740, [[469, 'Total Amount Due']]],
    [735, [[484, '274.00 DR']]],
    [730, [[461, 'Minimum Amount Due']]],
    [725, [[491, '100.00']]],
    [720, [[467, 'Payment Due Date']]],
    [715, [[483, '12/10/2026']]],
    [710, [[477, 'Statement Period']]],
    [
      700,
      [
        [41, 'Date'],
        [117, 'Transaction Details'],
        [232, 'Merchant Category'],
        [316, 'CRED Points'],
        [376, 'Amount (in `)'],
      ],
    ],
    [695, [[456, '23/08/2026 To 22/09/2026']]],
    [690, [[26, 'Payment Details for MR TEST USER (Credit Card No. 1234XXXXXXXX8744)']]],
    [
      680,
      [
        [26, '25/08/2026'],
        [72, 'BBPS PAYMENT'],
        [333, '0'],
        [392, '255.00 CR'],
        [479, 'Statement Date'],
      ],
    ],
    [672, [[483, '22/09/2026']]],
    [
      660,
      [
        [26, '09/09/2026'],
        [72, 'UPI GROCER 6618'],
        [222, 'GROCERY &'],
        [331, '14'],
        [392, '274.00 DR'],
        [484, '274.00 DR'],
      ],
    ],
    [652, [[222, 'SUPERMARKET']]],
    [
      640,
      [
        [26, 'Total'],
        [388, '274.00'],
      ],
    ],
  ]);

  test('ignores the summary panel on the right of the table', () => {
    const statement = parseStatementLines(lines);
    expect(statement).toMatchObject({
      issuer: 'indusind',
      cardLast4: '8744',
      statementDate: '2026-09-22',
      dueDate: '2026-10-12',
      periodStart: '2026-08-23',
      periodEnd: '2026-09-22',
      previousBalance: 255,
      totalDue: 274,
      creditLimit: 50000,
    });
    expect(statement.transactions).toEqual([
      {
        date: '2026-08-25',
        description: 'BBPS PAYMENT',
        category: null,
        amount: 255,
        direction: 'credit',
        emi: null,
      },
      {
        date: '2026-09-09',
        description: 'UPI GROCER 6618',
        category: 'GROCERY & SUPERMARKET',
        amount: 274,
        direction: 'debit',
        emi: null,
      },
    ]);
    expect(isReconciled(statement)).toBe(true);
  });
});

describe('SBI credit card', () => {
  const lines = page(1, [
    [800, [[19, 'GSTIN of SBI Card : 06TEST']]],
    [
      790,
      [
        [47, 'TEST USER'],
        [323, 'Credit Card Number'],
      ],
    ],
    [785, [[317, 'XXXX XXXX XXXX XX80']]],
    [780, [[322, '*Total Amount Due ( ` )']]],
    [775, [[336, '1,700.00']]],
    [770, [[314, '**Minimum Amount Due ( ` )']]],
    [760, [[343, '600.00']]],
    [
      750,
      [
        [43, 'Credit Limit ( ` ) (including cash)'],
        [331, 'Statement Date'],
      ],
    ],
    [
      745,
      [
        [66, '97,000.00'],
        [334, '17 Oct 2025'],
      ],
    ],
    [740, [[328, 'Payment Due Date']]],
    [735, [[333, '06 Nov 2025']]],
    [730, [[124, 'Payments,']]],
    [
      725,
      [
        [30, 'Previous Balance'],
        [357, 'Total Outstanding'],
      ],
    ],
    [
      720,
      [
        [112, 'Reversals & other'],
        [191, 'Purchases & Other'],
        [279, 'Fee, Taxes &'],
      ],
    ],
    [
      715,
      [
        [51, '( ` )'],
        [130, 'Credits ( ` )'],
        [212, 'Debits'],
        [274, 'Interest Charges ( ` )'],
      ],
    ],
    [
      710,
      [
        [46, '500.00'],
        [128, '500.00'],
        [208, '7,000.00'],
        [285, '118.00'],
        [370, '6,118.00'],
      ],
    ],
    [
      600,
      [
        [33, 'Date'],
        [176, 'Transaction Details'],
        [369, 'Amount ( ` )'],
      ],
    ],
    [595, [[155, 'for Statement Period: 18 Sep 25 to 17 Oct 25']]],
    [
      590,
      [
        [18, '21 Sep 25'],
        [66, 'PAYMENT RECEIVED 0001'],
        [378, '500.00'],
        [418, 'C'],
      ],
    ],
    [
      580,
      [
        [18, '17 Oct 25'],
        [66, 'FP EMI 01/06(EXCL TAX'],
        [157, '18.00)'],
        [371, '1,000.00'],
        [416, 'M'],
      ],
    ],
    [
      570,
      [
        [18, '17 Oct 25'],
        [66, 'INTEREST ON EMI'],
        [378, '100.00'],
        [418, 'D'],
      ],
    ],
    [
      560,
      [
        [66, 'IGST DB @ 18.00%'],
        [382, '18.00'],
        [418, 'D'],
      ],
    ],
    [550, [[66, 'TRANSACTIONS FOR TEST USER']]],
    [
      540,
      [
        [18, '23 Sep 25'],
        [66, '#ONLINE STORE (Pay in EMIs)'],
        [366, '6,000.00'],
        [418, 'D'],
      ],
    ],
    [
      530,
      [
        [18, '25 Sep 25'],
        [66, 'TRANSFER TO MERCHANT EMI'],
        [366, '6,000.00'],
      ],
    ],
    [
      520,
      [
        [18, '09 Oct 25'],
        [66, 'GROCERY STORE'],
        [378, '1,000.00'],
        [418, 'D'],
      ],
    ],
  ]);

  test('keeps EMI instalments and conversions out of the billed totals', () => {
    const statement = parseStatementLines(lines);
    expect(statement).toMatchObject({
      issuer: 'sbi',
      statementDate: '2025-10-17',
      dueDate: '2025-11-06',
      periodStart: '2025-09-18',
      periodEnd: '2025-10-17',
      previousBalance: 500,
      totalDue: 1700,
      minimumDue: 600,
      creditLimit: 97000,
      declared: { debits: 7118, credits: 500 },
    });
    expect(
      statement.transactions.map((row) => [row.date, row.description, row.direction, row.emi]),
    ).toEqual([
      ['2025-09-21', 'PAYMENT RECEIVED 0001', 'credit', null],
      ['2025-10-17', 'FP EMI 01/06(EXCL TAX 18.00)', 'debit', 'installment'],
      ['2025-10-17', 'INTEREST ON EMI', 'debit', null],
      ['2025-10-17', 'IGST DB @ 18.00%', 'debit', null],
      ['2025-09-23', '#ONLINE STORE (Pay in EMIs)', 'debit', null],
      ['2025-09-25', 'TRANSFER TO MERCHANT EMI', 'credit', 'conversion'],
      ['2025-10-09', 'GROCERY STORE', 'debit', null],
    ]);
    expect(statement.totals).toEqual({ debits: 7118, credits: 500 });
    expect(isReconciled(statement)).toBe(true);
  });
});

test('rejects statements from unknown issuers', () => {
  expect(() => parseStatementLines(page(1, [[800, [[10, 'Some Other Bank statement']]]]))).toThrow(
    UnsupportedStatementError,
  );
});
