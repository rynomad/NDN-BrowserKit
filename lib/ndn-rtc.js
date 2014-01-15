var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var io = require('./ndn-io.js');
var daemon = require('./ndn-d.js')
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
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
    console.log('transport open ', ev)
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
  console.log(this, onopenCallback)

  this.dc.binaryType = "arraybuffer";

  this.elementReader = new BinaryXmlElementReader(face);
  var self = this;
  this.dc.onmessage = function(ev) {
    var result = atob(ev.data);
    console.log('RecvHandle called.');
    var len = result.length;
    var ab = new Uint8Array( len );
    for (var i = 0; i < len; i++){
        var ascii = result.charCodeAt(i);
        ab[i] = ascii;
    }

    if (result == null || result == undefined || result == "") {
      console.log('INVALID ANSWER');
    } else if (ab.buffer instanceof ArrayBuffer) {
          var bytearray = new ndnbuf(ab);

      if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));

      try {
                console.log(self, face)
                // Find the end of the binary XML element and call face.onReceivedElement.
                self.elementReader.onReceivedData(bytearray);
      } catch (ex) {
        console.log("NDN.ws.onmessage exception: " + ex);
        return;
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
    console.log('dc.onerror: ReadyState: ' + this.readyState);
    console.log(ev);
    console.log('dc.onerror: WebRTC error: ' + ev.data);
  }

  this.dc.onclose = function(ev) {
    console.log('dc.onclose: WebRTC connection closed.');
    self.dc = null;

    // Close Face when WebSocket is closed
    face.readyStatus = Face.CLOSED;
    face.onclose();
    //console.log("NDN.onclose event fired.");
  }

};

/**
 * Send the Uint8Array data.
 */
rtc.transport.prototype.send = function(data)
{
  if (this.dc != null) {
        // If we directly use data.buffer to feed ws.send(),
        // WebSocket may end up sending a packet with 10000 bytes of data.
        // That is, WebSocket will flush the entire buffer
        // regardless of the offset of the Uint8Array. So we have to create
        // a new Uint8Array buffer with just the right size and copy the
        // content from binaryInterest to the new buffer.
        //    ---Wentao
        console.log(data)
        var base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(data)));
        this.dc.send(base64String);
    if (LOG > 3) console.log('ws.send() returned.');
  }
  else
    console.log('rtc connection is not established.');
};



var rtcNameSpace = 'ndnx'

function sendOfferAndIceCandidate(ndndid, peer, offer, candidate) {
  var iceOffer = new Name([rtcNameSpace, ndndid, 'newRTCface'])

  var obj = {action: 'newRTCface', sdp: offer.sdp, ice: candidate}
  string = JSON.stringify(obj)

  var nfblob = new Data(new Name(), new ndn.SignedInfo(), new ndnbuf(string))
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

  rtc.face.expressInterest(iceOffer, onAnswer);
};


rtc.createPeerConnection = function (ndndid) {
  if (ndndid == undefined) {
    ndndid = 'filler'
  }
  var peer = new PeerConnection(servers, {optional: [{RtpDataChannels: true}]})
  var dataChannel = peer.createDataChannel('ndn', null);

  peer.onicecandidate = function (evt) {
    if (evt.candidate) {
      console.log('got ICE candidate, ', evt.candidate);
      sendOfferAndIceCandidate(ndndid, peer, peer.offer, evt.candidate);
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

  peer.createOffer(onOfferCreated);
  return new rtc.transport(dataChannel)
};

var onRTCInterest = function (prefix, interest, transport) {
  var keyName = new ndn.Name()
  var mykey = new ndn.Key()
  mykey.fromPemString(localStorage['publicKey'], localStorage['privateKey'])
  keyName.append('ndnx').append(mykey.publicKeyDigest)
  console.log(typeof interest.name.components[1].value)
  var ndndid = interest.name.components[1].value

  if (interest.matches_name(keyName)) {
    console.log('got interest for me,', true)
  };
  var nfblob = interest.name.components[3].value
  var d = new Data();
  d.decode(nfblob)
  var iceOffer = JSON.parse(ndn.DataUtils.toString(d.content))
  console.log(iceOffer)
  var candidate = iceOffer.ice;

  console.log(nfblob);

  var offer = {
    type: "offer",
    sdp: iceOffer.sdp
  };

  var peer = new PeerConnection(servers, {optional: [{RtpDataChannels: true}]});

  peer.onicecandidate = function (evt) {
    peer.answer.ice = evt.candidate
    var string = JSON.stringify(peer.answer);
    var sending = new ndn.ndnbuf(string)
    var data = new ndn.Data(interest.name, new ndn.SignedInfo(), sending)
    data.signedInfo.setFields()
    data.sign();
    var encoded = data.encode()

    transport.send(encoded);
    console.log('sent answer', peer);
    peer.onicecandidate = null;
  };

  peer.ondatachannel = function (evt) {
    var dataChannel = evt.channel
    var transport = new rtc.transport(dataChannel)

    var face = new ndn.Face({host: 0, port: 0, getTransport: function(){return transport}})
    function cb() {return}
    transport.connect(face, cb)
    ndn.d.Faces.push(face)
    console.log('webrtc NDN Face!', face);
    //face.registerPrefix(new ndn.Name('ndnx'), onRTCInterest)
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

//rtc.face.registerPrefix(new ndn.Name(rtcNameSpace), onRTCInterest)

module.exports = rtc;
