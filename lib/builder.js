var path = require('path')
var findup = require('findup-sync')
var Promise = require('rsvp').Promise


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.allNodes = [] // across all builds
  this.currentNodes = [] // across current build

}

Builder.prototype.build = function (willReadStringTree) {
  var self = this

  this.currentNodes = []

  return Promise.resolve()
    .then(function () {
      return self._read(self.tree, willReadStringTree) // call self.tree.read()
    })
    .then(function (node) {
      return { directory: node.directory, graph: node, totalTime: node.totalTime }
    })
    .finally(function () {
      for (var i = 0; i < self.currentNodes.length; i++) {
        // TODO: be optimized saving allNodes on `_read`
        var node = self.currentNodes[i];
        var storedNode = getNodeByTree(self.allNodes, node.tree);
        if (!storedNode) {
          self.allNodes.push(node)
        }
      }
    })
    .catch(function (err) {
      if (typeof err === 'string') {
        err = new Error(err + ' [string exception]')
      }
      throw err
    })

}

// Read the `tree` and return its node, which in particular contains the
// tree's output directory (node.directory)
Builder.prototype._read = function (tree, willReadStringTree) {

    var node,
        treeDirPromise;

    // To do: Complain about parallel execution
    // To do: Timing
    node = getNodeByTree(this.currentNodes, tree);
    if (node) {
      // Return node from cache to deduplicate `.read`
      if (node.directory == null) {
        // node.directory gets set at the very end, so we have found an as-yet
        // incomplete node. This can happen if there is a cycle.
        throw new Error('Tree cycle detected')
      }
      return Promise.resolve(node)
    }
    node = {
      tree: tree,
      subtrees: [],
      deps: [],
      selfTime: 0,
      totalTime: 0
    }
    this.currentNodes.push(node)
    treeDirPromise = getTreePromise(this, node, willReadStringTree)

    return treeDirPromise
      .then(function (treeDir) {
        if (treeDir == null) throw new Error(tree + ': .read must return a directory')
        node.directory = treeDir
        return node
      })

}


Builder.prototype.cleanup = function () {

  //Check: is ES5 totally supported
  
  this.allNodes.map(function(item) {
    return item.tree;
  }).forEach(function(tree) {
    if (typeof tree !== 'string') {
      tree.cleanup()
    }
  });
}


exports.loadBrocfile = loadBrocfile
function loadBrocfile () {
  var brocfile = findup('Brocfile.js', {nocase: true})
  if (brocfile == null) {
    throw new Error('Brocfile.js not found (note: was previously Broccolifile.js)')
  }

  var baseDir = path.dirname(brocfile)

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir)

  var tree = require(brocfile)

  if (typeof tree === 'function') {
    throw new Error('Exporting a function in Brocfile.js is no longer supported. ' +
      'Export a tree instead. To update, turn this\n' +
      '\n' +
      '    module.exports = function (broccoli) {\n' +
      '      ...\n' +
      '      return someTree;\n' +
      '    };\n' +
      '\n' +
      'into this\n' +
      '\n' +
      '    ...\n' +
      '    module.exports = someTree;\n')
  }
  if (Array.isArray(tree)) {
    throw new Error('Returning an array from Brocfile.js is no longer supported\n' +
      'Run "npm install --save-dev broccoli-merge-trees" and use it like so in Brocfile.js:\n' +
      'var mergeTrees = require(\'broccoli-merge-trees\');\n' +
      'return mergeTrees([tree1, tree2, tree3], { overwrite: true });')
  }

  return tree
}


function getNodeByTree (nodes, tree) {

  var length = nodes.length;
  for (var i = 0; i < length; i++) {
    if ( tree === nodes[i].tree ) {
      return nodes[i];
    }
  }

}

function getTreePromise(builder, node, willReadStringTree) {
    
  var tree = node.tree; 

  if (typeof tree === 'string') {
    return Promise.resolve()
      .then(function () {
        if (willReadStringTree) willReadStringTree(tree)
        return tree
      })
  } else if (!tree || typeof tree.read !== 'function') {
    throw new Error('Invalid tree found. You must supply a path or an object with a `read` function.');
  }

  var now = process.hrtime()
  var totalStartTime = now
  var selfStartTime = now

  builder.readTreeRunning = false
  return Promise.resolve()
    .then(function () {
      return tree.read(function readTree (subtree) {
        if (builder.readTreeRunning) {
          throw new Error('Parallel readTree call detected; read trees in sequence, e.g. using https://github.com/joliss/promise-map-series')
        }
        builder.readTreeRunning = true

        // Pause self timer
        var now = process.hrtime()
        node.selfTime += (now[0] - selfStartTime[0]) * 1e9 + (now[1] - selfStartTime[1])
        selfStartTime = null

        return Promise.resolve()
          .then(function () {
            return builder._read(subtree, willReadStringTree) // recurse
          })
          .then(function (childNode) {
            node.subtrees.push(childNode)
            if (typeof childNode.tree !== 'string') {

              // String trees are not deps because the filter must be able to define `isUnchanged` function
              node.deps.push(childNode)
            }
            return childNode.directory
          })
          .finally(function () {
            builder.readTreeRunning = false
            // Resume self timer
            selfStartTime = process.hrtime()
          })
      })
    })
    .then(function (dir) {
      if (builder.readTreeRunning) {
        throw new Error('.read returned before readTree finished')
      }

      var now = process.hrtime()
      node.selfTime += (now[0] - selfStartTime[0]) * 1e9 + (now[1] - selfStartTime[1])
      node.totalTime += (now[0] - totalStartTime[0]) * 1e9 + (now[1] - totalStartTime[1])
      return dir
    })

}
