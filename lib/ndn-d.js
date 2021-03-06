var ndn = require('ndn-browser-shim');
ndn.globalKeyManager = require('./ndn-keygen.js')
ndn.Faces = require('./ndn-faces.js')
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
var Faces = require("./ndn-faces.js")
ndn.FIB = FIB
ndn.PIT = PIT
require('./ndnx.js');

var daemon = {};
daemon.c = require('./ndn-dc.js')

var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

// Start with 3 faces (bootstrap to server, local to userspace, local to ndnx system, and local to keymanager)

var key = ndn.globalKeyManager.getKey();

var prefix = new ndn.Name(['ndnx', key.publicKeyDigest])
var prefii = {};
prefii.ndnx = new Name('ndnx');
prefii.ndnx.ndnid = new ndn.Name(['ndnx', key.publicKeyDigest])

var Bootstrap = new ForwarderFace({host: "rosewiki.org", port: 9696})

var repoFace = new ForwarderFace({host: 31, port:32, getTransport: function(){return new local.transport}})
repoFace.transport.connect(repoFace, function(){
  repoFace.selfReg('/');

});

function bcb(){
  Bootstrap.registerPrefix(prefii.ndnx, Bootstrap.interestHandler);
  Bootstrap.selfReg(prefii.ndnx)
  Bootstrap.selfReg('ndnx')
  var bootstrapPrefix = new ndn.Name('ndnx')
  var keyClosure = new Face.CallbackClosure(null, null, onKeyInterest, keyPrefix, keyAnswer.transport)
};

function cb(){return true};

setTimeout(bcb, 2000)

Bootstrap.transport.connect(Bootstrap, cb)
var keyFace = new ForwarderFace({host: 3, port: 4, getTransport: function(){return new local.transport}})
var toUserSpace = new ForwarderFace({host: 2, port: 1, getTransport: function(){return new local.transport}})
var ndnx = new ForwarderFace({host:21, port:22, getTransport: function(){return new local.transport}})

ndnx.selfReg(new ndn.Name(['ndnx', key.publicKeyDigest]))
ndnx.transport.connect(ndnx, cb)

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
daemon.bs = Bootstrap

daemon.test = new ForwarderFace({host: 11, port: 10, getTransport: function() {return new local.transport}})
daemon.test.transport.connect(daemon.test, cb)
Bootstrap.faceID = 0

var keyPrefix = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
var keyClosure = new Face.CallbackClosure(null, null, onKeyInterest, keyPrefix, keyAnswer.transport)

Face.registeredPrefixTable.push(new RegisteredPrefix(keyPrefix, keyClosure))
toUserSpace.transport.connect(toUserSpace, cb);
FIB.push(Bootstrap);
FIB.push(keyFace);
FIB.push(ndnx);
FIB.push(toUserSpace);
FIB.push(repoFace)

Faces.push(Bootstrap);
Faces.push(keyFace);
Faces.push(ndnx);
Faces.push(toUserSpace);
Faces.push(repoFace);




daemon.forwarderFace = ForwarderFace
module.exports = daemon;
