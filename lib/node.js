var nodeId = 0

module.exports = Node

function Node(tree) {
  this.id = nodeId++
  this.subtrees = []
  this.selfTime = 0
  this.totalTime = 0
  this.tree = tree
  this.parents = []
}

Node.prototype.addChild = function Node$addChild(child) {
  this.subtrees.push(child)
}

Node.prototype.inspect = function() {
  return 'Node:' + this.id +
    ' subtrees: ' + this.subtrees.length +
    ' selfTime: ' + this.selfTime +
    ' totalTime: ' + this.totalTime
}

function findDescription(tree) {
  var description

  if (typeof tree === 'string') {
    return tree
  } else if (tree.description) {
    description = tree.description
  }

  return description
}

Node.prototype.toJSON = function() {
  var description = findDescription(this.tree)
  var subtrees = this.subtrees.map(function(node) {
    return node.id
  })

  return {
    id: this.id,
    description: description,
    subtrees: subtrees,
    selfTime: this.selfTime,
    totalTime: this.totalTime
  }
}

