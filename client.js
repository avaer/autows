const events = require('events');
const {EventEmitter} = events;

const RECONNECT_MIN_TIMEOUT = 2;
const RECONNECT_MAX_TIMEOUT = 30;

const _parseSubsocketMessage = s => {
  if (typeof s === 'string') {
    const match = s.match(/^_subsocket:(.*)$/);
    return match && match[1];
  } else {
    return null;
  }
};

class Subsocket extends EventEmitter {
  constructor(parent, name) {
    super();

    this.parent = parent;
    this.name = name;

    this.listen();
  }

  listen() {
    this.parent.on('rawMessage', m => {
      if (this.parent._readSubsocket === this.name) {
        this.emit('message', m);
      }
    });
  }

  send(d) {
    if (this.parent._connection && this.parent._connection.readyState === AutoWs.config.WebSocket.OPEN) {
      if (this.parent._writeSubsocket !== this.name) {
        this.parent._connection.send('_subsocket:' + this.name);
        this.parent._writeSubsocket = this.name;
      }

      this.parent._connection.send(d);
    } else {
      if (this.parent._writeSubsocket !== this.name) {
        this.parent._queue.push('_subsocket:' + this.name);
        this.parent._writeSubsocket = this.name;
      }

      this.parent._queue.push(d);
    }
  }

  sendUnbuffered(d) {
    if (this.parent._connection && this.parent._connection.readyState === AutoWs.config.WebSocket.OPEN) {
      if (this.parent._writeSubsocket !== this.name) {
        this.parent._connection.send('_subsocket:' + this.name);
        this.parent._writeSubsocket = this.name;
      }

      this.parent._connection.send(d);
    }
  }

  subsocket(name) {
    return new Subsocket(this.parent, name);
  }
}

class AutoWs extends EventEmitter {
  constructor(url) {
    super();

    this.url = url;
    this.name = '';

    this._live = true;
    this._connection = null;
    this._lastConnectTime = -Infinity;
    this._numReconnects = 0;
    this._reconnectTimeout = null;
    this._queue = [];
    this._channels = {};
    this._readSubsocket = '';
    this._writeSubsocket = '';

    this.connect();
  }

  static configure(newConfig) {
    for (const k in newConfig) {
      this.config[k] = newConfig[k];
    }
  }

  connect() {
    const connection = (() => {
      let opened = false;

      const result = new AutoWs.config.WebSocket(this.url);
      result.binaryType = 'arraybuffer';
      result.onopen = () => {
        this._connection = connection;
        this._numReconnects = 0;

        for (const name in this._channels) {
          this._connection.send('_channel:' + name);
        }

        if (this._queue.length > 0) {
          for (let i = 0; i < this._queue.length; i++) {
            this.send(this._queue[i]);
          }
          this._queue.length = 0;
        }

        if (!opened) {
          this.emit('open');
          opened = true;
        }

        this.emit('connect');
      };
      result.onclose = () => {
        this.emit('disconnect');

        if (opened) {
          this.emit('close');
        }

        this._connection = null;
        this._readSubsocket = '';
        this._writeSubsocket = '';

        if (this._live) {
          this.reconnect();
        }
      };
      result.onerror = err => {
        console.warn(err);

        this.emit('error', err);
      };
      result.onmessage = (msg, flags) => {
        const subsocketMessage = _parseSubsocketMessage(msg.data);
        if (subsocketMessage !== null) {
          this._readSubsocket = subsocketMessage;
        } else {
          if (this._readSubsocket === this.name) {
            this.emit('message', msg, flags);
          } else {
            this.emit('rawMessage', msg, flags);
          }
        }
      };
      return result;
    })();
    this._lastConnectTime = Date.now();
  }

  reconnect() {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }

    const {_lastConnectTime: lastConnectTime, _numReconnects: numReconnects} = this;
    const now = Date.now();
    const timeDiff = now - lastConnectTime;
    const reconnectTimeout = Math.min(Math.pow(RECONNECT_MIN_TIMEOUT, numReconnects), RECONNECT_MAX_TIMEOUT) * 1000;

    this._numReconnects++;

    if (timeDiff >= reconnectTimeout) {
      this.connect();
    } else {
      this._reconnectTimeout = setTimeout(() => {
        this._reconnectTimeout = null;

        this.connect();
      }, reconnectTimeout - timeDiff);
    }
  }

  send(d) {
    if (this._connection && this._connection.readyState === AutoWs.config.WebSocket.OPEN) {
      if (this._writeSubsocket !== this.name) {
        this._connection.send('_subsocket:' + this.name);
        this._writeSubsocket = this.name;
      }

      this._connection.send(d);
    } else {
      if (this._writeSubsocket !== this.name) {
        this._queue.push('_subsocket:' + this.name);
        this._writeSubsocket = this.name;
      }

      this._queue.push(d);
    }
  }

  sendUnbuffered(d) {
    if (this._connection && this._connection.readyState === AutoWs.config.WebSocket.OPEN) {
      if (this._writeSubsocket !== this.name) {
        this._connection.send('_subsocket:' + this.name);
        this._writeSubsocket = this.name;
      }

      this._connection.send(d);
    }
  }

  channel(name) {
    if (this._connection && this._connection.readyState === AutoWs.config.WebSocket.OPEN) {
      this._connection.send('_channel:' + name);
    }
    this._channels[name] = true;

    return new Subsocket(this, name);
  }

  destroy() {
    this._live = false;

    if (this._connection) {
      this._connection.close();
    }

    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
  }
}
AutoWs.config = {
  WebSocket: typeof WebSocket !== 'undefined' ? WebSocket : null,
};

module.exports = AutoWs;
