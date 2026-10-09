// AHA friend-to-friend chat. Separate from AI chat, memory and insight ingest.
(function (global) {
  "use strict";

  const HANDLE = /^[a-z0-9_]{3,24}$/;
  function normalizeHandle(value) {
    const result = String(value || "").trim().toLowerCase().replace(/^@/, "");
    return HANDLE.test(result) ? result : "";
  }
  function cleanMessage(value) {
    const message = String(value || "").trim();
    return message.length > 0 && message.length <= 2000 ? message : "";
  }
  function shortId(value) {
    return String(value || "").slice(0, 8);
  }

  async function init() {
    const byId = (id) => global.document.getElementById(id);
    if (!byId("friend-chat-app")) return;

    const client = global.AHADb?.getClient?.() || null;
    let user = null;
    let chosen = null;
    let subscription = null;
    let currentRequests = [];
    let handles = new Map();
    let blockedIds = [];
    let lastMessageIds = "";
    let accountHandle = "";
    let loading = false;
    const meetInviteId = new URLSearchParams(global.location?.search || "").get("meetInviteId") || "";
    let meetLinkOpened = false;

    function status(message, target = "friend-status") {
      const el = byId(target);
      if (el) el.textContent = message;
    }
    function showFailure(error, action) {
      const code = String(error?.code || "");
      const detail = String(error?.message || "");
      const unavailable = code === "42P01" || code === "PGRST205" || code === "PGRST116"
        || /fetch|connection|timeout|network/i.test(detail);
      status(unavailable
        ? "Vennetjenesten er ikke tilgjengelig. Supabase-prosjektet og friend-chat-tabellene må være aktive."
        : action + " kunne ikke fullføres. Sjekk innlogging eller prøv igjen.");
    }
    function make(tag, text, className) {
      const node = global.document.createElement(tag);
      if (text != null) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }
    function button(label, callback, className) {
      const node = make("button", label, className);
      node.type = "button";
      node.addEventListener("click", callback);
      return node;
    }
    function peerId(request) {
      return request.requester_id === user?.id ? request.recipient_id : request.requester_id;
    }
    function displayName(id) {
      const handle = handles.get(id);
      return handle ? "@" + handle : "Bruker " + shortId(id);
    }
    async function lookupHandles(ids) {
      handles = new Map();
      const values = [...new Set(ids.filter(Boolean))];
      if (!values.length) return;
      const { data, error } = await client.from("aha_friend_handles")
        .select("profile_id,handle").in("profile_id", values);
      if (error) throw error;
      (data || []).forEach((row) => handles.set(row.profile_id, row.handle));
    }
    function clearThread() {
      if (subscription) {
        client?.removeChannel?.(subscription);
        subscription = null;
      }
      chosen = null;
      lastMessageIds = "";
      byId("friend-thread-title").textContent = "Velg en venn";
      byId("friend-message").disabled = true;
      byId("friend-send").disabled = true;
      byId("friend-remove").hidden = true;
      byId("friend-block").hidden = true;
      byId("friend-messages").replaceChildren(make("p", "Velg en venn fra listen for å begynne å skrive.", "friend-empty"));
    }
    async function loadMessages(force = false) {
      const selected = chosen?.id;
      if (!selected || !user) return;
      const { data, error } = await client.from("aha_friend_messages")
        .select("id,sender_id,body,created_at")
        .eq("request_id", selected).order("created_at", { ascending: false }).limit(100);
      if (selected !== chosen?.id) return;
      if (error) { showFailure(error, "Henting av meldinger"); return; }
      const rows = (data || []).slice().reverse();
      const fingerprint = rows.map((row) => row.id).join("|");
      if (!force && fingerprint === lastMessageIds) return;
      lastMessageIds = fingerprint;
      const mount = byId("friend-messages");
      const pinnedToBottom = mount.scrollHeight - mount.scrollTop - mount.clientHeight < 100;
      const fragment = global.document.createDocumentFragment();
      if (!rows.length) fragment.append(make("p", "Ingen meldinger ennå. Si hei!", "friend-empty"));
      rows.forEach((row) => {
        const mine = row.sender_id === user.id;
        const bubble = make("div", row.body, "friend-bubble" + (mine ? " is-mine" : ""));
        const stamp = make("time", new Date(row.created_at).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }));
        stamp.dateTime = row.created_at;
        bubble.append(stamp);
        fragment.append(bubble);
      });
      mount.replaceChildren(fragment);
      if (force || pinnedToBottom) mount.scrollTop = mount.scrollHeight;
    }
    async function selectFriend(request) {
      if (request.status !== "accepted") return;
      if (subscription) client.removeChannel(subscription);
      chosen = request;
      lastMessageIds = "";
      byId("friend-thread-title").textContent = displayName(peerId(request));
      byId("friend-message").disabled = false;
      byId("friend-send").disabled = false;
      byId("friend-remove").hidden = request.source === "social_meet";
      byId("friend-block").hidden = false;
      await loadMessages(true);
      if (!chosen || chosen.id !== request.id || typeof client.channel !== "function") return;
      subscription = client.channel("aha-friend-" + request.id)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "aha_friend_messages",
          filter: "request_id=eq." + request.id
        }, () => { if (chosen?.id === request.id) void loadMessages(); })
        .subscribe();
    }
    function renderRequests() {
      const mount = byId("friend-invite-list");
      mount.replaceChildren();
      const waiting = currentRequests.filter((item) => item.status === "pending");
      if (!waiting.length) { mount.append(make("p", "Ingen invitasjoner.")); return; }
      waiting.forEach((item) => {
        const incoming = item.recipient_id === user.id;
        const row = make("div", null, "friend-user-item");
        const detail = make("div");
        detail.append(make("strong", displayName(peerId(item)), "friend-user-name"));
        detail.append(make("small", incoming ? "Vil bli venn med deg" : "Venter på svar"));
        row.append(detail);
        if (incoming) {
          const actions = make("div", null, "friend-request-actions");
          actions.append(button("Godta", () => void answer(item, "accepted")));
          actions.append(button("Avslå", () => void answer(item, "declined")));
          row.append(actions);
        }
        mount.append(row);
      });
    }
    function renderFriends() {
      const mount = byId("friend-list");
      mount.replaceChildren();
      const friends = currentRequests.filter((item) => item.status === "accepted" && item.source !== "social_meet");
      if (!friends.length) { mount.append(make("p", "Ingen venner ennå.")); return; }
      friends.forEach((item) => {
        const row = make("div", null, "friend-user-item");
        row.append(make("strong", displayName(peerId(item)), "friend-user-name"));
        row.append(button("Åpne", () => void selectFriend(item),
          item.id === chosen?.id ? "friend-selected" : ""));
        mount.append(row);
      });
    }
    function renderMeetContacts() {
      const mount = byId("friend-meet-list");
      if (!mount) return;
      mount.replaceChildren();
      const contacts = currentRequests.filter((item) => item.status === "accepted" && item.source === "social_meet");
      if (!contacts.length) { mount.append(make("p", "Ingen kontakter ennå.")); return; }
      contacts.forEach((item) => {
        const row = make("div", null, "friend-user-item");
        row.append(make("strong", displayName(peerId(item)), "friend-user-name"));
        const actions = make("div", null, "friend-request-actions");
        actions.append(button("Chat", () => void selectFriend(item),
          item.id === chosen?.id ? "friend-selected" : ""));
        actions.append(button("Bli venner", () => void inviteMeetContact(item)));
        row.append(actions);
        mount.append(row);
      });
    }
    async function inviteMeetContact(item) {
      const other = peerId(item);
      if (!accountHandle) { status("Opprett først et AHA-brukernavn for å legge til venner."); return; }
      const { error } = await client.from("aha_friend_requests")
        .insert({ requester_id: user.id, recipient_id: other });
      if (error) {
        status(error.code === "23505" ? "Venneforespørsel finnes allerede." :
          "Venneforespørselen kunne ikke sendes. Begge trenger et AHA-brukernavn.");
        return;
      }
      status("Venneforespørsel sendt. Vennskap opprettes først etter aksept.");
      await refresh();
    }
    async function loadBlocks() {
      const { data, error } = await client.from("aha_friend_blocks")
        .select("blocked_id").eq("blocker_id", user.id);
      if (error) throw error;
      blockedIds = (data || []).map((row) => row.blocked_id);
    }
    function renderBlocks() {
      const mount = byId("friend-block-list");
      mount.replaceChildren();
      if (!blockedIds.length) { mount.append(make("p", "Ingen blokkeringer.")); return; }
      blockedIds.forEach((id) => {
        const row = make("div", null, "friend-user-item");
        row.append(make("strong", displayName(id), "friend-user-name"));
        row.append(button("Opphev", () => void unblockFriend(id)));
        mount.append(row);
      });
    }
    async function unblockFriend(id) {
      const { error } = await client.from("aha_friend_blocks").delete()
        .eq("blocker_id", user.id).eq("blocked_id", id);
      if (error) { showFailure(error, "Oppheving av blokkering"); return; }
      status("Blokkeringen er opphevet. Vennskapet kan åpnes igjen.");
      await refresh();
    }
    async function refresh() {
      if (!user || loading) return;
      loading = true;
      try {
        const { data, error } = await client.from("aha_friend_requests")
          .select("id,requester_id,recipient_id,status,source,created_at")
          .or("requester_id.eq." + user.id + ",recipient_id.eq." + user.id)
          .order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        currentRequests = data || [];
        await loadBlocks();
        await lookupHandles([...currentRequests.map(peerId), ...blockedIds]);
        if (chosen && !currentRequests.some((row) => row.id === chosen.id && row.status === "accepted")) {
          clearThread();
        }
        renderRequests();
        renderFriends();
        renderMeetContacts();
        renderBlocks();
      } catch (error) {
        showFailure(error, "Oppdatering av venner");
      } finally { loading = false; }
    }
    async function answer(item, nextStatus) {
      const { data, error } = await client.from("aha_friend_requests")
        .update({ status: nextStatus })
        .eq("id", item.id).eq("recipient_id", user.id).eq("status", "pending")
        .select("id").maybeSingle();
      if (error || !data) { showFailure(error, "Svar på invitasjonen"); return; }
      status(nextStatus === "accepted" ? "Venneforespørsel godkjent." : "Invitasjon avslått.");
      await refresh();
    }
    async function loadIdentity() {
      const { data, error } = await client.from("aha_friend_handles")
        .select("handle").eq("profile_id", user.id).maybeSingle();
      if (error) throw error;
      accountHandle = data?.handle || "";
      byId("friend-handle").value = accountHandle;
      status(accountHandle ? "Ditt brukernavn er @" + accountHandle : "Velg et brukernavn slik at venner kan finne deg.", "friend-handle-hint");
    }
    async function showAuthenticated() {
      user = await global.AHAAuth?.getUser?.() || null;
      byId("friend-auth-panel").hidden = Boolean(user);
      byId("friend-chat-app").hidden = !user;
      if (!user) return;
      try {
        const profile = await global.AHAAuth?.ensureProfile?.();
        if (profile && profile.ok === false) throw profile.error || new Error(profile.reason);
        await loadIdentity();
        if (meetInviteId && !meetLinkOpened) {
          if (!/^[a-f0-9-]{36}$/i.test(meetInviteId) || typeof client.rpc !== "function") {
            status("Ugyldig eller utilgjengelig møteinvitasjon.");
          } else {
            const { data, error } = await client.rpc("aha_open_social_meet_chat", {
              meet_invite_id: meetInviteId
            });
            if (error) {
              status("Samtalen kan ikke åpnes. Begge må ha AHA-konto, og møtet må være gyldig og ikke blokkert.");
            } else {
              meetLinkOpened = true;
              await refresh();
              const row = currentRequests.find((entry) =>
                entry.id === (Array.isArray(data) ? data[0]?.request_id : data?.request_id)
              );
              if (row) await selectFriend(row);
              else status("Møtet er godkjent, men meldingslisten ble ikke lastet.");
            }
          }
        } else {
          await refresh();
        }
      } catch (error) { showFailure(error, "Oppstart av vennetjenesten"); }
    }

    byId("friend-auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = byId("friend-email").value.trim();
      if (!email || !global.AHAAuth?.signInWithEmail) return;
      status("Sender innloggingslenke …", "friend-auth-status");
      try {
        const result = await global.AHAAuth.signInWithEmail(email);
        status(result.ok
          ? "Sjekk e-posten din. Etter innlogging åpner du Snakk med en venn igjen."
          : "Kunne ikke sende innloggingslenke. Kontroller at AHA-innlogging er aktiv.",
          "friend-auth-status");
      } catch (error) { showFailure(error, "Innlogging"); }
    });
    byId("friend-handle-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const handle = normalizeHandle(byId("friend-handle").value);
      if (!handle) { status("Bruk 3–24 små bokstaver, tall eller understrek.", "friend-handle-hint"); return; }
      const query = accountHandle
        ? client.from("aha_friend_handles").update({ handle }).eq("profile_id", user.id)
        : client.from("aha_friend_handles").insert({ profile_id: user.id, handle });
      const { error } = await query;
      if (error) {
        status(error.code === "23505" ? "Dette brukernavnet er opptatt." : "Brukernavnet kunne ikke lagres.", "friend-handle-hint");
        return;
      }
      accountHandle = handle;
      status("Brukernavn lagret: @" + handle, "friend-handle-hint");
      await refresh();
    });
    byId("friend-invite-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!user || !accountHandle) { status("Opprett ditt brukernavn før du inviterer noen."); return; }
      const target = normalizeHandle(byId("friend-invite-handle").value);
      if (!target || target === accountHandle) { status("Skriv et gyldig brukernavn som ikke er ditt eget."); return; }
      const { data, error: lookupError } = await client.from("aha_friend_handles")
        .select("profile_id").eq("handle", target).maybeSingle();
      if (lookupError) { showFailure(lookupError, "Søk"); return; }
      if (!data?.profile_id) { status("Fant ikke @" + target + ". Be vennen opprette et brukernavn."); return; }
      const { error } = await client.from("aha_friend_requests")
        .insert({ requester_id: user.id, recipient_id: data.profile_id });
      if (error) {
        status(error.code === "P0001" ? "Du har nådd grensen på 12 venneinvitasjoner i dag."
          : error.code === "23505" ? "Dere har allerede en invitasjon eller vennskap."
          : "Invitasjonen kunne ikke sendes (for eksempel ved blokkering).");
        return;
      }
      byId("friend-invite-handle").value = "";
      status("Invitasjon sendt til @" + target + ". Vennen må godta før dere kan skrive.");
      await refresh();
    });
    byId("friend-message-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!chosen || !user) return;
      const body = cleanMessage(byId("friend-message").value);
      if (!body) { status("Meldingen må være mellom 1 og 2000 tegn."); return; }
      byId("friend-send").disabled = true;
      try {
        const { error } = await client.from("aha_friend_messages")
          .insert({ request_id: chosen.id, sender_id: user.id, body });
        if (error) throw error;
        byId("friend-message").value = "";
        status("Melding sendt.");
        await loadMessages(true);
      } catch (error) { showFailure(error, "Sending av melding"); }
      finally { byId("friend-send").disabled = !chosen; }
    });
    byId("friend-block").addEventListener("click", async () => {
      if (!chosen || !user || !global.confirm("Blokkere brukeren? Dere kan ikke lese eller sende meldinger før blokkeringen oppheves.")) return;
      const blocked_id = peerId(chosen);
      const { error } = await client.from("aha_friend_blocks").insert({ blocker_id: user.id, blocked_id });
      if (error && error.code !== "23505") { showFailure(error, "Blokkering"); return; }
      clearThread();
      status("Brukeren er blokkert. Dere kan ikke sende eller lese meldinger.");
      await refresh();
    });
    byId("friend-remove").addEventListener("click", async () => {
      if (!chosen || !global.confirm("Fjerne vennen? Hele samtalehistorikken slettes for dere begge.")) return;
      const { error } = await client.from("aha_friend_requests").delete().eq("id", chosen.id);
      if (error) { showFailure(error, "Fjerning av venn"); return; }
      clearThread();
      status("Vennen og samtalehistorikken er fjernet.");
      await refresh();
    });
    byId("friend-refresh").addEventListener("click", () => void refresh());

    if (!client || !global.AHAAuth) {
      status("AHA-innlogging er ikke konfigurert. Vennechat er utilgjengelig.", "friend-auth-status");
      return;
    }
    await showAuthenticated();
    global.setInterval(() => {
      if (!user || global.document.visibilityState === "hidden") return;
      void refresh();
      if (chosen) void loadMessages();
    }, 12000);
    client.auth?.onAuthStateChange?.((event) => {
      if (event === "SIGNED_OUT") {
        user = null;
        clearThread();
        byId("friend-chat-app").hidden = true;
        byId("friend-auth-panel").hidden = false;
      }
    });
  }

  global.AHAFriendChat = Object.freeze({ normalizeHandle, cleanMessage, shortId, init });
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => void init());
  } else if (global.document) {
    void init();
  }
})(typeof window !== "undefined" ? window : globalThis);
