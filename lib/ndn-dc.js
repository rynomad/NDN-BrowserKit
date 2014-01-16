var ndn = require('ndn-browser-shim');
var rtc = require('./ndn-rtc.js')
var ForwarderFace = require('./ForwarderFace.js')
var ndnx = require('./ndnx.js')
var Faces = require('./ndn-faces.js')
var ndndc = {}



ndndc.add = function(uri, arg2, arg3, arg4) {
  // instead of TCP/UDP, we have available websockets (to wsproxy server) or webRTC dataChannels (to other browsers)

  if (arg2 == "ws") {
    var face = new ForwarderFace({
      host: arg3,
      port: arg4,
    })
    face.registerPrefix(new ndn.Name(uri))
    face.transport.faceID = Faces.length
    Faces.push[face]
    return face;
  } else if (arg2 == "rtc") {
    var ndndid = arg3
    var face = rtc.createPeerConnection(ndndid, ndnx)    // we have to discover host and port via ICE etc. so use arg3 should contain the ndndid of the target to bootstrap signaling
    var id = Faces.length;
    face.transport.faceID = id;
    Faces.push(face);
    face.onopen = function() {
      console.log(id, this, face, "triggered onopen from ndn.d.c.add rtc")
    }
  } else if (arg2 == "th") {
    // asking for a telehash connection, arg3 = hashname (same as ndndid)
  } else if (typeof arg2 == "face") {
    var face = Faces[arg3]
    face.registerPrefix(new ndn.Name(uri))

  }

}


// Delete a FIB entry for the uri on the given faceID
ndndc.del = function (uri, faceID) {


}

ndndc.destroyFace = function(faceID) {
  delete Faces[faceID]
}


module.exports = ndndc