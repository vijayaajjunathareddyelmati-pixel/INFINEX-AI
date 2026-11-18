
require("dotenv").config();

const express = require("express");
const Groq = require("groq-sdk");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { MongoClient, ObjectId } = require("mongodb");
const { OAuth2Client } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 3000;

// ENVIRONMENT
const required = [
    "MONGODB_URI",
    "GROQ_API_KEY",
    "SESSION_SECRET",
    "GOOGLE_CLIENT_ID"
];

for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
    }
}

// CONNECTIONS
const mongo = new MongoClient(process.env.MONGODB_URI);

const ai = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const google = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
);

// APP SETTINGS
app.set("trust proxy", 1);

app.use(express.json({
    limit: "10mb"
}));

app.use(express.static(__dirname));

let db;
let users;
let records;

// CREATOR INFORMATION
const creatorInfo = `
You are INFINEX AI, an AI assistant built into the INFINEX AI application.

The application was developed by INFINEX Team (S.A.V.I.T.) for Hackathon 2026.

The team developed the application, interface and integrations,
not the underlying third-party AI models.

Be friendly, helpful, creative and clear.
`;

// MAIN SERVER
async function start() {

    await mongo.connect();

    db = mongo.db("infinex");
    users = db.collection("users");
    records = db.collection("records");

    // SESSION MANAGEMENT
    app.use(session({
        name: "connect.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,

        store: MongoStore.create({
            client: mongo,
            dbName: "infinex"
        }),

        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    }));

    // CREATE ACCOUNT
    app.post("/api/auth/signup", async (req, res) => {
        try {
            const { name, email, password } = req.body;

            if (
                typeof name !== "string" ||
                typeof email !== "string" ||
                typeof password !== "string" ||
                !name.trim() ||
                !email.trim() ||
                password.length < 8
            ) {
                return res.status(400).json({
                    error: "Enter all details and use a password of at least 8 characters."
                });
            }

            const address = email.trim().toLowerCase();

            if (await users.findOne({ email: address })) {
                return res.status(409).json({
                    error: "Account already exists."
                });
            }

            const hash = await bcrypt.hash(password, 12);

            await users.insertOne({
                name: name.trim(),
                email: address,
                password: hash,
                createdAt: new Date()
            });

            req.session.user = {
                name: name.trim(),
                email: address
            };

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Signup error:", error);

            res.status(500).json({
                error: "Account creation failed."
            });
        }
    });

    // LOGIN
    app.post("/api/auth/login", async (req, res) => {
        try {
            const { email, password } = req.body;

            if (
                typeof email !== "string" ||
                typeof password !== "string" ||
                !email.trim() ||
                !password
            ) {
                return res.status(400).json({
                    error: "Enter your email and password."
                });
            }

            const user = await users.findOne({
                email: email.trim().toLowerCase()
            });

            if (
                !user ||
                !user.password ||
                !await bcrypt.compare(password, user.password)
            ) {
                return res.status(401).json({
                    error: "Invalid email or password."
                });
            }

            req.session.user = {
                name: user.name,
                email: user.email,
                picture: user.picture
            };

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Login error:", error);

            res.status(500).json({
                error: "Login failed."
            });
        }
    });

    // GOOGLE LOGIN
    app.post("/api/auth/google", async (req, res) => {
        try {
            const credential = req.body.credential;

            if (!credential) {
                return res.status(400).json({
                    error: "Google credential is missing."
                });
            }

            const ticket = await google.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID
            });

            const profile = ticket.getPayload();

            if (!profile.email_verified) {
                return res.status(401).json({
                    error: "Email is not verified."
                });
            }

            const email = profile.email.toLowerCase();

            let user = await users.findOne({ email });

            if (!user) {
                await users.insertOne({
                    name: profile.name,
                    email,
                    picture: profile.picture,
                    createdAt: new Date()
                });

                user = {
                    name: profile.name,
                    email,
                    picture: profile.picture
                };
            }

            req.session.user = {
                name: user.name,
                email: user.email,
                picture: user.picture || profile.picture
            };

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Google login error:", error);

            res.status(401).json({
                error: "Google sign-in failed."
            });
        }
    });

    // GET PROFILE
    app.get("/api/auth/me", (req, res) => {
        res.json({
            loggedIn: !!req.session.user,
            ...(req.session.user || {})
        });
    });

    // LOGOUT
    app.post("/api/auth/logout", (req, res) => {
        req.session.destroy(error => {
            if (error) {
                return res.status(500).json({
                    error: "Logout failed."
                });
            }

            res.clearCookie("connect.sid");

            res.json({
                success: true
            });
        });
    });

    // CHECK LOGIN
    function requireLogin(req, res, next) {
        if (!req.session.user || !req.session.user.email) {
            return res.status(401).json({
                error: "Please log in first."
            });
        }

        next();
    }

    // GET RECORDS
    app.get("/api/records", requireLogin, async (req, res) => {
        try {
            const userRecords = await records
                .find({
                    userEmail: req.session.user.email
                })
                .sort({
                    createdAt: -1
                })
                .toArray();

            const result = userRecords.map(record => ({
                id: record._id.toString(),
                title: record.title,
                category: record.category,
                value: record.value,
                notes: record.notes,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt
            }));

            res.json({
                records: result
            });

        } catch (error) {
            console.error("Load records error:", error);

            res.status(500).json({
                error: "Could not load records."
            });
        }
    });

    // ADD RECORD
    app.post("/api/records", requireLogin, async (req, res) => {
        try {
            const { title, category, value, notes } = req.body;

            if (
                typeof title !== "string" ||
                typeof category !== "string" ||
                typeof value !== "string" ||
                typeof notes !== "string" ||
                !title.trim()
            ) {
                return res.status(400).json({
                    error: "Enter a record title and valid details."
                });
            }

            const newRecord = {
                userEmail: req.session.user.email,
                title: title.trim(),
                category: category.trim(),
                value: value.trim(),
                notes: notes.trim(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await records.insertOne(newRecord);

            res.json({
                success: true,
                id: result.insertedId.toString()
            });

        } catch (error) {
            console.error("Add record error:", error);

            res.status(500).json({
                error: "Could not save record."
            });
        }
    });

    // EDIT RECORD
    app.put("/api/records/:id", requireLogin, async (req, res) => {
        try {
            const { id } = req.params;
            const { title, category, value, notes } = req.body;

            if (
                !ObjectId.isValid(id) ||
                typeof title !== "string" ||
                typeof category !== "string" ||
                typeof value !== "string" ||
                typeof notes !== "string" ||
                !title.trim()
            ) {
                return res.status(400).json({
                    error: "Invalid record details."
                });
            }

            const result = await records.updateOne(
                {
                    _id: new ObjectId(id),
                    userEmail: req.session.user.email
                },
                {
                    $set: {
                        title: title.trim(),
                        category: category.trim(),
                        value: value.trim(),
                        notes: notes.trim(),
                        updatedAt: new Date()
                    }
                }
            );

            if (!result.matchedCount) {
                return res.status(404).json({
                    error: "Record not found."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Edit record error:", error);

            res.status(500).json({
                error: "Could not update record."
            });
        }
    });

    // DELETE RECORD
    app.delete("/api/records/:id", requireLogin, async (req, res) => {
        try {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "Invalid record ID."
                });
            }

            const result = await records.deleteOne({
                _id: new ObjectId(id),
                userEmail: req.session.user.email
            });

            if (!result.deletedCount) {
                return res.status(404).json({
                    error: "Record not found."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Delete record error:", error);

            res.status(500).json({
                error: "Could not delete record."
            });
        }
    });

    // AI CHAT
    app.post("/api/chat", async (req, res) => {
        try {
            const { messages, imageData } = req.body;

            if (
                !Array.isArray(messages) ||
                !messages.length
            ) {
                return res.status(400).json({
                    error: "Messages are required."
                });
            }

            const safeMessages = messages
                .filter(message =>
                    message &&
                    ["user", "assistant"].includes(message.role)
                )
                .slice(-20)
                .map(message => ({
                    role: message.role,
                    content: String(message.content || "")
                }));

            if (
                !safeMessages.some(message =>
                    message.role === "user"
                )
            ) {
                return res.status(400).json({
                    error: "A user message is required."
                });
            }

            const conversation = [
                {
                    role: "system",
                    content: creatorInfo
                },
                ...safeMessages
            ];

            if (imageData) {
                const lastUser = [...conversation]
                    .reverse()
                    .find(message => message.role === "user");

                if (lastUser) {
                    lastUser.content = [
                        {
                            type: "text",
                            text: lastUser.content
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageData
                            }
                        }
                    ];
                }
            }

            const response = await ai.chat.completions.create({
                model: "qwen/qwen3.8-27b",
                messages: conversation
            });

            res.json({
                reply:
                    response.choices?.[0]?.message?.content ||
                    "I couldn't generate a response."
            });

        } catch (error) {
            console.error("AI error:", error);

            res.status(500).json({
                error: "AI request failed."
            });
        }
    });

    // AI IMAGE GENERATION
    app.post("/api/generate-image", async (req, res) => {
        try {
            const { prompt } = req.body;

            if (
                typeof prompt !== "string" ||
                !prompt.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Enter an image description."
                });
            }

            const accountId =
                process.env.CLOUDFLARE_ACCOUNT_ID;

            const token =
                process.env.CLOUDFLARE_API_TOKEN;

            if (!accountId || !token) {
                throw new Error(
                    "Cloudflare image generation is not configured."
                );
            }

            const url =
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

            const response = await fetch(url, {
                method: "POST",

                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "Accept": "image/png, application/json"
                },

                body: JSON.stringify({
                    prompt: prompt.trim()
                })
            });

            const contentType =
                response.headers.get("content-type") || "";

            let imageBuffer;
            let mimeType = "image/png";

            // HANDLE CLOUDFLARE ERRORS
            if (!response.ok) {
                let details = "";

                if (contentType.includes("application/json")) {
                    const data = await response.json();

                    details =
                        data.errors?.[0]?.message ||
                        "Image service request failed.";

                    const code = data.errors?.[0]?.code;

                    console.error(
                        "Cloudflare error:",
                        response.status,
                        data
                    );

                    if (
                        code === 8007 ||
                        details.toLowerCase().includes("nsfw")
                    ) {
                        return res.status(400).json({
                            success: false,
                            error:
                                "Cloudflare's safety filter blocked this image prompt. Try a different description."
                        });
                    }

                } else {
                    details = await response.text();

                    console.error(
                        "Cloudflare error:",
                        response.status,
                        details.slice(0, 1000)
                    );
                }

                throw new Error(
                    `Image service error: ${response.status} - ${details}`
                );
            }

            // BINARY IMAGE RESPONSE
            if (contentType.startsWith("image/")) {
                imageBuffer = Buffer.from(
                    await response.arrayBuffer()
                );

                mimeType = contentType.split(";")[0];

            } else {
                // JSON IMAGE RESPONSE
                const data = await response.json();

                const image =
                    typeof data.result === "string"
                        ? data.result
                        : data.result?.image;

                if (!image) {
                    console.error(
                        "Unexpected Cloudflare response:",
                        data
                    );

                    throw new Error(
                        data.errors?.[0]?.message ||
                        "Cloudflare returned no image."
                    );
                }

                let base64 = image;

                if (base64.startsWith("data:")) {
                    const match = base64.match(
                        /^data:(image\/[^;]+);base64,(.+)$/
                    );

                    if (!match) {
                        throw new Error(
                            "Invalid image response."
                        );
                    }

                    mimeType = match[1];
                    base64 = match[2];
                }

                imageBuffer = Buffer.from(
                    base64,
                    "base64"
                );
            }

            if (!imageBuffer?.length) {
                throw new Error(
                    "The generated image is empty."
                );
            }

            // VERIFY IMAGE FORMAT
            const signature =
                imageBuffer.subarray(0, 8).toString("hex");

            const isPNG =
                signature === "89504e470d0a1a0a";

            const isJPEG =
                signature.startsWith("ffd8ff");

            const isWebP =
                imageBuffer.toString("ascii", 0, 4) === "RIFF" &&
                imageBuffer.toString("ascii", 8, 12) === "WEBP";

            if (!isPNG && !isJPEG && !isWebP) {
                throw new Error(
                    "Cloudflare returned invalid image data."
                );
            }

            if (isPNG) mimeType = "image/png";
            if (isJPEG) mimeType = "image/jpeg";
            if (isWebP) mimeType = "image/webp";

            res.json({
                success: true,
                image:
                    `data:${mimeType};base64,` +
                    imageBuffer.toString("base64")
            });

        } catch (error) {
            console.error(
                "Image generation error:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Image generation failed."
            });
        }
    });

    // START SERVER
    app.listen(PORT, () => {
        console.log(
            `INFINEX AI running on port ${PORT}`
        );
    });
}

// STARTUP ERROR HANDLING
start().catch(error => {
    console.error(
        "Server startup failed:",
        error
    );

    process.exit(1);
});
