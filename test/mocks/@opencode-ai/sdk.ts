// F11 Fix: Add proper type exports to match actual SDK interface
export interface OpencodeClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
  };
  event: {
    subscribe: jest.Mock;
  };
  postSessionIdPermissionsPermissionId: jest.Mock;
}

export const createOpencode = jest.fn();
