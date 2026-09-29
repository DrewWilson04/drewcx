// Shows the ?error= message from a failed login redirect.
const code = new URLSearchParams(location.search).get("error");
if (code) {
  const el = document.getElementById("error");
  el.textContent = code === "locked" ? "Too many attempts. Try again in 15 minutes." : "Wrong password.";
  el.hidden = false;
}
