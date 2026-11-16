
let chats=JSON.parse(localStorage.getItem("chats")||"[]"),id=null,last="",busy=false,imageFile=null;
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
function voice(){
 let S=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!S)return alert("Voice unavailable");
 let s=new S();s.lang="en-IN";s.onresult=e=>{$("msg").value=e.results[0][0].transcript;send()};s.start();
}
function speak(){
 if(!last)return alert("No answer yet");
 speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(last.replace(/INFINEX AI/gi,"Infinite X A I")));
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

/* GOOGLE SIGN-IN */

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
async function loadProfile(){
 try{
  let r=await fetch(API+"/auth/me"),d=await r.json();
  if(!d.loggedIn)return;
  $("profileLabel").textContent=d.name;
  $("profileName").textContent=d.name;
  $("profileEmail").textContent=d.email;
  $("profilePic").src=$("menuPic").src=d.picture||"";
  $("googleSignIn").hidden=true;
 }catch(e){console.log(e)}
}
function toggleProfile(){
 $("profileMenu").hidden=!$("profileMenu").hidden;
}
async function logout(){
 try{
  await fetch(API+"/auth/logout",{method:"POST"});
  google.accounts.id.disableAutoSelect();location.reload();
 }catch(e){alert("Logout failed")}
}

setInterval(clock,1000);clock();
if(chats.length)id=chats[0].id;
history();render();loadProfile();
window.addEventListener("load",initGoogle);
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(console.log);
