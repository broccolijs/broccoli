'use strict';

const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
const CancelationRequest = require('../lib/cancellation-request');
const RSVP = require('rsvp');
const BuilderError = require('../lib/errors/builder');

chai.use(chaiAsPromised);

describe('cancellation-request', function() {
  it('.isCancelled / .cancel', function() {
    let request = new CancelationRequest(RSVP.Promise.resolve());

    expect(request.isCancelled).to.eql(false);
    let wait = request.cancel();
    expect(request.isCancelled).to.eql(true);

    return wait.then(() => {
      expect(request.isCancelled).to.eql(true);
    });
  });

  it('.throwIfRequested (requested)', function() {
    let request = new CancelationRequest(RSVP.Promise.resolve());

    request.throwIfRequested();

    return request.cancel().then(() => {
      expect(() => {
        request.throwIfRequested();
      }).to.throw('BUILD CANCELLED');

      expect(() => {
        request.throwIfRequested();
      }).to.throw('BUILD CANCELLED');
    });
  });

  it('.cancel (with builder rejection)', function() {
    let request = new CancelationRequest(RSVP.Promise.reject(new BuilderError()));

    return request.cancel();
  });

  it('.cancel (with non-builder rejection)', function() {
    let request = new CancelationRequest(RSVP.Promise.reject(new Error('OOPS')));

    return expect(request.cancel()).to.eventually.be.rejectedWith('OOPS');
  });
});
