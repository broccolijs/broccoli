import sane from 'sane';
import SourceNodeWrapper from '../wrappers/source-node';
import TransformNodeWrapper from '../wrappers/transform-node';
import WatcherAdapter from '../watcher_adapter';
import HeimdallLogger from 'heimdalljs-logger';

const logger = new HeimdallLogger('broccoli:watcherAdapter');

export default function bindFileEvent(
  adapter: WatcherAdapter,
  watcher: sane.Watcher,
  node: TransformNodeWrapper | SourceNodeWrapper,
  event: 'change' | 'add' | 'delete'
) {
  // @ts-ignores
  watcher.on(event, (filepath: string, root: string) => {
    logger.debug(event, root + '/' + filepath);
    logger.debug(`revise called on node [${node.id}]`);
    node.revise();
    adapter.emit('change', event, filepath, root);
  });
}
