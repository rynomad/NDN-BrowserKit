window.ndn = require('../index.js');

window.transport = ndn.rtc.createPeerConnection();

console.log(window.transport)
