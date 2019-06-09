const http = require('http')
const port = 3456
const { exec } = require('child_process');
const fetch = require('node-fetch');
const xmpReader = require('xmp-reader');
const altXmp = require('kopparmora-xmp-reader');
const exif = require('exif').ExifImage;
const tmp = require('tmp-promise');
const fs = require('fs').promises;
const moreAdv = require('node-exiftool');
const exiftoolBin = require('dist-exiftool')

const { Readable } = require('stream');

/**
 * @param binary Buffer
 * returns readableInstanceStream Readable
 */
function bufferToStream(binary) {
    const readableInstanceStream = new Readable({
      read() {
        this.push(binary);
        this.push(null);
      }
    });

    return readableInstanceStream;
  }

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
  var fileBodies = await Promise.all(filenames.map(
    name => fetch(name)
            .then(result => result.buffer())
            .then(binary => 
              tmp.file()
              .then(tf => fs.writeFile(tf.path, binary)
                            .then(() => tf))
              .then(tf => ({tmpFile: tf, filename: name})))
  ));

  let reader = new moreAdv.ExiftoolProcess(exiftoolBin);
  await reader.open()
    .then((pid) => console.log('Started exiftool process %s', pid));

  for (let file of fileBodies)
  {
    file.metadata = (await reader.readMetadata(file.tmpFile.path, ['-File:all'])).data[0];
    await file.tmpFile.cleanup();
  }

  console.log(fileBodies[0].metadata)

  await reader.close();

  return fileBodies.map(file => ({url: file.filename, rating: file.metadata.Rating, date: file.metadata.DateTimeOriginal}));
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