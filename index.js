const events = require('events');
const {EventEmitter} = events;

const RECONNECT_MIN_TIMEOUT = 2;
const RECONNECT_MAX_TIMEOUT = 30;

class AutoWs extends EventEmitter {
  constructor(url) {
    super();

    this.url = url;

    this._live = true;
    this._connection = null;
    this._lastConnectTime = -Infinity;
    this._numReconnects = 0;
    this._reconnectTimeout = null;
    this._queue = [];

    this.connect();
  }

  connect() { 
    const connection = (() => {
      let opened = false;

      const result = new WebSocket(this.url);
      result.binaryType = 'arraybuffer';
      result.onopen = () => {
        this._connection = connection;
        this._numReconnects = 0;

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

        if (this._live) {
          this.reconnect();
        }
      };
      result.onerror = err => {
        this.emit('error', err);
      };
      result.onmessage = (msg, flags) => {
        this.emit('message', msg, flags);
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
    if (this._connection && this._connection.readyState === WebSocket.OPEN) {
      this._connection.send(d);
    } else {
      this._queue.push(d);
    }
  }

  sendUnbuffered(d) {
    if (this._connection && this._connection.readyState === WebSocket.OPEN) {
      this._connection.send(d);
    }
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

module.exports = AutoWs;
