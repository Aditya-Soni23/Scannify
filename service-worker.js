const CACHE_NAME = 'scanify-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    'https://docs.opencv.org/4.5.4/opencv.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});