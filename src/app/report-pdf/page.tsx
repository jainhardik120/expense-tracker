import { api } from '@/server/server';

import Viewer from './client-viewer';

const ReportPDFPage = async () => {
  const data = await api.summary.getSummary({});
  return <Viewer summaryData={data} />;
};

export default ReportPDFPage;
