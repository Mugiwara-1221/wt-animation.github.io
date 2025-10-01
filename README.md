# Windtree Animation Canvas
Developed by Windtree Technology

The Windtree Animation Canvas is a collaborative web-based drawing and animation tool designed to spark creativity and storytelling through student-driven character animation.


## Project Overview
This tool allows students to:

Draw and design their own unique characters using an intuitive canvas interface.

Apply basic animation actions like walking, jumping, and talking to bring their characters to life.

Submit their creations to be compiled into a unified animated storyline, showcasing all student-contributed characters in an engaging narrative format.


## Key Features
Custom Drawing Tools – Designed for simplicity and creativity.

Animation Presets – Easily apply core animation movements to characters.

Character Submission – Each student's work is saved and stored for compilation.

Story Integration – Final product features an animated sequence incorporating all contributions.


## Use Case
Windtree Animation Canvas is perfect for classrooms, after-school programs, and creative workshops. It encourages:

Artistic expression

Digital storytelling

Introductory animation skills

Collaborative project-based learning


## Technologies Used
HTML5 Canvas

JavaScript (Vanilla and ES6+)

CSS3

Wix Studio + Velo API (for integration with Windtree’s platform)


## Folder Structure

bash
Copy
Edit
windtree-animation-canvas

 ┃ ./images/

  ┃ ┗ backgrounds/ (character-selection background)

 ┃ ┗ ┗ [storyID]/

  | ┗ ┗ ┗ background{index}.png
 
 ┃ ┗ frames/ (frame pngs & masks per story, per slide, per character)

 ┃ ┗ ┗ [storyID]/

 | ┗ ┗ ┗ [char{index}].png

 | ┗ ┗ ┗ [char]-mask-{index}.csv

 ┃ ┗ gifs (temporary replacment for frames + masks)

 ┃ ┗ icons (frame pngs & masks per story, per slide, per character)
 
 ┃ ┗ outline (base transparent .pngs for coloring - canvas page)

 ┃ ┗ sprites (base white [char].pngs - used for sprites sprite-select pg.)

 ┃ ┗ ┗ [storyID]/

 | ┗ ┗ ┗ slide{index}/

 | ┗ ┗ ┗ [char].png
 
 ┃ ┗ story-thumnails (story-selection thumbnails)

 
 
 ┃ ./js/
 
 ┃ ┗ index.js (session)
 
 ┃ ┗ story-select.js

 ┃ ┗ slide-select.js
 
 ┃ ┗ character-select.js
 
 ┃ ┗ canvas.js
 
 ┃ ┗ storyboard.js

 ┃ ┗ storyboard.js

 
 
 ┃ ./css/
 
 ┃ ┗ index.css (session)
 
 ┃ ┗ story-select.css

 ┃ ┗ slide-select.js
 
 ┃ ┗ sprite-style.css
 
 ┃ ┗ canvas.css
 
 ┃ ┗ storyboard.css

 
 
 ┣ ./index.html (session)
 
 ┣ ./story-select.html
 
 ┣ ./slide-select.html
 
 ┣ ./sprite-select.html

 ┃ ./canvas.html

 ┃ ./storyboard.html
 
 ┣ ./README.md
 
 
## How to Use
Clone the repo:

bash
Copy
Edit
git clone https://github.com/your-username/windtree-animation-canvas.git
Open index.html in your browser.

Start drawing and animating your character.

Export or submit your character when complete.


## Future Plans
Add onion skinning for frame-by-frame animation.

Enable audio sync with animations.

Create a teacher dashboard for managing submissions and playback.

Implement AI-assisted animation suggestions.


## License
This project is licensed under the MIT License.
