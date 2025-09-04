const SESSIONS_TABLE = "sessions";
const MEMBERS_TABLE = "sessionMembers"; // optional: separate table for members

// UI elements
const createBtn = document.getElementById("createSessionBtn");
const joinBtn = document.getElementById("joinSessionBtn");
const joinInput = document.getElementById("joinCodeInput");
const joinId = document.getElementById("joinCodeId");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");
const joinError = document.getElementById("joinError");

// ---- Helpers ----
function getDeviceToken() {
  let token = localStorage.getItem("deviceToken");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("deviceToken", token);
  }
  return token;
}
const deviceToken = getDeviceToken();

// random 6-digit join code
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---- Create session ----
createBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/createSession", { method: "POST" });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();
    console.log("Session created:", data);

    const { id: sessionCode, memberIds } = data;

    // Save locally
    localStorage.setItem("sessionCode", sessionCode);
    if (memberIds) {
      localStorage.setItem("memberIds", JSON.stringify(memberIds));
    }

    // Show user
    sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

    // Redirect to session page after short delay
    setTimeout(() => {
      window.location.href = `index.html?session=${sessionCode}`;
    }, 1500);

  } catch (err) {
    console.error("Error creating session:", err);
    alert("Could not create session, please try again.");
  }
});
