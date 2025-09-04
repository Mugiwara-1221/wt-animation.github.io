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
  const sessionCode = genCode();
  sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;
  try {
    const res = await fetch("/api/createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionCode }) // <─ send the code to API
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();

    const { id: returned_sessionCode, memberIds } = data;

    // Save locally
    localStorage.setItem("sessionCode", returned_sessionCode);
    if (memberIds) {
      localStorage.setItem("memberIds", JSON.stringify(memberIds));
    }

    // Show user
    // sessionCodeDisplay.textContent = `Session ID: ${returned_sessionCode}`;

    // Redirect to session page after short delay
    setTimeout(() => {
      window.location.href = `index.html?session=${returned_sessionCode}`;
    }, 1500);

  } catch (err) {
    console.error("Error creating session:", err);
    alert("Could not create session, please try again.");
  }
});







