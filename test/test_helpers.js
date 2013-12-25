var fs = require('fs')
var temp = require('temp'); temp.track()
var path = require('path')
var mkdirp = require('mkdirp')

module.exports.makeTree = makeTree
function makeTree (tree) {
  var dir = temp.mkdirSync({ prefix: 'tree-', suffix: '.tmp', dir: '.' })
  Object.keys(tree).forEach(function (relativePath) {
    var content = tree[relativePath]
    mkdirp.sync(path.join(dir, path.dirname(relativePath)))
    fs.writeFileSync(path.join(dir, relativePath), content)
  })
  return dir
}

var cacheDir
var tmpDir
module.exports.setupComponent = setupComponent
function setupComponent (component) {
  cacheDir = cacheDir || temp.mkdirSync({ prefix: 'component-cache-dir-', suffix: '.tmp', dir: '.' })
  tmpDir = tmpDir || temp.mkdirSync({ prefix: 'component-tmp-dir-', suffix: '.tmp', dir: '.' })
  component.setup({
    cacheDir: cacheDir,
    tmpDir: tmpDir
  })
  return component
}
