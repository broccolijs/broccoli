import fs from 'fs';
import TransformNodeWrapper from './transform-node';
import { isAbsolute, resolve } from 'path';

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


function handleFs(target: any, propertyName: string, node: TransformNodeWrapper, relativePath: string, ...fsArguments: Array<string>) {
  if (isAbsolute(relativePath)) {
    throw new Error(`Relative path is expected, path ${relativePath} is an absolute path.`);
  }
  let outputPath = resolve(node.outputPath + '/' + relativePath);
  if (!outputPath.includes(node.outputPath)) {
    throw new Error(`Traversing above the outputPath is not allowed. Relative path ${relativePath} traverses beyond ${node.outputPath}`);
  }
  if(WHITELISTEDOPERATION.has(propertyName)) {
    logger.debug(`[operation:${propertyName}] at ${outputPath}`);
    return target[propertyName](outputPath, ...fsArguments);
  } else {
    throw new Error(`Operation ${propertyName} is not allowed to use. Allowed operations are ${Array.from(WHITELISTEDOPERATION).toString()}`);
  }
}

export default function outputWrapper (node: TransformNodeWrapper) {
  return new Proxy(fs, {
    get(target: any, propertyName: string): any {
      return handleFs.bind(this, target, propertyName, node);
    }
  });
}
