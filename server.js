const events = require('events');
const {EventEmitter} = events;

const _parseSubsocketMessage = s => {
  if (typeof s === 'string') {
    const match = s.match(/^_subsocket:(.*)$/);
    return match && match[1];
  } else {
    return null;
  }
};
const _parseChannelMessage = s => {
  if (typeof s === 'string') {
    const match = s.match(/^_channel:(.*)$/);
    return match && match[1];
  } else {
    return null;
  }
};

class AutoWsConnection extends EventEmitter {
  constructor(parent, name, connection) {
    super();

    this.parent = parent;
    this.name = name;
    this.connection = connection;

    this.listen();
  }

  listen() {
    this.connection.on('rawMessage', m => {
      if (this.connection._readSubsocket === this.name) {
        this.emit('message', m);
      }
    });
    this.connection.on('close', () => {
      this.emit('close');
    });
  }

  send(d) {
    if (this.connection._writeSubsocket !== this.name) {
      this.connection.send('_subsocket:' + this.name);
      this.connection._writeSubsocket = this.name;
    }

    this.connection.send(d);
  }

  close() {
    this.connection.close();
  }

  get readyState() {
    return this.connection.readyState;
  }
}

class AutoWs extends EventEmitter {
  constructor(wss) {
    super();

    this.wss = wss;

    this._channels = {};
  }

  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, c => {
      const c2 = new AutoWsConnection(this, '', c);
      const channels = [c2];

      c._readSubsocket = '';
      c._writeSubsocket = '';
      c.on('message', m => {
        const subsocketMessage = _parseSubsocketMessage(m);
        if (subsocketMessage !== null) {
          c._readSubsocket = subsocketMessage;
        } else {
          const channelMessage = _parseChannelMessage(m);
          if (channelMessage !== null) {
            if (this._channels[channelMessage]) {
              const c2 = new AutoWsConnection(this, channelMessage, c);
              channels.push(c2);
              this._channels[channelMessage].emit('connection', c2, req);
            } else {
              console.warn('autows got binding request for nonexistent channel', channelMessage);

              c.close();
            }
          } else {
            c.emit('rawMessage', m);
          }
        }
      });
      c.on('close', () => {
        for (let i = 0; i < channels.length; i++) {
          channels[i].emit('close');
        }
      });
      c.on('error', err => {
        c2.emit('error', err);
      });
      this.emit('connection', c2, req);
    });
  }

  channel(name) {
    if (!this._channels[name]) {
      this._channels[name] = new EventEmitter();
    }
    return this._channels[name];
  }
}

module.exports = AutoWs;
