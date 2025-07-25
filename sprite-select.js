// Optional: log clicked character
document.querySelectorAll("area").forEach(area => {
    area.addEventListener("click", (e) => {
        const charName = area.alt || "Unknown";
        console.log(`Selected character: ${charName}`);
    });
});

// Example: redirect after selecting a character
// window.location.href = ""; //canvas.html redirect

// Future feature: highlight hovered areas if not using <area> but <div>s or SVG
