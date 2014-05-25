module.exports.printSlowTrees = printSlowTrees

function printSlowTrees(graph, nodes, factor) {

  var sortedTrees = sortNodes(nodes)
  var minimumTime = graph.totalTime * (factor || 0.05)
  var logLines = []

  for (var i = 0; i < sortedTrees.length; i++) {
    var node = sortedTrees[i]
    var name = node.tree.description || node.tree.constructor.name

    if (node.selfTime > minimumTime) {
      logLines.push(pad(name, 30) + ' | ' + pad(Math.floor(node.selfTime / 1e6) + 'ms', 15))
    }
  }

  if (logLines.length > 0) {
    logLines.unshift(pad('', 30, '-') + '-+-' + pad('', 15, '-'))
    logLines.unshift(pad('Slowest Trees ('+nodes.length+')', 30) + ' | ' + pad('Total', 15))
  }

  console.log('\n' + logLines.join('\n') + '\n')
}

function sortNodes(nodes) {

  return nodes.sort(function(a, b) {
    return b.selfTime - a.selfTime
  })

}

function pad(str, len, char, dir) {
  if (!char) { char = ' '}

  if (len + 1 >= str.length)
    switch (dir){
      case 'left':
        str = Array(len + 1 - str.length).join(char) + str
        break

      case 'both':
        var padlen = len - str.length
        var right = Math.ceil(padlen / 2)
        var left = padlen - right
        str = Array(left + 1).join(char) + str + Array(right + 1).join(char)
        break

      default:
        str = str + Array(len + 1 - str.length).join(char)
    }

  return str
}
