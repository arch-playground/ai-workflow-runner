// F11 Fix: Add proper type exports to match actual SDK v2 interface
export interface OpencodeClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
  };
  event: {
    subscribe: jest.Mock;
  };
  permission: {
    reply: jest.Mock;
  };
}

export const createOpencode = jest.fn();
export const createOpencodeServer = jest.fn();
export const createOpencodeClient = jest.fn();

export type ToolState = Record<string, unknown>;
export type PermissionConfig = Record<string, unknown>;
export type PermissionObjectConfig = Record<string, string>;
