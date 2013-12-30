var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var io = {};

io.face = new ndn.Face({host: location.host.split(':')[0], port: 9696}) // placeholder for testing logic: should eventualy point to an internal daemon-style object



io.fetch = function(name, type, whenGotten, whenNotGotten) {
  var contentArray = [];
  var interest = new ndn.Interest(name);
  var recievedSegments = 0;
  
  var onData = function(interest, co) {
    var segmentNumber = utils.getSegmentInteger(co.name)
    var finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);

    contentArray[segmentNumber] = (ndn.DataUtils.toString(co.content));
    recievedSegments++;
    console.log(co, recievedSegments, finalSegmentNumber);
    if (utils.isFirstSegment(co.name, co) || (recievedSegments == finalSegmentNumber)) {
      if (recievedSegments == finalSegmentNumber) {
        console.log('got all segment', contentArray.length);
        if (type == "object") {
          assembleObject();
        } else if (type == "blob") {
          assembleBlob()
        };
      } else {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if (contentArray[i] == undefined) {
            var newName = co.name.getPrefix(-1).appendSegment(i)
            io.face.expressInterest(newName, onData, onTimeout)
          };
        };
      };
    } else {
      var newName = co.name.getPrefix(-1).appendSegment(segmentNumber - 1);
      io.face.expressInterest(newName, onData, onTimeout);
    };
  };
  var onTimeout = function(interest) {
    whenNotGotten(name);
  };
  
  var assembleBlob = function() {
    var mime = co.name.components[2].toEscapedString() + '/' + co.name.components[3].toEscapedString()
    var blob = new Blob(contentArray, {type: mime})
    whenGotten(name, blob)
  };
  
  var assembleObject = function() {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    whenGotten(name, obj);
  };
  
  interest.childSelector = 1;
  io.face.expressInterest(interest, onData, onTimeout);  
};

io.publishFile = function(name, file) {
  var chunkSize = 7000,
      fileSize = (file.size - 1),
      totalSegments = Math.ceil(file.size / chunkSize);
      
  function getSlice(file, segment, transport) {
    var fr = new FileReader,
        chunks = totalSegments,
        start = segment * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize,
        blob = file.slice(start,end);
    
    fr.onloadend = function(e) {      
      var buff = new ndn.ndnbuf(e.target.result),
          segmentName = (new ndn.Name(name)).appendSegment(segment),
          data = new ndn.Data(segmentName, new SignedInfo(), buff),
          encodedData;
        
        data.signedInfo.setFields();
        data.signedInfo.finalBlockID = initSegment(totalSegments - 1);
        data.sign();
        encodedData = data.encode();
        
        transport.send(encodedData);
    };
    console.log("about to read as array buffer")
    fr.readAsArrayBuffer(blob, (end - start))
    
  
  };
  
  function onInterest(prefix, interest, transport) {
    console.log("onInterest called.", interest);
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
    command = name.getPrefix(name.components.length - 1).append(new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(getSuffix(name, name.components.length - 1 ))
    io.face.expressInterest(command, onData, onTimeout);
    console.log("did this time correctly?", command.toUri())
  };
  io.face.registerPrefix(new ndn.Name(name.toUri()), onInterest)
  setTimeout(sendWriteCommand, 5000)

}; 

io.publishObject = function(name, obj) {
  var ndnArray = utils.chunkArbitraryData(name, data)

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    transport.send(ndnArray[requestedSegment])
  };
  
  io.face.registerPrefix(name, onInterest)
  
  var command = name.append(new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])) // %C1.R.sw
  io.face.expressInterest(command)
};

io.announce = function(name) {
  
};




module.exports = io;


