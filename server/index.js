const http = require('http')
const port = 3456
const { exec } = require('child_process');

let cache = {
    files: [],
    lastLoad: 0,
    loadingPromise: null,
    lifetime: 120
}

function loadFiles() {
    if ((new Date() / 1000) - (cache.lastLoad / 1000) > cache.lifetime && !cache.loadingPromise) {
        cache.loadingPromise = new Promise((res, rej) => {
            exec('gsutil ls gs://just-call-me-ryan/gallery/thumbs', (err, stdout, stderr) => {
                if (err)
                    rej(err);

                var files = stdout
                    .split("\n")
                    .map(ln => ln.trim())
                    .filter(ln => ln.startsWith("gs://"))
                    .filter(ln => ln.endsWith(".jpg"))
                    .map(ln => ln.replace("gs://", "https://storage.googleapis.com/"));                
                cache.files = files;
                cache.lastLoad = new Date();
                cache.loadingPromise = null;
                res(files);
            });
        });
    }
    
    if (cache.lastLoad != 0)
      return cache.files;

    return cache.loadingPromise;
}

const requestHandler = async (request, response) => {
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