import * as core from '@actions/core';
import { OpenCodeService, resetOpenCodeService } from './opencode';
import { resetToolLoggerFactory } from './tool-loggers/index';
import { getDebugLogWriter, resetDebugLogWriter, initDebugLogWriter } from './debug-log-writer';
import {
  MockClient,
  MockServer,
  EventControl,
  createEventGenerator,
  createMockClient,
  createMockServer,
  setupMockCreateOpencode,
  flushMicrotasks,
} from './opencode-test-helpers';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk/v2');

const mockCore = core as jest.Mocked<typeof core>;

describe('OpenCodeService - session & messages', () => {
  let mockClient: MockClient;
  let mockServer: MockServer;
  let eventControl: EventControl;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    eventControl = createEventGenerator();
    mockServer = createMockServer();
    mockClient = createMockClient();
    setupMockCreateOpencode(mockClient, mockServer, eventControl);
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
  });

  describe('runSession()', () => {
    it('creates session and sends prompt', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test prompt', 5000);

      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;

      expect(mockClient.session.create).toHaveBeenCalledWith({ title: 'AI Workflow' });
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith({
        sessionID: 'session-123',
        parts: [{ type: 'text', text: 'test prompt' }],
      });
      expect(result.sessionId).toBe('session-123');
    });

    it('accumulates message fragments correctly', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);

      await flushMicrotasks();
      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hello ', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'World!', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      expect(result.lastMessage).toBe('Hello World!');
    });

    it('handles timeout during waitForSessionIdle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      await expect(target.runSession('test', 50)).rejects.toThrow('timed out after 50ms');
    });

    it('handles abort signal during waitForSessionIdle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const abortController = new AbortController();

      const sessionPromise = target.runSession('test', 5000, abortController.signal);

      await flushMicrotasks();
      abortController.abort();

      await expect(sessionPromise).rejects.toThrow('Session aborted');
    });
  });

  describe('sendFollowUp()', () => {
    it('sends message to existing session', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const followUpPromise = target.sendFollowUp('session-123', 'follow up', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await followUpPromise;
      expect(result.sessionId).toBe('session-123');
      expect(mockClient.session.promptAsync).toHaveBeenCalledTimes(2);
    });

    it('truncates long messages', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const longMessage = 'x'.repeat(200_000);
      const followUpPromise = target.sendFollowUp('session-123', longMessage, 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await followUpPromise;

      const call = mockClient.session.promptAsync.mock.calls[1] as [
        { parts: Array<{ text: string }> },
      ];
      expect(call[0]?.parts[0]?.text).toContain('...[truncated]');
      expect(call[0]?.parts[0]?.text.length).toBeLessThan(longMessage.length);
    });

    it('throws if service is disposed', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();

      await expect(target.sendFollowUp('session-123', 'test', 5000)).rejects.toThrow(
        'OpenCode service disposed - cannot send follow-up'
      );
    });
  });

  describe('getLastMessage()', () => {
    it('returns message for specific session', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Response', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      expect(target.getLastMessage(result.sessionId)).toBe('Response');
    });

    it('logs warning when message is truncated', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      const longText = 'x'.repeat(200_000);
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: longText, messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      const message = target.getLastMessage(result.sessionId);

      expect(mockCore.warning).toHaveBeenCalledWith(
        '[OpenCode] Last message truncated due to size limit'
      );
      expect(message).toContain('...[truncated]');
    });
  });

  describe('event handling', () => {
    it('handles permission.asked for read-family tools by auto-approving', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // 'read' is in the safe auto-approve set — should get 'always'
      eventControl.emit({
        type: 'permission.asked',
        properties: { sessionID: 'session-123', id: 'perm-1', permission: 'read' },
      });

      await flushMicrotasks();

      expect(mockClient.permission.reply).toHaveBeenCalledWith({
        requestID: 'perm-1',
        reply: 'always',
      });

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('handles permission.asked for unsafe tools by rejecting', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // 'bash' is not in AUTO_APPROVE_PERMISSIONS — should get 'reject'
      eventControl.emit({
        type: 'permission.asked',
        properties: { sessionID: 'session-123', id: 'perm-2', permission: 'bash' },
      });

      await flushMicrotasks();

      expect(mockClient.permission.reply).toHaveBeenCalledWith({
        requestID: 'perm-2',
        reply: 'reject',
      });

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('logs permission reply failures', async () => {
      mockClient.permission.reply.mockRejectedValueOnce(new Error('Permission denied'));

      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'permission.asked',
        properties: { sessionID: 'session-123', id: 'perm-1', permission: 'read' },
      });

      await flushMicrotasks();

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to reply to permission')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('handles session.error by rejecting callback', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'session.error',
        properties: {
          sessionID: 'session-123',
          error: 'Something failed',
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session error: Something failed');
    });

    it('handles session.error with object error by rejecting callback', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'session.error',
        properties: {
          sessionID: 'session-123',
          error: { type: 'disconnected', message: 'Connection lost' },
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session error: Connection lost');
    });

    it('9-2-AC2: session.error emits core.error with a title annotation', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act
      eventControl.emit({
        type: 'session.error',
        properties: {
          sessionID: 'session-123',
          error: 'Something failed',
        },
      });

      // Assert: run-level core.error called with title (AC2)
      await expect(sessionPromise).rejects.toThrow('Session error: Something failed');
      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Session error for session-123'),
        expect.objectContaining({ title: 'Session error' })
      );
      expect(mockCore.error).toHaveBeenCalledTimes(1);
    });

    it('streams message content via core.info()', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Test output', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });

      await flushMicrotasks();
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('[OpenCode] Test output'));

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });
  });

  describe('tool logging', () => {
    afterEach(() => {
      resetToolLoggerFactory();
    });

    it('logs running tool event via core.info() with tool-specific details', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read',
            state: {
              status: 'running',
              input: { filePath: './config.json' },
              time: { start: 0 },
            },
          },
        },
      });

      await flushMicrotasks();
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[OpenCode\] Tool: read - running - \.\/config\.json$/
        )
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('logs tool error event via core.info() (not core.warning()) with error cause', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read',
            state: {
              status: 'error',
              input: { filePath: './missing.ts' },
              error: 'File not found',
              time: { start: 0, end: 1 },
            },
          },
        },
      });

      await flushMicrotasks();
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[OpenCode\] Tool: read - error - \.\/missing\.ts - File not found$/
        )
      );
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        expect.stringMatching(/Tool: read - error/)
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('logs tool pending event via core.debug() (not core.info())', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'pending',
              input: { command: 'ls' },
              raw: '',
            },
          },
        },
      });

      await flushMicrotasks();
      expect(mockCore.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[OpenCode\] Tool: bash - pending$/)
      );
      expect(mockCore.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Tool: bash - pending')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('logs ISO timestamp when session starts', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T.+Z\] \[OpenCode\] Session started$/)
      );
    });
  });

  describe('log-group wrapping', () => {
    afterEach(() => {
      resetToolLoggerFactory();
    });

    it('9-1-AC1: wraps completed tool log in startGroup/endGroup', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'ls' },
              output: 'file.txt',
              title: '',
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        },
      });

      await flushMicrotasks();

      // Assert
      expect(mockCore.startGroup).toHaveBeenCalledTimes(1);
      expect(mockCore.startGroup).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[OpenCode\] Tool: bash - completed/)
      );
      expect(mockCore.endGroup).toHaveBeenCalledTimes(1);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCode] Tool: bash - completed')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-1-AC1 / 9-2-AC1: wraps error tool log in startGroup/endGroup and routes to core.info (not core.warning)', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read',
            state: {
              status: 'error',
              input: { filePath: './missing.ts' },
              error: 'File not found',
              time: { start: 0, end: 1 },
            },
          },
        },
      });

      await flushMicrotasks();

      // Assert: group wrapping preserved (Story 9-1), warning channel removed (Story 9-2)
      expect(mockCore.startGroup).toHaveBeenCalledTimes(1);
      expect(mockCore.endGroup).toHaveBeenCalledTimes(1);
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringMatching(/Tool: read - error/));
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        expect.stringMatching(/Tool: read - error/)
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-2-AC1: N error tool parts produce 0 core.warning calls', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act: emit 3 error tool parts
      for (let i = 0; i < 3; i++) {
        eventControl.emit({
          type: 'message.part.updated',
          properties: {
            part: {
              type: 'tool',
              tool: 'bash',
              state: {
                status: 'error',
                input: { command: `cmd-${i}` },
                error: `Error ${i}`,
                time: { start: i, end: i + 1 },
              },
            },
          },
        });
        await flushMicrotasks();
      }

      // Assert: warning never called for any per-tool error
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        expect.stringMatching(/Tool: bash - error/)
      );
      // Each error tool part emits exactly one core.info call (inside the group)
      const toolErrorInfoCalls = (mockCore.info.mock.calls as string[][]).filter((args) =>
        /Tool: bash - error/.test(args[0] ?? '')
      );
      expect(toolErrorInfoCalls).toHaveLength(3);

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-1-AC2: pending tool part goes to core.debug with no startGroup/endGroup', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'pending',
              input: { command: 'ls' },
              raw: '',
            },
          },
        },
      });

      await flushMicrotasks();

      // Assert
      expect(mockCore.startGroup).not.toHaveBeenCalled();
      expect(mockCore.endGroup).not.toHaveBeenCalled();
      expect(mockCore.debug).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCode] Tool: bash - pending')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-1-AC3: text parts are not wrapped in a group', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'text',
            text: 'Assistant response text',
            messageID: 'msg-1',
            sessionID: 'session-123',
          },
        },
      });

      await flushMicrotasks();

      // Assert
      expect(mockCore.startGroup).not.toHaveBeenCalled();
      expect(mockCore.endGroup).not.toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Assistant response text')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-1-AC4: exactly one startGroup/endGroup per tool call — no nesting', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act: emit two completed tool events sequentially
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'ls' },
              output: 'file.txt',
              title: '',
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        },
      });

      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { filePath: './README.md' },
              output: '# README',
              title: '',
              metadata: {},
              time: { start: 1, end: 2 },
            },
          },
        },
      });

      await flushMicrotasks();

      // Assert: two balanced pairs, never nested
      expect(mockCore.startGroup).toHaveBeenCalledTimes(2);
      expect(mockCore.endGroup).toHaveBeenCalledTimes(2);

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });
  });

  describe('debug log integration', () => {
    let mockDebugWriter: jest.Mocked<ReturnType<typeof getDebugLogWriter>>;

    beforeEach(() => {
      resetDebugLogWriter();
    });

    afterEach(() => {
      resetToolLoggerFactory();
      resetDebugLogWriter();
    });

    it('calls writeToolEvent for completed tool state', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeToolEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeToolEvent = writeToolEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'ls' },
              output: 'file.txt',
              title: '',
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        },
      });
      await flushMicrotasks();

      expect(writeToolEventSpy).toHaveBeenCalledWith(expect.stringContaining('Tool: bash'));

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('calls writeToolEvent for error tool state', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeToolEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeToolEvent = writeToolEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read',
            state: {
              status: 'error',
              input: { filePath: './missing.ts' },
              error: 'File not found',
              time: { start: 0, end: 1 },
            },
          },
        },
      });
      await flushMicrotasks();

      expect(writeToolEventSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: File not found')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('does not call writeToolEvent for pending state', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeToolEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeToolEvent = writeToolEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'pending', input: { command: 'ls' }, raw: '' },
          },
        },
      });
      await flushMicrotasks();

      expect(writeToolEventSpy).not.toHaveBeenCalled();

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('calls writeToolEvent for running state', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeToolEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeToolEvent = writeToolEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'running', input: { command: 'ls' }, time: { start: 0 } },
          },
        },
      });
      await flushMicrotasks();

      expect(writeToolEventSpy).toHaveBeenCalledWith(expect.stringContaining('$ ls'));

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('calls writeCompleteMessage at session finalization', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeCompleteMessageSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeCompleteMessage = writeCompleteMessageSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'text',
            text: 'Hello World!',
            messageID: 'msg-1',
            sessionID: 'session-123',
          },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      await sessionPromise;

      expect(writeCompleteMessageSpy).toHaveBeenCalledWith('Hello World!');
    });

    it('calls writeSessionEvent for session idle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeSessionEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeSessionEvent = writeSessionEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      expect(writeSessionEventSpy).toHaveBeenCalledWith('Session idle');
    });

    it('calls writeSessionEvent for session error', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const writeSessionEventSpy = jest.fn();
      const writer = getDebugLogWriter();
      writer.writeSessionEvent = writeSessionEventSpy;

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'session.error',
        properties: {
          sessionID: 'session-123',
          error: 'Connection lost',
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session error: Connection lost');
      expect(writeSessionEventSpy).toHaveBeenCalledWith('Error: Connection lost');
    });

    it('NoOpDebugLogWriter does not cause errors when debug is disabled', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'ls' },
              output: 'file.txt',
              title: '',
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        },
      });
      await flushMicrotasks();

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      const result = await sessionPromise;

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('stop-command wrapping (9-5)', () => {
    let stdoutSpy: jest.SpyInstance;

    beforeEach(() => {
      stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
    });

    it('9-5-AC1: brackets text part with stop-commands open and close markers', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hello world', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      await flushMicrotasks();

      // Assert: stop-commands open written before content, close written after
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
      const stopOpen = stdoutCalls.find((s) => s.startsWith('::stop-commands::'));
      const stopClose = stdoutCalls.find(
        (s) => /^::[^:]+::\n$/.test(s) && !s.startsWith('::stop-commands::')
      );
      expect(stopOpen).toBeDefined();
      expect(stopClose).toBeDefined();

      // Content written between the two markers via core.info
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Hello world'));

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-5-AC1/AC2: text with ::set-output:: is bracketed and fully in messageBuffer', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      // Act
      const injectionText = '::set-output name=x::injected_value';
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: injectionText, messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      await flushMicrotasks();

      // Assert: bracketed
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
      expect(stdoutCalls.some((s) => s.startsWith('::stop-commands::'))).toBe(true);

      // messageBuffer receives full text (AC2)
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      const result = await sessionPromise;
      expect(result.lastMessage).toContain(injectionText);
    });

    it('9-5-AC3: text > MAX_LOG_LINE_LENGTH is chunked; messageBuffer gets full text', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      // Act: emit text longer than 6000 chars
      const longText = 'A'.repeat(13_000);
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: longText, messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      await flushMicrotasks();

      // Assert: core.info called multiple times (chunks), each call <= MAX_LOG_LINE_LENGTH+timestamp overhead
      const infoCalls = mockCore.info.mock.calls as string[][];
      const textInfoCalls = infoCalls.filter((args) => (args[0] ?? '').includes('AAAA'));
      expect(textInfoCalls.length).toBeGreaterThanOrEqual(2);
      for (const [arg] of textInfoCalls) {
        expect((arg ?? '').length).toBeLessThanOrEqual(6_000 + 60); // 6k content + timestamp prefix overhead
      }

      // messageBuffer still gets full text
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      const result = await sessionPromise;
      expect(result.lastMessage).toBe(longText);
    });

    it('9-5-AC5: short text emits single chunk with [OpenCode] prefix', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      // Act
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Short text', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      await flushMicrotasks();

      // Assert: exactly one info call for the text, contains [OpenCode] prefix
      const textInfoCalls = (mockCore.info.mock.calls as string[][]).filter((args) =>
        (args[0] ?? '').includes('Short text')
      );
      expect(textInfoCalls).toHaveLength(1);
      expect(textInfoCalls[0]?.[0]).toMatch(/\[OpenCode\]/);

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('9-5-AC4: tool log path does NOT use stop-command brackets', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      // Act: emit tool part (not text part)
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'ls' },
              output: 'file.txt',
              title: '',
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        },
      });
      await flushMicrotasks();

      // Assert: NO stop-commands written for tool paths
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
      expect(stdoutCalls.some((s) => s.startsWith('::stop-commands::'))).toBe(false);

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });
  });
});
