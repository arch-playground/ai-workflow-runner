/**
 * Tool input key names as defined in OpenCode tool parameter schemas.
 * Verified against OpenCode source (packages/opencode/src/tool/*.ts).
 * Update here if OpenCode changes tool parameter names.
 */
export const TOOL_INPUT_KEYS = {
  FILE_PATH: 'filePath',
  COMMAND: 'command',
  DESCRIPTION: 'description',
  PATTERN: 'pattern',
  INCLUDE: 'include',
  PATH: 'path',
  OLD_STRING: 'oldString',
  NEW_STRING: 'newString',
  OFFSET: 'offset',
  LIMIT: 'limit',
} as const;

/**
 * Tool metadata key names available in completed state.
 * Verified against OpenCode source (packages/opencode/src/tool/*.ts).
 */
export const TOOL_METADATA_KEYS = {
  MATCHES: 'matches',
  COUNT: 'count',
  TRUNCATED: 'truncated',
  EXIT: 'exit',
} as const;
