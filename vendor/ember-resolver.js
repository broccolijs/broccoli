// ==========================================================================
// Project:   Ember - JavaScript Application Framework
// Copyright: Copyright 2013 Stefan Penner and Ember App Kit Contributors
// License:   Licensed under MIT license
//            See https://raw.github.com/stefanpenner/ember-jj-abrams-resolver/master/LICENSE
// ==========================================================================


 // Version: 0.0.1

(function() {
/*globals define registry requirejs */

define("resolver",
  ["exports"],
  function() {
    "use strict";
  /*
   * This module defines a subclass of Ember.DefaultResolver that adds two
   * important features:
   *
   *  1) The resolver makes the container aware of es6 modules via the AMD
   *     output. The loader's _seen is consulted so that classes can be
   *     resolved directly via the module loader, without needing a manual
   *     `import`.
   *  2) is able provide injections to classes that implement `extend`
   *     (as is typical with Ember).
   */

  // Return module or null
  function tryRequire(deps) {
    try {
      return require(deps, null, null, true /* force sync */);
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND')
        return null;
      throw err;
    }
  }

  function classFactory(klass) {
    return {
      create: function (injections) {
        if (typeof klass.extend === 'function') {
          return klass.extend(injections);
        } else {
          return klass;
        }
      }
    };
  }

  var underscore = Ember.String.underscore;
  var classify = Ember.String.classify;
  var get = Ember.get;

  function parseName(fullName) {
    /*jshint validthis:true */

    var nameParts = fullName.split(":"),
        type = nameParts[0], fullNameWithoutType = nameParts[1],
        name = fullNameWithoutType,
        namespace = get(this, 'namespace'),
        root = namespace;

    return {
      fullName: fullName,
      type: type,
      fullNameWithoutType: fullNameWithoutType,
      name: name,
      root: root,
      resolveMethodName: "resolve" + classify(type)
    };
  }

  function chooseModuleName(moduleName) {
    var underscoredModuleName = Ember.String.underscore(moduleName);

    if (moduleName !== underscoredModuleName && tryRequire(moduleName) && tryRequire(underscoredModuleName)) {
      throw new TypeError("Ambigous module names: `" + moduleName + "` and `" + underscoredModuleName + "`");
    }

    if (tryRequire(moduleName)) {
      return moduleName;
    } else if (tryRequire(moduleName)) {
      return underscoredModuleName;
    } else {
      return moduleName;
    }
  }

  function resolveRouter(parsedName) {
    /*jshint validthis:true */

    var prefix = this.namespace.modulePrefix,
        routerModule;

    if (parsedName.fullName === 'router:main') {
      // for now, lets keep the router at app/router.js
      routerModule = tryRequire(prefix + '/router');
      if (routerModule) {
        if (routerModule.default) { routerModule = routerModule.default; }

        return routerModule;
      }
    }
  }

  function resolveOther(parsedName) {
    /*jshint validthis:true */

    var prefix = this.namespace.modulePrefix;
    Ember.assert('module prefix must be defined', prefix);

    var pluralizedType = parsedName.type + 's';
    var name = parsedName.fullNameWithoutType;

    var moduleName = prefix + '/' +  pluralizedType + '/' + name;

    // allow treat all dashed and all underscored as the same thing
    // supports components with dashes and other stuff with underscores.
    var normalizedModuleName = chooseModuleName(moduleName);

    var module = tryRequire(normalizedModuleName)
    if (module) {
      if (module.default) { module = module.default; }

      if (module === undefined) {
        throw new Error(" Expected to find: '" + parsedName.fullName + "' within '" + normalizedModuleName + "' but got 'undefined'. Did you forget to `export default` within '" + normalizedModuleName + "'?");
      }

      if (this.shouldWrapInClassFactory(module, parsedName)) {
        module = classFactory(module);
      }

      if (Ember.ENV.LOG_MODULE_RESOLVER) {
        Ember.Logger.info('hit', moduleName);
      }

      return module;
    } else {
      if (Ember.ENV.LOG_MODULE_RESOLVER) {
        Ember.Logger.info('miss', moduleName);
      }
      return this._super(parsedName);
    }
  }
  // Ember.DefaultResolver docs:
  //   https://github.com/emberjs/ember.js/blob/master/packages/ember-application/lib/system/resolver.js
  var Resolver = Ember.DefaultResolver.extend({
    resolveTemplate: resolveOther,
    resolveOther: resolveOther,
    resolveRouter: resolveRouter,
    parseName: parseName,
    shouldWrapInClassFactory: function(module, parsedName){
      return false;
    },
    normalize: function(fullName) {
      // replace `.` with `/` in order to make nested controllers work in the following cases
      // 1. `needs: ['posts/post']`
      // 2. `{{render "posts/post"}}`
      // 3. `this.render('posts/post')` from Route
      return Ember.String.dasherize(fullName.replace(/\./g, '/'));
    }
  });

  Resolver.default = Resolver;
  return Resolver;
});

})();



(function() {

})();

