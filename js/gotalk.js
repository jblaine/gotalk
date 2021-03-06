(typeof window !== "undefined" ? window : this).gotalk = (function(global){
"use strict";

var modules = {"EventEmitter":{exports:{}},"buf":{exports:{}},"protocol":{exports:{}},"utf8":{exports:{}}}, __main = {exports:{}}, module;
var require = function(name) {
  return modules[name.replace(/^.\//, "")].exports;
};

(function(module) { var exports = module.exports;

function EventEmitter() {}
module.exports = EventEmitter;

EventEmitter.prototype.addListener = function (type, listener) {
  if (typeof listener !== 'function') throw TypeError('listener must be a function');
  if (!this.__events) {
    Object.defineProperty(this, '__events', {value:{}, enumerable:false, writable:true});
    this.__events[type] = [listener];
    return 1;
  }
  var listeners = this.__events[type];
  if (listeners === undefined) {
    this.__events[type] = [listener];
    return 1;
  }
  listeners.push(listener);
  return listeners.length;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function (type, listener) {
  var fired = false;
  function trigger_event_once() {
    this.removeListener(type, trigger_event_once);
    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }
  return this.on(type, trigger_event_once);
};

EventEmitter.prototype.removeListener = function (type, listener) {
  var p, listeners = this.__events ? this.__events[type] : undefined;
  if (listeners !== undefined) {
    while ((p = listeners.indexOf(listener)) !== -1) {
      delete listeners[p];
    }
    if (listeners.length === 0) {
      delete this.__events[type];
    }
    return listeners.length;
  }
  return 0;
};

EventEmitter.prototype.removeAllListeners = function (type) {
  if (this.__events) {
    if (type) {
      delete this.__events[type];
    } else {
      delete this.__events;
    }
  }
};

EventEmitter.prototype.listeners = function (type) {
  return type ? (this.__events ? this.__events[type] : undefined) : this.__events;
};

EventEmitter.prototype.emit = function (type) {
  var listeners = this.__events ? this.__events[type] : undefined;
  if (listeners === undefined) {
    return false;
  }
  var i = 0, L = listeners.length, args = Array.prototype.slice.call(arguments,1);
  for (; i !== L; ++i) {
    listeners[i].apply(this, args);
  }
  return true;
};

EventEmitter.mixin = function mixin(obj) {
  var proto = obj;
  while (proto) {
    if (proto.__proto__ === Object.prototype) {
      proto.__proto__ = EventEmitter.prototype;
      return obj;
    }
    proto = proto.__proto__;
  }
  return obj;
};


})(modules["EventEmitter"]);

(function(module) { var exports = module.exports;
"use strict";
var Buf;

if (typeof Uint8Array !== 'undefined') {

var utf8 = require('./utf8');

Uint8Array.prototype.toString = function (encoding, start, end) {
  // assumes buffer contains UTF8-encoded text
  return utf8.decode(this, start, end);
};

Uint8Array.prototype.slice = Uint8Array.prototype.subarray;

// Copies data from a region of this buffer to a region in the target buffer.
// copy(targetBuffer, [targetStart], [sourceStart], [sourceEnd]) -> Buf
Uint8Array.prototype.copy = function (targetBuffer, targetStart, sourceStart, sourceEnd) {
  var srcBuf = this;
  if (sourceStart) {
    srcBuf = srcBuf.slice(sourceStart, sourceEnd || srcBuf.length - sourceStart);
  }
  targetBuffer.set(srcBuf, targetStart || 0);
};


// Buf(Buf) -> Buf
// Buf(size int) -> Buf
// Buf(ArrayBuffer) -> Buf
Buf = function Buf(v) {
  return v instanceof Uint8Array ? v :
    new Uint8Array(
      v instanceof ArrayBuffer ? v :
      new ArrayBuffer(v)
    );
};

Buf.isBuf = function (v) {
  return v instanceof Uint8Array;
};

Buf.fromString = function (s, encoding) {
  return utf8.encode(s, Buf);
};

}

module.exports = Buf;

})(modules["buf"]);

(function(module) { var exports = module.exports;
"use strict";
var Buf = require('./buf');
var utf8 = require('./utf8');

// Version of this protocol
exports.Version = 0;

// Message types
var MsgTypeSingleReq     = exports.MsgTypeSingleReq =     'r'.charCodeAt(0),
    MsgTypeStreamReq     = exports.MsgTypeStreamReq =     's'.charCodeAt(0),
    MsgTypeStreamReqPart = exports.MsgTypeStreamReqPart = 'p'.charCodeAt(0),
    MsgTypeSingleRes     = exports.MsgTypeSingleRes =     'R'.charCodeAt(0),
    MsgTypeStreamRes     = exports.MsgTypeStreamRes =     'S'.charCodeAt(0),
    MsgTypeErrorRes      = exports.MsgTypeErrorRes =      'E'.charCodeAt(0),
    MsgTypeNotification  = exports.MsgTypeNotification =  'n'.charCodeAt(0);

// ==============================================================================================
// Binary (byte) protocol

function copyBufFixnum(b, start, n, digits) {
  var i = start || 0, y = 0, c, s = n.toString(16), z = digits - s.length;
  for (; z--;) { b[i++] = 48; }
  for (; !isNaN(c = s.charCodeAt(y++));) { b[i++] = c; }
}

function makeBufFixnum(n, digits) {
  var b = Buf(digits);
  copyBufFixnum(b, 0, n, digits);
  return b;
}

// Note: This code assumes parseInt accepts a Buf

exports.binary = {

  makeFixnum: makeBufFixnum,

  versionBuf: makeBufFixnum(exports.Version, 2),

  parseVersion: function (b) {
    return parseInt(b, 16);
  },

  // Parses a byte buffer containing a message (not including payload data.)
  // -> {t:string, id:Buf, name:string, size:string} | null
  parseMsg: function (b) {
    var t, id, name, namez, size = 0, z;

    t = b[0];
    z = 1;

    if (t !== MsgTypeNotification) {
      id = b.slice(z, z + 3);
      z += 3;
    }

    if (t == MsgTypeSingleReq || t == MsgTypeStreamReq || t == MsgTypeNotification) {
      namez = parseInt(b.slice(z, z + 3), 16);
      z += 3;
      name = b.slice(z, z+namez).toString();
      z += namez;
    }

    size = parseInt(b.slice(z, z + 8), 16);

    return {t:t, id:id, name:name, size:size};
  },

  // Create a text string representing a message (w/o any payload.)
  makeMsg: function (t, id, name, size) {
    var b, z = id ? 12 : 9, nameb;

    if (name && name.length !== 0) {
      nameb = Buf.fromString(name);
      z += 3 + nameb.length;
    }

    b = Buf(z);

    b[0] = t;
    z = 1;

    if (id && id.length !== 0) {
      if (typeof id === 'string') {
        b[1] = id.charCodeAt(0);
        b[2] = id.charCodeAt(1);
        b[3] = id.charCodeAt(2);
      } else {
        b[1] = id[0];
        b[2] = id[1];
        b[3] = id[2];
      }
      z += 3;
    }

    if (name && name.length !== 0) {
      nameb = Buf.fromString(name);
      copyBufFixnum(b, z, nameb.length, 3);
      z += 3;
      nameb.copy(b, z);
      z += nameb.length;
    }

    copyBufFixnum(b, z, size, 8);

    return b;
  }
};


// ==============================================================================================
// Text protocol

var zeroes = '00000000';

function makeStrFixnum(n, digits) {
  var s = n.toString(16);
  return zeroes.substr(0, digits - s.length) + s;
}

exports.text = {

  makeFixnum: makeStrFixnum,

  versionBuf: makeStrFixnum(exports.Version, 2),

  parseVersion: function (buf) {
    return parseInt(buf.substr(0,2), 16);
  },

  // Parses a text string containing a message (not including payload data.)
  // -> {t:string, id:string, name:string, size:string} | null
  parseMsg: function (s) {
    // "r001004echo00000005" => ('r', "001", "echo", 5)
    // "R00100000005"        => ('R', "001", "", 5)
    var t, id, name, size = 0, z;

    t = s.charCodeAt(0);
    z = 1;

    if (t !== MsgTypeNotification) {
      id = s.substr(z, 3);
      z += 3;
    }

    if (t == MsgTypeSingleReq || t == MsgTypeStreamReq || t == MsgTypeNotification) {
      name = s.substring(z + 3, s.length - 8);
    }

    size = parseInt(s.substr(s.length - 8), 16);

    return {t:t, id:id, name:name, size:size};
  },


  // Create a text string representing a message (w/o any payload.)
  makeMsg: function (t, id, name, size) {
    var b = String.fromCharCode(t);

    if (id && id.length !== 0) {
      b += id;
    }

    if (name && name.length !== 0) {
      b += makeStrFixnum(utf8.sizeOf(name), 3);
      b += name;
    }

    b += makeStrFixnum(size, 8);

    return b;
  }

}; // exports.text


})(modules["protocol"]);

(function(module) { var exports = module.exports;
"use strict";
//
// decode(Buf, [start], [end]) -> String
// encode(String, BufFactory) -> Buf
// sizeOf(String) -> int
//

// Returns the number of bytes needed to represent string `s` as UTF8
function sizeOf(s) {
  var z = 0, i = 0, c;
  for (; c = s.charCodeAt(i++); z += (c >> 11 ? 3 : c >> 7 ? 2 : 1) );
  return z;
}
exports.sizeOf = sizeOf;

function mask8(c) {
  return 0xff & c;
}

if (typeof TextDecoder !== 'undefined') {
  // ============================================================================================
  // Native TextDecoder/TextEncoder implementation
  var decoder = new TextDecoder('utf8');
  var encoder = new TextEncoder('utf8');

  exports.decode = function decode(b, start, end) {
    if (start || end) {
      if (!start) start = 0;
      b = b.slice(start, end || b.length - start);
    }
    return decoder.decode(b);
  };

  exports.encode = function encode(s, Buf) {
    return Buf(encoder.encode(s));
  };

} else {
  // ============================================================================================
  // JS implementation

  exports.decode = function decode(b, start, end) {
    var i = start || 0, e = (end || b.length - i), c, lead, s = '';
    for (i = 0; i < e; ) {
      c = b[i++];
      lead = mask8(c);
      if (lead < 0x80) {
        // single byte
      } else if ((lead >> 5) == 0x6) {
        c = ((c << 6) & 0x7ff) + (b[i++] & 0x3f);
      } else if ((lead >> 4) == 0xe) {
        c = ((c << 12) & 0xffff) + ((mask8(b[i++]) << 6) & 0xfff);
        c += b[i++] & 0x3f;
      } else if ((lead >> 3) == 0x1e) {
        c = ((c << 18) & 0x1fffff) + ((mask8(b[i++]) << 12) & 0x3ffff);
        c += (mask8(b[i++]) << 6) & 0xfff;
        c += b[i++] & 0x3f;
      }
      s += String.fromCharCode(c);
    }

    return s;
  };

  exports.encode = function encode(s, Buf) {
    var i = 0, e = s.length, c, j = 0, b = Buf(sizeOf(s));
    for (; i !== e;) {
      c = s.charCodeAt(i++);
      // TODO FIXME: charCodeAt returns UTF16-like codepoints, not UTF32 codepoints, meaning that
      // this code only works for BMP. However, current ES only supports BMP. Ultimately we should
      // dequeue a second UTF16 codepoint when c>BMP.
      if (c < 0x80) {
        b[j++] = c;
      } else if (c < 0x800) {
        b[j++] = (c >> 6)   | 0xc0;
        b[j++] = (c & 0x3f) | 0x80;
      } else if (c < 0x10000) {
        b[j++] = (c >> 12)          | 0xe0;
        b[j++] = ((c >> 6) & 0x3f)  | 0x80;
        b[j++] = (c & 0x3f)         | 0x80;
      } else {
        b[j++] = (c >> 18)          | 0xf0;
        b[j++] = ((c >> 12) & 0x3f) | 0x80;
        b[j++] = ((c >> 6) & 0x3f)  | 0x80;
        b[j++] = (c & 0x3f)         | 0x80;
      }
    }
    return b;
  };

}

// var s = '∆åßf'; // '日本語'
// var b = exports.encode(s);
// console.log('encode("'+s+'") =>', b);
// console.log('decode(',b,') =>', exports.decode(b));

})(modules["utf8"]);

(function(module, exports) {
"use strict";
var protocol = require('./protocol'),
      txt = protocol.text,
      bin = protocol.binary;
var Buf = require('./buf');
var utf8 = require('./utf8');
var EventEmitter = require('./EventEmitter');
var gotalk = exports;

gotalk.protocol = protocol;
gotalk.Buf = Buf;

function decodeJSON(v) {
  var value;
  try {
    value = JSON.parse(v);
  } catch (e) {
    // console.warn('failed to decode JSON "'+(typeof v === 'string' ? v : v.toString())+'":',e);
  }
  return value;
}


// ===============================================================================================

function Sock(handlers) { return Object.create(Sock.prototype, {
  // Public properties
  handlers:      {value:handlers, enumerable:true},
  protocol:      {value: Buf ? protocol.binary : protocol.text, enumerable:true, writable:true},

  // Internal
  ws:            {value:null, writable:true},

  // Used for performing requests
  nextOpID:      {value:0, writable:true},
  pendingRes:    {value:{}},
  hasPendingRes: {get:function(){ for (var k in this.pendingRes) { return true; } }},

  // True if end() has been called while there were outstanding responses
  pendingClose:  {value:false, writable:true}
}); }

Sock.prototype = EventEmitter.mixin(Sock.prototype);
exports.Sock = Sock;


// Adopt a web socket, which should be in an OPEN state
Sock.prototype.adoptWebSocket = function(ws) {
  var s = this;
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('web socket readyState != OPEN');
  }
  ws.binaryType = 'arraybuffer';
  s.ws = ws;
  ws.onclose = function(ev) {
    s.emit('close', ev.code !== 1000 ? new Error('web socket #'+ev.code) : undefined);
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    s.ws = null;
  };
  ws.onerror = function(ev) {
    s.emit('close', new Error('web socket error'));
  };
  ws.onmessage = function(ev) {
    if (!ws._bufferedMessages) ws._bufferedMessages = [];
    ws._bufferedMessages.push(ev.data);
  };
};


Sock.prototype.handshake = function () {
  this.ws.send(this.protocol.versionBuf);
};


Sock.prototype.end = function() {
  // Allow calling twice to "force close" even when there are pending responses
  var s = this;
  if (!s.pendingClose && s.hasPendingRes) {
    s.pendingClose = true;
  } else {
    if (s.hasPendingRes) {
      var err = new Error('socket is closing');
      for (var k in pendingRes) {
        pendingRes[k](err);
      }
    }
    if (s.ws) {
      s.ws.close();
    } else if (s.conn) {
      s.conn.end();
    }
    s.pendingClose = false;
  }
};


Sock.prototype.address = function() {
  var s = this;
  if (s.ws) {
    return s.ws.url;
  }
  return null;
};

// ===============================================================================================
// Reading messages from a connection

Sock.prototype.startReading = function () {
  var s = this, ws = s.ws, msg;  // msg = current message

  function readMsg(ev) {
    msg = typeof ev.data === 'string' ? txt.parseMsg(ev.data) : bin.parseMsg(Buf(ev.data));
    // console.log('readMsg:',
    //   typeof ev.data === 'string' ? ev.data : Buf(ev.data).toString(),
    //   'msg:', msg, 'ev:', ev);
    if (msg.size !== 0) {
      ws.onmessage = readMsgPayload;
    } else {
      s.handleMsg(msg);
      msg = null;
    }
  }

  function readMsgPayload(ev) {
    var b = ev.data;
    s.handleMsg(msg, typeof b === 'string' ? b : Buf(b));
    msg = null;
    ws.onmessage = readMsg;
  }

  function readVersion(ev) {
    var peerVersion = typeof ev.data === 'string' ? txt.parseVersion(ev.data) :
                                                    bin.parseVersion(Buf(ev.data));
    if (peerVersion !== protocol.Version) {
      ws.close(3000, 'gotalk protocol version mismatch');
    } else {
      ws.onmessage = readMsg;
    }
  }

  // We begin by sending our version and reading the remote side's version
  ws.onmessage = readVersion;

  // Any buffered messages?
  if (ws._bufferedMessages) {
    console.log("flush buffered messages")
    ws._bufferedMessages.forEach(function(data){ ws.onmessage({data:data}); });
    ws._bufferedMessages = null;
  }
};

// ===============================================================================================
// Handling of incoming messages

var msgHandlers = {};

Sock.prototype.handleMsg = function(msg, payload) {
  // console.log('handleMsg:', String.fromCharCode(msg.t), msg, 'payload:', payload);
  return msgHandlers[msg.t].call(this, msg, payload);
};

msgHandlers[protocol.MsgTypeSingleReq] = function (msg, payload) {
  var s = this, handler, result;
  handler = s.handlers.findRequestHandler(msg.name);

  result = function (outbuf) {
    s.sendMsg(protocol.MsgTypeSingleRes, msg.id, null, outbuf);
  };
  result.error = function (err) {
    var errstr = err.message || String(err);
    s.sendMsg(protocol.MsgTypeErrorRes, msg.id, null, errstr);
  };

  if (typeof handler !== 'function') {
    result.error('no such operation');
  } else {
    try {
      handler(payload, result, msg.name);
    } catch (err) {
      if (typeof console !== 'undefined') { console.error(err.stack || err); }
      result.error('internal error');
    }
  }
};

function handleRes(msg, payload) {
  var id = typeof msg.id === 'string' ? msg.id : msg.id.toString();
  var s = this, callback = s.pendingRes[id];
  delete s.pendingRes[id];
  if (typeof callback !== 'function') {
    return; // ignore message
  }
  if (s.pendingClose && !s.hasPendingRes) {
    s.end();
  }
  if (msg.t === protocol.MsgTypeSingleRes) {
    callback(null, payload);
  } else {
    callback(new Error(String(payload)), null);
  }
}

msgHandlers[protocol.MsgTypeSingleRes] = handleRes;
msgHandlers[protocol.MsgTypeErrorRes] = handleRes;

msgHandlers[protocol.MsgTypeNotification] = function (msg, payload) {
  var s = this, handler = s.handlers.findNotificationHandler(msg.name);
  if (handler) {
    handler(payload, msg.name);
  }
};

// ===============================================================================================
// Sending messages

Sock.prototype.sendMsg = function(t, id, name, payload) {
  if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
    throw new Error('socket is closed');
  }
  var payloadSize = (payload && typeof payload === 'string' && this.protocol === protocol.binary) ?
    utf8.sizeOf(payload) :
    payload ? payload.length :
    0;
  var s = this, buf = s.protocol.makeMsg(t, id, name, payloadSize);
  // console.log('sendMsg(',t,id,name,payload,'): protocol.makeMsg =>',
  //   typeof buf === 'string' ? buf : buf.toString());
  s.ws.send(buf);
  if (payloadSize !== 0) {
    s.ws.send(payload);
  }
};

var zeroes = '000';

// callback function(Error, outbuf)
Sock.prototype.bufferRequest = function(op, buf, callback) {
  var s = this, id = s.nextOpID++;
  if (s.nextOpID === 46656) {
    // limit for base36 within 3 digits (36^2=46656)
    s.nextOpID = 0;
  }
  id = id.toString(36);
  id = zeroes.substr(0,3 - id.length) + id;
  s.pendingRes[id] = callback;
  try {
    s.sendMsg(protocol.MsgTypeSingleReq, id, op, buf);
  } catch (err) {
    delete s.pendingRes[id];
    callback(err);
  }
}


Sock.prototype.bufferNotify = function(name, buf) {
  s.sendMsg(protocol.MsgTypeNotification, null, name, buf);
}


Sock.prototype.request = function(op, value, callback) {
  var buf;
  if (!callback) {
    // no value
    callback = value;
  } else {
    buf = JSON.stringify(value);
  }
  return this.bufferRequest(op, buf, function (err, buf) {
    var value = decodeJSON(buf);
    return callback(err, value);
  });
};


Sock.prototype.notify = function(op, value) {
  var buf = JSON.stringify(value);
  return this.bufferNotify(op, buf);
};


// ===============================================================================================

function Handlers() { return Object.create(Handlers.prototype, {
  reqHandlers:         {value:{}},
  reqFallbackHandler:  {value:null, writable:true},
  noteHandlers:        {value:{}},
  noteFallbackHandler: {value:null, writable:true}
}); }
exports.Handlers = Handlers;


Handlers.prototype.handleBufferRequest = function(op, handler) {
  if (!op) {
    this.reqFallbackHandler = handler;
  } else {
    this.reqHandlers[op] = handler;
  }
};

Handlers.prototype.handleRequest = function(op, handler) {
  return this.handleBufferRequest(op, function (buf, result, op) {
    var resultWrapper = function(value) {
      return result(JSON.stringify(value));
    };
    resultWrapper.error = result.error;
    var value = decodeJSON(buf);
    handler(value, resultWrapper, op);
  });
};

Handlers.prototype.handleBufferNotification = function(name, handler) {
  if (!name) {
    this.noteFallbackHandler = handler;
  } else {
    this.noteHandlers[name] = handler;
  }
};

Handlers.prototype.handleNotification = function(name, handler) {
  this.handleBufferNotification(name, function (buf, name) {
    handler(decodeJSON(buf), name);
  });
};

Handlers.prototype.findRequestHandler = function(op) {
  var handler = this.reqHandlers[op];
  return handler || this.reqFallbackHandler;
};

Handlers.prototype.findNotificationHandler = function(name) {
  var handler = this.noteHandlers[name];
  return handler || this.noteFallbackHandler;
};

// ===============================================================================================

function connectWebSocket(s, addr, callback) {
  var ws;
  try {
    ws = new WebSocket(addr);
    ws.binaryType = 'arraybuffer';
    ws.onclose = function (ev) {
      var err = new Error('connection failed');
      if (callback) callback(err);
      s.emit('close', err);
    };
    ws.onopen = function(ev) {
      ws.onerror = undefined;
      s.adoptWebSocket(ws);
      s.handshake();
      if (callback) callback(null, s);
      s.emit('open');
      s.startReading();
    };
    ws.onmessage = function(ev) {
      if (!ws._bufferedMessages) ws._bufferedMessages = [];
      ws._bufferedMessages.push(ev.data);
    };
  } catch (err) {
    if (callback) callback(err);
    s.emit('close', err);
  }
}


gotalk.connect = function connect(addr, callback) {
  var s = Sock(gotalk.defaultHandlers);
  if (addr.substr(0,5) === 'ws://') {
    connectWebSocket(s, addr, callback);
  } else {
    throw new Error('unsupported address');
  }
  return s;
};

gotalk.defaultHandlers = Handlers();

gotalk.handleBufferRequest = function(op, handler) {
  return gotalk.defaultHandlers.handleBufferRequest(op, handler);
};

gotalk.handle = function(op, handler) {
  return gotalk.defaultHandlers.handleRequest(op, handler);
};

gotalk.handleBufferNotification = function (name, handler) {
  return gotalk.defaultHandlers.handleBufferNotification(name, handler);
};

gotalk.handleNotification = function (name, handler) {
  return gotalk.defaultHandlers.handleNotification(name, handler);
};


})(__main, __main.exports);


var gotalk = __main.exports;
// ==================== Browser-additions ====================
//

return gotalk;
})();
