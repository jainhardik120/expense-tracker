'use client';

import dynamic from 'next/dynamic';

const Viewer = dynamic(() => import('./viewer'), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});

export default Viewer;
