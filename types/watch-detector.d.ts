declare class WatchPreference {
  watcher: string;
}

declare class WatchDetector {
  constructor(options: any);

  findBestWatcherOption: (options: {
    watcher: string
  }) => WatchPreference;
}

export default HeimdallLogger;
