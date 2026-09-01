import { helixComponentDefinitions } from '@helix-hq/pdf-report';
import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { standardComponentDefinitions } from '@json-render/react-pdf/catalog';

/**
 * The report vocabulary, bound to the DOM renderer instead of the PDF one.
 *
 * These are the same definitions the PDF catalog is built from — the prop
 * schemas are plain zod and carry no notion of a target, so the only thing that
 * changes between the two is which schema they are declared against and which
 * implementations they are bound to. That is what lets one spec drive both: the
 * page and the PDF agree on what a `DataTable` is, and a template written for
 * one renders on the other without translation.
 *
 * Adding a component here without an implementation in `components.tsx` fails
 * to compile, which is the point — `defineRegistry` checks the pair.
 */
export const reportViewCatalog = defineCatalog(schema, {
  components: { ...standardComponentDefinitions, ...helixComponentDefinitions },
  actions: {},
});
