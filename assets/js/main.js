GitHubCalendar(".calendar", "drewwilson04", {
    responsive: true
});

const projects = [{
    "title": "Rung Boards",
    "url": "https://rungboards.com",
    "image": "rung-boards.jpg",
    "class": "branches"
},{
    "title": "Cryzza",
    "url": "https://cryzza.com/",
    "urlname": "Visit (Work in Progress)",
    "image": "Cryzza.svg",
    "class": "branches"
}]

projects.reverse()

var projectsHtml = ``

for (i = 0; i < projects.length; i++) {
    projectsHtml = projectsHtml + `
            <div class="col-sm-6 col-xs-12 card-outer">
                <a href="${projects[i].url}" class="link" target="_blank">
                    <div class="card">
                        <div class="card-image"><img src="/assets/img/${projects[i].image}"></div>
                        <div class="card-title">${projects[i].title}</div>
                    </div>
                </a>
            </div>`
}

document.getElementById('projects').innerHTML = projectsHtml

document.getElementById("pgp_button").addEventListener('click', function () {
    document.getElementById("pgp").style.height = "unset"
    document.getElementById("pgp_button").style.display = "none"
})

document.getElementById('pageHeight').innerText = `this page is ${document.body.scrollHeight} pixels tall`

var pullChain = document.getElementById("pull-chain");
var css = document.getElementById("css");
var graph = document.getElementById("graph");
var toggled = false

pullChain.addEventListener("click", function () {
    startTimer();
}, false);

function startTimer() {
    pullChain.classList.toggle("pulled");
    setTimeout(stopTimer, 500);
}

function stopTimer() {
    toggleLights();
    pullChain.classList.toggle("pulled");
}

function toggleLights() {
    if (toggled == true) {
        css.setAttribute('href', '/assets/css/index.css')
        graph.setAttribute('href', '/assets/css/dark_graph.css')
        toggled = false
    } else {
        css.setAttribute('href', '/assets/css/light.css')
        graph.setAttribute('href', '/assets/css/light_graph.css')
        toggled = true
    }
}