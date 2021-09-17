GitHubCalendar(".calendar", "drewwilson04", {
    responsive: true
});

var pullChain = document.getElementById("pull-chain");
var css = document.getElementById("css");
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