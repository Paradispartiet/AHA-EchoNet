// ahaConfig.example.js
// Copy to ahaConfig.local.js for local testing and fill in your own values.
// Do not commit ahaConfig.local.js.

window.AHA_SUPABASE_URL = "";
window.AHA_SUPABASE_PUBLISHABLE_KEY = "";

// URL til AI-agent-backenden. Tom = embedding deaktivert.
// Eksempel: "https://aha-agent-xyz.onrender.com/api/aha-agent"
window.AHA_AGENT_API = "";

// Public music-provider configuration. Never add a Spotify client secret.
window.AHA_CONFIG = {
  musicProviders: {
    spotify: {
      clientId: "",
      redirectUri: "https://paradispartiet.github.io/AHA-EchoNet/music.html",
      scopes: [
        "playlist-read-private",
        "playlist-read-collaborative",
        "user-library-read"
      ]
    }
  }
};
