var utils = {}
var Data = require('ndn-browser-shim').Data
var Name = require('ndn-browser-shim').Name

utils.chunkArbitraryData = function(name, data, fresh) {
  var ndnArray = [];
  console.log(name)
  if (typeof data == 'object') {
    var string = JSON.stringify(data);
  } else if (typeof data == 'string') {
    var string = data;
  } else if (typeof data == 'file') {
    //console.log('no handlers yet for datatype: ', typeof data);
    return;
  };

  var stringArray = string.match(/.{1,4000}/g);
  var segmentNames = [];
  for (i = 0; i < stringArray.length; i++) {
    ndnArray[i] = stringArray[i]
    segmentNames[i] = new Name(name).appendSegment(i)
    co = new Data(segmentNames[i], new SignedInfo(), new Buffer(stringArray[i]));
    co.signedInfo.setFields()
    co.signedInfo.finalBlockID = initSegment(stringArray.length - 1)
    if (fresh != undefined) {
      co.signedInfo.freshnessSeconds = fresh
    }
    co.sign()
    ndnArray[i] = co.encode()
  };
  
  return ndnArray;

};

utils.initSegment = function(seg) {
    if (seg == null || seg == 0)
	  return (new Buffer('00', 'hex'));

    var segStr = seg.toString(16);

    if (segStr.length % 2 == 1)
	segStr = '0' + segStr;

    segStr = '00' + segStr;
    return (new Buffer(segStr, 'hex'));
};

utils.getAllPrefixes = function(name) {
  var uriArray = [];
  for (i = 0 ; i < name.components.length + 1 ; i++) {
    var uri = name.getPrefix(i).toUri()
    uriArray.push(uri);
  };
  return uriArray;
};

utils.isFirstSegment = function(name) {
    return name.components != null && name.components.length >= 1 &&
        name.components[name.components.length - 1].value.length == 1 &&
        name.components[name.components.length - 1].value[0] == 0;
};

utils.isLastSegment = function(name, co) {
   
    return DataUtils.arraysEqual(name.components[name.components.length - 1].value, co.signedInfo.finalBlockID);
}

utils.normalizeUri = function(name) {
  //console.log(name)
  if (!endsWithSegmentNumber(name)) {
    normalizedName = name;
    requestedSegment = 0
  } else if (!isFirstSegment(name)) {
    normalizedName = name.getPrefix(name.components.length - 1);
    requestedSegment = DataUtils.bigEndianToUnsignedInt(name.components[name.components.length - 1].value);
  } else {
    normalizedName = name.getPrefix(name.components.length - 1) ;
    requestedSegment = 0;
  };
  var returns = [normalizedName, requestedSegment];
  return returns;
};

utils.getSegmentInteger = function(name) {
  if (name.components != null && name.components.length >= 1 &&
  name.components[name.components.length - 1].value.length >= 1 &&
  name.components[name.components.length - 1].value[0] == 0) {
    return DataUtils.bigEndianToUnsignedInt(name.components[name.components.length - 1].value)
  } else {
    return 0;
  }
};

utils.normalizeNameToObjectStore = function(name) {
  var throwaway = getNameWithoutCommandMarker(name); 
  
  if (!endsWithSegmentNumber(throwaway)) {
    return throwaway.appendSegment(0).toUri();
  } else if (!isFirstSegment(throwaway)) {
    return throwaway.getPrefix(name.components.length - 1).appendSegment(0).toUri();
  } else {
    return throwaway.toUri();
  };
};

utils.endsWithSegmentNumber = function(name) {
    return name.components != null && name.components.length >= 1 &&
        name.components[name.components.length - 1].value.length >= 1 &&
        name.components[name.components.length - 1].value[0] == 0;
}

utils.nameHasCommandMarker = function(name) {
  for (var i = name.size() - 1; i >= 0; --i) {
    var component = name.components[i].getValue();
    if (component.length <= 0)
      continue;
        
    if (component[0] == 0xC1) {
      return true
    };
  }
    
  return false;
};

utils.getCommandMarker = function(name) {
  console.log(name)
  for (var i = name.size() - 1; i >= 0; --i) {
    var component = name.components[i].getValue();
    if (component.length <= 0)
      continue;
        
    if (component[0] == 0xC1 && component[2] != 0x4E) {
      return name.components[i].toEscapedString()
    };
  }
};

utils.getNameWithoutCommandMarker = function(name) {
  var strippedName = new Name('');
  
  for (var i = 0 ; i < name.size(); i++) {
    var component = name.components[i].getValue();
    if (component.length <= 0)
      continue;
        
    if (component[0] != 0xC1) {
      strippedName.append(name.components[i]);
    };
  };
  return strippedName;
};


utils.getSuffix = function(name, p) {
    return new Name(name.components.slice(p));
};

utils.appendVersion = function(name, date) {
    if (date) {
      if (date instanceof Date) {
        var d = date.getTime
        
      } else
        var d = date;
    } else {
      var d = new Date().getTime;
    };
    
    var time = d.toString(16);          
    if (time.length % 2 == 1) {
	    time = '0' + time;
    };
    time = 'fd' + time;
    var binTime = new Buffer(time, 'hex');
    console.log(binTime)
    return name.append(binTime);
};

utils.timeToVersion = function(date) {
  if (date instanceof Date) {
    var d = date.getTime
  } else {
    var d = date;
  };
  var time = d.toString(16);          
  if (time.length % 2 == 1) {
    time = '0' + time;
  };
  time = 'fd' + time;
  var binTime = new Buffer(time, 'hex');
  return (new Name.Component(binTime).toEscapedString())
  
};

utils.versionToTime = function(version) {
  time = 0
  array = DataUtils.toNumbers(DataUtils.toHex(version))
  console.log(array)
  for (i = 1; i < array.length ; i++) {
    time = time + (array[i] * Math.pow(2, (7 - i)));
    console.log(time)
  };
  return time
};

utils.ndnPutFile = function(name, file, destination, callback) {
  var chunkSize = 7000,
      fileSize = (file.size - 1),
      totalSegments = Math.ceil(file.size / chunkSize);
      
  function getSlice(file, segment, transport) {
    var fr = new FileReader,
        chunkSize = 7000,
        chunks = Math.ceil(file.size / chunkSize),
        start = segment * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize,
        blob = file.slice(start,end);
    
    fr.onloadend = function(e) {      
      var buff = new Buffer(e.target.result),
          segmentName = (new Name(name)).appendSegment(segment),
          data = new Data(segmentName, new SignedInfo(), buff),
          encodedData;
        
        data.signedInfo.setFields();
        data.signedInfo.finalBlockID = initSegment(totalSegments - 1);
        data.sign();
        encodedData = data.encode();
        console.log(data, transport, new Date())
        transport.send(encodedData);
    };
    console.log("about to read as array buffer")
    fr.readAsArrayBuffer(blob, (end - start))
    
  
  };
  
  function onInterest(prefix, interest, transport) {
    console.log("onInterest called.", interest);
    if (!endsWithSegmentNumber(interest.name)) {
      interest.name.appendSegment(0);
    };
    var segment = DataUtils.bigEndianToUnsignedInt(interest.name.components[interest.name.components.length - 1].value);
        
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
    command = name.getPrefix(name.components.length - 1).append(commandMarkers["%C1.R.sw"].component).append(getSuffix(name, name.components.length - 1 ))
    destination.expressInterest(command, onData, onTimeout);
    console.log("did this time correctly?", command.toUri())
  };
  console.log(name, destination)
  destination.registerPrefix(new Name(name.toUri()), onInterest)
  setTimeout(sendWriteCommand, 5000)

};

utils.setNonce = function(interest) {
  var bytes = [0xc1, 0x2e, 0x4e, 0x00];
  for (var n = 8; n > 0; n--) {
	  bytes.push(Math.floor(Math.random() * 256));
	  console.log(bytes)
  }
  var buf = new Uint8Array(bytes)
  interest.name.append(buf)
  interest.nonce = buf;
}

module.exports = utils;
