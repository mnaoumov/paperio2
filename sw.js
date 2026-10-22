// Service worker for the installed app (added by this repo, not part of the original site). It lets the game start
// with no network: on install it caches every file the page loads, and every request is then answered network first,
// falling back to that cache. Online, a launch is always the deployed version; offline, it is the last one seen.
// The game itself makes no request after it boots, so nothing here sits in the gameplay path.
//
// Paths are relative to this file, so the same worker serves the site root and https://mnaoumov.dev/paperio2/.
// Bump CACHE_NAME only to drop old caches: entries refresh on every online request anyway.

var CACHE_NAME = 'paperio2-v1';
var NETWORK_TIMEOUT_MILLISECONDS = 4000;

var SHELL = [
    './',
    'index.html',
    'app2.js',
    'ts/dist/app2.js',
    'style3.css',
    'joystick.css',
    'joystick.js',
    'manifest.json',
    'assets/fonts/ptsans.css',
    'assets/fonts/ptsans-0.woff2',
    'assets/fonts/ptsans-1.woff2',
    'assets/fonts/ptsans-2.woff2',
    'assets/fonts/ptsans-3.woff2',
    'assets/images/apple-touch-icon.png',
    'assets/images/heart.gif',
    'assets/images/icon192.png',
    'assets/images/icon512.png',
    'assets/images/icon512-maskable.png',
    'assets/images/logo.png',
    'assets/languages.json',
    'assets/skins/skins.json',
    'assets/skins/select/noskin.png',
    // The effects are small (65 KB in all), so an offline run has them. The music (5 MB) is cached as each track plays.
    'assets/audio/sounds/capture-large.mp3',
    'assets/audio/sounds/capture-medium.mp3',
    'assets/audio/sounds/capture-small.mp3',
    'assets/audio/sounds/checkpoint-remove.mp3',
    'assets/audio/sounds/checkpoint-set.mp3',
    'assets/audio/sounds/death.mp3',
    'assets/audio/sounds/kill.mp3',
    'assets/audio/sounds/respawn.mp3',
    'assets/audio/sounds/results.mp3',
    'assets/audio/sounds/win.mp3'
];

// skins.json names every skin layer and pattern by a "url" field, and the menu shows each skin's thumbnail as
// select/<name, lower case, no spaces>.png, the same rule ui.ts applies.
function skinFiles(skins) {
    var files = [];
    function walk(value) {
        if (Array.isArray(value)) {
            value.forEach(walk);
        } else if (value && typeof value === 'object') {
            Object.keys(value).forEach(function (key) {
                if (key === 'url' && typeof value[key] === 'string') {
                    files.push('assets/skins/' + value[key]);
                } else {
                    walk(value[key]);
                }
            });
        }
    }
    walk(skins);
    skins.forEach(function (skin) {
        if (skin && typeof skin.name === 'string') {
            files.push('assets/skins/select/' + skin.name.toLowerCase().replace(/\s+/g, '') + '.png');
        }
    });
    return files;
}

// One missing file must not fail the install: a local serve may have no ts/ build, and not every skin has a
// thumbnail. The page falls back the same way.
function cacheAll(cache, files) {
    return Promise.all(files.map(function (file) {
        return cache.add(new Request(file, { cache: 'reload' })).catch(function () {});
    }));
}

self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
        return cacheAll(cache, SHELL)
            .then(function () {
                return cache.match('assets/skins/skins.json');
            })
            .then(function (response) {
                return response ? response.json() : [];
            })
            .then(function (skins) {
                return cacheAll(cache, skinFiles(skins));
            });
    }).then(function () {
        return self.skipWaiting();
    }));
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (names) {
        return Promise.all(names.filter(function (name) {
            return name.indexOf('paperio2-') === 0 && name !== CACHE_NAME;
        }).map(function (name) {
            return caches.delete(name);
        }));
    }).then(function () {
        return self.clients.claim();
    }));
});

function fromCache(request) {
    // A navigation can carry a query (?original); the shell is the same file.
    return caches.match(request, { ignoreSearch: request.mode === 'navigate' });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }
    event.respondWith(new Promise(function (resolve, reject) {
        var settled = false;
        function fallBack() {
            if (settled) {
                return;
            }
            fromCache(request).then(function (cached) {
                if (cached && !settled) {
                    settled = true;
                    resolve(cached);
                }
            });
        }
        // A network that hangs rather than fails would otherwise keep the app on a blank screen.
        var timer = setTimeout(fallBack, NETWORK_TIMEOUT_MILLISECONDS);
        fetch(request).then(function (response) {
            clearTimeout(timer);
            if (response.ok) {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    return cache.put(request, copy);
                });
            }
            if (!settled) {
                settled = true;
                resolve(response);
            }
        }, function (error) {
            clearTimeout(timer);
            fromCache(request).then(function (cached) {
                if (settled) {
                    return;
                }
                settled = true;
                if (cached) {
                    resolve(cached);
                } else {
                    reject(error);
                }
            });
        });
    }));
});
