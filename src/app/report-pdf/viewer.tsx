/* eslint-disable react/jsx-pascal-case */
'use client';

import { Table, TR, TH, TD } from '@ag-media/react-pdf-table';
import { Page, Document, PDFViewer, View, Text } from '@react-pdf/renderer';

import type { RouterOutput } from '@/server/routers';

type SummaryData = RouterOutput['summary']['getSummary'];

const styles = {
  cellStyles: {
    padding: 2,
  },
};

const Viewer = ({ summaryData }: { summaryData: SummaryData }) => {
  return (
    <PDFViewer className="h-screen w-full">
      <Document>
        <Page size="A4" style={{ padding: 10 }}>
          <View
            style={{
              padding: 2,
            }}
          >
            <Text style={{ fontSize: 20 }}>Expense Tracker</Text>
            <Table>
              <TH fixed>
                <TD>Account Name</TD>
                <TD>Final Balance</TD>
              </TH>
              {summaryData.accountsSummaryData.map((row) => {
                return (
                  <TR key={row.account.id}>
                    <TD style={styles.cellStyles}>{row.account.accountName}</TD>
                    <TD
                      style={{
                        ...styles.cellStyles,
                        textAlign: 'right',
                        textAnchor: 'end',
                      }}
                    >
                      {row.finalBalance.toFixed(2)}
                    </TD>
                  </TR>
                );
              })}
            </Table>
          </View>
        </Page>
      </Document>
    </PDFViewer>
  );
};

export default Viewer;
