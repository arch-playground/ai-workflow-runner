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

export type ToolState = Record<string, unknown>;
