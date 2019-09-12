const chai = require('chai');
const expect = chai.expect;
import filterMap from '../../lib/utils/filter-map';

describe('filterMap', function() {
  it('works', function() {
    expect(filterMap([], () => true)).to.eql([]);
    expect(filterMap([1, false, 2], () => true)).to.eql([1, false, 2]);
    expect(filterMap([1, true, 2], () => false)).to.eql([]);
    expect(filterMap([1, true, 2], x => x === 1)).to.eql([1]);
    expect(filterMap([1, true, 2], x => typeof x === 'number')).to.eql([1, 2]);
  });
});
