/*
+-----------------------------------------------------------------------+
| Permission is hereby granted, free of charge, to any person obtaining |
| a copy of this software and associated documentation files (the       |
| "Software"), to deal in the Software without restriction, including   |
| without limitation the rights to use, copy, modify, merge, publish,   |
| distribute, sublicense, and/or sell copies of the Software, and to    |
| permit persons to whom the Software is furnished to do so, subject to |
| the following conditions:                                             |
|                                                                       |
| The above copyright notice and this permission notice shall be        |
| included in all copies or substantial portions of the Software.       |
|                                                                       |
| THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,       |
| EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF    |
| MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.|
| IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY  |
| CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,  |
| TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE     |
| SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                |
+-----------------------------------------------------------------------+
| (C) 2012, Anant Narayanan <anant@kix.in>                              |
+-----------------------------------------------------------------------+
*/

var RTC = {};
RTC.Errors = {
  "GUM_UNSUPPORTED": "This browser does not support getUserMedia",
  "WEBRTC_UNSUPPORTED": "This browser does not support WebRTC",
  "INVALID_OUTPUT": "Invalid media element or connection for output",
  "INVALID_CONNECTION": "This connection has not been correctly initialized",
  "CALLBACK_MISSING": "The required callback has not been provided",
  "INVALID_OFFER": "The provided offer is invalid",
  "INVALID_ANSWER": "The provided answer is invalid",
  "INVALID_STREAM": "The provided stream is invalid",
  "INVALID_CALLBACK": "The provided callback is invalid",
  "OFFER_ACCEPTED": "An offer has already been accepted",
  "ANSWER_ACCEPTED": "An answer has already been accepted",
  "OFFER_CREATED": "An offer has already been created",
  "ANSWER_CREATED": "An answer has already been created",
  "OFFER_NOT_CREATED": "No offer has been created, cannot accept answer",
  "STREAM_RUNNING": "Stream is already running",
  "STREAM_NOT_RUNNING": "Stream is alread stopped",
  getError: function(name) {
    if (!RTC.Errors[name]) return;
    var err = new Error(RTC.Errors[name]);
    err.name = name;
    return err;
  }
};

(function() {

navigator.getUserMedia_ = navigator.getUserMedia ||         // Opera
                          navigator.mozGetUserMedia ||      // Firefox
                          navigator.webkitGetUserMedia ||   // Chrome
                          function(options, success, error) {
                            if (!error) {
                              error = defaultOnError;
                            }
                            error(RTC.Errors.getError("GUM_UNSUPPORTED"));
                          }

// I am loathe to sniff the UA, hopefully we can get rid of this soon.
var browser = "Other";
var browsers = ["Opera", "Chrome", "Firefox"];
browsers.forEach(function(b) {
  if (navigator.userAgent.indexOf(b) != -1) {
    browser = b;
  }
});

RTC.getVideoStream = function(withAudio, options, onError) {
  return makeStream(options, {audio: withAudio || false, video: true}, onError);
};
RTC.getAudioStream = function(options, onError) {
  return makeStream(options, {audio: true, video: false}, onError);
};
RTC.createConnection = function(onError) {
  if (!onError) {
    onError = defaultOnError;
  }
  return new RTC.Connection(onError);
};

RTC.Stream = function(options, onError, stream) {
  this._queue = [];
  this._pcQueue = [];
  this._outputs = [];
  this._running = false;

  this._stream = stream;
  this._error = onError;
  this._options = options;
};
RTC.Stream.prototype = {
  addOutput: function(obj) {
    if (obj.addInput && obj._streamQueue) {
      this._addConnectionOutput(obj);
    } else {
      this._addElementOutput(obj);
    }
  },

  start: function(onSuccess) {
    if (this._stream) {
      this._error(RTC.Errors.getError("STREAM_RUNNING"));
      return;
    }

    var self = this;
    navigator.getUserMedia_(this._options, function(stream) {
      self._stream = stream;
      while (self._queue.length) {
        self._outputStream(self._queue.shift());
      }
      while (self._pcQueue.length) {
        var conn = self._pcQueue.shift();
        conn.addInput(self);
      }
      if (onSuccess) {
        onSuccess(stream);
      }
    }, this._error);
  },

  stop: function() {
    if (!this._stream) {
      this._error(RTC.Errors.getError("STREAM_NOT_RUNNING"));
      return;
    }

    if (typeof this._stream.stop == "function") {
      this._stream.stop();
    } else {
      while (this._outputs.length) {
        this._outputs.shift().pause();
      }
    }
    this._stream = null;
  },

  _outputStream: function(element) {
    switch (browser) {
      case "Opera":
        element.src = this._stream;
        this._outputs.push(element);
        break;
      case "Chrome":
        var url = URL.createObjectURL(this._stream);
        element.src = url;
        element.play();
        this._outputs.push(element);
        break;
      case "Firefox":
        element.mozSrcObject = this._stream;
        element.play();
        this._outputs.push(element);
        break;
      default:
        this._error(RTC.Errors.getError("WEBRTC_UNSUPPORTED"));
        return;
    }
  },

  _addElementOutput: function(element) {
    var ele = element;
    if (ele.jquery) {
      if (ele.length != 1) {
        this._error(RTC.Errors.getError("INVALID_OUTPUT"));
        return;
      }
      ele = element.get(0);
    }
    if (this._options.video && ele.nodeName != "VIDEO") {
      this._error(RTC.Errors.getError("INVALID_OUTPUT"));
      return;
    }
    if (this._options.audio && !this._options.video && ele.nodeName != "AUDIO") {
      this._error(RTC.Errors.getError("INVALID_OUTPUT"));
      return;
    }

    if (!this._stream) {
      this._queue.push(element);
    } else {
      this._outputStream(element);
    }
  },

  _addConnectionOutput: function(conn) {
    if (!this._stream) {
      this._pcQueue.push(conn);
      conn._streamQueue.push(this);
    } else {
      conn.addInput(this);
    }
  }
};

RTC.Connection = function(onError, pc) {
  this._pc = pc;
  this._offer = null;
  this._answer = null;
  this._error = onError;

  this._streamQueue = [];
  this._pendingRemoteStreams = [];

  if (!this._pc) {
    switch (browser) {
      case "Chrome":
        this._pc = new webkitRTCPeerConnection(null);
        break;
      case "Firefox":
        this._pc = new mozRTCPeerConnection();
        break;
      default:
        this._error(RTC.Errors.getError("WEBRTC_UNSUPPORTED"));
        return;
    }
  }

  this._pc.onaddstream = this._onRemoteStreamAdded;
};
RTC.Connection.prototype = {
  addInput: function(stream) {
    if (typeof stream != "object" || !stream._stream) {
      alert(stream);
      this._error(RTC.Errors.getError("INVALID_STREAM"));
      return;
    }
    this._pc.addStream(stream._stream);
  },

  makeOffer: function(onSuccess) {
    if (!onSuccess || typeof onSuccess != "function") {
      this._error(RTC.Errors.getError("CALLBACK_MISSING"));
      return;
    }
    if (this._offer) {
      this._error(RTC.Errors.getError("OFFER_CREATED"));
      return;
    }
    if (this._streamQueue.length) {
      this._processQueue(onSuccess);
    } else {
      this._makeOffer(onSuccess);
    }
  },

  acceptOffer: function(offer, onSuccess) {
    if (!onSuccess || typeof onSuccess != "function") {
      this._error(RTC.Errors.getError("CALLBACK_MISSING"));
      return;
    }
    if (this._offer) {
      this._error(RTC.Errors.getError("OFFER_ACCEPTED"));
      return;
    }
    if (this._answer) {
      this._error(RTC.Errors.getError("ANSWER_CREATED"));
      return;
    }

    var finalOffer = this._validateDescription(offer, "offer");
    if (!finalOffer) {
      this._error(RTC.Errors.getError("INVALID_OFFER"));
      return;
    }

    var self = this;
    this._setRemoteDescription(finalOffer, function() {
      self._pc.createAnswer(function(answer) {
        self._answer = answer;
        self._pc.setLocalDescription(answer, function() {
          onSuccess(JSON.stringify(answer));
        });
      }, self._error);
    });
  },

  acceptAnswer: function(answer, onSuccess, onStream) {
    if (!this._offer) {
      this._error(RTC.Errors.getError("OFFER_NOT_CREATED"));
      return;
    }
    if (this._answer) {
      this._error(RTC.Errors.getError("ANSWER_ACCEPTED"));
      return;
    }
    if (onStream && typeof onStream != "function") {
      this._error(RTC.Errors.getError("INVALID_CALLBACK"));
    } else {
      this._onStream = onStream;
    }

    this._setRemoteDescription(finalAnswer, function() {
      if (this._onStream) {
        while (this._remoteStreams.length) {
          this._onStream(this._remoteStreams.shift());
        }
      }
      if (onSuccess) {
        onSuccess();
      }
    });
  },

  _processQueue: function(onSuccess) {
    var self = this;
    var done = this._streamQueue.length;

    while (this._streamQueue.length) {
      var stream = this._streamQueue.shift();
      if (stream._stream) {
        _checkIfDone();
      } else {
        stream.start(_checkIfDone);
      }
    }

    function _checkIfDone() {
      done--;
      if (done == 0) {
        self._makeOffer(onSuccess);
      }
    }
  },

  _makeOffer: function(onSuccess) {
    var self = this;
    this._pc.createOffer(function(offer) {
      self._offer = offer;
      self._pc.setLocalDescription(offer, function() {
        onSuccess(JSON.stringify(offer));
      }, self._error)
    }, this._error);
  },

  _validateDescription: function(desc, type) {
    var finalDesc = null;
    if (typeof desc == "object") {
      if (!desc.sdp && !desc.type) {
        return false;
      }
    } else if (typeof desc == "string") {
      try {
        finalDesc = JSON.parse(desc);
      } catch(e) {
        return false;
      }
    } else {
      return false;
    }

    if (finalDesc.type != type) {
      return false;
    }

    return finalDesc;
  },

  _setRemoteDescription: function(desc, onSuccess) {
    var self = this;
    if (browser == "Chrome") {
      desc = new RTCSessionDescription(desc);
    }
    this._pc.setRemoteDescription(desc, onSuccess, this._error);
  },

  _onRemoteStreamAdded: function(e) {
    var wrapper = new RTC.Stream({}, null, e.stream);
    if (this._onStream) {
      this._onStream(wrapper);
    } else {
      this._pendingRemoteStreams.push(wrapper);
    }
  }
};

function makeStream(options, types, onError) {
  if (!onError) {
    onError = defaultOnError;
  }
  if (!options || typeof options != "object") {
    options = {};
  }
  options.audio = types.audio;
  options.video = types.video;
  return new RTC.Stream(options, onError);
}

function defaultOnError(err) {
  var obj = err;
  if (!obj.message) {
    obj = new Error("RTC.js: " + err);
  }
  if (!obj.name) {
    obj.name = err.name || "UNSUPPORTED_ERROR";
  }
  if (console && console.log) {
    console.log(obj);
  } else {
    throw obj;
  }
}

})();
