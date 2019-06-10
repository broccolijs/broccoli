'use strict';

const printSlowNodes = require('broccoli-slow-trees');

module.exports = {
  onBuildSuccess(builder, ui) {
    printSlowNodes(builder.outputNodeWrapper.__heimdall__);
    ui.writeLine(
      'Built - ' +
        Math.round(builder.outputNodeWrapper.buildState.totalTime) +
        ' ms @ ' +
        new Date().toString()
    );
  },
};
