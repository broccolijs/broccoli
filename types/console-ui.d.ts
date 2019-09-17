import { Stream } from "stream";

declare class UI {
  constructor(options: {
    inputStream: Stream,
    outputStream: Stream,
    errorStream: Stream;
    writeLevel: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
    ci: boolean;
  });

  write(message: string, writeLevel?: string): void;
  writeLine(message: string, writeLevel?: string): void;

  writeErrorLine(message: string): void;
  writeDebugLine(message: string): void;
  writeInfoLine(message: string): void;
  writeWarnLine(message: string): void;
  writeDeprecateLine(message: string, deprecated: boolean): void;

  writeError(error: Error): void;
  setWriteLevel(level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'): void;

  startProgress(message: string): void;
  stopProgress(): void;
  prompt(queryForInquirer: any, callback: any): void;
  writeLevelVisible(level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'): void;
}

export default UI;