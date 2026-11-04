// Wiring belongs to the server/MCP entrypoints; backend helpers share these input contracts.
const string = { type: 'string' };
const note = { type: 'string', minLength: 12, maxLength: 1200 };
const object = properties => ({ type: 'object', additionalProperties: false, properties });
const source = object({ platform: { enum: ['web', 'ios', 'cli'] }, captureDevices: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['desktop', 'mobile'] } }, bundleId: string, checkout: string, url: { type: ['string', 'null'] }, servesCheckout: { type: 'boolean' }, environment: string, browserProfile: string });
const manual = object({ status: { enum: ['pass', 'needs_work'] }, note });
manual.required = ['status', 'note'];
const launch = object({ ...manual.properties, milliseconds: { type: 'number', minimum: 0 } });
launch.required = ['status', 'note', 'milliseconds'];
export const configureProjectSchema = object({ project: string, name: string, description: string, source, by: string });
configureProjectSchema.required = ['project', 'by'];
export const nativeCheckSchema = object({ project: string, page: string, file: string, sourceUrl: string, actor: string, sourceFingerprint: string,
  app: object({ bundleId: string, version: string, build: string }), device: object({ simulatorUDID: string, name: string, os: string }),
  build: object({ sourceProof: { enum: ['matched', 'unknown'] }, sourceFingerprint: string, artifactFile: string, artifactSha256: string, note }),
  checks: object({ launch, accessibility: manual, logs: manual }) });
nativeCheckSchema.properties.app.required = ['bundleId', 'version', 'build'];
nativeCheckSchema.properties.device.required = ['simulatorUDID', 'name', 'os'];
nativeCheckSchema.properties.build.required = ['sourceProof', 'note'];
nativeCheckSchema.properties.build.allOf = [{ if: { properties: { sourceProof: { const: 'matched' } } }, then: { required: ['sourceFingerprint', 'artifactFile', 'artifactSha256'] } }];
nativeCheckSchema.required = ['project', 'page', 'file', 'sourceUrl', 'actor', 'sourceFingerprint', 'app', 'device', 'build'];
export const platformTools = [
  { name: 'dogfood_configure_project', description: 'Update project identity and explicit web, iOS or generated CLI publication source profile, preserving QA history.', inputSchema: configureProjectSchema },
  { name: 'dogfood_record_native_check', description: 'Import one real iOS Simulator screenshot and its source/build/device evidence. Unknown installed build provenance remains unaccepted. Does not launch or build an app.', inputSchema: nativeCheckSchema },
];
