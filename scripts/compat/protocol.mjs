// Only inspect the protocol generated offline. None of these methods is sent to an app server.
/* eslint-disable security/detect-object-injection -- Keys are fixed by the projection or validated method identifiers. */
const methods = {
  ClientRequest: {
    initialize: 'clientInfo.name clientInfo.title clientInfo.version capabilities',
    'account/read': '',
    'config/read': 'cwd',
    'thread/start': 'cwd approvalPolicy approvalsReviewer sandbox',
    'thread/resume': 'threadId cwd excludeTurns approvalPolicy approvalsReviewer sandbox',
    'turn/start':
      'threadId input.*.@text.text input.*.@text.text_elements model effort approvalPolicy approvalsReviewer',
    'turn/interrupt': 'threadId turnId',
    'model/list': 'cursor',
    'experimentalFeature/list': 'cursor',
    'skills/list': 'cwds',
    'hooks/list': 'cwds',
    'plugin/installed': 'cwds',
    'mcpServerStatus/list': 'cursor detail',
    'modelProvider/capabilities/read': '',
    'permissionProfile/list': 'cursor cwd',
  },
  ClientNotification: { initialized: '' },
  ServerRequest: {
    'item/commandExecution/requestApproval':
      'threadId turnId itemId kind command cwd reason networkApprovalContext.host networkApprovalContext.protocol availableDecisions.*',
    'item/fileChange/requestApproval': 'threadId turnId itemId reason grantRoot',
  },
  ServerNotification: {
    'turn/started': 'threadId turn.id',
    'turn/completed': 'threadId turn.id turn.status turn.durationMs turn.error.message',
    'item/started': [
      'threadId turnId',
      'item.@commandExecution.id item.@commandExecution.command',
      'item.@fileChange.id item.@fileChange.changes.*.path',
      'item.@mcpToolCall.id item.@mcpToolCall.server item.@mcpToolCall.tool',
      'item.@dynamicToolCall.id item.@dynamicToolCall.tool item.@webSearch.id item.@webSearch.query',
    ].join(' '),
    'item/completed': [
      'threadId turnId',
      'item.@userMessage.id item.@userMessage.content.*.@text.text',
      'item.@agentMessage.id item.@agentMessage.text',
      'item.@commandExecution.id item.@commandExecution.status item.@commandExecution.durationMs',
      'item.@commandExecution.command item.@commandExecution.commandActions.*.@read.path',
      'item.@commandExecution.exitCode item.@commandExecution.aggregatedOutput',
      'item.@fileChange.id item.@fileChange.status item.@fileChange.changes.*.path',
      'item.@fileChange.changes.*.diff item.@fileChange.changes.*.kind.@add',
      'item.@mcpToolCall.id item.@mcpToolCall.status item.@mcpToolCall.durationMs',
      'item.@mcpToolCall.server item.@mcpToolCall.tool item.@mcpToolCall.error.message',
      'item.@dynamicToolCall.id item.@dynamicToolCall.status item.@dynamicToolCall.durationMs',
      'item.@dynamicToolCall.tool item.@dynamicToolCall.success item.@webSearch.id item.@webSearch.query',
    ].join(' '),
    'item/agentMessage/delta': 'threadId turnId delta',
    'serverRequest/resolved': 'threadId requestId',
    'thread/tokenUsage/updated':
      'threadId turnId tokenUsage.last.inputTokens tokenUsage.last.outputTokens tokenUsage.last.cachedInputTokens tokenUsage.last.cacheWriteInputTokens',
    'model/rerouted': 'threadId turnId fromModel toModel',
    error: 'threadId turnId willRetry error.message',
    'skills/changed': '',
    deprecationNotice: 'summary details',
  },
};

const responses = {
  InitializeResponse: 'userAgent',
  GetAccountResponse: 'account.@apiKey.type account.@chatgpt.type',
  ConfigReadResponse: 'config.model config.model_reasoning_effort',
  ThreadStartResponse:
    'thread.id model reasoningEffort approvalPolicy approvalsReviewer sandbox.@workspaceWrite',
  ThreadResumeResponse:
    'thread.id model reasoningEffort approvalPolicy approvalsReviewer sandbox.@workspaceWrite',
  TurnStartResponse: 'turn.id',
  TurnInterruptResponse: '',
  ModelListResponse:
    'nextCursor data.*.id data.*.displayName data.*.hidden data.*.defaultReasoningEffort data.*.supportedReasoningEfforts.*.reasoningEffort',
  ExperimentalFeatureListResponse:
    'nextCursor data.*.name data.*.stage data.*.enabled data.*.defaultEnabled data.*.displayName data.*.description data.*.announcement',
  SkillsListResponse:
    'data.*.skills.*.name data.*.skills.*.description data.*.skills.*.shortDescription data.*.skills.*.scope data.*.skills.*.enabled data.*.skills.*.interface.displayName',
  HooksListResponse:
    'data.*.hooks.*.eventName data.*.hooks.*.enabled data.*.hooks.*.source data.*.hooks.*.@handlerType=command.command data.*.hooks.*.@handlerType=mcpTool.server data.*.hooks.*.@handlerType=mcpTool.tool',
  PluginInstalledResponse:
    'marketplaces.*.plugins.*.id marketplaces.*.plugins.*.name marketplaces.*.plugins.*.installed marketplaces.*.plugins.*.enabled marketplaces.*.plugins.*.interface.displayName marketplaces.*.plugins.*.interface.shortDescription',
  ListMcpServerStatusResponse:
    'nextCursor data.*.name data.*.authStatus data.*.serverInfo.title data.*.serverInfo.description data.*.tools.*.title data.*.tools.*.description',
  ModelProviderCapabilitiesReadResponse: 'webSearch imageGeneration',
  PermissionProfileListResponse: 'nextCursor data.*.id data.*.description data.*.allowed',
  CommandExecutionRequestApprovalResponse: 'decision',
  FileChangeRequestApprovalResponse: 'decision',
};

export const schemaFiles = [
  ...Object.keys(methods),
  'codex_app_server_protocol.schemas',
  'codex_app_server_protocol.v2.schemas',
];

const methodName = /^[A-Za-z][A-Za-z0-9_/-]{0,127}$/;
const literal = (node) => node?.const ?? (node?.enum?.length === 1 ? node.enum[0] : undefined);
const branches = (node) => node?.oneOf ?? node?.anyOf;

function resolve(node, definitions) {
  const seen = new Set();
  while (node?.$ref || node?.allOf?.length === 1) {
    if (seen.has(node)) return undefined;
    seen.add(node);
    if (!node.$ref) {
      node = node.allOf[0];
    } else {
      const name = /^#\/definitions\/([^/]+)$/.exec(node.$ref)?.[1];
      if (!name || !Object.hasOwn(definitions, name)) return undefined;
      node = definitions[name];
    }
  }
  return node;
}

function shapeParts(node, definitions, outgoing) {
  if (!node) return null;
  const union = branches(node);
  if (union) {
    return [
      ...new Set(
        union.flatMap((entry) => shapeParts(resolve(entry, definitions), definitions, outgoing)),
      ),
    ].sort();
  }
  const types = [node.type ?? (node.properties ? 'object' : 'any')].flat().sort();
  if (node.enum) types.push(`enum:${JSON.stringify(node.enum.map(symbol).sort())}`);
  if (Object.hasOwn(node, 'const')) types.push(`const:${JSON.stringify(symbol(node.const))}`);
  if (outgoing && node.required?.length)
    types.push(`required:${[...node.required].sort().join(',')}`);
  return types;
}

function shape(node, definitions, outgoing) {
  return shapeParts(node, definitions, outgoing)?.join(' ') ?? null;
}

function symbol(value) {
  if (typeof value !== 'string' || /^[a-zA-Z][a-zA-Z0-9_.:/-]{0,63}$/.test(value)) return value;
  return '<other>';
}

// A segment "*" selects array elements or dictionary values. "@foo" selects a variant by
// "type", or use "@discriminator=foo" when a union uses a different discriminator.
// Keep the intermediate shapes so a nullable wrapper or an extra required input is visible.
function select(node, segment, definitions) {
  if (segment === '*') {
    const values = node?.items ?? node?.additionalProperties;
    if (values && typeof values === 'object') return values;
  }
  const variants = branches(node)?.map((entry) => resolve(entry, definitions));
  if (segment.startsWith('@')) {
    const [name, value] = segment.slice(1).split('=');
    const match = variants?.find(
      (entry) => literal(entry?.properties?.[value ? name : 'type']) === (value ?? name),
    );
    if (match) return match;
  }
  if (node?.properties && Object.hasOwn(node.properties, segment)) return node.properties[segment];
  const nonNull = variants?.filter((entry) => entry?.type !== 'null');
  if (nonNull?.length === 1) return select(nonNull[0], segment, definitions);
  return undefined;
}

function record(fields, prefix, input, selection, definitions, outgoing = false) {
  const root = resolve(input, definitions);
  fields[prefix] = shape(root, definitions, outgoing);
  if (!selection) return;
  for (const path of selection.split(' ')) {
    let node = root;
    let key = prefix;
    for (const segment of path.split('.')) {
      key += `.${segment}`;
      node = resolve(select(node, segment, definitions), definitions);
      fields[key] = shape(node, definitions, outgoing);
    }
  }
}

export function collectProtocol(schemas) {
  const inventory = {};
  const fields = {};
  for (const [kind, selected] of Object.entries(methods)) {
    const schema = schemas[kind];
    const definitions = schema.definitions ?? {};
    const byMethod = new Map();
    if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0)
      throw new Error('empty protocol');
    for (const input of schema.oneOf) {
      const entry = resolve(input, definitions);
      const name = literal(resolve(entry?.properties?.method, definitions));
      if (typeof name !== 'string' || !methodName.test(name) || byMethod.has(name)) {
        throw new Error('unexpected method schema');
      }
      byMethod.set(name, entry);
    }
    inventory[kind] = [...byMethod.keys()].sort();
    for (const [name, selection] of Object.entries(selected)) {
      const prefix = `${kind}:${name}`;
      const entry = byMethod.get(name);
      // Some methods legitimately have no params schema. Track the envelope separately.
      fields[prefix] = shape(entry, definitions, kind === 'ClientRequest');
      if (entry?.properties?.params || selection) {
        record(
          fields,
          `${prefix}.params`,
          entry?.properties?.params,
          selection,
          definitions,
          kind === 'ClientRequest',
        );
      }
    }
  }
  const shared = schemas['codex_app_server_protocol.schemas'].definitions;
  const v2 = schemas['codex_app_server_protocol.v2.schemas'].definitions;
  for (const [name, selection] of Object.entries(responses)) {
    const definitions = Object.hasOwn(v2, name) ? v2 : shared;
    record(
      fields,
      `Response:${name}`,
      definitions[name],
      selection,
      definitions,
      name.endsWith('ApprovalResponse'),
    );
  }
  return { methods: inventory, fields };
}

export function compareProtocol(baseline, current) {
  const addedMethods = Object.entries(current.methods).flatMap(([kind, names]) =>
    names.filter((name) => !baseline.methods[kind].includes(name)).map((name) => `${kind}:${name}`),
  );
  const removedMethods = Object.entries(baseline.methods).flatMap(([kind, names]) =>
    names.filter((name) => !current.methods[kind].includes(name)).map((name) => `${kind}:${name}`),
  );
  const changedFields = Object.entries(baseline.fields).flatMap(([field, before]) => {
    const after = current.fields[field] ?? null;
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ field, before, after }];
  });
  return { addedMethods, removedMethods, changedFields };
}
