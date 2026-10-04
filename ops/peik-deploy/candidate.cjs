// Candidate-only binding. Production uses the unmodified application entry point.
const { Server } = require('node:http');
const listen = Server.prototype.listen;
Server.prototype.listen = function (port, ...args) {
  if (Number(port) !== 3001) throw new Error('Unexpected candidate port');
  return listen.call(this, 3001, '127.0.0.1', ...args.filter(arg => typeof arg === 'function'));
};
