// Base class for builder errors
export default class BuilderError extends Error {
  isBuilderError: boolean;

  static isBuilderError(error: any): boolean {
    return error !== null && typeof error === 'object' && error.isBuilderError;
  }

  constructor(message = '') {
    super(message);

    this.isBuilderError = true;
  }
};
