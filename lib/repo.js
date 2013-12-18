//Global Namespacing for the ndnr

function indexedDBOk() {
  return "indexedDB" in window;
};

var ndn = require('ndn-browser-shim');


/**
 * Database constructor
 * @prefix: application prefix (used as database name) STRING (may contain globally routable prefix)
 */
var ndnr = function (prefix, faceParam, callback) {

  if(!indexedDBOk) return console.log('no indexedDb');  // No IndexedDB support
  var prefixUri = (new ndn.Name(prefix)).toUri(),           // normalize 
      initDb = {};           
  
  this.prefix = prefixUri
  
  
  if (faceParam) {
    this.interestHandler.face = new ndn.Face(faceParam)
  } else {
    this.interestHandler.face = new ndn.Face({host: location.host.split(':')[0], port: 9696})
  };
  
  this.interestHandler.face.registerPrefix(new ndn.Name(prefix), this.interestHandler);
  
  initDb.onupgradeneeded = function(e) {
    console.log("Version 1 of database ", prefixUri, "created");
    if (callback != undefined) {
      callback()
    };
  };
  console.log(ndn)
  useIndexedDB(prefixUri, initDb);

};

ndnr.prototype.get = function (name, callback) {
  var objectStoreName = normalizeNameToObjectStore(name)
  console.log(objectStoreName)
  var getRequest = {},
      getResult = []
  
  getRequest.onsuccess = function (e) {
    if (e.target.result.objectStoreNames.contains(objectStoreName)) {
      var action = e.target.result.transaction([objectStoreName]).objectStore(objectStoreName).openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        console.log(e.target.result)
        if (cursor) {
          getResult.push(cursor.value);
          cursor.continue();
        }
        else {
          console.log("No more entries!");
          callback(getResult)
        }
      };
      
    };
  };
  
  useIndexedDB(this.prefix, getRequest);
};

ndnr.prototype.put = function (name, data, callback) {
  //ALMOST WORKING
  var hook = this
  console.log(this);
  
  if (data instanceof File) { // called with the Filereader API
    return ndnPutFile(name, data, this);
  } else if (data instanceof Array) { // Assume we're passing a preformatted Array
    var ndnArray = data;
    console.log(data)
  } else { // anything else
    //console.log(data)
    var ndnArray = chunkArbitraryData(new ndn.Name(this.prefix).append(name), data);
  };
  
  var objectStoreName = normalizeNameToObjectStore(name)
  console.log(objectStoreName)
  var putRequest = {};
  var dbName = this.prefix;
  this.put.data = ndnArray;
  putRequest.onupgradeneeded = function (e) {
    e.target.result.createObjectStore(objectStoreName).onsuccess = function(e) {
      console.log(e.target.result)
    };
  };
  putRequest.onsuccess = function (e) {
    if (e.target.result.objectStoreNames.contains(objectStoreName)) {
      for (i = 0; i < ndnArray.length; i++) {
        console.log('adding data', i, "of ", ndnArray.length)
        var action = e.target.result.transaction([objectStoreName], "readwrite").objectStore(objectStoreName).put(ndnArray[i], i);
        if (i + 1 == ndnArray.length) {
          action.onsuccess = function (e) {
            buildObjectStoreTree(new ndn.Name(dbName), objectStoreName);
            if (callback != undefined) {
              callback(name, hook.interestHandler.face);
            };
            
          };
        };
      };
    } else {
      console.log('need upgrade')
      useIndexedDB(dbName, putRequest, e.target.result.version + 1)
      
    };
  }; 
  useIndexedDB(dbName, putRequest)
};



// vvvv THIS IS THE GOOD STUFF vvvv Plus NDN-helpers. NEED to Refactor and streamline useIndexedDB a little but it seems to be working good

ndnr.prototype.interestHandler = function(prefix, interest, transport) {
  console.log("onInterest called for incoming interest: ", interest.toUri());
  interest.face = this.onInterest.face  
  if (nameHasCommandMarker(interest.name)) {
    console.log('incoming interest has command marker ', getCommandMarker(interest.name));
    executeCommand(prefix, interest, transport); 
    return;
  } else {
    console.log('attempting to fulfill interest');
    fulfillInterest(prefix, interest, transport);
  };
};


//TODO: Flesh out this subroutine, it is the keystone of the library, handle interest selectors, etc
function fulfillInterest(prefix, interest, transport) {
  var localName = getSuffix(interest.name, prefix.components.length )
      objectStoreName = normalizeNameToObjectStore(localName),
      dbName = prefix.toUri(),
      getContent = {},
      suffixIndex = 0,
      query = localName.toUri();
      if ((interest.childSelector == 0) || (interest.childSelector == undefined)) {
        cursorOrder = "next";
      } else {
        cursorOrder = "prev";
      };
      
  if (endsWithSegmentNumber(interest.name)) {
    // A specific segment of a data object is being requested, so don't bother querying for loose matches, just return or drop
    requestedSegment = getSegmentInteger(interest.name)
    getContent.onsuccess = function(e) {
      getContent.result = e.target.result;
      if (e.target.result.objectStoreNames.contains(objectStoreName)) {
        e.target.result.transaction(objectStoreName).objectStore(objectStoreName).get(requestedSegment).onsuccess = function(e) {
          transport.send(e.target.result)
        };
      } else {
        console.log("no data for ", interest)
      };
    };
  } else {
    // A general interest. Interpret according to selectors and return the first segment of the best matching dataset
    getContent.onsuccess = function(e) {
      db = getContent.result = e.target.result
      function crawl(q) {
        console.log(q)
        if (db.objectStoreNames.contains(q)) {
          var store = db.transaction(q).objectStore(q),
              index = store.index('escapedString');
          console.log('objectStoreNames contains ', q)
          if ((interest.maxSuffixComponents == null) || (suffixIndex <= interest.maxSuffixComponents)) {
            console.log('Suffix count within constraints')
            index.openCursor(null, cursorOrder).onsuccess = function(e) {
              var cursor = e.target.result;
              if (cursor) {
                if ((interest.exclude == null) || (!interest.exclude.matches(new ndn.Name.Component(cursor.value.escapedString)))) {
                  console.log(cursor.value.escapedString)
                  if (cursor.value.escapedString == "%00") {
                    console.log('got to data')
                    if ((interest.minSuffixComponents == null) || (suffixIndex >= interest.minSuffixComponents )) {
                      console.log('more than minimum suffix comps')
                      query += '/' + cursor.value.escapedString
                      console.log(query)
                     
                      store = db.transaction(query).objectStore(query).get(0).onsuccess = function(e) {
                        transport.send(e.target.result)
                      };
                    } else {
                      cursor.continue()
                    };
                  } else {
                    suffixIndex++
                    if (query != '/') {
                      query += '/' + cursor.value.escapedString
                    } else {
                      query += cursor.value.escapedString
                    }
                    
                    crawl(query)
                  };
                } else {
                  cursor.continue()
                };
              } else {
                console.log('no entries ')
              };
            };
          } else {
            console.log('too many suffix components')
          };
        };
      };
      crawl(query)
    };
  };
  useIndexedDB(dbName, getContent);
};


function recursiveSegmentRequest(face, prefix, objectStoreName) {
  var dbName = prefix.toUri();
      firstSegmentName = (new ndn.Name(prefix)).append(new ndn.Name(objectStoreName));
      insertSegment = {};
      
      insertSegment.onsuccess = function(e) {
        var currentSegment = getSegmentInteger(insertSegment.contentObject.name),
            finalSegment = DataUtils.bigEndianToUnsignedInt(insertSegment.contentObject.signedInfo.finalBlockID);
            
        e.target.result.transaction(objectStoreName, "readwrite").objectStore(objectStoreName).put(insertSegment.contentObject.encode(), currentSegment).onsuccess = function(e) {
          console.log("retrieved and stored segment ", currentSegment, " of ", finalSegment  ," into objectStore ", objectStoreName);
          if (currentSegment < finalSegment) {
            var newName = firstSegmentName.getPrefix(firstSegmentName.components.length - 1).appendSegment(currentSegment + 1);
            face.expressInterest(newName, onData, onTimeout);
          };
        };
      };
  
  function onData(interest, contentObject) {
    console.log("onData called in recursiveSegmentRequest: ", contentObject)
    insertSegment.contentObject = contentObject;
    useIndexedDB(dbName, insertSegment)
  };
  
  function onTimeout(interest) {
    console.log("Interest Timed out in recursiveSegmentRequest: ", interest, new Date());
  };
  
  face.expressInterest(firstSegmentName, onData, onTimeout);
};

function buildObjectStoreTree(prefix, objectStoreName, onFinished, arg) {
  var dbName = prefix.toUri(),
      properName = new ndn.Name(objectStoreName),
      uriArray = getAllPrefixes(properName),
      toCreate = [],
      evaluate = {},
      growTree = {},
      version;
 
      evaluate.onsuccess = function(e) {
        for (i = 0 ; i < uriArray.length; i++) {
          if (!e.target.result.objectStoreNames.contains(uriArray[i])) {
            toCreate.push(uriArray[i]);
          };
        };
        
        if (toCreate.length > 0) {
          console.log(toCreate.length, " objectStores need to be created. Attempting to upgrade database");
          version = e.target.result.version + 1;
          useIndexedDB(dbName, growTree, version);
        } else {
          console.log(toCreate.length, " objectStores need to be created. calling onFinished(arg) if applicable");
          if (onFinished == recursiveSegmentRequest) {
            if (arg) {
              onFinished(arg, prefix, objectStoreName)
            } else {
              onFinished()
            };
          }
        };
        
      };
      
      
      growTree.onupgradeneeded = function(e) {
        console.log("growTree.onupgradeneeded fired: creating ", toCreate.length, " new objectStores");
        for(i = 0; i < toCreate.length; i++) {
          if (toCreate[i] == objectStoreName) {
            e.target.result.createObjectStore(toCreate[i])
            
          } else {
            
            var store = e.target.result.createObjectStore(toCreate[i], {keyPath: "escapedString"});
            store.createIndex('escapedString', 'escapedString', {unique: true})
                      
          };
        };
      };
      
      growTree.onsuccess = function(e) {
        console.log("database successfully upgraded to version ", e.target.result.version);
        var transaction = e.target.result.transaction(uriArray, "readwrite")
        transaction.oncomplete = function(e) {
          console.log("New Tree successfully populated, now calling onFinished(arg) if applicable")
          if (onFinished == recursiveSegmentRequest) {
            if (arg) {
              onFinished(arg, prefix, objectStoreName)
            } else {
              onFinished()
            };
          };
        };
        
        uriArray.pop();
        
        (function populate(i) {
          var entry = {};
          entry.component = properName.components[i];
          console.log(entry)
          entry.escapedString = entry.component.toEscapedString();
          transaction.objectStore(uriArray[i]).put(entry);
          i++;
          if (i < uriArray.length) {
            populate(i);
          };
        })(0)
      };
      
  useIndexedDB(dbName, evaluate);
};

function executeCommand(prefix, interest, transport) {
  var command = getCommandMarker(interest.name).split('%7E')[0];
  
  if (command in ndnr.commandMarkers) {
    console.log("executing recognized command ", command);
    ndnr.commandMarkers[command](prefix, interest, transport); 
  } else {
    console.log("ignoring unrecognized command ", command);
  };
};

function useIndexedDB(dbName, action, version) {
  var request;
  
  if (version) {
    request = indexedDB.open(dbName, version);
  } else {
    request = indexedDB.open(dbName);
  };
  
  if (action.onupgradeneeded) {
    request.onupgradeneeded = action.onupgradeneeded;
  } else {
    request.onupgradeneeded = function(e) {
      console.log('upgrading database to version ', e.target.result.version)
    };
  };
  if (action.onsuccess) {
    request.onsuccess = function(e) {
      request.result.onversionchange = function(e){
        console.log('version change requested, closing db');
        request.result.close();
      }
      action.onsuccess(e);
    };
  } else {
    request.onsuccess = function(e) { 
      request.result.onversionchange = function(e){
        console.log('version change requested, closing db');
        request.result.close();
      }
      console.log("database ", dbName, " is open at version ", e.target.result.version)
    };
  };
  if (action.onerror) {
    request.onerror = action.onerror;
  } else {
    request.onerror = function(e) {
      console.log('error: ', e);
    };
  };
  if (action.onclose) {
    request.onclose = action.onclose;
  } else {
    request.onclose = function(e) {
      console.log("database ", dbName, " is closed at version ", e.target.result.version)
    };
  };
  if (action.onblocked) {
    request.onblocked = action.onblocked;
  } else {
    request.onblocked = function(e) {
      console.log("request blocked: ", e);
    };
  };
};

ndnr.commandMarkers = {}


ndnr.commandMarkers["%C1.R.sw"] = function startWrite( prefix, interest) {
  var localName = getNameWithoutCommandMarker(getSuffix(interest.name, prefix.components.length)),
      objectStoreName = normalizeNameToObjectStore(localName);
      
  
  console.log("Building objectStore Tree for ", objectStoreName, this);
  
  buildObjectStoreTree(prefix, objectStoreName, recursiveSegmentRequest, interest.face);
};

ndnr.commandMarkers["%C1.R.sw"].component = new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]);

module.exports = ndnr
