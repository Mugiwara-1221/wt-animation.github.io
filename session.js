
const SESSIONS_TABLE = "sessions";
const MEMBERS_TABLE = "sessionMembers"; // separate table for members, or reuse same with different partition

const createBtn = document.getElementById("createSessionBtn");
const joinBtn = document.getElementById("joinSessionBtn");
const joinInput = document.getElementById("joinCodeInput");
const joinId = document.getElementById("joinCodeId");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");
const joinError = document.getElementById("joinError");

function getDeviceToken() {
  let token = localStorage.getItem("deviceToken");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("deviceToken", token);
  }
  return token;
}
const deviceToken = getDeviceToken();

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

createBtn?.addEventListener("click", async () => {
  try {
        const res = await fetch("/api/createSession", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create session");
        const session = await res.json();
  
        // Save locally
        localStorage.setItem("sessionCode", session.id);
  
        // Redirect to session page
        //window.location.href = `/session.html?session=${session.id}`;
      } catch (err) {
        console.error("Error creating session:", err);
        alert("Could not create session, try again.");
      };
      /*
  
          // Create up to 6 member IDs for the session in the same table (or use separate one)
          const memberEntries = [];
          for (let memberId = 1; memberId <= 6; memberId++) {
          memberEntries.push({
              partitionKey: sessionCode,
              rowKey: memberId.toString(),
              createdAt: Date.now(),
          });
          }
  
          // Insert members sequentially (or batch if needed)
          for (const entity of memberEntries) {
          await client.createEntity(entity);
          }
  
          context.res = {
          status: 200,
          jsonBody: {
              sessionCode,
              memberIds: memberEntries.map(e => e.rowKey),
          },
          }
      } catch (err) {
          context.log.error(err);
          context.res = {
          status: 500,
          jsonBody: { error: "create_failed" },
          };
      }
      };*/

    /*const response = await fetch('/api/createSession'); // your function route
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const text = await response.text();
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('Invalid JSON:', err);
      throw new Error('Failed to parse server response');
    }
    
    // ✅ Now it's safe to use
    console.log(data.sessionId);*/
    
        
    //const data = await response.json();
    //console.log('Raw response:', data);

    const { sessionCode, memberIds } = data;

    localStorage.setItem("sessionCode", sessionCode);
    localStorage.setItem("memberIds", JSON.stringify(memberIds));

    sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

    setTimeout(() => {
    window.location.href = `index.html?session=${sessionCode}`;
    }, 1500);
});
    // This file is used to create a new session and initialize members


















