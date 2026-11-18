const API = "/api";
const $ = id => document.getElementById(id);

let chats = JSON.parse(localStorage.getItem("chats") || "[]");
let reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
let records = [];

let currentChatId = null;
let editingRecordId = null;
let busy = false;
let imageFile = null;
let challengeTimer = null;

// SAVE DATA
function save() {
    localStorage.setItem("chats", JSON.stringify(chats));
    history();
}

function currentChat() {
    return chats.find(chat => chat.id === currentChatId);
}

// CHAT
function newChat() {
    const chat = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: []
    };

    chats.unshift(chat);
    currentChatId = chat.id;
    save();
    showChat();
}

function history() {
    const area = $("history");
    if (!area) return;

    area.innerHTML = "";

    chats.forEach(chat => {
        const button = document.createElement("button");
        button.textContent = chat.title;
        button.className = chat.id === currentChatId ? "active" : "";

        button.onclick = () => {
            currentChatId = chat.id;
            history();
            showChat();
        };

        area.appendChild(button);
    });
}

function showChat() {
    const area = $("chat");
    if (!area) return;

    area.innerHTML = "";
    const chat = currentChat();

    if (!chat) {
        area.textContent = "INFINEX AI: Hello! How can I help you today? 👋";
        return;
    }

    chat.messages.forEach(message => {
        const p = document.createElement("p");

        p.textContent = (message.role === "user" ? "You: " : "INFINEX AI: ") +
            (typeof message.content === "string" ? message.content : "[Image message]");

        area.appendChild(p);

        if (message.image) {
            const img = document.createElement("img");
            img.src = message.image;
            img.alt = "AI-generated image";
            img.style.maxWidth = "100%";
            img.style.borderRadius = "12px";
            img.onerror = () => {
                img.replaceWith(document.createTextNode("⚠️ Image could not be displayed."));
            };
            area.appendChild(img);
        }
    });

    area.scrollTop = area.scrollHeight;
}

function renameChat() {
    const chat = currentChat();
    if (!chat) return alert("Select a chat first.");

    const name = prompt("Enter new chat name:", chat.title);

    if (name && name.trim()) {
        chat.title = name.trim().slice(0, 40);
        save();
    }
}

function deleteChat(id) {
    const target = id || currentChatId;

    if (!target || !confirm("Are you sure you want to delete this chat?")) return;

    chats = chats.filter(chat => chat.id !== target);
    currentChatId = chats[0]?.id || null;

    if (!currentChatId) {
        newChat();
    } else {
        save();
        showChat();
    }
}

function clearHistory() {
    deleteChat(currentChatId);
}

// IMAGE REQUEST
function isImageRequest(text) {
    return /\b(generate|create|draw|make|design|paint)\b.{0,80}\b(image|picture|illustration|artwork|art|photo|wallpaper|logo|poster)\b/i.test(text);
}

// SEND MESSAGE
async function sendMessage(forceImage = false) {
    if (busy) return;

    const input = $("msg");
    if (!input) return;

    const message = input.value.trim();
    if (!message && !imageFile) return;

    if (!currentChatId) newChat();

    const chat = currentChat();
    const file = imageFile;
    imageFile = null;

    const wantsImage = forceImage || (!file && isImageRequest(message));

    busy = true;
    chat.messages.push({
        role: "user",
        content: message || "Describe this image."
    });

    if (chat.messages.length === 1) {
        chat.title = (message || "Image chat").slice(0, 30);
    }

    input.value = "";
    if ($("imagePreview")) $("imagePreview").innerHTML = "";
    if ($("imageInput")) $("imageInput").value = "";
    if ($("sendBtn")) $("sendBtn").disabled = true;

    save();
    showChat();

    try {
        if (wantsImage) {
            const response = await fetch(API + "/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: message })
            });

            const data = await response.json();

            if (!response.ok || !data.image?.startsWith("data:image/")) {
                throw new Error(data.error || "Image generation failed.");
            }

            chat.messages.push({
                role: "assistant",
                content: "Here is your AI-generated image! 🎨",
                image: data.image
            });
        } else {
            let imageData = null;

            if (file) {
                imageData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            const messages = chat.messages.slice(-20).map(message => ({
                role: message.role,
                content: message.content
            }));

            const response = await fetch(API + "/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages, imageData })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "AI request failed.");

            chat.messages.push({
                role: "assistant",
                content: data.reply || "No response received."
            });
        }
    } catch (error) {
        console.error(error);
        chat.messages.push({
            role: "assistant",
            content: "Sorry! " + error.message
        });
    } finally {
        busy = false;
        if ($("sendBtn")) $("sendBtn").disabled = false;
        save();
        showChat();
    }
}

function send() {
    sendMessage();
}

// IMAGE PREVIEW
function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
        alert("Choose an image smaller than 5 MB.");
        event.target.value = "";
        return;
    }

    imageFile = file;

    const preview = $("imagePreview");
    if (!preview) return;

    preview.innerHTML = "";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "Selected image";
    img.style.maxWidth = "150px";

    preview.appendChild(img);
}

async function generateImage() {
    if (busy) return;
    if (!$("msg")?.value.trim()) return alert("Enter an image description.");

    await sendMessage(true);
}

// VOICE
function voice() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Speech) {
        return alert("Voice input is not supported in this browser.");
    }

    const recognition = new Speech();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onresult = event => {
        $("msg").value = event.results[0][0].transcript;
        $("msg").focus();
    };

    recognition.onerror = event => console.log("Voice error:", event.error);
    recognition.start();
}

function speak() {
    if (!("speechSynthesis" in window)) {
        return alert("Read aloud is not supported.");
    }

    const chat = currentChat();
    const last = chat?.messages.slice().reverse()
        .find(message => message.role === "assistant");

    if (!last) return alert("No AI response available.");

    const cleanText = (last.content || "Here is your generated image.")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[^\p{L}\p{N}\s.,!?'-]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleanText) return;

    speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(cleanText);
    speech.lang = "en-US";
    speechSynthesis.speak(speech);
}

// REMINDERS
function saveReminders() {
    try {
        localStorage.setItem("reminders", JSON.stringify(reminders));
    } catch (error) {
        console.warn("Could not save reminders:", error);
    }
}

function reminder() {
    const text = prompt("What should I remind you about?");
    if (!text || !text.trim()) return;

    const time = prompt("Enter time (example: 18:30)");

    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return alert("Enter time in 24-hour format, such as 18:30.");
    }

    reminders.push({
        id: Date.now(),
        text: text.trim(),
        time: time,
        date: new Date().toLocaleDateString(),
        lastShown: ""
    });

    saveReminders();
    alert("⏰ Reminder saved!");
}

function showReminders() {
    console.log("INFINEX reminders:", reminders);
}

function checkReminders() {
    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    const date = now.toLocaleDateString();

    reminders.forEach(reminder => {
        if (reminder.time === time &&
            reminder.date === date &&
            reminder.lastShown !== date + time) {

            reminder.lastShown = date + time;
            alert("⏰ INFINEX AI Reminder: " + reminder.text);
            saveReminders();
        }
    });
}

// CHALLENGE ZONE
function today() {
    const date = new Date();

    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
}

function showChallenges() {
    $("recordZone").hidden = true;
    $("chat").hidden = true;
    $("challengeZone").hidden = false;
    $("imagePreview").hidden = true;
    document.querySelector(".input-area").hidden = true;

    loadChallenge();
}

function closeChallenges() {
    $("challengeZone").hidden = true;
    $("chat").hidden = false;
    $("imagePreview").hidden = false;
    document.querySelector(".input-area").hidden = false;
}

function getChallenge() {
    loadChallenge();
}

function updateChallengeTimer() {
    const area = $("challenge");
    if (!area) return;

    const saved = JSON.parse(localStorage.getItem("dailyChallenge") || "null");
    if (!saved || saved.date !== today()) return;

    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);

    const seconds = Math.floor((midnight - now) / 1000);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");

    area.textContent = saved.text +
        "\n\n⏳ Next challenge in: " + hours + ":" + minutes + ":" + secs;
}

async function loadChallenge() {
    const area = $("challenge");
    if (!area) return;

    const saved = JSON.parse(localStorage.getItem("dailyChallenge") || "null");

    if (saved?.date === today()) {
        updateChallengeTimer();

        if (!challengeTimer) {
            challengeTimer = setInterval(updateChallengeTimer, 1000);
        }
        return;
    }

    if (challengeTimer) clearInterval(challengeTimer);

    area.textContent = "✨ Preparing your daily challenge...";

    try {
        const context = chats.flatMap(chat => chat.messages)
            .slice(-20)
            .map(message => ({
                role: message.role,
                content: typeof message.content === "string"
                    ? message.content
                    : "[Image conversation]"
            }));

        const messages = [
            {
                role: "system",
                content: "You are INFINEX AI's friendly Challenge Creator. Create one safe, achievable and interesting learning or creativity challenge. Use friendly language and emojis."
            },
            ...context,
            {
                role: "user",
                content: "Give me today's daily challenge."
            }
        ];

        const response = await fetch(API + "/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Challenge request failed.");

        const challenge = {
            date: today(),
            text: data.reply || "✨ Learn something new today!"
        };

        localStorage.setItem("dailyChallenge", JSON.stringify(challenge));
        updateChallengeTimer();

        challengeTimer = setInterval(updateChallengeTimer, 1000);
    } catch (error) {
        console.error(error);
        area.textContent = "🎯 Learn one interesting fact and explain it in your own words!";
    }
}

// RECORD
function showRecords() {
    $("challengeZone").hidden = true;
    $("chat").hidden = true;
    $("recordZone").hidden = false;
    $("imagePreview").hidden = true;
    document.querySelector(".input-area").hidden = true;

    loadRecords();
}

function closeRecords() {
    $("recordZone").hidden = true;
    $("chat").hidden = false;
    $("imagePreview").hidden = false;
    document.querySelector(".input-area").hidden = false;
}

function recordStatus(message) {
    if ($("recordStatus")) $("recordStatus").textContent = message;
}

async function loadRecords() {
    const area = $("recordList");
    if (!area) return;

    area.innerHTML = "";
    recordStatus("Loading your records...");

    try {
        const response = await fetch(API + "/records");
        const data = await response.json();

        if (response.status === 401) {
            records = [];
            recordStatus("Please log in to view your records.");
            area.textContent = "🔐 Log in to access your records.";
            return;
        }

        if (!response.ok) throw new Error(data.error || "Could not load records.");

        records = Array.isArray(data.records) ? data.records : [];
        renderRecords();
    } catch (error) {
        console.error(error);
        recordStatus("Could not load your records.");
        area.textContent = "⚠️ Unable to load records. Please try again.";
    }
}

function renderRecords() {
    const area = $("recordList");
    if (!area) return;

    area.innerHTML = "";

    recordStatus(records.length
        ? records.length + " saved record(s)"
        : "No records saved yet.");

    if (!records.length) {
        area.textContent = "📒 Your saved records will appear here.";
        return;
    }

    records.forEach(record => {
        const card = document.createElement("div");
        card.className = "record-card";

        const title = document.createElement("h3");
        title.textContent = record.title;

        const category = document.createElement("span");
        category.className = "record-category";
        category.textContent = record.category || "General";

        const value = document.createElement("p");
        value.textContent = record.value;

        card.append(title, category, value);

        if (record.notes) {
            const notes = document.createElement("p");
            notes.textContent = record.notes;
            card.appendChild(notes);
        }

        const actions = document.createElement("div");
        actions.className = "record-actions";

        const buttons = [
            ["💬 Send to Chat", sendRecordToChat],
            ["✏️ Edit", editRecord],
            ["🗑️ Delete", deleteRecord]
        ];

        buttons.forEach(item => {
            const button = document.createElement("button");
            button.textContent = item[0];
            button.onclick = () => item[1](record.id);
            actions.appendChild(button);
        });

        card.appendChild(actions);
        area.appendChild(card);
    });
}

async function saveRecord() {
    const title = $("recordTitle")?.value.trim() || "";
    const category = $("recordCategory")?.value || "General";
    const value = $("recordValue")?.value.trim() || "";
    const notes = $("recordNotes")?.value.trim() || "";

    if (!title || !value) {
        return alert("Please enter a record title and value.");
    }

    const button = $("recordSaveBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "Saving...";
    }

    try {
        const url = API + "/records" +
            (editingRecordId ? "/" + encodeURIComponent(editingRecordId) : "");

        const response = await fetch(url, {
            method: editingRecordId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category, value, notes })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save record.");

        $("recordForm")?.reset();
        editingRecordId = null;

        if ($("recordCancelBtn")) $("recordCancelBtn").hidden = true;

        recordStatus("Record saved successfully! ✅");
        await loadRecords();
    } catch (error) {
        alert(error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = editingRecordId
                ? "💾 Update Record"
                : "💾 Save Record";
        }
    }
}

function editRecord(id) {
    const record = records.find(record => record.id === id);
    if (!record) return alert("Record not found.");

    editingRecordId = id;

    $("recordTitle").value = record.title || "";
    $("recordCategory").value = record.category || "General";
    $("recordValue").value = record.value || "";
    $("recordNotes").value = record.notes || "";
    $("recordSaveBtn").textContent = "💾 Update Record";

    let cancel = $("recordCancelBtn");

    if (!cancel) {
        cancel = document.createElement("button");
        cancel.id = "recordCancelBtn";
        cancel.type = "button";
        cancel.textContent = "Cancel Edit";
        cancel.onclick = cancelRecordEdit;
        $("recordForm").appendChild(cancel);
    }

    cancel.hidden = false;
    $("recordTitle").focus();
}

function cancelRecordEdit() {
    editingRecordId = null;

    $("recordForm")?.reset();
    $("recordSaveBtn").textContent = "💾 Save Record";

    if ($("recordCancelBtn")) $("recordCancelBtn").hidden = true;
}

async function deleteRecord(id) {
    const record = records.find(record => record.id === id);

    if (!record || !confirm("Delete the record '" + record.title + "'?")) return;

    try {
        const response = await fetch(API + "/records/" + encodeURIComponent(id), {
            method: "DELETE"
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not delete record.");

        if (editingRecordId === id) cancelRecordEdit();

        await loadRecords();
    } catch (error) {
        alert(error.message);
    }
}

function sendRecordToChat(id) {
    const record = records.find(record => record.id === id);
    if (!record) return alert("Record not found.");

    if (!currentChatId) newChat();

    const chat = currentChat();

    const message = "📒 My INFINEX RECORD\n\nTitle: " + record.title +
        "\nCategory: " + (record.category || "General") +
        "\nValue: " + record.value +
        (record.notes ? "\nNotes: " + record.notes : "");

    chat.messages.push({
        role: "user",
        content: message
    });

    if (chat.messages.length === 1) {
        chat.title = record.title.slice(0, 30);
    }

    save();
    closeRecords();
    showChat();
}

// GOOGLE LOGIN
function handleGoogleLogin(response) {
    fetch(API + "/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
    })
    .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Google login failed.");
        location.reload();
    })
    .catch(error => alert(error.message));
}

function fitName(element) {
    if (!element) return;

    let size = 15;
    element.style.fontSize = size + "px";

    while (element.scrollWidth > element.clientWidth && size > 9) {
        size--;
        element.style.fontSize = size + "px";
    }
}

async function loadProfile() {
    try {
        const response = await fetch(API + "/auth/me");
        const data = await response.json();

        if ($("authLinks")) $("authLinks").hidden = !!data.loggedIn;
        if ($("googleSignIn")) $("googleSignIn").hidden = !!data.loggedIn;
        if ($("profile")) $("profile").hidden = !data.loggedIn;
        if ($("profileMenu")) $("profileMenu").hidden = true;

        if (data.loggedIn) {
            ["profileLabel", "profileName"].forEach(id => {
                if ($(id)) {
                    $(id).textContent = data.name;
                    fitName($(id));
                }
            });

            if ($("profileEmail")) {
                $("profileEmail").textContent = data.email;
            }

            if (data.picture) {
                ["profilePic", "menuPic"].forEach(id => {
                    if ($(id)) $(id).src = data.picture;
                });
            }

            if ($("recordZone") && !$("recordZone").hidden) {
                loadRecords();
            }
        } else {
            records = [];
        }
    } catch (error) {
        console.error("Profile error:", error);
    }
}

function toggleProfile() {
    if ($("profileMenu")) {
        $("profileMenu").hidden = !$("profileMenu").hidden;
    }
}

async function logout() {
    try {
        await fetch(API + "/auth/logout", { method: "POST" });

        if (window.google?.accounts?.id) {
            google.accounts.id.disableAutoSelect();
        }

        location.reload();
    } catch {
        alert("Could not log out. Please try again.");
    }
}

// CLOCK
function updateClock() {
    const now = new Date();

    if ($("date")) {
        $("date").textContent = now.toLocaleDateString();
    }

    if ($("clock")) {
        $("clock").textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });
    }
}

function handleEnter(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send();
    }
}

// START
document.addEventListener("DOMContentLoaded", () => {
    history();

    if (chats.length) {
        currentChatId = chats[0].id;
        history();
        showChat();
    } else {
        newChat();
    }

    loadProfile();
    showReminders();
    loadChallenge();
    updateClock();

    setInterval(updateClock, 1000);
    setInterval(checkReminders, 10000);
});