'use client';

import { defineRegistry, JSONUIProvider, Renderer } from '@json-render/react';

import { reportViewCatalog } from './catalog';
import { reportViewComponents } from './components';

import type { Spec } from '@json-render/core';

const { registry } = defineRegistry(reportViewCatalog, {
  components: reportViewComponents,
});

export const ReportView = ({ spec, data }: { spec: Spec; data: Record<string, unknown> }) => (
  <JSONUIProvider initialState={data} registry={registry}>
    <Renderer registry={registry} spec={spec} />
  </JSONUIProvider>
);
