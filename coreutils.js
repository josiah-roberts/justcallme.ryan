function makeTitle(postName) {
    return `Just Call Me Ryan${postName ? ' | ' + postName : ''}`;
};

function clamp (num, min, max) {
    return num <= min
        ? min
        : num >= max
            ? max
            : num;
}

const mdRenderer = (() => {
    const ret = new showdown.Converter();
    ret.setOption('headerLevelStart', 3);
    ret.setOption('strikethrough', true);
    ret.setOption('emoji', true);
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
        window.history.replaceState(null, document.title, window.location.pathname)
    else
        window.history.replaceState(null, document.title, `#${post.slug}`);
}

function updateLightboxSlug(post, imageIndex) {
    const lightboxSlug = `#lb_${post.slug}_${imageIndex}`;
    window.history.replaceState(null, makeTitle(post.title), lightboxSlug);
}

function getViewportData(el) {
    const rect = el.getBoundingClientRect();
    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
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

            if (char == " ")
                continue;
            currentAttrName += char;
            continue;
        }

        if (inValue) {
            currentValue += char;
            if (char == '"' && currentValue.length > 1) {
                args[currentAttrName] = currentValue.substring(1, currentValue.length - 1);
                currentAttrName = "";
                currentValue = "";
                inValue = false;
            }
            continue;
        }
    }
    return { spotify: args.spotify, google: args.google, youtube: args.youtube, track: args.track, artist: args.artist, title: args.title };
}

function insertMusic(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const musicItems = [...doc.querySelectorAll("del")].filter(del => del.textContent.startsWith("music-item"));
    musicItems.forEach(item => {
        const props = parseMusicItem(item.textContent);
        const divElement = doc.createElement('div');
        item.parentElement.replaceChild(divElement, item);
        const musicComponent = new (Vue.component('music'))({
            el: divElement,
            propsData: props
        });
    })
    return doc.body;
}

async function startApp() {
    const promises = [...document.querySelectorAll("component")]
        .map(el => fetch(`/components/${el.id}.html`)
                    .then(res => res.text())
                    .then(html => ({html, el}))
            );
            
    const components = await Promise.all(promises);

    for (let component of components) {
        component.el.innerHTML = component.html;
        for (let script of component.el.querySelectorAll('script')) {
            var data = (script.text || script.textContent || script.innerHTML);
            var newScript = document.createElement("script");
            newScript.type = "text/javascript";
            newScript.appendChild(document.createTextNode(data));
            component.el.insertBefore(newScript, script);
            component.el.removeChild(script);
        }
    }

    new Vue({
        el: '#application'
    })
}