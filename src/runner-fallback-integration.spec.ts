/**
 * Epic 11 end-to-end integration tests (11-6).
 *
 * These tests exercise the full fallback pipeline through runWorkflow:
 *   loadFallbackConfig → getAuthenticatedProviderIds → preflightFallbackChain
 *   → runSessionWithFallback → aggregation/precedence
 *
 * Unlike runner.spec.ts (which mocks fallback-config and uses a mock OpenCodeService),
 * this suite:
 *   - Uses REAL loadFallbackConfig (reads a temp file — catches D8 end-to-end).
 *   - Uses REAL preflightFallbackChain.
 *   - Uses REAL OpenCodeService wired to a MockClient + eventControl (the same harness
 *     as opencode-fallback.spec.ts), so session events flow through the actual selector.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runWorkflow } from './runner';
import { resetOpenCodeService } from './opencode';
import { ActionInputs, INPUT_LIMITS } from './types';
import {
  EventControl,
  createEventGenerator,
  createMockClient,
  createMockServer,
  setupMockCreateOpencode,
  flushMicrotasks,
} from './opencode-test-helpers';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk/v2');
// NOTE: fallback-config is NOT mocked here — the real parser is under test.
// NOTE: opencode module is NOT mocked — but createOpencode IS mocked via @opencode-ai/sdk/v2.

describe('runWorkflow — Epic 11 fallback pipeline (integration)', () => {
  let tempDir: string;
  let workflowFile: string;
  let eventControl: EventControl;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-fallback-'));
    workflowFile = path.join(tempDir, 'workflow.md');
    fs.writeFileSync(workflowFile, '# Test Workflow');

    process.env = { ...originalEnv, GITHUB_WORKSPACE: tempDir };

    // Wire MockClient + eventControl into the real OpenCodeService
    eventControl = createEventGenerator();
    const mockServer = createMockServer();
    const mockClient = createMockClient();
    setupMockCreateOpencode(mockClient, mockServer, eventControl);

    // Two sessions: session-1 for p0, session-2 for p1
    let callCount = 0;
    mockClient.session.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ data: { id: `session-${callCount}` } });
    });

    // Default: v2.provider.list returns p0 and p1 as authenticated
    mockClient.v2.provider.list.mockResolvedValue({
      data: [
        { id: 'p0', enabled: { via: 'account', service: 'p0' } },
        { id: 'p1', enabled: { via: 'account', service: 'p1' } },
      ],
    });
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFallbackConfig(content: unknown): string {
    const filePath = path.join(tempDir, 'fallback.json');
    fs.writeFileSync(filePath, JSON.stringify(content));
    return filePath;
  }

  function createInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
    return {
      workflowPath: 'workflow.md',
      prompt: 'Test prompt',
      envVars: {},
      timeoutMs: INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000,
      maxValidationRetries: INPUT_LIMITS.DEFAULT_VALIDATION_RETRY,
      listModels: false,
      disableFreeModels: false,
      subscriptionProviders: [],
      debugLog: false,
      debugLogPath: '',
      exportTranscript: false,
      transcriptPath: '',
      writeJobSummary: false,
      bashAllowPatterns: '',
      ...overrides,
    };
  }

  it('11-6-AC2: p0 errors → p1 commits → success on p1 (advance path, end-to-end)', async () => {
    // Arrange
    const fallbackConfigPath = writeFallbackConfig({
      chain: [
        { provider: 'p0', model: 'p0/m0' },
        { provider: 'p1', model: 'p1/m1' },
      ],
    });
    const inputs = createInputs({ fallbackConfig: fallbackConfigPath });

    // Act — drive the full pipeline
    const resultPromise = runWorkflow(inputs);

    // p0 errors before assistant content
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'p0 auth failed' },
    });

    // p1 gets assistant message → commit
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'msg-p1', role: 'assistant', sessionID: 'session-2' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'Response from p1',
          messageID: 'msg-p1',
          sessionID: 'session-2',
        },
      },
    });
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-2' } });

    const result = await resultPromise;

    // Assert — success on p1
    expect(result.success).toBe(true);
    expect(result.output).toContain('session-2');
    expect(result.error).toBeUndefined();
  });

  it('11-6-AC3: p0 commits → p1 never tried (D2 no mid-run failover, end-to-end)', async () => {
    // Arrange
    const fallbackConfigPath = writeFallbackConfig({
      chain: [
        { provider: 'p0', model: 'p0/m0' },
        { provider: 'p1', model: 'p1/m1' },
      ],
    });
    const inputs = createInputs({ fallbackConfig: fallbackConfigPath });

    // Act
    const resultPromise = runWorkflow(inputs);

    // p0 commits (assistant part arrives)
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'msg-p0', role: 'assistant', sessionID: 'session-1' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'Response from p0',
          messageID: 'msg-p0',
          sessionID: 'session-1',
        },
      },
    });
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

    const result = await resultPromise;

    // Assert — success on p0, session-2 never created
    expect(result.success).toBe(true);
    expect(result.output).toContain('session-1');
    // p1 (session-2) was never attempted
    expect(result.output).not.toContain('session-2');
  });

  it('11-6-AC4: all providers fail → aggregated exhaustion error with per-provider reasons', async () => {
    // Arrange
    const fallbackConfigPath = writeFallbackConfig({
      chain: [
        { provider: 'p0', model: 'p0/m0' },
        { provider: 'p1', model: 'p1/m1' },
      ],
    });
    const inputs = createInputs({ fallbackConfig: fallbackConfigPath });

    // Act
    const resultPromise = runWorkflow(inputs);

    // p0 errors
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'p0 quota exceeded' },
    });

    // p1 errors
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-2', error: 'p1 auth invalid' },
    });

    const result = await resultPromise;

    // Assert — aggregated failure
    expect(result.success).toBe(false);
    expect(result.error).toContain('2 fallback providers failed');
    expect(result.error).toContain('p0');
    expect(result.error).toContain('p1');
  });

  it('11-6-AC5: all chain providers unauthenticated → clear AC2 message', async () => {
    // Arrange — v2.provider.list returns no authenticated providers
    const unauthControl = createEventGenerator();
    const unauthClient = createMockClient();
    const unauthServer = createMockServer();
    unauthClient.v2.provider.list.mockResolvedValue({ data: [] });
    setupMockCreateOpencode(unauthClient, unauthServer, unauthControl);

    const fallbackConfigPath = writeFallbackConfig({
      chain: [
        { provider: 'p0', model: 'p0/m0' },
        { provider: 'p1', model: 'p1/m1' },
      ],
    });
    const inputs = createInputs({ fallbackConfig: fallbackConfigPath });

    // Act
    const result = await runWorkflow(inputs);
    unauthControl.stop();

    // Assert — AC2 of 11-5: distinct unauthenticated message
    expect(result.success).toBe(false);
    expect(result.error).toContain('No fallback providers are authenticated');
    expect(result.error).toContain('p0');
    expect(result.error).toContain('p1');
  });

  it('11-6-AC6: fallback_config with credentials → D8 error at runWorkflow level', async () => {
    // Arrange — config contains a "token" field (credential key)
    const fallbackConfigPath = writeFallbackConfig({
      chain: [{ provider: 'p0', model: 'p0/m0', token: 'sk-secret-abc' }],
    });
    const inputs = createInputs({ fallbackConfig: fallbackConfigPath });

    // Act
    const result = await runWorkflow(inputs);

    // Assert — D8 error propagated from loadFallbackConfig through runWorkflow
    expect(result.success).toBe(false);
    expect(result.error).toContain('fallback_config must not contain credentials');
  });
});
