import Cancelation from './cancelation';
export default class Retry extends Cancelation {
  isRetry: boolean = true;
  retryIn: Number;

  static isRetry(e: any): boolean {
    return typeof e === 'object' && e !== null && e.isRetry === true;
  }

  constructor(message = 'Retry', retryIn: number) {
    super(message);
    this.retryIn = retryIn;
  }
}
