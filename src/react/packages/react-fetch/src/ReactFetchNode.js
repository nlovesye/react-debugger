/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

import * as http from 'http';
import * as https from 'https';
import {unstable_getCacheForType} from 'react';

function nodeFetch(url, options, onResolve, onReject) {
  const {hostname, pathname, search, port, protocol} = new URL(url);
  const nodeOptions = {
    hostname,
    port,
    path: pathname + search,
    // TODO: cherry-pick supported user-passed options.
  };
  const nodeImpl = protocol === 'https:' ? https : http;
  const request = nodeImpl.request(nodeOptions, (response) => {
    // TODO: support redirects.
    onResolve(new Response(response));
  });
  request.on('error', (error) => {
    onReject(error);
  });
  request.end();
}

const Pending = 0;
const Resolved = 1;
const Rejected = 2;

function getRecordMap() {
  return unstable_getCacheForType(createRecordMap);
}

function createRecordMap() {
  return new Map();
}

function readRecordValue(record) {
  if (record.status === Resolved) {
    return record.value;
  } else {
    throw record.value;
  }
}

function Response(nativeResponse) {
  this.headers = nativeResponse.headers;
  this.ok = nativeResponse.statusCode >= 200 && nativeResponse.statusCode < 300;
  this.redirected = false; // TODO
  this.status = nativeResponse.statusCode;
  this.statusText = nativeResponse.statusMessage;
  this.type = 'basic';
  this.url = nativeResponse.url;

  this._response = nativeResponse;
  this._json = null;
  this._text = null;

  const callbacks = [];
  function wake() {
    // This assumes they won't throw.
    while (callbacks.length > 0) {
      const cb = callbacks.pop();
      cb();
    }
  }
  const bufferRecord = (this._bufferRecord = {
    status: Pending,
    value: {
      then(cb) {
        callbacks.push(cb);
      },
    },
  });
  const data = [];
  nativeResponse.on('data', (chunk) => data.push(chunk));
  nativeResponse.on('end', () => {
    if (bufferRecord.status === Pending) {
      const resolvedRecord = bufferRecord;
      resolvedRecord.status = Resolved;
      resolvedRecord.value = Buffer.concat(data);
      wake();
    }
  });
  nativeResponse.on('error', (err) => {
    if (bufferRecord.status === Pending) {
      const rejectedRecord = bufferRecord;
      rejectedRecord.status = Rejected;
      rejectedRecord.value = err;
      wake();
    }
  });
}

Response.prototype = {
  constructor: Response,
  arrayBuffer() {
    const buffer = readRecordValue(this._bufferRecord);
    return buffer;
  },
  blob() {
    // TODO: Is this needed?
    throw new Error('Not implemented.');
  },
  json() {
    if (this._json !== null) {
      return this._json;
    }
    const buffer = readRecordValue(this._bufferRecord);
    const json = JSON.parse(buffer.toString());
    this._json = json;
    return json;
  },
  text() {
    if (this._text !== null) {
      return this._text;
    }
    const buffer = readRecordValue(this._bufferRecord);
    const text = buffer.toString();
    this._text = text;
    return text;
  },
};

function preloadRecord(url, options) {
  const map = getRecordMap();
  let record = map.get(url);
  if (!record) {
    if (options) {
      if (options.method || options.body || options.signal) {
        // TODO: wire up our own cancellation mechanism.
        // TODO: figure out what to do with POST.
        // eslint-disable-next-line react-internal/prod-error-codes
        throw Error('Unsupported option');
      }
    }
    const callbacks = [];
    const wakeable = {
      then(cb) {
        callbacks.push(cb);
      },
    };
    const wake = () => {
      // This assumes they won't throw.
      while (callbacks.length > 0) {
        const cb = callbacks.pop();
        cb();
      }
    };
    const newRecord = (record = {
      status: Pending,
      value: wakeable,
    });
    nodeFetch(
      url,
      options,
      (response) => {
        if (newRecord.status === Pending) {
          const resolvedRecord = newRecord;
          resolvedRecord.status = Resolved;
          resolvedRecord.value = response;
          wake();
        }
      },
      (err) => {
        if (newRecord.status === Pending) {
          const rejectedRecord = newRecord;
          rejectedRecord.status = Rejected;
          rejectedRecord.value = err;
          wake();
        }
      },
    );
    map.set(url, record);
  }
  return record;
}

export function preload(url, options) {
  preloadRecord(url, options);
  // Don't return anything.
}

export function fetch(url, options) {
  const record = preloadRecord(url, options);
  const response = readRecordValue(record);
  return response;
}