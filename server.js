require("dotenv").config();
const express=require("express");
const Groq=require("groq-sdk");
const app=express();
const ai=new Groq({apiKey:process.env.GROQ_API_KEY});

app.use(express.json({limit:"10mb"}));
app.use(express.static(__dirname));

app.post("/api/chat",async(req,res)=>{
 try{
  const {messages,imageData}=req.body;
  if(!Array.isArray(messages)||!messages.length)return res.status(400).json({error:"No messages"});
  let m=[{role:"system",content:"You are INFINEX AI, a helpful AI assistant."},...messages.filter(x=>["user","assistant"].includes(x.role))];
  if(imageData){
   let last=m[m.length-1];
   if(last.role!=="user"||!/^data:image\/(jpeg|png|webp|gif);base64,/.test(imageData))return res.status(400).json({error:"Invalid image"});
   last.content=[{type:"text",text:last.content||"Describe this image."},{type:"image_url",image_url:{url:imageData}}];
  }
  let r=await ai.chat.completions.create({model:"qwen/qwen3.8-27b",messages:m,max_completion_tokens:800});
  res.json({reply:r.choices[0].message.content});
 }catch(e){console.error("GROQ:",e.message);res.status(500).json({error:e.message})}
});

app.post("/api/generate-image",async(req,res)=>{
 try{
  const {prompt}=req.body;
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error("Cloudflare credentials missing");
  if(typeof prompt!=="string"||!prompt.trim()||prompt.length>2048)return res.status(400).json({error:"Invalid prompt"});
  let r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,{method:"POST",headers:{"Authorization":`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({prompt})});
  let d=await r.json();
  if(!r.ok||!d.result?.image)throw Error(d.errors?.[0]?.message||"Image generation failed");
  res.json({image:`data:image/jpeg;base64,${d.result.image}`});
 }catch(e){console.error("CLOUDFLARE:",e.message);res.status(500).json({error:e.message})}
});

app.listen(process.env.PORT||3000,()=>console.log("INFINEX AI READY"));