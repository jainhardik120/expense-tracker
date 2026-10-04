import { helixComponentDefinitions } from '@helix-hq/pdf-report';
import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { standardComponentDefinitions } from '@json-render/react-pdf/catalog';

export const reportViewCatalog = defineCatalog(schema, {
  components: { ...standardComponentDefinitions, ...helixComponentDefinitions },
  actions: {},
});
