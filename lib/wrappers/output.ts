import fs, { PathLike } from "fs";
import TransformNodeWrapper from "./transform-node";
import { isAbsolute } from 'path';

const logger = require('heimdalljs-logger')('broccoli:outputWrapper');

const WHITELISTEDOPERATION = new Set([
  'readFileSync',
'existsSync',
'lstatSync',
'readdirSync',
'statSync',
'writeFileSync',
'appendFileSync',
'rmdirSync',
'mkdirSync'
]);

export default function OutputWrapper (node: TransformNodeWrapper) {
  return new Proxy(fs, {
    get(target: any, propertyName: string): any {
      return function() {
        let [relativePath] = arguments;
        if (isAbsolute(relativePath)) {
          throw new Error(`Relative path is expected, path ${relativePath} is an absolute path. outputPath gets prefixed to the reltivePath provided.`);
        }
        let outputPath = node.outputPath + '/' + relativePath;
        if(WHITELISTEDOPERATION.has(propertyName)) {
          arguments[0] = outputPath;
          logger.debug(`[operation:${propertyName}] at ${outputPath}`);
          return target[propertyName](...arguments);
        } else {
          throw new Error(`Operation ${propertyName} is not whitelisted to use. Whietlisted operations are ${Array.from(WHITELISTEDOPERATION).toString()}`);
        }
      }
    }
  });
}
