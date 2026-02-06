import { readFileSync } from 'fs';
import { join } from 'path';

interface ActionInput {
  description: string;
  required: boolean;
  default?: string;
}

interface ActionYml {
  inputs: Record<string, ActionInput>;
}

function loadActionYml(): ActionYml {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const yaml: { load: (content: string) => unknown } = require('js-yaml');
  const content = readFileSync(join(__dirname, '..', 'action.yml'), 'utf8');
  return yaml.load(content) as ActionYml;
}

describe('action.yml schema validation', () => {
  let actionYml: ActionYml;

  beforeAll(() => {
    actionYml = loadActionYml();
  });

  it('defines opencode_config as optional string with correct description (7.1-UNIT-001)', () => {
    // Arrange
    const input = actionYml.inputs['opencode_config'];

    // Assert
    expect(input).toBeDefined();
    expect(input.required).toBe(false);
    expect(input.default).toBe('');
    expect(input.description).toContain('OpenCode');
    expect(input.description).toContain('config');
  });

  it('defines auth_config as optional string with correct description (7.1-UNIT-002)', () => {
    // Arrange
    const input = actionYml.inputs['auth_config'];

    // Assert
    expect(input).toBeDefined();
    expect(input.required).toBe(false);
    expect(input.default).toBe('');
    expect(input.description).toContain('auth');
  });

  it('defines model as optional string with correct description (7.1-UNIT-003)', () => {
    // Arrange
    const input = actionYml.inputs['model'];

    // Assert
    expect(input).toBeDefined();
    expect(input.required).toBe(false);
    expect(input.default).toBe('');
    expect(input.description).toContain('Model');
  });

  it('defines list_models as optional boolean-string with default false (7.1-UNIT-004)', () => {
    // Arrange
    const input = actionYml.inputs['list_models'];

    // Assert
    expect(input).toBeDefined();
    expect(input.required).toBe(false);
    expect(input.default).toBe('false');
    expect(input.description).toContain('models');
  });
});
