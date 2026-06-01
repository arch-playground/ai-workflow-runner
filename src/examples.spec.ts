import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const EXAMPLES_DIR = path.resolve(__dirname, '..', 'examples');

describe('Example Workflows', () => {
  describe('basic-workflow', () => {
    it('7.5-UNIT-001: workflow.md exists', () => {
      expect(fs.existsSync(path.join(EXAMPLES_DIR, 'basic-workflow', 'workflow.md'))).toBe(true);
    });

    it('7.5-UNIT-002: run-ai.yml is valid YAML', () => {
      const ymlPath = path.join(
        EXAMPLES_DIR,
        'basic-workflow',
        '.github',
        'workflows',
        'run-ai.yml'
      );
      expect(fs.existsSync(ymlPath)).toBe(true);
      const content = fs.readFileSync(ymlPath, 'utf8');
      expect(() => yaml.load(content)).not.toThrow();
    });
  });

  describe('with-validation', () => {
    it('7.5-UNIT-003: required files exist', () => {
      const dir = path.join(EXAMPLES_DIR, 'with-validation');
      expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'workflow.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'validate.py'))).toBe(true);
    });
  });

  describe('github-copilot', () => {
    it('7.5-UNIT-004: required files exist', () => {
      const dir = path.join(EXAMPLES_DIR, 'github-copilot');
      expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'workflow.md'))).toBe(true);
    });
  });

  describe('custom-model', () => {
    it('7.5-UNIT-005: required files exist', () => {
      const dir = path.join(EXAMPLES_DIR, 'custom-model');
      expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'workflow.md'))).toBe(true);
    });
  });

  describe('9.6-AC4: conversation-logging', () => {
    const dir = path.join(EXAMPLES_DIR, 'conversation-logging');

    it('required files exist', () => {
      expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'workflow.md'))).toBe(true);
    });

    it('run-ai.yml is valid YAML', () => {
      const ymlPath = path.join(dir, '.github', 'workflows', 'run-ai.yml');
      expect(fs.existsSync(ymlPath)).toBe(true);
      const content = fs.readFileSync(ymlPath, 'utf8');
      expect(() => yaml.load(content)).not.toThrow();
    });

    it('run-ai.yml sets export_transcript to true', () => {
      const ymlPath = path.join(dir, '.github', 'workflows', 'run-ai.yml');
      const content = fs.readFileSync(ymlPath, 'utf8');
      const parsed = yaml.load(content) as {
        jobs: Record<string, { steps: Array<{ with?: Record<string, string> }> }>;
      };
      const steps = Object.values(parsed.jobs)[0]!.steps;
      const aiStep = steps.find((s) => s.with?.['export_transcript']);
      expect(aiStep).toBeDefined();
      expect(aiStep!.with!['export_transcript']).toBe('true');
    });

    it('run-ai.yml sets write_job_summary to true', () => {
      const ymlPath = path.join(dir, '.github', 'workflows', 'run-ai.yml');
      const content = fs.readFileSync(ymlPath, 'utf8');
      const parsed = yaml.load(content) as {
        jobs: Record<string, { steps: Array<{ with?: Record<string, string> }> }>;
      };
      const steps = Object.values(parsed.jobs)[0]!.steps;
      const aiStep = steps.find((s) => s.with?.['write_job_summary']);
      expect(aiStep).toBeDefined();
      expect(aiStep!.with!['write_job_summary']).toBe('true');
    });

    it('run-ai.yml includes upload-artifact step referencing transcript_json_path output', () => {
      const ymlPath = path.join(dir, '.github', 'workflows', 'run-ai.yml');
      const content = fs.readFileSync(ymlPath, 'utf8');
      // Check that the YAML references transcript_json_path output and upload-artifact
      expect(content).toContain('transcript_json_path');
      expect(content).toContain('upload-artifact');
    });
  });
});
