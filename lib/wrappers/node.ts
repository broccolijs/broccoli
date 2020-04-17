import undefinedToNull from '../utils/undefined-to-null';
import { NodeInfo } from 'broccoli-node-api';

export default class NodeWrapper {
  _revision: number;
  buildState: {
    selfTime?: number;
    totalTime?: number;
    built?: boolean;
  };

  id!: number;
  label!: string;
  cachePath!: string;
  outputPath!: string;
  nodeInfo!: NodeInfo;
  inputNodeWrappers!: NodeWrapper[];

  constructor() {
    this.buildState = {};
    this._revision = 0;
  }

  revise() {
    this._revision++;
  }

  get revision() {
    return this._revision;
  }

  toJSON() {
    return undefinedToNull({
      id: this.id,
      nodeInfo: this.nodeInfoToJSON(),
      buildState: this.buildState,
      label: this.label,
      inputNodeWrappers: this.inputNodeWrappers.map(nw => nw.id),
      cachePath: this.cachePath,
      outputPath: this.outputPath,
      // leave out node, originalNode, inputPaths (redundant), build
    });
  }

  formatInstantiationStackForTerminal() {
    return '\n-~- created here: -~-\n' + this.nodeInfo.instantiationStack + '\n-~- (end) -~-';
  }

  nodeInfoToJSON() {
    return {};
  }
}
