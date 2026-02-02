import { execSync } from 'child_process';

const DOCKER_IMAGE = process.env['DOCKER_IMAGE'] || 'ai-workflow-runner:test';
const TIMEOUT_MS = 60000;

describe('Docker Container Integration', () => {
  beforeAll(() => {
    try {
      execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'pipe' });
    } catch {
      throw new Error(`Docker image ${DOCKER_IMAGE} not found. Run docker build first.`);
    }
  });

  afterAll(() => {
    try {
      execSync('docker container prune -f', { stdio: 'pipe' });
    } catch {
      // Ignore cleanup errors
    }
  });

  test(
    'Node.js 20+ is available',
    () => {
      const output = execSync(`docker run --rm --entrypoint node ${DOCKER_IMAGE} --version`, {
        timeout: TIMEOUT_MS,
      })
        .toString()
        .trim();
      const version = parseInt(output.replace('v', '').split('.')[0] ?? '0', 10);
      expect(version).toBeGreaterThanOrEqual(20);
    },
    TIMEOUT_MS
  );

  test(
    'Python 3.11 is available',
    () => {
      const output = execSync(`docker run --rm --entrypoint python3.11 ${DOCKER_IMAGE} --version`, {
        timeout: TIMEOUT_MS,
      })
        .toString()
        .trim();
      expect(output).toMatch(/Python 3\.11/);
    },
    TIMEOUT_MS
  );

  test(
    'Java 21 is available',
    () => {
      const output = execSync(`docker run --rm --entrypoint java ${DOCKER_IMAGE} --version`, {
        timeout: TIMEOUT_MS,
      })
        .toString()
        .trim();
      expect(output).toMatch(/21/);
    },
    TIMEOUT_MS
  );

  test(
    'entrypoint.sh is executable',
    () => {
      const output = execSync(
        `docker run --rm --entrypoint ls ${DOCKER_IMAGE} -la /entrypoint.sh`,
        {
          timeout: TIMEOUT_MS,
        }
      )
        .toString()
        .trim();
      expect(output).toMatch(/^-rwx/);
    },
    TIMEOUT_MS
  );

  test(
    'application files exist',
    () => {
      const output = execSync(`docker run --rm --entrypoint ls ${DOCKER_IMAGE} -la /app/dist/`, {
        timeout: TIMEOUT_MS,
      })
        .toString()
        .trim();
      expect(output).toContain('index.js');
    },
    TIMEOUT_MS
  );

  test('SIGTERM is forwarded to Node.js process', () => {
    const containerName = `test-sigterm-${Date.now()}`;

    const nodeCode = `process.on('SIGTERM', () => { console.log('SIGTERM received'); process.exit(0); }); setTimeout(() => {}, 60000);`;
    execSync(
      `docker run -d --name ${containerName} --entrypoint node ${DOCKER_IMAGE} -e "${nodeCode}"`,
      {
        timeout: TIMEOUT_MS,
      }
    );

    try {
      execSync('sleep 2');

      execSync(`docker kill --signal=SIGTERM ${containerName}`, { timeout: TIMEOUT_MS });

      const exitCode = execSync(`docker wait ${containerName}`, { timeout: 15000 })
        .toString()
        .trim();

      expect(exitCode).toBe('0');

      const logs = execSync(`docker logs ${containerName}`, { timeout: TIMEOUT_MS }).toString();
      expect(logs).toContain('SIGTERM');
    } finally {
      execSync(`docker rm -f ${containerName} 2>/dev/null || true`, { stdio: 'pipe' });
    }
  }, 30000);
});
