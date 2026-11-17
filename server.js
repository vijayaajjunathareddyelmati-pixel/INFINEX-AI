
require("dotenv").config();
const express=require("express"),Groq=require("groq-sdk");
const bcrypt=require("bcryptjs"),session=require("express-session");
const MongoStore=require("connect-mongo").default;
const {MongoClient,ObjectId}=require("mongodb");
const {OAuth2Client}=require("google-auth-library");

const app=express(),mongo=new MongoClient(process.env.MONGODB_URI);
const ai=new Groq({apiKey:process.env.GROQ_API_KEY});
const google=new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(express.json({limit:"10mb"}));
app.use(session({
 secret:process.env.SESSION_SECRET,
 resave:false,saveUninitialized:false,
 store:MongoStore.create({client:mongo}),
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:86400000}
}));
app.use(express.static(__dirname));

const db=()=>app.locals.db;
const users=()=>db().collection("users");
const login=(req,id)=>new Promise((ok,no)=>req.session.regenerate(e=>{
 if(e)return no(e);
 req.session.userId=id;ok();
}));

app.post("/api/auth/signup",async(req,res)=>{
 try{
  const {name,email,password}=req.body;
  if(typeof name!=="string"||typeof email!=="string"||
     typeof password!=="string"||!name.trim()||!email.trim()||password.length<8)
   return res.status(400).json({error:"Invalid details or password too short"});
  const mail=email.trim().toLowerCase();
  if(await users().findOne({email:mail}))
   return res.status(409).json({error:"Email already registered"});
  const r=await users().insertOne({
   name:name.trim(),email:mail,password:await bcrypt.hash(password,12),
   createdAt:new Date()
  });
  await login(req,r.insertedId.toString());
  res.json({message:"Account created successfully!"});
 }catch(e){console.error(e);res.status(500).json({error:"Signup failed"});}
});

app.post("/api/auth/login",async(req,res)=>{
 try{
  const {email,password}=req.body;
  if(typeof email!=="string"||typeof password!=="string")
   return res.status(400).json({error:"Enter email and password"});
  const u=await users().findOne({email:email.trim().toLowerCase()});
  if(!u?.password||!await bcrypt.compare(password,u.password))
   return res.status(401).json({error:"Invalid email or password"});
  await login(req,u._id.toString());
  res.json({message:"Login successful!"});
 }catch(e){console.error(e);res.status(500).json({error:"Login failed"});}
});

// Google Sign-In
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
  let u=await users().findOne({googleId:p.sub})||await users().findOne({email:mail});

  if(u?.googleId&&u.googleId!==p.sub)
   return res.status(409).json({error:"Account already linked to another Google account"});

  if(u){
   await users().updateOne({_id:u._id},{$set:{
    googleId:p.sub,name:p.name||u.name,picture:p.picture||u.picture
   }});
  }else{
   const r=await users().insertOne({
    googleId:p.sub,name:p.name||"Google User",
    email:mail,picture:p.picture||"",createdAt:new Date()
   });
   u={_id:r.insertedId};
  }

  await login(req,u._id.toString());
  res.json({message:"Google login successful!"});
 }catch(e){console.error("GOOGLE:",e.message);res.status(401).json({error:"Google sign-in failed"});}
});

// Current profile
app.get("/api/auth/me",async(req,res)=>{
 try{
  if(!req.session.userId||!ObjectId.isValid(req.session.userId))
   return res.status(401).json({loggedIn:false});
  const u=await users().findOne({_id:new ObjectId(req.session.userId)});
  if(!u)return res.status(401).json({loggedIn:false});
  res.json({loggedIn:true,name:u.name,email:u.email,picture:u.picture||""});
 }catch(e){res.status(500).json({error:"Profile unavailable"});}
});

app.post("/api/auth/logout",(req,res)=>{
 req.session.destroy(e=>{
  if(e)return res.status(500).json({error:"Logout failed"});
  res.clearCookie("connect.sid");
  res.json({message:"Logged out"});
 });
});

// News search
const clean=s=>s.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&")
 .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
 .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
const tag=(s,n)=>clean(s.match(new RegExp("<"+n+"[^>]*>([\\s\\S]*?)</"+n+">","i"))?.[1]||"");
const news=q=>/\b(current|latest|today|yesterday|recent|breaking|news|now|2026)\b|current affairs|this week|this month/i.test(q);

async function searchNews(q){
 const r=await fetch("https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-IN&gl=IN&ceid=IN:en");
 if(!r.ok)throw Error("News unavailable");
 return [...(await r.text()).matchAll(/<item>([\s\S]*?)<\/item>/gi)]
 .slice(0,5).map(x=>({
  title:tag(x[1],"title"),link:tag(x[1],"link"),
  date:tag(x[1],"pubDate"),source:tag(x[1],"source"),
  description:tag(x[1],"description")
 })).filter(x=>x.title&&x.link);
}

app.post("/api/chat",async(req,res)=>{
 try{
  const {messages,imageData}=req.body;
  if(!Array.isArray(messages)||!messages.length)
   return res.status(400).json({error:"No messages"});
  const chat=messages.filter(x=>x&&["user","assistant"].includes(x.role));
  const q=chat.filter(x=>x.role==="user").at(-1)?.content||"";
  const m=[{role:"system",content:`You are INFINEX AI.
Creators: INFINEX Team (S.A.V.I.T.), Hackathon 2026.
Tagline: Intelligence Beyond Limits.
Answer naturally. Be honest about third-party AI services.
Never claim the team created the underlying models.`}];

  if(!imageData&&typeof q==="string"&&news(q)){
   try{
    const n=await searchNews(q);
    m.push({role:"system",content:"RECENT NEWS:\n"+
     n.map((x,i)=>`${i+1}. ${x.title}\n${x.source} | ${x.date}\n${x.description}\n${x.link}`).join("\n\n")+
     "\nUse relevant results and never invent facts."});
   }catch(e){m.push({role:"system",content:"News verification failed. Say so honestly."});}
  }

  m.push(...chat);
  if(imageData){
   const last=m.at(-1);
   if(last.role!=="user"||typeof imageData!=="string"||
      !/^data:image\/(jpeg|png|webp|gif);base64,/.test(imageData))
    return res.status(400).json({error:"Invalid image"});
   last.content=[{type:"text",text:last.content||"Describe this image."},
    {type:"image_url",image_url:{url:imageData}}];
  }
  const r=await ai.chat.completions.create({
   model:"qwen/qwen3.8-27b",messages:m,max_completion_tokens:800
  });
  res.json({reply:r.choices[0].message.content});
 }catch(e){console.error("GROQ:",e.message);res.status(500).json({error:"AI request failed"});}
});

// Image generation
app.post("/api/generate-image",async(req,res)=>{
 try{
  const {prompt}=req.body;
  if(typeof prompt!=="string"||!prompt.trim()||prompt.length>2048)
   return res.status(400).json({error:"Invalid prompt"});
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,{
   method:"POST",headers:{
    Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    "Content-Type":"application/json"
   },body:JSON.stringify({prompt})
  });
  const d=await r.json();
  if(!r.ok||!d.result?.image)throw Error("Image generation failed");
  res.json({image:`data:image/jpeg;base64,${d.result.image}`});
 }catch(e){console.error("IMAGE:",e.message);res.status(500).json({error:"Image generation failed"});}
});

async function start(){
 try{
  if(!process.env.MONGODB_URI||!process.env.GOOGLE_CLIENT_ID)
   throw Error("Missing MongoDB URI or Google Client ID");
  await mongo.connect();
  app.locals.db=mongo.db("infinex");
  await users().createIndex({email:1},{unique:true});
  await users().createIndex({googleId:1},{unique:true,sparse:true});
  console.log("MongoDB connected!");
  app.listen(process.env.PORT||3000,()=>console.log("INFINEX AI READY"));
 }catch(e){console.error("STARTUP:",e.message);process.exit(1);}
}
start();
const PORT=process.env.PORT||3000;
app.listen(PORT,"0.0.0.0",()=>console.log("INFINEX AI running on port "+PORT));
