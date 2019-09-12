// Base class for builder errors
export default class Cancelation extends Error {
  isCancelation: boolean;
  isSilent: boolean;

  static isCancelationError(e: any): boolean {
    return typeof e === 'object' && e !== null && e.isCancelation === true;
  }

  constructor(message = '') {
    super(message);
    
    this.isCancelation = true;
    this.isSilent = true;
  }
};
