var ndn = require('ndn-browser-shim');
var rtc = require('./ndn-rtc.js')
var ForwarderFace = require('./ForwarderFace.js')
var ndndc = {}

ndndc.add = function(uri, arg2, arg3, arg4) {
  // instead of TCP/UDP, we have available websockets (to wsproxy server) or webRTC dataChannels (to other browsers)

  if (arg2 == "ws") {
    var face = new ForwarderFace({
      host: arg3,
      port: arg4,
    })
    face.registerPrefix(new ndn.Name(uri))

    return face;
  } else if (arg2 == "rtc") {
    var ndndid = arg3

    // we have to discover host and port via ICE etc. so use arg3 should contain the ndndid of the target to bootstrap signaling

  } else if (arg2 instanceof ndn.Face){
    var face = arg2
    face.registerPrefix(new ndn.Name(uri))

    console.log("protocol must be 'ws' for websocket or 'rtc' for webRTC dataChannels")
  }

}




module.exports = ndndc