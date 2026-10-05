const cluster = require('node:cluster');
const path = require('node:path');

const workers = Number(process.env.WEB_WORKERS ?? 1);
if (cluster.isPrimary && workers > 1) {
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.log(`worker ${worker.process.pid} exited (${code}), restarting`);
    cluster.fork();
  });
} else {
  process.argv = [process.argv[0], 'next', 'start', '-p', '3000', '-H', '0.0.0.0'];
  require(path.join(process.cwd(), 'node_modules/next/dist/bin/next'));
}
