const http = require('http')
const port = 3456
const { exec } = require('child_process');
const fetch = require('node-fetch');
const xmpReader = require('xmp-reader');
const altXmp = require('kopparmora-xmp-reader');
const exif = require('exif').ExifImage;

let cache = {
    files: [],
    lastLoad: 0,
    loadingPromise: null,
    lifetime: 120
}

function getRawFiles () {
  return new Promise((res, rej) => {
    exec('gsutil ls gs://just-call-me-ryan/gallery/thumbs', (err, stdout, stderr) => {
        if (err)
            rej(err);
        res(stdout)
    })
  });
}

async function loadFilenamesFromGcloud() {
  let raw = await getRawFiles();
  let filenames = raw.split("\n")
            .map(ln => ln.trim())
            .filter(ln => ln.startsWith("gs://"))
            .filter(ln => ln.endsWith(".jpg"))
            .map(ln => ln.replace("gs://", "https://storage.googleapis.com/"));
  var buffer = await fetch(filenames[0]).then(x => x.buffer());
  var exifData = await new Promise((res, rej) => new exif(buffer, (err, data) => err ? rej(error) : res(data)));
  var xmpData = await altXmp.fromBuffer(buffer);
  console.log(xmpData);
  console.log(exifData);
  console.log(buffer);
  return filenames;
}

async function loadAndCache() {
  let files = await loadFilenamesFromGcloud();
  cache.files = files;
  cache.lastLoad = new Date();
  cache.loadingPromise = null;
  return files;
}

function loadFiles() {
    if ((new Date() / 1000) - (cache.lastLoad / 1000) > cache.lifetime && !cache.loadingPromise) {
        console.log("Loading files...");
        cache.loadingPromise = loadAndCache();
    }
    
    if (cache.lastLoad != 0)
    {
      console.log("Returning cache")
      return cache.files;
    }

    return cache.loadingPromise;
}

const requestHandler = async (request, response) => {
  console.log(`Incoming ${request.method} to ${request.url}`);
  if (request.url == "/images") {
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method == "OPTIONS") {
      response.setHeader('Access-Control-Allow-Headers', 'pragma,cache-control');      
      response.setHeader('Access-Control-Request-Method', '*');
      response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
      response.writeHead(200);
      response.end();
      return;
    }

    let data = await loadFiles();
    response.end(JSON.stringify(data));
  } else {
    response.end();
  }
}

const server = http.createServer(requestHandler)

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
})