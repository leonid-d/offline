/* global self, caches, fetch, URL, Response */
'use strict';

const config = {
  version: 'v1',
  staticCacheItems: [
    '/',
    '/offline',
    '/offline/index.html',
    '/offline/bundle.js',
  ],
  cachePathPattern: [
    '/',
    '/offline',
    '/offline/index.html',
    '/offline/bundle.js',
    '/offline/cities.json',
  ],
  offlineImage: '<svg role="img" aria-labelledby="offline-title"'
  + ' viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">'
  + '<title id="offline-title">Offline</title>'
  + '<g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/>'
  + '<text fill="#9B9B9B" font-family="Times New Roman,Times,serif" font-size="72" ' +
  'font-weight="bold"><tspan x="93" y="172">offline</tspan></text></g></svg>',
  offlinePage: '/offline/',
  urlToSave: '/offline/cities.json',
  requestToSave: null,
};

const cacheName = (key, opts) =>
  `${opts.version}-${key}`;

function addToCache(cacheKey, request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(cacheKey).then(cache => {
      cache.put(request, copy);
    });
  }
  return response;
}

const fetchFromCache = (event) =>
  caches.match(event.request).then(response => {
    if (!response) {
      throw Error(`${event.request.url} not found in cache`);
    }
    return response;
  });


function offlineResponse(resourceType, opts) {
  if (resourceType === 'image') {
    return new Response(opts.offlineImage,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  } else if (resourceType === 'content') {
    return caches.match(opts.offlinePage);
  }
  return undefined;
}

self.addEventListener('install', event => {
  function onInstall(ev, opts) {
    const cacheKey = cacheName('static', opts);
    return caches.open(cacheKey)
      .then(cache => cache.addAll(opts.staticCacheItems));
  }
  event.waitUntil(
    onInstall(event, config).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const onActivate = (ev, opts) =>
    caches.keys()
      .then(cacheKeys => {
        const oldCacheKeys = cacheKeys.filter(key => key.indexOf(opts.version) !== 0);
        const deletePromises = oldCacheKeys.map(oldKey => caches.delete(oldKey));
        return Promise.all(deletePromises);
      });

  event.waitUntil(
    onActivate(event, config)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  function shouldHandleFetch(ev, opts) {
    const request = ev.request;
    const url = new URL(request.url);
    const criteria = {
      matchesPathPattern: ~opts.cachePathPattern.indexOf(url.pathname),
      isGETRequest: request.method === 'GET',
    };
    const failingCriteria = Object.keys(criteria)
      .filter(criteriaKey => !criteria[criteriaKey]);
    return !failingCriteria.length;
  }

  function onFetch(ev, opts) {
    const request = ev.request;
    const acceptHeader = request.headers.get('Accept');
    let resourceType = 'static';

    if (acceptHeader.indexOf('text/html') !== -1) {
      resourceType = 'content';
    } else if (acceptHeader.indexOf('image') !== -1) {
      resourceType = 'image';
    }

    const url = new URL(request.url);
    if (url.pathname === opts.urlToSave) {
      opts.requestToSave = ev.request;
    }
    ev.respondWith(
      fetchFromCache(ev)
        .catch(() => fetch(request))
        .catch(() => offlineResponse(resourceType, opts))
    );
  }
  if (shouldHandleFetch(event, config)) {
    onFetch(event, config);
  }
});

self.addEventListener('message', event => {
  const request = config.requestToSave;
  const acceptHeader = request.headers.get('Accept');
  let resourceType = 'static';

  if (acceptHeader.indexOf('text/html') !== -1) {
    resourceType = 'content';
  } else if (acceptHeader.indexOf('image') !== -1) {
    resourceType = 'image';
  }

  const cacheKey = cacheName(resourceType, config);
  event.source.postMessage('response');
  // Get all the connected clients and forward the message along.
  const myHeaders = new Headers();
  myHeaders.append('Content-Type', 'image/jpeg');

  const myInit = { method: 'GET',
    headers: myHeaders,
    mode: 'cors',
    cache: 'default' };
  const promise = self.clients.matchAll()
    .then(() => {
      // event.source.id contains the ID of the sender of the message.
      // const senderID = event.source.id;
      fetch(new Request(config.urlToSave, myInit))
        .then(response => addToCache(cacheKey, request, response));
    });

  // If event.waitUntil is defined, use it to extend the
  // lifetime of the Service Worker.
  if (event.waitUntil) {
    event.waitUntil(promise);
  }
});


