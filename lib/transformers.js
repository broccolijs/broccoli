var broccoli = require('./index')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.Transformer = Transformer
__extends(Transformer, broccoli.Component)
function Transformer () {}


var preprocessors = require('./transformers/preprocessors')
exports.preprocessors = preprocessors
var compilers = require('./transformers/compilers')
exports.compilers = compilers
