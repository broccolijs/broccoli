import BuilderError from './builder';
import NodeWrapper from '../wrappers/node';
import wrapPrimitiveErrors from '../utils/wrap-primitive-errors';

export default class NodeSetupError extends BuilderError {
  constructor(originalError: Error, nodeWrapper?: NodeWrapper) {
    if (nodeWrapper == null) {
      // Chai calls new NodeSetupError() :(
      super();
      return;
    }
    originalError = wrapPrimitiveErrors(originalError);
    const message =
      originalError.message +
      '\nat ' +
      nodeWrapper.label +
      nodeWrapper.formatInstantiationStackForTerminal();
    super(message);
    // The stack will have the original exception name, but that's OK
    this.stack = originalError.stack;
  }
};
