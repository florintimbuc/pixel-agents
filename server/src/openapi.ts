import {
  HEALTH_API_PATH,
  HOOK_API_PATH_TEMPLATE,
  HOOK_EVENTS,
  MAX_HOOK_BODY_SIZE,
  PROVIDER_ID_PATTERN,
  SERVER_JSON_DIR,
  SERVER_JSON_NAME,
} from './constants.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const SERVER_CONFIG_PATH = `~/${SERVER_JSON_DIR}/${SERVER_JSON_NAME}`;
const SERVER_DESCRIPTION =
  'Local HTTP server that receives hook events from CLI tool hook scripts and routes them to the VS Code extension. Runs on 127.0.0.1 at a random port; port, PID, and auth token are published to ~/.pixel-agents/server.json for hook script discovery.';
const AUTH_DESCRIPTION =
  'Auth token from ~/.pixel-agents/server.json. Validated with a timing-safe comparison to prevent side-channel attacks.';
const HOOK_EVENT_NAME_DESCRIPTION = 'Name of the hook event';
const SESSION_ID_DESCRIPTION = 'Claude Code session ID. Maps to a JSONL transcript filename.';

function createHookEventSchema(eventName: string, extraProperties: JsonObject = {}): JsonObject {
  return {
    allOf: [
      { $ref: '#/components/schemas/HookEventBase' },
      {
        type: 'object',
        properties: {
          hook_event_name: { type: 'string', enum: [eventName] },
          ...extraProperties,
        },
      },
    ],
  };
}

export function createOpenApiDocument(): JsonObject {
  const hookEventRefs = HOOK_EVENTS.map((eventName) => ({
    $ref: `#/components/schemas/${eventName}Event`,
  }));

  return {
    openapi: '3.1.0',
    info: {
      title: 'Pixel Agents Hooks Server',
      version: '1.0.0',
      description: SERVER_DESCRIPTION,
    },
    servers: [
      {
        url: 'http://127.0.0.1:{port}',
        description: `Local server — port is assigned at startup and published to ${SERVER_CONFIG_PATH}`,
        variables: {
          port: {
            default: '0',
            description: `Dynamic port assigned at startup. Read from ${SERVER_CONFIG_PATH}.`,
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: AUTH_DESCRIPTION,
        },
      },
      schemas: {
        HookEventBase: {
          type: 'object',
          required: ['hook_event_name', 'session_id'],
          properties: {
            hook_event_name: {
              type: 'string',
              description: HOOK_EVENT_NAME_DESCRIPTION,
            },
            session_id: {
              type: 'string',
              description: SESSION_ID_DESCRIPTION,
            },
          },
        },
        SessionStartEvent: createHookEventSchema('SessionStart', {
          source: {
            type: 'string',
            enum: ['new', 'clear', 'resume'],
            description:
              'How the session was initiated. `new` = fresh start, `clear` = after /clear command, `resume` = after --resume flag.',
          },
          transcript_path: {
            type: 'string',
            description: 'Absolute path to the JSONL transcript file for this session.',
          },
          cwd: {
            type: 'string',
            description: 'Working directory of the Claude Code process.',
          },
        }),
        SessionEndEvent: createHookEventSchema('SessionEnd', {
          reason: {
            type: 'string',
            enum: ['exit', 'logout', 'clear', 'resume', 'prompt_input_exit'],
            description:
              'Why the session ended. `clear` and `resume` expect a follow-up SessionStart. All others are final.',
          },
        }),
        StopEvent: createHookEventSchema('Stop'),
        PermissionRequestEvent: createHookEventSchema('PermissionRequest'),
        NotificationEvent: createHookEventSchema('Notification', {
          notification_type: {
            type: 'string',
            enum: ['permission_prompt', 'idle_prompt'],
            description:
              '`permission_prompt` = agent needs approval to proceed. `idle_prompt` = agent is waiting for user input.',
          },
        }),
        UserPromptSubmitEvent: createHookEventSchema('UserPromptSubmit'),
        PreToolUseEvent: createHookEventSchema('PreToolUse', {
          tool_name: {
            type: 'string',
            description: 'Name of the tool about to be executed (e.g., Read, Write, Bash).',
          },
          tool_input: {
            type: 'object',
            additionalProperties: true,
            description: 'Tool-specific input parameters.',
          },
        }),
        PostToolUseEvent: createHookEventSchema('PostToolUse', {
          tool_name: {
            type: 'string',
            description: 'Name of the tool that was executed.',
          },
        }),
        PostToolUseFailureEvent: createHookEventSchema('PostToolUseFailure', {
          tool_name: {
            type: 'string',
            description: 'Name of the tool that failed.',
          },
        }),
        SubagentStartEvent: createHookEventSchema('SubagentStart', {
          agent_type: {
            type: 'string',
            description: 'Type/name of the sub-agent being spawned.',
          },
        }),
        SubagentStopEvent: createHookEventSchema('SubagentStop', {
          agent_type: {
            type: 'string',
            description: 'Type/name of the sub-agent that stopped.',
          },
        }),
        HookEvent: {
          oneOf: hookEventRefs,
          discriminator: {
            propertyName: 'hook_event_name',
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['status', 'uptime', 'pid'],
          properties: {
            status: {
              type: 'string',
              enum: ['ok'],
            },
            uptime: {
              type: 'integer',
              description: 'Server uptime in seconds.',
            },
            pid: {
              type: 'integer',
              description: 'PID of the process owning the server.',
            },
          },
        },
        ServerConfig: {
          type: 'object',
          required: ['port', 'pid', 'token', 'startedAt'],
          properties: {
            port: {
              type: 'integer',
              description: 'Port the HTTP server is listening on.',
            },
            pid: {
              type: 'integer',
              description: 'PID of the process that owns the server.',
            },
            token: {
              type: 'string',
              format: 'uuid',
              description: 'Auth token required in the Authorization header for hook requests.',
            },
            startedAt: {
              type: 'integer',
              description: 'Unix timestamp (ms) when the server started.',
            },
          },
        },
      },
    },
    paths: {
      [HEALTH_API_PATH]: {
        get: {
          operationId: 'getHealth',
          summary: 'Health check',
          description: 'Returns server status, uptime, and PID. No authentication required.',
          tags: ['Server'],
          responses: {
            200: {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                  example: {
                    status: 'ok',
                    uptime: 42,
                    pid: 12345,
                  },
                },
              },
            },
          },
        },
      },
      [HOOK_API_PATH_TEMPLATE]: {
        post: {
          operationId: 'postHookEvent',
          summary: 'Submit a hook event',
          description:
            'Delivers a hook event from a CLI tool to the extension. The `providerId` identifies which tool is sending the event (e.g., `claude`). The event is routed to the matching agent by `session_id`.\n\nRequires a valid Bearer token from `~/.pixel-agents/server.json`. Body is limited to 64 KB.',
          tags: ['Hooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'providerId',
              in: 'path',
              required: true,
              description:
                'Identifier for the hook provider. Must match `[a-z0-9-]+`. The built-in provider is `claude`.',
              schema: {
                type: 'string',
                pattern: PROVIDER_ID_PATTERN,
              },
              example: 'claude',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HookEvent' },
                examples: {
                  SessionStart: {
                    summary: 'Session started',
                    value: {
                      hook_event_name: 'SessionStart',
                      session_id: 'abc12345-...',
                      source: 'new',
                      transcript_path:
                        '/home/user/.claude/projects/-home-user-myproject/abc12345.jsonl',
                      cwd: '/home/user/myproject',
                    },
                  },
                  SessionEnd: {
                    summary: 'Session ended (exit)',
                    value: {
                      hook_event_name: 'SessionEnd',
                      session_id: 'abc12345-...',
                      reason: 'exit',
                    },
                  },
                  Stop: {
                    summary: 'Turn completed',
                    value: {
                      hook_event_name: 'Stop',
                      session_id: 'abc12345-...',
                    },
                  },
                  PermissionRequest: {
                    summary: 'Permission needed',
                    value: {
                      hook_event_name: 'PermissionRequest',
                      session_id: 'abc12345-...',
                    },
                  },
                  Notification_permission: {
                    summary: 'Notification: permission prompt',
                    value: {
                      hook_event_name: 'Notification',
                      session_id: 'abc12345-...',
                      notification_type: 'permission_prompt',
                    },
                  },
                  Notification_idle: {
                    summary: 'Notification: idle prompt',
                    value: {
                      hook_event_name: 'Notification',
                      session_id: 'abc12345-...',
                      notification_type: 'idle_prompt',
                    },
                  },
                  UserPromptSubmit: {
                    summary: 'User submitted a prompt',
                    value: {
                      hook_event_name: 'UserPromptSubmit',
                      session_id: 'abc12345-...',
                    },
                  },
                  PreToolUse: {
                    summary: 'Tool about to run',
                    value: {
                      hook_event_name: 'PreToolUse',
                      session_id: 'abc12345-...',
                      tool_name: 'Read',
                      tool_input: {
                        file_path: '/home/user/myproject/src/main.ts',
                      },
                    },
                  },
                  PostToolUse: {
                    summary: 'Tool finished',
                    value: {
                      hook_event_name: 'PostToolUse',
                      session_id: 'abc12345-...',
                      tool_name: 'Read',
                    },
                  },
                  PostToolUseFailure: {
                    summary: 'Tool failed',
                    value: {
                      hook_event_name: 'PostToolUseFailure',
                      session_id: 'abc12345-...',
                      tool_name: 'Read',
                    },
                  },
                  SubagentStart: {
                    summary: 'Sub-agent spawned',
                    value: {
                      hook_event_name: 'SubagentStart',
                      session_id: 'abc12345-...',
                      agent_type: 'subagent',
                    },
                  },
                  SubagentStop: {
                    summary: 'Sub-agent finished',
                    value: {
                      hook_event_name: 'SubagentStop',
                      session_id: 'abc12345-...',
                      agent_type: 'subagent',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Event accepted',
              content: {
                'text/plain': {
                  schema: { type: 'string', enum: ['ok'] },
                },
              },
            },
            400: {
              description: 'Invalid JSON body or invalid provider ID',
              content: {
                'text/plain': {
                  schema: { type: 'string' },
                },
              },
            },
            401: {
              description: 'Missing or incorrect Authorization header',
              content: {
                'text/plain': {
                  schema: { type: 'string', enum: ['unauthorized'] },
                },
              },
            },
            404: {
              description: 'Unknown endpoint',
            },
            413: {
              description: `Request body exceeds ${Math.floor(MAX_HOOK_BODY_SIZE / 1024)} KB limit`,
              content: {
                'text/plain': {
                  schema: { type: 'string', enum: ['payload too large'] },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function createOpenApiJson(): string {
  return `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;
}
