var request   = require('supertest');
var chai      = require('chai');
var expect    = chai.expect;
var fs        = require('fs');
var path      = require('path');
var tmp       = require('tmp');
var broccoli  = require('..');


var tmpdir, tmpRemoveCallback, defaultOptions;

describe('Options Customization', function() {
  
  beforeEach(function() {
    var tmpObj = tmp.dirSync({ prefix: 'broccoli_static_options_test-', unsafeCleanup: true });
    tmpdir = tmpObj.name;
    tmpRemoveCallback = tmpObj.removeCallback;
    defaultOptions = {port: 4200, host: 'localhost', disableLogging: true, serverListen: false};
  });

  afterEach(function() {
    tmpRemoveCallback()
  });


  describe('setting options with .broccoli file', function() {

    it('uses default options when .broccoli file is omitted', function() {
      var options = broccoli.cli.mergeStaticOptions(defaultOptions, tmpdir);
      expect(options.port).to.be.equal(4200);
    });

    it('uses .broccoli file options when provided', function() {
      
      createStaticOptions({port: 12345});
      
      var options = broccoli.cli.mergeStaticOptions(defaultOptions, tmpdir);
      expect(options.port).to.be.equal(12345);
      expect(options.host).to.be.equal('localhost');
    });
  });

  describe('customizing http headers', function() {

    var node = path.join(process.cwd(), 'test/fixtures/basic');
    var builder;

    beforeEach(function() {
      builder = new broccoli.Builder(node);
    });

    afterEach(function() {
      builder.cleanup();
    });

    it('uses default options when option.headers is omitted', function() {

      var server = broccoli.server.serve(builder, defaultOptions);

      request(server.app)
        .get('/foo.txt')
        .expect('OK')
        .expect('Cache-Control', 'private, max-age=0, must-revalidate')
        .expect('Content-Type', /text\/plain/)
        .expect('Content-Length', '2')
        .end(function(err, res){
          if (err) throw err;
        });
    });

    it('can add to default headers', function() {
      createStaticOptions({headers: {
        'Access-Control-Allow-Origin': '*',
        'X-Powered-By': 'Broccoli'
      }});

      var options = broccoli.cli.mergeStaticOptions(defaultOptions, tmpdir);
      var server = broccoli.server.serve(builder, options);

      request(server.app)
        .get('/foo.txt')
        // default response values:
        .expect('OK')
        .expect('Cache-Control', 'private, max-age=0, must-revalidate')
        .expect('Content-Type', /text\/plain/)
        .expect('Content-Length', '2')
        // customized response values:
        .expect('Access-Control-Allow-Origin', '*')
        .expect('X-Powered-By', 'Broccoli')
        .end(function(err, res){
          if (err) throw err;
        });
    });

    it('can override default headers', function() {
      createStaticOptions({headers: {
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }});

      var options = broccoli.cli.mergeStaticOptions(defaultOptions, tmpdir);
      var server = broccoli.server.serve(builder, options);

      request(server.app)
        .get('/foo.txt')
        // default response values:
        .expect('OK')
        .expect('Content-Type', /text\/plain/)
        .expect('Content-Length', '2')
        // customized response values:
        .expect('Cache-Control', 'public, max-age=3600, must-revalidate') 
        .expect('Access-Control-Allow-Origin', '*')

        .end(function(err, res){
          if (err) throw err;
        });
    });

  });

});

function createStaticOptions(options) {
  fs.writeFileSync(tmpdir + '/.broccoli', JSON.stringify(options), 'utf8')
}
