var ndn = require('ndn-browser-shim');
var utils = require('./utils.js');
var io = {};

io.face = new ndn.Face({host: location.host.split(':')[0], port: 9696}) // placeholder for testing logic: should eventualy point to an internal daemon-style object

io.fetchObject = function(name, whenGotten, whenNotGotten) {
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
        var string = "";
        for (var i = 0; i < contentArray.length; i++) {
          string += contentArray[i];
        };
        var obj = JSON.parse(string);
        whenGotten(name, obj);
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
  interest.childSelector = 1;
  io.face.expressInterest(interest, onData, onTimeout);
};

io.publishObject = function(name, obj) {
  var ndnArray = utils.chunkArbitraryData(name, data)

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    transport.send(ndnArray[requestedSegment])
  };
  
  io.face.registerPrefix(name, onInterest)
  
  var command = name.append(new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]))
  io.face.expressInterest(command)
};

io.announce = function(name) {
  
};




module.exports = io;


