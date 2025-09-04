// index.js

function getSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session");
}

window.addEventListener("DOMContentLoaded", () => {
  const sessionCode = getSessionFromUrl();
  const sessionDisplay = document.getElementById("currentSession");

  if (sessionCode) {
    sessionDisplay.textContent = `✅ You are in session: ${sessionCode}`;

    // save locally too if you want
    localStorage.setItem("sessionCode", sessionCode);
  } else {
    sessionDisplay.textContent = "⚠️ No session code found in URL.";
  }
});
