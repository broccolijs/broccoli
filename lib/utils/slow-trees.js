'use strict';

const calculateSummary = require('./calculate-summary');

function ellipsize(string, desiredLength) {
  if (string.length > desiredLength) {
    return string.slice(0, desiredLength - 3) + '...';
  } else {
    return string;
  }
}

module.exports = function printSlowNodes(tree, factor, ui) {
  try {
    const summary = calculateSummary(tree);
    const pcThreshold = factor || 0.05;
    const msThreshold = pcThreshold * summary.totalTime;
    const cumulativeLogLines = [];

    const MAX_NAME_CELL_LENGTH = 45;
    const MAX_VALUE_CELL_LENGTH = 20;

    for (let i = 0; i < summary.groupedNodes.length; i++) {
      const group = summary.groupedNodes[i];
      let averageStr;

      if (group.totalSelfTime > msThreshold) {
        if (group.count > 1) {
          averageStr = ' (' + Math.floor(group.averageSelfTime) + ' ms)';
        } else {
          averageStr = '';
        }

        const countStr = ` (${group.count}) `;
        const nameStr = ellipsize(group.name, MAX_NAME_CELL_LENGTH - countStr.length);

        const timeColumn = pad(
          Math.floor(group.totalSelfTime) + 'ms' + averageStr,
          MAX_VALUE_CELL_LENGTH
        );

        const nameColumn = pad(nameStr + countStr, MAX_NAME_CELL_LENGTH);

        cumulativeLogLines.push(`${nameColumn} | ${timeColumn}`);
      }
    }

    cumulativeLogLines.unshift(
      pad('', MAX_NAME_CELL_LENGTH, '-') + '-+-' + pad('', MAX_VALUE_CELL_LENGTH, '-')
    );

    cumulativeLogLines.unshift(
      pad('Slowest Nodes (totalTime >= ' + pcThreshold * 100 + '%)', MAX_NAME_CELL_LENGTH) +
        ' | ' +
        pad('Total (avg)', MAX_VALUE_CELL_LENGTH)
    );

    ui.writeLine('\n' + cumulativeLogLines.join('\n') + '\n');
  } catch (e) {
    ui.writeLine('Error when printing slow nodes', 'ERROR');
    ui.writeError(e);
  }
};

function pad(str, len, char, dir) {
  if (!char) {
    char = ' ';
  }

  if (len + 1 >= str.length)
    switch (dir) {
      case 'left': {
        str = Array(len + 1 - str.length).join(char) + str;
        break;
      }

      case 'both': {
        const padlen = len - str.length;
        const right = Math.ceil(padlen / 2);
        const left = padlen - right;
        str = Array(left + 1).join(char) + str + Array(right + 1).join(char);
        break;
      }

      default: {
        str = str + Array(len + 1 - str.length).join(char);
      }
    }

  return str;
}
