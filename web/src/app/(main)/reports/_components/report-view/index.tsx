'use client';

import { defineRegistry, JSONUIProvider, Renderer } from '@json-render/react';

import { reportViewCatalog } from './catalog';
import { reportViewComponents } from './components';

import type { Spec } from '@json-render/core';

// Bound once at module scope: the registry is fixed for the lifetime of the app,
// and rebuilding it per render would rebuild every component identity with it.
const { registry } = defineRegistry(reportViewCatalog, {
  components: reportViewComponents,
});

/**
 * The report, drawn on the page.
 *
 * `spec` and `data` come straight from the server, where the template's code
 * step ran — the same pair the PDF is rendered from. Nothing here computes a
 * total or decides what a row means; this only draws what it is handed, which
 * is why the page and the download cannot drift apart.
 */
export const ReportView = ({
  spec,
  data,
}: {
  spec: Spec;
  data: Record<string, unknown>;
}) => (
  <JSONUIProvider initialState={data} registry={registry}>
    <Renderer registry={registry} spec={spec} />
  </JSONUIProvider>
);
