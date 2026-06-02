import {
  createOpencode,
  createOpencodeServer,
  createOpencodeClient,
  OpencodeClient,
} from '@opencode-ai/sdk/v2';

export interface MockClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
    messages: jest.Mock;
  };
  event: {
    subscribe: jest.Mock;
  };
  config: {
    providers: jest.Mock;
  };
  auth: {
    set: jest.Mock;
  };
  permission: {
    reply: jest.Mock;
  };
  v2: {
    provider: {
      list: jest.Mock;
    };
  };
}

export interface MockServer {
  url: string;
  close: jest.Mock;
}

export interface EventControl {
  generator: AsyncGenerator<unknown, void, unknown>;
  emit: (event: unknown) => void;
  stop: () => void;
  hang: () => void;
}

export function createEventGenerator(): EventControl {
  const events: unknown[] = [];
  let done = false;
  let pendingResolve: ((value: IteratorResult<unknown, void>) => void) | null = null;

  return {
    generator: (async function* (): AsyncGenerator<unknown, void, unknown> {
      while (!done) {
        if (events.length > 0) {
          yield events.shift()!;
        } else {
          const event = await new Promise<unknown>((resolve) => {
            pendingResolve = (result: IteratorResult<unknown, void>): void => {
              if (result.done) {
                done = true;
                resolve(undefined);
              } else {
                resolve(result.value);
              }
            };
          });
          if (event !== undefined) {
            yield event;
          }
        }
      }
    })(),
    emit: (event: unknown): void => {
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve({ value: event, done: false });
      } else {
        events.push(event);
      }
    },
    stop: (): void => {
      done = true;
      if (pendingResolve) {
        pendingResolve({ value: undefined, done: true });
      }
    },
    hang: (): void => {
      done = true;
    },
  };
}

export function createMockServer(): MockServer {
  return {
    url: 'http://127.0.0.1:12345',
    close: jest.fn(),
  };
}

export function createMockClient(): MockClient {
  return {
    session: {
      create: jest.fn().mockResolvedValue({ data: { id: 'session-123' } }),
      promptAsync: jest.fn().mockResolvedValue({ data: {} }),
      messages: jest.fn().mockResolvedValue({ data: [] }),
    },
    event: {
      subscribe: jest.fn(),
    },
    config: {
      providers: jest.fn().mockResolvedValue({ data: { providers: [] } }),
    },
    auth: {
      set: jest.fn().mockResolvedValue({ data: {} }),
    },
    permission: {
      reply: jest.fn().mockResolvedValue({}),
    },
    v2: {
      provider: {
        list: jest.fn().mockResolvedValue({ data: [] }),
      },
    },
  };
}

export function setupMockCreateOpencode(
  mockClient: MockClient,
  mockServer: MockServer,
  eventControl: EventControl
): void {
  const mockCreateOpencode = createOpencode as jest.MockedFunction<typeof createOpencode>;
  const mockCreateOpencodeServer = createOpencodeServer as jest.MockedFunction<
    typeof createOpencodeServer
  >;
  const mockCreateOpencodeClient = createOpencodeClient as jest.MockedFunction<
    typeof createOpencodeClient
  >;

  mockClient.event.subscribe.mockResolvedValue({ stream: eventControl.generator });

  // Mock both the combined and split entry points so tests work regardless of which
  // path the production code uses.
  mockCreateOpencode.mockResolvedValue({
    client: mockClient as unknown as OpencodeClient,
    server: mockServer,
  });
  mockCreateOpencodeServer.mockResolvedValue(mockServer);
  mockCreateOpencodeClient.mockReturnValue(mockClient as unknown as OpencodeClient);
}

export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}
