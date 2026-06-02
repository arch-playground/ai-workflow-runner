export const getInput = jest.fn();
export const setOutput = jest.fn();
export const setFailed = jest.fn();
export const info = jest.fn();
export const debug = jest.fn();
export const warning = jest.fn();
export const error = jest.fn();
export const setSecret = jest.fn();
export const startGroup = jest.fn();
export const endGroup = jest.fn();

const summaryObject = {
  addHeading: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addRaw: jest.fn().mockReturnThis(),
  addCodeBlock: jest.fn().mockReturnThis(),
  addDetails: jest.fn().mockReturnThis(),
  addEOL: jest.fn().mockReturnThis(),
  addBreak: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined),
};
export const summary = summaryObject;
