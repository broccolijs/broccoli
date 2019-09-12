import printSlowNodes from './utils/slow-trees';

export default {
  onBuildSuccess(builder: any, ui: any) {
    printSlowNodes(builder.outputNodeWrapper.__heimdall__, 0.05, ui);
    ui.writeLine(
      'Built - ' +
        Math.round(builder.outputNodeWrapper.buildState.totalTime) +
        ' ms @ ' +
        new Date().toString()
    );
  },
};
