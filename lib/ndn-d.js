var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var Name = ndn.Name;
var local = require('./ndn-ports.js');
var BinaryXMLDecoder = ndn.BinaryXMLDecoder;
var NDNProtocolDTags = ndn.NDNProtocolDTags;
var Interest = ndn.Interest;
var Data = ndn.Data;
var ndnbuf = ndn.ndnbuf;
var Face = ndn.Face;
var Closure = ndn.Closure;
var UpcallInfo = ndn.UpcallInfo;

ndn.rtc = require('./ndn-rtc.js');

var appPrefix = new ndn.Name('app')



var daemon = {};

var FIB = [];
var PIT = [];

var PitEntry = function PitEntry(interest, face)
{
  this.interest = interest;
  this.face = face;
}


var ForwarderFace = function ForwarderFace(opts)
{
  var face = new ndn.Face(opts);
  var self = this
  face.onReceivedElement = function(element)
  {
    console.log("got element in forwarderFace ", element)
    var decoder = new BinaryXMLDecoder(element);
    // Dispatch according to packet type
    if (decoder.peekDTag(NDNProtocolDTags.Interest)) {
      var interest = new Interest();
      interest.from_ndnb(decoder);
      if (LOG > 3) console.log("Interest packet received: " + interest.name.toUri() + "\n");

      if (LOG > 3) console.log('Interest packet received.');

      // Add to the PIT.
      PIT.push(new PitEntry(interest, this));
      console.log('interest recieved in forwarding face')
      // Send the interest to the matching faces in the FIB.
      for (var i = 0; i < FIB.length; ++i) {
        var face = FIB[i];
        if (face == this) {
          // Don't send the interest back to where it came from
          continue;
        } else {
          if (face.registeredPrefixes != undefined){
            for (var j = 0; j < face.registeredPrefixes.length; j++ ) {
              if (face.registeredPrefixes[j] != null && face.registeredPrefixes[j].match(interest.name)) {
                face.transport.send(element);
              };
            };
          };
        };
      }
    }
    else if (decoder.peekDTag(NDNProtocolDTags.Data)) {

      if (LOG > 3) console.log('Data packet received.');

      var data = new Data();
      data.from_ndnb(decoder);
      // Send the data packet to the face for each matching PIT entry.
      // Iterate backwards so we can remove the entry and keep iterating.
      for (var i = PIT.length - 1; i >= 0; --i) {
        if (PIT[i].interest.matchesName(data.name)) {
          if (LOG > 3) console.log("Sending Data to match interest " + PIT[i].interest.name.toUri() + "\n");
          PIT[i].face.transport.send(element);

          // Remove this entry.
          PIT.splice(i, 1);
        }
      }
    }
  };
  face.selfReg = function (prefix) {
    if (this.registeredPrefixes == undefined) {
      this.registeredPrefixes = [];
    };
    if (prefix instanceof ndn.Name) {
      this.registeredPrefixes.push(prefix)
    } else if (typeof prefix == "string") {
      this.registeredPrefixes.push(new ndn.Name(prefix))
    }

  };
  return face;
};




// Start with 3 faces (bootstrap to server, local to userspace, and local to keymanager)


var Bootstrap = new ForwarderFace({host: "rosewiki.org", port: 9696})
var keyFace = new ForwarderFace({host: 3, port: 4, getTransport: function(){return new local.transport}})
var toUserSpace = new ForwarderFace({host: 2, port: 1, getTransport: function(){return new local.transport}})

keyFace.transport.connect(keyFace, cb)
keyFace.selfReg('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')

var keyAnswer = new Face({host: 4, port: 3, getTransport: function() {return new local.transport}})
keyAnswer.transport.connect(keyAnswer, cb);


function onKeyInterest(prefix, interest, transport) {
  var mykey = ndn.globalKeyManager.getKey()
  console.log('got interest for my key', mykey)

  var keyData = new Data(interest.name, new ndn.SignedInfo(), mykey.publicKeyDer)
  keyData.sign()
  var encoded = keyData.encode()
  transport.send(encoded)
}

var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

var keyPrefix = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
var keyClosure = new Face.CallbackClosure(null, null, onKeyInterest, keyPrefix, keyAnswer.transport)
Face.registeredPrefixTable.push(new RegisteredPrefix(keyPrefix, keyClosure))

function cb(){return true};
toUserSpace.transport.connect(toUserSpace, cb);
FIB.push(keyFace);
FIB.push(toUserSpace);


module.exports = daemon;
