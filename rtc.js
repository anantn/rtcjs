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
  "INVALID_ELEMENT": "Invalid jQuery element for display",
  "GUM_UNSUPPORTED": "This browser does not support getUserMedia",
  "UNSUPPORTED_BROWSER": "This browser does not support WebRTC",
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

RTC.Stream = function(options, onError) {
  this._queue = [];
  this._outputs = [];

  this._stream = null;
  this._error = onError;
  this._options = options;
};
RTC.Stream.prototype = {
  addOutput: function(element) {
    var ele = element;
    if (ele.jquery) {
      if (ele.length != 1) {
        this._error(RTC.Errors.getError("INVALID_ELEMENT"));
        return;
      }
      ele = element.get(0);
    }
    if (this._options.video && ele.nodeName != "VIDEO") {
      this._error(RTC.Errors.getError("INVALID_ELEMENT"));
      return;
    }
    if (this._options.audio && !this._options.video && ele.nodeName != "AUDIO") {
      this._error(RTC.Errors.getError("INVALID_ELEMENT"));
      return;
    }
    this._addToQueue(ele);
  },

  start: function(onSuccess) {
    var self = this;
    navigator.getUserMedia_(this._options, function(stream) {
      self._stream = stream;
      while (self._queue.length) {
        self._outputStream(self._queue.shift());
      }
      if (onSuccess) {
        onSuccess(stream);
      }
    }, this._error);
  },

  stop: function() {
    if (typeof this._stream.stop == "function") {
      this._stream.stop();
    } else {
      while (this._outputs.length) {
        this._outputs.shift().pause();
      }
    }
  },

  _addToQueue: function(element) {
    if (this._stream) {
      // If the stream is ready, we can display/play it immediately.
      this._outputStream(element);
    } else {
      // Else, queue it up.
      this._queue.push(element);
    }
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
        this._outputs.push(element);
        break;
      case "Firefox":
        element.mozSrcObject = this._stream;
        element.play();
        this._outputs.push(element);
        break;
      default:
        this._error(RTC.Errors.getError("UNSUPPORTED_BROWSER"));
        return;
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
    obj = new Error("RTC Error: " + err.code || err.toString());
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
