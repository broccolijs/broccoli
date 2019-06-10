'use strict';

const printSlowNodes = require('./utils/slow-trees');

module.exports = {
  onBuildSuccess(builder, ui) {
    printSlowNodes(builder.outputNodeWrapper.__heimdall__, 0.05, ui);
    ui.writeLine(
      'Built - ' +
        Math.round(builder.outputNodeWrapper.buildState.totalTime) +
        ' ms @ ' +
        new Date().toString()
    );
  },
};
