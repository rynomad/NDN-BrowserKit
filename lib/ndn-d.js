var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
require('./forge.min.js');


var yManager = function() {

  if (localStorage['certificate'] != undefined) {
    this.certificate = localStorage['certificate'];
    this.publicKey = localStorage['publicKey'];
    this.privateKey = localStorage['privateKey']
  } else {
    var pki = forge.pki;
    var self = this;
    pki.rsa.generateKeyPair(2048, function(er, keys){
      console.log(er, keys)
      var cert = pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
      cert.sign(keys.privateKey);
      var pem = pki.certificateToPem(cert);
      var pubPem = pki.publicKeyToPem(keys.publicKey);
      var priPem = pki.privateKeyToPem(keys.privateKey);
      localStorage['certificate'] = pem;
      localStorage['publicKey'] = pubPem;
      localStorage['privateKey'] = priPem;
      self.certificate = pem
      self.publicKey = pubPem
      self.privateKey = priPem
    });
  };
  this.key = null;
};
yManager.prototype.getKey = function()
{
  if (this.key === null) {
    this.key = new ndn.Key();
    this.key.fromPemString(this.publicKey, this.privateKey);
  }
  
  return this.key;
}

ndn.globalKeyManager = new yManager()
window.globalKeyManager = ndn.globalKeyManager



ndn.rtc = require('./ndn-rtc.js');

var appPrefix = new ndn.Name('app')



var daemon = {};
daemon.Faces = [];
daemon.PIT = [];
daemon.FIB = [];

var localTransport = function() {
  console.log('new local Transport')
};


var localFace = new ndn.Face({host: 0, port:0, getTransport: function(){ return new localTransport}})

daemon.Faces.push(localFace);

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
