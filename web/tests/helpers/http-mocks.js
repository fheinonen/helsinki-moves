const { EventEmitter } = require("node:events");

function createMockRequest({ method = "GET", query = {}, body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.query = query;
  req.body = body;
  req.destroyed = false;
  req.destroy = () => {
    req.destroyed = true;
  };
  return req;
}

function createMockResponse() {
  return {
    headers: new Map(),
    statusCode: null,
    payload: null,
    ended: false,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

module.exports = {
  createMockRequest,
  createMockResponse,
};
