import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkClaudeHelp, checkCodex, parseFeatures, parseVersions } from './probe.mjs';
import { collectProtocol } from './protocol.mjs';

const claudeHelp = `
Usage: claude [options] [prompt]
  -p, --print                          Print response and exit
  --input-format <format>              Input format
  --output-format <format>             Output format
  -r, --resume [id]                    Resume a conversation
  --model <model>                      Model
  --effort <level>                     Effort level
                                       (low, medium, high, xhigh, max)
  --permission-prompts <target>        Delegate to --permission-prompt-tool
  --settings <path-or-json>            Settings
  --verbose                            Enable verbose output
  --include-partial-messages           Include streaming chunks
`;

const object = (properties = {}, required) => ({ type: 'object', properties, required });
const array = (items) => ({ type: 'array', items });
const string = { type: 'string' };
const ref = (name) => ({ $ref: `#/definitions/${name}` });
const literal = (value) => ({ type: 'string', enum: [value] });
const message = (name, params) => object({ method: literal(name), ...(params ? { params } : {}) });

function fakeSchemas() {
  return {
    ClientRequest: {
      oneOf: [message('legacy'), message('turn/start', ref('TurnStartParams'))],
      definitions: {
        TurnStartParams: object(
          {
            threadId: string,
            input: array({
              oneOf: [
                object({ type: literal('text'), text: string, text_elements: array(object()) }),
              ],
            }),
          },
          ['threadId', 'input'],
        ),
      },
    },
    ClientNotification: { oneOf: [message('initialized')] },
    ServerRequest: {
      oneOf: [message('item/fileChange/requestApproval', object({ itemId: string }))],
    },
    ServerNotification: {
      oneOf: [message('turn/completed', object({ turn: object({ id: string }) }))],
    },
    'codex_app_server_protocol.schemas': { definitions: {} },
    'codex_app_server_protocol.v2.schemas': {
      definitions: {
        ModelListResponse: object({
          data: array({ allOf: [ref('Model')] }),
          nextCursor: { type: ['string', 'null'] },
        }),
        Model: object({ id: string }),
      },
    },
  };
}

const listedFeatures = parseFeatures(
  'guardianv2.thread_context   under development   false\r\napps   stable   true',
);
const baseline = { ...collectProtocol(fakeSchemas()), features: listedFeatures };

describe('CLI compatibility probe', () => {
  it('requires an exact version for each selected provider', () => {
    expect(parseVersions(['--codex', '0.171.0-alpha.13.2'])).toEqual({
      codex: '0.171.0-alpha.13.2',
    });
    expect(() => parseVersions([])).toThrow();
    expect(() => parseVersions(['--codex', 'latest'])).toThrow();
    expect(() => parseVersions(['--codex', '0.171.0', '--codex', '0.171.1'])).toThrow();
    expect(() => parseVersions(['--claude', '2.1.326 --flag'])).toThrow();
  });

  it('recognizes wrapped effort levels and a separately confirmed hidden option', () => {
    expect(checkClaudeHelp(claudeHelp, true)).toEqual({
      status: 'compatible',
      missingFlags: [],
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      removedEfforts: [],
    });
    expect(checkClaudeHelp(claudeHelp).missingFlags).toEqual(['--permission-prompt-tool']);
    expect(checkClaudeHelp(claudeHelp.replace('  --effort', '  --other'), true)).toMatchObject({
      status: 'broken',
      missingFlags: ['--effort'],
    });
    expect(checkClaudeHelp(claudeHelp.replace(', xhigh', ''), true)).toMatchObject({
      status: 'changed',
      removedEfforts: ['xhigh'],
    });
  });

  it('rejects duplicate and malformed feature rows', () => {
    expect(listedFeatures['guardianv2.thread_context']).toEqual({
      stage: 'under development',
      enabled: false,
    });
    expect(() => parseFeatures('apps   stable   true\napps   stable   false')).toThrow();
    expect(() => parseFeatures('not a feature list')).toThrow();
  });

  it('reports additive methods and features without breaking compatibility', () => {
    const schemas = fakeSchemas();
    schemas.ClientRequest.oneOf.push(message('new/method'));
    schemas['codex_app_server_protocol.v2.schemas'].definitions.Model.properties.extra = string;
    const newFeatures = { ...listedFeatures, sample: { stage: 'experimental', enabled: false } };

    expect(checkCodex(baseline, schemas, newFeatures)).toMatchObject({
      status: 'compatible',
      protocol: { addedMethods: ['ClientRequest:new/method'], changedFields: [] },
      features: { added: ['sample'] },
    });
  });

  it('reports removal of a method outside the app and changes to existing feature flags', () => {
    const schemas = fakeSchemas();
    schemas.ClientRequest.oneOf.shift();
    expect(
      checkCodex(baseline, schemas, { apps: { stage: 'stable', enabled: false } }),
    ).toMatchObject({
      status: 'changed',
      protocol: { removedMethods: ['ClientRequest:legacy'] },
      features: { removed: ['guardianv2.thread_context'], changed: [{ name: 'apps' }] },
    });
  });

  it('breaks when a used request disappears or its input acquires a required parameter', () => {
    const schemas = fakeSchemas();
    schemas.ClientRequest.oneOf.pop();
    expect(checkCodex(baseline, schemas, listedFeatures)).toMatchObject({
      status: 'broken',
      protocol: { removedMethods: ['ClientRequest:turn/start'] },
    });
    const changedInput = fakeSchemas();
    changedInput.ClientRequest.definitions.TurnStartParams.required.push('newParameter');
    expect(checkCodex(baseline, changedInput, listedFeatures)).toMatchObject({
      status: 'broken',
      protocol: { changedFields: [{ field: 'ClientRequest:turn/start.params' }] },
    });
  });

  it('breaks when a nested response field or tracked notification changes type', () => {
    const schemas = fakeSchemas();
    schemas['codex_app_server_protocol.v2.schemas'].definitions.Model.properties.id = {
      type: 'integer',
    };
    schemas.ServerNotification.oneOf[0].properties.params.properties.turn.properties.id = {
      type: 'integer',
    };
    expect(checkCodex(baseline, schemas, listedFeatures)).toMatchObject({
      status: 'broken',
      protocol: {
        changedFields: [
          {
            field: 'ServerNotification:turn/completed.params.turn.id',
            before: 'string',
            after: 'integer',
          },
          { field: 'Response:ModelListResponse.data.*.id', before: 'string', after: 'integer' },
        ],
      },
    });
  });

  it('has a committed baseline for all projected fields', () => {
    const path = new URL('../../packages/agent-compat/codex-protocol.json', import.meta.url);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    expect(snapshot.fields).toMatchObject({
      'ClientRequest:turn/start.params.input.*.@text.text': 'string',
      'ServerNotification:turn/completed.params.turn.id': 'string',
      'Response:ModelListResponse.data.*.id': 'string',
    });
    expect(Object.values(snapshot.fields)).not.toContain(null);
  });
});
