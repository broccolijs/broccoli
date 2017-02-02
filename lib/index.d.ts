import * as rsvp from "rsvp";
import * as http from "http";

export const Builder: BuilderConstructor;
export function loadBrocfile(): any;
export const server: {
  serve: (watcher: Watcher, host: string, port: number) => Server;
};
export function getMiddleware(watcher: Watcher, options?: MiddlewareOptions): (request: http.IncomingMessage, response: http.ServerResponse, next: () => void) => void;
export const Watcher: WatcherConstructor;
export const WatcherAdapter: WatcherAdapterConstructor;
export function cli(): void;

export interface Builder {
  outputNode: any;
  tmpdir: string | null | undefined;
  unwatchedPaths: string[];
  watchedPaths: string[];
  nodeWrappers: NodeWrapper[];
  outputNodeWrapper: NodeWrapper;
  outputPath: string;
  buildId: number;
  builderTmpDir: string;

  build(): rsvp.Promise<void>;
  cleanup(): rsvp.Promise<void> | void;
}

export type BuilderOptions = {
  tmpdir?: string | null;
};

export interface BuilderConstructor {
  prototype: Builder;
  new(outputNode: any, options?: BuilderOptions): Builder;
}

export type NodeInfo = SourceNodeInfo | TransformNodeInfo;

export interface NodeInfoBase {
  nodeType: "source" | "transform";
  name: string;
  annotation?: string | null;
}

export interface SourceNodeInfo extends NodeInfoBase {
  nodeType: 'source';
  sourceDirectory: string;
  watched: boolean;
}

export interface TransformNodeInfo extends NodeInfoBase {
  nodeType: "transform";
  persistentOutput: boolean;
  needsCache: boolean;
}

export type BuildState = {
  selfTime?: number;
  totalTime?: number;
};

export type NodeJSON = TransformNodeJSON | SourceNodeJSON;

export interface NodeJSONBase {
  id: number;
  label: string;
  nodeInfo: NodeInfo,
  buildState: BuildState;
  inputNodeWrappers: number[];
  cachePath?: string | null;
  outputPath: string;
}

export interface TransformNodeJSON extends NodeJSONBase {
  nodeInfo: TransformNodeInfo;
}

export interface SourceNodeJSON extends NodeJSONBase {
  nodeInfo: TransformNodeInfo;
}

export type NodeWrapper = SourceNodeWrapper | TransformNodeWrapper;

export interface NodeWrapperBase {
  id: number;
  label: string;
  nodeInfo: NodeInfo;
  buildState: BuildState;
  inputNodeWrappers: NodeWrapper[];
  node: any;
  originalNode: any;
  outputPath: string;

  toJSON(): NodeJSON;
}

export interface SourceNodeWrapper extends NodeWrapperBase {
  nodeInfo: SourceNodeInfo;

  toJSON(): SourceNodeJSON;
}

export interface TransformNodeWrapper extends NodeWrapperBase {
  nodeInfo: TransformNodeInfo;
  inputPaths: string[];
  cachePath?: string;

  toJSON(): TransformNodeJSON;
}

export interface Server {
  watcher: Watcher;
  builder: Builder;
  app: (request: http.IncomingMessage, response: http.ServerResponse) => void;
  http: http.Server;
}

export type MiddlewareOptions = {
  autoIndex?: boolean;
  liveReloadPath?: string;
};

export interface Watcher {
  options: WatcherOptions;
  builder: Builder;
  watcherAdapter: WatcherAdapter;
  currentBuild: rsvp.Promise<void> | null;
  start(): rsvp.Promise<void>;
  quit(): void;
}

export type WatcherOptions = {
  debounce?: number;
  saneOptions?: any;
};

export interface WatcherConstructor {
  new (builder: Builder, options?: WatcherOptions): Watcher;
}

export interface WatcherAdapter {
  options: any;
  watch(watchedPaths: string[]): rsvp.Promise<void>;
  quit(): void;
}

export interface WatcherAdapterConstructor {
  new (options?: any): WatcherAdapter;
}
