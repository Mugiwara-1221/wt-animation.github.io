// firebase-init.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCRO_uKJ5RFU61rOgS7_xmFvGTt-kcw6f4",
  authDomain: "animationcollab-15353.firebaseapp.com",   // Replace with actual
  projectId: "animationcollab-15353",                     // Replace with actual
  storageBucket: "animationcollab-15353.firebasestorage.app",     // Replace with actual
  messagingSenderId: "349523133073",    // Replace with actual
  appId: "1:349523133073:web:74c42352875a7419217530"                              // Replace with actual
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Export db to use in other modules
export { db };
