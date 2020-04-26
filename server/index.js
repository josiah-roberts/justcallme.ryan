const http = require("http");
const port = 3456;
const { exec } = require("child_process");
const fetch = require("node-fetch");
const tmp = require("tmp-promise");
const fs = require("fs").promises;
const ExiftoolProcess = require("node-exiftool").ExiftoolProcess;
const exiftoolBin = require("dist-exiftool");

let cache = {
  files: [],
  lastLoad: 0,
  loadingPromise: null,
  lifetime: 240,
};

function parseExifDate(dateTime) {
  const b = dateTime.split(/\D/);
  return new Date(b[0], b[1] - 1, b[2], b[3], b[4], b[5]);
}

function getRawFiles() {
  return new Promise((res, rej) => {
    exec(
      "gsutil ls gs://just-call-me-ryan/gallery/thumbs",
      (err, stdout, stderr) => {
        if (err) rej(err);
        res(stdout);
      }
    );
  });
}

async function loadFilenamesFromGcloud() {
  let raw = await getRawFiles();
  return raw
    .split("\n")
    .map((ln) => ln.trim())
    .filter((ln) => ln.startsWith("gs://"))
    .filter((ln) => ln.endsWith(".jpg"))
    .map((ln) => ln.replace("gs://", "https://storage.googleapis.com/"))
    .map((thumb) => ({ thumb, full: thumb.replace("thumbs/", "full/") }));
}

function loadFileData(files) {
  const loadToTmpFile = async (names) => {
    let response = await fetch(names.thumb);
    let [binary, tf] = await Promise.all([response.buffer(), tmp.file()]);
    await fs.writeFile(tf.path, binary);
    return { ...names, tmp: tf };
  };
  return Promise.all(files.map(loadToTmpFile));
}

async function loadMetadata(files) {
  let reader = new ExiftoolProcess(exiftoolBin);

  try {
    await reader
      .open()
      .then((pid) => console.log("Started exiftool process %s", pid));

    for (let file of files) {
      file.metadata = (
        await reader.readMetadata(file.tmp.path, ["-File:all"])
      ).data[0];
    }

    return files.map((file) => ({
      thumb: file.thumb,
      full: file.full,
      rating: file.metadata.Rating,
      date: parseExifDate(file.metadata.DateTimeOriginal),
    }));
  } finally {
    await reader.close();
  }
}

async function loadFilesWithMetadata() {
  let files = await loadFilenamesFromGcloud();
  let populatedFiles = await loadFileData(files);
  try {
    return await loadMetadata(populatedFiles);
  } finally {
    await Promise.all(populatedFiles.map((x) => x.tmp.cleanup()));
  }
}

async function loadAndCache() {
  let files = await loadFilesWithMetadata();
  cache.files = files;
  cache.lastLoad = new Date();
  cache.loadingPromise = null;
  return files;
}

function loadFiles() {
  if (
    new Date() / 1000 - cache.lastLoad / 1000 > cache.lifetime &&
    !cache.loadingPromise
  ) {
    console.log("Loading files...");
    cache.loadingPromise = loadAndCache();
  }

  if (cache.lastLoad != 0) {
    console.log("Returning cache");
    return cache.files;
  }

  return cache.loadingPromise;
}

const requestHandler = async (request, response) => {
  console.log(`Incoming ${request.method} to ${request.url}`);
  if (request.url == "/images") {
    response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
    if (request.method == "OPTIONS") {
      response.setHeader(
        "Access-Control-Allow-Headers",
        "pragma,cache-control"
      );
      response.setHeader("Access-Control-Request-Method", "*");
      response.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
      response.writeHead(200);
      response.end();
      return;
    }

    let data = await loadFiles();
    response.end(JSON.stringify(data));
  } else {
    response.end();
  }
};

const server = http.createServer(requestHandler);

server.listen(port, (err) => {
  if (err) {
    return console.log("something bad happened", err);
  }

  console.log(`server is listening on ${port}`);
});
