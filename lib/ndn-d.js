var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var Name = ndn.Name;
var local = require('./ndn-ports.js');
var ForwarderFace = require('./ForwarderFace.js')
var BinaryXMLDecoder = ndn.BinaryXMLDecoder;
var NDNProtocolDTags = ndn.NDNProtocolDTags;
var Interest = ndn.Interest;
var Data = ndn.Data;
var ndnbuf = ndn.ndnbuf;
var Face = ndn.Face;
var Closure = ndn.Closure;
var UpcallInfo = ndn.UpcallInfo;
var FIB = require("./FIB.js");
var PIT = require("./PIT.js");
require('./ndnx.js');

var daemon = {};
daemon.c = require('./ndn-dc.js')

var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

// Start with 3 faces (bootstrap to server, local to userspace, local to ndnx system, and local to keymanager)


var Bootstrap = new ForwarderFace({host: "rosewiki.org", port: 9696})

Bootstrap.registerPrefix(new ndn.Name('ndnx'));
daemon.bs = Bootstrap
function cb(){return true};
var keyFace = new ForwarderFace({host: 3, port: 4, getTransport: function(){return new local.transport}})
var toUserSpace = new ForwarderFace({host: 2, port: 1, getTransport: function(){return new local.transport}})
var ndnx = new ForwarderFace({host:21, port:22, getTransport: function(){return new local.transport}})

ndnx.selfReg('ndnx')
ndnx.transport.connect(ndnx, cb)
FIB.push(ndnx)

keyFace.transport.connect(keyFace, cb)
keyFace.selfReg('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')

var keyAnswer = new Face({host: 4, port: 3, getTransport: function() {return new local.transport}})
keyAnswer.transport.connect(keyAnswer, cb);


function onKeyInterest(prefix, interest, transport) {
  var mykey = ndn.globalKeyManager.getKey()

  var keyData = new Data(interest.name, new ndn.SignedInfo(), mykey.publicKeyDer)
  keyData.sign()
  var encoded = keyData.encode()

  transport.send(encoded)
}


daemon.test = new ForwarderFace({host: 11, port: 10, getTransport: function() {return new local.transport}})
daemon.test.transport.connect(daemon.test, cb)


var keyPrefix = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
var keyClosure = new Face.CallbackClosure(null, null, onKeyInterest, keyPrefix, keyAnswer.transport)

Face.registeredPrefixTable.push(new RegisteredPrefix(keyPrefix, keyClosure))
toUserSpace.selfReg('stuff')
toUserSpace.transport.connect(toUserSpace, cb);
FIB.push(daemon.test);
FIB.push(keyFace);
FIB.push(toUserSpace);

daemon.forwarderFace = ForwarderFace
module.exports = daemon;
