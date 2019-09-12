export = {
  get Builder() {
    return require('./builder');
  },
  get loadBrocfile() {
    return require('./load_brocfile');
  },
  get server() {
    return require('./server');
  },
  get getMiddleware() {
    return require('./middleware').default;
  },
  get Watcher() {
    return require('./watcher').default;
  },
  get WatcherAdapter() {
    return require('./watcher_adapter').default;
  },
  get cli() {
    return require('./cli').default;
  },
};
