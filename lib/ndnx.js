var ndn = require("ndn-browser-shim");
var utils = require("./utils.js");
var rtc = require("./ndn-rtc.js");
var local = require("./ndn-ports.js")
var Face = ndn.Face;



var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

window.ndnx = new Face({host:22, port: 21, getTransport: function() {return new local.transport}} );

var cb = function(){

};

ndnx.transport.connect(ndnx, cb);

var key = ndn.globalKeyManager.getKey();

var prefix = new ndn.Name(['ndnx', key.publicKeyDigest]);


var onInterest = function(prefix, interest, transport) {
  if (LOG > 3) console.log("got intersest in ndnx system namespace", prefix, interest, transport);
  if (interest.name.components.length > 2) {
    if (interest.name.components[2].toEscapedString() == "newRTCface") {
      console.log("interest ")
      rtc.onInterest(prefix, interest, transport)
    } else {
      var data = new ndn.Data(interest.name, new ndn.SignedInfo(), key.publicKeyDer)
      data.sign()
      var encoded = data.encode()
      transport.send(encoded)
    };
  }


};
var closure = new Face.CallbackClosure(null, null, onInterest, prefix, ndnx.transport);
Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));