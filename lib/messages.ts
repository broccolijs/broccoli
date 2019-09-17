import printSlowNodes from './utils/slow-trees';
import UI from '../types/console-ui';

export default {
  onBuildSuccess(builder: any, ui: UI) {
    printSlowNodes(builder.outputNodeWrapper.__heimdall__, 0.05, ui);
    ui.writeLine(
      'Built - ' +
        Math.round(builder.outputNodeWrapper.buildState.totalTime) +
        ' ms @ ' +
        new Date().toString()
    );
  },
};
