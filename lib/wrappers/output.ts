import { PathLike } from "fs";

const fsExtra = require('fs-extra');
const fs = require('fs');
const logger = require('heimdalljs-logger')('broccoli:outputWrapper');
const path = require('path');

export default class OutputWrapper {
  _root: PathLike
  fs: Object
  constructor(root: PathLike) {
    this._root = root;
    let self = this;
    this.fs = new Proxy(fs, {
      get(target: any, propertyName: string): any {
        return function() {
          let [outputPath] = arguments;
          if (!path.isAbsolute(outputPath)) {
            outputPath = self._root + '/' + outputPath;
          }
          fsExtra.ensureDirSync(path.dirname(outputPath));
          arguments[0] = outputPath;
          logger.debug(`[operation:${propertyName}] at ${outputPath}`);
          return target[propertyName](...arguments);
        }
      }
    });
  }
};
