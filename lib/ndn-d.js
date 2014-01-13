var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');

var local = require('./ndn-ports.js');

ndn.rtc = require('./ndn-rtc.js');

var appPrefix = new ndn.Name('app')

toUserSpace = new ndn.Face({host:2, port:1, getTransport: function(){return new local.transport()}})
window.f2 = new ndn.Face({host:2, port:1, getTransport: function(){return new local.transport()}})
var daemon = {};

var FIB = [];
var PIT = [];

var PitEntry = function PitEntry(interest, face)
{
  this.interest = interest;
  this.face = face;
}

var ForwarderFace = function ForwarderFace(host, port, registeredPrefix)
{
  this.transport = new XpcomTransport();
  this.transport.connectHelper(host, port, this);
  // An HTTP request will be redirected to this.onHttpRequest.
  this.transport.setHttpListener(this);

  this.registeredPrefix = registeredPrefix;
};

ForwarderFace.prototype.onReceivedElement = function(element)
{
  var decoder = new BinaryXMLDecoder(element);
  // Dispatch according to packet type
  if (decoder.peekDTag(NDNProtocolDTags.Interest)) {
    var interest = new Interest();
    interest.from_ndnb(decoder);
    if (LOG > 3) dump("Interest packet received: " + interest.name.toUri() + "\n");

    // Add to the PIT.
    PIT.push(new PitEntry(interest, this));

    // Send the interest to the matching faces in the FIB.
    for (var i = 0; i < FIB.length; ++i) {
      var face = FIB[i];
      if (face == this)
        // Don't send the interest back to where it came from.
        continue;

      if (face.registeredPrefix != null && face.registeredPrefix.match(interest.name))
        face.transport.send(element);
    }
  }
  else if (decoder.peekDTag(NDNProtocolDTags.Data)) {
    var data = new Data();
    data.from_ndnb(decoder);
    if (LOG > 3) dump("Data packet received: " + data.name.toUri() + "\n");

    // Send the data packet to the face for each matching PIT entry.
    // Iterate backwards so we can remove the entry and keep iterating.
    for (var i = PIT.length - 1; i >= 0; --i) {
      if (PIT[i].interest.matchesName(data.name)) {
        if (LOG > 3) dump("Sending Data to match interest " + PIT[i].interest.name.toUri() + "\n");
        PIT[i].face.transport.send(element);

        // Remove this entry.
        PIT.splice(i, 1);
      }
    }
  }
};

// For now, hard code an initial forwarding connection.
FIB.push(new ForwarderFace("borges.metwi.ucla.edu", 9695, new Name("/ndn")));


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
