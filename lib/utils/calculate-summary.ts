import HeimdallNode from '../../types/heimdalljs';

interface BaseNode {
  name: string;
  selfTime: number;
}

interface GroupedNode {
  name: string;
  count: number;
  averageSelfTime: number;
  totalSelfTime: number;
}

function byTotalSelfTime(a: GroupedNode, b: GroupedNode) {
  return b.totalSelfTime - a.totalSelfTime;
}

function bySelfTime(a: BaseNode, b: BaseNode) {
  return b.selfTime - a.selfTime;
}

function normalizeSelfTime(n: BaseNode) {
  n.selfTime = n.selfTime / 1e6;
}

function normalizeTimes(n: GroupedNode) {
  n.averageSelfTime = n.averageSelfTime / 1e6;
  n.totalSelfTime = n.totalSelfTime / 1e6;
}

export default function calculateSummary(tree: HeimdallNode) {
  let totalTime = 0;
  let nodes: BaseNode[] = [];
  let groupedNodes: GroupedNode[] = [];
  const nodesGroupedByName: { [key: string]: GroupedNode } = {};

  // calculate times
  tree.visitPostOrder(node => {
    let nonbroccoliChildrenTime = 0;
    node.forEachChild(childNode => {
      // subsume non-broccoli nodes as their ancestor broccoli nodes'
      // broccoliSelfTime
      if (!childNode.id.broccoliNode) {
        nonbroccoliChildrenTime += childNode._slowTrees.broccoliSelfTime;
      }
    });

    const time = nonbroccoliChildrenTime + node.stats.time.self;

    node._slowTrees = { broccoliSelfTime: time };
    totalTime += node.stats.time.self;

    if (node.id.broccoliNode) {
      nodes.push({
        name: node.id.name,
        selfTime: time,
      });

      if (!nodesGroupedByName[node.id.name]) {
        nodesGroupedByName[node.id.name] = {
          name: node.id.name,
          count: 0,
          averageSelfTime: 0,
          totalSelfTime: 0,
        };
        groupedNodes.push(nodesGroupedByName[node.id.name]);
      }

      const group = nodesGroupedByName[node.id.name];
      group.count++;
      group.totalSelfTime += time;
      group.averageSelfTime = group.totalSelfTime / group.count;
    }
  });

  // sort nodes
  nodes = nodes.sort(bySelfTime);

  groupedNodes = groupedNodes.sort(byTotalSelfTime);
  nodes.forEach(normalizeSelfTime);
  groupedNodes.forEach(normalizeTimes);

  // normalize times (nanosec to ms)
  totalTime = totalTime / 1e6;

  return {
    totalTime,
    nodes,
    groupedNodes,
  };
}
