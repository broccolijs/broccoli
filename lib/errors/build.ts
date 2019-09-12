import BuilderError from './builder';
import NodeWrapper from '../wrappers/node';
import wrapPrimitiveErrors from '../utils/wrap-primitive-errors';

interface BroccoliPayloadError {
  originalError: Error;
  originalMessage: string,
  nodeId: number;
  nodeLabel: string;
  nodeName: string;
  nodeAnnotation: string | undefined | null;
  instantiationStack: string;
  // error location (if any)
  location: {
    file: string;
    treeDir: string;
    line: number;
    column: number;
  },
}

export default class BuildError extends BuilderError {
  isSilent!: boolean;
  isCancellation!: boolean;
  broccoliPayload!: BroccoliPayloadError;

  constructor(originalError: any, nodeWrapper?: NodeWrapper) {
    if (nodeWrapper == null) {
      // for Chai
      super();
      return;
    }

    originalError = wrapPrimitiveErrors(originalError);

    // Create heavily augmented message for easy printing to the terminal. Web
    // interfaces should refer to broccoliPayload.originalError.message instead.
    let filePart = '';
    if (originalError.file != null) {
      filePart = originalError.file;
      if (originalError.line != null) {
        filePart += ':' + originalError.line;
        if (originalError.column != null) {
          // .column is zero-indexed
          filePart += ':' + (originalError.column + 1);
        }
      }
      filePart += ': ';
    }
    let instantiationStack = '';
    if (originalError.file == null) {
      // We want to report the instantiation stack only for "unexpected" errors
      // (bugs, internal errors), but not for compiler errors and such. For now,
      // the presence of `.file` serves as a heuristic to distinguish between
      // those cases.
      instantiationStack = nodeWrapper.formatInstantiationStackForTerminal();
    }
    const message =
      filePart +
      originalError.message +
      (originalError.treeDir ? '\n        in ' + originalError.treeDir : '') +
      '\n        at ' +
      nodeWrapper.label +
      instantiationStack;

    super(message);
    // consider for x in y
    this.stack = originalError.stack;
    this.isSilent = originalError.isSilent;
    this.isCancellation = originalError.isCancellation;

    // This error API can change between minor Broccoli version bumps
    this.broccoliPayload = {
      originalError, // guaranteed to be error object, not primitive
      originalMessage: originalError.message,
      // node info
      nodeId: nodeWrapper.id,
      nodeLabel: nodeWrapper.label,
      nodeName: nodeWrapper.nodeInfo.name,
      nodeAnnotation: nodeWrapper.nodeInfo.annotation,
      instantiationStack: nodeWrapper.nodeInfo.instantiationStack,
      // error location (if any)
      location: {
        file: originalError.file,
        treeDir: originalError.treeDir,
        line: originalError.line,
        column: originalError.column,
      },
    };
  }
};
