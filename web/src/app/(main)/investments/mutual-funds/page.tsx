import FundAnalysis from './_components/fund-analysis';

export const metadata = {
  title: 'Mutual fund analysis',
  description: 'What your mutual funds hold underneath, added up across every fund.',
};

export default function Page() {
  return <FundAnalysis />;
}
