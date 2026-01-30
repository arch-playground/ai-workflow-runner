import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Validates that a path is within the workspace and doesn't escape via traversal.
 * Returns the resolved absolute path if valid, throws if invalid.
 */
export function validateWorkspacePath(workspacePath: string, relativePath: string): string {
  const normalizedRelative = path.normalize(relativePath);

  if (normalizedRelative.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      'Invalid workflow path: absolute paths and parent directory references are not allowed'
    );
  }

  const realWorkspace = fs.realpathSync(workspacePath);
  const absolutePath = path.resolve(realWorkspace, normalizedRelative);

  if (!absolutePath.startsWith(realWorkspace + path.sep) && absolutePath !== realWorkspace) {
    throw new Error('Invalid workflow path: path escapes the workspace directory');
  }

  return absolutePath;
}

/**
 * Validates the REAL path of a file (following symlinks) is within workspace.
 * Call this AFTER confirming the file exists.
 * Returns the real path if valid, throws if symlink escapes workspace.
 */
export function validateRealPath(workspacePath: string, filePath: string): string {
  const realWorkspace = fs.realpathSync(workspacePath);
  const realFilePath = fs.realpathSync(filePath);

  if (!realFilePath.startsWith(realWorkspace + path.sep) && realFilePath !== realWorkspace) {
    throw new Error('Invalid workflow path: symlink target escapes the workspace directory');
  }

  return realFilePath;
}

/**
 * Masks all values in envVars as secrets to prevent log exposure.
 */
export function maskSecrets(envVars: Record<string, string>): void {
  for (const value of Object.values(envVars)) {
    if (value && value.length > 0) {
      core.setSecret(value);
    }
  }
}

/**
 * Sanitizes error messages to remove sensitive information.
 */
export function sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  message = message.replace(/\/[^\s]+/g, '[PATH]');
  message = message.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');

  return message;
}

/**
 * Validates file encoding is valid UTF-8 by checking for invalid byte sequences.
 */
export function validateUtf8(buffer: Buffer, filePath: string): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    throw new Error(`File is not valid UTF-8: ${path.basename(filePath)}`);
  }
}
