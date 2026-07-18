import { loadSpec } from './docsloader';

/** Merged OpenAPI spec from docs/swagger.yaml + docs/paths/*.yaml */
export const specs = loadSpec();
