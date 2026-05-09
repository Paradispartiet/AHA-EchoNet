// ahaConfig.js
// Runtime configuration for AHA-EchoNet.
// Public Supabase frontend config only. Do not put database passwords or service-role keys here.

window.AHA_APP_URL = window.AHA_APP_URL || "https://paradispartiet.github.io/AHA-EchoNet/";
window.AHA_AUTH_CALLBACK_URL = window.AHA_AUTH_CALLBACK_URL || "https://paradispartiet.github.io/AHA-EchoNet/auth-callback.html";
window.AHA_AUTH_REDIRECT_URL = window.AHA_AUTH_REDIRECT_URL || window.AHA_AUTH_CALLBACK_URL;
window.AHA_SUPABASE_URL = window.AHA_SUPABASE_URL || "https://wshmybqyksrwkawqleiz.supabase.co";
window.AHA_SUPABASE_PUBLISHABLE_KEY = window.AHA_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_fgfxuPJBpZ9CFcYufBBgjg_8YEmi13m";

// AI-agent backend (server.js). Tom streng = embedding er deaktivert.
// Sett til "https://<din-backend>/api/aha-agent" når server.js er deployet,
// eller bruk relativ "/api/aha-agent" hvis backend kjøres på samme origin.
window.AHA_AGENT_API = window.AHA_AGENT_API || "";
