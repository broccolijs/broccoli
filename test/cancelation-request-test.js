import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import CancelationRequest from '../lib/cancelation-request';
import CancelationError from '../lib/errors/cancelation';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('cancelation-request', function () {
  it('.isCancelled / .cancel', async function () {
    const request = new CancelationRequest(Promise.resolve());

    expect(request.isCanceled).to.eql(false);
    const wait = request.cancel();
    expect(request.isCanceled).to.eql(true);

    return wait.then(() => {
      expect(request.isCanceled).to.eql(true);
    });
  });

  it('.throwIfRequested (requested)', async function () {
    const request = new CancelationRequest(Promise.resolve());

    request.throwIfRequested();

    await request.cancel();

    expect(() => {
      request.throwIfRequested();
    }).to.throw('Build Canceled');

    expect(() => {
      request.throwIfRequested();
    }).to.throw('Build Canceled');
  });

  it('.cancel (with CancelationError rejection)', function () {
    const request = new CancelationRequest(Promise.reject(new CancelationError()));

    return request.cancel();
  });

  it('.cancel (with non-builder rejection)', function () {
    const request = new CancelationRequest(Promise.reject(new Error('OOPS')));

    return expect(request.cancel()).to.eventually.be.rejectedWith('OOPS');
  });
});
