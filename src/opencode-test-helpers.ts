import { createOpencode, OpencodeClient } from '@opencode-ai/sdk';

export interface MockClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
  };
  event: {
    subscribe: jest.Mock;
  };
  config: {
    providers: jest.Mock;
  };
  postSessionIdPermissionsPermissionId: jest.Mock;
}

export interface MockServer {
  url: string;
  close: jest.Mock;
}

export interface EventControl {
  generator: AsyncGenerator<unknown, void, unknown>;
  emit: (event: unknown) => void;
  stop: () => void;
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
    },
    event: {
      subscribe: jest.fn(),
    },
    config: {
      providers: jest.fn().mockResolvedValue({ data: { providers: [] } }),
    },
    postSessionIdPermissionsPermissionId: jest.fn().mockResolvedValue({}),
  };
}

export function setupMockCreateOpencode(
  mockClient: MockClient,
  mockServer: MockServer,
  eventControl: EventControl
): void {
  const mockCreateOpencode = createOpencode as jest.MockedFunction<typeof createOpencode>;

  mockClient.event.subscribe.mockResolvedValue({ stream: eventControl.generator });

  mockCreateOpencode.mockResolvedValue({
    client: mockClient as unknown as OpencodeClient,
    server: mockServer,
  });
}

export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}
