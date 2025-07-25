// Character selection logic
document.querySelectorAll(".character").forEach(char => {
    char.addEventListener("click", () => {
        const selected = char.getAttribute("data-char") || "unknown";
        console.log(`Selected character: ${selected}`);
        window.location.href = `canvas.html?char=${selected}`;
    });
});
// Direct to Canvas.HTML: Source Index.html
