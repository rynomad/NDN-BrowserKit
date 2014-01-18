var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var local = require('./ndn-ports.js')
var io = {};




io.fetch = function(name, type, whenGotten, whenNotGotten) {

  var interestsInFlight = 0;
  var windowSize = 4;
  var t0 = new Date().getTime()







  var contentArray = [];

  var recievedSegments = 0;

  var onData = function(interest, co) {
    interestsInFlight--;

    var segmentNumber = utils.getSegmentInteger(co.name)
    var finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);
    //console.log(segmentNumber, co.name.toUri());
    if (contentArray[segmentNumber] == undefined) {
      contentArray[segmentNumber] = (ndn.DataUtils.toString(co.content));
      recievedSegments++;
    }

    //console.log(recievedSegments, finalSegmentNumber, interestsInFlight);
    if (recievedSegments == finalSegmentNumber) {
        console.log('got all segment', contentArray.length);
        if (type == "object") {
          assembleObject(interest.name);
        } else if (type == "blob") {
          assembleBlob(interest.name)
        };
        var t1 = new Date().getTime()
        console.log(t1 - t0)
    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if (contentArray[i] == undefined) {
            var newName = co.name.getPrefix(-1).appendSegment(i)
            var newInterest = new ndn.Interest(newName)
            //console.log(newName.toUri())
            utils.setNonce(newInterest)
            io.face.expressInterest(newInterest, onData, onTimeout)
            interestsInFlight++
            if (interestsInFlight == windowSize) {
              //stop iterating
              i = finalSegmentNumber;
            };
          };
        };
      };
    };
  };
  var onTimeout = function(interest) {
    if (whenNotGotten) whenNotGotten(name);
  };

  var assembleBlob = function(name) {
    var mime = name.components[2].toEscapedString() + '/' + name.components[3].toEscapedString()
    var blob = new Blob(contentArray, {type: mime})
    whenGotten(name, blob)
  };

  var assembleObject = function(name) {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    whenGotten(name, obj);
  };

  for (interestsInFlight; interestsInFlight < windowSize; interestsInFlight++){
    //console.log(interestsInFlight)
    var segName = new ndn.Name(name)
    segName.appendSegment(interestsInFlight)
    var interest = new ndn.Interest(segName);
    utils.setNonce(interest)
    //console.log(interest.name.toUri())

    io.face.expressInterest(interest, onData, onTimeout);
  }

};

io.publishFile = function(name, file) {
  var chunkSize = 7000,
      fileSize = (file.size - 1),
      totalSegments = Math.ceil(file.size / chunkSize);

  function getSlice(file, segment, transport) {
    var fr = new FileReader(),
        chunks = totalSegments,
        start = segment * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize,
        blob = file.slice(start,end);

    fr.onloadend = function(e) {
      var buff = new ndn.ndnbuf(e.target.result),
          segmentName = (new ndn.Name(name)).appendSegment(segment),
          data = new ndn.Data(segmentName, new ndn.SignedInfo(), buff),
          encodedData;

        data.signedInfo.setFields();
        data.signedInfo.finalBlockID = utils.initSegment(totalSegments - 1);
        data.sign();
        encodedData = data.encode();

        transport.send(encodedData);
    };
    //console.log("about to read as array buffer")
    fr.readAsArrayBuffer(blob, (end - start))


  };

  function onInterest(prefix, interest, transport) {
    //console.log("onInterest called.", interest);
    if (!utils.endsWithSegmentNumber(interest.name)) {
      interest.name.appendSegment(0);
    };
    var segment = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.components[interest.name.components.length - 1].value);

    getSlice(this.onInterest.file, segment, transport)

  };
  onInterest.file = file;

  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    command = name.getPrefix(name.components.length - 1).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(utils.getSuffix(name, name.components.length - 1 ))
    var interest = new ndn.Interest(command)
    utils.setNonce(interest)
    io.face.expressInterest(interest, onData, onTimeout);
    console.log("did this time correctly?", command.toUri())
  };
  var prefix = name

  var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
  ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
  setTimeout(sendWriteCommand, 5000)

};

io.publishObject = function(name, obj) {
  var ndnArray = utils.chunkArbitraryData(name, data)

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    transport.send(ndnArray[requestedSegment])
  };
  var prefix = name
  var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
  ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));

  var command = name.append(new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])) // %C1.R.sw
  var interest = new ndn.Interest(command)
  utils.setNonce(interest)
  io.face.expressInterest(interest)
};


io.face = new ndn.Face({host: 1, port: 2, getTransport: function(){return new local.transport}})

function cb() {
  var keyName = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
  var inst = new ndn.Interest(keyName)

}
var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};


io.face.transport.connect(io.face, cb)

io.test = new ndn.Face({host: 10, port: 11, getTransport: function(){return new local.transport}})

module.exports = io;


