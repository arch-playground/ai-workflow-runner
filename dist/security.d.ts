/**
 * Validates that a path is within the workspace and doesn't escape via traversal.
 * Returns the resolved absolute path if valid, throws if invalid.
 */
export declare function validateWorkspacePath(workspacePath: string, relativePath: string): string;
/**
 * Validates the REAL path of a file (following symlinks) is within workspace.
 * Call this AFTER confirming the file exists.
 * Returns the real path if valid, throws if symlink escapes workspace.
 */
export declare function validateRealPath(workspacePath: string, filePath: string): string;
/**
 * Masks all values in envVars as secrets to prevent log exposure.
 */
export declare function maskSecrets(envVars: Record<string, string>): void;
/**
 * Sanitizes error messages to remove sensitive information.
 */
export declare function sanitizeErrorMessage(error: Error): string;
/**
 * Validates file encoding is valid UTF-8 by checking for invalid byte sequences.
 */
export declare function validateUtf8(buffer: Buffer, filePath: string): string;
