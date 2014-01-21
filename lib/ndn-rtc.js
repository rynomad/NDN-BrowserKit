var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var io = require('./ndn-io.js');
var daemon = require('./ndn-d.js');
var ForwarderFace = require('./ForwarderFace.js');
var FIB = require('./FIB.js')
var Faces = require('./ndn-faces.js')
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
var BinaryXmlWireFormat = ndn.BinaryXmlWireFormat;
var ndnbuf = ndn.ndnbuf;
var Name = ndn.Name
var Data = ndn.Data



var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

var rtc = {};
var servers = server = {
    iceServers: [
        {url: "stun:stun.l.google.com:19302"}
    ]
};

//rtc.face = new ndn.Face({host: "rosewiki.org", port: 9696})

rtc.transport = function (dataChannel) {
  this.dc = dataChannel
  this.dc.onopen = function(ev) {
    //console.log('transport open ')
  }
};


/**
 * Connect to the host and port in face.  This replaces a previous connection and sets connectedHost
 *   and connectedPort.  Once connected, call onopenCallback().
 * Listen on the port to read an entire binary XML encoded element and call
 *    face.onReceivedElement(element).
 */
rtc.transport.prototype.connect = function(face, onopenCallback)
{

  this.dc.binaryType = "arraybuffer";

  this.elementReader = new BinaryXmlElementReader(face);
  var self = this;
  self.currentMessage = []
  self.face = face
  this.dc.onmessage = function(ev) {
    //console.log('dc.onmessage called')
    if (true) {

      var result = ev.data;
      //console.log('RecvHandle called.');

      if (result == null || result == undefined || result == "") {
        //console.log('INVALID ANSWER');
      } else if (result instanceof ArrayBuffer) {
            var bytearray = new ndnbuf(result);

        if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));

        try {
                  //console.log(self, face)
                  // Find the end of the binary XML element and call face.onReceivedElement.
                  self.elementReader.onReceivedData(bytearray);
        } catch (ex) {
          //console.log("NDN.ws.onmessage exception: " + ex);
          return;
        }
      }
    }









  }

  this.dc.onopen = function(ev) {
    if (LOG > 3) console.log(ev);
    if (LOG > 3) console.log('dc.onopen: WebRTC connection opened.');
    if (LOG > 3) console.log('dc.onopen: ReadyState: ' + this.readyState);
        // Face.registerPrefix will fetch the ndndid when needed.

    onopenCallback();
  }

  this.dc.onerror = function(ev) {
    //console.log('dc.onerror: ReadyState: ' + this.readyState);
    //console.log(ev);
    //console.log('dc.onerror: WebRTC error: ' + ev.data);
  }

  this.dc.onclose = function(ev) {
    //console.log('dc.onclose: WebRTC connection closed.');
    self.dc = null;

    // Close Face when WebSocket is closed
    self.face.readyStatus = ndn.Face.CLOSED;
    self.face.onclose();
    //console.log("NDN.onclose event fired.");
  }
  onopenCallback();

};

/**
 * Send the Uint8Array data.
 */
rtc.transport.prototype.send = function(data)
{
  if ((this.dc != null) && (this.dc.readyState == 'open')) {
        // If we directly use data.buffer to feed ws.send(),
        // WebSocket may end up sending a packet with 10000 bytes of data.
        // That is, WebSocket will flush the entire buffer
        // regardless of the offset of the Uint8Array. So we have to create
        // a new Uint8Array buffer with just the right size and copy the
        // content from binaryInterest to the new buffer.
        //    ---Wentao
        //var bytearray = new Uint8Array(data.length);
        //bytearray.set(data);
        this.dc.send(data.buffer);

    if (LOG > 3) console.log('rtc.send() returned.');
  } else {
    console.log('rtc connection is not established.');
  };
};


function sendOfferAndIceCandidate(ndndid, face, peer, offer, candidate) {
  var iceOffer = new Name(['ndnx', ndndid, 'newRTCface']);

  var obj = {action: 'newRTCface', sdp: offer.sdp, ice: candidate};
  console.log(obj)
  var string = JSON.stringify(obj)
  var bytes = new ndn.ndnbuf(string)
  var nfblob = new Data(new Name(), new ndn.SignedInfo(), bytes)
  nfblob.signedInfo.setFields()
  nfblob.sign()
  var encoded = nfblob.encode()

  iceOffer.append(encoded)

  function onRemote(){
    peer.addIceCandidate(new RTCIceCandidate({
        sdpMLineIndex: answerIce.ice.sdpMLineIndex,
        candidate: answerIce.ice.candidate
    }));
  };

  var onAnswer = function (interest, data) {

    answerIce = JSON.parse(ndn.DataUtils.toString(data.content));
    console.log('got answer', answerIce)
    peer.setRemoteDescription(new RTCSessionDescription(answerIce.sdp), onRemote)
  };

  var offerInterest = new ndn.Interest(iceOffer)
  console.log(offerInterest);
  utils.setNonce(offerInterest);
  face.expressInterest(offerInterest, onAnswer);
};


rtc.createPeerConnection = function (ndndid, face) {
  if (ndndid == undefined) {
    ndndid = 'filler'
  }
  var peer = new PeerConnection(servers)
  var dataChannel = peer.createDataChannel('ndn', null);
  window.test = [peer, dataChannel]

  peer.onicecandidate = function (evt) {
    if (evt.candidate) {
      console.log('got ICE candidate, ', evt.candidate);
      sendOfferAndIceCandidate(ndndid, face, peer, peer.offer, evt.candidate);
      peer.onicecandidate = null;
    };
  };

  function onOfferCreated(offer){
    peer.offer = offer;
    peer.setLocalDescription(offer, onLocalDescriptionSet);
  }

  function onLocalDescriptionSet() {
    // after this function returns, pc1 will start firing icecandidate events
    console.log('local description set, ', peer);
  };
  var cb = function(){return true}
  peer.createOffer(onOfferCreated);
  var transport = new rtc.transport(dataChannel)
  var newFace = new ForwarderFace({host:0, port: 0, getTransport: function(){return transport}})
  newFace.transport.connect(newFace, cb)
  newFace.selfReg('ndnx')
  return newFace
};

rtc.onInterest = function (prefix, interest, transport) {
  var nfblob = interest.name.components[3].value
  var d = new Data();
  d.decode(nfblob)
  var string = ndn.DataUtils.toString(d.content);
  //console.log(string)
  var iceOffer = JSON.parse(string)
  //console.log(iceOffer)
  var candidate = iceOffer.ice;

  console.log(iceOffer);

  var offer = {
    type: "offer",
    sdp: iceOffer.sdp
  };

  var peer = new PeerConnection(servers);
  window.test = peer

  peer.onicecandidate = function (evt) {
    peer.answer.ice = evt.candidate
    var string = JSON.stringify(peer.answer);
    var sending = new ndn.ndnbuf(string)
    var data = new ndn.Data(interest.name, new ndn.SignedInfo(), sending)
    data.signedInfo.setFields()
    data.sign();
    var encoded = data.encode()

    transport.send(encoded);
    console.log('sent answer', peer.answer);
    peer.onicecandidate = null;
  };

  peer.ondatachannel = function (evt) {
    var dataChannel = evt.channel
    console.log(evt)
    var transport = new rtc.transport(dataChannel)

    var face = new ForwarderFace({host: 0, port: 0, getTransport: function(){return transport}})
    face.selfReg('ndnx')
    function cb() {
      face.ndndid = d.signedInfo.publisher.publisherPublicKeyDigest
      Faces.push(face)
      ndn.FIB.push(face)
    }
    face.transport.connect(face, cb)
    console.log('webrtc NDN Face!', face);
  };

  peer.setRemoteDescription(new RTCSessionDescription(offer), onRemoteSet)


  var onCreated = function(sdp) {
    peer.setLocalDescription(sdp)
    peer.answer = {};
    peer.answer.sdp = sdp

  };

  function onRemoteSet() {
    peer.addIceCandidate(new RTCIceCandidate({
      sdpMLineIndex: candidate.sdpMLineIndex,
      candidate: candidate.candidate
    }));
    peer.createAnswer(onCreated)
  };

};

module.exports = rtc;
