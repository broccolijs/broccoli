'use strict';

const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');

const Heimdall = require('heimdalljs/heimdall');
const calculateSummary = require('../../lib/utils/calculate-summary');

chai.use(chaiAsPromised);

function stubTime(ms) {
  process.hrtime = function() {
    return [0, ms * 1e6];
  };
}

const originalHrtime = process.hrtime;

function restoreTime() {
  process.hrtime = originalHrtime;
}

describe('calculateSummary', function() {
  afterEach(restoreTime);

  it('summarizes simple graphs', function() {
    stubTime(100);
    const heimdall = new Heimdall();

    const result = heimdall
      .node({ name: 'babel', broccoliNode: true }, () => {
        stubTime(200);
        return heimdall.node({ name: 'merge-trees', broccoliNode: true }, () => {
          stubTime(350);
        });
      })
      .then(() => {
        return heimdall.node({ name: 'merge-trees', broccoliNode: true }, () => {
          stubTime(600);
        });
      })
      .then(() => {
        return calculateSummary(heimdall);
      });

    return result.then(result => {
      expect(result).to.deep.equal({
        totalTime: 500,
        nodes: [
          {
            name: 'merge-trees',
            selfTime: 250,
          },
          {
            name: 'merge-trees',
            selfTime: 150,
          },
          {
            name: 'babel',
            selfTime: 100,
          },
        ],
        groupedNodes: [
          {
            name: 'merge-trees',
            count: 2,
            averageSelfTime: 200,
            totalSelfTime: 400,
          },
          {
            name: 'babel',
            count: 1,
            averageSelfTime: 100,
            totalSelfTime: 100,
          },
        ],
      });
    });
  });

  it("counts non-broccoli nodes' time as part of their ancestor broccoli node's time", function() {
    stubTime(100);
    const heimdall = new Heimdall();

    const result = heimdall
      .node({ name: 'merge-trees', broccoliNode: true }, () => {
        stubTime(200);
        return heimdall
          .node({ name: 'babel', broccoliNode: true }, () => {
            stubTime(300);
          })
          .then(() => {
            return heimdall.node({ name: 'fs-tree-diff' }, () => {
              return heimdall
                .node({ name: 'calculatePatch' }, () => {
                  stubTime(550);
                })
                .then(() => {
                  return heimdall.node({ name: 'sortAndExpand' }, () => {
                    stubTime(600);
                  });
                });
            });
          });
      })
      .then(() => {
        return calculateSummary(heimdall);
      });

    return result.then(result => {
      expect(result).to.deep.equal({
        totalTime: 500,
        nodes: [
          {
            name: 'merge-trees',
            selfTime: 400,
          },
          {
            name: 'babel',
            selfTime: 100,
          },
        ],
        groupedNodes: [
          {
            averageSelfTime: 400,
            count: 1,
            name: 'merge-trees',
            totalSelfTime: 400,
          },
          {
            averageSelfTime: 100,
            count: 1,
            name: 'babel',
            totalSelfTime: 100,
          },
        ],
      });
    });
  });
});
