var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var io = require('./ndn-io.js');
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
var ndnbuf = ndn.ndnbuf;
var Name = ndn.Name



var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

var rtc = {};
var servers = server = {
    iceServers: [
        {url: "stun:stun.l.google.com:19302"}
    ]
};

rtc.face = new ndn.Face({host: location.host.split(':')[0], port: 9696})

rtc.transport = function (dataChannel) {
  this.dc = dataChannel
  
};


/**
 * Connect to the host and port in face.  This replaces a previous connection and sets connectedHost
 *   and connectedPort.  Once connected, call onopenCallback().
 * Listen on the port to read an entire binary XML encoded element and call
 *    face.onReceivedElement(element).
 */
rtc.transport.prototype.connect = function(face, onopenCallback) 
{
  console.log(this) 
  
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
    console.log(ab, (ab instanceof ArrayBuffer), ab.buffer)
      
    if (result == null || result == undefined || result == "") {
      console.log('INVALID ANSWER');
    } else if (ab.buffer instanceof ArrayBuffer) {
          var bytearray = new ndnbuf(ab);
          
      if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));
      
      try {
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
    if (LOG > 3) console.log('ws.onopen: WebSocket connection opened.');
    if (LOG > 3) console.log('ws.onopen: ReadyState: ' + this.readyState);
        // Face.registerPrefix will fetch the ndndid when needed.
        
        
  }
  
  this.dc.onerror = function(ev) {
    console.log('ws.onerror: ReadyState: ' + this.readyState);
    console.log(ev);
    console.log('ws.onerror: WebSocket error: ' + ev.data);
  }
  
  this.dc.onclose = function(ev) {
    console.log('ws.onclose: WebSocket connection closed.');
    self.dc = null;
    
    // Close Face when WebSocket is closed
    face.readyStatus = Face.CLOSED;
    face.onclose();
    //console.log("NDN.onclose event fired.");
  }
  onopenCallback();
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



var rtcNameSpace = 'app/rtc'

function sendOfferAndIceCandidate(peer, offer, candidate) {
  var iceOffer = new Name(rtcNameSpace).append(new ndn.Name.Component(offer.sdp)).append(new ndn.Name.Component(JSON.stringify(candidate)))
  
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


rtc.createPeerConnection = function () {
  var peer = new PeerConnection(servers, {optional: [{RtpDataChannels: true}]})
  window.dataChannel = peer.createDataChannel('ndn', null);
  
  peer.onicecandidate = function (evt) {
    if (evt.candidate) {
      console.log('got ICE candidate, ', evt.candidate);
      sendOfferAndIceCandidate(peer, peer.offer, evt.candidate);
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
  var offer = {
    type: "offer",
    sdp: ndn.DataUtils.toString(interest.name.components[2].value)
  };
  var candidate = JSON.parse(ndn.DataUtils.toString(interest.name.components[3].value))
  
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
    console.log('got data channel, ', evt.channel );
    var dataChannel = evt.channel
    window.transport = new rtc.transport(dataChannel)
    window.dc = dataChannel
    console.log('webrtc NDN transport!', window.transport, peer);
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

rtc.face.registerPrefix(new ndn.Name(rtcNameSpace), onRTCInterest)

module.exports = rtc;
