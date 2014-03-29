var builder = require('./builder')
exports.Builder = builder.Builder
exports.loadBrocfile = builder.loadBrocfile
var server = require('./server')
exports.server = server
var tree = require('./tree')
exports.tree = tree
exports.bowerTrees = tree.bowerTrees
exports.Tree = tree.Tree
var mergedTree = require('./merged_tree')
exports.MergedTree = mergedTree.MergedTree
var cli = require('./cli')
exports.cli = cli

exports.makeTree = function makeTree (dir) {
  throw new Error("broccoli.makeTree has been removed in favor of string literals.\nUse '" + dir + "' instead of broccoli.makeTree('" + dir + "').")
}
