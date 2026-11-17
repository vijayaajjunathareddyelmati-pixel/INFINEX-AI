
require("dotenv").config();
const express=require("express");
const Groq=require("groq-sdk");
const bcrypt=require("bcryptjs");
const session=require("express-session");
const MongoStore=require("connect-mongo").default;
const {MongoClient,ObjectId}=require("mongodb");
const {OAuth2Client}=require("google-auth-library");

const app=express();
const mongo=new MongoClient(process.env.MONGODB_URI);
const ai=new Groq({apiKey:process.env.GROQ_API_KEY});
const google=new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.set("trust proxy",1);
app.use(express.json({limit:"10mb"}));
app.use(express.static(__dirname));

app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
  store:MongoStore.create({client:mongo}),
  cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:86400000}
}));

const db=()=>app.locals.db;
const users=()=>db().collection("users");

function login(req,id){
  return new Promise((resolve,reject)=>{
    req.session.regenerate(err=>{
      if(err)return reject(err);
      req.session.userId=id;
      resolve();
    });
  });
}

// SIGNUP
app.post("/api/auth/signup",async(req,res)=>{
  try{
    const {name,email,password}=req.body;
    if(typeof name!=="string"||typeof email!=="string"||
       typeof password!=="string"||!name.trim()||!email.trim()||password.length<8)
      return res.status(400).json({error:"Invalid details or password too short"});

    const mail=email.trim().toLowerCase();
    if(await users().findOne({email:mail}))
      return res.status(409).json({error:"Email already registered"});

    const result=await users().insertOne({
      name:name.trim(),email:mail,
      password:await bcrypt.hash(password,12),createdAt:new Date()
    });
    await login(req,result.insertedId.toString());
    res.json({message:"Account created successfully!"});
  }catch(e){
    console.error("SIGNUP:",e.message);
    res.status(500).json({error:"Signup failed"});
  }
});

// LOGIN
app.post("/api/auth/login",async(req,res)=>{
  try{
    const {email,password}=req.body;
    if(typeof email!=="string"||typeof password!=="string")
      return res.status(400).json({error:"Enter email and password"});

    const user=await users().findOne({email:email.trim().toLowerCase()});
    if(!user?.password||!await bcrypt.compare(password,user.password))
      return res.status(401).json({error:"Invalid email or password"});

    await login(req,user._id.toString());
    res.json({message:"Login successful!"});
  }catch(e){
    console.error("LOGIN:",e.message);
    res.status(500).json({error:"Login failed"});
  }
});

// GOOGLE SIGN-IN
app.post("/api/auth/google",async(req,res)=>{
  try{
    const {credential}=req.body;
    if(typeof credential!=="string")
      return res.status(400).json({error:"Google credential missing"});

    const ticket=await google.verifyIdToken({
      idToken:credential,audience:process.env.GOOGLE_CLIENT_ID
    });
    const p=ticket.getPayload();
    if(!p?.email_verified||!p.email)
      return res.status(401).json({error:"Google email not verified"});

    const mail=p.email.toLowerCase();
    let user=await users().findOne({googleId:p.sub})||
             await users().findOne({email:mail});

    if(user?.googleId&&user.googleId!==p.sub)
      return res.status(409).json({error:"Account linked to another Google account"});

    if(user){
      await users().updateOne({_id:user._id},{$set:{
        googleId:p.sub,name:p.name||user.name,picture:p.picture||user.picture
      }});
    }else{
      const result=await users().insertOne({
        googleId:p.sub,name:p.name||"Google User",
        email:mail,picture:p.picture||"",createdAt:new Date()
      });
      user={_id:result.insertedId};
    }

    await login(req,user._id.toString());
    res.json({message:"Google login successful!"});
  }catch(e){
    console.error("GOOGLE:",e.message);
    res.status(401).json({error:"Google sign-in failed"});
  }
});

// CURRENT PROFILE
app.get("/api/auth/me",async(req,res)=>{
  try{
    if(!req.session.userId||!ObjectId.isValid(req.session.userId))
      return res.status(401).json({loggedIn:false});

    const user=await users().findOne({_id:new ObjectId(req.session.userId)});
    if(!user)return res.status(401).json({loggedIn:false});

    res.json({
      loggedIn:true,name:user.name,email:user.email,picture:user.picture||""
    });
  }catch(e){
    res.status(500).json({error:"Profile unavailable"});
  }
});

// LOGOUT
app.post("/api/auth/logout",(req,res)=>{
  req.session.destroy(err=>{
    if(err)return res.status(500).json({error:"Logout failed"});
    res.clearCookie("connect.sid");
    res.json({message:"Logged out"});
  });
});

// NEWS SEARCH
const clean=s=>s.replace(/<[^>]*>/g," ")
  .replace(/&amp;/g,"&").replace(/&quot;/g,'"')
  .replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<")
  .replace(/&gt;/g,">").replace(/\s+/g," ").trim();

const tag=(s,n)=>clean(s.match(new RegExp("<"+n+"[^>]*>([\\s\\S]*?)</"+n+">","i"))?.[1]||"");
const news=q=>/\b(current|latest|today|yesterday|recent|breaking|news|now|2026)\b|current affairs|this week|this month/i.test(q);

async function searchNews(q){
  const url="https://news.google.com/rss/search?q="+
    encodeURIComponent(q)+"&hl=en-IN&gl=IN&ceid=IN:en";
  const response=await fetch(url);
  if(!response.ok)throw Error("News unavailable");
  const xml=await response.text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0,5).map(x=>({
      title:tag(x[1],"title"),link:tag(x[1],"link"),
      date:tag(x[1],"pubDate"),source:tag(x[1],"source"),
      description:tag(x[1],"description")
    })).filter(x=>x.title&&x.link);
}

// AI CHAT + CREATOR RECOGNITION + CHALLENGE ZONE
app.post("/api/chat",async(req,res)=>{
  try{
    const {messages,imageData}=req.body;
    if(!Array.isArray(messages)||!messages.length)
      return res.status(400).json({error:"No messages"});

    const chat=messages.filter(x=>x&&["user","assistant"].includes(x.role));
    if(!chat.length)return res.status(400).json({error:"No valid messages"});

    const q=chat.filter(x=>x.role==="user").at(-1)?.content||"";
    const system=`You are INFINEX AI.

CREATOR RECOGNITION:
INFINEX AI was created and developed by INFINEX Team (S.A.V.I.T.) for Hackathon 2026.
Its tagline is "Intelligence Beyond Limits."
When asked who created, built, developed, or owns INFINEX AI, clearly recognise INFINEX Team (S.A.V.I.T.).
The team built the application and its integrations, not the underlying third-party AI models.
Never claim otherwise.

Answer naturally, helpfully and honestly.
You can create friendly, age-appropriate challenges when requested.
Never invent facts or claim features that do not exist.`;

    const m=[{role:"system",content:system}];

    if(!imageData&&typeof q==="string"&&news(q)){
      try{
        const results=await searchNews(q);
        m.push({role:"system",content:"RECENT NEWS:\n"+
          results.map((x,i)=>`${i+1}. ${x.title}\n${x.source} | ${x.date}\n${x.description}\n${x.link}`).join("\n\n")+
          "\nUse relevant results and never invent facts."});
      }catch(e){
        m.push({role:"system",content:"News verification failed. Say so honestly."});
      }
    }

    m.push(...chat);

    if(imageData){
      const last=m.at(-1);
      if(last.role!=="user"||typeof imageData!=="string"||
         !/^data:image\/(jpeg|png|webp|gif);base64,/.test(imageData))
        return res.status(400).json({error:"Invalid image"});

      last.content=[
        {type:"text",text:last.content||"Describe this image."},
        {type:"image_url",image_url:{url:imageData}}
      ];
    }

    const result=await ai.chat.completions.create({
      model:"qwen/qwen3.8-27b",messages:m,max_completion_tokens:800
    });
    res.json({reply:result.choices[0].message.content});
  }catch(e){
    console.error("GROQ:",e.message);
    res.status(500).json({error:"AI request failed"});
  }
});

// IMAGE GENERATION
app.post("/api/generate-image",async(req,res)=>{
  try{
    const {prompt}=req.body;
    if(typeof prompt!=="string"||!prompt.trim()||prompt.length>2048)
      return res.status(400).json({error:"Invalid prompt"});

    const url=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
    const response=await fetch(url,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({prompt:prompt.trim()})
    });
    const data=await response.json();
    if(!response.ok||!data.result?.image)throw Error("Image generation failed");

    res.json({image:`data:image/jpeg;base64,${data.result.image}`});
  }catch(e){
    console.error("IMAGE:",e.message);
    res.status(500).json({error:"Image generation failed"});
  }
});

// START
async function start(){
  try{
    for(const key of ["MONGODB_URI","GOOGLE_CLIENT_ID","SESSION_SECRET","GROQ_API_KEY"])
      if(!process.env[key])throw Error("Missing environment variable: "+key);

    await mongo.connect();
    app.locals.db=mongo.db("infinex");

    await users().createIndex({email:1},{unique:true});
    await users().createIndex({googleId:1},{unique:true,sparse:true});

    console.log("MongoDB connected!");
    app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("INFINEX AI READY"));
  }catch(e){
    console.error("STARTUP:",e.message);
    process.exit(1);
  }
}
start();
