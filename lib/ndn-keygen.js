require('./forge.min.js');
var yManager = function() {

  if (localStorage['certificate'] != undefined) {
    this.certificate = localStorage['certificate'];
    this.publicKey = localStorage['publicKey'];
    this.privateKey = localStorage['privateKey']
  } else {
    var pki = forge.pki;
    var self = this;
    var options = {};
    pki.rsa.generateKeyPair({bits: 2048}, function(er, keys){
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

module.exports = new yManager();