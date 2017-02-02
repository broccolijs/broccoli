import * as broccoli from "../lib";

let outputNode = broccoli.loadBrocfile();
let builder = new broccoli.Builder(outputNode);

builder.build().then(() => {
  console.log(builder.outputPath);
  console.log(builder.outputNodeWrapper.label);
  console.log(builder.outputNodeWrapper.buildState.totalTime);

  let graph = builder.nodeWrappers.map(node => node.toJSON());
  console.log(JSON.stringify(graph, null, 2));

  startServer();
}).catch(err => {
  console.error(err);
}).finally(() => builder.cleanup());

function startServer() {
  let builder = new broccoli.Builder(outputNode);
  let watcher = new broccoli.Watcher(builder);
  broccoli.server.serve(watcher, "localhost", 4200);
}
