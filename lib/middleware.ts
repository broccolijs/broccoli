import fs from 'fs';
import url from 'url';
import path from 'path';
import mime from 'mime-types';
import handlebars from 'handlebars';
import Watcher from './watcher';
import BuildError from './errors/build';
import resolvePath from 'resolve-path';
// @ts-ignore
import ansiHTML from 'ansi-html';

// Resets foreground and background colors to black
// and white respectively
ansiHTML.setColors({
  reset: ['#000', '#fff'],
});

const errorTemplate = handlebars.compile(
  fs.readFileSync(path.resolve(__dirname, 'templates/error.html')).toString()
);
const dirTemplate = handlebars.compile(
  fs.readFileSync(path.resolve(__dirname, 'templates/dir.html')).toString()
);

interface MiddlewareOptions {
  autoIndex?: boolean;
  liveReloadPath?: string;
}

// You must call watcher.start() before you call `getMiddleware`
//
// This middleware is for development use only. It hasn't been reviewed
// carefully enough to run on a production server.
//
// Supported options:
//   autoIndex (default: true) - set to false to disable directory listings
//   liveReloadPath - LiveReload script URL for error pages
function handleRequest(
  outputPath: string,
  request: any,
  response: any,
  next: any,
  options: MiddlewareOptions
) {
  const urlObj = url.parse(request.url);
  const pathname = urlObj.pathname || '';
  let filename: string, stat;

  try {
    filename = decodeURIComponent(pathname);

    if (!filename) {
      response.writeHead(400);
      response.end();
      return;
    }

    filename = resolvePath(outputPath, filename.substr(1));
  } catch (err) {
    response.writeHead(err.status || 500);
    response.end();
    return;
  }

  try {
    stat = fs.statSync(filename);
  } catch (e) {
    // not found
    next();
    return;
  }

  if (stat.isDirectory()) {
    const indexFilename = path.join(filename, 'index.html');
    const hasIndex = fs.existsSync(indexFilename);

    if (!hasIndex && !options.autoIndex) {
      next();
      return;
    }

    if (pathname[pathname.length - 1] !== '/') {
      urlObj.pathname += '/';
      urlObj.host = request.headers['host'];
      urlObj.protocol = request.socket.encrypted ? 'https' : 'http';
      response.setHeader('Location', url.format(urlObj));
      response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      response.writeHead(301);
      response.end();
      return;
    }

    if (!hasIndex) {
      // implied: options.autoIndex is true
      const context = {
        url: request.url,
        files: fs
          .readdirSync(filename)
          .sort()
          .map(child => {
            const stat = fs.statSync(path.join(filename, child)),
              isDir = stat.isDirectory();
            return {
              href: child + (isDir ? '/' : ''),
              type: isDir
                ? 'dir'
                : path
                    .extname(child)
                    .replace('.', '')
                    .toLowerCase(),
            };
          }),
        liveReloadPath: options.liveReloadPath,
      };
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      response.writeHead(200);
      response.end(dirTemplate(context));
      return;
    }

    // otherwise serve index.html
    filename = indexFilename;
    stat = fs.statSync(filename);
  }

  const lastModified = stat.mtime.toUTCString();
  response.setHeader('Last-Modified', lastModified);
  // nginx style treat last-modified as a tag since browsers echo it back
  if (request.headers['if-modified-since'] === lastModified) {
    response.writeHead(304);
    response.end();
    return;
  }

  response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  response.setHeader('Content-Length', stat.size);
  response.setHeader('Content-Type', mime.contentType(path.extname(filename)));

  // read file sync so we don't hold open the file creating a race with
  // the builder (Windows does not allow us to delete while the file is open).
  const buffer = fs.readFileSync(filename);
  response.writeHead(200);
  response.end(buffer);
}
export = function getMiddleware(watcher: Watcher, options: MiddlewareOptions = {}) {
  if (options.autoIndex == null) options.autoIndex = true;

  const outputPath = path.resolve(watcher.builder.outputPath);

  return async function broccoliMiddleware(request: any, response: any, next: any) {
    if (watcher.currentBuild == null) {
      throw new Error('Waiting for initial build to start');
    }

    try {
      await watcher.currentBuild;
      handleRequest(outputPath, request, response, next, options);
    } catch (error) {
      // All errors thrown from builder.build() are guaranteed to be
      // Builder.BuildError instances.
      const context = {
        stack: ansiHTML(error.stack || ''),
        liveReloadPath: options.liveReloadPath,
        payload: error.broccoliPayload,
      };
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.writeHead(500);
      response.end(errorTemplate(context));
      return error.stack;
    }
  };
};
