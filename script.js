
let chats=JSON.parse(localStorage.getItem("chats")||"[]"),id=null,last="",busy=false,imageFile=null,challengeText="";
const $=x=>document.getElementById(x),API="/api";

function save(){localStorage.setItem("chats",JSON.stringify(chats));history()}
function history(){
 $("history").innerHTML="";
 chats.forEach(c=>{
  let b=document.createElement("button");b.textContent=c.title;
  b.className=c.id===id?"active":"";
  b.onclick=()=>{id=c.id;render();history()};
  $("history").append(b);
 });
}
function newChat(){id=null;last="";removeImage();$("msg").value="";render();history()}
function renameChat(){
 let c=chats.find(x=>x.id===id);if(!c)return alert("Select a chat!");
 let n=prompt("New chat name:",c.title);
 if(n?.trim()){c.title=n.trim();save()}
}
function clearHistory(){
 if(id===null)return alert("Select a chat!");
 if(!confirm("Delete this chat?"))return;
 chats=chats.filter(c=>c.id!==id);id=null;last="";render();save();
}
function render(){
 $("chat").innerHTML="";
 let c=chats.find(x=>x.id===id);
 if(!c||!c.messages.length){$("chat").textContent="INFINEX AI: Hello! How can I help you today?";return}
 c.messages.forEach(m=>{
  let p=document.createElement("p");
  p.textContent=(m.role==="user"?"You: ":"INFINEX AI: ")+m.content;
  $("chat").append(p);if(m.role==="assistant")last=m.content;
 });
 $("chat").scrollTop=$("chat").scrollHeight;
}

function previewImage(e){
 let f=e.target.files[0];if(!f)return;
 if(!f.type.startsWith("image/")||f.size>5*1024*1024){alert("Choose an image under 5 MB!");return removeImage()}
 imageFile=f;$("imagePreview").innerHTML="";
 let img=document.createElement("img");img.src=URL.createObjectURL(f);
 let b=document.createElement("button");b.textContent="✖ Remove";b.onclick=removeImage;
 $("imagePreview").append(img,b);
}
function removeImage(){imageFile=null;$("imageInput").value="";$("imagePreview").innerHTML=""}

async function send(){
 let msg=$("msg").value.trim();if((!msg&&!imageFile)||busy)return;
 if(!imageFile&&/(create|generate|draw|make).*(image|picture|photo|art)/i.test(msg)){
  $("msg").value="";busy=true;
  if(!id){id=Date.now();chats.unshift({id,title:msg.slice(0,30),messages:[]})}
  let c=chats.find(x=>x.id===id);c.messages.push({role:"user",content:msg});render();save();
  try{
   let r=await fetch(API+"/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:msg})});
   let d=await r.json();if(!r.ok)throw Error(d.error||"Image generation failed");
   c.messages.push({role:"assistant",content:"Image generated successfully."});
   let img=document.createElement("img");img.src=d.image;img.alt="Generated image";$("chat").append(img);save();
  }catch(e){alert(e.message)}finally{busy=false}
  return;
 }
 if(!id){id=Date.now();chats.unshift({id,title:(msg||"Image chat").slice(0,30),messages:[]})}
 let c=chats.find(x=>x.id===id),f=imageFile;
 c.messages.push({role:"user",content:msg||"Describe this image."});
 $("msg").value="";busy=true;render();save();
 try{
  let imageData=f?await new Promise((ok,no)=>{
   let r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)
  }):null;
  let r=await fetch(API+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:c.messages,imageData})});
  let d=await r.json();if(!r.ok)throw Error(d.error||"AI request failed");
  c.messages.push({role:"assistant",content:d.reply});last=d.reply;
  removeImage();save();render();
 }catch(e){alert(e.message)}finally{busy=false}
}

// DAILY CHALLENGE ZONE
function showChallenges(){
 let open=$("challengeZone").hidden;
 $("challengeZone").hidden=!open;
 $("chat").hidden=open;
 document.querySelector(".input-area").hidden=open;
 $("imagePreview").hidden=open;
 if(open)getChallenge();
}

async function challengeAI(prompt){
 let context=chats.flatMap(c=>c.messages||[])
  .filter(m=>["user","assistant"].includes(m.role))
  .slice(-20).map(m=>({role:m.role,content:String(m.content).slice(0,500)}));
 let r=await fetch(API+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[...context,{role:"user",content:prompt}]})});
 let d=await r.json();if(!r.ok)throw Error(d.error||"Challenge AI unavailable");
 return d.reply;
}

async function getChallenge(){
 const today=new Date().toLocaleDateString("en-CA");
 const saved=JSON.parse(localStorage.getItem("dailyChallenge")||"null");
 const box=$("challenge");

 if(saved?.date===today){
  challengeText=saved.text;
  showDailyChallenge();
  return;
 }

 box.textContent="✨ Creating today's challenge...";
 challengeText="";

 let topics=["maths","science","coding","logic","general knowledge","brainstorming","story writing","language","technology"];
 let topic=topics[Math.floor(Math.random()*topics.length)];

 try{
  challengeText=await challengeAI(
   "Create ONE "+topic+" challenge. Infer the student's grade, level and interests from previous conversations. If unknown, use beginner level. Maximum 10 short lines. Give instructions only. NEVER reveal the answer or solution. Keep it friendly, safe and age-appropriate."
  );

  localStorage.setItem("dailyChallenge",JSON.stringify({
   date:today,
   text:challengeText
  }));

  showDailyChallenge();
 }catch(e){
  box.textContent="Could not load challenge: "+e.message;
 }
}

function showDailyChallenge(){
 const box=$("challenge");
 box.innerHTML="";

 const p=document.createElement("p");
 p.textContent=challengeText;

 const input=document.createElement("input");
 input.id="challengeAnswer";
 input.placeholder="Your answer...";

 const btn=document.createElement("button");
 btn.textContent="Submit Answer";
 btn.onclick=checkChallenge;

 const note=document.createElement("p");
 note.textContent="🌟 Come back tomorrow for your next challenge!";

 box.append(p,input,btn,note);
}

async function checkChallenge(){
 let answer=$("challengeAnswer")?.value.trim();
 if(!answer)return alert("Enter your answer first!");
 let result=document.createElement("p"),box=$("challenge");
 result.textContent="Checking your answer...";box.append(result);
 try{
  let feedback=await challengeAI(
   "Evaluate this challenge:\n"+challengeText+
   "\nStudent answer: "+answer+
   "\nGive accurate, friendly feedback. Briefly explain mistakes and encourage learning."
  );
  result.textContent="INFINEX AI: "+feedback;
 }catch(e){result.textContent=e.message}
}

function voice(){
 let S=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!S)return alert("Voice unavailable");
 let s=new S();s.lang="en-IN";
 s.onresult=e=>{$("msg").value=e.results[0][0].transcript;send()};
 s.start();
}
function speak(){
 if(!last)return alert("No answer yet");
 speechSynthesis.cancel();
 speechSynthesis.speak(new SpeechSynthesisUtterance(last.replace(/INFINEX AI/gi,"Infinite X A I")));
}
function reminder(){
 let t=prompt("What should I remind you about?");if(!t)return;
 let m=Number(prompt("Remind me in how many minutes?"));
 if(!Number.isFinite(m)||m<=0)return alert("Enter valid minutes!");
 alert("Reminder set!");setTimeout(()=>alert("⏰ REMINDER: "+t),m*60000);
}
function clock(){
 $("clock").textContent=new Date().toLocaleTimeString();
 $("date").textContent=new Date().toLocaleDateString();
}

// GOOGLE SIGN-IN
const GOOGLE_CLIENT_ID="742992644002-3uhqhgtdgh2cgs5tddojkm4bmeom4cki.apps.googleusercontent.com";

async function googleLogin(response){
 try{
  let r=await fetch(API+"/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential:response.credential})});
  let d=await r.json();if(!r.ok)throw Error(d.error||"Google sign-in failed");
  await loadProfile();
 }catch(e){alert(e.message)}
}
function initGoogle(){
 if(!window.google?.accounts?.id)return setTimeout(initGoogle,500);
 google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:googleLogin});
 google.accounts.id.renderButton($("googleSignIn"),{theme:"filled_black",size:"large",shape:"pill"});
}
function fitName(el){
 if(!el)return;
 let size=16;el.style.fontSize=size+"px";
 while(el.scrollWidth>el.clientWidth&&size>9){size--;el.style.fontSize=size+"px"}
}
async function loadProfile(){
 try{
  let r=await fetch(API+"/auth/me"),d=await r.json();
  $("authLinks").hidden=!!d.loggedIn;
  $("googleSignIn").hidden=!!d.loggedIn;
  $("profile").hidden=!d.loggedIn;
  $("profileMenu").hidden=true;
  if(d.loggedIn){
   $("profileLabel").textContent=d.name;
   $("profileName").textContent=d.name;
   $("profileEmail").textContent=d.email;
   fitName($("profileLabel"));fitName($("profileName"));
  }
 }catch(e){console.log("Profile check failed:",e)}
}
function toggleProfile(){$("profileMenu").hidden=!$("profileMenu").hidden}
async function logout(){
 try{
  let r=await fetch(API+"/auth/logout",{method:"POST"});
  if(!r.ok)throw Error("Logout failed");
  google.accounts.id.disableAutoSelect();location.reload();
 }catch(e){alert(e.message)}
}

setInterval(clock,1000);clock();
if(chats.length)id=chats[0].id;
history();render();loadProfile();
window.addEventListener("load",initGoogle);
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(console.log);
