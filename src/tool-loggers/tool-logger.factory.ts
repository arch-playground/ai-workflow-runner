import { IToolLogger } from './tool-logger.interface.js';

export class ToolLoggerFactory {
  private readonly loggers: Map<string, IToolLogger>;
  private readonly defaultLogger: IToolLogger;

  constructor(loggers: IToolLogger[]) {
    this.loggers = new Map<string, IToolLogger>();
    let defaultFound: IToolLogger | undefined;

    for (const logger of loggers) {
      const key = logger.support();

      if (key === 'default') {
        if (defaultFound) {
          throw new Error(`Duplicate support() value detected: 'default'`);
        }
        defaultFound = logger;
      } else {
        if (this.loggers.has(key)) {
          throw new Error(`Duplicate support() value detected: '${key}'`);
        }
        this.loggers.set(key, logger);
      }
    }

    if (!defaultFound) {
      throw new Error('No default logger found. At least one logger must support "default".');
    }

    this.defaultLogger = defaultFound;
  }

  getLogger(tool: string): IToolLogger {
    return this.loggers.get(tool) ?? this.defaultLogger;
  }
}
