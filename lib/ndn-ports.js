var local = {};
var ports = [];
var ndn = require('ndn-browser-shim');
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
var ndnbuf = ndn.ndnbuf;
var Name = ndn.Name
var Data = ndn.Data

local.transport = function () {
};


/**
 * Connect to the host and port in face.  This replaces a previous connection and sets connectedHost
 *   and connectedPort.  Once connected, call onopenCallback().
 * Listen on the port to read an entire binary XML encoded element and call
 *    face.onReceivedElement(element).
 */
local.transport.prototype.connect = function(face, onopenCallback)
{
  //console.log(this, onopenCallback, face)
  this.targetPort = face.port;

  if (this.portNumber == undefined) {
    ports[face.host] = this;
    this.portNumber = face.host;
  };
  this.elementReader = new BinaryXmlElementReader(face);
  var self = this;
  this.onmessage = function(ev) {
    var result = ev;
    //console.log('RecvHandle called on local face number ', self.portNumber );

    if (result == null || result == undefined || result == "") {
      console.log('INVALID ANSWER');
    }
    else if (result instanceof ArrayBuffer) {
      var bytearray = new ndnbuf(result);

      if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));

      try {
        // Find the end of the binary XML element and call face.onReceivedElement.
        self.elementReader.onReceivedData(bytearray);
      } catch (ex) {
        console.log("NDN.ws.onmessage exception: " + ex);
        return;
      }
    }
  };

  onopenCallback();

};

/**
 * Send the Uint8Array data.
 */
local.transport.prototype.send = function(data)
{
  if (ports[this.targetPort] != null) {
        // If we directly use data.buffer to feed ws.send(),
        // WebSocket may end up sending a packet with 10000 bytes of data.
        // That is, WebSocket will flush the entire buffer
        // regardless of the offset of the Uint8Array. So we have to create
        // a new Uint8Array buffer with just the right size and copy the
        // content from binaryInterest to the new buffer.
        //    ---Wentao
        var bytearray = new Uint8Array(data.length);
        bytearray.set(data);
        //console.log(bytearray)
        ports[this.targetPort].onmessage(bytearray.buffer);
    if (LOG > 3) console.log('local.send() returned.');
  }
  else
    console.log('local connection is not established.');
};

module.exports = local;