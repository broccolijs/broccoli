declare class HeimdallLogger {
  constructor(namespace: string);

  debug: (...args: any[]) => any;
}

export default HeimdallLogger;
