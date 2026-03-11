import * as fs from 'fs';
import * as core from '@actions/core';

export interface IDebugLogWriter {
  writeToolEvent(debugLog: string): void;
  writeCompleteMessage(text: string): void;
  writeSessionEvent(message: string): void;
}

class DebugLogWriter implements IDebugLogWriter {
  private writeChain: Promise<void> = Promise.resolve();
  private disabled = false;

  constructor(private readonly filePath: string) {
    fs.writeFileSync(filePath, '', { mode: 0o600 });
  }

  writeToolEvent(debugLog: string): void {
    this.append(`\n===\n[${new Date().toISOString()}] [Tool]\n${debugLog}\n`);
  }

  writeCompleteMessage(text: string): void {
    this.append(`\n===\n[${new Date().toISOString()}] [Assistant]\n${text}\n`);
  }

  writeSessionEvent(message: string): void {
    this.append(`\n===\n[${new Date().toISOString()}] [Session] ${message}\n`);
  }

  private append(data: string): void {
    if (this.disabled) return;
    this.writeChain = this.writeChain
      .then(() => fs.promises.appendFile(this.filePath, data))
      .catch((error) => {
        this.disabled = true;
        core.warning(`[OpenCode] Debug log write failed: ${String(error)}`);
      });
  }
}

class NoOpDebugLogWriter implements IDebugLogWriter {
  writeToolEvent(): void {}
  writeCompleteMessage(): void {}
  writeSessionEvent(): void {}
}

let instance: IDebugLogWriter = new NoOpDebugLogWriter();

export function initDebugLogWriter(filePath: string): void {
  instance = new DebugLogWriter(filePath);
}

export function getDebugLogWriter(): IDebugLogWriter {
  return instance;
}

export function resetDebugLogWriter(): void {
  instance = new NoOpDebugLogWriter();
}
