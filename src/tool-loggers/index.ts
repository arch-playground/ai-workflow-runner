import { ToolLoggerFactory } from './tool-logger.factory.js';
import { DefaultToolLogger } from './impl/default.tool-logger.js';
import { ReadToolLogger } from './impl/read.tool-logger.js';
import { WriteToolLogger } from './impl/write.tool-logger.js';
import { EditToolLogger } from './impl/edit.tool-logger.js';
import { BashToolLogger } from './impl/bash.tool-logger.js';
import { GrepToolLogger } from './impl/grep.tool-logger.js';
import { GlobToolLogger } from './impl/glob.tool-logger.js';
import { TodoWriteToolLogger } from './impl/todowrite.tool-logger.js';

export type { IToolLogger } from './tool-logger.interface.js';
export { ToolLoggerFactory } from './tool-logger.factory.js';

const ToolLoggerImpls = [
  new DefaultToolLogger(),
  new ReadToolLogger(),
  new WriteToolLogger(),
  new EditToolLogger(),
  new BashToolLogger(),
  new GrepToolLogger(),
  new GlobToolLogger(),
  new TodoWriteToolLogger(),
];

let toolLoggerFactoryInstance: ToolLoggerFactory | null = null;

export function getToolLoggerFactory(): ToolLoggerFactory {
  if (!toolLoggerFactoryInstance) {
    toolLoggerFactoryInstance = new ToolLoggerFactory(ToolLoggerImpls);
  }
  return toolLoggerFactoryInstance;
}

export function resetToolLoggerFactory(): void {
  toolLoggerFactoryInstance = null;
}
