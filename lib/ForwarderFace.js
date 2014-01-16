var ndn = require('ndn-browser-shim');
var utils = require('./utils.js')
var BinaryXMLDecoder = ndn.BinaryXMLDecoder;
var NDNProtocolDTags = ndn.NDNProtocolDTags;
var Interest = ndn.Interest;
var Data = ndn.Data;
var ndnbuf = ndn.ndnbuf;
var Face = ndn.Face;
var Closure = ndn.Closure;
var UpcallInfo = ndn.UpcallInfo;
var Name = ndn.Name;
var FIB = require("./FIB.js")
var PIT = require("./PIT.js")

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
    console.log("got element in forwarderFace ", self.host)
    var decoder = new BinaryXMLDecoder(element);
    // Dispatch according to packet type
    if (decoder.peekDTag(NDNProtocolDTags.Interest)) {
      var interest = new Interest();
      interest.from_ndnb(decoder);
      if (LOG > 3) console.log("Interest packet received: " + interest.name.toUri() + "\n");

      if (LOG > 3) console.log('Interest packet received.');

      var isLocalInterest = false;
      if (utils.nameHasCommandMarker(interest.name)) {
        if (utils.getCommandMarker(interest.name) == '%C1.M.S.localhost') {
          console.log("interest has localhost commandMarker")
          isLocalInterest = true;
        }
      }
      window.interest = interest
      console.log(interest)
      // Add to the PIT.
      for (var i = 0; i < PIT.length; i++) {
        console.log(PIT[i].interest.nonce)
        if (PIT[i].interest.nonce.toString() == interest.nonce.toString()) {
          return;
        };
      };
      var pEntry = new PitEntry(interest, this);
      console.log(pEntry)
      PIT.push(pEntry);
      console.log('interest recieved in forwarding face', PIT,  FIB)
      // Send the interest to the matching faces in the FIB.
      for (var i = 0; i < FIB.length; ++i) {
        var face = FIB[i];
        if ((face == this) || ((isLocalInterest == true) && ((face.transport instanceof local.transport) == false))) {
          // Don't send the interest back to where it came from, and don't send localhost interests anywhere but local transports
          continue;
        } else {
          if (face.registeredPrefixes != undefined){
            for (var j = 0; j < face.registeredPrefixes.length; j++ ) {
              if (face.registeredPrefixes[j] != null && face.registeredPrefixes[j].match(interest.name) && (face.readyStatus == 0 || 'open')) {
                face.transport.send(element);
              };
            };
          };
        };
      };


    }
    else if (decoder.peekDTag(NDNProtocolDTags.Data)) {
      var LOG = 4
      if (LOG > 3) console.log('Data packet received.');

      var data = new Data();
      data.from_ndnb(decoder);
      // Send the data packet to the face for each matching PIT entry.
      // Iterate backwards so we can remove the entry and keep iterating.

      var pitEntry = Face.getEntryForExpressedInterest(data.name);
      window.data = data
      console.log(data)
      if (pitEntry != null) {
        // Cancel interest timer
        clearTimeout(pitEntry.timerID);

        // Remove PIT entry from Face.PITTable
        var index = Face.PITTable.indexOf(pitEntry);
        if (index >= 0)
          Face.PITTable.splice(index, 1);

        var currentClosure = pitEntry.closure;

        if (this.verify == false) {
          // Pass content up without verifying the signature
          currentClosure.upcall(Closure.UPCALL_CONTENT_UNVERIFIED, new UpcallInfo(this, pitEntry.interest, 0, data));
          return;
        }

        // Key verification

        // Recursive key fetching & verification closure
        var KeyFetchClosure = function KeyFetchClosure(content, closure, key, sig, wit) {
          this.data = content;  // unverified data packet object
          this.closure = closure;  // closure corresponding to the data
          this.keyName = key;  // name of current key to be fetched

          Closure.call(this);
        };

        var thisNDN = this;
        KeyFetchClosure.prototype.upcall = function(kind, upcallInfo) {
          if (kind == Closure.UPCALL_INTEREST_TIMED_OUT) {
            console.log("In KeyFetchClosure.upcall: interest time out.");
            console.log(this.keyName.contentName.toUri());
          }
          else if (kind == Closure.UPCALL_CONTENT) {
            var rsakey = new Key();
            rsakey.readDerPublicKey(upcallInfo.data.content);
            var verified = data.verify(rsakey);

            var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;
            this.closure.upcall(flag, new UpcallInfo(thisNDN, null, 0, this.data));

            // Store key in cache
            var keyEntry = new KeyStoreEntry(keylocator.keyName, rsakey, new Date().getTime());
            Face.addKeyEntry(keyEntry);
          }
          else if (kind == Closure.UPCALL_CONTENT_BAD)
            console.log("In KeyFetchClosure.upcall: signature verification failed");
        };

        if (data.signedInfo && data.signedInfo.locator && data.signature) {
          if (LOG > 3) console.log("Key verification...");
          var sigHex = DataUtils.toHex(data.signature.signature).toLowerCase();

          var wit = null;
          if (data.signature.witness != null)
              //SWT: deprecate support for Witness decoding and Merkle hash tree verification
              currentClosure.upcall(Closure.UPCALL_CONTENT_BAD, new UpcallInfo(this, pitEntry.interest, 0, data));

          var keylocator = data.signedInfo.locator;
          if (keylocator.type == KeyLocatorType.KEYNAME) {
            if (LOG > 3) console.log("KeyLocator contains KEYNAME");

            if (keylocator.keyName.contentName.match(data.name)) {
              if (LOG > 3) console.log("Content is key itself");

              var rsakey = new Key();
              rsakey.readDerPublicKey(data.content);
              var verified = data.verify(rsakey);
              var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;

              currentClosure.upcall(flag, new UpcallInfo(this, pitEntry.interest, 0, data));

              // SWT: We don't need to store key here since the same key will be stored again in the closure.
            }
            else {
              // Check local key store
              var keyEntry = Face.getKeyByName(keylocator.keyName);
              if (keyEntry) {
                // Key found, verify now
                if (LOG > 3) console.log("Local key cache hit");
                var rsakey = keyEntry.rsaKey;
                var verified = data.verify(rsakey);
                var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;

                // Raise callback
                currentClosure.upcall(flag, new UpcallInfo(this, pitEntry.interest, 0, data));
              }
              else {
                // Not found, fetch now
                if (LOG > 3) console.log("Fetch key according to keylocator");
                var nextClosure = new KeyFetchClosure(data, currentClosure, keylocator.keyName, sigHex, wit);
                // TODO: Use expressInterest with callbacks, not Closure.
                this.expressInterest(keylocator.keyName.contentName.getPrefix(4), nextClosure);
              }
            }
          }
          else if (keylocator.type == KeyLocatorType.KEY) {
            if (LOG > 3) console.log("Keylocator contains KEY");

            var rsakey = new Key();
            rsakey.readDerPublicKey(keylocator.publicKey);
            var verified = data.verify(rsakey);

            var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;
            // Raise callback
            currentClosure.upcall(Closure.UPCALL_CONTENT, new UpcallInfo(this, pitEntry.interest, 0, data));

            // Since KeyLocator does not contain key name for this key,
            // we have no way to store it as a key entry in KeyStore.
          }
          else {
            var cert = keylocator.certificate;
            console.log("KeyLocator contains CERT");
            console.log(cert);
            // TODO: verify certificate
          }
        }
      } else {
        for (var i = PIT.length - 1; i >= 0; --i) {
          if (PIT[i].interest.matchesName(data.name)) {
            if (LOG > 3) console.log("Sending Data to match interest " + PIT[i].interest.name.toUri() + "\n");
            PIT[i].face.transport.send(element);

            // Remove this entry.
            PIT.splice(i, 1);
          }
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


module.exports = ForwarderFace