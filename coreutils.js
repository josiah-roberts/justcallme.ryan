function makeTitle(postName) {
  return `Just Call Me Ryan${postName ? " | " + postName : ""}`;
}

function clamp(num, min, max) {
  return num <= min ? min : num >= max ? max : num;
}

const mdRenderer = (() => {
  const ret = new showdown.Converter();
  ret.setOption("headerLevelStart", 3);
  ret.setOption("strikethrough", true);
  ret.setOption("emoji", true);
  return ret;
})();

function loadTemplate() {
  const container = document.currentScript.parentElement;
  const styles = container.querySelectorAll(".templates style");
  for (let s of styles) document.head.appendChild(s);

  const templateElement = container.querySelector(".template");
  container.removeChild(templateElement);
  return templateElement.innerHTML;
}

function updateSlug(post, allposts) {
  document.title = makeTitle(post.title);

  if (post == allposts[0])
    window.history.replaceState(null, document.title, window.location.pathname);
  else window.history.replaceState(null, document.title, `#${post.slug}`);
}

function updateLightboxSlug(post, imageIndex) {
  const lightboxSlug = `#lb_${post.slug}_${imageIndex}`;
  window.history.replaceState(null, makeTitle(post.title), lightboxSlug);
}

function updateGalleryLightboxSlug(imageName) {
  const lightboxSlug = `#lb_${imageName}`;
  window.history.replaceState(null, "Just Call Me Ryan", lightboxSlug);
}

function clearSlug() {
  window.history.replaceState(null, "Just Call Me Ryan", "#");
}

function getViewportData(el) {
  const rect = el.getBoundingClientRect();
  const windowHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const bottomMargin = windowHeight - (rect.top + rect.height);
  return { topMargin: rect.top, bottomMargin, height: rect.height };
}

function parseMusicItem(innerText) {
  const args = {};
  let currentAttrName = "";
  let currentValue = "";
  let inValue = false;
  for (let char of innerText.substring("music-item ".length)) {
    if (!inValue) {
      if (char == "=") {
        inValue = true;
        continue;
      }

      if (char == " ") continue;
      currentAttrName += char;
      continue;
    }

    if (inValue) {
      currentValue += char;
      if (char == '"' && currentValue.length > 1) {
        args[currentAttrName] = currentValue.substring(
          1,
          currentValue.length - 1
        );
        currentAttrName = "";
        currentValue = "";
        inValue = false;
      }
      continue;
    }
  }
  return {
    spotify: args.spotify,
    google: args.google,
    youtube: args.youtube,
    track: args.track,
    artist: args.artist,
    title: args.title,
  };
}

function renderHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function insertMusic(doc) {
  const musicItems = [...doc.querySelectorAll("del")].filter((del) =>
    del.textContent.startsWith("music-item")
  );
  musicItems.forEach((item) => {
    const props = parseMusicItem(item.textContent);
    const divElement = doc.createElement("div");
    item.parentElement.replaceChild(divElement, item);
    const musicComponent = new (Vue.component("music"))({
      el: divElement,
      propsData: props,
    });
  });
  return doc;
}

async function startApp(elementName) {
  const promises = [...document.querySelectorAll("component")].map((el) =>
    fetch(`/components/${el.id}.html`)
      .then((res) => res.text())
      .then((html) => ({ html, el }))
  );

  const components = await Promise.all(promises);

  for (let component of components) {
    component.el.innerHTML = component.html;
    for (let script of component.el.querySelectorAll("script")) {
      const data = script.text || script.textContent || script.innerHTML;
      const newScript = document.createElement("script");
      newScript.type = "text/javascript";
      newScript.appendChild(document.createTextNode(data));
      component.el.insertBefore(newScript, script);
      component.el.removeChild(script);
    }
  }

  new Vue({
    el: `#${elementName}`,
  });
}

function parseExifDate(dateTime) {
  const b = dateTime.split(/\D/);
  return new Date(b[0], b[1] - 1, b[2], b[3], b[4], b[5]);
}

function getImageDate(img) {
  return new Promise((res, rej) => {
    delete img.exifdata;
    EXIF.getData(img, function () {
      let all = EXIF.getAllTags(this);
      const dateTime = EXIF.getTag(this, "DateTimeOriginal");

      if (dateTime) {
        res(parseExifDate(dateTime));
      }
      rej();
    });
  });
}

Array.prototype.groupBy = function (selector) {
  const ret = {};
  for (item of this) {
    const key = selector(item);
    if (!ret[key]) ret[key] = [];
    ret[key].push(item);
  }

  return Object.keys(ret).map((key) => ({ key, items: ret[key] }));
};

Array.prototype.orderBy = function (selector) {
  return [...this].sort((a, b) => selector(a) - selector(b));
};

Array.prototype.orderByDesc = function (selector) {
  return [...this].sort((a, b) => selector(b) - selector(a));
};

Array.prototype.mapMany = function (selector) {
  return this.reduce((a, b) => [...a, ...selector(b)], []);
};

Date.prototype.toMonthYear = function () {
  return this.toLocaleString("en-US", { month: "long", year: "numeric" });
};

Object.defineProperty(Array.prototype, "last", {
  get: function () {
    return this[this.length - 1];
  },
});
Object.defineProperty(Array.prototype, "first", {
  get: function () {
    return this[0];
  },
});

const virtualMachine = function (code) {
  let locals = { ...code.locals };
  const instructions = [...code.instructions];
  let instructionPtr = 0;
  let done = false;
  let attachedElement = null;

  const getInstructions = () =>
    instructions.map((instruction, number) => ({ ...instruction, number }));

  const getCurrentInstruction = () => ({
    ...instructions[instructionPtr],
    number: instructionPtr,
  });

  const reset = () => {
    instructionPtr = 0;
    locals = { ...code.locals };
    done = false;
  };

  const step = () => {
    if (instructionPtr === instructions.length) {
      done = true;
      return false;
    }

    let jumped = false;
    instructions[instructionPtr].exec({
      locals,
      instructions,
      jmp: (i) => {
        instructionPtr = i;
        jumped = true;
      },
    });
    if (!jumped) {
      instructionPtr++;
    }

    return true;
  };

  const render = () => {
    const localsDiv = attachedElement.querySelector(".locals");
    [...localsDiv.children].forEach((x) => x.remove());
    for (let key of Object.keys(locals).filter((x) => x[0] !== "_")) {
      const variable = locals[key];
      const value =
        typeof variable === "number" ? Number(variable.toFixed(4)) : variable;
      const local = document.createElement("pre");
      local.innerText = `${key}: ${JSON.stringify(value)}`;
      local.id = `local-${key}`;
      localsDiv.appendChild(local);
    }

    [...attachedElement.querySelectorAll(`pre.line`)].forEach((x) =>
      x.classList.remove("active")
    );
    const currenInstructionPre = attachedElement.querySelector(
      `#vm-line-${getCurrentInstruction().number}`
    );
    if (currenInstructionPre) currenInstructionPre.classList.add("active");
  };

  const setup = (e) => {
    attachedElement = e;

    const localsDiv = document.createElement("div");
    localsDiv.className = "locals";
    e.appendChild(localsDiv);

    for (const instruction of getInstructions()) {
      const line = document.createElement("pre");
      line.className = "line";
      line.innerText = instruction.text;
      line.id = `vm-line-${instruction.number}`;
      attachedElement.appendChild(line);
    }

    const stepButton = document.createElement("button");
    stepButton.type = "button";
    stepButton.className = "vm-button-step";
    stepButton.onclick = () => {
      if (done) reset();
      step();
      render();
    };
    stepButton.innerText = "Step";
    e.appendChild(stepButton);

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "vm-button-run";
    runButton.onclick = () => {
      if (done) reset();

      const recurse = () => {
        if (step()) {
          setTimeout(
            recurse,
            attachedElement.querySelector(".vm-speed-range").value
          );
        }
        render();
      };
      recurse();
    };
    runButton.innerText = "Run";
    e.appendChild(runButton);

    const rangeSlider = document.createElement("input");
    rangeSlider.type = "range";
    rangeSlider.min = "100";
    rangeSlider.max = "5000";
    rangeSlider.className = "vm-speed-range";
    e.appendChild(rangeSlider);
  };

  return {
    isDone: () => done,
    step,
    getLocals: () => ({ ...locals }),
    getCurrentInstruction,
    getInstructions,
    attach: (element) => {
      setup(element);
      render();
    },
  };
};
