import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import CancelationRequest from '../lib/cancelation-request';
import CancelationError from '../lib/errors/cancelation';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('cancelation-request', function() {
  it('.isCancelled / .cancel', async function() {
    let request = new CancelationRequest(Promise.resolve());

    expect(request.isCanceled).to.eql(false);
    let wait = request.cancel();
    expect(request.isCanceled).to.eql(true);

    return wait.then(() => {
      expect(request.isCanceled).to.eql(true);
    });
  });

  it('.throwIfRequested (requested)', async function() {
    let request = new CancelationRequest(Promise.resolve());

    request.throwIfRequested();

    await request.cancel();

    expect(() => {
      request.throwIfRequested();
    }).to.throw('Build Canceled');

    expect(() => {
      request.throwIfRequested();
    }).to.throw('Build Canceled');
  });

  it('.cancel (with CancelationError rejection)', function() {
    let request = new CancelationRequest(Promise.reject(new CancelationError()));

    return request.cancel();
  });

  it('.cancel (with non-builder rejection)', function() {
    let request = new CancelationRequest(Promise.reject(new Error('OOPS')));

    return expect(request.cancel()).to.eventually.be.rejectedWith('OOPS');
  });
});
