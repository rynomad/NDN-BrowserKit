var ndn = require('ndn-browser-shim');
ndn.r = require('./lib/repo.js');
ndn.io = require('./lib/ndn-io.js');
ndn.utils = require('./lib/utils.js');
ndn.rtc = require('./lib/ndn-rtc.js')
module.exports = ndn;
