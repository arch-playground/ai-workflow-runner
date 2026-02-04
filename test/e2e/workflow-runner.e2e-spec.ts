import { execSync, spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E Tests for AI Workflow Runner GitHub Action
 *
 * These tests validate complete workflows from user perspective using Docker:
 * - OpenCode SDK integration
 * - Validation script execution (Python/JavaScript)
 * - Input validation and error handling
 * - Signal handling (SIGTERM)
 * - Console output streaming
 */

const DOCKER_IMAGE = process.env['DOCKER_IMAGE'] || 'ai-workflow-runner:test';
const TEST_FIXTURES_DIR = path.join(__dirname, '..', '..', 'test', 'e2e-fixtures');
const TIMEOUT_MS = 180_000; // 3 minutes for OpenCode operations
const SHORT_TIMEOUT_MS = 30_000; // 30 seconds for quick operations

interface DockerRunOptions {
  workflowPath: string;
  prompt?: string;
  envVars?: Record<string, string>;
  timeoutMinutes?: number;
  validationScript?: string;
  validationScriptType?: string;
  validationMaxRetry?: number;
  workspaceDir?: string;
}

interface DockerRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  status?: string;
  result?: string;
}

function runDocker(options: DockerRunOptions): DockerRunResult {
  const {
    workflowPath,
    prompt = '',
    envVars = {},
    timeoutMinutes = 2,
    validationScript = '',
    validationScriptType = '',
    validationMaxRetry = 5,
    workspaceDir = TEST_FIXTURES_DIR,
  } = options;

  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    `${workspaceDir}:/github/workspace`,
    '-e',
    `INPUT_WORKFLOW_PATH=${workflowPath}`,
    '-e',
    `INPUT_PROMPT=${prompt}`,
    '-e',
    `INPUT_ENV_VARS=${JSON.stringify(envVars)}`,
    '-e',
    `INPUT_TIMEOUT_MINUTES=${timeoutMinutes}`,
    '-e',
    'GITHUB_WORKSPACE=/github/workspace',
  ];

  if (validationScript) {
    dockerArgs.push('-e', `INPUT_VALIDATION_SCRIPT=${validationScript}`);
  }

  if (validationScriptType) {
    dockerArgs.push('-e', `INPUT_VALIDATION_SCRIPT_TYPE=${validationScriptType}`);
  }

  if (validationMaxRetry) {
    dockerArgs.push('-e', `INPUT_VALIDATION_MAX_RETRY=${validationMaxRetry}`);
  }

  dockerArgs.push(DOCKER_IMAGE);

  const result = spawnSync('docker', dockerArgs, {
    timeout: TIMEOUT_MS,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  // Parse GitHub Actions outputs from stdout
  const statusMatch = stdout.match(/::set-output name=status::(\w+)/);
  const resultMatch = stdout.match(/::set-output name=result::(.*?)(?:\n|$)/s);

  return {
    exitCode,
    stdout,
    stderr,
    status: statusMatch?.[1],
    result: resultMatch?.[1],
  };
}

function startDockerInBackground(options: DockerRunOptions): {
  process: ChildProcess;
  containerName: string;
} {
  const containerName = `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const {
    workflowPath,
    prompt = '',
    envVars = {},
    timeoutMinutes = 5,
    workspaceDir = TEST_FIXTURES_DIR,
  } = options;

  const dockerArgs = [
    'run',
    '--name',
    containerName,
    '-v',
    `${workspaceDir}:/github/workspace`,
    '-e',
    `INPUT_WORKFLOW_PATH=${workflowPath}`,
    '-e',
    `INPUT_PROMPT=${prompt}`,
    '-e',
    `INPUT_ENV_VARS=${JSON.stringify(envVars)}`,
    '-e',
    `INPUT_TIMEOUT_MINUTES=${timeoutMinutes}`,
    '-e',
    'GITHUB_WORKSPACE=/github/workspace',
    DOCKER_IMAGE,
  ];

  const process = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return { process, containerName };
}

describe('AI Workflow Runner E2E', () => {
  beforeAll(() => {
    // GIVEN: Docker image exists
    try {
      execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'pipe' });
    } catch {
      throw new Error(
        `Docker image ${DOCKER_IMAGE} not found. Run 'docker build -t ${DOCKER_IMAGE} .' first.`
      );
    }

    // GIVEN: Test fixtures directory exists with required files
    if (!fs.existsSync(TEST_FIXTURES_DIR)) {
      fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
    }

    // Create test workflow file
    const workflowContent = `# Test AI Workflow

You are a helpful AI assistant. Please respond to the following task:

Respond with a greeting and list what files you can see in the current directory.

This is a test workflow to verify the OpenCode SDK integration.`;

    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'test-workflow.md'), workflowContent);

    // Create Python validation script
    const pythonValidation = `#!/usr/bin/env python3
import os
import sys

last_message = os.environ.get('AI_LAST_MESSAGE', '')

if not last_message:
    print('No AI response received')
    sys.exit(0)

keywords = ['file', 'directory', 'hello', 'hi', 'test', 'workflow', '.md', '.py', '.js']
if any(keyword.lower() in last_message.lower() for keyword in keywords):
    print('true')
else:
    print(f'Expected keywords but got: {last_message[:200]}...')
`;
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'validate.py'), pythonValidation);
    fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'validate.py'), 0o755);

    // Create JavaScript validation script
    const jsValidation = `#!/usr/bin/env node
const lastMessage = process.env.AI_LAST_MESSAGE || '';

if (!lastMessage) {
  console.log('No AI response received');
  process.exit(0);
}

const keywords = ['file', 'directory', 'hello', 'hi', 'test', 'workflow', '.md', '.py', '.js'];
const hasKeyword = keywords.some(k => lastMessage.toLowerCase().includes(k.toLowerCase()));

if (hasKeyword) {
  console.log('true');
} else {
  console.log(\`Expected keywords but got: \${lastMessage.slice(0, 200)}...\`);
}
`;
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'validate.js'), jsValidation);
    fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'validate.js'), 0o755);

    // Create empty workflow file for error testing
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'empty-workflow.md'), '');

    // Create simple workflow for quick tests
    const simpleWorkflow = 'Say hello in exactly one word.';
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'simple-workflow.md'), simpleWorkflow);

    // Create validation that always succeeds
    const alwaysSucceed = 'print("true")';
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'always-succeed.py'), alwaysSucceed);
    fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'always-succeed.py'), 0o755);

    // Create validation that always fails
    const alwaysFail = 'print("This validation failed intentionally")';
    fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'always-fail.py'), alwaysFail);
    fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'always-fail.py'), 0o755);
  }, 60_000);

  afterAll(() => {
    // Cleanup: Prune any dangling containers
    try {
      execSync('docker container prune -f', { stdio: 'pipe' });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Input Validation', () => {
    it(
      'should return failure when workflow_path is empty',
      () => {
        // GIVEN: Empty workflow path
        const options: DockerRunOptions = {
          workflowPath: '',
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails with validation error
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
      },
      SHORT_TIMEOUT_MS
    );

    it(
      'should return failure when workflow file does not exist',
      () => {
        // GIVEN: Non-existent workflow file
        const options: DockerRunOptions = {
          workflowPath: 'does-not-exist.md',
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails with file not found error
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
        expect(result.stdout).toMatch(/not found|does not exist/i);
      },
      SHORT_TIMEOUT_MS
    );

    it(
      'should return failure when env_vars is invalid JSON',
      () => {
        // GIVEN: Invalid JSON for env_vars
        const dockerArgs = [
          'run',
          '--rm',
          '-v',
          `${TEST_FIXTURES_DIR}:/github/workspace`,
          '-e',
          'INPUT_WORKFLOW_PATH=test-workflow.md',
          '-e',
          'INPUT_PROMPT=test',
          '-e',
          'INPUT_ENV_VARS=not-valid-json',
          '-e',
          'INPUT_TIMEOUT_MINUTES=1',
          '-e',
          'GITHUB_WORKSPACE=/github/workspace',
          DOCKER_IMAGE,
        ];

        // WHEN: Running the action
        let exitCode = 0;
        let stdout = '';
        try {
          stdout = execSync(`docker ${dockerArgs.join(' ')}`, {
            timeout: SHORT_TIMEOUT_MS,
            encoding: 'utf8',
          });
        } catch (error) {
          const execError = error as { status?: number; stdout?: string };
          exitCode = execError.status ?? 1;
          stdout = execError.stdout?.toString() ?? '';
        }

        // THEN: Action fails with JSON parse error
        expect(exitCode).not.toBe(0);
        expect(stdout).toMatch(/status::failure/);
      },
      SHORT_TIMEOUT_MS
    );

    it(
      'should return failure when workflow file is empty',
      () => {
        // GIVEN: Empty workflow file
        const options: DockerRunOptions = {
          workflowPath: 'empty-workflow.md',
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails with empty file error
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
        expect(result.stdout).toMatch(/empty/i);
      },
      SHORT_TIMEOUT_MS
    );

    it(
      'should return failure for path traversal attempt',
      () => {
        // GIVEN: Path traversal in workflow_path
        const options: DockerRunOptions = {
          workflowPath: '../../../etc/passwd',
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails with security error
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
      },
      SHORT_TIMEOUT_MS
    );

    it(
      'should return failure when validation_max_retry exceeds limit',
      () => {
        // GIVEN: validation_max_retry > 20
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          validationScript: 'always-succeed.py',
          validationMaxRetry: 25,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails with validation error
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
        expect(result.stdout).toMatch(/validation_max_retry|between 1 and 20/i);
      },
      SHORT_TIMEOUT_MS
    );
  });

  describe('Basic Workflow Execution', () => {
    it(
      'should execute simple workflow successfully',
      () => {
        // GIVEN: Valid simple workflow
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Just say hello',
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action succeeds
        expect(result.status).toBe('success');
        expect(result.exitCode).toBe(0);

        // THEN: Result contains session info
        expect(result.result).toBeDefined();
        const parsedResult = JSON.parse(result.result!) as {
          sessionId: string;
          lastMessage: string;
        };
        expect(parsedResult.sessionId).toBeDefined();
        expect(parsedResult.lastMessage).toBeDefined();
      },
      TIMEOUT_MS
    );

    it(
      'should stream OpenCode output to console',
      () => {
        // GIVEN: Valid workflow
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Console shows OpenCode output with prefix
        expect(result.stdout).toContain('[OpenCode]');
        expect(result.stdout).toContain('Initializing SDK server');
        expect(result.stdout).toContain('Session created');
      },
      TIMEOUT_MS
    );

    it(
      'should combine workflow content with user prompt',
      () => {
        // GIVEN: Workflow with additional prompt
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Also tell me what 2+2 equals',
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action succeeds and shows User Input section
        expect(result.status).toBe('success');
        expect(result.stdout).toContain('User Input:');
      },
      TIMEOUT_MS
    );

    it(
      'should pass environment variables to workflow',
      () => {
        // GIVEN: Workflow with env vars
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          envVars: { TEST_VAR: 'test_value', ANOTHER_VAR: 'another_value' },
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action succeeds
        expect(result.status).toBe('success');
        expect(result.stdout).toContain('Environment variables: 2 entries');
      },
      TIMEOUT_MS
    );
  });

  describe('Python Validation Script', () => {
    it(
      'should execute Python validation script successfully',
      () => {
        // GIVEN: Workflow with Python validation
        const options: DockerRunOptions = {
          workflowPath: 'test-workflow.md',
          prompt: 'List the files you can see',
          validationScript: 'validate.py',
          validationMaxRetry: 2,
          timeoutMinutes: 3,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation executes and succeeds
        expect(result.stdout).toContain('[Validation] Attempt 1/2');
        expect(result.stdout).toContain('Executing python script');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should pass AI_LAST_MESSAGE to validation script',
      () => {
        // GIVEN: Validation script that checks env var
        const envCheckScript = `import os
msg = os.environ.get('AI_LAST_MESSAGE', '')
if msg:
    print('true')
else:
    print('AI_LAST_MESSAGE not set')
`;
        fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'env-check.py'), envCheckScript);
        fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'env-check.py'), 0o755);

        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'env-check.py',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation receives AI_LAST_MESSAGE
        expect(result.stdout).toContain('[Validation] Success');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should fail after max validation retries',
      () => {
        // GIVEN: Validation that always fails
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'always-fail.py',
          validationMaxRetry: 2,
          timeoutMinutes: 3,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Action fails after retries
        expect(result.stdout).toContain('[Validation] Attempt 1/2');
        expect(result.stdout).toContain('[Validation] Attempt 2/2');
        expect(result.exitCode).not.toBe(0);
        expect(result.status).toBe('failure');
      },
      TIMEOUT_MS
    );
  });

  describe('JavaScript Validation Script', () => {
    it(
      'should execute JavaScript validation script successfully',
      () => {
        // GIVEN: Workflow with JavaScript validation
        const options: DockerRunOptions = {
          workflowPath: 'test-workflow.md',
          prompt: 'List the files you can see',
          validationScript: 'validate.js',
          validationMaxRetry: 2,
          timeoutMinutes: 3,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation executes and succeeds
        expect(result.stdout).toContain('[Validation] Attempt 1/2');
        expect(result.stdout).toContain('Executing javascript script');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );
  });

  describe('Inline Validation Scripts', () => {
    it(
      'should execute inline Python validation script',
      () => {
        // GIVEN: Inline Python validation
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript:
            'python:import os; print("true" if os.environ.get("AI_LAST_MESSAGE") else "no message")',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Inline script executes
        expect(result.stdout).toContain('inline: true');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should execute inline JavaScript validation script',
      () => {
        // GIVEN: Inline JavaScript validation
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'js:console.log(process.env.AI_LAST_MESSAGE ? "true" : "no message")',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Inline script executes
        expect(result.stdout).toContain('inline: true');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should handle javascript: prefix for inline scripts',
      () => {
        // GIVEN: Inline script with full javascript: prefix
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'javascript:console.log("true")',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Script executes with correct type
        expect(result.stdout).toContain('Executing javascript script');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );
  });

  describe('Signal Handling', () => {
    it('should handle SIGTERM gracefully', () => {
      // GIVEN: Long-running workflow
      const { process: dockerProcess, containerName } = startDockerInBackground({
        workflowPath: 'test-workflow.md',
        prompt: 'Write a very long detailed essay about artificial intelligence',
        timeoutMinutes: 5,
      });

      let stdout = '';

      dockerProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      return new Promise<void>((resolve, reject) => {
        // Wait for initialization
        const initWait = setTimeout(() => {
          // WHEN: Sending SIGTERM
          try {
            execSync(`docker kill --signal=SIGTERM ${containerName}`, { stdio: 'pipe' });
          } catch {
            // Container might have already exited
          }
        }, 5000);

        dockerProcess.on('close', () => {
          clearTimeout(initWait);

          // Get container logs
          try {
            const logs = execSync(`docker logs ${containerName} 2>&1`, {
              encoding: 'utf8',
            });
            stdout = logs;
          } catch {
            // Container might be removed
          }

          // Cleanup
          try {
            execSync(`docker rm -f ${containerName}`, { stdio: 'pipe' });
          } catch {
            // Ignore
          }

          // THEN: Process exits gracefully
          try {
            expect(stdout).toContain('shutdown');
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Timeout for the entire test
        setTimeout(() => {
          try {
            execSync(`docker rm -f ${containerName}`, { stdio: 'pipe' });
          } catch {
            // Ignore
          }
          reject(new Error('Test timed out'));
        }, 30_000);
      });
    }, 60_000);
  });

  describe('Validation Script Edge Cases', () => {
    it(
      'should detect script type by .py extension (case insensitive)',
      () => {
        // GIVEN: Script with uppercase .PY extension
        fs.copyFileSync(
          path.join(TEST_FIXTURES_DIR, 'always-succeed.py'),
          path.join(TEST_FIXTURES_DIR, 'UPPERCASE.PY')
        );

        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'UPPERCASE.PY',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Script type detected correctly
        expect(result.stdout).toContain('Executing python script');
        expect(result.status).toBe('success');

        // Cleanup
        fs.unlinkSync(path.join(TEST_FIXTURES_DIR, 'UPPERCASE.PY'));
      },
      TIMEOUT_MS
    );

    it(
      'should detect script type by .js extension (case insensitive)',
      () => {
        // GIVEN: Script with uppercase .JS extension
        const jsContent = 'console.log("true")';
        fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'UPPERCASE.JS'), jsContent);

        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'UPPERCASE.JS',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Script type detected correctly
        expect(result.stdout).toContain('Executing javascript script');
        expect(result.status).toBe('success');

        // Cleanup
        fs.unlinkSync(path.join(TEST_FIXTURES_DIR, 'UPPERCASE.JS'));
      },
      TIMEOUT_MS
    );

    it(
      'should return success for validation script outputting "true"',
      () => {
        // GIVEN: Script that outputs "true"
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'python:print("true")',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation succeeds
        expect(result.stdout).toContain('[Validation] Success');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should return success for validation script outputting "TRUE" (case insensitive)',
      () => {
        // GIVEN: Script that outputs "TRUE"
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'python:print("TRUE")',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation succeeds
        expect(result.stdout).toContain('[Validation] Success');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should return success for validation script outputting empty string',
      () => {
        // GIVEN: Script that outputs nothing
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'python:pass',
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Validation succeeds (empty = success)
        expect(result.stdout).toContain('[Validation] Success');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );

    it(
      'should pass user env_vars to validation script',
      () => {
        // GIVEN: Script that checks custom env var
        const envCheckScript = `import os
custom_var = os.environ.get('MY_CUSTOM_VAR', '')
if custom_var == 'my_value':
    print('true')
else:
    print(f'MY_CUSTOM_VAR was: {custom_var}')
`;
        fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'env-custom-check.py'), envCheckScript);
        fs.chmodSync(path.join(TEST_FIXTURES_DIR, 'env-custom-check.py'), 0o755);

        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          validationScript: 'env-custom-check.py',
          envVars: { MY_CUSTOM_VAR: 'my_value' },
          validationMaxRetry: 1,
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Custom env var is passed to validation
        expect(result.stdout).toContain('[Validation] Success');
        expect(result.status).toBe('success');
      },
      TIMEOUT_MS
    );
  });

  describe('Output Format', () => {
    it(
      'should set status output correctly on success',
      () => {
        // GIVEN: Valid workflow
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Status output is set to success
        expect(result.stdout).toContain('::set-output name=status::success');
      },
      TIMEOUT_MS
    );

    it(
      'should set result output with JSON containing sessionId',
      () => {
        // GIVEN: Valid workflow
        const options: DockerRunOptions = {
          workflowPath: 'simple-workflow.md',
          prompt: 'Say hello',
          timeoutMinutes: 2,
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Result output contains valid JSON with sessionId
        expect(result.result).toBeDefined();
        const parsed = JSON.parse(result.result!) as { sessionId: string };
        expect(parsed.sessionId).toBeDefined();
        expect(parsed.sessionId).toMatch(/^ses_/);
      },
      TIMEOUT_MS
    );

    it(
      'should set status output to failure on error',
      () => {
        // GIVEN: Invalid workflow path
        const options: DockerRunOptions = {
          workflowPath: 'non-existent.md',
        };

        // WHEN: Running the action
        const result = runDocker(options);

        // THEN: Status output is set to failure
        expect(result.stdout).toContain('::set-output name=status::failure');
      },
      SHORT_TIMEOUT_MS
    );
  });
});
