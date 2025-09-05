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
    const topBanner = document.createElement("div");
    topBanner.textContent = sessionCode;
    topBanner.style.background = "#f0f0f0";
    topBanner.style.padding = "10px";
    topBanner.style.textAlign = "center";
    topBanner.style.fontWeight = "bold";
    document.body.insertBefore(topBanner, document.body.firstChild);

    // save locally too if you want
    localStorage.setItem("sessionCode", sessionCode);
  } else {
    sessionDisplay.textContent = "⚠️ No session code found in URL.";
  }
});
