import { PathLike } from "fs";
import TransformNodeWrapper from "./transform-node";

const fsExtra = require('fs-extra');
const fs = require('fs');
const logger = require('heimdalljs-logger')('broccoli:outputWrapper');
const path = require('path');

const WRITEOPERATION = new Set([
  'write',
  'writeSync',
  'writeFile',
  'writeFileSync',
  'writev',
  'writevSync',
  'appendFileSync',
  'appendFile',
  'rmdir',
  'rmdirSync',
  'mkdir',
  'mkdirSync',
  'createWriteStream',
  'copyFile',
  'copyFileSync'
]);

export default class OutputWrapper {
  _root: PathLike
  fs: Object
  constructor(node: TransformNodeWrapper) {
    this._root = node.outputPath;
    let self: OutputWrapper = this;
    this.fs = new Proxy(fs, {
      get(target: any, propertyName: string): any {
        if (self[propertyName as keyof OutputWrapper]) {
          if (typeof self[propertyName as keyof OutputWrapper] === 'function') {
            return function() {
              // @ts-ignore: no-implict-any
              return self[propertyName as keyof OutputWrapper](...arguments);
            }
          }
          return self[propertyName as keyof OutputWrapper];
        } else if (typeof target[propertyName] !== 'function') {
          return target[propertyName];
        }
        return function() {
          let [outputPath] = arguments;
          if (!path.isAbsolute(outputPath)) {
            outputPath = self._root + '/' + outputPath;
          }
          if(WRITEOPERATION.has(propertyName)) {
            fsExtra.ensureDirSync(path.dirname(outputPath));
          }
          arguments[0] = outputPath;
          logger.debug(`[operation:${propertyName}] at ${outputPath}`);
          return target[propertyName](...arguments);
        }
      }
    });
  }
};
