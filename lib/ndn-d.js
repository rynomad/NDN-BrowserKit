var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');

var local = require('./ndn-ports.js');

ndn.rtc = require('./ndn-rtc.js');

var appPrefix = new ndn.Name('app')

window.f1 = new ndn.Face({host:1, port:2, getTransport: function(){return new local.transport()}})
window.f2 = new ndn.Face({host:2, port:1, getTransport: function(){return new local.transport()}})

var daemon = {};
daemon.Faces = [];
daemon.PIT = [];
daemon.FIB = [];

var localTransport = function() {
  console.log('new local Transport')
};


var localFace = new ndn.Face({host: 0, port:0, getTransport: function(){ return new localTransport}})

daemon.Faces.push(localFace);

daemon.onInterest = function(prefix, interest, transport) {
  console.log('recieved interest, ', interest);
};


daemon.newFace = function(ndndid) {
  var transport = ndn.rtc.createPeerConnection(ndndid);
  var face = new ndn.Face({
    host: 0,
    port: 0,
    getTransport: function(){return transport}
  })
  face.registerPrefix(new ndn.Name('stuff'))
  daemon.Faces.push(face)
};




module.exports = daemon;
