var ndn = require('ndn-browser-shim');
ndn.d = require('./lib/ndn-d.js')
ndn.r = require('./lib/repo.js');
ndn.io = require('./lib/ndn-io.js');
ndn.utils = require('./lib/utils.js');
ndn.rtc = require('./lib/ndn-rtc.js');
ndn.globalKeyManager = require('./lib/ndn-keygen.js')


module.exports = ndn;
