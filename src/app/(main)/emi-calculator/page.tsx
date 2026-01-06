'use client';

import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import * as z from 'zod';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';

const MONTHS_PER_YEAR = 12;
const PERCENTAGE_DIVISOR = 100;
const MAX_PERCENTAGE = 100;
const MIN_PERCENTAGE = 0;

const formSchema = z.object({
  calculationMode: z.enum(['principal', 'emi', 'totalEmi']),
  principalAmount: z.number().optional(),
  emiAmount: z.number().optional(),
  totalEmiAmount: z.number().optional(),
  annualRate: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
  tenureMonths: z.number().int().positive(),
  gstRate: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
  processingFees: z.number().min(MIN_PERCENTAGE),
  processingFeesGst: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
});

type FormValues = z.infer<typeof formSchema>;

interface ScheduleRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  gst: number;
  totalPayment: number;
  balance: number;
}

interface CalculationResult {
  schedule: ScheduleRow[];
  summary: {
    totalEMI: number;
    totalInterest: number;
    totalGST: number;
    totalPrincipal: number;
    processingFees: number;
    processingFeesGST: number;
    totalProcessingFees: number;
    totalAmount: number;
    effectivePrincipal: number;
  };
}

const calculateEMI = (principal: number, monthlyRate: number, tenure: number): number => {
  if (monthlyRate === 0) {
    return principal / tenure;
  }
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
    (Math.pow(1 + monthlyRate, tenure) - 1)
  );
};

const calculatePrincipalFromEMI = (emi: number, monthlyRate: number, tenure: number): number => {
  if (monthlyRate === 0) {
    return emi * tenure;
  }
  return (
    (emi * (Math.pow(1 + monthlyRate, tenure) - 1)) /
    (monthlyRate * Math.pow(1 + monthlyRate, tenure))
  );
};

const calculateSchedule = (values: FormValues): CalculationResult => {
  const monthlyRate = values.annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  let principal: number;
  let emi: number;

  if (values.calculationMode === 'principal') {
    principal = values.principalAmount ?? 0;
    emi = calculateEMI(principal, monthlyRate, values.tenureMonths);
  } else if (values.calculationMode === 'emi') {
    emi = values.emiAmount ?? 0;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  } else {
    // totalEmi mode - calculate monthly EMI from total
    const totalEmi = values.totalEmiAmount ?? 0;
    emi = totalEmi / values.tenureMonths;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  }

  const schedule: ScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalGST = 0;

  for (let month = 1; month <= values.tenureMonths; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = emi - interest;
    balance = Math.max(balance - principalComponent, 0);

    const gst = (interest * values.gstRate) / PERCENTAGE_DIVISOR;
    const totalPayment = emi + gst;

    totalInterest += interest;
    totalGST += gst;

    schedule.push({
      month,
      emi,
      interest,
      principal: principalComponent,
      gst,
      totalPayment,
      balance,
    });
  }

  const processingFeesGST = (values.processingFees * values.processingFeesGst) / PERCENTAGE_DIVISOR;
  const totalProcessingFees = values.processingFees + processingFeesGST;

  return {
    schedule,
    summary: {
      totalEMI: emi * values.tenureMonths,
      totalInterest,
      totalGST,
      totalPrincipal: principal,
      processingFees: values.processingFees,
      processingFeesGST,
      totalProcessingFees,
      totalAmount: emi * values.tenureMonths + totalGST + totalProcessingFees,
      effectivePrincipal: principal,
    },
  };
};

type formType = z.infer<typeof formSchema>;

const DisplayInputField = ({
  calculationMode,
  form,
}: {
  calculationMode: 'principal' | 'emi' | 'totalEmi';
  form: UseFormReturn<formType, unknown, formType>;
}) => {
  if (calculationMode === 'principal') {
    return (
      <FormField
        control={form.control}
        name="principalAmount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Principal Amount</FormLabel>
            <FormControl>
              <Input
                type="number"
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
                }}
              />
            </FormControl>
            <FormDescription>The loan amount you want to borrow</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
  if (calculationMode === 'emi') {
    return (
      <FormField
        control={form.control}
        name="emiAmount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Monthly EMI Amount</FormLabel>
            <FormControl>
              <Input
                type="number"
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
                }}
              />
            </FormControl>
            <FormDescription>The monthly EMI you want to pay</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
  return (
    <FormField
      control={form.control}
      name="totalEmiAmount"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Total EMI Amount</FormLabel>
          <FormControl>
            <Input
              type="number"
              value={field.value ?? ''}
              onChange={(e) => {
                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
              }}
            />
          </FormControl>
          <FormDescription>The complete EMI amount (sum of all monthly payments)</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default function EMICalculatorPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      calculationMode: 'emi' as const,
      principalAmount: 0,
      emiAmount: 0,
      totalEmiAmount: 0,
      annualRate: 16,
      tenureMonths: 6,
      gstRate: 18,
      processingFees: 199,
      processingFeesGst: 18,
    },
  });

  const calculationMode = form.watch('calculationMode');

  const formValues = form.watch();
  const result = useMemo(() => {
    return calculateSchedule(formValues);
  }, [formValues]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <CardDescription>
              Enter your loan parameters to calculate EMI and payment schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form className="space-y-6">
                <FormField
                  control={form.control}
                  name="calculationMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Calculation Mode</FormLabel>
                      <Select defaultValue={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select calculation mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="principal">
                            Calculate from Principal Amount (Interest-based EMI)
                          </SelectItem>
                          <SelectItem value="emi">
                            Calculate from Monthly EMI Amount (No-cost EMI)
                          </SelectItem>
                          <SelectItem value="totalEmi">
                            Calculate from Total EMI Amount (Complete EMI)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <DisplayInputField calculationMode={calculationMode} form={form} />
                  <FormField
                    control={form.control}
                    name="annualRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Interest Rate (%)</FormLabel>
                        <FormControl>
                          <Input
                            step="0.01"
                            type="number"
                            value={field.value}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              field.onChange(Number.isNaN(value) ? 0 : value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Annual interest rate in percentage</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tenureMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tenure (Months)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={field.value}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              field.onChange(Number.isNaN(value) ? 0 : value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Loan tenure in months</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="processingFees"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Processing Fees</FormLabel>
                        <FormControl>
                          <Input
                            step="0.01"
                            type="number"
                            value={field.value}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              field.onChange(Number.isNaN(value) ? 0 : value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>One-time processing fees</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="gstRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GST Rate on Interest (%)</FormLabel>
                          <FormControl>
                            <Input
                              step="0.01"
                              type="number"
                              value={field.value}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                field.onChange(Number.isNaN(value) ? 0 : value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="processingFeesGst"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GST Rate on Processing Fees (%)</FormLabel>
                          <FormControl>
                            <Input
                              step="0.01"
                              type="number"
                              value={field.value}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                field.onChange(Number.isNaN(value) ? 0 : value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {form.formState.errors.root?.message !== undefined && (
                  <p className="text-red-500">{form.formState.errors.root.message}</p>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-sm">Effective Principal</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(result.summary.effectivePrincipal)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Monthly EMI</p>
                <p className="text-2xl font-bold">{formatCurrency(result.schedule[0]?.emi ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Interest</p>
                <p className="text-2xl font-bold">{formatCurrency(result.summary.totalInterest)}</p>
              </div>
              {result.summary.totalGST > 0 && (
                <div>
                  <p className="text-muted-foreground text-sm">Total GST on Interest</p>
                  <p className="text-2xl font-bold">{formatCurrency(result.summary.totalGST)}</p>
                </div>
              )}
              {result.summary.processingFees > 0 && (
                <>
                  <div>
                    <p className="text-muted-foreground text-sm">Processing Fees</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(result.summary.processingFees)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Processing Fees GST</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(result.summary.processingFeesGST)}
                    </p>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-muted-foreground text-sm">Total Amount Payable</p>
                <p className="text-primary text-3xl font-bold">
                  {formatCurrency(result.summary.totalAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Payment Schedule</CardTitle>
          <CardDescription>Detailed month-by-month payment breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Month</TableHead>
                  <TableHead className="text-right">EMI</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  {result.summary.totalGST > 0 && <TableHead className="text-right">GST</TableHead>}
                  <TableHead className="text-right">Total Payment</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.schedule.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.emi)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.interest)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.principal)}</TableCell>
                    {result.summary.totalGST > 0 && (
                      <TableCell className="text-right">{formatCurrency(row.gst)}</TableCell>
                    )}
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.totalPayment)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
